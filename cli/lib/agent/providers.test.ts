import { beforeEach, describe, expect, it, vi } from "vitest";
import { claudeProvider } from "./claude";
import { codexProvider } from "./codex";
import { execWithTreeKillTimeout } from "./exec-with-timeout";

vi.mock("./exec-with-timeout", () => ({
  execWithTreeKillTimeout: vi.fn(),
}));

const execMock = execWithTreeKillTimeout as unknown as ReturnType<typeof vi.fn>;

describe("claudeProvider", () => {
  beforeEach(() => execMock.mockReset());

  it("runs Claude headlessly and returns its result envelope", async () => {
    execMock.mockResolvedValue(
      JSON.stringify({ is_error: false, result: "done" }),
    );

    await expect(
      claudeProvider.run(
        { prompt: "do it", projectDir: "/project" },
        { timeoutMs: 1_000 },
      ),
    ).resolves.toBe("done");
    expect(execMock).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["-p", "do it", "--add-dir", "/project"]),
      expect.objectContaining({ timeoutMs: 1_000 }),
    );
  });

  it("reports an error returned by Claude", async () => {
    execMock.mockResolvedValue(
      JSON.stringify({ is_error: true, result: "failed" }),
    );
    await expect(
      claudeProvider.run({ prompt: "do it", projectDir: "/project" }),
    ).rejects.toThrow("failed");
  });
});

describe("codexProvider", () => {
  beforeEach(() => execMock.mockReset());

  it("runs Codex headlessly from the repository root and returns stdout", async () => {
    execMock.mockResolvedValue("done");

    await expect(
      codexProvider.run(
        { prompt: "do it", projectDir: "/project" },
        { timeoutMs: 1_000 },
      ),
    ).resolves.toBe("done");
    expect(execMock).toHaveBeenCalledWith(
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
      expect.objectContaining({ timeoutMs: 1_000 }),
    );
  });
});
