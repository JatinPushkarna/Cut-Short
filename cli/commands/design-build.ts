import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  readDesignData,
  saveDesignData,
  type ContentStructure,
  type DesignData,
  type Topic,
} from "../lib/design";
import { runAgentTaskJson } from "../lib/agent/runner";
import type { AgentName, AgentRunOptions } from "../lib/agent/types";
import {
  finalVideoDir,
  finalVideoPath,
  imagesDir,
  pendingCandidatePath,
  projectDir,
  readProjectData,
  requireProjectDir,
  videoDir,
  type ProjectData,
} from "../lib/project";
import { reviewLoop } from "../lib/review-loop";
import { readTemplateManifest } from "./design-edit-copy";
import { renderCommand } from "./render";
import type { TemplateManifest } from "../../src/templates/contract";

// Purely mechanical -- no LLM call. Used by `design build --finalize` to
// re-extract an already-approved proxy at full native resolution, and only
// there: everything it needs (exact in/out points, exact destination) is
// already locked from the proxy phase, so there's no judgment left to make.
function extractClip(options: {
  sourceVideoPath: string;
  startTimestamp: string;
  endTimestamp: string;
  destination: string;
  capTo720p: boolean;
}): void {
  const {
    sourceVideoPath,
    startTimestamp,
    endTimestamp,
    destination,
    capTo720p,
  } = options;
  const args = [
    "-y",
    "-ss",
    startTimestamp,
    "-to",
    endTimestamp,
    "-i",
    sourceVideoPath,
  ];
  if (capTo720p) {
    args.push("-vf", "scale=-2:720", "-preset", "veryfast", "-crf", "23");
  } else {
    // High-fidelity intermediate, matching this project's own render-config
    // convention (see remotion.config.ts) for a lossless-ish extraction.
    args.push("-c:v", "libx264", "-crf", "12", "-preset", "slow");
  }
  args.push(destination);
  execFileSync("ffmpeg", args, { stdio: "pipe" });
}

// Edit-copy rows describe shot ranges (for example "00:01:02.100–00:01:04.500").
// Older fixtures used one boundary per row, so retain that form as a fallback.
function timestampBoundary(
  timestamp: string,
  boundary: "start" | "end",
): string {
  const parts = timestamp.split(/\s*(?:–|—|\s-\s)\s*/u);
  // Older data used spaced hyphens; current edit-copy output uses an
  // unspaced hyphen, so retain both forms when extracting ffmpeg boundaries.
  const rangeParts = parts.length > 1 ? parts : timestamp.split("-");
  return boundary === "start" ? rangeParts[0] : rangeParts[rangeParts.length - 1];
}

// Edit-copy also contains non-video template beats such as "Hook beat" and
// "CTA beat". They describe composition cards, not source-media ranges, so
// they must never be passed to ffmpeg's -ss/-to options.
const TIMESTAMP_RANGE = /^\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?\s*(?:\u2013|\u2014|-)\s*\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?$/u;

function videoTimestampRows(
  rows: { timestamp: string }[],
): { timestamp: string }[] {
  return rows.filter((row) => TIMESTAMP_RANGE.test(row.timestamp));
}

// Remotion's staticFile() takes a path relative to public/, not an absolute
// filesystem path -- e.g. "Projects/<slug>/Assets/Video/<id>.mp4", matching
// how every existing composition already references its assets.
function toStaticFileRelative(absolutePath: string): string {
  const publicDir = path.resolve(process.cwd(), "public");
  return path.relative(publicDir, absolutePath).split(path.sep).join("/");
}

// Purely mechanical, like extractClip -- swaps the proxy's staticFile()
// path for the final's, everywhere it appears. Safe even if the composition
// follows the common pattern of one named constant read by several
// Sequence/OffthreadVideo blocks: replacing the one string literal updates
// every usage at once, since they all reference the same value.
function swapCompositionClipReference(
  compositionFilePath: string,
  oldRelativePath: string,
  newRelativePath: string,
): void {
  const text = fs.readFileSync(compositionFilePath, "utf-8");
  if (!text.includes(oldRelativePath)) {
    throw new Error(
      `${compositionFilePath} doesn't reference "${oldRelativePath}" -- it may have been hand-edited ` +
        `since design build ran. Not touching it automatically; update its staticFile() path by hand.`,
    );
  }
  fs.writeFileSync(
    compositionFilePath,
    text.split(oldRelativePath).join(newRelativePath),
  );
}

export type BuildProposal = {
  compositionFile: string;
  extractedClip: string;
  hookStill: string | null;
  selfVerification: {
    resolutionMatches: boolean;
    durationMatches: boolean;
    filesExist: boolean;
    rootRegistered: boolean;
    notes: string;
  };
};

// Exported (like buildPrompt / buildEditCopyPrompt) so a scripted/manual
// validation run can call it directly, bypassing reviewLoop's interactive
// terminal prompt, which needs a real TTY.
export function buildBuildPrompt(
  topic: Topic,
  structure: ContentStructure,
  project: ProjectData,
  templateManifest: TemplateManifest,
  projectDirPath: string,
  templateDirPath: string,
  feedback?: string,
): string {
  const editCopy = structure.editCopy!;
  const firstTimestamp = timestampBoundary(
    editCopy.rows[0]?.timestamp ?? "unknown",
    "start",
  );
  const lastTimestamp = timestampBoundary(
    editCopy.rows[editCopy.rows.length - 1]?.timestamp ?? "unknown",
    "end",
  );
  const clipDestination = `${videoDir(project.slug)}/${topic.id}.mp4`;
  const hookStillDestination = `${imagesDir(project.slug)}/${topic.id}HookBG.jpg`;

  const lines: string[] = [];
  lines.push(
    "You are generating the real Remotion composition for one fully-locked piece of " +
      "campaign content -- everything creative is already decided; your job is faithful " +
      "translation into code, plus the physical media extraction it depends on.",
  );
  lines.push("");
  lines.push("Locked content (fixed inputs, do not redraft):");
  lines.push(
    JSON.stringify(
      {
        topicId: topic.id,
        title: topic.title,
        hook: structure.hook,
        bridge: structure.bridge,
        content: structure.content,
        reveal: structure.reveal,
        cta: structure.cta,
        editCopy,
      },
      null,
      2,
    ),
  );
  lines.push("");
  const componentFiles = [
    templateManifest.components.hookScene && "HookScene.tsx",
    templateManifest.components.bridgeCard && "BridgeCard.tsx",
    templateManifest.components.videoHookOverlay && "VideoHookOverlay.tsx",
    "CtaCard.tsx",
    templateManifest.components.redFlagStamp && "RedFlagStamp.tsx",
    templateManifest.components.glitchFlash && "GlitchFlash.tsx",
  ].filter((f): f is string => Boolean(f));
  lines.push(
    "Read src/templates/contract.ts (repo root -- exact prop TYPES) and every real component " +
      `file in ${templateDirPath} (this project's locked template) -- manifest.ts, ` +
      `${componentFiles.join(", ")}, theme.ts. Only read files this template's manifest ` +
      "actually declares -- don't assume every template has a Bridge beat or every other " +
      "role the original 5-beat template had. The actual .tsx files are ground truth for " +
      "exact prop NAMES, contract.ts's types alone aren't enough.",
  );
  lines.push(
    "Any text this composition writes inline rather than through a shared component " +
      "(the REVEAL/twist text and burned-in captions are typically hand-wired per composition, " +
      "not a shared component) MUST use theme.ts's fitFontSize(role, width) for its fontSize " +
      "and spread noBreakWrap alongside wrapStyle() -- e.g. `fontSize: fitFontSize(\"reveal\", " +
      'width), ...wrapStyle(90), ...noBreakWrap`. Without this, long or wide text on a ' +
      "narrower-than-2160px canvas can force a mid-character wrap (every letter on its own " +
      "line) instead of a normal word wrap -- this exact bug has already shipped once from " +
      "hand-rolled text styling, don't reintroduce it.",
  );
  lines.push("");
  lines.push(
    `Check src/projects-local/${project.slug}/ for any composition already built in this project (an ` +
      "earlier \`design build\` run) -- if one exists, read it as a wiring PATTERN, not " +
      "content to reuse: how it assembles Sequence/OffthreadVideo frame math, per-segment " +
      "objectPosition, a punch-zoom interpolate, Caption cue arrays. Match the structure, " +
      "not the specific content. If this is the first composition built for this project, " +
      "there's nothing to reference yet -- construct the wiring directly from contract.ts's " +
      "prop types and the template's component files instead.",
  );
  lines.push("");
  lines.push(
    `Read ${projectDirPath}/Campaign/project.json for videoPath and campaignDays.`,
  );
  lines.push("");
  lines.push(
    "Read the project's SRT/*.words.json NARROWLY -- grep/query only entries inside " +
      `editCopy's span (${firstTimestamp} to ${lastTimestamp}). Never read the whole file -- ` +
      "a feature-length source can hold tens of thousands of word entries for a ~60-90s " +
      "slice you actually need.",
  );
  lines.push("");
  lines.push(
    "Extract a 720p REVIEW PROXY -- hard constraints, not suggestions. This is deliberately " +
      "not the final-quality clip: fast to extract, fast to encode, cheap for you and the " +
      "human to inspect. Full native resolution only happens later, once the human approves " +
      "this proxy and runs `design build --finalize` -- a separate, mechanical, non-LLM step.",
  );
  lines.push(
    "1. Source is ALWAYS project.json's videoPath -- never reuse anything under a " +
      ".frame-check/ folder from an earlier stage; those were for the model's own " +
      "inspection only, never meant to back any asset, proxy or final.",
  );
  lines.push(
    '2. Scale to 720p on the long edge (ffmpeg -vf "scale=-1:720" if landscape, or the ' +
      "equivalent for the source's orientation). Confirm the source's real fps with ffprobe " +
      "and match the composition's fps to it -- don't assume 30fps -- but resolution stays " +
      "capped at 720p for this proxy pass.",
  );
  lines.push(
    `3. One continuous span covering editCopy's full range (${firstTimestamp} to ` +
      `${lastTimestamp}). editCopy's in/out points are already-verified ground truth -- ` +
      "don't re-verify or second-guess them.",
  );
  lines.push(`4. Write it to ${clipDestination}.`);
  lines.push(
    "5. Stay landscape at this stage -- vertical framing is a COMPOSITION-time concern " +
      "(objectFit: cover + objectPosition on the video element, canvas sized to the " +
      "source's native resolution once finalized), never baked into the extracted file itself.",
  );
  lines.push("");
  lines.push(
    templateManifest.components.hookScene
      ? `This template's HOOK needs a still background -- extract one frame -> ${hookStillDestination}.`
      : "This template has no still-hook beat (hookScene is not in its components) -- do NOT " +
          "generate a hook-still image, nothing in the composition would reference it.",
  );
  lines.push("");
  lines.push(
    `Write the composition file -> src/projects-local/${project.slug}/<PascalCaseTopicName>.tsx -- wire the ` +
      "locked copy + editCopy's cut list + the template's real components together, " +
      "following the same pattern as the reference composition above (or, if there wasn't " +
      "one, standard Remotion practice): frame math from editCopy's real timestamps, one " +
      "cut/Sequence per editCopy row (its row count is already the verified real shot count -- " +
      "don't merge or split rows), captions from the words.json slice you queried.",
  );
  lines.push("");
  lines.push(
    "Register this composition for local preview and rendering -- without this, `cutshort " +
      "render` cannot find it even though everything else about the build succeeded. Open " +
      "src/Root.local.tsx (if it doesn't exist yet, first copy src/Root.local.tsx.example to " +
      "create it). Add an import for the new component and a <Composition " +
      'id="<PascalCaseTopicName>" component={...} durationInFrames={...} fps={...} ' +
      "width={...} height={...} /> entry, matching the pattern of whatever's already there. " +
      "Never add this to src/Root.tsx -- that file must stay generic, project compositions " +
      "only ever go in Root.local.tsx.",
  );
  lines.push(
    "editCopy's objectPosition/effect values are already-verified ground truth from an earlier " +
      "frame-checking pass -- use them exactly as given. Do NOT recompute crop math, do NOT " +
      "second-guess a value that looks off, do NOT render test stills to check it. If a value " +
      "genuinely seems wrong once you see the extracted clip, say so plainly in this response's " +
      "notes and move on -- don't try to fix it here.",
  );
  lines.push("");
  lines.push(
    "Before responding, verify your own work -- metadata only, no frame-viewing at this stage:",
  );
  lines.push(
    "1. ffprobe the extracted clip -- resolution is ~720p on the long edge (this is the " +
      "proxy, not the final asset), duration roughly matches editCopy's total span.",
  );
  lines.push(
    "2. Confirm every path the new .tsx references actually exists on disk.",
  );
  lines.push(
    "3. Confirm src/Root.local.tsx actually contains a <Composition " +
      'id="<PascalCaseTopicName>"> entry for what you just registered -- report ' +
      "selfVerification.rootRegistered honestly (false if you skipped this step or aren't sure).",
  );
  lines.push(
    "Do NOT extract or view any frames from the new clip for this check -- a human reviews " +
      "the actual composition in Remotion Studio next, that's the real visual check for a " +
      "proxy. Do not iterate on crop values, do not repeat the frame-checking edit-copy " +
      "already did -- report problems in notes instead of trying to solve them here. That " +
      "kind of unbounded iteration is what made an earlier run take 30 minutes and far more " +
      "tokens than it needed to.",
  );
  if (feedback) {
    lines.push("");
    lines.push(
      `Revise your previous proposal based on this feedback: ${feedback}`,
    );
  }
  lines.push("");
  lines.push(
    "Respond with ONLY a JSON object, no markdown fences, no commentary, matching:",
  );
  lines.push(
    `{
  "compositionFile": string,
  "extractedClip": string,
  "hookStill": string | null,
  "selfVerification": {
    "resolutionMatches": boolean,
    "durationMatches": boolean,
    "filesExist": boolean,
    "rootRegistered": boolean,
    "notes": string
  }
}`,
  );
  return lines.join("\n");
}

// Mirrors ownFileCheck below it: never trust the agent's own claim that it
// registered the composition -- an agent can (and has) skipped this exact
// step while everything else about a build genuinely succeeded, which
// leaves `cutshort render` unable to find the composition it just built.
function checkRootRegistration(compositionFile: string): {
  compositionId: string;
  registered: boolean;
} {
  const compositionId = path.basename(compositionFile, ".tsx");
  const rootLocalPath = path.resolve(process.cwd(), "src", "Root.local.tsx");
  const registered =
    fs.existsSync(rootLocalPath) &&
    fs.readFileSync(rootLocalPath, "utf-8").includes(`id="${compositionId}"`);
  return { compositionId, registered };
}

function render(proposal: BuildProposal): string {
  const ownFileCheck =
    fs.existsSync(proposal.compositionFile) &&
    fs.existsSync(proposal.extractedClip) &&
    (proposal.hookStill === null || fs.existsSync(proposal.hookStill));

  const { compositionId, registered } = checkRootRegistration(
    proposal.compositionFile,
  );

  return [
    `Composition: ${proposal.compositionFile}`,
    `Extracted clip: ${proposal.extractedClip}`,
    proposal.hookStill
      ? `Hook still: ${proposal.hookStill}`
      : "Hook still: not needed for this template",
    "",
    "Self-verification:",
    JSON.stringify(proposal.selfVerification, null, 2),
    "",
    ownFileCheck
      ? "Command-level check: all referenced files exist on disk."
      : "WARNING: command-level check found a missing file the agent claimed to write.",
    registered
      ? `Command-level check: "${compositionId}" is registered in src/Root.local.tsx.`
      : `WARNING: "${compositionId}" is NOT registered in src/Root.local.tsx -- ` +
          `\`cutshort render\` will fail to find it. Add a <Composition id="${compositionId}"> ` +
          "entry there before approving, or add it now and re-run.",
  ].join("\n");
}

export async function designBuildCommand(
  slug: string,
  topicId: string,
  options: {
    finalize?: boolean;
    skipRender?: boolean;
    agent?: AgentName;
    feedback?: string;
    agentOptions?: AgentRunOptions;
  } = {},
): Promise<void> {
  requireProjectDir(slug);
  const project = readProjectData(slug);
  const design = readDesignData(slug);

  if (!project.template) {
    console.error(
      `\nNo template set for ${slug} -- run \`cutshort design content-structure ${slug}\` first.`,
    );
    process.exit(1);
  }

  let foundTopic: Topic | undefined;
  for (const phase of design?.phases ?? []) {
    foundTopic = phase.topics?.find((t) => t.id === topicId);
    if (foundTopic) break;
  }
  if (!foundTopic) {
    console.error(`\nTopic "${topicId}" not found for ${slug}.`);
    process.exit(1);
  }

  const structures = foundTopic!.contentStructures ?? [];
  if (structures.length === 0) {
    console.error(
      `\nTopic "${topicId}" has no locked content structure yet -- run ` +
        `\`cutshort design content-structure ${slug} --topic ${topicId}\` first.`,
    );
    process.exit(1);
  }
  if (structures.length > 1) {
    console.error(
      `\nTopic "${topicId}" has ${structures.length} content structures saved -- build needs ` +
        `exactly one locked variant. Trim design.json down to the one you're building before running this.`,
    );
    process.exit(1);
  }
  const structure = structures[0];

  if (!structure.editCopy) {
    console.error(
      `\nTopic "${topicId}" has no locked edit copy yet -- run ` +
        `\`cutshort design edit-copy ${slug} --topic ${topicId}\` first.`,
    );
    process.exit(1);
  }

  if (!options.finalize && structure.build?.quality === "final") {
    console.error(
      `\nTopic "${topicId}" is already finalized (${structure.build.extractedClip}) -- ` +
        `re-running \`design build\` without --finalize would overwrite it with a fresh 720p ` +
        `proxy. If you really want to redo it from scratch, delete this topic's contentStructures[0].build ` +
        `entry in Campaign/design.json first.`,
    );
    process.exit(1);
  }

  if (options.finalize) {
    if (!structure.build) {
      console.error(
        `\nTopic "${topicId}" hasn't been built yet -- run \`cutshort design build ${slug} --topic ${topicId}\` first.`,
      );
      process.exit(1);
    }
    if (structure.build.quality === "final") {
      console.error(
        `\nTopic "${topicId}" is already finalized: ${structure.build.extractedClip}`,
      );
      process.exit(1);
    }

    const timedRows = videoTimestampRows(structure.editCopy.rows);
    const firstTimestamp = timedRows[0]?.timestamp;
    const lastTimestamp = timedRows[timedRows.length - 1]?.timestamp;
    if (!firstTimestamp || !lastTimestamp) {
      console.error(
        `\nTopic "${topicId}"'s edit copy has no timestamped video rows -- can't determine the clip range.`,
      );
      process.exit(1);
    }

    const finalDestination = finalVideoPath(slug, topicId);
    fs.mkdirSync(finalVideoDir(slug), { recursive: true });

    console.log(
      `\nFinalizing ${topicId}: extracting full-resolution clip to ${finalDestination}...`,
    );
    extractClip({
      sourceVideoPath: project.videoPath,
      startTimestamp: timestampBoundary(firstTimestamp, "start"),
      endTimestamp: timestampBoundary(lastTimestamp, "end"),
      destination: finalDestination,
      capTo720p: false,
    });

    swapCompositionClipReference(
      structure.build.compositionFile,
      toStaticFileRelative(structure.build.extractedClip),
      toStaticFileRelative(finalDestination),
    );

    structure.build.finalClip = finalDestination;
    structure.build.quality = "final";
    saveDesignData(slug, design!);
    console.log(
      `\nFinalized -- composition now references the full-resolution clip.`,
    );
    console.log(
      `  Proxy left in place (not deleted): ${structure.build.extractedClip}`,
    );
    console.log(`  Final: ${finalDestination}`);

    if (options.skipRender) {
      console.log(
        `\nSkipping render (--skip-render). Run \`cutshort render ${slug} --topic ${topicId}\` when ready.\n`,
      );
      return;
    }

    console.log(`\nRendering...`);
    await renderCommand(slug, topicId);
    return;
  }

  const templateManifest = await readTemplateManifest(project.template);
  const templateDirPath = path.resolve(
    process.cwd(),
    "src",
    "templates",
    project.template,
  );

  const agent: AgentName = options.agent ?? "claude";

  const proposal = await reviewLoop(
    (feedback) =>
      runAgentTaskJson<BuildProposal>(
        buildBuildPrompt(
          foundTopic!,
          structure,
          project,
          templateManifest,
          projectDir(slug),
          templateDirPath,
          feedback,
        ),
        projectDir(slug),
        agent,
        // Unlike the other stages, this agent call has real side effects --
        // it writes the composition file and runs ffmpeg to extract the
        // clip, not just generating text. A blind automatic retry after a
        // partial failure risks compounding that (re-extracting, or writing
        // over a half-finished composition) rather than cleanly redoing it,
        // so build always runs once regardless of --retries.
        { ...options.agentOptions, retries: 0 },
      ),
    render,
    {
      agent,
      pendingPath: pendingCandidatePath(slug, "build", topicId),
      approveCommand: `cutshort design approve ${slug} --stage build --topic ${topicId}`,
      initialFeedback: options.feedback,
    },
  );

  applyBuildProposal(slug, design!, structure, topicId, proposal, agent);
}

// The save step -- identical whether the proposal came from a human
// approving the interactive menu or from `cutshort design approve` reading
// back a non-interactive candidate. Exported so design-approve.ts can call
// it. Proxy-only: `--finalize` is mechanical and handled entirely above,
// never through reviewLoop.
export function applyBuildProposal(
  slug: string,
  design: DesignData,
  structure: ContentStructure,
  topicId: string,
  proposal: BuildProposal,
  agent: AgentName,
): void {
  structure.build = {
    compositionFile: proposal.compositionFile,
    extractedClip: proposal.extractedClip,
    hookStill: proposal.hookStill,
    quality: "proxy",
    generatedBy: agent,
    approvedAt: new Date().toISOString(),
  };

  saveDesignData(slug, design);
  console.log(
    `\nSaved build output (720p proxy) for topic ${topicId} to Campaign/design.json and Campaign/design.md`,
  );
  console.log(`\nRun \`npm run dev\` to preview in Remotion Studio.`);
  console.log(
    `\nOnce approved, run \`cutshort design build ${slug} --topic ${topicId} --finalize\` for full resolution.\n`,
  );
}
