import fs from "node:fs";
import path from "node:path";
import { designJsonPath } from "./design";
import { campaignDir, srtDir, type ProjectData } from "./project";

export function objectiveMdPath(slug: string): string {
  return path.join(campaignDir(slug), "objective.md");
}

// SRT files are named after the source video's basename (see transcribe.ts),
// not a fixed name -- find whatever's actually there rather than guessing.
function findSrtFile(slug: string): string | null {
  const dir = srtDir(slug);
  if (!fs.existsSync(dir)) {
    return null;
  }
  const srt = fs.readdirSync(dir).find((f) => f.endsWith(".srt"));
  return srt ? path.join(dir, srt) : null;
}

// The single renderer for Campaign/objective.md -- used by both `init`
// (writes the plain version from raw setup answers) and `design objective`
// (writes the enriched version once that optional stage has run). Renders
// whatever fields are present; the four enrichment fields fall back to a
// placeholder pointing at the command that fills them in, so the file is
// honest about what's still missing rather than silently blank.
export function renderObjectiveMd(project: ProjectData): string {
  const lines: string[] = [];
  lines.push(`# ${project.projectName || "Untitled Project"}`);
  lines.push("");
  lines.push(`**Created:** ${project.createdAt}`);
  lines.push("");

  lines.push("## Objective");
  lines.push(project.objective || "_not provided_");
  lines.push("");

  lines.push("## Narrative Direction");
  lines.push(
    project.narrativeDirection ||
      `_Not yet defined -- run \`cutshort design objective ${project.slug}\`._`,
  );
  lines.push("");

  lines.push("## Distribution Advantage");
  lines.push(project.distributionAdvantage || "_None declared._");
  lines.push("");

  lines.push("## Creative Exclusions");
  lines.push(project.creativeExclusions || "_None declared._");
  lines.push("");

  lines.push("## Campaign Shape");
  lines.push(
    project.campaignShape ||
      `_Not yet defined -- run \`cutshort design objective ${project.slug}\`._`,
  );
  lines.push("");

  lines.push("## Target audience");
  lines.push(project.targetAudience || "_not provided_");
  lines.push("");

  lines.push("## What the source file is about");
  lines.push(project.fileDescription || "_not provided_");
  lines.push("");

  lines.push("## Platforms");
  for (const p of project.platforms) {
    lines.push(`- ${p}`);
  }
  lines.push("");

  lines.push("## Campaign length");
  lines.push(
    project.isCampaign ? `${project.campaignDays} days` : "Single post",
  );
  lines.push("");

  if (project.openQuestions && project.openQuestions.length > 0) {
    lines.push("## Open Questions");
    lines.push(
      "_Flagged by `design objective` as things it couldn't confidently fill in -- resolve before locking phases/topics._",
    );
    for (const q of project.openQuestions) {
      lines.push(`- ${q}`);
    }
    lines.push("");
  }

  lines.push("## Reference files");
  lines.push(
    "_Referenced by path, not copied into this folder -- source video/script can be large, and a copy adds no processing benefit. Every later command re-validates these paths still exist before running, since a moved/renamed/deleted source silently breaks a path reference._",
  );
  lines.push("");
  lines.push(`- Script: ${project.scriptPath ?? "not provided"}`);
  lines.push(`- Video: ${project.videoPath}`);
  const srtPath = findSrtFile(project.slug);
  lines.push(
    `- SRT: ${srtPath ?? `not yet transcribed -- run \`cutshort transcribe ${project.slug}\``}`,
  );

  if (project.relatedProjects && project.relatedProjects.length > 0) {
    lines.push("");
    lines.push("## Related campaigns");
    lines.push(
      "_Prior campaigns using the same source footage -- read these before proposing new topics, to avoid repeating already-covered material._",
    );
    for (const relatedSlug of project.relatedProjects) {
      lines.push(
        `- **${relatedSlug}**: objective ${objectiveMdPath(relatedSlug)}, design ${designJsonPath(relatedSlug)}`,
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}
