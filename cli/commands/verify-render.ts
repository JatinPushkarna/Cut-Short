import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { frameCheckDir, renderedVideoPath, requireProjectDir } from "../lib/project";

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

const SCENE_CHANGE_THRESHOLD = 0.25; // ffmpeg's 0-1 scene score
const WINDOW_SECONDS = 0.5; // dense window on each side of a detected boundary
const MERGE_GAP_SECONDS = 0.3; // collapse near-duplicate detections into one boundary
const CONTACT_SHEET_COLUMNS = 6;

function ffprobeFps(filePath: string): number {
  const raw = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=r_frame_rate",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { encoding: "utf-8" },
  ).trim();
  const [num, den] = raw.split("/").map(Number);
  return den ? num / den : num;
}

// ffmpeg's own scene-change score, via a `select` + `showinfo` filter --
// this is what actually finds cut points, not a prediction from
// editCopy's timestamps (which would require knowing each beat's absolute
// frame offset in the final composition, information this tool doesn't
// have without parsing generated .tsx code). Passes the path through -i,
// a plain argv element, rather than embedding it in a filtergraph string
// (lavfi's `movie=` filter) -- that breaks on Windows paths, since the
// filtergraph parser treats `:` as an option separator and a drive letter
// like `C:` gets read as the entire (nonexistent) filename.
function detectSceneChanges(filePath: string): number[] {
  const result = spawnSync(
    "ffmpeg",
    [
      "-i",
      filePath,
      "-vf",
      `select='gt(scene,${SCENE_CHANGE_THRESHOLD})',showinfo`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf-8" },
  );
  const stderr = result.stderr ?? "";
  return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}

function mergeBoundaries(timestamps: number[]): number[] {
  const sorted = [...timestamps].sort((a, b) => a - b);
  const merged: number[] = [];
  for (const t of sorted) {
    if (merged.length === 0 || t - merged[merged.length - 1] > MERGE_GAP_SECONDS) {
      merged.push(t);
    }
  }
  return merged;
}

// One contact sheet per boundary: every frame in the window, tiled into a
// single image (per this project's own "batch into one grid instead of one
// Read call per frame" convention -- see CLAUDE.md). Intermediate
// per-frame files are scratch, deleted once the sheet is composited.
function buildContactSheet(
  filePath: string,
  boundarySeconds: number,
  fps: number,
  outputPath: string,
): number {
  const frameCount = Math.round(WINDOW_SECONDS * 2 * fps);
  const startSeconds = Math.max(0, boundarySeconds - WINDOW_SECONDS);
  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-render-"));

  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-ss",
        startSeconds.toFixed(3),
        "-i",
        filePath,
        "-frames:v",
        String(frameCount),
        "-vsync",
        "0",
        "-vf",
        "scale=270:-1",
        path.join(framesDir, "f%03d.jpg"),
      ],
      { stdio: "pipe" },
    );

    const extracted = fs.readdirSync(framesDir).filter((f) => f.endsWith(".jpg"));
    const rows = Math.ceil(extracted.length / CONTACT_SHEET_COLUMNS);
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        path.join(framesDir, "f%03d.jpg"),
        "-vf",
        `tile=${CONTACT_SHEET_COLUMNS}x${rows}`,
        "-update",
        "1",
        "-frames:v",
        "1",
        outputPath,
      ],
      { stdio: "pipe" },
    );
    return extracted.length;
  } finally {
    fs.rmSync(framesDir, { recursive: true, force: true });
  }
}

function formatTimestamp(seconds: number): string {
  return seconds.toFixed(3).replace(".", "s");
}

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
        `threshold (${SCENE_CHANGE_THRESHOLD}) missed something subtle. If you know there ARE cuts ` +
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
