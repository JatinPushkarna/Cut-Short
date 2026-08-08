import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readDesignData,
  saveDesignData,
  type ContentStructure,
  type DesignData,
} from "../lib/design";
import { readProjectData, type ProjectData } from "../lib/project";
import { runAgentTaskJson } from "../lib/agent/runner";
import { reviewLoop } from "../lib/review-loop";
import { designBuildCommand, type BuildProposal } from "./design-build";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));
vi.mock("../lib/design", () => ({
  readDesignData: vi.fn(),
  saveDesignData: vi.fn(),
}));
vi.mock("../lib/project", () => ({
  readProjectData: vi.fn(),
  requireProjectDir: vi.fn(),
  projectDir: vi.fn((s: string) => `/projects/${s}`),
  videoDir: vi.fn((s: string) => `public/Projects/${s}/Assets/Video`),
  imagesDir: vi.fn((s: string) => `public/Projects/${s}/Assets/Images`),
  finalVideoDir: vi.fn((s: string) => `public/Projects/${s}/Final/Video`),
  finalVideoPath: vi.fn(
    (s: string, topicId: string) =>
      `public/Projects/${s}/Final/Video/${topicId}.mp4`,
  ),
}));
vi.mock("../lib/agent/runner", () => ({ runAgentTaskJson: vi.fn() }));
vi.mock("../lib/review-loop", () => ({ reviewLoop: vi.fn() }));

const execFileSyncMock = execFileSync as unknown as ReturnType<typeof vi.fn>;
const existsSyncMock = fs.existsSync as unknown as ReturnType<typeof vi.fn>;
const mkdirSyncMock = fs.mkdirSync as unknown as ReturnType<typeof vi.fn>;
const readFileSyncMock = fs.readFileSync as unknown as ReturnType<typeof vi.fn>;
const writeFileSyncMock = fs.writeFileSync as unknown as ReturnType<
  typeof vi.fn
>;
const readDesignDataMock = readDesignData as unknown as ReturnType<
  typeof vi.fn
>;
const saveDesignDataMock = saveDesignData as unknown as ReturnType<
  typeof vi.fn
>;
const readProjectDataMock = readProjectData as unknown as ReturnType<
  typeof vi.fn
>;
const runAgentTaskJsonMock = runAgentTaskJson as unknown as ReturnType<
  typeof vi.fn
>;
const reviewLoopMock = reviewLoop as unknown as ReturnType<typeof vi.fn>;

const slug = "test-project";
const lockedEditCopy = {
  sourceVideo: "/video.mp4",
  rows: [
    { timestamp: "0:10–0:20", action: "CUT IN" },
    { timestamp: "0:30–0:40", action: "CUT OUT" },
  ],
};

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    slug,
    projectName: "Test",
    objective: "o",
    targetAudience: "a",
    fileDescription: "f",
    platforms: ["instagram"],
    isCampaign: true,
    campaignDays: 18,
    videoPath: "/video.mp4",
    scriptPath: null,
    createdAt: new Date().toISOString(),
    template: "default",
    ...overrides,
  };
}

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

function makeProposal(overrides: Partial<BuildProposal> = {}): BuildProposal {
  return {
    compositionFile: "src/test-project/Example.tsx",
    extractedClip: "public/Projects/test-project/Assets/Video/topic-a.mp4",
    hookStill: "public/Projects/test-project/Assets/Images/topic-aHookBG.jpg",
    selfVerification: {
      resolutionMatches: true,
      durationMatches: true,
      filesExist: true,
      notes: "",
    },
    ...overrides,
  };
}

describe("designBuildCommand", () => {
  let exitSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execFileSyncMock.mockReset();
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(true);
    mkdirSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    // Default composition contents reference the proxy path under both
    // Assets/Video/ (this test file's fixtures) and Final/Video/ (in case a
    // test re-runs finalize) so swapCompositionClipReference's "does the
    // composition actually reference this path" guard doesn't fire by default.
    readFileSyncMock.mockReset();
    readFileSyncMock.mockReturnValue(
      'staticFile("Projects/test-project/Assets/Video/topic-a.mp4")',
    );
    readDesignDataMock.mockReset();
    saveDesignDataMock.mockReset();
    readProjectDataMock.mockReset();
    runAgentTaskJsonMock.mockReset();
    reviewLoopMock.mockReset();

    // Mirrors what the real reviewLoop does: call generate, then log render(result)
    // -- so render()'s own file-existence-check warning is actually exercised.
    reviewLoopMock.mockImplementation(
      async (
        generate: (feedback?: string) => unknown,
        render: (result: unknown) => string,
      ) => {
        const result = await generate(undefined);
        console.log(render(result));
        return result;
      },
    );

    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
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

  it("exits if the project has no template set", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: null }));
    readDesignDataMock.mockReturnValue(
      makeDesign([
        { variant: "a", hook: "h", bridge: "b", content: "c", cta: "cta" },
      ]),
    );

    await expect(designBuildCommand(slug, "topic-a")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No template set"),
    );
    expect(runAgentTaskJsonMock).not.toHaveBeenCalled();
  });

  it("exits if the topic doesn't exist", async () => {
    readProjectDataMock.mockReturnValue(makeProject());
    readDesignDataMock.mockReturnValue(
      makeDesign([
        { variant: "a", hook: "h", bridge: "b", content: "c", cta: "cta" },
      ]),
    );

    await expect(designBuildCommand(slug, "does-not-exist")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"does-not-exist" not found'),
    );
  });

  it("exits if the topic has no locked content structure yet", async () => {
    readProjectDataMock.mockReturnValue(makeProject());
    readDesignDataMock.mockReturnValue(makeDesign([]));

    await expect(designBuildCommand(slug, "topic-a")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no locked content structure"),
    );
  });

  it("exits if the topic has more than one locked content structure", async () => {
    readProjectDataMock.mockReturnValue(makeProject());
    readDesignDataMock.mockReturnValue(
      makeDesign([
        { variant: "a", hook: "h", bridge: "b", content: "c", cta: "cta" },
        { variant: "b", hook: "h2", bridge: "b2", content: "c2", cta: "cta2" },
      ]),
    );

    await expect(designBuildCommand(slug, "topic-a")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("needs exactly one locked variant"),
    );
  });

  it("exits if the locked content structure has no edit copy yet", async () => {
    readProjectDataMock.mockReturnValue(makeProject());
    readDesignDataMock.mockReturnValue(
      makeDesign([
        { variant: "a", hook: "h", bridge: "b", content: "c", cta: "cta" },
      ]),
    );

    await expect(designBuildCommand(slug, "topic-a")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no locked edit copy"),
    );
  });

  it("builds a prompt with the locked copy, editCopy span, and a 720p proxy constraint", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(
      makeDesign([
        {
          variant: "a",
          hook: "MY HOOK",
          bridge: "b",
          content: "c",
          cta: "cta",
          editCopy: lockedEditCopy,
        },
      ]),
    );
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designBuildCommand(slug, "topic-a");

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("MY HOOK");
    expect(prompt).toContain("0:10 to 0:40");
    expect(prompt).toContain(
      "never reuse anything under a .frame-check/ folder",
    );
    expect(prompt).toContain("Extract a 720p REVIEW PROXY");
    expect(prompt).toContain("Scale to 720p");
    expect(prompt).toContain(
      "Check src/test-project/ for any composition already built",
    );
    expect(prompt).toContain(
      "public/Projects/test-project/Assets/Video/topic-a.mp4",
    );
  });

  it("doesn't hardcode a reference to any specific private project's composition", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(
      makeDesign([
        {
          variant: "a",
          hook: "h",
          bridge: "b",
          content: "c",
          cta: "cta",
          editCopy: lockedEditCopy,
        },
      ]),
    );
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designBuildCommand(slug, "topic-a");

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).not.toContain("Lie Detector");
    expect(prompt).not.toContain("Day8");
  });

  it("tells the model to generate a hook still for a template that has one ('default')", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(
      makeDesign([
        {
          variant: "a",
          hook: "h",
          bridge: "b",
          content: "c",
          cta: "cta",
          editCopy: lockedEditCopy,
        },
      ]),
    );
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designBuildCommand(slug, "topic-a");

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("This template's HOOK needs a still background");
    expect(prompt).toContain(
      "public/Projects/test-project/Assets/Images/topic-aHookBG.jpg",
    );
  });

  it("tells the model NOT to generate a hook still for a template with none ('3-beats')", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "3-beats" }));
    readDesignDataMock.mockReturnValue(
      makeDesign([
        {
          variant: "a",
          hook: "h",
          bridge: "b",
          content: "c",
          cta: "cta",
          editCopy: lockedEditCopy,
        },
      ]),
    );
    runAgentTaskJsonMock.mockReturnValue(makeProposal({ hookStill: null }));

    await designBuildCommand(slug, "topic-a");

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("do NOT generate a hook-still image");
    expect(prompt).not.toContain("HookBG.jpg");
  });

  it("saves the returned build output onto the topic's content structure, tagged as a proxy", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    const design = makeDesign([
      {
        variant: "a",
        hook: "h",
        bridge: "b",
        content: "c",
        cta: "cta",
        editCopy: lockedEditCopy,
      },
    ]);
    readDesignDataMock.mockReturnValue(design);
    const proposal = makeProposal();
    runAgentTaskJsonMock.mockReturnValue(proposal);

    await designBuildCommand(slug, "topic-a");

    expect(saveDesignDataMock).toHaveBeenCalledTimes(1);
    const savedDesign = saveDesignDataMock.mock.calls[0][1] as DesignData;
    expect(
      savedDesign.phases[0].topics![0].contentStructures![0].build,
    ).toEqual({
      compositionFile: proposal.compositionFile,
      extractedClip: proposal.extractedClip,
      hookStill: proposal.hookStill,
      quality: "proxy",
      generatedBy: "claude",
    });
  });

  it("warns (but doesn't block) when the command's own file check finds a path the agent claimed but didn't write", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(
      makeDesign([
        {
          variant: "a",
          hook: "h",
          bridge: "b",
          content: "c",
          cta: "cta",
          editCopy: lockedEditCopy,
        },
      ]),
    );
    runAgentTaskJsonMock.mockReturnValue(makeProposal());
    existsSyncMock.mockReturnValue(false); // agent claimed files that don't actually exist

    await designBuildCommand(slug, "topic-a");

    const renderedOutput = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(renderedOutput).toContain(
      "WARNING: command-level check found a missing file",
    );
    // Warn, don't hard-block -- saving still happens despite the mismatch.
    expect(saveDesignDataMock).toHaveBeenCalledTimes(1);
  });

  it("confirms all files exist when the command's own check agrees with the agent", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(
      makeDesign([
        {
          variant: "a",
          hook: "h",
          bridge: "b",
          content: "c",
          cta: "cta",
          editCopy: lockedEditCopy,
        },
      ]),
    );
    runAgentTaskJsonMock.mockReturnValue(makeProposal());
    existsSyncMock.mockReturnValue(true);

    await designBuildCommand(slug, "topic-a");

    const renderedOutput = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(renderedOutput).toContain(
      "Command-level check: all referenced files exist on disk.",
    );
  });

  it("bounds self-verification to metadata-only, no frame-viewing", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(
      makeDesign([
        {
          variant: "a",
          hook: "h",
          bridge: "b",
          content: "c",
          cta: "cta",
          editCopy: lockedEditCopy,
        },
      ]),
    );
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designBuildCommand(slug, "topic-a");

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Do NOT recompute crop math");
    expect(prompt).toContain(
      "do not repeat the frame-checking edit-copy already did",
    );
    expect(prompt).toContain(
      "editCopy's objectPosition/effect values are already-verified ground truth",
    );
    expect(prompt).toContain(
      "Do NOT extract or view any frames from the new clip for this check",
    );
    expect(prompt).toContain("metadata only, no frame-viewing");
  });

  it("refuses to re-run the plain (non-finalize) proxy flow over an already-finalized build", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(
      makeDesign([
        {
          variant: "a",
          hook: "h",
          bridge: "b",
          content: "c",
          cta: "cta",
          editCopy: lockedEditCopy,
          build: {
            compositionFile: "src/test-project/Example.tsx",
            extractedClip:
              "public/Projects/test-project/Assets/Video/topic-a.mp4",
            hookStill: null,
            quality: "final",
          },
        },
      ]),
    );

    await expect(designBuildCommand(slug, "topic-a")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("already finalized"),
    );
    expect(runAgentTaskJsonMock).not.toHaveBeenCalled();
  });

  describe("--finalize", () => {
    function makeProxyDesign(
      overrides: Partial<ContentStructure> = {},
    ): DesignData {
      return makeDesign([
        {
          variant: "a",
          hook: "h",
          bridge: "b",
          content: "c",
          cta: "cta",
          editCopy: lockedEditCopy,
          build: {
            compositionFile: "src/test-project/Example.tsx",
            extractedClip:
              "public/Projects/test-project/Assets/Video/topic-a.mp4",
            hookStill: null,
            quality: "proxy",
            ...overrides.build,
          },
          ...overrides,
        },
      ]);
    }

    it("exits if the topic hasn't been built yet", async () => {
      readProjectDataMock.mockReturnValue(makeProject());
      readDesignDataMock.mockReturnValue(
        makeDesign([
          {
            variant: "a",
            hook: "h",
            bridge: "b",
            content: "c",
            cta: "cta",
            editCopy: lockedEditCopy,
          },
        ]),
      );

      await expect(
        designBuildCommand(slug, "topic-a", { finalize: true }),
      ).rejects.toThrow("process.exit(1)");
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("hasn't been built yet"),
      );
      expect(execFileSyncMock).not.toHaveBeenCalled();
    });

    it("exits if already finalized", async () => {
      readProjectDataMock.mockReturnValue(makeProject());
      readDesignDataMock.mockReturnValue(
        makeProxyDesign({ build: { quality: "final" } as never }),
      );

      await expect(
        designBuildCommand(slug, "topic-a", { finalize: true }),
      ).rejects.toThrow("process.exit(1)");
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("already finalized"),
      );
      expect(execFileSyncMock).not.toHaveBeenCalled();
    });

    it("is purely mechanical -- no LLM call at all", async () => {
      readProjectDataMock.mockReturnValue(
        makeProject({ videoPath: "/full/source.mp4" }),
      );
      readDesignDataMock.mockReturnValue(makeProxyDesign());

      await designBuildCommand(slug, "topic-a", { finalize: true });

      expect(runAgentTaskJsonMock).not.toHaveBeenCalled();
      expect(reviewLoopMock).not.toHaveBeenCalled();
    });

    it("re-extracts at full resolution to Final/Video/, a DIFFERENT path from the proxy", async () => {
      readProjectDataMock.mockReturnValue(
        makeProject({ videoPath: "/full/source.mp4" }),
      );
      readDesignDataMock.mockReturnValue(makeProxyDesign());

      await designBuildCommand(slug, "topic-a", { finalize: true });

      expect(mkdirSyncMock).toHaveBeenCalledWith(
        "public/Projects/test-project/Final/Video",
        { recursive: true },
      );

      expect(execFileSyncMock).toHaveBeenCalledTimes(1);
      const [bin, args] = execFileSyncMock.mock.calls[0];
      expect(bin).toBe("ffmpeg");
      expect(args).toContain("-ss");
      expect(args).toContain("0:10");
      expect(args).toContain("-to");
      expect(args).toContain("0:40");
      expect(args).toContain("/full/source.mp4");
      expect(args).toContain(
        "public/Projects/test-project/Final/Video/topic-a.mp4",
      );
      // The proxy path itself must NOT be the extraction destination -- that
      // would be the in-place-overwrite behavior we deliberately moved away from.
      expect(args).not.toContain(
        "public/Projects/test-project/Assets/Video/topic-a.mp4",
      );
      expect(args).not.toContain("scale=-2:720");
    });

    it("swaps the composition's clip reference from the proxy path to the final path", async () => {
      readProjectDataMock.mockReturnValue(
        makeProject({ videoPath: "/full/source.mp4" }),
      );
      readDesignDataMock.mockReturnValue(makeProxyDesign());
      readFileSyncMock.mockReturnValue(
        'const CLIP = staticFile("Projects/test-project/Assets/Video/topic-a.mp4");',
      );

      await designBuildCommand(slug, "topic-a", { finalize: true });

      expect(readFileSyncMock).toHaveBeenCalledWith(
        "src/test-project/Example.tsx",
        "utf-8",
      );
      expect(writeFileSyncMock).toHaveBeenCalledWith(
        "src/test-project/Example.tsx",
        'const CLIP = staticFile("Projects/test-project/Final/Video/topic-a.mp4");',
      );
    });

    it("throws instead of silently doing nothing if the composition doesn't reference the proxy path", async () => {
      readProjectDataMock.mockReturnValue(
        makeProject({ videoPath: "/full/source.mp4" }),
      );
      readDesignDataMock.mockReturnValue(makeProxyDesign());
      readFileSyncMock.mockReturnValue(
        "// this composition was hand-edited and no longer matches",
      );

      await expect(
        designBuildCommand(slug, "topic-a", { finalize: true }),
      ).rejects.toThrow(/doesn't reference/);
      expect(writeFileSyncMock).not.toHaveBeenCalled();
    });

    it("flips quality to final, records finalClip, and saves -- leaving extractedClip (the proxy) untouched", async () => {
      readProjectDataMock.mockReturnValue(makeProject());
      const design = makeProxyDesign();
      readDesignDataMock.mockReturnValue(design);

      await designBuildCommand(slug, "topic-a", { finalize: true });

      expect(saveDesignDataMock).toHaveBeenCalledTimes(1);
      const savedBuild = (saveDesignDataMock.mock.calls[0][1] as DesignData)
        .phases[0].topics![0].contentStructures![0].build!;
      expect(savedBuild.quality).toBe("final");
      expect(savedBuild.finalClip).toBe(
        "public/Projects/test-project/Final/Video/topic-a.mp4",
      );
      expect(savedBuild.extractedClip).toBe(
        "public/Projects/test-project/Assets/Video/topic-a.mp4",
      );
    });
  });
});
