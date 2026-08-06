import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDesignData, saveDesignData, type DesignData } from "../lib/design";
import { readProjectData, writeProjectData, type ProjectData } from "../lib/project";
import { runClaudeTaskJson } from "../lib/claude-task";
import { reviewLoop } from "../lib/review-loop";
import { designContentStructureCommand } from "./design-content-structure";

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
}));
vi.mock("../lib/claude-task", () => ({ runClaudeTaskJson: vi.fn() }));
vi.mock("../lib/review-loop", () => ({ reviewLoop: vi.fn() }));

const existsSyncMock = fs.existsSync as unknown as ReturnType<typeof vi.fn>;
const mkdirSyncMock = fs.mkdirSync as unknown as ReturnType<typeof vi.fn>;
const writeFileSyncMock = fs.writeFileSync as unknown as ReturnType<typeof vi.fn>;
const readDesignDataMock = readDesignData as unknown as ReturnType<typeof vi.fn>;
const saveDesignDataMock = saveDesignData as unknown as ReturnType<typeof vi.fn>;
const readProjectDataMock = readProjectData as unknown as ReturnType<typeof vi.fn>;
const writeProjectDataMock = writeProjectData as unknown as ReturnType<typeof vi.fn>;
const runClaudeTaskJsonMock = runClaudeTaskJson as unknown as ReturnType<typeof vi.fn>;
const reviewLoopMock = reviewLoop as unknown as ReturnType<typeof vi.fn>;

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
      id: "awareness",
      name: "Awareness",
      goal: "g",
      topics: [{ id: "aw-not-now", title: "When Your Partner Tunes You Out" }],
    },
  ],
};

function makeProposal(overrides: Partial<{ templateDecision: any; contentStructuresByTopic: any }> = {}) {
  return {
    templateDecision: {
      action: "reuse",
      templateSlug: "default",
      reasoning: "fits fine",
    },
    contentStructuresByTopic: [
      {
        topicId: "aw-not-now",
        contentStructures: [
          {
            variant: "shoulder-to-lean-on",
            hook: "After a hard day at work, everyone just wants a shoulder to lean on.",
            bridge: "She tried to.",
            content: "SPEAKER_A: Sorry I'm late.",
            reveal: "Not being heard is its own kind of lonely.",
            cta: "FOLLOW -- for the next one.",
            platforms: {
              youtube: { title: "YT Title", caption: "yt cap", hashtags: ["#ShortFilm"] },
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
    runClaudeTaskJsonMock.mockReset();
    reviewLoopMock.mockReset();

    // Drive reviewLoop by actually invoking the `generate` callback it was
    // given, so runClaudeTaskJson gets called and its prompt argument is
    // inspectable -- exercises the real buildPrompt() without exporting it.
    reviewLoopMock.mockImplementation(async (generate: (feedback?: string) => unknown) => generate(undefined));

    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never) as unknown as ReturnType<typeof vi.fn>;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined) as unknown as ReturnType<typeof vi.fn>;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("exits if no topics exist yet", async () => {
    readProjectDataMock.mockReturnValue(makeProject());
    readDesignDataMock.mockReturnValue({ phases: [{ id: "p1", name: "Phase", goal: "g", topics: [] }] });

    await expect(designContentStructureCommand(slug)).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No topics found"));
    expect(runClaudeTaskJsonMock).not.toHaveBeenCalled();
  });

  it("names the project's current template in the prompt", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    runClaudeTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    const prompt = runClaudeTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("contract.ts");
    expect(prompt).toContain("This project currently uses: default");
  });

  it("says 'no template yet' in the prompt when project.template is null", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: null }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    runClaudeTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    const prompt = runClaudeTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("This project currently uses: no template yet");
  });

  it("on 'reuse', sets project.template and never touches the template directory", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    runClaudeTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    expect(writeProjectDataMock).toHaveBeenCalledWith(slug, expect.objectContaining({ template: "default" }));
    expect(mkdirSyncMock).not.toHaveBeenCalled();
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("on 'new', creates the template dir + brief.md and sets project.template to the new slug", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: null }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    existsSyncMock.mockReturnValue(false);
    runClaudeTaskJsonMock.mockReturnValue(
      makeProposal({
        templateDecision: {
          action: "new",
          templateSlug: "shoulder-lean",
          reasoning: "no existing template fits this tone",
          newTemplateBrief: "# Shoulder Lean -- template brief\n\n...",
        },
      })
    );

    await designContentStructureCommand(slug);

    const expectedDir = path.resolve(process.cwd(), "src", "templates", "shoulder-lean");
    expect(mkdirSyncMock).toHaveBeenCalledWith(expectedDir, { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      path.join(expectedDir, "brief.md"),
      expect.stringContaining("# Shoulder Lean -- template brief")
    );
    expect(writeProjectDataMock).toHaveBeenCalledWith(slug, expect.objectContaining({ template: "shoulder-lean" }));
  });

  it("on 'new', errors out instead of overwriting an existing template folder", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: null }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    existsSyncMock.mockReturnValue(true);
    runClaudeTaskJsonMock.mockReturnValue(
      makeProposal({
        templateDecision: {
          action: "new",
          templateSlug: "default",
          reasoning: "collides on purpose for this test",
          newTemplateBrief: "# brief",
        },
      })
    );

    await expect(designContentStructureCommand(slug)).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("already exists"));
    expect(mkdirSyncMock).not.toHaveBeenCalled();
    expect(writeProjectDataMock).not.toHaveBeenCalled();
    expect(saveDesignDataMock).not.toHaveBeenCalled();
  });

  it("merges returned content structures into the matching topic and saves design data", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    const design = structuredClone(designWithTopic);
    readDesignDataMock.mockReturnValue(design);
    runClaudeTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    expect(saveDesignDataMock).toHaveBeenCalledTimes(1);
    const savedDesign = saveDesignDataMock.mock.calls[0][1] as DesignData;
    const topic = savedDesign.phases[0].topics![0];
    expect(topic.contentStructures).toHaveLength(1);
    expect(topic.contentStructures![0].variant).toBe("shoulder-to-lean-on");
    expect(topic.contentStructures![0].reveal).toBe("Not being heard is its own kind of lonely.");
  });

  it("preserves per-platform copy through to the saved design data", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    const design = structuredClone(designWithTopic);
    readDesignDataMock.mockReturnValue(design);
    runClaudeTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    const savedDesign = saveDesignDataMock.mock.calls[0][1] as DesignData;
    const platforms = savedDesign.phases[0].topics![0].contentStructures![0].platforms;
    expect(platforms?.youtube).toEqual({ title: "YT Title", caption: "yt cap", hashtags: ["#ShortFilm"] });
    expect(platforms?.instagram.caption).toBe("ig cap");
    expect(platforms?.tiktok.hashtags).toEqual(["#FilmTok"]);
  });

  it("asks for per-platform packaging (YouTube title, Instagram, TikTok) in the prompt", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(designWithTopic);
    runClaudeTaskJsonMock.mockReturnValue(makeProposal());

    await designContentStructureCommand(slug);

    const prompt = runClaudeTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("YouTube");
    expect(prompt).toContain("Instagram");
    expect(prompt).toContain("TikTok");
    expect(prompt).toContain("literal language for what it does");
  });
});
