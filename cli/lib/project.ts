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

export function requireProjectDir(slug: string): string {
  const dir = projectDir(slug);
  if (!fs.existsSync(dir)) {
    console.error(`\nNo project found at public/Projects/${slug} -- run \`cutshort init\` first.`);
    process.exit(1);
  }
  return dir;
}
