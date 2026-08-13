import { describe, expect, it } from "vitest";
import {
  computeInteriorCheckpoints,
  computeShotSpans,
  type ShotSpan,
} from "./frame-check";

describe("computeShotSpans", () => {
  it("covers the whole video, including the first and last shot's outer edges", () => {
    const spans = computeShotSpans([2.0, 8.0], 12.0);
    expect(spans).toEqual([
      { start: 0, end: 2.0 },
      { start: 2.0, end: 8.0 },
      { start: 8.0, end: 12.0 },
    ]);
  });

  it("returns a single shot spanning the whole video when no cuts are detected", () => {
    const spans = computeShotSpans([], 5.0);
    expect(spans).toEqual([{ start: 0, end: 5.0 }]);
  });
});

describe("computeInteriorCheckpoints", () => {
  const shot = (start: number, end: number): ShotSpan => ({ start, end });

  it("returns nothing for a shot at or under 1 second", () => {
    expect(computeInteriorCheckpoints(shot(0, 0.9))).toEqual([]);
    expect(computeInteriorCheckpoints(shot(0, 1.0))).toEqual([]);
  });

  // These match the worked table from the design discussion exactly.
  it("returns 1 checkpoint for a 1.2s shot", () => {
    expect(computeInteriorCheckpoints(shot(0, 1.2))).toEqual([0.5]);
  });

  it("returns 4 checkpoints for a 2.5s shot", () => {
    expect(computeInteriorCheckpoints(shot(0, 2.5))).toEqual([0.5, 1.0, 1.5, 2.0]);
  });

  it("returns 11 checkpoints for a 6s shot", () => {
    expect(computeInteriorCheckpoints(shot(0, 6.0))).toEqual([
      0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5,
    ]);
  });

  it("offsets correctly for a shot that doesn't start at 0", () => {
    expect(computeInteriorCheckpoints(shot(10.0, 12.5))).toEqual([
      10.5, 11.0, 11.5, 12.0,
    ]);
  });
});
