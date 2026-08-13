import fs from "node:fs";
import path from "node:path";
import {
  formatContent,
  readDesignData,
  saveDesignData,
  type ContentStructure,
  type DesignData,
  type Phase,
} from "../lib/design";
import { groundingInstructions } from "../lib/grounding-prompt";
import { runAgentTaskJson } from "../lib/agent/runner";
import type { AgentName, AgentRunOptions } from "../lib/agent/types";
import {
  pendingCandidatePath,
  projectDir,
  readProjectData,
  requireProjectDir,
  writeProjectData,
  type ProjectData,
} from "../lib/project";
import { reviewLoop } from "../lib/review-loop";
import { designEditCopyCommand } from "./design-edit-copy";

// Exported so a scripted/manual validation run can call the exact same
// prompt-building logic the real command uses, without going through
// reviewLoop's interactive terminal prompt (which needs a real TTY).
export function buildPrompt(
  phases: Phase[],
  currentTemplate: string | null,
  projectDirPath: string,
  feedback?: string,
): string {
  const phasesWithTopics = phases.map(({ id, name, goal, topics }) => ({
    phaseId: id,
    phaseName: name,
    phaseGoal: goal,
    topics: (topics ?? []).map(
      ({ id: topicId, title, description, reasoning }) => ({
        id: topicId,
        title,
        description,
        reasoning,
      }),
    ),
  }));

  const lines: string[] = [];
  lines.push(
    "You are proposing content structure variants for a set of already-approved campaign topics.",
  );
  lines.push("");
  lines.push(
    "The approved phases and topics below were saved to Campaign/design.json in " +
      "the project directory (the persistent, per-project record) after a human " +
      "approval step. Each topic's 'reasoning' field explains specifically why " +
      "it was chosen for its phase -- carry that intent forward into the " +
      "structure variants you propose, don't just work from the title/" +
      "description in isolation. Approved phases and topics:",
  );
  lines.push(JSON.stringify(phasesWithTopics, null, 2));
  lines.push("");
  lines.push(
    "Read Campaign/objective.md (target audience, objective, platforms) in the project directory.",
  );
  lines.push("");
  lines.push(
    groundingInstructions({ allowFrameVerification: true, projectDirPath }),
  );
  lines.push("");
  lines.push(
    "Before drafting any copy, decide which visual template this content " +
      "should build against -- this is a gate, not a parallel output; the " +
      "template you choose constrains what a good cut even looks like, so it " +
      "has to be settled first:",
  );
  lines.push(
    "1. Read src/templates/contract.ts (repo root, not the project directory) -- " +
      "the full registry of available components and prop shapes any template " +
      "can be built from.",
  );
  lines.push(
    "2. Read every src/templates/*/manifest.ts that currently exists (name, " +
      `description, beats, components). This project currently uses: ${currentTemplate ?? "no template yet"}.`,
  );
  lines.push(
    "3. If an existing template fits this content well, reuse it. Default to " +
      "keeping the project's current template unless there's a clear structural " +
      "mismatch -- a new template is a real cost (breaks visual consistency " +
      "across the campaign, needs a follow-up build pass for the actual " +
      "component code), not a free choice to make per batch of content. If no " +
      "template is set yet for this project, prefer reusing '4-beats' unless " +
      "this content clearly needs something that structure can't do -- bias " +
      "toward the proven format, not a blank-slate decision every time. " +
      "'5-beats' (adds a misdirect Bridge beat before the video) is a legacy " +
      "option now: real Instagram viewing data showed drop-off during that " +
      "beat, so only reach for it when a deliberate misdirect genuinely fits " +
      "this specific piece of content, not as a default choice.",
  );
  lines.push(
    "4. Only if nothing existing genuinely fits, propose a new template: pick " +
      "components from contract.ts's registry, define a beat order, and write a " +
      "structural brief covering beat structure, hook style, font, background " +
      "treatment, what's reused vs. built new, and any other structural rule -- " +
      "the same kind of brief a human would have written by hand.",
  );
  lines.push("");
  lines.push(
    "The template you just chose constrains what a good cut looks like, so " +
      "keep it in mind while drafting the content below:",
  );
  lines.push(
    "- If its HOOK is a separate still/black beat before any footage plays " +
      "(e.g. '4-beats', '5-beats'), the video's in-point is unconstrained by " +
      "overlay legibility -- pick wherever the real scene starts.",
  );
  lines.push(
    "- If its HOOK overlays text on real footage from frame 0 (e.g. " +
      "'3-beats'), the opening frames themselves must work as a text-overlay " +
      "background -- factor that into which real dialogue window you pick.",
  );
  lines.push("");
  lines.push(
    "Now propose 2-3 DIFFERENT content structure variants -- each a full " +
      "hook/content/reveal/cta breakdown, plus a bridge ONLY if the template " +
      "you chose actually has a Bridge beat (check its manifest's " +
      "components.bridgeCard -- '4-beats' and '3-beats' don't, '5-beats' " +
      "does). These are explicitly meant as experiments to test against the " +
      "audience (different hook framings, different misdirects where a " +
      "bridge applies), not near-duplicates of each other.",
  );
  lines.push("");
  lines.push(
    "The 'content' field must be the literal, real dialogue from the SRT " +
      "transcript -- formatted like a script excerpt, speaker name (cross-" +
      "referenced from the Script) followed by their exact real line, one per " +
      "line, e.g.:",
  );
  lines.push(
    "SPEAKER_A: <their exact real line from the SRT>\n" +
      "SPEAKER_B: <their exact real line from the SRT>\n" +
      "SPEAKER_A: <their exact real line from the SRT>",
  );
  lines.push(
    "Not a description of the scene -- the actual quoted lines, verbatim, in " +
      "order, no timestamps. If no real dialogue in the SRT fits this topic, set " +
      "content to 'NO MATCHING DIALOGUE FOUND in transcript' instead of " +
      "inventing lines.",
  );
  lines.push("");
  lines.push(
    "Each variant also needs per-platform packaging for YouTube Shorts, " +
      "Instagram Reels, and TikTok -- same beats, three different wrappers:",
  );
  lines.push(
    "- YouTube: the TITLE (not the caption) drives discovery there -- write a " +
      "real, keyword-bearing sentence someone would actually search, not a " +
      "clever phrase. If the film's device/premise appears anywhere in this " +
      "variant's copy, use plain literal language for what it does (e.g. " +
      "'detects lies'), never a euphemism -- search rewards literal keywords.",
  );
  lines.push(
    "- Instagram: caption + hashtag consistency matters more than search here. " +
      "Multi-line captions are fine.",
  );
  lines.push(
    "- TikTok: short caption, hook in the first line, 4-6 hashtags max -- " +
      "trending-audio fit matters more than hashtag volume.",
  );
  lines.push(
    "- Use the same CTA line and days-left counter across all three and across " +
      "variants -- don't reinvent the CTA per topic or per platform, " +
      "recognizable is the point.",
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
  "templateDecision": {
    "action": "reuse" | "new",
    "templateSlug": string,
    "reasoning": string,
    "newTemplateBrief": string  // only present when action is "new"
  },
  "contentStructuresByTopic": [
    { "topicId": string, "contentStructures": [{
        "variant": string, "hook": string, "bridge": string, // omit entirely if the chosen template has no Bridge beat
        "content": string, "reveal": string, "cta": string,
        "platforms": {
          "youtube": { "title": string, "caption": string, "hashtags": [string] },
          "instagram": { "caption": string, "hashtags": [string] },
          "tiktok": { "caption": string, "hashtags": [string] }
        }
    }] }
  ]
}`,
  );
  return lines.join("\n");
}

type TemplateDecision = {
  action: "reuse" | "new";
  templateSlug: string;
  reasoning: string;
  newTemplateBrief?: string;
};

type ContentStructuresByTopic = {
  topicId: string;
  contentStructures: ContentStructure[];
}[];

export type ContentStructureProposal = {
  templateDecision: TemplateDecision;
  contentStructuresByTopic: ContentStructuresByTopic;
};

function render(proposal: ContentStructureProposal): string {
  const { templateDecision, contentStructuresByTopic } = proposal;

  const templateLines = [
    `Template: ${templateDecision.action} "${templateDecision.templateSlug}"`,
    `  reasoning: ${templateDecision.reasoning}`,
  ];
  if (templateDecision.action === "new" && templateDecision.newTemplateBrief) {
    templateLines.push(
      "",
      "  --- new template brief ---",
      templateDecision.newTemplateBrief,
    );
  }

  const topicLines = contentStructuresByTopic
    .map(
      (entry) =>
        `${entry.topicId}:\n` +
        entry.contentStructures
          .map(
            (s) =>
              `  [${s.variant}] hook: ${s.hook}\n` +
              (s.bridge ? `        bridge: ${s.bridge}\n` : "") +
              `        content: ${formatContent(s.content)}\n` +
              (s.reveal ? `        reveal: ${s.reveal}\n` : "") +
              `        cta: ${s.cta}` +
              (s.platforms
                ? `\n        yt: ${s.platforms.youtube.title} | ${s.platforms.youtube.caption} | ${s.platforms.youtube.hashtags.join(" ")}` +
                  `\n        ig: ${s.platforms.instagram.caption} | ${s.platforms.instagram.hashtags.join(" ")}` +
                  `\n        tt: ${s.platforms.tiktok.caption} | ${s.platforms.tiktok.hashtags.join(" ")}`
                : ""),
          )
          .join("\n\n"),
    )
    .join("\n\n");

  return [templateLines.join("\n"), "", topicLines].join("\n");
}

// The save step -- identical whether the proposal came from a human
// approving the interactive menu or from `cutshort design approve` reading
// back a non-interactive candidate. Exported so design-approve.ts can call
// it. `agent` here is whichever agent actually generated the proposal
// (from the pending file's own metadata in the non-interactive case, not
// necessarily whatever --agent a later `approve` invocation might pass).
export async function applyContentStructureProposal(
  slug: string,
  design: DesignData,
  project: ProjectData,
  proposal: ContentStructureProposal,
  agent: AgentName,
): Promise<void> {
  const { templateDecision, contentStructuresByTopic } = proposal;

  const byId = new Map(
    contentStructuresByTopic.map((entry) => [
      entry.topicId,
      entry.contentStructures.map((structure) => ({
        ...structure,
        generatedBy: agent,
        approvedAt: new Date().toISOString(),
      })),
    ]),
  );
  for (const phase of design.phases) {
    for (const topic of phase.topics ?? []) {
      const contentStructures = byId.get(topic.id);
      if (contentStructures) {
        topic.contentStructures = contentStructures;
      }
    }
  }

  if (templateDecision.action === "new") {
    const templateDir = path.resolve(
      process.cwd(),
      "src",
      "templates",
      templateDecision.templateSlug,
    );
    if (fs.existsSync(templateDir)) {
      console.error(
        `\nA template already exists at src/templates/${templateDecision.templateSlug} -- re-run and try again ` +
          `(the model will need to pick a different name).`,
      );
      process.exit(1);
    }
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(
      path.join(templateDir, "brief.md"),
      templateDecision.newTemplateBrief ?? "",
    );
    console.log(
      `\nNew template brief saved: src/templates/${templateDecision.templateSlug}/brief.md`,
    );
  }

  project.template = templateDecision.templateSlug;
  writeProjectData(slug, project);

  saveDesignData(slug, design);
  console.log(
    `\nSaved content structures to Campaign/design.json and Campaign/design.md`,
  );
  console.log(`\nUsing template: ${templateDecision.templateSlug}`);

  // Each topic just got 2-3 DIFFERENT variants proposed -- edit-copy needs
  // exactly one locked variant per topic (see findLockedStructure), so only
  // auto-continue for a topic that happened to end up with exactly one.
  // Otherwise this is a real human choice (which variant), not friction.
  for (const entry of contentStructuresByTopic) {
    const topic = design.phases
      .flatMap((phase) => phase.topics ?? [])
      .find((t) => t.id === entry.topicId);
    const variantCount = topic?.contentStructures?.length ?? 0;

    if (variantCount === 1) {
      console.log(
        `\nStarting design edit-copy automatically for topic ${entry.topicId}...\n`,
      );
      try {
        await designEditCopyCommand(slug, entry.topicId);
      } catch (err) {
        console.error(
          `\nContent structure for topic ${entry.topicId} saved successfully -- that part is safe ` +
            `and locked in.\nAuto-continuing into edit-copy failed: ` +
            `${err instanceof Error ? err.message : String(err)}\n` +
            `Nothing was lost. Retry just that stage yourself:\n` +
            `  cutshort design edit-copy ${slug} --topic ${entry.topicId}\n`,
        );
        process.exit(1);
      }
    } else if (variantCount > 1) {
      console.log(
        `\nTopic "${entry.topicId}" has ${variantCount} content structure variants saved -- ` +
          `edit-copy needs exactly one. Trim Campaign/design.json down to the variant you want, ` +
          `then run \`cutshort design edit-copy ${slug} --topic ${entry.topicId}\` yourself.\n`,
      );
    }
  }
}

export async function designContentStructureCommand(
  slug: string,
  topicId?: string,
  agent: AgentName = "claude",
  feedback?: string,
  agentOptions?: AgentRunOptions,
): Promise<void> {
  requireProjectDir(slug);
  const project = readProjectData(slug);
  const design = readDesignData(slug);

  const hasAnyTopics = design?.phases?.some(
    (phase) => (phase.topics?.length ?? 0) > 0,
  );
  if (!hasAnyTopics) {
    console.error(
      `\nNo topics found for ${slug} -- run \`cutshort design topics ${slug}\` first.`,
    );
    process.exit(1);
  }

  // Scoping to one topic only narrows what's SENT to the model -- the merge
  // step below always writes back against the full, unfiltered design, so a
  // scoped run can never touch another topic's already-saved data.
  let promptPhases = design!.phases;
  if (topicId) {
    promptPhases = design!.phases
      .map((phase) => ({
        ...phase,
        topics: (phase.topics ?? []).filter((t) => t.id === topicId),
      }))
      .filter((phase) => phase.topics.length > 0);
    if (promptPhases.length === 0) {
      console.error(`\nTopic "${topicId}" not found for ${slug}.`);
      process.exit(1);
    }
  }

  const proposal = await reviewLoop(
    (feedback) =>
      runAgentTaskJson<ContentStructureProposal>(
        buildPrompt(promptPhases, project.template, projectDir(slug), feedback),
        projectDir(slug),
        agent,
        agentOptions,
      ),
    render,
    {
      agent,
      pendingPath: pendingCandidatePath(slug, "content-structure", topicId),
      approveCommand: `cutshort design approve ${slug} --stage content-structure${topicId ? ` --topic ${topicId}` : ""}`,
      initialFeedback: feedback,
    },
  );

  await applyContentStructureProposal(slug, design!, project, proposal, agent);
}
