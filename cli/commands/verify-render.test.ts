import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireProjectDir } from "../lib/project";
import { verifyRenderCommand } from "./verify-render";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}));
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    mkdtempSync: vi.fn((prefix: string) => `${prefix}abc123`),
    readdirSync: vi.fn(),
    rmSync: vi.fn(),
  },
}));
vi.mock("../lib/project", () => ({
  requireProjectDir: vi.fn(),
  renderedVideoPath: vi.fn(
    (s: string, topicId: string) => `public/Projects/${s}/Rendered/${topicId}.mp4`,
  ),
  frameCheckDir: vi.fn((s: string) => `public/Projects/${s}/.frame-check`),
}));

const execFileSyncMock = execFileSync as unknown as ReturnType<typeof vi.fn>;
const spawnSyncMock = spawnSync as unknown as ReturnType<typeof vi.fn>;
const existsSyncMock = fs.existsSync as unknown as ReturnType<typeof vi.fn>;
const readdirSyncMock = fs.readdirSync as unknown as ReturnType<typeof vi.fn>;
const requireProjectDirMock = requireProjectDir as unknown as ReturnType<
  typeof vi.fn
>;

const slug = "test-project";
const topicId = "topic-a";

describe("verifyRenderCommand", () => {
  let exitSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execFileSyncMock.mockReset();
    spawnSyncMock.mockReset();
    existsSyncMock.mockReset().mockReturnValue(true);
    readdirSyncMock.mockReset().mockReturnValue(["f001.jpg", "f002.jpg"]);
    requireProjectDirMock.mockReset();
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code})`);
    }) as never) as unknown as ReturnType<typeof vi.fn>;
    errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined) as unknown as ReturnType<
      typeof vi.fn
    >;
    logSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined) as unknown as ReturnType<
      typeof vi.fn
    >;
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("exits if the rendered file doesn't exist", async () => {
    existsSyncMock.mockReturnValue(false);

    await expect(verifyRenderCommand(slug, topicId)).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No rendered file found"),
    );
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("reports no cut points and skips extraction when scene detection finds nothing", async () => {
    execFileSyncMock.mockReturnValue("24000/1001\n"); // ffprobe fps
    spawnSyncMock.mockReturnValue({ stderr: "no scene changes here" });

    await verifyRenderCommand(slug, topicId);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("No cut points detected"),
    );
    // Only the ffprobe fps call, no contact-sheet ffmpeg calls.
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it("finds cut points and extracts one contact sheet per boundary", async () => {
    execFileSyncMock.mockReturnValue("24000/1001\n");
    spawnSyncMock.mockReturnValue({
      stderr:
        "... pts_time:2.002 ... pts_time:2.010 ... pts_time:8.133122 ...",
    });

    await verifyRenderCommand(slug, topicId);

    // 2.002 and 2.010 merge into one boundary (within MERGE_GAP_SECONDS),
    // 8.133122 is a second, distinct boundary -- so 2 contact sheets, each
    // needing 2 ffmpeg calls (extract frames, then tile) plus the 1 ffprobe
    // call up front.
    expect(execFileSyncMock).toHaveBeenCalledTimes(1 + 2 * 2);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("2 cut point(s) found"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Look at every contact sheet"),
    );
  });
});
