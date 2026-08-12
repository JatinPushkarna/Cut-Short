import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDesignData, saveDesignData, type DesignData } from "../lib/design";
import {
  readProjectData,
  writeProjectData,
  type ProjectData,
} from "../lib/project";
import { runAgentTaskJson } from "../lib/agent/runner";
import { reviewLoop } from "../lib/review-loop";
import { designContentStructureCommand } from "./design-content-structure";
import { designEditCopyCommand } from "./design-edit-copy";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));
vi.mock("../lib/design", () => ({
  readDesignData: vi.fn(),
  saveDesignData: vi.fn(),
  formatContent: (c: string) => c,
}));
vi.mock("../lib/project", () => ({
  readProjectData: vi.fn(),
  writeProjectData: vi.fn(),
  requireProjectDir: vi.fn(),
  projectDir: vi.fn((s: string) => `/projects/${s}`),
  pendingCandidatePath: vi.fn(
    (s: string, stage: string, topicId?: string) =>
      `/projects/${s}/Campaign/.pending/${stage}${topicId ? `-${topicId}` : ""}.json`,
  ),
}));
vi.mock("../lib/agent/runner", () => ({ runAgentTaskJson: vi.fn() }));
vi.mock("../lib/review-loop", () => ({ reviewLoop: vi.fn() }));
vi.mock("./design-edit-copy", () => ({ designEditCopyCommand: vi.fn() }));

const existsSyncMock = fs.existsSync as unknown as ReturnType<typeof vi.fn>;
const mkdirSyncMock = fs.mkdirSync as unknown as ReturnType<typeof vi.fn>;
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
const writeProjectDataMock = writeProjectData as unknown as ReturnType<
  typeof vi.fn
>;
const runAgentTaskJsonMock = runAgentTaskJson as unknown as ReturnType<
  typeof vi.fn
>;
const reviewLoopMock = reviewLoop as unknown as ReturnType<typeof vi.fn>;
const designEditCopyCommandMock = designEditCopyCommand as unknown as ReturnType<
  typeof vi.fn
>;

const slug = "test-project";

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
    template: null,
    ...overrides,
  };
}

const designWithTopic: DesignData = {
  phases: [
    {
      id: "phase-1",
      name: "Phase One",
      goal: "g",
      topics: [{ id: "topic-a", title: "Generic Topic A" }],
    },
  ],
};

const designWithTwoTopics: DesignData = {
  phases: [
    {
      id: "phase-1",
      name: "Phase One",
      goal: "g",
      topics: [
        { id: "topic-a", title: "Generic Topic A" },
        { id: "topic-b", title: "Generic Topic B" },
      ],
    },
  ],
};

function makeProposal(
  overrides: Partial<{
    templateDecision: any;
    contentStructuresByTopic: any;
  }> = {},
) {
  return {
    templateDecision: {
      action: "reuse",
      templateSlug: "default",
      reasoning: "fits fine",
    },
    contentStructuresByTopic: [
      {
        topicId: "topic-a",
        contentStructures: [
          {
            variant: "variant-a",
            hook: "A generic hook line.",
            bridge: "A generic bridge line.",
            content: "SPEAKER_A: A generic line of dialogue.",
            reveal: "A generic reveal line.",
            cta: "FOLLOW -- more soon.",
            platforms: {
              youtube: {
                title: "YT Title",
                caption: "yt cap",
                hashtags: ["#ShortFilm"],
              },
              instagram: { caption: "ig cap", hashtags: ["#IndieFilm"] },
              tiktok: { caption: "tt cap", hashtags: ["#FilmTok"] },
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("designContentStructureCommand", () => {
  let exitSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    existsSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    readDesignDataMock.mockReset();
    saveDesignDataMock.mockReset();
    readProjectDataMock.mockReset();
    writeProjectDataMock.mockReset();
    runAgentTaskJsonMock.mockReset();
    reviewLoopMock.mockReset();
    designEditCopyCommandMock.mockReset();

    // Drive reviewLoop by actually invoking the `generate` callback it was
    // given, so runAgentTaskJson gets called and its prompt argument is
    // inspectable -- exercises the real buildPrompt() without exporting it.
    reviewLoopMock.mockImplementation(
      async (generate: (feedback?: string) => unknown) => generate(undefined),
    );

    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never) as unknown as ReturnType<typeof vi.fn>;
    errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined) as unknown as ReturnType<
      typeof vi.fn
    >;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("exits if no topics exist yet", async () => {
    readProjectDataMock.mockReturnValue(makeProject());
    readDesignDataMock.mockReturnValue({
      phases: [{ id: "p1", name: "Phase", goal: "g", topics: [] }],
    });

    await expect(designContentStructureCommand(slug)).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No topics found"),
    );
    expect(runAgentTaskJsonMock).not.toHaveBeenCalled();
  });

  it("names the project's current template in the prompt", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("contract.ts");
    expect(prompt).toContain("This project currently uses: default");
  });

  it("decides the template before drafting copy, not after (gate, not parallel output)", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    const templateGateIndex = prompt.indexOf(
      "Before drafting any copy, decide which visual template",
    );
    const copyDraftIndex = prompt.indexOf(
      "Now propose 2-3 DIFFERENT content structure variants",
    );
    expect(templateGateIndex).toBeGreaterThan(-1);
    expect(copyDraftIndex).toBeGreaterThan(-1);
    expect(templateGateIndex).toBeLessThan(copyDraftIndex);
  });

  it("says 'no template yet' in the prompt when project.template is null", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: null }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("This project currently uses: no template yet");
  });

  it("on 'reuse', sets project.template and never touches the template directory", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    expect(writeProjectDataMock).toHaveBeenCalledWith(
      slug,
      expect.objectContaining({ template: "default" }),
    );
    expect(mkdirSyncMock).not.toHaveBeenCalled();
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("on 'new', creates the template dir + brief.md and sets project.template to the new slug", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: null }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    existsSyncMock.mockReturnValue(false);
    runAgentTaskJsonMock.mockReturnValue(
      makeProposal({
        templateDecision: {
          action: "new",
          templateSlug: "new-template",
          reasoning: "no existing template fits this tone",
          newTemplateBrief: "# New Template -- template brief\n\n...",
        },
      }),
    );

    await designContentStructureCommand(slug);

    const expectedDir = path.resolve(
      process.cwd(),
      "src",
      "templates",
      "new-template",
    );
    expect(mkdirSyncMock).toHaveBeenCalledWith(expectedDir, {
      recursive: true,
    });
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      path.join(expectedDir, "brief.md"),
      expect.stringContaining("# New Template -- template brief"),
    );
    expect(writeProjectDataMock).toHaveBeenCalledWith(
      slug,
      expect.objectContaining({ template: "new-template" }),
    );
  });

  it("on 'new', errors out instead of overwriting an existing template folder", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: null }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    existsSyncMock.mockReturnValue(true);
    runAgentTaskJsonMock.mockReturnValue(
      makeProposal({
        templateDecision: {
          action: "new",
          templateSlug: "default",
          reasoning: "collides on purpose for this test",
          newTemplateBrief: "# brief",
        },
      }),
    );

    await expect(designContentStructureCommand(slug)).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
    expect(mkdirSyncMock).not.toHaveBeenCalled();
    expect(writeProjectDataMock).not.toHaveBeenCalled();
    expect(saveDesignDataMock).not.toHaveBeenCalled();
  });

  it("merges returned content structures into the matching topic and saves design data", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    const design = structuredClone(designWithTopic);
    readDesignDataMock.mockReturnValue(design);
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    expect(saveDesignDataMock).toHaveBeenCalledTimes(1);
    const savedDesign = saveDesignDataMock.mock.calls[0][1] as DesignData;
    const topic = savedDesign.phases[0].topics![0];
    expect(topic.contentStructures).toHaveLength(1);
    expect(topic.contentStructures![0].variant).toBe("variant-a");
    expect(topic.contentStructures![0].reveal).toBe("A generic reveal line.");
  });

  it("preserves per-platform copy through to the saved design data", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    const design = structuredClone(designWithTopic);
    readDesignDataMock.mockReturnValue(design);
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    const savedDesign = saveDesignDataMock.mock.calls[0][1] as DesignData;
    const platforms =
      savedDesign.phases[0].topics![0].contentStructures![0].platforms;
    expect(platforms?.youtube).toEqual({
      title: "YT Title",
      caption: "yt cap",
      hashtags: ["#ShortFilm"],
    });
    expect(platforms?.instagram.caption).toBe("ig cap");
    expect(platforms?.tiktok.hashtags).toEqual(["#FilmTok"]);
  });

  it("asks for per-platform packaging (YouTube title, Instagram, TikTok) in the prompt", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("YouTube");
    expect(prompt).toContain("Instagram");
    expect(prompt).toContain("TikTok");
    expect(prompt).toContain("literal language for what it does");
  });

  it("requires frame extraction before finalizing content (allowFrameVerification: true)", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("you must pull real frames from the source video");
    expect(prompt).toContain("ffmpeg");
    expect(prompt).not.toContain("Do NOT claim something is 'frame-verified'");
  });

  it("embeds the literal, unambiguous project directory path for frame output", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain(`/projects/${slug}/.frame-check`);
    expect(prompt).not.toContain("<project directory>");
  });

  it("scopes the prompt to a single topic when topicId is given", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(structuredClone(designWithTwoTopics));
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug, "topic-b");

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("topic-b");
    expect(prompt).toContain("Generic Topic B");
    expect(prompt).not.toContain("topic-a");
    expect(prompt).not.toContain("Generic Topic A");
  });

  it("does not touch other topics' already-saved data when scoped to one topic", async () => {
    const design = structuredClone(designWithTwoTopics);
    design.phases[0].topics![0].contentStructures = [
      { variant: "existing", hook: "h", bridge: "b", content: "c", cta: "cta" },
    ];
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(design);
    runAgentTaskJsonMock.mockReturnValue(
      makeProposal({
        contentStructuresByTopic: [
          {
            topicId: "topic-b",
            contentStructures: [
              {
                variant: "new-one",
                hook: "h2",
                bridge: "b2",
                content: "c2",
                cta: "cta2",
              },
            ],
          },
        ],
      }),
    );

    await designContentStructureCommand(slug, "topic-b");

    const savedDesign = saveDesignDataMock.mock.calls[0][1] as DesignData;
    const [topicA, topicB] = savedDesign.phases[0].topics!;
    expect(topicA.contentStructures).toEqual([
      { variant: "existing", hook: "h", bridge: "b", content: "c", cta: "cta" },
    ]);
    expect(topicB.contentStructures![0].variant).toBe("new-one");
  });

  it("exits if the scoped topic id doesn't exist", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(designWithTopic);

    await expect(
      designContentStructureCommand(slug, "does-not-exist"),
    ).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"does-not-exist" not found'),
    );
    expect(runAgentTaskJsonMock).not.toHaveBeenCalled();
  });

  it("auto-continues into edit-copy for a topic that ended up with exactly one variant", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(structuredClone(designWithTopic));
    runAgentTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    expect(designEditCopyCommandMock).toHaveBeenCalledWith(slug, "topic-a");
  });

  it("does NOT auto-continue when a topic ends up with more than one variant -- prints guidance instead", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(structuredClone(designWithTopic));
    runAgentTaskJsonMock.mockReturnValue(
      makeProposal({
        contentStructuresByTopic: [
          {
            topicId: "topic-a",
            contentStructures: [
              {
                variant: "a",
                hook: "h1",
                bridge: "b1",
                content: "c1",
                cta: "cta1",
              },
              {
                variant: "b",
                hook: "h2",
                bridge: "b2",
                content: "c2",
                cta: "cta2",
              },
            ],
          },
        ],
      }),
    );

    await designContentStructureCommand(slug);

    expect(designEditCopyCommandMock).not.toHaveBeenCalled();
    const renderedOutput = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0])
      .join("\n");
    expect(renderedOutput).toContain("needs exactly one");
  });
});
