import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDesignData } from "../lib/design";
import { pendingCandidatePath, readProjectData, requireProjectDir } from "../lib/project";
import { applyObjectiveProposal } from "./design-objective";
import { applyPhasesProposal } from "./design-phases";
import { applyTopicsProposal } from "./design-topics";
import { applyContentStructureProposal } from "./design-content-structure";
import { applyEditCopyProposal, findLockedStructure } from "./design-edit-copy";
import { applyBuildProposal } from "./design-build";
import { designApproveCommand } from "./design-approve";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));
vi.mock("../lib/design", () => ({ readDesignData: vi.fn() }));
vi.mock("../lib/project", () => ({
  requireProjectDir: vi.fn(),
  readProjectData: vi.fn(),
  pendingCandidatePath: vi.fn(
    (s: string, stage: string, topicId?: string) =>
      `/projects/${s}/Campaign/.pending/${stage}${topicId ? `-${topicId}` : ""}.json`,
  ),
}));
vi.mock("./design-objective", () => ({ applyObjectiveProposal: vi.fn() }));
vi.mock("./design-phases", () => ({ applyPhasesProposal: vi.fn() }));
vi.mock("./design-topics", () => ({ applyTopicsProposal: vi.fn() }));
vi.mock("./design-content-structure", () => ({
  applyContentStructureProposal: vi.fn(),
}));
vi.mock("./design-edit-copy", () => ({
  applyEditCopyProposal: vi.fn(),
  findLockedStructure: vi.fn(),
}));
vi.mock("./design-build", () => ({ applyBuildProposal: vi.fn() }));

const existsSyncMock = fs.existsSync as unknown as ReturnType<typeof vi.fn>;
const readFileSyncMock = fs.readFileSync as unknown as ReturnType<
  typeof vi.fn
>;
const unlinkSyncMock = fs.unlinkSync as unknown as ReturnType<typeof vi.fn>;
const readDesignDataMock = readDesignData as unknown as ReturnType<
  typeof vi.fn
>;
const readProjectDataMock = readProjectData as unknown as ReturnType<
  typeof vi.fn
>;
const requireProjectDirMock = requireProjectDir as unknown as ReturnType<
  typeof vi.fn
>;
const applyObjectiveProposalMock =
  applyObjectiveProposal as unknown as ReturnType<typeof vi.fn>;
const applyPhasesProposalMock = applyPhasesProposal as unknown as ReturnType<
  typeof vi.fn
>;
const applyTopicsProposalMock = applyTopicsProposal as unknown as ReturnType<
  typeof vi.fn
>;
const applyContentStructureProposalMock =
  applyContentStructureProposal as unknown as ReturnType<typeof vi.fn>;
const applyEditCopyProposalMock =
  applyEditCopyProposal as unknown as ReturnType<typeof vi.fn>;
const findLockedStructureMock = findLockedStructure as unknown as ReturnType<
  typeof vi.fn
>;
const applyBuildProposalMock = applyBuildProposal as unknown as ReturnType<
  typeof vi.fn
>;

const slug = "test-project";

describe("designApproveCommand", () => {
  let errorSpy: ReturnType<typeof vi.fn>;
  let exitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    existsSyncMock.mockReset().mockReturnValue(true);
    readFileSyncMock.mockReset();
    unlinkSyncMock.mockReset();
    readDesignDataMock.mockReset();
    readProjectDataMock.mockReset();
    applyObjectiveProposalMock.mockReset();
    applyPhasesProposalMock.mockReset();
    applyTopicsProposalMock.mockReset();
    applyContentStructureProposalMock.mockReset();
    applyEditCopyProposalMock.mockReset();
    findLockedStructureMock.mockReset();
    applyBuildProposalMock.mockReset();
    errorSpy = vi
      .spyOn(console, "error")
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
    exitSpy.mockRestore();
  });

  it("validates the project directory first", async () => {
    readDesignDataMock.mockReturnValue({ phases: [] });
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ proposal: [], generatedBy: "claude" }),
    );
    await designApproveCommand(slug, "phases");
    expect(requireProjectDirMock).toHaveBeenCalledWith(slug);
  });

  it("rejects an unknown stage", async () => {
    await expect(
      designApproveCommand(slug, "not-a-real-stage"),
    ).rejects.toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown stage "not-a-real-stage"'),
    );
  });

  it("errors when no pending candidate file exists", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(designApproveCommand(slug, "phases")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No pending phases candidate"),
    );
  });

  it("approves an objective candidate using the raw project data", async () => {
    const project = { slug, objective: "raw objective" };
    readProjectDataMock.mockReturnValue(project);
    const proposal = {
      businessOutcome: "grow follows",
      narrativeDirection: "escalate",
      campaignShape: "7 days",
    };
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ proposal, generatedBy: "claude" }),
    );

    await designApproveCommand(slug, "objective");

    expect(applyObjectiveProposalMock).toHaveBeenCalledWith(
      slug,
      project,
      proposal,
    );
    expect(unlinkSyncMock).toHaveBeenCalledWith(
      pendingCandidatePath(slug, "objective"),
    );
  });

  it("approves a phases candidate: applies and deletes the pending file", async () => {
    const design = { phases: [] };
    readDesignDataMock.mockReturnValue(design);
    const proposal = [{ id: "p1", name: "Phase 1", goal: "g" }];
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ proposal, generatedBy: "claude", generatedAt: "t" }),
    );

    await designApproveCommand(slug, "phases");

    expect(applyPhasesProposalMock).toHaveBeenCalledWith(
      slug,
      proposal,
      design,
    );
    expect(unlinkSyncMock).toHaveBeenCalledWith(
      pendingCandidatePath(slug, "phases"),
    );
  });

  it("errors approving topics with no design.json yet", async () => {
    readDesignDataMock.mockReturnValue(null);
    await expect(designApproveCommand(slug, "topics")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(applyTopicsProposalMock).not.toHaveBeenCalled();
  });

  it("approves a topics candidate", async () => {
    const design = { phases: [{ id: "p1", name: "P1", goal: "g" }] };
    readDesignDataMock.mockReturnValue(design);
    const proposal = [{ phaseId: "p1", topics: [] }];
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ proposal, generatedBy: "codex" }),
    );

    await designApproveCommand(slug, "topics");

    expect(applyTopicsProposalMock).toHaveBeenCalledWith(
      slug,
      design,
      proposal,
    );
  });

  it("approves a content-structure candidate with project + design", async () => {
    const design = { phases: [] };
    const project = { slug, template: "default" };
    readDesignDataMock.mockReturnValue(design);
    readProjectDataMock.mockReturnValue(project);
    const proposal = {
      templateDecision: { action: "reuse", templateSlug: "default", reasoning: "r" },
      contentStructuresByTopic: [],
    };
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ proposal, generatedBy: "claude" }),
    );

    await designApproveCommand(slug, "content-structure");

    expect(applyContentStructureProposalMock).toHaveBeenCalledWith(
      slug,
      design,
      project,
      proposal,
      "claude",
    );
  });

  it("requires --topic for edit-copy approval", async () => {
    await expect(designApproveCommand(slug, "edit-copy")).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("needs --topic"),
    );
  });

  it("approves an edit-copy candidate using the locked structure", async () => {
    const design = { phases: [] };
    const structure = { variant: "a", hook: "h", bridge: "b", content: "c", cta: "cta" };
    readDesignDataMock.mockReturnValue(design);
    findLockedStructureMock.mockReturnValue({
      topic: { id: "topic-a", title: "T" },
      structure,
    });
    const proposal = { editCopy: { sourceVideo: "v.mp4", rows: [] } };
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ proposal, generatedBy: "codex" }),
    );

    await designApproveCommand(slug, "edit-copy", "topic-a");

    expect(findLockedStructureMock).toHaveBeenCalledWith(
      design,
      slug,
      "topic-a",
    );
    expect(applyEditCopyProposalMock).toHaveBeenCalledWith(
      slug,
      design,
      structure,
      "topic-a",
      proposal,
      "codex",
    );
  });

  it("requires --topic for build approval", async () => {
    await expect(designApproveCommand(slug, "build")).rejects.toThrow(
      "process.exit(1)",
    );
  });

  it("approves a build candidate using the locked structure", async () => {
    const design = { phases: [] };
    const structure = { variant: "a", hook: "h", bridge: "b", content: "c", cta: "cta" };
    readDesignDataMock.mockReturnValue(design);
    findLockedStructureMock.mockReturnValue({
      topic: { id: "topic-a", title: "T" },
      structure,
    });
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
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ proposal, generatedBy: "claude" }),
    );

    await designApproveCommand(slug, "build", "topic-a");

    expect(applyBuildProposalMock).toHaveBeenCalledWith(
      slug,
      design,
      structure,
      "topic-a",
      proposal,
      "claude",
    );
    expect(unlinkSyncMock).toHaveBeenCalledWith(
      pendingCandidatePath(slug, "build", "topic-a"),
    );
  });
});
