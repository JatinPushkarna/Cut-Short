import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readDesignData } from "../lib/design";
import { runAgentTaskJson } from "../lib/agent/runner";
import type { AgentName, AgentRunOptions } from "../lib/agent/types";
import { frameCheckDir, projectDir, requireProjectDir } from "../lib/project";
import {
  buildContactSheet,
  buildTimestampContactSheet,
  computeInteriorCheckpoints,
  computeShotSpans,
  detectSceneChanges,
  ffprobeDurationSeconds,
  ffprobeFps,
  formatTimestamp,
  mergeBoundaries,
} from "../lib/frame-check";
import { findLockedStructure } from "./design-edit-copy";
import { remotionCliPath } from "./render";

// Runs automatically right after a proxy build is saved, BEFORE the human
// is ever asked to review it in Remotion Studio -- a safety net, not a
// replacement for that manual watch. Checks the same two things
// verify-render checks post-finalize (flash defects at cut boundaries) plus
// one more: is the subject actually well-framed throughout each shot, not
// just at the moment a cut happens to land on.
//
// This needs frames from the ACTUAL RENDERED composition, not the raw
// extracted source clip -- the crop (objectFit: cover + objectPosition)
// only gets applied when Remotion renders the composition, so a scratch
// render is required even though it's the slow part of this check. Reusing
// Studio's preview instead would defeat the point: this project's own
// verify-render already exists because a defect was invisible in Studio's
// preview and only showed up in the real exported file.

const INTERIOR_FRAMES_PER_SHEET = 30; // 6 columns x 5 rows, matches CONTACT_SHEET_COLUMNS

export type BuildCheckFinding = { timestamp: number; notes: string };

export type BuildCheckResult = {
  flashesFound: BuildCheckFinding[];
  framingIssues: BuildCheckFinding[];
  clean: boolean;
};

function buildPrompt(
  boundarySheets: { path: string; timestamp: number }[],
  interiorSheets: { path: string; timestamps: number[] }[],
): string {
  const lines: string[] = [];
  lines.push(
    "You are checking a built-but-unapproved 720p proxy composition before a human " +
      "reviews it in Remotion Studio. Read every contact sheet listed below (use your Read " +
      "tool on each path) and report two different things:",
  );
  lines.push("");
  lines.push(
    "1. FLASH CHECK -- boundary sheets only (each covers roughly half a second on either " +
      "side of a real cut). Look for a near-white, near-black, or otherwise discontinuous " +
      "single frame.",
  );
  lines.push(
    "2. CROP CHECK -- every sheet, boundary AND interior. For each frame, is the subject " +
      "actually visible and reasonably positioned within the vertical canvas, not cut off, " +
      "not missing, not pushed off to one edge?",
  );
  lines.push("");
  lines.push("Boundary sheets (flash + shot start/end crop):");
  if (boundarySheets.length === 0) {
    lines.push("(none -- no cuts were detected in this render)");
  } else {
    for (const s of boundarySheets) {
      lines.push(`- ${s.path} (cut at ~${s.timestamp.toFixed(2)}s)`);
    }
  }
  lines.push("");
  lines.push("Interior sheets (mid-shot + video-edge crop only, no flash relevance):");
  for (const s of interiorSheets) {
    lines.push(`- ${s.path} (frames at: ${s.timestamps.map((t) => t.toFixed(2)).join(", ")}s)`);
  }
  lines.push("");
  lines.push(
    "Respond with ONLY a JSON object, no markdown fences, no commentary, matching:",
  );
  lines.push(
    `{
  "flashesFound": [{ "timestamp": number, "notes": string }],
  "framingIssues": [{ "timestamp": number, "notes": string }],
  "clean": boolean
}`,
  );
  return lines.join("\n");
}

export async function designBuildCheckCommand(
  slug: string,
  topicId: string,
  agent: AgentName = "claude",
  agentOptions?: AgentRunOptions,
): Promise<BuildCheckResult> {
  requireProjectDir(slug);
  const design = readDesignData(slug);
  const { structure } = findLockedStructure(design, slug, topicId);

  if (!structure.build) {
    console.error(
      `\nTopic "${topicId}" hasn't been built yet -- run \`cutshort design build ${slug} --topic ${topicId}\` first.`,
    );
    process.exit(1);
  }

  const compositionId = path.basename(structure.build.compositionFile, ".tsx");
  const scratchDir = path.join(frameCheckDir(slug), topicId, "build-check");
  fs.mkdirSync(scratchDir, { recursive: true });
  const scratchVideo = path.join(scratchDir, "check.mp4");

  console.log(`\nRendering ${compositionId} to a scratch file for automated checking...`);
  execFileSync(
    process.execPath,
    [remotionCliPath(), "render", "src/index.ts", compositionId, scratchVideo],
    { stdio: "inherit" },
  );

  const fps = ffprobeFps(scratchVideo);
  const duration = ffprobeDurationSeconds(scratchVideo);
  const boundaries = mergeBoundaries(detectSceneChanges(scratchVideo));

  console.log(`\n${boundaries.length} cut point(s) found -- building flash + shot-edge sheets:`);
  const boundarySheets: { path: string; timestamp: number }[] = [];
  boundaries.forEach((boundary, i) => {
    const outputPath = path.join(scratchDir, `boundary-${i + 1}-${formatTimestamp(boundary)}.jpg`);
    buildContactSheet(scratchVideo, boundary, fps, outputPath);
    boundarySheets.push({ path: outputPath, timestamp: boundary });
  });

  // Mid-shot drift checks (only shots long enough to matter) plus the two
  // video-outer-edge frames (0s and the final frame), which have no
  // adjacent cut boundary to be covered by otherwise.
  const shots = computeShotSpans(boundaries, duration);
  const interiorTimestamps: number[] = [0];
  for (const shot of shots) {
    interiorTimestamps.push(...computeInteriorCheckpoints(shot));
  }
  interiorTimestamps.push(Math.max(0, duration - 0.05));

  console.log(`Building ${interiorTimestamps.length} mid-shot/video-edge crop checkpoint(s)...`);
  const interiorSheets: { path: string; timestamps: number[] }[] = [];
  for (let i = 0; i * INTERIOR_FRAMES_PER_SHEET < interiorTimestamps.length; i++) {
    const batch = interiorTimestamps.slice(
      i * INTERIOR_FRAMES_PER_SHEET,
      (i + 1) * INTERIOR_FRAMES_PER_SHEET,
    );
    const outputPath = path.join(scratchDir, `interior-${i + 1}.jpg`);
    buildTimestampContactSheet(scratchVideo, batch, outputPath);
    interiorSheets.push({ path: outputPath, timestamps: batch });
  }

  // Only the contact sheets are worth keeping around for reference -- the
  // scratch render itself was never a real deliverable.
  fs.unlinkSync(scratchVideo);

  console.log(`\nAsking ${agent} to review ${boundarySheets.length + interiorSheets.length} contact sheet(s)...`);
  const result = runAgentTaskJson<BuildCheckResult>(
    buildPrompt(boundarySheets, interiorSheets),
    projectDir(slug),
    agent,
    agentOptions,
  );

  return result;
}
