import fs from "node:fs";
import path from "node:path";
import { frameCheckDir, renderedVideoPath, requireProjectDir } from "../lib/project";
import {
  buildContactSheet,
  detectSceneChanges,
  ffprobeFps,
  formatTimestamp,
  mergeBoundaries,
} from "../lib/frame-check";

// A single-frame flash (~42ms at 23.976fps) at a cut boundary survived a
// prior render because QA sampled the WHOLE clip at 10fps (one frame per
// 100ms) -- far too sparse to catch a one-frame defect -- and Remotion
// Studio's preview never showed it, since Studio and `remotion render` are
// different code paths; the defect only existed in the exported file. This
// command targets both gaps directly: it finds real cut points empirically
// in the ACTUAL RENDERED FILE (not predicted from editCopy math, which
// would need composition-internal beat-offset knowledge this tool doesn't
// reliably have) via ffmpeg scene-change detection, then extracts EVERY
// frame (not sampled) in a tight window around each one.
//
// Known gap, not yet built: this only checks boundaries it can detect on
// its own. Scene detection can miss a very subtle cut, a fade/cross-
// dissolve (no sharp frame-to-frame difference), or a cut hidden under
// full-screen text. The stronger version would also accept the
// composition's own KNOWN PLANNED cut frames (from editCopy/the build's
// Sequence structure) as an explicit supplementary input, not rely on
// auto-detection alone. Flagged for later -- this is exactly why step 4 of
// the durable workflow (a real manual watch) still matters even after this
// check passes; see the video-editing skill.

// Mechanical -- no LLM call, no automatic pass/fail verdict. Finds and
// extracts, at frame-level density, every real cut point in the rendered
// file; the actual "is there a flash/black/discontinuous frame" judgment
// stays a look-at-it step (human or agent), same as every other
// frame-verification discipline in this project -- this tool has never
// trusted pixel math alone to make that call, and shouldn't start here.
export async function verifyRenderCommand(slug: string, topicId: string): Promise<void> {
  requireProjectDir(slug);
  const filePath = renderedVideoPath(slug, topicId);
  if (!fs.existsSync(filePath)) {
    console.error(
      `\nNo rendered file found at Rendered/${topicId}.mp4 -- run \`cutshort render ${slug} --topic ${topicId}\` first.`,
    );
    process.exit(1);
  }

  console.log(`\nProbing ${filePath}...`);
  const fps = ffprobeFps(filePath);

  console.log(`Scanning for cut points (scene-change detection)...`);
  const boundaries = mergeBoundaries(detectSceneChanges(filePath));

  if (boundaries.length === 0) {
    console.log(
      `\nNo cut points detected -- either a single continuous shot, or the scene-change ` +
        `threshold missed something subtle. If you know there ARE cuts ` +
        `in this render, don't treat this as a clean pass.`,
    );
    return;
  }

  const outDir = path.join(frameCheckDir(slug), topicId);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n${boundaries.length} cut point(s) found -- extracting every frame around each:\n`);
  const sheetPaths: string[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const outputPath = path.join(
      outDir,
      `boundary-${i + 1}-${formatTimestamp(boundary)}.jpg`,
    );
    const frameCount = buildContactSheet(filePath, boundary, fps, outputPath);
    sheetPaths.push(outputPath);
    console.log(`  [${i + 1}/${boundaries.length}] ~${boundary.toFixed(2)}s -- ${frameCount} frames -> ${outputPath}`);
  }

  console.log(
    `\nLook at every contact sheet above before treating this render as a clean final export ` +
      `-- watch specifically for a near-white, near-black, or otherwise discontinuous single ` +
      `frame at a cut. This is required, not optional: this check exists because a defect like ` +
      `that has already shipped once (invisible in Remotion Studio, invisible to sparse ` +
      `10fps-sampled contact sheets, visible only in the exported file).`,
  );
  console.log(
    `\nThis check passing is not the same as "final." Scene detection can miss a subtle cut, a ` +
      `fade, or a cut hidden under full-screen text -- do one normal-speed manual watch in CapCut ` +
      `or VLC before actually calling this final.\n`,
  );
}
