import fs from "node:fs";
import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reviewLoop } from "./review-loop";

vi.mock("prompts", () => ({ default: vi.fn() }));
vi.mock("node:fs", () => ({
  default: { mkdirSync: vi.fn(), writeFileSync: vi.fn() },
}));

const promptsMock = prompts as unknown as ReturnType<typeof vi.fn>;
const mkdirSyncMock = fs.mkdirSync as unknown as ReturnType<typeof vi.fn>;
const writeFileSyncMock = fs.writeFileSync as unknown as ReturnType<
  typeof vi.fn
>;

const baseOptions = {
  agent: "claude" as const,
  pendingPath: "/repo/Campaign/.pending/content-structure.json",
  approveCommand: "cutshort design approve slug --stage content-structure",
};

describe("reviewLoop", () => {
  let exitSpy: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.fn>;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    promptsMock.mockReset();
    mkdirSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    originalIsTTY = process.stdout.isTTY;
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code})`);
    }) as never) as unknown as ReturnType<typeof vi.fn>;
    logSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined) as unknown as ReturnType<
      typeof vi.fn
    >;
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    process.stdout.isTTY = originalIsTTY as boolean;
  });

  describe("interactive (real terminal attached)", () => {
    beforeEach(() => {
      process.stdout.isTTY = true;
    });

    it("returns the generated result immediately on approve", async () => {
      promptsMock.mockResolvedValueOnce({ action: "approve" });
      const generate = vi.fn().mockReturnValue("candidate-1");
      const render = vi.fn().mockReturnValue("rendered");

      const result = await reviewLoop(generate, render, baseOptions);

      expect(result).toBe("candidate-1");
      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate).toHaveBeenCalledWith(undefined);
      expect(writeFileSyncMock).not.toHaveBeenCalled();
    });

    it("regenerates with no feedback on 'regenerate'", async () => {
      promptsMock
        .mockResolvedValueOnce({ action: "regenerate" })
        .mockResolvedValueOnce({ action: "approve" });
      const generate = vi
        .fn()
        .mockReturnValueOnce("v1")
        .mockReturnValueOnce("v2");
      const render = vi.fn().mockReturnValue("rendered");

      const result = await reviewLoop(generate, render, baseOptions);

      expect(result).toBe("v2");
      expect(generate).toHaveBeenNthCalledWith(1, undefined);
      expect(generate).toHaveBeenNthCalledWith(2, undefined);
    });

    it("passes collected feedback into the next generate call", async () => {
      promptsMock
        .mockResolvedValueOnce({ action: "feedback" })
        .mockResolvedValueOnce({ text: "make it punchier" })
        .mockResolvedValueOnce({ action: "approve" });
      const generate = vi
        .fn()
        .mockReturnValueOnce("v1")
        .mockReturnValueOnce("v2");
      const render = vi.fn().mockReturnValue("rendered");

      const result = await reviewLoop(generate, render, baseOptions);

      expect(result).toBe("v2");
      expect(generate).toHaveBeenNthCalledWith(1, undefined);
      expect(generate).toHaveBeenNthCalledWith(2, "make it punchier");
    });

    it("exits when the prompt is cancelled (no action returned)", async () => {
      promptsMock.mockResolvedValueOnce({});
      const generate = vi.fn().mockReturnValue("v1");
      const render = vi.fn().mockReturnValue("rendered");

      await expect(
        reviewLoop(generate, render, baseOptions),
      ).rejects.toThrow("process.exit(1)");
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Cancelled"),
      );
    });
  });

  describe("non-interactive (no terminal attached)", () => {
    beforeEach(() => {
      process.stdout.isTTY = undefined as unknown as boolean;
    });

    it("generates once, saves a pending candidate, and exits without approving", async () => {
      const generate = vi.fn().mockReturnValue({ hook: "h" });
      const render = vi.fn().mockReturnValue("rendered proposal");

      await expect(
        reviewLoop(generate, render, baseOptions),
      ).rejects.toThrow("process.exit(0)");

      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate).toHaveBeenCalledWith(undefined);
      expect(promptsMock).not.toHaveBeenCalled();
      expect(mkdirSyncMock).toHaveBeenCalledWith(
        expect.stringContaining(".pending"),
        { recursive: true },
      );
      expect(writeFileSyncMock).toHaveBeenCalledWith(
        baseOptions.pendingPath,
        expect.stringContaining('"generatedBy": "claude"'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Not saved"),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(baseOptions.approveCommand),
      );
    });

    it("passes initialFeedback through to generate instead of looping", async () => {
      const generate = vi.fn().mockReturnValue({ hook: "h" });
      const render = vi.fn().mockReturnValue("rendered");

      await expect(
        reviewLoop(generate, render, {
          ...baseOptions,
          initialFeedback: "make it punchier",
        }),
      ).rejects.toThrow("process.exit(0)");

      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate).toHaveBeenCalledWith("make it punchier");
    });
  });
});
