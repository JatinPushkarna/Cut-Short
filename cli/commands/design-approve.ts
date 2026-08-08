import fs from "node:fs";
import { readDesignData, type Phase } from "../lib/design";
import type { AgentName } from "../lib/agent/types";
import {
  pendingCandidatePath,
  readProjectData,
  requireProjectDir,
} from "../lib/project";
import { applyPhasesProposal } from "./design-phases";
import { applyTopicsProposal, type TopicsByPhase } from "./design-topics";
import {
  applyContentStructureProposal,
  type ContentStructureProposal,
} from "./design-content-structure";
import {
  applyEditCopyProposal,
  findLockedStructure,
  type EditCopyProposal,
} from "./design-edit-copy";
import { applyBuildProposal, type BuildProposal } from "./design-build";

export const APPROVABLE_STAGES = [
  "phases",
  "topics",
  "content-structure",
  "edit-copy",
  "build",
] as const;
export type ApprovableStage = (typeof APPROVABLE_STAGES)[number];

export function isApprovableStage(value: string): value is ApprovableStage {
  return (APPROVABLE_STAGES as readonly string[]).includes(value);
}

// Mirrors the shape reviewLoop's non-interactive branch writes -- see
// review-loop.ts. Never written or read anywhere else.
type PendingCandidate<T> = {
  proposal: T;
  generatedBy: AgentName;
  generatedAt: string;
};

function readPending<T>(pendingPath: string): PendingCandidate<T> {
  return JSON.parse(fs.readFileSync(pendingPath, "utf-8")) as PendingCandidate<T>;
}

// The other half of reviewLoop's non-interactive path: turns a candidate
// that a stage command generated but couldn't save (no TTY to click
// "Approve" with) into a real, saved Campaign/design.json record -- the
// exact same save logic a human's "Approve" keystroke would have run,
// just triggered by this command instead. Nothing here re-runs the LLM or
// re-verifies anything; it trusts the pending candidate was already
// reviewed by whoever is now approving it.
export async function designApproveCommand(
  slug: string,
  stage: string,
  topicId?: string,
): Promise<void> {
  requireProjectDir(slug);

  if (!isApprovableStage(stage)) {
    console.error(
      `\nUnknown stage "${stage}" -- must be one of: ${APPROVABLE_STAGES.join(", ")}`,
    );
    process.exit(1);
  }

  const pendingPath = pendingCandidatePath(slug, stage, topicId);
  if (!fs.existsSync(pendingPath)) {
    console.error(
      `\nNo pending ${stage} candidate found for ${slug}` +
        `${topicId ? ` (topic "${topicId}")` : ""} -- run ` +
        `\`cutshort design ${stage} ${slug}${topicId ? ` --topic ${topicId}` : ""}\` first.`,
    );
    process.exit(1);
  }

  const design = readDesignData(slug);

  switch (stage) {
    case "phases": {
      const pending = readPending<Phase[]>(pendingPath);
      applyPhasesProposal(slug, pending.proposal, design);
      break;
    }
    case "topics": {
      if (!design) {
        console.error(`\nNo Campaign/design.json for ${slug}.`);
        process.exit(1);
      }
      const pending = readPending<TopicsByPhase>(pendingPath);
      applyTopicsProposal(slug, design, pending.proposal);
      break;
    }
    case "content-structure": {
      if (!design) {
        console.error(`\nNo Campaign/design.json for ${slug}.`);
        process.exit(1);
      }
      const project = readProjectData(slug);
      const pending = readPending<ContentStructureProposal>(pendingPath);
      applyContentStructureProposal(
        slug,
        design,
        project,
        pending.proposal,
        pending.generatedBy,
      );
      break;
    }
    case "edit-copy": {
      if (!topicId) {
        console.error(`\n\`design approve --stage edit-copy\` needs --topic <id>.`);
        process.exit(1);
      }
      const { structure } = findLockedStructure(design, slug, topicId);
      const pending = readPending<EditCopyProposal>(pendingPath);
      applyEditCopyProposal(
        slug,
        design!,
        structure,
        topicId,
        pending.proposal,
        pending.generatedBy,
      );
      break;
    }
    case "build": {
      if (!topicId) {
        console.error(`\n\`design approve --stage build\` needs --topic <id>.`);
        process.exit(1);
      }
      const { structure } = findLockedStructure(design, slug, topicId);
      const pending = readPending<BuildProposal>(pendingPath);
      applyBuildProposal(
        slug,
        design!,
        structure,
        topicId,
        pending.proposal,
        pending.generatedBy,
      );
      break;
    }
  }

  fs.unlinkSync(pendingPath);
}
