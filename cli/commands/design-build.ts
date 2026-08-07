import fs from "node:fs";
import path from "node:path";
import { readDesignData, saveDesignData, type ContentStructure, type Topic } from "../lib/design";
import { runClaudeTaskJson } from "../lib/claude-task";
import { imagesDir, projectDir, readProjectData, requireProjectDir, videoDir, type ProjectData } from "../lib/project";
import { reviewLoop } from "../lib/review-loop";
import { readTemplateManifest } from "./design-edit-copy";
import type { TemplateManifest } from "../../src/templates/contract";

export type BuildProposal = {
  compositionFile: string;
  extractedClip: string;
  hookStill: string | null;
  selfVerification: {
    resolutionMatches: boolean;
    durationMatches: boolean;
    filesExist: boolean;
    framesLookCorrect: boolean;
    notes: string;
  };
};

// Exported (like buildPrompt / buildEditCopyPrompt) so a scripted/manual
// validation run can call it directly, bypassing reviewLoop's interactive
// terminal prompt, which needs a real TTY.
export function buildBuildPrompt(
  topic: Topic,
  structure: ContentStructure,
  project: ProjectData,
  templateManifest: TemplateManifest,
  projectDirPath: string,
  templateDirPath: string,
  feedback?: string
): string {
  const editCopy = structure.editCopy!;
  const firstTimestamp = editCopy.rows[0]?.timestamp ?? "unknown";
  const lastTimestamp = editCopy.rows[editCopy.rows.length - 1]?.timestamp ?? "unknown";
  const clipDestination = `${videoDir(project.slug)}/${topic.id}.mp4`;
  const hookStillDestination = `${imagesDir(project.slug)}/${topic.id}HookBG.jpg`;

  const lines: string[] = [];
  lines.push(
    "You are generating the real Remotion composition for one fully-locked piece of " +
      "campaign content -- everything creative is already decided; your job is faithful " +
      "translation into code, plus the physical media extraction it depends on."
  );
  lines.push("");
  lines.push("Locked content (fixed inputs, do not redraft):");
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
        editCopy,
      },
      null,
      2
    )
  );
  lines.push("");
  lines.push(
    "Read src/templates/contract.ts (repo root -- exact prop TYPES) and every real component " +
      `file in ${templateDirPath} (this project's locked template) -- manifest.ts, ` +
      "HookScene.tsx, BridgeCard.tsx, CtaCard.tsx, RedFlagStamp.tsx, GlitchFlash.tsx, " +
      "theme.ts. The actual .tsx files are ground truth for exact prop NAMES, contract.ts's " +
      "types alone aren't enough."
  );
  lines.push("");
  lines.push(
    `Check src/${project.slug}/ for any composition already built in this project (an ` +
      "earlier \`design build\` run) -- if one exists, read it as a wiring PATTERN, not " +
      "content to reuse: how it assembles Sequence/OffthreadVideo frame math, per-segment " +
      "objectPosition, a punch-zoom interpolate, Caption cue arrays. Match the structure, " +
      "not the specific content. If this is the first composition built for this project, " +
      "there's nothing to reference yet -- construct the wiring directly from contract.ts's " +
      "prop types and the template's component files instead."
  );
  lines.push("");
  lines.push(`Read ${projectDirPath}/Campaign/project.json for videoPath and campaignDays.`);
  lines.push("");
  lines.push(
    "Read the project's SRT/*.words.json NARROWLY -- grep/query only entries inside " +
      `editCopy's span (${firstTimestamp} to ${lastTimestamp}). Never read the whole file -- ` +
      "a feature-length source can hold tens of thousands of word entries for a ~60-90s " +
      "slice you actually need."
  );
  lines.push("");
  lines.push("Extract the real clip -- hard constraints, not suggestions:");
  lines.push(
    "1. Source is ALWAYS project.json's videoPath -- never reuse anything under a " +
      ".frame-check/ folder from an earlier stage; those were capped to 720p for the " +
      "model's own inspection only, never meant to back a final asset."
  );
  lines.push(
    "2. Full native resolution, no scale flag. ffprobe the source first, match the " +
      "composition's width/height/fps to what's actually there -- don't assume 1080x1920 " +
      "or 30fps."
  );
  lines.push(
    `3. One continuous span covering editCopy's full range (${firstTimestamp} to ` +
      `${lastTimestamp}). editCopy's in/out points are already-verified ground truth -- ` +
      "don't re-verify or second-guess them."
  );
  lines.push(`4. Write it to ${clipDestination}.`);
  lines.push(
    "5. Stay landscape at this stage -- vertical framing is a COMPOSITION-time concern " +
      "(objectFit: cover + objectPosition on the video element, canvas sized to the " +
      "source's native resolution), never baked into the extracted file itself."
  );
  lines.push("");
  lines.push(
    templateManifest.components.hookScene
      ? `This template's HOOK needs a still background -- extract one frame -> ${hookStillDestination}.`
      : "This template has no still-hook beat (hookScene is not in its components) -- do NOT " +
        "generate a hook-still image, nothing in the composition would reference it."
  );
  lines.push("");
  lines.push(
    `Write the composition file -> src/${project.slug}/<PascalCaseTopicName>.tsx -- wire the ` +
      "locked copy + editCopy's cut list + the template's real components together, " +
      "following the same pattern as the reference composition above (or, if there wasn't " +
      "one, standard Remotion practice): frame math from editCopy's real timestamps, one " +
      "cut/Sequence per editCopy row (its row count is already the verified real shot count -- " +
      "don't merge or split rows), captions from the words.json slice you queried."
  );
  lines.push(
    "editCopy's objectPosition/effect values are already-verified ground truth from an earlier " +
      "frame-checking pass -- use them exactly as given. Do NOT recompute crop math, do NOT " +
      "second-guess a value that looks off, do NOT render test stills to check it. If a value " +
      "genuinely seems wrong once you see the extracted clip, say so plainly in this response's " +
      "notes and move on -- don't try to fix it here."
  );
  lines.push("");
  lines.push(
    "Before responding, verify your own work -- this is a bounded spot-check, not a second " +
      "editing pass:"
  );
  lines.push(
    "1. ffprobe the extracted clip -- resolution matches the source's native resolution " +
      "(not 720p), duration roughly matches editCopy's total span."
  );
  lines.push("2. Confirm every path the new .tsx references actually exists on disk.");
  lines.push(
    "3. Extract 2-3 frames TOTAL from the NEWLY EXTRACTED clip (not per shot, not the whole " +
      "cut list re-checked one row at a time) and look at them -- confirm real content, " +
      "roughly correctly framed."
  );
  lines.push(
    "Fix anything cheap (a typo'd path, a missed file) before responding. Do not iterate on " +
      "crop values, do not render additional test stills beyond the 2-3 above, do not repeat " +
      "the frame-checking edit-copy already did -- report problems in notes instead of trying " +
      "to solve them here. That kind of unbounded iteration is what made an earlier run take " +
      "30 minutes and far more tokens than it needed to."
  );
  if (feedback) {
    lines.push("");
    lines.push(`Revise your previous proposal based on this feedback: ${feedback}`);
  }
  lines.push("");
  lines.push("Respond with ONLY a JSON object, no markdown fences, no commentary, matching:");
  lines.push(
    `{
  "compositionFile": string,
  "extractedClip": string,
  "hookStill": string | null,
  "selfVerification": {
    "resolutionMatches": boolean,
    "durationMatches": boolean,
    "filesExist": boolean,
    "framesLookCorrect": boolean,
    "notes": string
  }
}`
  );
  return lines.join("\n");
}

function render(proposal: BuildProposal): string {
  const ownFileCheck =
    fs.existsSync(proposal.compositionFile) &&
    fs.existsSync(proposal.extractedClip) &&
    (proposal.hookStill === null || fs.existsSync(proposal.hookStill));

  return [
    `Composition: ${proposal.compositionFile}`,
    `Extracted clip: ${proposal.extractedClip}`,
    proposal.hookStill ? `Hook still: ${proposal.hookStill}` : "Hook still: not needed for this template",
    "",
    "Self-verification:",
    JSON.stringify(proposal.selfVerification, null, 2),
    "",
    ownFileCheck
      ? "Command-level check: all referenced files exist on disk."
      : "WARNING: command-level check found a missing file the agent claimed to write.",
  ].join("\n");
}

export async function designBuildCommand(slug: string, topicId: string): Promise<void> {
  requireProjectDir(slug);
  const project = readProjectData(slug);
  const design = readDesignData(slug);

  if (!project.template) {
    console.error(`\nNo template set for ${slug} -- run \`cutshort design content-structure ${slug}\` first.`);
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
      `\nTopic "${topicId}" has ${structures.length} content structures saved -- build needs ` +
        `exactly one locked variant. Trim design.json down to the one you're building before running this.`
    );
    process.exit(1);
  }
  const structure = structures[0];

  if (!structure.editCopy) {
    console.error(
      `\nTopic "${topicId}" has no locked edit copy yet -- run ` +
        `\`cutshort design edit-copy ${slug} --topic ${topicId}\` first.`
    );
    process.exit(1);
  }

  const templateManifest = await readTemplateManifest(project.template);
  const templateDirPath = path.resolve(process.cwd(), "src", "templates", project.template);

  const proposal = await reviewLoop(
    (feedback) =>
      runClaudeTaskJson<BuildProposal>(
        buildBuildPrompt(foundTopic!, structure, project, templateManifest, projectDir(slug), templateDirPath, feedback),
        projectDir(slug)
      ),
    render
  );

  structure.build = {
    compositionFile: proposal.compositionFile,
    extractedClip: proposal.extractedClip,
    hookStill: proposal.hookStill,
  };

  saveDesignData(slug, design!);
  console.log(`\nSaved build output for topic ${topicId} to Campaign/design.json and Campaign/design.md`);
  console.log(`\nRun \`npm run dev\` to preview in Remotion Studio.`);
  console.log(`\nNext: render to public/Projects/${slug}/Rendered/${topicId}.mp4 (render stage not yet built)\n`);
}
