import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reviewLoop } from "./review-loop";

vi.mock("prompts", () => ({ default: vi.fn() }));

const promptsMock = prompts as unknown as ReturnType<typeof vi.fn>;

describe("reviewLoop", () => {
  let exitSpy: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    promptsMock.mockReset();
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never) as unknown as ReturnType<typeof vi.fn>;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("returns the generated result immediately on approve", async () => {
    promptsMock.mockResolvedValueOnce({ action: "approve" });
    const generate = vi.fn().mockReturnValue("candidate-1");
    const render = vi.fn().mockReturnValue("rendered");

    const result = await reviewLoop(generate, render);

    expect(result).toBe("candidate-1");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(undefined);
  });

  it("regenerates with no feedback on 'regenerate'", async () => {
    promptsMock
      .mockResolvedValueOnce({ action: "regenerate" })
      .mockResolvedValueOnce({ action: "approve" });
    const generate = vi.fn().mockReturnValueOnce("v1").mockReturnValueOnce("v2");
    const render = vi.fn().mockReturnValue("rendered");

    const result = await reviewLoop(generate, render);

    expect(result).toBe("v2");
    expect(generate).toHaveBeenNthCalledWith(1, undefined);
    expect(generate).toHaveBeenNthCalledWith(2, undefined);
  });

  it("passes collected feedback into the next generate call", async () => {
    promptsMock
      .mockResolvedValueOnce({ action: "feedback" })
      .mockResolvedValueOnce({ text: "make it punchier" })
      .mockResolvedValueOnce({ action: "approve" });
    const generate = vi.fn().mockReturnValueOnce("v1").mockReturnValueOnce("v2");
    const render = vi.fn().mockReturnValue("rendered");

    const result = await reviewLoop(generate, render);

    expect(result).toBe("v2");
    expect(generate).toHaveBeenNthCalledWith(1, undefined);
    expect(generate).toHaveBeenNthCalledWith(2, "make it punchier");
  });

  it("exits when the prompt is cancelled (no action returned)", async () => {
    promptsMock.mockResolvedValueOnce({});
    const generate = vi.fn().mockReturnValue("v1");
    const render = vi.fn().mockReturnValue("rendered");

    await expect(reviewLoop(generate, render)).rejects.toThrow("process.exit(1)");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Cancelled"));
  });
});
