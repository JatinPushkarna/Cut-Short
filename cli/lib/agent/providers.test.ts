import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claudeProvider } from "./claude";
import { codexProvider } from "./codex";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

const execFileSyncMock = execFileSync as unknown as ReturnType<typeof vi.fn>;

describe("claudeProvider", () => {
  beforeEach(() => execFileSyncMock.mockReset());

  it("runs Claude headlessly and returns its result envelope", () => {
    execFileSyncMock.mockReturnValue(
      JSON.stringify({ is_error: false, result: "done" }),
    );

    expect(
      claudeProvider.run(
        { prompt: "do it", projectDir: "/project" },
        { timeoutMs: 1_000 },
      ),
    ).toBe("done");
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["-p", "do it", "--add-dir", "/project"]),
      expect.objectContaining({ timeout: 1_000 }),
    );
  });

  it("reports an error returned by Claude", () => {
    execFileSyncMock.mockReturnValue(
      JSON.stringify({ is_error: true, result: "failed" }),
    );
    expect(() =>
      claudeProvider.run({ prompt: "do it", projectDir: "/project" }),
    ).toThrow("failed");
  });
});

describe("codexProvider", () => {
  beforeEach(() => execFileSyncMock.mockReset());

  it("runs Codex headlessly from the repository root and returns stdout", () => {
    execFileSyncMock.mockReturnValue("done");

    expect(
      codexProvider.run(
        { prompt: "do it", projectDir: "/project" },
        { timeoutMs: 1_000 },
      ),
    ).toBe("done");
    expect(execFileSyncMock).toHaveBeenCalledWith(
      process.platform === "win32" ? process.execPath : "codex",
      expect.arrayContaining([
        "exec",
        "do it",
        "--ephemeral",
        "--approve-for-me",
        "-C",
        process.cwd(),
        "--add-dir",
        "/project",
      ]),
      expect.objectContaining({ timeout: 1_000 }),
    );
  });
});
