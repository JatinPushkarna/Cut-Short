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
import { designEditCopyCommand } from "./design-edit-copy";

vi.mock("../lib/design", () => ({
  readDesignData: vi.fn(),
  saveDesignData: vi.fn(),
}));
vi.mock("../lib/project", () => ({
  readProjectData: vi.fn(),
  requireProjectDir: vi.fn(),
  projectDir: vi.fn((s: string) => `/projects/${s}`),
}));
vi.mock("../lib/agent/runner", () => ({ runAgentTaskJson: vi.fn() }));
vi.mock("../lib/review-loop", () => ({ reviewLoop: vi.fn() }));

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

function makeDesign(
  contentStructures: ContentStructure[] = [
    { variant: "a", hook: "h", bridge: "b", content: "c", cta: "cta" },
  ],
): DesignData {
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

describe("designEditCopyCommand", () => {
  let exitSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    readDesignDataMock.mockReset();
    saveDesignDataMock.mockReset();
    readProjectDataMock.mockReset();
    runAgentTaskJsonMock.mockReset();
    reviewLoopMock.mockReset();

    // Drive reviewLoop by actually invoking the `generate` callback it was
    // given, so runAgentTaskJson gets called and its prompt is inspectable.
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

  it("exits if the project has no template set", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: null }));
    readDesignDataMock.mockReturnValue(makeDesign());

    await expect(designEditCopyCommand(slug, "topic-a")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No template set"),
    );
    expect(runAgentTaskJsonMock).not.toHaveBeenCalled();
  });

  it("exits if the topic doesn't exist", async () => {
    readProjectDataMock.mockReturnValue(makeProject());
    readDesignDataMock.mockReturnValue(makeDesign());

    await expect(designEditCopyCommand(slug, "does-not-exist")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"does-not-exist" not found'),
    );
  });

  it("exits if the topic has no locked content structure yet", async () => {
    readProjectDataMock.mockReturnValue(makeProject());
    readDesignDataMock.mockReturnValue(makeDesign([]));

    await expect(designEditCopyCommand(slug, "topic-a")).rejects.toThrow(
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

    await expect(designEditCopyCommand(slug, "topic-a")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("needs exactly one locked variant"),
    );
  });

  it("reads the real 'default' template manifest and reflects its beat structure in the prompt", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(makeDesign());
    runAgentTaskJsonMock.mockReturnValue({
      editCopy: { sourceVideo: "/video.mp4", rows: [] },
    });

    await designEditCopyCommand(slug, "topic-a");

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    // "default"'s real manifest has no videoHookOverlay component -- HOOK is
    // a separate still/black beat, so the no-overlay branch should show up.
    expect(prompt).toContain("5 Beats");
    expect(prompt).toContain(
      "separate still/black beat before any footage plays",
    );
    expect(prompt).not.toContain(
      "overlays hook text on real footage from frame 0 -- confirm",
    );
  });

  it("does not redraft copy or reconsider the template -- both passed as fixed inputs", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(
      makeDesign([
        {
          variant: "a",
          hook: "MY LOCKED HOOK",
          bridge: "MY LOCKED BRIDGE",
          content: "MY LOCKED CONTENT",
          cta: "cta",
        },
      ]),
    );
    runAgentTaskJsonMock.mockReturnValue({
      editCopy: { sourceVideo: "/video.mp4", rows: [] },
    });

    await designEditCopyCommand(slug, "topic-a");

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("MY LOCKED HOOK");
    expect(prompt).toContain("do NOT redraft the copy");
    expect(prompt).toContain("do NOT reconsider the template");
  });

  it("saves the returned editCopy onto the topic's single locked content structure", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    const design = makeDesign();
    readDesignDataMock.mockReturnValue(design);
    const editCopy = {
      sourceVideo: "/video.mp4",
      rows: [{ timestamp: "0:01", action: "CUT IN" }],
    };
    runAgentTaskJsonMock.mockReturnValue({ editCopy });

    await designEditCopyCommand(slug, "topic-a");

    expect(saveDesignDataMock).toHaveBeenCalledTimes(1);
    const savedDesign = saveDesignDataMock.mock.calls[0][1] as DesignData;
    expect(
      savedDesign.phases[0].topics![0].contentStructures![0].editCopy,
    ).toEqual({ ...editCopy, generatedBy: "claude" });
  });

  it("points at this project's own src/<slug>/ for pattern reference, not a hardcoded private project", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(makeDesign());
    runAgentTaskJsonMock.mockReturnValue({
      editCopy: { sourceVideo: "/video.mp4", rows: [] },
    });

    await designEditCopyCommand(slug, "topic-a");

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain(`src/${slug}/`);
    expect(prompt).not.toContain("Lie Detector");
    expect(prompt).not.toContain("Day8");
  });

  it("requires exact numeric objectPosition values and real shot-count verification", async () => {
    readProjectDataMock.mockReturnValue(makeProject({ template: "default" }));
    readDesignDataMock.mockReturnValue(makeDesign());
    runAgentTaskJsonMock.mockReturnValue({
      editCopy: { sourceVideo: "/video.mp4", rows: [] },
    });

    await designEditCopyCommand(slug, "topic-a");

    const prompt = runAgentTaskJsonMock.mock.calls[0][0] as string;
    expect(prompt).toContain("EXACT numeric objectPosition value");
    expect(prompt).toContain(
      "Don't assume dialogue-line boundaries match camera-shot boundaries",
    );
    expect(prompt).toContain(
      "A vague description can't be built from directly",
    );
  });
});
