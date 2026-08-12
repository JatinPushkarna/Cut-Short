import { runAgentTaskJson } from "../lib/agent/runner";
import type { AgentName, AgentRunOptions } from "../lib/agent/types";
import {
  hasTopics,
  readDesignData,
  saveDesignData,
  type DesignData,
  type Phase,
} from "../lib/design";
import {
  pendingCandidatePath,
  projectDir,
  readProjectData,
  requireProjectDir,
} from "../lib/project";
import { reviewLoop } from "../lib/review-loop";
import { designTopicsCommand } from "./design-topics";

function buildPrompt(
  objective: string,
  targetAudience: string,
  platforms: string[],
  campaignDays: number | null,
  feedback?: string,
): string {
  const lines: string[] = [];
  lines.push(
    "You are designing the high-level structure of a social media promo campaign.",
  );
  lines.push(`Objective: ${objective}`);
  lines.push(`Target audience: ${targetAudience}`);
  lines.push(`Platforms: ${platforms.join(", ")}`);
  if (campaignDays) {
    lines.push(`Campaign length: ${campaignDays} days`);
  }
  lines.push("");
  lines.push(
    "Read Campaign/objective.md in the project directory for full context. " +
      "If a Script/ folder has a screenplay, read it too -- it tells you what " +
      "story material is actually available to build a campaign around.",
  );
  lines.push("");
  lines.push(
    "Propose a high-level campaign schedule broken into phases (e.g. an " +
      "awareness phase, a build-up phase, a pre-release phase, a release " +
      "phase -- adapt names/count to what actually fits this campaign and " +
      "audience).",
  );
  if (feedback) {
    lines.push("");
    lines.push(
      `Revise your previous proposal based on this feedback: ${feedback}`,
    );
  }
  lines.push("");
  lines.push(
    "Respond with ONLY a JSON array, no markdown fences, no commentary, matching:",
  );
  lines.push(`[{ "id": string, "name": string, "goal": string }]`);
  return lines.join("\n");
}

function render(phases: Phase[]): string {
  return phases
    .map((p) => `${p.id}: ${p.name}\n  goal: ${p.goal}`)
    .join("\n\n");
}

// The save step -- identical whether the phases came from a human approving
// the interactive menu or from `cutshort design approve` reading back a
// non-interactive candidate. Exported so design-approve.ts can call it.
export async function applyPhasesProposal(
  slug: string,
  phases: Phase[],
  existing: DesignData | null,
): Promise<void> {
  const alreadyHasTopics = hasTopics(existing);
  if (alreadyHasTopics) {
    console.log(
      "\nWarning: this project already has topics/content structures built on the previous phases -- " +
        "re-running `design topics` is recommended before continuing.",
    );
  }

  saveDesignData(slug, { phases });
  console.log(
    `\nSaved ${phases.length} phase(s) to Campaign/design.json and Campaign/design.md`,
  );

  // Never auto-clobber topics/content-structure/etc. that already exist on
  // an earlier phase set -- the warning above already told the human that.
  if (alreadyHasTopics) {
    console.log(
      `\nNot auto-continuing -- run \`cutshort design topics ${slug}\` yourself when ready.\n`,
    );
    return;
  }
  console.log(`\nStarting design topics automatically...\n`);
  await designTopicsCommand(slug);
}

export async function designPhasesCommand(
  slug: string,
  agent: AgentName = "claude",
  feedback?: string,
  agentOptions?: AgentRunOptions,
): Promise<void> {
  requireProjectDir(slug);
  const project = readProjectData(slug);

  if (!project.campaignShape) {
    console.error(
      `\nNo objective brief found for ${slug} -- run \`cutshort design objective ${slug}\` first.`,
    );
    process.exit(1);
  }

  const existing = readDesignData(slug);

  const phases = await reviewLoop(
    (feedback) =>
      runAgentTaskJson<Phase[]>(
        buildPrompt(
          project.objective,
          project.targetAudience,
          project.platforms,
          project.campaignDays,
          feedback,
        ),
        projectDir(slug),
        agent,
        agentOptions,
      ),
    render,
    {
      agent,
      pendingPath: pendingCandidatePath(slug, "phases"),
      approveCommand: `cutshort design approve ${slug} --stage phases`,
      initialFeedback: feedback,
    },
  );

  await applyPhasesProposal(slug, phases, existing);
}
