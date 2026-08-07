import path from "node:path";
import { pathToFileURL } from "node:url";
import { readDesignData, saveDesignData, type EditCopy, type Topic } from "../lib/design";
import { groundingInstructions } from "../lib/grounding-prompt";
import { runClaudeTaskJson } from "../lib/claude-task";
import { projectDir, readProjectData, requireProjectDir } from "../lib/project";
import { reviewLoop } from "../lib/review-loop";
import type { TemplateManifest } from "../../src/templates/contract";

// The project's locked template is a known path (src/templates/<slug>/manifest.ts)
// -- reading it directly is simpler and more reliable than routing it through
// the LLM's own file tools, and `build` will need this exact path later too.
// Exported (like buildPrompt in design-content-structure.ts) so a scripted/
// manual validation run can call it directly, bypassing reviewLoop's
// interactive terminal prompt, which needs a real TTY.
export async function readTemplateManifest(templateSlug: string): Promise<TemplateManifest> {
  const manifestPath = path.resolve(process.cwd(), "src", "templates", templateSlug, "manifest.ts");
  const module = (await import(pathToFileURL(manifestPath).href)) as { manifest: TemplateManifest };
  return module.manifest;
}

export function buildEditCopyPrompt(
  topic: Topic,
  structure: { hook: string; bridge: string; content: string; reveal?: string; cta: string },
  templateManifest: TemplateManifest,
  projectDirPath: string,
  feedback?: string
): string {
  const lines: string[] = [];
  lines.push(
    "You are producing a precise edit-decision cut list for one already-locked piece of campaign content."
  );
  lines.push("");
  lines.push(
    "This topic's content structure is already locked -- do NOT redraft the copy, and do NOT " +
      "reconsider the template. Both are fixed inputs:"
  );
  lines.push(
    JSON.stringify(
      {
        topicId: topic.id,
        title: topic.title,
        hook: structure.hook,
        bridge: structure.bridge,
        content: structure.content,
        reveal: structure.reveal,
        cta: structure.cta,
      },
      null,
      2
    )
  );
  lines.push("");
  lines.push(`This project's locked template is "${templateManifest.name}": ${templateManifest.description}`);
  lines.push(`Beats: ${templateManifest.beats.join(" -> ")}`);
  lines.push("");
  lines.push(groundingInstructions({ allowFrameVerification: true, projectDirPath }));
  lines.push("");
  lines.push(
    "Go back to the real frames precisely now: confirm exact in/out points for the 'content' " +
      "dialogue above. " +
      (templateManifest.components.videoHookOverlay
        ? "This template overlays hook text on real footage from frame 0 -- confirm the opening " +
          "frames actually work as a text-overlay background, not just that the dialogue is real."
        : "This template's HOOK is a separate still/black beat before any footage plays -- the " +
          "video's in-point is unconstrained by overlay legibility, just find where the real " +
          "scene/dialogue actually starts.")
  );
  lines.push("");
  lines.push(
    "Propose the cut list: for each cut, a timestamp and an action (what happens -- e.g. " +
      '\'CUT IN -- "<line>"\', \'CUT OUT\'), and where relevant a transition (hard cut, whip-pan, ' +
      "glitch) and an effect (punch-zoom on a payoff line, a crop/objectPosition shift to keep a " +
      "speaker in frame). Match real patterns already used in this codebase " +
      "(an existing project composition -- per-segment objectPosition crop shifts, a punch-zoom " +
      "interpolate on the payoff line), not hypothetical ones."
  );
  if (feedback) {
    lines.push("");
    lines.push(`Revise your previous proposal based on this feedback: ${feedback}`);
  }
  lines.push("");
  lines.push("Respond with ONLY a JSON object, no markdown fences, no commentary, matching:");
  lines.push(
    `{
  "editCopy": {
    "sourceVideo": string,
    "rows": [{ "timestamp": string, "action": string, "transition": string, "effect": string }]
  }
}`
  );
  return lines.join("\n");
}

type EditCopyProposal = { editCopy: EditCopy };

function render(proposal: EditCopyProposal): string {
  const { sourceVideo, rows } = proposal.editCopy;
  const rowLines = rows
    .map(
      (r) =>
        `  ${r.timestamp}  ${r.action}` +
        (r.transition ? `  [${r.transition}]` : "") +
        (r.effect ? `  {${r.effect}}` : "")
    )
    .join("\n");
  return `source: ${sourceVideo}\n${rowLines}`;
}

export async function designEditCopyCommand(slug: string, topicId: string): Promise<void> {
  requireProjectDir(slug);
  const project = readProjectData(slug);
  const design = readDesignData(slug);

  if (!project.template) {
    console.error(
      `\nNo template set for ${slug} -- run \`cutshort design content-structure ${slug}\` first.`
    );
    process.exit(1);
  }

  let foundTopic: Topic | undefined;
  for (const phase of design?.phases ?? []) {
    foundTopic = phase.topics?.find((t) => t.id === topicId);
    if (foundTopic) break;
  }
  if (!foundTopic) {
    console.error(`\nTopic "${topicId}" not found for ${slug}.`);
    process.exit(1);
  }

  const structures = foundTopic!.contentStructures ?? [];
  if (structures.length === 0) {
    console.error(
      `\nTopic "${topicId}" has no locked content structure yet -- run ` +
        `\`cutshort design content-structure ${slug} --topic ${topicId}\` first.`
    );
    process.exit(1);
  }
  if (structures.length > 1) {
    console.error(
      `\nTopic "${topicId}" has ${structures.length} content structures saved -- edit-copy needs ` +
        `exactly one locked variant. Trim design.json down to the one you're building before running this.`
    );
    process.exit(1);
  }
  const structure = structures[0];

  const templateManifest = await readTemplateManifest(project.template);

  const proposal = await reviewLoop(
    (feedback) =>
      runClaudeTaskJson<EditCopyProposal>(
        buildEditCopyPrompt(foundTopic!, structure, templateManifest, projectDir(slug), feedback),
        projectDir(slug)
      ),
    render
  );

  structure.editCopy = proposal.editCopy;

  saveDesignData(slug, design!);
  console.log(`\nSaved edit copy for topic ${topicId} to Campaign/design.json and Campaign/design.md`);
  console.log(`\nNext: build stage (not yet implemented)\n`);
}
