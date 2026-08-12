import fs from "node:fs";
import { objectiveMdPath, renderObjectiveMd } from "../lib/objective";
import { readDesignData } from "../lib/design";
import { runAgentTaskJson } from "../lib/agent/runner";
import type { AgentName, AgentRunOptions } from "../lib/agent/types";
import {
  listOtherProjects,
  pendingCandidatePath,
  projectDir,
  readProjectData,
  requireProjectDir,
  writeProjectData,
  type ProjectData,
} from "../lib/project";
import { reviewLoop } from "../lib/review-loop";
import { designPhasesCommand } from "./design-phases";

export type ObjectiveProposal = {
  businessOutcome: string;
  narrativeDirection: string;
  distributionAdvantage?: string;
  creativeExclusions?: string;
  campaignShape: string;
  // Which of the "other projects" candidates the agent itself determined
  // use the same source footage -- not something the human declares.
  relatedProjects?: string[];
  openQuestions?: string[];
};

export function buildPrompt(
  project: ProjectData,
  otherProjects: Pick<
    ProjectData,
    "slug" | "videoPath" | "fileDescription" | "objective"
  >[],
  feedback?: string,
): string {
  const lines: string[] = [];
  lines.push(
    "You are drafting a structured campaign objective brief for a social media promo " +
      "campaign, from the raw answers collected at project setup.",
  );
  lines.push("");
  lines.push("Raw setup answers:");
  lines.push(
    JSON.stringify(
      {
        objective: project.objective,
        targetAudience: project.targetAudience,
        fileDescription: project.fileDescription,
        platforms: project.platforms,
        campaignDays: project.campaignDays,
        videoPath: project.videoPath,
      },
      null,
      2,
    ),
  );
  lines.push("");
  if (project.scriptPath) {
    lines.push(`Read the script at ${project.scriptPath} for real story material.`);
  }
  lines.push(
    `Read public/Projects/${project.slug}/SRT/ if a transcript exists yet -- if not, work ` +
      "from the script/raw answers alone, that's a normal state this early.",
  );
  lines.push("");
  lines.push(
    "Determine for yourself whether this campaign builds on a prior one using the SAME " +
      "source footage -- do NOT ask the human. Here are the other projects that already " +
      "exist in this tool:",
  );
  lines.push(
    otherProjects.length === 0
      ? "(none -- this is the only project that exists)"
      : JSON.stringify(otherProjects, null, 2),
  );
  lines.push(
    "For each one, judge relatedness from videoPath (exact match, or plausibly a trimmed/" +
      "re-exported copy of the same underlying film/video) and fileDescription (same story/" +
      "subject). If none match, this is the first campaign for this source -- leave " +
      "relatedProjects empty and creativeExclusions covers only hard creative no-gos genuinely " +
      "implied by the raw answers above, or is omitted if there are none. If one or more " +
      "match, list their slugs in relatedProjects, then actually READ each match's " +
      `public/Projects/<slug>/Campaign/objective.md and public/Projects/<slug>/Campaign/` +
      "design.json (design.json has the real locked hook/bridge/content/reveal per topic) " +
      "before drafting creativeExclusions -- name the specific scenes/dialogue already used " +
      "so new topics don't repeat them. Don't guess at what a related campaign covered; read it.",
  );
  lines.push("");
  lines.push(
    "Fill in this template. For any section you can confidently infer or derive from the " +
      "material above, write it out in full -- don't ask the human to do work you can already " +
      "do. For anything you genuinely can't determine (a real creative decision only the human " +
      "can make -- an exact post-count allocation, a hard exclusion you have no evidence for), " +
      "don't guess silently: add a specific question to openQuestions instead.",
  );
  lines.push("");
  lines.push(
    "- businessOutcome: the concrete outcome this campaign should produce -- growth metric, " +
      "conversion action, timing/deadline urgency. Expand the raw objective above, don't just repeat it.",
  );
  lines.push(
    "- narrativeDirection: the emotional/story arc across the campaign -- what escalates, what throughline stays constant.",
  );
  lines.push(
    "- distributionAdvantage: who/what can amplify this beyond the official account (cast, " +
      "creators, cross-promotion), and the constraint that content must still work without them. " +
      "Omit entirely if nothing like this is available.",
  );
  lines.push(
    "- creativeExclusions: already-covered material from related campaigns (see above) plus any " +
      "hard creative no-gos implied by the raw answers. Omit entirely if genuinely nothing to exclude.",
  );
  lines.push(
    "- campaignShape: exact post allocation and escalation order, if the material above actually " +
      "supports being specific -- otherwise a looser structural guideline, with an openQuestions " +
      "entry asking the human to confirm the exact shape.",
  );
  lines.push(
    "- relatedProjects: slugs of the other projects you determined are genuinely related, or omit if none.",
  );
  if (feedback) {
    lines.push("");
    lines.push(`Revise your previous proposal based on this feedback: ${feedback}`);
  }
  lines.push("");
  lines.push(
    "Respond with ONLY a JSON object, no markdown fences, no commentary, matching:",
  );
  lines.push(
    `{
  "businessOutcome": string,
  "narrativeDirection": string,
  "distributionAdvantage": string,
  "creativeExclusions": string,
  "campaignShape": string,
  "relatedProjects": string[],
  "openQuestions": string[]
}`,
  );
  return lines.join("\n");
}

function render(proposal: ObjectiveProposal): string {
  const lines = [
    `Business Outcome: ${proposal.businessOutcome}`,
    `Narrative Direction: ${proposal.narrativeDirection}`,
    `Distribution Advantage: ${proposal.distributionAdvantage ?? "(none)"}`,
    `Related Campaigns: ${proposal.relatedProjects?.length ? proposal.relatedProjects.join(", ") : "(none -- first campaign for this source)"}`,
    `Creative Exclusions: ${proposal.creativeExclusions ?? "(none)"}`,
    `Campaign Shape: ${proposal.campaignShape}`,
  ];
  if (proposal.openQuestions && proposal.openQuestions.length > 0) {
    lines.push("Open Questions:");
    for (const q of proposal.openQuestions) {
      lines.push(`  - ${q}`);
    }
  }
  return lines.join("\n");
}

// The save step -- identical whether the proposal came from a human
// approving the interactive menu or from `cutshort design approve` reading
// back a non-interactive candidate. Exported so design-approve.ts can call
// it. This stage is REQUIRED: design-phases.ts refuses to run until
// campaignShape is set, which only happens here.
export async function applyObjectiveProposal(
  slug: string,
  project: ProjectData,
  proposal: ObjectiveProposal,
): Promise<void> {
  const updated: ProjectData = {
    ...project,
    // Overwrites the raw setup answer in place, not a separate field --
    // every existing prompt that already reads project.objective (e.g.
    // design-phases.ts) picks up the enriched version for free.
    objective: proposal.businessOutcome,
    narrativeDirection: proposal.narrativeDirection,
    distributionAdvantage: proposal.distributionAdvantage,
    creativeExclusions: proposal.creativeExclusions,
    campaignShape: proposal.campaignShape,
    relatedProjects: proposal.relatedProjects,
    openQuestions: proposal.openQuestions,
  };
  writeProjectData(slug, updated);
  fs.writeFileSync(objectiveMdPath(slug), renderObjectiveMd(updated));

  console.log(`\nSaved to Campaign/project.json and Campaign/objective.md`);

  // Only auto-continue into phases if nothing downstream exists yet -- never
  // clobber phases/topics/etc. that were already built on an earlier
  // objective (e.g. this was a re-approval after --feedback).
  const design = readDesignData(slug);
  if (design?.phases?.length) {
    console.log(
      `\nPhases already exist for ${slug} -- not auto-continuing. Run ` +
        `\`cutshort design phases ${slug}\` yourself if you want to redo them.\n`,
    );
    return;
  }
  console.log(`\nStarting design phases automatically...\n`);
  await designPhasesCommand(slug);
}

export async function designObjectiveCommand(
  slug: string,
  agent: AgentName = "claude",
  feedback?: string,
  agentOptions?: AgentRunOptions,
): Promise<void> {
  requireProjectDir(slug);
  const project = readProjectData(slug);
  const otherProjects = listOtherProjects(slug);

  const proposal = await reviewLoop(
    (feedback) =>
      runAgentTaskJson<ObjectiveProposal>(
        buildPrompt(project, otherProjects, feedback),
        projectDir(slug),
        agent,
        agentOptions,
      ),
    render,
    {
      agent,
      pendingPath: pendingCandidatePath(slug, "objective"),
      approveCommand: `cutshort design approve ${slug} --stage objective`,
      initialFeedback: feedback,
    },
  );

  await applyObjectiveProposal(slug, project, proposal);
}
