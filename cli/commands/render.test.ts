import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readDesignData,
  saveDesignData,
  type ContentStructure,
  type DesignData,
} from "../lib/design";
import { readProjectData } from "../lib/project";
import { renderCommand } from "./render";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("node:fs", () => ({
  default: { mkdirSync: vi.fn() },
}));
vi.mock("../lib/design", () => ({
  readDesignData: vi.fn(),
  saveDesignData: vi.fn(),
}));
vi.mock("../lib/project", () => ({
  readProjectData: vi.fn(),
  requireProjectDir: vi.fn(),
  renderedDir: vi.fn((s: string) => `public/Projects/${s}/Rendered`),
  renderedVideoPath: vi.fn(
    (s: string, topicId: string) =>
      `public/Projects/${s}/Rendered/${topicId}.mp4`,
  ),
}));

const execFileSyncMock = execFileSync as unknown as ReturnType<typeof vi.fn>;
const mkdirSyncMock = fs.mkdirSync as unknown as ReturnType<typeof vi.fn>;
const readDesignDataMock = readDesignData as unknown as ReturnType<
  typeof vi.fn
>;
const saveDesignDataMock = saveDesignData as unknown as ReturnType<
  typeof vi.fn
>;
const readProjectDataMock = readProjectData as unknown as ReturnType<
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

describe("renderCommand", () => {
  let exitSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
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
    readProjectDataMock.mockReturnValue({});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("exits if the topic doesn't exist", async () => {
    readDesignDataMock.mockReturnValue(makeDesign([builtStructure]));

    await expect(renderCommand(slug, "does-not-exist")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"does-not-exist" not found'),
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it("exits if the topic has no locked content structure", async () => {
    readDesignDataMock.mockReturnValue(makeDesign([]));

    await expect(renderCommand(slug, "topic-a")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no locked content structure"),
    );
  });

  it("exits if more than one content structure is locked", async () => {
    readDesignDataMock.mockReturnValue(
      makeDesign([builtStructure, { ...builtStructure, variant: "b" }]),
    );

    await expect(renderCommand(slug, "topic-a")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("exactly one locked variant"),
    );
  });

  it("exits if the topic hasn't been built yet", async () => {
    readDesignDataMock.mockReturnValue(
      makeDesign([{ ...builtStructure, build: undefined }]),
    );

    await expect(renderCommand(slug, "topic-a")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("hasn't been built yet"),
    );
  });

  it("renders a finalized build to the conventional Rendered/ path", async () => {
    readDesignDataMock.mockReturnValue(makeDesign([builtStructure]));

    await renderCommand(slug, "topic-a");

    expect(mkdirSyncMock).toHaveBeenCalledWith(
      "public/Projects/test-project/Rendered",
      { recursive: true },
    );
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "npx",
      [
        "remotion",
        "render",
        "src/index.ts",
        "TopicA",
        "public/Projects/test-project/Rendered/topic-a.mp4",
      ],
      { stdio: "inherit" },
    );
    expect(saveDesignDataMock).toHaveBeenCalled();
  });

  it("warns but still renders when the build is only a 720p proxy", async () => {
    readDesignDataMock.mockReturnValue(
      makeDesign([
        {
          ...builtStructure,
          build: { ...builtStructure.build!, quality: "proxy" },
        },
      ]),
    );

    await renderCommand(slug, "topic-a");

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("720p review proxy"),
    );
    expect(execFileSyncMock).toHaveBeenCalled();
  });
});
