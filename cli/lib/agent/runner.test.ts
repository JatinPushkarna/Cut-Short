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

  it("uses Claude by default", () => {
    vi.spyOn(claudeProvider, "run").mockReturnValue("done");
    expect(runAgentTask("prompt", "/project")).toBe("done");
    expect(claudeProvider.run).toHaveBeenCalledWith(
      { prompt: "prompt", projectDir: "/project" },
      { timeoutMs: 300_000 },
    );
  });

  it("uses Codex when requested", () => {
    vi.spyOn(codexProvider, "run").mockReturnValue("done");
    expect(runAgentTask("prompt", "/project", "codex")).toBe("done");
    expect(codexProvider.run).toHaveBeenCalledWith(
      { prompt: "prompt", projectDir: "/project" },
      { timeoutMs: 300_000 },
    );
  });

  it("reports when the selected executable is unavailable", () => {
    const error = Object.assign(new Error("missing"), { code: "ENOENT" });
    vi.spyOn(codexProvider, "run").mockImplementation(() => {
      throw error;
    });
    expect(() => runAgentTask("prompt", "/project", "codex")).toThrow(
      "not installed",
    );
    expect(codexProvider.run).toHaveBeenCalledTimes(1);
  });

  it("retries a timed-out provider once and returns its later result", () => {
    const timeout = Object.assign(new Error("timed out"), {
      code: "ETIMEDOUT",
    });
    vi.spyOn(codexProvider, "run")
      .mockImplementationOnce(() => {
        throw timeout;
      })
      .mockReturnValueOnce("done");

    expect(
      runAgentTask("prompt", "/project", "codex", { retries: 1 }),
    ).toBe("done");
    expect(codexProvider.run).toHaveBeenCalledTimes(2);
  });
});

describe("runAgentTaskJson", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    ['[{"id":"1"}]', [{ id: "1" }]],
    ['```json\n{"a":1}\n```', { a: 1 }],
    ['Here is the result: {"a":2} -- done', { a: 2 }],
  ])("parses provider output %#", (response, expected) => {
    vi.spyOn(codexProvider, "run").mockReturnValue(response as string);
    expect(runAgentTaskJson("prompt", "/project", "codex")).toEqual(expected);
  });

  it("names the provider when output is invalid", () => {
    vi.spyOn(codexProvider, "run").mockReturnValue("not json");
    expect(() =>
      runAgentTaskJson("prompt", "/project", "codex", { retries: 0 }),
    ).toThrow("codex task returned invalid JSON");
  });

  it("retries malformed JSON once and accepts a valid later response", () => {
    vi.spyOn(codexProvider, "run")
      .mockReturnValueOnce("not json")
      .mockReturnValueOnce('{"accepted":true}');

    expect(
      runAgentTaskJson("prompt", "/project", "codex", { retries: 1 }),
    ).toEqual({ accepted: true });
    expect(codexProvider.run).toHaveBeenCalledTimes(2);
  });
});
