import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireProjectDir } from "../lib/project";
import { designAmendCommand } from "./design-amend";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));
vi.mock("../lib/project", () => ({
  requireProjectDir: vi.fn(),
  pendingCandidatePath: vi.fn(
    (s: string, stage: string, topicId?: string) =>
      `/projects/${s}/Campaign/.pending/${stage}${topicId ? `-${topicId}` : ""}.json`,
  ),
}));

const existsSyncMock = fs.existsSync as unknown as ReturnType<typeof vi.fn>;
const readFileSyncMock = fs.readFileSync as unknown as ReturnType<
  typeof vi.fn
>;
const writeFileSyncMock = fs.writeFileSync as unknown as ReturnType<
  typeof vi.fn
>;
const requireProjectDirMock = requireProjectDir as unknown as ReturnType<
  typeof vi.fn
>;

const slug = "test-project";
const inputPath = "/tmp/proposal.json";

describe("designAmendCommand", () => {
  let errorSpy: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.fn>;
  let exitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    existsSyncMock.mockReset().mockReturnValue(true);
    readFileSyncMock.mockReset();
    writeFileSyncMock.mockReset();
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
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code})`);
    }) as never) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("validates the project directory first", () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify([{ id: "p1", name: "P1", goal: "g" }]),
    );
    designAmendCommand(slug, "phases", inputPath, undefined, "claude");
    expect(requireProjectDirMock).toHaveBeenCalledWith(slug);
  });

  it("rejects an unknown stage", () => {
    expect(() =>
      designAmendCommand(slug, "not-a-stage", inputPath, undefined, "claude"),
    ).toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown stage "not-a-stage"'),
    );
  });

  it("requires --topic for edit-copy", () => {
    expect(() =>
      designAmendCommand(slug, "edit-copy", inputPath, undefined, "claude"),
    ).toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("needs --topic"),
    );
  });

  it("requires --topic for build", () => {
    expect(() =>
      designAmendCommand(slug, "build", inputPath, undefined, "claude"),
    ).toThrow("process.exit(1)");
  });

  it("errors when the input file doesn't exist", () => {
    existsSyncMock.mockReturnValue(false);
    expect(() =>
      designAmendCommand(slug, "phases", inputPath, undefined, "claude"),
    ).toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No file found"),
    );
  });

  it("errors on invalid JSON", () => {
    readFileSyncMock.mockReturnValue("{ not valid json");
    expect(() =>
      designAmendCommand(slug, "phases", inputPath, undefined, "claude"),
    ).toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("isn't valid JSON"),
    );
  });

  it("rejects an objective file missing required fields", () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ businessOutcome: "grow follows" }),
    );
    expect(() =>
      designAmendCommand(slug, "objective", inputPath, undefined, "claude"),
    ).toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('doesn\'t match what "objective" expects'),
    );
  });

  it("accepts a valid objective file and writes the pending candidate", () => {
    const proposal = {
      businessOutcome: "grow follows",
      narrativeDirection: "escalate",
      campaignShape: "7 days",
      openQuestions: ["confirm exact post count"],
    };
    readFileSyncMock.mockReturnValue(JSON.stringify(proposal));

    designAmendCommand(slug, "objective", inputPath, undefined, "claude");

    const [writtenPath, writtenContent] = writeFileSyncMock.mock.calls[0];
    expect(writtenPath).toBe(
      "/projects/test-project/Campaign/.pending/objective.json",
    );
    expect(JSON.parse(writtenContent as string).proposal).toEqual(proposal);
  });

  it("rejects a phases file missing required fields", () => {
    readFileSyncMock.mockReturnValue(JSON.stringify([{ id: "p1" }]));
    expect(() =>
      designAmendCommand(slug, "phases", inputPath, undefined, "claude"),
    ).toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("doesn't match what \"phases\" expects"),
    );
  });

  it("accepts a valid phases file and writes the pending candidate", () => {
    const proposal = [{ id: "p1", name: "Phase 1", goal: "g" }];
    readFileSyncMock.mockReturnValue(JSON.stringify(proposal));

    designAmendCommand(slug, "phases", inputPath, undefined, "claude");

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [writtenPath, writtenContent] = writeFileSyncMock.mock.calls[0];
    expect(writtenPath).toBe(
      "/projects/test-project/Campaign/.pending/phases.json",
    );
    const written = JSON.parse(writtenContent as string);
    expect(written.proposal).toEqual(proposal);
    expect(written.generatedBy).toBe("claude");
    expect(written.generatedAt).toEqual(expect.any(String));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("no agent call made"),
    );
  });

  it("rejects a content-structure file missing templateDecision", () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ contentStructuresByTopic: [] }),
    );
    expect(() =>
      designAmendCommand(
        slug,
        "content-structure",
        inputPath,
        undefined,
        "claude",
      ),
    ).toThrow("process.exit(1)");
  });

  it("accepts a valid content-structure file", () => {
    const proposal = {
      templateDecision: {
        action: "reuse",
        templateSlug: "default",
        reasoning: "fits",
      },
      contentStructuresByTopic: [
        {
          topicId: "topic-a",
          contentStructures: [
            {
              variant: "direct",
              hook: "h",
              bridge: "b",
              content: "AMBER: hi",
              cta: "cta",
            },
          ],
        },
      ],
    };
    readFileSyncMock.mockReturnValue(JSON.stringify(proposal));

    designAmendCommand(
      slug,
      "content-structure",
      inputPath,
      "topic-a",
      "codex",
    );

    const [writtenPath, writtenContent] = writeFileSyncMock.mock.calls[0];
    expect(writtenPath).toBe(
      "/projects/test-project/Campaign/.pending/content-structure-topic-a.json",
    );
    expect(JSON.parse(writtenContent as string).generatedBy).toBe("codex");
  });

  it("accepts a valid edit-copy file", () => {
    const proposal = {
      editCopy: {
        sourceVideo: "v.mp4",
        rows: [{ timestamp: "0:01", action: "CUT IN" }],
      },
    };
    readFileSyncMock.mockReturnValue(JSON.stringify(proposal));

    designAmendCommand(slug, "edit-copy", inputPath, "topic-a", "claude");

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a valid build file", () => {
    const proposal = {
      compositionFile: "src/x/A.tsx",
      extractedClip: "clip.mp4",
      hookStill: null,
      selfVerification: {
        resolutionMatches: true,
        durationMatches: true,
        filesExist: true,
        rootRegistered: true,
        notes: "",
      },
    };
    readFileSyncMock.mockReturnValue(JSON.stringify(proposal));

    designAmendCommand(slug, "build", inputPath, "topic-a", "claude");

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
  });
});
