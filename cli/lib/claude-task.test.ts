import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runClaudeTask, runClaudeTaskJson } from "./claude-task";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

const execFileSyncMock = execFileSync as unknown as ReturnType<typeof vi.fn>;

function mockEnvelope(result: string, isError = false) {
  execFileSyncMock.mockReturnValue(JSON.stringify({ is_error: isError, result }));
}

describe("runClaudeTask", () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
  });

  it("returns the envelope's result on success", () => {
    mockEnvelope("hello world");
    expect(runClaudeTask("prompt", "/some/dir")).toBe("hello world");
  });

  it("invokes claude with the prompt and scoped --add-dir", () => {
    mockEnvelope("ok");
    runClaudeTask("do the thing", "/scoped/dir");
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["-p", "do the thing", "--add-dir", "/scoped/dir"]),
      expect.any(Object)
    );
  });

  it("throws when the envelope reports an error", () => {
    mockEnvelope("something went wrong", true);
    expect(() => runClaudeTask("prompt", "/some/dir")).toThrow("something went wrong");
  });
});

describe("runClaudeTaskJson", () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
  });

  it("parses a plain JSON result with no fencing", () => {
    mockEnvelope('[{"id":"1"}]');
    expect(runClaudeTaskJson<unknown>("prompt", "/dir")).toEqual([{ id: "1" }]);
  });

  it("strips a ```json fenced block", () => {
    mockEnvelope('```json\n{"a":1}\n```');
    expect(runClaudeTaskJson<unknown>("prompt", "/dir")).toEqual({ a: 1 });
  });

  it("strips a plain ``` fenced block with no language tag", () => {
    mockEnvelope('```\n{"a":2}\n```');
    expect(runClaudeTaskJson<unknown>("prompt", "/dir")).toEqual({ a: 2 });
  });

  it("slices out a JSON object when wrapped in prose", () => {
    mockEnvelope('Sure, here is the JSON: {"a":3} -- hope that helps!');
    expect(runClaudeTaskJson<unknown>("prompt", "/dir")).toEqual({ a: 3 });
  });

  it("slices out a JSON array when wrapped in prose", () => {
    mockEnvelope('Here you go:\n[{"a":4}]\nLet me know if you need changes.');
    expect(runClaudeTaskJson<unknown>("prompt", "/dir")).toEqual([{ a: 4 }]);
  });

  it("throws a descriptive error on unparseable output", () => {
    mockEnvelope("not json at all");
    expect(() => runClaudeTaskJson("prompt", "/dir")).toThrow("Claude Code task returned invalid JSON");
  });
});
