import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readDesignData,
  type ContentStructure,
  type DesignData,
} from "../lib/design";
import { readProjectData, requireProjectDir } from "../lib/project";
import { previewCommand } from "./preview";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("node:fs", () => ({
  default: { existsSync: vi.fn(), readFileSync: vi.fn() },
}));
vi.mock("node:net", () => ({
  default: { connect: vi.fn() },
}));
vi.mock("../lib/design", () => ({ readDesignData: vi.fn() }));
vi.mock("../lib/project", () => ({
  readProjectData: vi.fn(),
  requireProjectDir: vi.fn(),
  pendingCandidatePath: vi.fn(
    (s: string, stage: string, topicId?: string) =>
      `/projects/${s}/Campaign/.pending/${stage}${topicId ? `-${topicId}` : ""}.json`,
  ),
}));

const execFileSyncMock = execFileSync as unknown as ReturnType<typeof vi.fn>;
const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;
const existsSyncMock = fs.existsSync as unknown as ReturnType<typeof vi.fn>;
const readFileSyncMock = fs.readFileSync as unknown as ReturnType<
  typeof vi.fn
>;
const netConnectMock = net.connect as unknown as ReturnType<typeof vi.fn>;
const readDesignDataMock = readDesignData as unknown as ReturnType<
  typeof vi.fn
>;
const readProjectDataMock = readProjectData as unknown as ReturnType<
  typeof vi.fn
>;
const requireProjectDirMock = requireProjectDir as unknown as ReturnType<
  typeof vi.fn
>;

const slug = "test-project";

function makeDesign(contentStructures: ContentStructure[]): DesignData {
  return {
    phases: [
      {
        id: "phase-1",
        name: "Phase One",
        goal: "g",
        topics: [
          { id: "topic-a", title: "Generic Topic A", contentStructures },
        ],
      },
    ],
  };
}

const builtStructure: ContentStructure = {
  variant: "a",
  hook: "h",
  bridge: "b",
  content: "c",
  cta: "cta",
  build: {
    compositionFile: "src/test-project/TopicA.tsx",
    extractedClip: "public/Projects/test-project/Assets/Video/topic-a.mp4",
    hookStill: null,
    quality: "final",
  },
};

// A fake socket that immediately fires "connect" (port open) or "error"
// (port closed) depending on the test, mirroring net.Socket's real events
// closely enough for isPortOpen()'s connect/error listeners.
function fakeSocket(outcome: "connect" | "error") {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    once: (event: string, cb: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
      if (event === outcome) {
        queueMicrotask(cb);
      }
    },
    destroy: vi.fn(),
  };
}

describe("previewCommand", () => {
  let exitSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execFileSyncMock.mockReset();
    spawnMock.mockReset().mockReturnValue({ unref: vi.fn() });
    existsSyncMock.mockReset().mockReturnValue(false);
    readFileSyncMock.mockReset();
    netConnectMock.mockReset();
    readDesignDataMock.mockReset();
    readProjectDataMock.mockReset().mockReturnValue({});
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

  it("exits if the topic hasn't been built yet", async () => {
    readDesignDataMock.mockReturnValue(
      makeDesign([{ ...builtStructure, build: undefined }]),
    );

    await expect(previewCommand(slug, "topic-a")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("hasn't been built yet"),
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("previews an unapproved pending build candidate, not just an approved one", async () => {
    // The real bug this test guards against: a fresh `design build` writes
    // a PENDING candidate, not design.json -- preview has to be reviewable
    // before approval, not after, or the whole point of the gate is moot.
    readDesignDataMock.mockReturnValue(
      makeDesign([{ ...builtStructure, build: undefined }]),
    );
    existsSyncMock.mockImplementation((p: string) => p.includes(".pending"));
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ proposal: { compositionFile: "src/x/PendingTopic.tsx" } }),
    );
    netConnectMock.mockReturnValue(fakeSocket("connect"));

    await previewCommand(slug, "topic-a");

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Reviewing: PendingTopic"),
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("already approved"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Once it looks right, approve in chat"),
    );
  });

  it("prefers the pending candidate over an already-approved build", async () => {
    readDesignDataMock.mockReturnValue(makeDesign([builtStructure]));
    existsSyncMock.mockImplementation((p: string) => p.includes(".pending"));
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ proposal: { compositionFile: "src/x/NewerTopic.tsx" } }),
    );
    netConnectMock.mockReturnValue(fakeSocket("connect"));

    await previewCommand(slug, "topic-a");

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Reviewing: NewerTopic"),
    );
  });

  it("opens the browser directly when Studio is already running", async () => {
    readDesignDataMock.mockReturnValue(makeDesign([builtStructure]));
    netConnectMock.mockReturnValue(fakeSocket("connect"));

    await previewCommand(slug, "topic-a");

    expect(spawnMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("already running"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Reviewing: TopicA"),
    );
  });

  it("starts Studio detached when it isn't running, then opens the browser", async () => {
    readDesignDataMock.mockReturnValue(makeDesign([builtStructure]));
    // First poll (the initial "is it already running?" check) reports
    // closed; every poll after Studio is "started" reports open.
    let call = 0;
    netConnectMock.mockImplementation(() =>
      fakeSocket(call++ === 0 ? "error" : "connect"),
    );

    await previewCommand(slug, "topic-a");

    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(["studio"]),
      expect.objectContaining({ detached: true, stdio: "ignore" }),
    );
    expect(execFileSyncMock).toHaveBeenCalled(); // ensure-root-local.js
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Starting Remotion Studio"),
    );
  });
});
