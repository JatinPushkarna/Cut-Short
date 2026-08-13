import { beforeEach, describe, expect, it, vi } from "vitest";
import { claudeProvider } from "./claude";
import { codexProvider } from "./codex";
import { getAgentProvider, runAgentTask, runAgentTaskJson } from "./runner";

describe("agent runner", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("selects the requested provider", () => {
    expect(getAgentProvider("claude")).toBe(claudeProvider);
    expect(getAgentProvider("codex")).toBe(codexProvider);
  });

  it("uses Claude by default", async () => {
    vi.spyOn(claudeProvider, "run").mockResolvedValue("done");
    await expect(runAgentTask("prompt", "/project")).resolves.toBe("done");
    expect(claudeProvider.run).toHaveBeenCalledWith(
      { prompt: "prompt", projectDir: "/project" },
      { timeoutMs: 300_000 },
    );
  });

  it("uses Codex when requested", async () => {
    vi.spyOn(codexProvider, "run").mockResolvedValue("done");
    await expect(runAgentTask("prompt", "/project", "codex")).resolves.toBe(
      "done",
    );
    expect(codexProvider.run).toHaveBeenCalledWith(
      { prompt: "prompt", projectDir: "/project" },
      { timeoutMs: 300_000 },
    );
  });

  it("reports when the selected executable is unavailable", async () => {
    const error = Object.assign(new Error("missing"), { code: "ENOENT" });
    vi.spyOn(codexProvider, "run").mockRejectedValue(error);
    await expect(runAgentTask("prompt", "/project", "codex")).rejects.toThrow(
      "not installed",
    );
    expect(codexProvider.run).toHaveBeenCalledTimes(1);
  });

  it("doesn't double-wrap a provider's own already-formatted error", async () => {
    vi.spyOn(claudeProvider, "run").mockRejectedValue(
      new Error("Claude Code task failed: boom"),
    );
    await expect(
      runAgentTask("prompt", "/project", "claude", { retries: 0 }),
    ).rejects.toThrow(/^Claude Code task failed: boom$/);
  });

  it("retries a timed-out provider once and returns its later result", async () => {
    const timeout = Object.assign(new Error("timed out"), {
      code: "ETIMEDOUT",
    });
    vi.spyOn(codexProvider, "run")
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce("done");

    await expect(
      runAgentTask("prompt", "/project", "codex", { retries: 1 }),
    ).resolves.toBe("done");
    expect(codexProvider.run).toHaveBeenCalledTimes(2);
  });
});

describe("runAgentTaskJson", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    ['[{"id":"1"}]', [{ id: "1" }]],
    ['```json\n{"a":1}\n```', { a: 1 }],
    ['Here is the result: {"a":2} -- done', { a: 2 }],
  ])("parses provider output %#", async (response, expected) => {
    vi.spyOn(codexProvider, "run").mockResolvedValue(response as string);
    await expect(
      runAgentTaskJson("prompt", "/project", "codex"),
    ).resolves.toEqual(expected);
  });

  it("names the provider when output is invalid", async () => {
    vi.spyOn(codexProvider, "run").mockResolvedValue("not json");
    await expect(
      runAgentTaskJson("prompt", "/project", "codex", { retries: 0 }),
    ).rejects.toThrow("codex task returned invalid JSON");
  });

  it("retries malformed JSON once and accepts a valid later response", async () => {
    vi.spyOn(codexProvider, "run")
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce('{"accepted":true}');

    await expect(
      runAgentTaskJson("prompt", "/project", "codex", { retries: 1 }),
    ).resolves.toEqual({ accepted: true });
    expect(codexProvider.run).toHaveBeenCalledTimes(2);
  });
});
