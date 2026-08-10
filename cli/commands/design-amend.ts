import fs from "node:fs";
import path from "node:path";
import type { AgentName } from "../lib/agent/types";
import { pendingCandidatePath, requireProjectDir } from "../lib/project";
import { APPROVABLE_STAGES, isApprovableStage } from "./design-approve";

// Same wrapper shape reviewLoop's non-interactive branch writes -- see
// review-loop.ts. Writing this exact shape means `design approve` needs
// zero changes to consume an amended candidate; it can't tell the
// difference between "an agent generated this" and "this was transcribed
// exactly as already-known text," which is the point -- the save path is
// identical either way.
type PendingCandidate<T> = {
  proposal: T;
  generatedBy: AgentName;
  generatedAt: string;
};

// Deliberately light checks, not a full schema validator -- enough to
// catch a malformed or wrong-stage file before it gets treated as a real
// candidate, not an exhaustive guarantee every nested field is well-formed.
function validate(stage: string, proposal: unknown): string | null {
  const obj = proposal as Record<string, unknown> | unknown[] | null;

  switch (stage) {
    case "objective": {
      const o = obj as Record<string, unknown>;
      for (const field of ["businessOutcome", "narrativeDirection", "campaignShape"]) {
        if (typeof o?.[field] !== "string") {
          return `"${field}" must be a string`;
        }
      }
      for (const field of ["distributionAdvantage", "creativeExclusions"]) {
        if (o?.[field] !== undefined && typeof o[field] !== "string") {
          return `"${field}" must be a string when present`;
        }
      }
      if (o?.openQuestions !== undefined && !Array.isArray(o.openQuestions)) {
        return `"openQuestions" must be an array when present`;
      }
      return null;
    }

    case "phases":
      if (!Array.isArray(obj)) return "expected a JSON array of phases";
      for (const p of obj) {
        const phase = p as Record<string, unknown>;
        if (typeof phase.id !== "string" || typeof phase.name !== "string" || typeof phase.goal !== "string") {
          return `every phase needs string "id", "name", and "goal" -- got ${JSON.stringify(p)}`;
        }
      }
      return null;

    case "topics":
      if (!Array.isArray(obj)) return "expected a JSON array of { phaseId, topics }";
      for (const entry of obj) {
        const e = entry as Record<string, unknown>;
        if (typeof e.phaseId !== "string" || !Array.isArray(e.topics)) {
          return `every entry needs a string "phaseId" and a "topics" array -- got ${JSON.stringify(entry)}`;
        }
      }
      return null;

    case "content-structure": {
      const o = obj as Record<string, unknown>;
      if (!o || typeof o !== "object" || Array.isArray(o)) {
        return `expected an object with "templateDecision" and "contentStructuresByTopic"`;
      }
      const td = o.templateDecision as Record<string, unknown> | undefined;
      if (!td || typeof td.action !== "string" || typeof td.templateSlug !== "string") {
        return `"templateDecision" needs at least "action" and "templateSlug"`;
      }
      if (!Array.isArray(o.contentStructuresByTopic)) {
        return `"contentStructuresByTopic" must be an array`;
      }
      for (const entry of o.contentStructuresByTopic as unknown[]) {
        const e = entry as Record<string, unknown>;
        if (typeof e.topicId !== "string" || !Array.isArray(e.contentStructures)) {
          return `every contentStructuresByTopic entry needs "topicId" and a "contentStructures" array -- got ${JSON.stringify(entry)}`;
        }
        for (const s of e.contentStructures as unknown[]) {
          const structure = s as Record<string, unknown>;
          for (const field of ["variant", "hook", "content", "cta"]) {
            if (typeof structure[field] !== "string") {
              return `every content structure needs a string "${field}" -- got ${JSON.stringify(s)}`;
            }
          }
          if (
            structure.bridge !== undefined &&
            typeof structure.bridge !== "string"
          ) {
            return `content structure "bridge" must be a string when present -- got ${JSON.stringify(s)}`;
          }
        }
      }
      return null;
    }

    case "edit-copy": {
      const o = obj as Record<string, unknown>;
      const ec = o?.editCopy as Record<string, unknown> | undefined;
      if (!ec || typeof ec.sourceVideo !== "string" || !Array.isArray(ec.rows)) {
        return `expected { "editCopy": { "sourceVideo": string, "rows": [...] } }`;
      }
      for (const r of ec.rows as unknown[]) {
        const row = r as Record<string, unknown>;
        if (typeof row.timestamp !== "string" || typeof row.action !== "string") {
          return `every editCopy row needs a string "timestamp" and "action" -- got ${JSON.stringify(r)}`;
        }
      }
      return null;
    }

    case "build": {
      const o = obj as Record<string, unknown>;
      for (const field of ["compositionFile", "extractedClip"]) {
        if (typeof o?.[field] !== "string") {
          return `"${field}" must be a string`;
        }
      }
      if (o?.hookStill !== null && typeof o?.hookStill !== "string") {
        return `"hookStill" must be a string or null`;
      }
      if (!o?.selfVerification || typeof o.selfVerification !== "object") {
        return `"selfVerification" is required (resolutionMatches/durationMatches/filesExist/rootRegistered/notes)`;
      }
      return null;
    }

    default:
      return `unknown stage "${stage}"`;
  }
}

// The other way (besides an LLM generating one) a pending candidate gets
// created: you already know the exact final content -- it was drafted and
// approved in an earlier conversation, say -- and there's nothing left to
// invent. Paying for a fresh agent call to reproduce text that's already
// fully decided is pure waste; this writes it directly as a pending
// candidate, same as if an agent had just generated it, so `design
// approve` picks it up identically either way.
export function designAmendCommand(
  slug: string,
  stage: string,
  inputPath: string,
  topicId: string | undefined,
  agent: AgentName,
): void {
  requireProjectDir(slug);

  if (!isApprovableStage(stage)) {
    console.error(
      `\nUnknown stage "${stage}" -- must be one of: ${APPROVABLE_STAGES.join(", ")}`,
    );
    process.exit(1);
  }

  if ((stage === "edit-copy" || stage === "build") && !topicId) {
    console.error(`\n\`design amend --stage ${stage}\` needs --topic <id>.`);
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`\nNo file found at ${inputPath}.`);
    process.exit(1);
  }

  let proposal: unknown;
  try {
    proposal = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  } catch (error) {
    console.error(
      `\n${inputPath} isn't valid JSON: ${(error as Error).message}`,
    );
    process.exit(1);
  }

  const problem = validate(stage, proposal);
  if (problem) {
    console.error(`\n${inputPath} doesn't match what "${stage}" expects: ${problem}`);
    process.exit(1);
  }

  const pendingPath = pendingCandidatePath(slug, stage, topicId);
  const pending: PendingCandidate<unknown> = {
    proposal,
    generatedBy: agent,
    generatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(pendingPath), { recursive: true });
  fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));

  console.log(`\nSaved as a pending ${stage} candidate -- no agent call made.`);
  console.log(
    `To approve:  cutshort design approve ${slug} --stage ${stage}${topicId ? ` --topic ${topicId}` : ""}`,
  );
}
