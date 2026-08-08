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
    expect(claudeProvider.run).toHaveBeenCalledWith({
      prompt: "prompt",
      projectDir: "/project",
    });
  });

  it("uses Codex when requested", () => {
    vi.spyOn(codexProvider, "run").mockReturnValue("done");
    expect(runAgentTask("prompt", "/project", "codex")).toBe("done");
    expect(codexProvider.run).toHaveBeenCalledWith({
      prompt: "prompt",
      projectDir: "/project",
    });
  });

  it("reports when the selected executable is unavailable", () => {
    const error = Object.assign(new Error("missing"), { code: "ENOENT" });
    vi.spyOn(codexProvider, "run").mockImplementation(() => {
      throw error;
    });
    expect(() => runAgentTask("prompt", "/project", "codex")).toThrow(
      "not installed",
    );
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
    expect(() => runAgentTaskJson("prompt", "/project", "codex")).toThrow(
      "codex task returned invalid JSON",
    );
  });
});
