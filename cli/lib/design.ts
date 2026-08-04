import fs from "node:fs";
import path from "node:path";
import { campaignDir } from "./project";

export type ContentStructure = {
  variant: string;
  hook: string;
  bridge: string;
  // The real dialogue itself -- verbatim, speaker-labeled lines from the
  // SRT transcript (not a paraphrase), or "NO MATCHING DIALOGUE FOUND in
  // transcript" if nothing real fits. This is what `scan` will later
  // search the transcript for and what `clip` will cut from.
  content: string;
  cta: string;
};

export type Topic = {
  id: string;
  title: string;
  description?: string;
  // Specifically how/why this topic serves its phase's stated goal -- not
  // a restatement of the goal. Lets a human see the reasoning at a glance,
  // and lets later stages (content-structure, eventually scan/build) stay
  // aligned with why a topic was picked, not just what it is.
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
// a variant has nothing real behind it to hand off to `scan`.
export function formatContent(content: string | undefined): string {
  if (!content || /no matching dialogue/i.test(content)) {
    return `⚠ NO REAL DIALOGUE MATCH -- ${content || "(missing)"}`;
  }
  return content;
}

// Human-readable mirror of design.json -- fully re-rendered from current
// state after every step (phases/topics/content-structure), not manually
// appended, so it can never drift out of sync if a step gets re-run.
export function renderDesignMarkdown(design: DesignData): string {
  const lines: string[] = ["# Campaign Design", ""];

  for (const phase of design.phases) {
    lines.push(`## ${phase.name} (${phase.id})`);
    lines.push(`**Goal:** ${phase.goal}`);
    lines.push("");

    for (const topic of phase.topics ?? []) {
      lines.push(`### ${topic.title} (${topic.id})`);
      if (topic.description) {
        lines.push(topic.description);
      }
      if (topic.reasoning) {
        lines.push(`*Why: ${topic.reasoning}*`);
      }
      lines.push("");

      for (const structure of topic.contentStructures ?? []) {
        lines.push(`**Variant ${structure.variant}**`);
        lines.push(`- Hook: ${structure.hook}`);
        lines.push(`- Bridge: ${structure.bridge}`);
        lines.push(`- Content: ${formatContent(structure.content)}`);
        lines.push(`- CTA: ${structure.cta}`);
        lines.push("");
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
  fs.writeFileSync(designMarkdownPath(slug), renderDesignMarkdown(data));
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
