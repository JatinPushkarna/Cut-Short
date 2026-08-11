import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { readDesignData } from "../lib/design";
import {
  pendingCandidatePath,
  readProjectData,
  requireProjectDir,
} from "../lib/project";
import { findLockedStructure } from "./design-edit-copy";
import { remotionCliPath } from "./render";

const STUDIO_PORT = 3000;
const STUDIO_READY_TIMEOUT_MS = 60_000;
const STUDIO_POLL_INTERVAL_MS = 1_000;

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "localhost" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, STUDIO_POLL_INTERVAL_MS));
  }
  return false;
}

// Same Windows-safe "call node directly on Remotion's own JS entry point"
// approach as render.ts's remotionCliPath() usage -- npx/npm .cmd shims
// can't be launched this way on Windows (see render.ts's comment). Detached
// + stdio ignored so this command can return control immediately; Studio
// keeps running in the background exactly like a human's own `npm run dev`
// in a separate terminal, not tied to this process's lifetime.
function startStudioDetached(): void {
  // Mirrors package.json's `predev` script -- Root.local.tsx is gitignored,
  // this creates it from the committed example the first time it's missing.
  execFileSync(process.execPath, [
    path.resolve(process.cwd(), "scripts", "ensure-root-local.js"),
  ]);

  const child = spawn(process.execPath, [remotionCliPath(), "studio"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

// Best-effort only -- if this fails (unsupported platform, no default
// browser configured), the printed URL is still enough for the human to
// open by hand. Never let this block or fail the command.
function openBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      execFileSync("cmd", ["/c", "start", "", url]);
    } else if (process.platform === "darwin") {
      execFileSync("open", [url]);
    } else {
      execFileSync("xdg-open", [url]);
    }
  } catch {
    // Swallowed on purpose -- see comment above.
  }
}

// Preview's whole point is reviewing the proxy BEFORE it's approved -- a
// fresh `design build` writes a PENDING candidate (see review-loop.ts),
// not design.json, until `design approve --stage build` runs. So this has
// to check the pending candidate first, same shape reviewLoop's
// non-interactive branch and design-approve.ts already write/read. Falls
// back to the already-approved structure.build for re-previewing something
// later (after finalize, or just to look again).
function findCompositionFile(
  slug: string,
  topicId: string,
  approvedCompositionFile: string | undefined,
): { compositionFile: string; approved: boolean } | null {
  const pendingPath = pendingCandidatePath(slug, "build", topicId);
  if (fs.existsSync(pendingPath)) {
    const pending = JSON.parse(fs.readFileSync(pendingPath, "utf-8")) as {
      proposal: { compositionFile: string };
    };
    return { compositionFile: pending.proposal.compositionFile, approved: false };
  }
  if (approvedCompositionFile) {
    return { compositionFile: approvedCompositionFile, approved: true };
  }
  return null;
}

// Mechanical -- no LLM call. Opens a built topic's composition in Remotion
// Studio for the human's visual review, the gate `design build --finalize`
// exists to enforce (see design-build.ts). Same category of command as
// render.ts: single-purpose, no propose/approve machinery.
export async function previewCommand(slug: string, topicId: string): Promise<void> {
  requireProjectDir(slug);
  readProjectData(slug);
  const design = readDesignData(slug);

  const { structure } = findLockedStructure(design, slug, topicId);
  const found = findCompositionFile(slug, topicId, structure.build?.compositionFile);
  if (!found) {
    console.error(
      `\nTopic "${topicId}" hasn't been built yet -- run \`cutshort design build ${slug} --topic ${topicId}\` first.`,
    );
    process.exit(1);
  }

  const compositionId = path.basename(found.compositionFile, ".tsx");
  const url = `http://localhost:${STUDIO_PORT}/${compositionId}`;

  const alreadyRunning = await isPortOpen(STUDIO_PORT);
  if (alreadyRunning) {
    console.log(`\nRemotion Studio already running at http://localhost:${STUDIO_PORT}.`);
  } else {
    console.log(`\nStarting Remotion Studio...`);
    startStudioDetached();
    const ready = await waitForPort(STUDIO_PORT, STUDIO_READY_TIMEOUT_MS);
    if (!ready) {
      console.error(
        `\nRemotion Studio didn't come up on port ${STUDIO_PORT} within ` +
          `${STUDIO_READY_TIMEOUT_MS / 1000}s -- check for a startup error, or run \`npm run dev\` ` +
          "manually to see it.",
      );
      process.exit(1);
    }
  }

  openBrowser(url);
  console.log(`\nReviewing: ${compositionId}${found.approved ? " (already approved)" : ""}`);
  console.log(`  ${url}`);
  if (found.approved) {
    console.log(`\nAlready approved -- nothing further needed unless something looks wrong.\n`);
  } else {
    console.log(
      `\nOnce it looks right, approve in chat, or run yourself:\n` +
        `  cutshort design approve ${slug} --stage build --topic ${topicId}\n`,
    );
  }
}
