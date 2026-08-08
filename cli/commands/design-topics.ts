import {
  hasContentStructures,
  readDesignData,
  saveDesignData,
  type DesignData,
  type Phase,
} from "../lib/design";
import { groundingInstructions } from "../lib/grounding-prompt";
import { runAgentTaskJson } from "../lib/agent/runner";
import type { AgentName } from "../lib/agent/types";
import {
  pendingCandidatePath,
  projectDir,
  requireProjectDir,
} from "../lib/project";
import { reviewLoop } from "../lib/review-loop";

function buildPrompt(phases: Phase[], feedback?: string): string {
  const lines: string[] = [];
  lines.push(
    "You are proposing topics for an already-approved campaign phase schedule.",
  );
  lines.push("");
  lines.push(
    "The approved phases below were saved to Campaign/design.json in the " +
      "project directory (the persistent, per-project record) after a human " +
      "approval step. Approved phases:",
  );
  lines.push(
    JSON.stringify(
      phases.map(({ id, name, goal }) => ({ id, name, goal })),
      null,
      2,
    ),
  );
  lines.push("");
  lines.push(
    "Read Campaign/objective.md (target audience, objective, platforms) and, " +
      "if present, the Script/ screenplay and SRT/ transcript in the project " +
      "directory for material to draw topics from.",
  );
  lines.push("");
  lines.push(groundingInstructions());
  lines.push("");
  lines.push(
    "For each phase, propose several concrete topic ideas a single post could " +
      "be built around (a specific moment, angle, or claim -- not a vague theme).",
  );
  lines.push("");
  lines.push(
    "For each topic, also include a 'reasoning' field: specifically how/why " +
      "THIS topic serves its phase's stated goal -- not a restatement of the " +
      "goal itself. This makes the logic visible to a human reviewing it, and " +
      "keeps later stages (content-structure, eventually scan/build) aligned " +
      "with why a topic was picked, not just what it is.",
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
  lines.push(
    `[{ "phaseId": string, "topics": [{ "id": string, "title": string, "description": string, "reasoning": string }] }]`,
  );
  return lines.join("\n");
}

export type TopicsByPhase = {
  phaseId: string;
  topics: {
    id: string;
    title: string;
    description: string;
    reasoning: string;
  }[];
}[];

function render(byPhase: TopicsByPhase): string {
  return byPhase
    .map(
      (entry) =>
        `${entry.phaseId}:\n` +
        entry.topics
          .map(
            (t) =>
              `  - ${t.id}: ${t.title}\n    ${t.description}\n    why: ${t.reasoning}`,
          )
          .join("\n"),
    )
    .join("\n\n");
}

// The save step -- identical whether topicsByPhase came from a human
// approving the interactive menu or from `cutshort design approve` reading
// back a non-interactive candidate. Exported so design-approve.ts can call it.
export function applyTopicsProposal(
  slug: string,
  design: DesignData,
  topicsByPhase: TopicsByPhase,
): void {
  const contentStructuresExisted = hasContentStructures(design);

  const byId = new Map(
    topicsByPhase.map((entry) => [entry.phaseId, entry.topics]),
  );
  for (const phase of design.phases) {
    const topics = byId.get(phase.id);
    if (topics) {
      phase.topics = topics.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        reasoning: t.reasoning,
      }));
    }
  }

  if (contentStructuresExisted) {
    console.log(
      "\nWarning: this project already had content structure variants built on the previous topics -- " +
        "re-running `design content-structure` is recommended before continuing.",
    );
  }

  saveDesignData(slug, design);
  console.log(`\nSaved topics to Campaign/design.json and Campaign/design.md`);
  console.log(
    `\nNext: run \`npm run cutshort -- design content-structure ${slug}\`\n`,
  );
}

export async function designTopicsCommand(
  slug: string,
  agent: AgentName = "claude",
  feedback?: string,
): Promise<void> {
  requireProjectDir(slug);
  const design = readDesignData(slug);

  if (!design?.phases?.length) {
    console.error(
      `\nNo phases found for ${slug} -- run \`cutshort design phases ${slug}\` first.`,
    );
    process.exit(1);
  }

  const topicsByPhase = await reviewLoop(
    (feedback) =>
      runAgentTaskJson<TopicsByPhase>(
        buildPrompt(design.phases, feedback),
        projectDir(slug),
        agent,
      ),
    render,
    {
      agent,
      pendingPath: pendingCandidatePath(slug, "topics"),
      approveCommand: `cutshort design approve ${slug} --stage topics`,
      initialFeedback: feedback,
    },
  );

  applyTopicsProposal(slug, design, topicsByPhase);
}
