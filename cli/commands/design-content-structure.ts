import { formatContent, readDesignData, saveDesignData, type ContentStructure, type Phase } from "../lib/design";
import { groundingInstructions } from "../lib/grounding-prompt";
import { runClaudeTaskJson } from "../lib/claude-task";
import { projectDir, requireProjectDir } from "../lib/project";
import { reviewLoop } from "../lib/review-loop";

function buildPrompt(phases: Phase[], feedback?: string): string {
  const phasesWithTopics = phases.map(({ id, name, goal, topics }) => ({
    phaseId: id,
    phaseName: name,
    phaseGoal: goal,
    topics: (topics ?? []).map(({ id: topicId, title, description, reasoning }) => ({
      id: topicId,
      title,
      description,
      reasoning,
    })),
  }));

  const lines: string[] = [];
  lines.push("You are proposing content structure variants for a set of already-approved campaign topics.");
  lines.push("");
  lines.push(
    "The approved phases and topics below were saved to Campaign/design.json in " +
      "the project directory (the persistent, per-project record) after a human " +
      "approval step. Each topic's 'reasoning' field explains specifically why " +
      "it was chosen for its phase -- carry that intent forward into the " +
      "structure variants you propose, don't just work from the title/" +
      "description in isolation. Approved phases and topics:"
  );
  lines.push(JSON.stringify(phasesWithTopics, null, 2));
  lines.push("");
  lines.push("Read Campaign/objective.md (target audience, objective, platforms) in the project directory.");
  lines.push("");
  lines.push(groundingInstructions());
  lines.push("");
  lines.push(
    "For each topic, propose 2-3 DIFFERENT content structure variants -- each a " +
      "full hook/bridge/content/cta breakdown. These are explicitly meant as " +
      "experiments to test against the audience (different hook framings, " +
      "different misdirects), not near-duplicates of each other."
  );
  lines.push("");
  lines.push(
    "The 'content' field must be the literal, real dialogue from the SRT " +
      "transcript -- formatted like a script excerpt, speaker name (cross-" +
      "referenced from the Script) followed by their exact real line, one per " +
      "line, e.g.:"
  );
  lines.push(
    "SPEAKER_A: <their exact real line from the SRT>\n" +
      "SPEAKER_B: <their exact real line from the SRT>\n" +
      "SPEAKER_A: <their exact real line from the SRT>"
  );
  lines.push(
    "Not a description of the scene -- the actual quoted lines, verbatim, in " +
      "order, no timestamps. If no real dialogue in the SRT fits this topic, set " +
      "content to 'NO MATCHING DIALOGUE FOUND in transcript' instead of " +
      "inventing lines."
  );
  if (feedback) {
    lines.push("");
    lines.push(`Revise your previous proposal based on this feedback: ${feedback}`);
  }
  lines.push("");
  lines.push(
    "Respond with ONLY a JSON array, no markdown fences, no commentary, matching:"
  );
  lines.push(
    `[{ "topicId": string, "contentStructures": [{ "variant": string, "hook": string, "bridge": string, "content": string, "cta": string }] }]`
  );
  return lines.join("\n");
}

type ContentStructuresByTopic = { topicId: string; contentStructures: ContentStructure[] }[];

function render(byTopic: ContentStructuresByTopic): string {
  return byTopic
    .map(
      (entry) =>
        `${entry.topicId}:\n` +
        entry.contentStructures
          .map(
            (s) =>
              `  [${s.variant}] hook: ${s.hook}\n` +
              `        bridge: ${s.bridge}\n` +
              `        content: ${formatContent(s.content)}\n` +
              `        cta: ${s.cta}`
          )
          .join("\n\n")
    )
    .join("\n\n");
}

export async function designContentStructureCommand(slug: string): Promise<void> {
  requireProjectDir(slug);
  const design = readDesignData(slug);

  const hasAnyTopics = design?.phases?.some((phase) => (phase.topics?.length ?? 0) > 0);
  if (!hasAnyTopics) {
    console.error(`\nNo topics found for ${slug} -- run \`cutshort design topics ${slug}\` first.`);
    process.exit(1);
  }

  const contentStructuresByTopic = await reviewLoop(
    (feedback) => runClaudeTaskJson<ContentStructuresByTopic>(buildPrompt(design!.phases, feedback), projectDir(slug)),
    render
  );

  const byId = new Map(contentStructuresByTopic.map((entry) => [entry.topicId, entry.contentStructures]));
  for (const phase of design!.phases) {
    for (const topic of phase.topics ?? []) {
      const contentStructures = byId.get(topic.id);
      if (contentStructures) {
        topic.contentStructures = contentStructures;
      }
    }
  }

  saveDesignData(slug, design!);
  console.log(`\nSaved content structures to Campaign/design.json and Campaign/design.md`);
  console.log(`\nNext: run \`npm run cutshort -- scan ${slug}\`\n`);
}
