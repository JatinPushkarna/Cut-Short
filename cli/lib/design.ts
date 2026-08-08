import fs from "node:fs";
import path from "node:path";
import { campaignDir, renderedVideoPath } from "./project";
import type { AgentName } from "./agent/types";

// Per-platform packaging -- YouTube's title (not caption) is what drives
// discovery there, so it gets its own field distinct from the caption;
// Instagram and TikTok don't have an equivalent title slot.
export type PlatformCopy = {
  youtube: { title: string; caption: string; hashtags: string[] };
  instagram: { caption: string; hashtags: string[] };
  tiktok: { caption: string; hashtags: string[] };
};

// The precise cut list for a locked content structure's video beat --
// produced by `design edit-copy`, which runs after both the content and
// the template are locked (the template's beat structure determines what
// a good cut even looks like, so it can't be decided earlier). Replaces
// the originally-planned separate `scan`/`clip` stages.
export type EditCopyRow = {
  timestamp: string;
  // e.g. "CUT IN -- \"<line>\"", "CUT OUT" -- what happens at this timestamp.
  action: string;
  // e.g. "hard cut" | "whip-pan" | "glitch" -- how this cut lands, if it's
  // not a plain hard cut.
  transition?: string;
  // e.g. "punch-zoom on <speaker>" | "crop shift, 35% center" -- matches
  // patterns already used in a project's own existing compositions, if any
  // exist (per-segment objectPosition, a punch-zoom interpolate on the
  // payoff line), not hypothetical ones.
  effect?: string;
};

export type EditCopy = {
  // Literal source video path, from project.json -- lets a later topic
  // grep existing editCopy entries for an overlapping/reusable window
  // instead of re-verifying frames from scratch.
  sourceVideo: string;
  rows: EditCopyRow[];
  // Which agent's proposal was approved through reviewLoop for this stage,
  // and when (ISO 8601, set the moment reviewLoop returns "approve"). This
  // is a label + timestamp the CLI writes at approval time -- a paper
  // trail, not proof of review: design.json is a plain, editable JSON
  // file, so nothing stops a fabricated record from setting these same
  // fields. Useful for `design status` to show provenance across agent
  // switches; not an audit guarantee. Absent for structures locked before
  // these fields existed.
  generatedBy?: AgentName;
  approvedAt?: string;
};

// Real files `design build` wrote for this structure -- lets a later `render`
// step (or a human reading design.md) find the composition and the physical
// assets it depends on without having to remember or reconstruct the paths.
export type BuildOutput = {
  compositionFile: string;
  // The 720p proxy path (Assets/Video/<topicId>.mp4) -- always set once
  // `design build` has run once. Never deleted by `design build --finalize`.
  extractedClip: string;
  // The full-native-resolution path (Final/Video/<topicId>.mp4) -- absent/null
  // until `design build --finalize` runs. Deliberately a *different* path
  // from extractedClip, not an in-place overwrite -- Assets/Video/ stays a
  // hard "720p proxies only" guarantee, so nothing that only needs a proxy
  // can ever accidentally pick up a 4K file from that tree, and vice versa.
  // Optional for back-compat with structures saved before this field existed.
  finalClip?: string | null;
  // null when the locked template has no still-hook beat to generate one for.
  hookStill: string | null;
  // Which of extractedClip/finalClip the composition's OffthreadVideo
  // currently references. "proxy" (720p, fast, for review) until
  // `design build --finalize` re-extracts at full native resolution, swaps
  // the composition's clip reference, and flips this to "final" -- a purely
  // mechanical step, no LLM call, since everything it needs is already
  // locked from the proxy phase. Optional for back-compat with structures
  // saved before this field existed.
  quality?: "proxy" | "final";
  // Which agent's proposal produced this build, and when (the proxy pass
  // only -- `build --finalize` is mechanical and never overwrites these).
  // See EditCopy's generatedBy/approvedAt for what this does and doesn't
  // prove.
  generatedBy?: AgentName;
  approvedAt?: string;
};

export type ContentStructure = {
  variant: string;
  hook: string;
  bridge: string;
  // The real dialogue itself -- verbatim, speaker-labeled lines from the
  // SRT transcript (not a paraphrase), or "NO MATCHING DIALOGUE FOUND in
  // transcript" if nothing real fits. This is what `design edit-copy` later
  // turns into a precise cut list.
  content: string;
  // Text/stamp overlay after the video beat -- optional since not every
  // structure needs one spelled out yet (e.g. a flag-stamp verdict can
  // carry the beat instead, decided at build time).
  reveal?: string;
  cta: string;
  // Optional for back-compat with structures saved before this field
  // existed -- every newly-drafted structure should have it.
  platforms?: PlatformCopy;
  // Which agent's proposal got approved through reviewLoop for this
  // content-structure variant, and when. See EditCopy's generatedBy/
  // approvedAt for what this does and doesn't prove.
  generatedBy?: AgentName;
  approvedAt?: string;
  // Set by `design edit-copy`, after this structure and the project's
  // template are both already locked. Absent until that stage runs.
  editCopy?: EditCopy;
  // Set by `design build`, after editCopy is locked. Absent until that
  // stage runs.
  build?: BuildOutput;
};

export type Topic = {
  id: string;
  title: string;
  description?: string;
  // Specifically how/why this topic serves its phase's stated goal -- not
  // a restatement of the goal. Lets a human see the reasoning at a glance,
  // and lets later stages (content-structure, edit-copy, eventually build)
  // stay aligned with why a topic was picked, not just what it is.
  reasoning?: string;
  contentStructures?: ContentStructure[];
};

export type Phase = {
  id: string;
  name: string;
  goal: string;
  topics?: Topic[];
};

export type DesignData = {
  phases: Phase[];
};

export function designJsonPath(slug: string): string {
  return path.join(campaignDir(slug), "design.json");
}

export function readDesignData(slug: string): DesignData | null {
  const jsonPath = designJsonPath(slug);
  if (!fs.existsSync(jsonPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as DesignData;
}

export function writeDesignData(slug: string, data: DesignData): void {
  fs.writeFileSync(designJsonPath(slug), JSON.stringify(data, null, 2));
}

export function designMarkdownPath(slug: string): string {
  return path.join(campaignDir(slug), "design.md");
}

// Flags a missing/no-match content field visibly, since that's the signal
// a variant has nothing real behind it to hand off to `design edit-copy`.
export function formatContent(content: string | undefined): string {
  if (!content || /no matching dialogue/i.test(content)) {
    return `⚠ NO REAL DIALOGUE MATCH -- ${content || "(missing)"}`;
  }
  return content;
}

// Indents every line after the first so a multi-line dialogue block reads
// as nested under its "- Content:" bullet instead of as bare top-level
// lines that visually break out of the list item.
function indentContinuationLines(text: string, indent = "    "): string {
  return text.split("\n").join(`\n${indent}`);
}

// Markdown table cells can't contain raw pipes or line breaks without
// breaking the row. Preserve multiline copy visually with HTML breaks.
function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

// Human-readable mirror of design.json -- fully re-rendered from current
// state after every step (phases/topics/content-structure), not manually
// appended, so it can never drift out of sync if a step gets re-run.
//
// Grouped so each concern gets its own labeled section instead of one flat
// bullet list: Concept (why this topic exists, topic-level) then, per
// variant, Copy (the narrative beats) / Social Media (platform packaging) /
// Edit Copy (the cut list) / Path (files `design build` wrote) / Rendered
// (whether the final video actually exists yet under Rendered/).
export function renderDesignMarkdown(design: DesignData, slug: string): string {
  const lines: string[] = ["# Campaign Design", ""];

  for (const phase of design.phases) {
    lines.push(`## ${phase.name} (${phase.id})`);
    lines.push(`**Goal:** ${phase.goal}`);
    lines.push("");

    for (const topic of phase.topics ?? []) {
      lines.push(`### ${topic.title} (${topic.id})`);
      lines.push("");

      if (topic.description || topic.reasoning) {
        lines.push("**Concept**");
        if (topic.description) {
          lines.push(topic.description);
        }
        if (topic.reasoning) {
          lines.push(`*Why: ${topic.reasoning}*`);
        }
        lines.push("");
      }

      for (const structure of topic.contentStructures ?? []) {
        lines.push(`#### Variant ${structure.variant}`);
        lines.push("");

        lines.push("**Copy**");
        lines.push(`- Hook: ${structure.hook}`);
        lines.push(`- Bridge: ${structure.bridge}`);
        lines.push(`- Content: ${indentContinuationLines(formatContent(structure.content))}`);
        if (structure.reveal) {
          lines.push(`- Reveal: ${structure.reveal}`);
        }
        lines.push(`- CTA: ${structure.cta}`);
        lines.push("");

        if (structure.platforms) {
          const { youtube, instagram, tiktok } = structure.platforms;
          lines.push("**Social Media**");
          lines.push("");
          lines.push("| Platform | Title | Caption | Hashtags |");
          lines.push("|---|---|---|---|");
          lines.push(
            `| YouTube | ${escapeTableCell(youtube.title)} | ${escapeTableCell(youtube.caption)} | ${escapeTableCell(youtube.hashtags.join(" "))} |`
          );
          lines.push(
            `| Instagram | — | ${escapeTableCell(instagram.caption)} | ${escapeTableCell(instagram.hashtags.join(" "))} |`
          );
          lines.push(
            `| TikTok | — | ${escapeTableCell(tiktok.caption)} | ${escapeTableCell(tiktok.hashtags.join(" "))} |`
          );
          lines.push("");
        }

        if (structure.editCopy) {
          lines.push("**Edit Copy**");
          lines.push("");
          lines.push(`Source: ${structure.editCopy.sourceVideo}`);
          lines.push("");
          lines.push("| Timestamp | Action | Transition | Effect |");
          lines.push("|---|---|---|---|");
          for (const row of structure.editCopy.rows) {
            lines.push(
              `| ${escapeTableCell(row.timestamp)} | ${escapeTableCell(row.action)} | ${escapeTableCell(row.transition ?? "—")} | ${escapeTableCell(row.effect ?? "—")} |`
            );
          }
          lines.push("");
        }

        if (structure.build) {
          lines.push("**Path**");
          lines.push(`- Composition: ${structure.build.compositionFile}`);
          lines.push(`- Extracted clip (proxy, 720p): ${structure.build.extractedClip}`);
          lines.push(
            `- Extracted clip (final, native res): ${structure.build.finalClip ?? "not finalized yet"}`
          );
          lines.push(`- Composition currently uses: ${structure.build.quality ?? "unknown"}`);
          lines.push(`- Hook still: ${structure.build.hookStill ?? "not needed for this template"}`);
          lines.push("");

          lines.push("**Rendered**");
          const videoPath = renderedVideoPath(slug, topic.id);
          lines.push(fs.existsSync(videoPath) ? `- ${videoPath}` : "- not yet rendered");
          lines.push("");
        }
      }
    }
  }

  return lines.join("\n");
}

// Writes both the machine-readable design.json and its human-readable
// design.md mirror -- every design command should call this, not
// writeDesignData directly, so the two never fall out of sync.
export function saveDesignData(slug: string, data: DesignData): void {
  writeDesignData(slug, data);
  fs.writeFileSync(designMarkdownPath(slug), renderDesignMarkdown(data, slug));
}

// True if any phase already has topics attached -- used to warn when
// re-running `design phases` would make existing topics/content structures stale.
export function hasTopics(design: DesignData | null): boolean {
  return !!design?.phases?.some((phase) => (phase.topics?.length ?? 0) > 0);
}

// True if any topic already has content structure variants attached -- used
// to warn when re-running `design topics` would make them stale.
export function hasContentStructures(design: DesignData | null): boolean {
  return !!design?.phases?.some((phase) =>
    phase.topics?.some((topic) => (topic.contentStructures?.length ?? 0) > 0)
  );
}
