import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  readDesignData,
  saveDesignData,
  type EditCopy,
  type Topic,
} from "../lib/design";
import { groundingInstructions } from "../lib/grounding-prompt";
import { runAgentTaskJson } from "../lib/agent/runner";
import type { AgentName } from "../lib/agent/types";
import { projectDir, readProjectData, requireProjectDir } from "../lib/project";
import { reviewLoop } from "../lib/review-loop";
import type { TemplateManifest } from "../../src/templates/contract";

// The project's locked template is a known path (src/templates/<slug>/manifest.ts)
// -- reading it directly is simpler and more reliable than routing it through
// the LLM's own file tools, and `build` will need this exact path later too.
// Exported (like buildPrompt in design-content-structure.ts) so a scripted/
// manual validation run can call it directly, bypassing reviewLoop's
// interactive terminal prompt, which needs a real TTY.
export async function readTemplateManifest(
  templateSlug: string,
): Promise<TemplateManifest> {
  const manifestPath = path.resolve(
    process.cwd(),
    "src",
    "templates",
    templateSlug,
    "manifest.ts",
  );
  const module = (await import(pathToFileURL(manifestPath).href)) as {
    manifest: TemplateManifest;
  };
  return module.manifest;
}

export function buildEditCopyPrompt(
  slug: string,
  topic: Topic,
  structure: {
    hook: string;
    bridge: string;
    content: string;
    reveal?: string;
    cta: string;
  },
  templateManifest: TemplateManifest,
  projectDirPath: string,
  feedback?: string,
): string {
  const lines: string[] = [];
  lines.push(
    "You are producing a precise edit-decision cut list for one already-locked piece of campaign content.",
  );
  lines.push("");
  lines.push(
    "This topic's content structure is already locked -- do NOT redraft the copy, and do NOT " +
      "reconsider the template. Both are fixed inputs:",
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
      2,
    ),
  );
  lines.push("");
  lines.push(
    `This project's locked template is "${templateManifest.name}": ${templateManifest.description}`,
  );
  lines.push(`Beats: ${templateManifest.beats.join(" -> ")}`);
  lines.push("");
  lines.push(
    groundingInstructions({ allowFrameVerification: true, projectDirPath }),
  );
  lines.push("");
  lines.push(
    "Go back to the real frames precisely now: confirm exact in/out points for the 'content' " +
      "dialogue above. " +
      (templateManifest.components.videoHookOverlay
        ? "This template overlays hook text on real footage from frame 0 -- confirm the opening " +
          "frames actually work as a text-overlay background, not just that the dialogue is real."
        : "This template's HOOK is a separate still/black beat before any footage plays -- the " +
          "video's in-point is unconstrained by overlay legibility, just find where the real " +
          "scene/dialogue actually starts."),
  );
  lines.push("");
  lines.push(
    "Propose the cut list -- get the shot COUNT right, not just the timing. Don't assume " +
      "dialogue-line boundaries match camera-shot boundaries: if the real footage is a " +
      "two-camera OTS setup that cuts back and forth multiple times within what looks like " +
      "one continuous line of dialogue, that's multiple rows, one per real shot change, not " +
      "one row spanning all of it. Verify this from the actual frames, don't infer it from " +
      "the transcript or from how many lines of dialogue there are.",
  );
  lines.push(
    "For each row's effect, when it involves cropping/positioning a speaker, give an EXACT " +
      'numeric objectPosition value (e.g. "objectPosition: 15% 50%"), not a vague description ' +
      'like "shifted toward X" -- compute it from where the subject actually sits in the frame ' +
      "you're looking at. A vague description can't be built from directly; a wrong number is " +
      "at least checkable and fixable later. Percentages are resolution-independent, so the " +
      "capped inspection frames you're already pulling are precise enough for this -- you do " +
      "not need the final extracted clip to compute it.",
  );
  lines.push(
    `If src/${slug}/ already has a composition built from an earlier ` +
      "\`design build\` run, match the real patterns it uses (per-segment objectPosition crop " +
      "shifts, a punch-zoom interpolate) rather than inventing hypothetical ones -- if nothing's " +
      "been built yet, standard techniques like those are still the right vocabulary to reach for.",
  );
  if (feedback) {
    lines.push("");
    lines.push(
      `Revise your previous proposal based on this feedback: ${feedback}`,
    );
  }
  lines.push("");
  lines.push(
    "Respond with ONLY a JSON object, no markdown fences, no commentary, matching:",
  );
  lines.push(
    `{
  "editCopy": {
    "sourceVideo": string,
    "rows": [{ "timestamp": string, "action": string, "transition": string, "effect": string }]
  }
}`,
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
        (r.effect ? `  {${r.effect}}` : ""),
    )
    .join("\n");
  return `source: ${sourceVideo}\n${rowLines}`;
}

export async function designEditCopyCommand(
  slug: string,
  topicId: string,
  agent: AgentName = "claude",
): Promise<void> {
  requireProjectDir(slug);
  const project = readProjectData(slug);
  const design = readDesignData(slug);

  if (!project.template) {
    console.error(
      `\nNo template set for ${slug} -- run \`cutshort design content-structure ${slug}\` first.`,
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
        `\`cutshort design content-structure ${slug} --topic ${topicId}\` first.`,
    );
    process.exit(1);
  }
  if (structures.length > 1) {
    console.error(
      `\nTopic "${topicId}" has ${structures.length} content structures saved -- edit-copy needs ` +
        `exactly one locked variant. Trim design.json down to the one you're building before running this.`,
    );
    process.exit(1);
  }
  const structure = structures[0];

  const templateManifest = await readTemplateManifest(project.template);

  const proposal = await reviewLoop(
    (feedback) =>
      runAgentTaskJson<EditCopyProposal>(
        buildEditCopyPrompt(
          slug,
          foundTopic!,
          structure,
          templateManifest,
          projectDir(slug),
          feedback,
        ),
        projectDir(slug),
        agent,
      ),
    render,
  );

  structure.editCopy = {
    ...proposal.editCopy,
    generatedBy: agent,
    approvedAt: new Date().toISOString(),
  };

  saveDesignData(slug, design!);
  console.log(
    `\nSaved edit copy for topic ${topicId} to Campaign/design.json and Campaign/design.md`,
  );
  console.log(
    `\nNext: run \`npm run cutshort -- design build ${slug} --topic ${topicId}\`\n`,
  );
}
