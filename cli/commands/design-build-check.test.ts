import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDesignData } from "../lib/design";
import {
  buildContactSheet,
  buildTimestampContactSheet,
  computeInteriorCheckpoints,
  computeShotSpans,
  detectSceneChanges,
  ffprobeDurationSeconds,
  ffprobeFps,
  mergeBoundaries,
} from "../lib/frame-check";
import { runAgentTaskJson } from "../lib/agent/runner";
import { findLockedStructure } from "./design-edit-copy";
import { designBuildCheckCommand } from "./design-build-check";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("node:fs", () => ({
  default: { mkdirSync: vi.fn(), unlinkSync: vi.fn() },
}));
vi.mock("../lib/design", () => ({ readDesignData: vi.fn() }));
vi.mock("../lib/project", () => ({
  frameCheckDir: vi.fn((s: string) => `public/Projects/${s}/.frame-check`),
  projectDir: vi.fn((s: string) => `/projects/${s}`),
  requireProjectDir: vi.fn(),
}));
vi.mock("../lib/agent/runner", () => ({ runAgentTaskJson: vi.fn() }));
vi.mock("./design-edit-copy", () => ({ findLockedStructure: vi.fn() }));
vi.mock("./render", () => ({ remotionCliPath: vi.fn(() => "/remotion-cli.js") }));
vi.mock("../lib/frame-check", () => ({
  ffprobeFps: vi.fn(),
  ffprobeDurationSeconds: vi.fn(),
  detectSceneChanges: vi.fn(),
  mergeBoundaries: vi.fn((x: number[]) => x),
  buildContactSheet: vi.fn(),
  buildTimestampContactSheet: vi.fn(),
  computeShotSpans: vi.fn(),
  computeInteriorCheckpoints: vi.fn(() => []),
  formatTimestamp: vi.fn((t: number) => `${t}s`),
}));

const execFileSyncMock = execFileSync as unknown as ReturnType<typeof vi.fn>;
const mkdirSyncMock = fs.mkdirSync as unknown as ReturnType<typeof vi.fn>;
const unlinkSyncMock = fs.unlinkSync as unknown as ReturnType<typeof vi.fn>;
const readDesignDataMock = readDesignData as unknown as ReturnType<typeof vi.fn>;
const findLockedStructureMock = findLockedStructure as unknown as ReturnType<typeof vi.fn>;
const ffprobeFpsMock = ffprobeFps as unknown as ReturnType<typeof vi.fn>;
const ffprobeDurationSecondsMock = ffprobeDurationSeconds as unknown as ReturnType<typeof vi.fn>;
const detectSceneChangesMock = detectSceneChanges as unknown as ReturnType<typeof vi.fn>;
const mergeBoundariesMock = mergeBoundaries as unknown as ReturnType<typeof vi.fn>;
const buildContactSheetMock = buildContactSheet as unknown as ReturnType<typeof vi.fn>;
const buildTimestampContactSheetMock = buildTimestampContactSheet as unknown as ReturnType<typeof vi.fn>;
const computeShotSpansMock = computeShotSpans as unknown as ReturnType<typeof vi.fn>;
const computeInteriorCheckpointsMock = computeInteriorCheckpoints as unknown as ReturnType<typeof vi.fn>;
const runAgentTaskJsonMock = runAgentTaskJson as unknown as ReturnType<typeof vi.fn>;

const slug = "test-project";
const topicId = "topic-a";

function makeStructure(overrides: Record<string, unknown> = {}) {
  return {
    build: {
      compositionFile: "src/test-project/Example.tsx",
      extractedClip: "public/Projects/test-project/Assets/Video/topic-a.mp4",
      hookStill: null,
      quality: "proxy",
    },
    ...overrides,
  };
}

describe("designBuildCheckCommand", () => {
  let exitSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execFileSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    unlinkSyncMock.mockReset();
    readDesignDataMock.mockReset();
    findLockedStructureMock.mockReset();
    ffprobeFpsMock.mockReset().mockReturnValue(24);
    ffprobeDurationSecondsMock.mockReset().mockReturnValue(10.0);
    detectSceneChangesMock.mockReset().mockReturnValue([]);
    mergeBoundariesMock.mockReset().mockImplementation((x: number[]) => x);
    buildContactSheetMock.mockReset();
    buildTimestampContactSheetMock.mockReset();
    computeShotSpansMock.mockReset().mockReturnValue([{ start: 0, end: 10.0 }]);
    computeInteriorCheckpointsMock.mockReset().mockReturnValue([]);
    runAgentTaskJsonMock.mockReset().mockReturnValue({
      flashesFound: [],
      framingIssues: [],
      clean: true,
    });

    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never) as unknown as ReturnType<typeof vi.fn>;
    errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined) as unknown as ReturnType<typeof vi.fn>;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("exits if the topic hasn't been built yet", async () => {
    findLockedStructureMock.mockReturnValue({
      topic: { id: topicId, title: "T" },
      structure: {},
    });

    await expect(designBuildCheckCommand(slug, topicId)).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("hasn't been built yet"),
    );
  });

  it("renders the composition to a scratch path -- never Rendered/", async () => {
    findLockedStructureMock.mockReturnValue({
      topic: { id: topicId, title: "T" },
      structure: makeStructure(),
    });

    await designBuildCheckCommand(slug, topicId);

    expect(execFileSyncMock).toHaveBeenCalledWith(
      process.execPath,
      ["/remotion-cli.js", "render", "src/index.ts", "Example", expect.any(String)],
      { stdio: "inherit" },
    );
    const scratchPath = execFileSyncMock.mock.calls[0][1][4] as string;
    expect(scratchPath).toContain("build-check");
    expect(scratchPath).not.toContain("Rendered");
  });

  it("builds one boundary sheet per detected cut", async () => {
    findLockedStructureMock.mockReturnValue({
      topic: { id: topicId, title: "T" },
      structure: makeStructure(),
    });
    detectSceneChangesMock.mockReturnValue([2.0, 8.0]);
    computeShotSpansMock.mockReturnValue([
      { start: 0, end: 2.0 },
      { start: 2.0, end: 8.0 },
      { start: 8.0, end: 10.0 },
    ]);

    await designBuildCheckCommand(slug, topicId);

    expect(buildContactSheetMock).toHaveBeenCalledTimes(2);
    expect(buildContactSheetMock).toHaveBeenCalledWith(
      expect.any(String),
      2.0,
      24,
      expect.stringContaining("boundary-1"),
    );
    expect(buildContactSheetMock).toHaveBeenCalledWith(
      expect.any(String),
      8.0,
      24,
      expect.stringContaining("boundary-2"),
    );
  });

  it("always includes the video-start (0s) and video-end frames as explicit checkpoints", async () => {
    findLockedStructureMock.mockReturnValue({
      topic: { id: topicId, title: "T" },
      structure: makeStructure(),
    });
    ffprobeDurationSecondsMock.mockReturnValue(10.0);
    computeShotSpansMock.mockReturnValue([{ start: 0, end: 10.0 }]);
    computeInteriorCheckpointsMock.mockReturnValue([3.0, 5.0]);

    await designBuildCheckCommand(slug, topicId);

    expect(buildTimestampContactSheetMock).toHaveBeenCalledTimes(1);
    const batch = buildTimestampContactSheetMock.mock.calls[0][1] as number[];
    expect(batch).toEqual([0, 3.0, 5.0, 9.95]);
  });

  it("packs interior checkpoints into batches of 30", async () => {
    findLockedStructureMock.mockReturnValue({
      topic: { id: topicId, title: "T" },
      structure: makeStructure(),
    });
    const manyCheckpoints = Array.from({ length: 40 }, (_, i) => i + 1);
    computeShotSpansMock.mockReturnValue([{ start: 0, end: 100 }]);
    computeInteriorCheckpointsMock.mockReturnValue(manyCheckpoints);

    await designBuildCheckCommand(slug, topicId);

    // 40 interior + 1 (video start=0) + 1 (video end) = 42 total -> 2 batches of 30/12
    expect(buildTimestampContactSheetMock).toHaveBeenCalledTimes(2);
    const firstBatch = buildTimestampContactSheetMock.mock.calls[0][1] as number[];
    const secondBatch = buildTimestampContactSheetMock.mock.calls[1][1] as number[];
    expect(firstBatch).toHaveLength(30);
    expect(secondBatch).toHaveLength(12);
  });

  it("deletes the scratch render after extracting frames", async () => {
    findLockedStructureMock.mockReturnValue({
      topic: { id: topicId, title: "T" },
      structure: makeStructure(),
    });

    await designBuildCheckCommand(slug, topicId);

    expect(unlinkSyncMock).toHaveBeenCalledTimes(1);
    const deletedPath = unlinkSyncMock.mock.calls[0][0] as string;
    expect(deletedPath).toContain("check.mp4");
  });

  it("asks the agent to review every sheet and returns its structured result", async () => {
    findLockedStructureMock.mockReturnValue({
      topic: { id: topicId, title: "T" },
      structure: makeStructure(),
    });
    detectSceneChangesMock.mockReturnValue([5.0]);
    computeShotSpansMock.mockReturnValue([
      { start: 0, end: 5.0 },
      { start: 5.0, end: 10.0 },
    ]);
    runAgentTaskJsonMock.mockReturnValue({
      flashesFound: [{ timestamp: 5.0, notes: "broken frame" }],
      framingIssues: [],
      clean: false,
    });

    const result = await designBuildCheckCommand(slug, topicId);

    expect(result).toEqual({
      flashesFound: [{ timestamp: 5.0, notes: "broken frame" }],
      framingIssues: [],
      clean: false,
    });
    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("FLASH CHECK");
    expect(prompt).toContain("CROP CHECK");
    expect(prompt).toContain("boundary-1");
  });
});
