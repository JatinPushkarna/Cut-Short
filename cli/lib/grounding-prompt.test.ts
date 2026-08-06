import { describe, expect, it } from "vitest";
import { groundingInstructions } from "./grounding-prompt";

describe("groundingInstructions", () => {
  it("forbids frame-verification claims by default", () => {
    const text = groundingInstructions();
    expect(text).toContain("Do NOT claim something is 'frame-verified'");
    expect(text).not.toContain("ffmpeg");
  });

  it("forbids frame-verification claims when explicitly disabled", () => {
    const text = groundingInstructions({ allowFrameVerification: false });
    expect(text).toContain("Do NOT claim something is 'frame-verified'");
  });

  it("requires frame extraction when enabled", () => {
    const text = groundingInstructions({ allowFrameVerification: true });
    expect(text).toContain("you must pull real frames from the source video");
    expect(text).toContain("ffmpeg");
    expect(text).not.toContain("Do NOT claim something is 'frame-verified'");
  });

  it("embeds the literal project directory path instead of a vague placeholder", () => {
    const text = groundingInstructions({
      allowFrameVerification: true,
      projectDirPath: "/repo/public/Projects/example-project",
    });
    expect(text).toContain("/repo/public/Projects/example-project/.frame-check");
    expect(text).not.toContain("<project directory>");
  });

  it("falls back to a placeholder if no path is given", () => {
    const text = groundingInstructions({ allowFrameVerification: true });
    expect(text).toContain("<project directory>/.frame-check");
  });

  it("always includes the no-inventing-dialogue rule regardless of mode", () => {
    expect(groundingInstructions({ allowFrameVerification: true })).toContain(
      "The one thing NOT to guess at: whether real matching dialogue exists"
    );
    expect(groundingInstructions({ allowFrameVerification: false })).toContain(
      "The one thing NOT to guess at: whether real matching dialogue exists"
    );
  });
});
