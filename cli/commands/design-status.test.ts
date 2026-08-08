import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readDesignData,
  type ContentStructure,
  type DesignData,
} from "../lib/design";
import { requireProjectDir } from "../lib/project";
import { designStatusCommand } from "./design-status";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));
vi.mock("../lib/design", () => ({
  readDesignData: vi.fn(),
}));
vi.mock("../lib/project", () => ({
  requireProjectDir: vi.fn(),
  renderedDir: vi.fn(
    (s: string) => `/repo/public/Projects/${s}/Rendered`,
  ),
}));

const existsSyncMock = fs.existsSync as unknown as ReturnType<typeof vi.fn>;
const readdirSyncMock = fs.readdirSync as unknown as ReturnType<typeof vi.fn>;
const statSyncMock = fs.statSync as unknown as ReturnType<typeof vi.fn>;
const readFileSyncMock = fs.readFileSync as unknown as ReturnType<
  typeof vi.fn
>;
const readDesignDataMock = readDesignData as unknown as ReturnType<
  typeof vi.fn
>;
const requireProjectDirMock = requireProjectDir as unknown as ReturnType<
  typeof vi.fn
>;

const slug = "test-project";
const srcDir = path.resolve(process.cwd(), "src", "projects-local", slug);
const renderedDirPath = `/repo/public/Projects/${slug}/Rendered`;
const rootLocalPath = path.resolve(process.cwd(), "src", "Root.local.tsx");

function compositionPath(name: string): string {
  return path.join(srcDir, name);
}

function makeDesign(
  structures: ContentStructure[],
  topicId = "topic-a",
): DesignData {
  return {
    phases: [
      {
        id: "phase-1",
        name: "Phase One",
        goal: "g",
        topics: [
          { id: topicId, title: "Generic Topic", contentStructures: structures },
        ],
      },
    ],
  };
}

const finalizedStructure: ContentStructure = {
  variant: "a",
  hook: "h",
  bridge: "b",
  content: "c",
  cta: "cta",
  editCopy: { sourceVideo: "/video.mp4", rows: [] },
  build: {
    compositionFile: compositionPath("TopicA.tsx"),
    extractedClip: "public/Projects/test-project/Assets/Video/topic-a.mp4",
    hookStill: null,
    quality: "final",
    generatedBy: "claude",
  },
};

describe("designStatusCommand", () => {
  let output: string;

  beforeEach(() => {
    output = "";
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output += args.join(" ") + "\n";
    });
    // Nothing on disk unless a test says otherwise.
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([]);
    statSyncMock.mockReturnValue({ mtimeMs: 0 });
    readFileSyncMock.mockReturnValue("");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates the project directory before doing anything else", () => {
    readDesignDataMock.mockReturnValue(null);
    designStatusCommand(slug);
    expect(requireProjectDirMock).toHaveBeenCalledWith(slug);
  });

  it("reports no design.json when none exists yet", () => {
    readDesignDataMock.mockReturnValue(null);
    designStatusCommand(slug);
    expect(output).toContain("No Campaign/design.json for test-project yet");
  });

  it("reports 'no content structure yet' for an empty topic", () => {
    readDesignDataMock.mockReturnValue(makeDesign([]));
    designStatusCommand(slug);
    expect(output).toContain("no content structure yet");
    expect(output).toContain(
      "cutshort design content-structure test-project --topic topic-a",
    );
  });

  it("reports 'content structure locked' once a structure exists with no editCopy", () => {
    readDesignDataMock.mockReturnValue(
      makeDesign([{ ...finalizedStructure, editCopy: undefined, build: undefined }]),
    );
    designStatusCommand(slug);
    expect(output).toContain("content structure locked");
    expect(output).toContain("cutshort design edit-copy test-project --topic topic-a");
  });

  it("reports 'edit copy locked' once editCopy exists with no build", () => {
    readDesignDataMock.mockReturnValue(
      makeDesign([{ ...finalizedStructure, build: undefined }]),
    );
    designStatusCommand(slug);
    expect(output).toContain("edit copy locked");
    expect(output).toContain("cutshort design build test-project --topic topic-a");
  });

  it("reports 'proxy built, pending review' once build exists but isn't finalized", () => {
    readDesignDataMock.mockReturnValue(
      makeDesign([
        {
          ...finalizedStructure,
          build: { ...finalizedStructure.build!, quality: "proxy" },
        },
      ]),
    );
    designStatusCommand(slug);
    expect(output).toContain("720p proxy built, pending review");
    expect(output).toContain(
      "cutshort design build test-project --topic topic-a --finalize",
    );
  });

  it("reports 'finalized -- ready to render' and per-stage generatedBy once fully locked", () => {
    readDesignDataMock.mockReturnValue(makeDesign([finalizedStructure]));
    designStatusCommand(slug);
    expect(output).toContain("finalized -- ready to render");
    expect(output).toContain("cutshort render test-project --topic topic-a");
    expect(output).toContain("build:claude");
  });

  it("flags multiple saved variants instead of picking one", () => {
    readDesignDataMock.mockReturnValue(
      makeDesign([finalizedStructure, { ...finalizedStructure, variant: "b" }]),
    );
    designStatusCommand(slug);
    expect(output).toContain("2 variants saved, not trimmed to one");
  });

  it("scopes output to a single topic when --topic is passed", () => {
    const design: DesignData = {
      phases: [
        {
          id: "phase-1",
          name: "Phase One",
          goal: "g",
          topics: [
            { id: "topic-a", title: "Topic A", contentStructures: [] },
            { id: "topic-b", title: "Topic B", contentStructures: [] },
          ],
        },
      ],
    };
    readDesignDataMock.mockReturnValue(design);
    designStatusCommand(slug, "topic-b");
    expect(output).toContain("topic-b: Topic B");
    expect(output).not.toContain("topic-a: Topic A");
  });

  it("errors and exits for an unknown --topic instead of silently showing nothing", () => {
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    readDesignDataMock.mockReturnValue(makeDesign([]));

    expect(() => designStatusCommand(slug, "does-not-exist")).toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"does-not-exist" not found'),
    );
    expect(output).not.toContain("Phase One");
  });

  it("flags a composition on disk with no matching design.json record", () => {
    readDesignDataMock.mockReturnValue(makeDesign([]));
    existsSyncMock.mockImplementation((p: string) => p === srcDir);
    readdirSyncMock.mockImplementation((p: string) =>
      p === srcDir ? ["Stray.tsx"] : [],
    );
    designStatusCommand(slug);
    expect(output).toContain(
      `UNTRACKED COMPOSITION: src/projects-local/${slug}/Stray.tsx`,
    );
  });

  it("flags a design.json composition record that isn't on disk", () => {
    readDesignDataMock.mockReturnValue(makeDesign([finalizedStructure]));
    existsSyncMock.mockReturnValue(false);
    designStatusCommand(slug);
    expect(output).toContain(`MISSING: topic "topic-a"'s design.json record`);
  });

  it("flags a stray/mis-named file in Rendered/", () => {
    readDesignDataMock.mockReturnValue(makeDesign([finalizedStructure]));
    existsSyncMock.mockImplementation(
      (p: string) => p === renderedDirPath || p === compositionPath("TopicA.tsx"),
    );
    readdirSyncMock.mockImplementation((p: string) =>
      p === renderedDirPath ? ["topic-a-proxy.mp4"] : [],
    );
    designStatusCommand(slug);
    expect(output).toContain(
      'STRAY FILE IN Rendered/: "topic-a-proxy.mp4" doesn\'t match the exact "topic-a.mp4"',
    );
  });

  it("flags a rendered file with no matching design.json record at all", () => {
    readDesignDataMock.mockReturnValue(makeDesign([finalizedStructure]));
    existsSyncMock.mockImplementation(
      (p: string) => p === renderedDirPath || p === compositionPath("TopicA.tsx"),
    );
    readdirSyncMock.mockImplementation((p: string) =>
      p === renderedDirPath ? ["unrelated-topic.mp4"] : [],
    );
    designStatusCommand(slug);
    expect(output).toContain(
      'RENDERED WITH NO MATCHING RECORD: "Rendered/unrelated-topic.mp4"',
    );
  });

  it("flags a finalized topic that was never actually rendered", () => {
    readDesignDataMock.mockReturnValue(makeDesign([finalizedStructure]));
    existsSyncMock.mockImplementation((p: string) => p === compositionPath("TopicA.tsx"));
    designStatusCommand(slug);
    expect(output).toContain(
      'NOT YET RENDERED: topic "topic-a" is finalized in design.json',
    );
  });

  it("flags a render that predates a later composition change (stale render)", () => {
    readDesignDataMock.mockReturnValue(makeDesign([finalizedStructure]));
    existsSyncMock.mockImplementation(
      (p: string) => p === renderedDirPath || p === compositionPath("TopicA.tsx"),
    );
    readdirSyncMock.mockImplementation((p: string) =>
      p === renderedDirPath ? ["topic-a.mp4"] : [],
    );
    statSyncMock.mockImplementation((p: string) => ({
      mtimeMs:
        p === compositionPath("TopicA.tsx")
          ? 2_000
          : 1_000, // the rendered file, older than the composition
    }));
    designStatusCommand(slug);
    expect(output).toContain('STALE RENDER: "Rendered/topic-a.mp4"');
  });

  it("does not flag a render that postdates its composition file", () => {
    readDesignDataMock.mockReturnValue(makeDesign([finalizedStructure]));
    existsSyncMock.mockImplementation(
      (p: string) =>
        p === renderedDirPath || p === compositionPath("TopicA.tsx") || p === rootLocalPath,
    );
    readdirSyncMock.mockImplementation((p: string) =>
      p === renderedDirPath ? ["topic-a.mp4"] : [],
    );
    statSyncMock.mockImplementation((p: string) => ({
      mtimeMs: p === compositionPath("TopicA.tsx") ? 1_000 : 2_000,
    }));
    readFileSyncMock.mockReturnValue('<Composition id="TopicA" />');
    designStatusCommand(slug);
    expect(output).not.toContain("STALE RENDER");
    expect(output).toContain("Filesystem audit: OK");
  });

  it("reports a fully clean audit when everything matches", () => {
    readDesignDataMock.mockReturnValue(makeDesign([finalizedStructure]));
    existsSyncMock.mockImplementation(
      (p: string) =>
        p === srcDir ||
        p === renderedDirPath ||
        p === compositionPath("TopicA.tsx") ||
        p === rootLocalPath,
    );
    readdirSyncMock.mockImplementation((p: string) => {
      if (p === srcDir) return ["TopicA.tsx"];
      if (p === renderedDirPath) return ["topic-a.mp4"];
      return [];
    });
    statSyncMock.mockImplementation((p: string) => ({
      mtimeMs: p === compositionPath("TopicA.tsx") ? 1_000 : 2_000,
    }));
    readFileSyncMock.mockReturnValue('<Composition id="TopicA" />');
    designStatusCommand(slug);
    expect(output).toContain("Filesystem audit: OK");
  });

  it("flags a locked composition that isn't registered in Root.local.tsx", () => {
    readDesignDataMock.mockReturnValue(makeDesign([finalizedStructure]));
    existsSyncMock.mockImplementation(
      (p: string) => p === compositionPath("TopicA.tsx") || p === rootLocalPath,
    );
    readFileSyncMock.mockReturnValue("// no matching Composition entry here");
    designStatusCommand(slug);
    expect(output).toContain(
      'NOT REGISTERED: topic "topic-a"\'s composition (TopicA) exists on disk',
    );
  });

  it("flags a locked composition when Root.local.tsx doesn't exist at all yet", () => {
    readDesignDataMock.mockReturnValue(makeDesign([finalizedStructure]));
    existsSyncMock.mockImplementation((p: string) => p === compositionPath("TopicA.tsx"));
    designStatusCommand(slug);
    expect(output).toContain("NOT REGISTERED");
  });
});
