import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Shared ffmpeg/ffprobe frame-extraction and contact-sheet building blocks --
// used by both verify-render (checks a real Rendered/ file for cut-boundary
// flash defects) and design-build-check (checks a scratch proxy render for
// the same flash defects PLUS whether the crop keeps the subject in frame
// throughout each shot, not just at its edges).

export const SCENE_CHANGE_THRESHOLD = 0.25; // ffmpeg's 0-1 scene score
export const WINDOW_SECONDS = 0.5; // dense window on each side of a detected boundary
export const MERGE_GAP_SECONDS = 0.3; // collapse near-duplicate detections into one boundary
export const CONTACT_SHEET_COLUMNS = 6;

// A shot shorter than this can't meaningfully show mid-shot subject drift --
// its start/end (already covered by the flash-check boundary windows) are
// enough. Longer shots get interior checkpoints every CROP_CHECK_INTERVAL_SECONDS.
export const CROP_CHECK_MIN_SHOT_SECONDS = 1.0;
export const CROP_CHECK_INTERVAL_SECONDS = 0.5;

export function ffprobeFps(filePath: string): number {
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

export function ffprobeDurationSeconds(filePath: string): number {
  const raw = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { encoding: "utf-8" },
  ).trim();
  return Number(raw);
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
export function detectSceneChanges(filePath: string): number[] {
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

export function mergeBoundaries(timestamps: number[]): number[] {
  const sorted = [...timestamps].sort((a, b) => a - b);
  const merged: number[] = [];
  for (const t of sorted) {
    if (merged.length === 0 || t - merged[merged.length - 1] > MERGE_GAP_SECONDS) {
      merged.push(t);
    }
  }
  return merged;
}

// Tiles an already-populated, sequentially-numbered (f001.jpg, f002.jpg, ...)
// frames directory into one contact-sheet image. The one thing every contact
// sheet in this project shares, regardless of how its frames were extracted.
export function packContactSheet(
  framesDir: string,
  frameCount: number,
  outputPath: string,
  columns: number = CONTACT_SHEET_COLUMNS,
): void {
  const rows = Math.ceil(frameCount / columns);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      path.join(framesDir, "f%03d.jpg"),
      "-vf",
      `tile=${columns}x${rows}`,
      "-update",
      "1",
      "-frames:v",
      "1",
      outputPath,
    ],
    { stdio: "pipe" },
  );
}

// One contact sheet per boundary: every frame in the window, tiled into a
// single image (per this project's own "batch into one grid instead of one
// Read call per frame" convention -- see CLAUDE.md). Intermediate
// per-frame files are scratch, deleted once the sheet is composited.
export function buildContactSheet(
  filePath: string,
  boundarySeconds: number,
  fps: number,
  outputPath: string,
): number {
  const frameCount = Math.round(WINDOW_SECONDS * 2 * fps);
  const startSeconds = Math.max(0, boundarySeconds - WINDOW_SECONDS);
  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-check-"));

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
    packContactSheet(framesDir, extracted.length, outputPath, CONTACT_SHEET_COLUMNS);
    return extracted.length;
  } finally {
    fs.rmSync(framesDir, { recursive: true, force: true });
  }
}

// A single still frame at an exact timestamp -- used for crop checkpoints,
// where the failure mode (gradual subject drift, or a wrong static crop for
// a whole shot) doesn't need every-frame density the way a flash defect
// does. One frame per checkpoint is enough; see CROP_CHECK_INTERVAL_SECONDS.
export function extractSingleFrame(
  filePath: string,
  timestampSeconds: number,
  outputPath: string,
): void {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      timestampSeconds.toFixed(3),
      "-i",
      filePath,
      "-frames:v",
      "1",
      "-vf",
      "scale=270:-1",
      outputPath,
    ],
    { stdio: "pipe" },
  );
}

// Grabs one still frame per given timestamp and tiles them into a single
// contact sheet -- the crop-checkpoint equivalent of buildContactSheet,
// except the frames come from scattered timestamps (not one dense window)
// so each needs its own ffmpeg call rather than one burst extraction.
export function buildTimestampContactSheet(
  filePath: string,
  timestamps: number[],
  outputPath: string,
  columns: number = CONTACT_SHEET_COLUMNS,
): void {
  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-check-"));
  try {
    timestamps.forEach((t, i) => {
      const frameName = `f${String(i + 1).padStart(3, "0")}.jpg`;
      extractSingleFrame(filePath, t, path.join(framesDir, frameName));
    });
    packContactSheet(framesDir, timestamps.length, outputPath, columns);
  } finally {
    fs.rmSync(framesDir, { recursive: true, force: true });
  }
}

export type ShotSpan = { start: number; end: number };

// Turns a list of detected cut points into shot spans covering the WHOLE
// video, including the first shot (0 -> first cut) and last shot (last cut
// -> duration) -- those two have no adjacent cut on one side, so they need
// to be identified explicitly rather than only ever appearing "between" two
// boundaries.
export function computeShotSpans(
  boundaries: number[],
  totalDurationSeconds: number,
): ShotSpan[] {
  const points = [0, ...boundaries, totalDurationSeconds];
  const spans: ShotSpan[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    spans.push({ start: points[i], end: points[i + 1] });
  }
  return spans;
}

// Interior crop checkpoints for one shot -- every CROP_CHECK_INTERVAL_SECONDS
// from the shot's start, stopping short of its end (the end is already
// covered by an adjacent boundary sheet, or by an explicit video-edge grab).
// Shots at or under CROP_CHECK_MIN_SHOT_SECONDS get none -- too short for
// meaningful drift, and already covered at both ends.
export function computeInteriorCheckpoints(shot: ShotSpan): number[] {
  const duration = shot.end - shot.start;
  if (duration <= CROP_CHECK_MIN_SHOT_SECONDS) return [];

  const checkpoints: number[] = [];
  const stopBefore = shot.end - CROP_CHECK_INTERVAL_SECONDS / 2;
  let t = shot.start + CROP_CHECK_INTERVAL_SECONDS;
  while (t < stopBefore) {
    checkpoints.push(t);
    t += CROP_CHECK_INTERVAL_SECONDS;
  }
  return checkpoints;
}

export function formatTimestamp(seconds: number): string {
  return seconds.toFixed(3).replace(".", "s");
}
