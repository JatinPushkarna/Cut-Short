import fs from "node:fs";
import path from "node:path";

// Every cutshort project lives entirely under public/Projects/<slug>/ --
// Remotion's staticFile() only resolves paths inside public/, so keeping
// plan data (objective.md) in the same tree as the media it describes means
// one project is one folder, not split across two gitignored roots.
export const PROJECTS_ROOT = path.resolve(process.cwd(), "public", "Projects");

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 40);
  return slug || "untitled-project";
}

export function projectDir(slug: string): string {
  return path.join(PROJECTS_ROOT, slug);
}

// Plan/reference material -- objective.md and campaign planning docs.
// Not loaded by any composition, so it's just notes sitting in the tree.
export function campaignDir(slug: string): string {
  return path.join(projectDir(slug), "Campaign");
}

// Screenplay/script reference material.
export function scriptDir(slug: string): string {
  return path.join(projectDir(slug), "Script");
}

// Where a non-interactive design command's unapproved candidate lives --
// see review-loop.ts. `cutshort design approve` reads this exact path and
// deletes it once its contents are actually saved to design.json; nothing
// else should read or write here.
export function pendingCandidatePath(
  slug: string,
  stage: string,
  topicId?: string,
): string {
  const filename = topicId ? `${stage}-${topicId}.json` : `${stage}.json`;
  return path.join(campaignDir(slug), ".pending", filename);
}

// Transcript and caption files (.srt/.txt/.vtt).
export function srtDir(slug: string): string {
  return path.join(projectDir(slug), "SRT");
}

// Media a composition actually loads via staticFile() -- video/images/audio.
export function assetsDir(slug: string): string {
  return path.join(projectDir(slug), "Assets");
}

export function videoDir(slug: string): string {
  return path.join(assetsDir(slug), "Video");
}

export function imagesDir(slug: string): string {
  return path.join(assetsDir(slug), "Images");
}

export function musicDir(slug: string): string {
  return path.join(assetsDir(slug), "Music");
}

export function sfxDir(slug: string): string {
  return path.join(musicDir(slug), "SFX");
}

// Final rendered deliverables -- not a Remotion-loaded asset, so it's a
// sibling of Assets/Campaign/Script/SRT rather than nested under assetsDir().
export function renderedDir(slug: string): string {
  return path.join(projectDir(slug), "Rendered");
}

export function renderedVideoPath(slug: string, topicId: string): string {
  return path.join(renderedDir(slug), `${topicId}.mp4`);
}

// Verification/debug output only (contact sheets, check frames) -- never a
// pipeline-owned asset. Sibling of Assets/Rendered/Final, per CLAUDE.md's
// "clean up anything you put elsewhere" convention for where this kind of
// output belongs.
export function frameCheckDir(slug: string): string {
  return path.join(projectDir(slug), ".frame-check");
}

// Finalized (full native resolution) extracted clips -- deliberately a
// sibling of Assets/, not nested under it, so Assets/Video/ can stay a hard
// "720p proxies only" guarantee: no code path that only ever needs to read
// proxies has any reason to look here, and `design build --finalize` is the
// only thing that ever writes here.
export function finalVideoDir(slug: string): string {
  return path.join(projectDir(slug), "Final", "Video");
}

export function finalVideoPath(slug: string, topicId: string): string {
  return path.join(finalVideoDir(slug), `${topicId}.mp4`);
}

export function requireProjectDir(slug: string): string {
  const dir = projectDir(slug);
  if (!fs.existsSync(dir)) {
    console.error(`\nNo project found at public/Projects/${slug} -- run \`cutshort init\` first.`);
    process.exit(1);
  }
  return dir;
}

// Structured record of what `init` captured -- objective.md is the
// human-readable version of the same answers, this is the machine-readable
// one every later stage reads back (source paths, platforms, etc.) instead
// of parsing markdown.
export type ProjectData = {
  slug: string;
  projectName: string;
  objective: string;
  targetAudience: string;
  fileDescription: string;
  platforms: string[];
  isCampaign: boolean;
  campaignDays: number | null;
  videoPath: string;
  scriptPath: string | null;
  createdAt: string;
  // Which src/templates/<name>/ this project's compositions are built
  // against -- set by `cutshort template`, null until that's run.
  template: string | null;
  // Prior campaign project slugs that used the same source footage --
  // `cutshort design objective` determines this itself (comparing videoPath/
  // fileDescription against every other project's project.json, then
  // reading the matches' real objective.md/design.json), not something the
  // human declares at init. Absent/empty means it found no prior campaign
  // for this source (the cold-start case). Set once that stage's proposal
  // is approved.
  relatedProjects?: string[];
  // The following four are set by `cutshort design objective <slug>` --
  // that stage is REQUIRED (design-phases.ts refuses to run without it),
  // so these are absent only before it's been run and approved once.
  // distributionAdvantage/creativeExclusions individually stay optional
  // even after that -- a brand-new campaign may genuinely have neither.
  narrativeDirection?: string;
  distributionAdvantage?: string;
  creativeExclusions?: string;
  campaignShape?: string;
  // Things `design objective` couldn't confidently fill in on its own --
  // surfaced in objective.md so they don't get silently guessed at.
  openQuestions?: string[];
};

export function projectJsonPath(slug: string): string {
  return path.join(campaignDir(slug), "project.json");
}

export function writeProjectData(slug: string, data: ProjectData): void {
  fs.writeFileSync(projectJsonPath(slug), JSON.stringify(data, null, 2));
}

// Every later stage re-validates source paths still exist before running --
// a moved/renamed/deleted source silently breaks a path reference otherwise.
export function readProjectData(slug: string): ProjectData {
  const jsonPath = projectJsonPath(slug);
  if (!fs.existsSync(jsonPath)) {
    console.error(`\nNo project.json found for ${slug} -- run \`cutshort init\` first.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as ProjectData;

  if (!fs.existsSync(data.videoPath)) {
    console.error(
      `\nSource video no longer found at: ${data.videoPath}\nIt may have moved, been renamed, or been deleted since \`cutshort init\` ran.`
    );
    process.exit(1);
  }
  if (data.scriptPath && !fs.existsSync(data.scriptPath)) {
    console.error(
      `\nScript file no longer found at: ${data.scriptPath}\nIt may have moved, been renamed, or been deleted since \`cutshort init\` ran.`
    );
    process.exit(1);
  }

  return data;
}

// Lightweight inventory of every OTHER project on disk -- what `design
// objective` uses to figure out for itself whether this campaign builds on
// a prior one using the same source footage, instead of asking the human
// to remember and type project slugs. Deliberately cheap (just the fields
// needed to judge relatedness): the agent decides which of these actually
// match and reads their real objective.md/design.json itself once it does.
export function listOtherProjects(
  excludeSlug: string,
): Pick<ProjectData, "slug" | "videoPath" | "fileDescription" | "objective">[] {
  if (!fs.existsSync(PROJECTS_ROOT)) {
    return [];
  }
  const results: Pick<
    ProjectData,
    "slug" | "videoPath" | "fileDescription" | "objective"
  >[] = [];
  for (const entry of fs.readdirSync(PROJECTS_ROOT)) {
    if (entry === excludeSlug) {
      continue;
    }
    const jsonPath = projectJsonPath(entry);
    if (!fs.existsSync(jsonPath)) {
      continue;
    }
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as ProjectData;
      results.push({
        slug: data.slug,
        videoPath: data.videoPath,
        fileDescription: data.fileDescription,
        objective: data.objective,
      });
    } catch {
      // Malformed project.json -- skip it rather than failing the whole scan.
      continue;
    }
  }
  return results;
}
