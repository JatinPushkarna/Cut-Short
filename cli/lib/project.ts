import fs from "node:fs";
import path from "node:path";

// Every generated project lives here, one folder per project. This directory
// is gitignored -- it's runtime output/user data, not part of the tool itself.
export const PROJECTS_ROOT = path.resolve(process.cwd(), "projects");

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

// Remotion's staticFile() only resolves paths inside public/, so any media a
// composition needs to reference (extracted clips, prepared stills) has to
// live there -- even though public/ itself is gitignored. Kept 1:1 with the
// project's slug so a composition's asset can always be traced back to its
// project. Nothing writes here yet (init only records path references) --
// this is the convention future commands (scan/clip/build) should follow.
export function publicAssetsDir(slug: string): string {
  return path.resolve(process.cwd(), "public", "projects", slug);
}

export function requireProjectDir(slug: string): string {
  const dir = projectDir(slug);
  if (!fs.existsSync(dir)) {
    console.error(`\nNo project found at projects/${slug} -- run \`cutshort init\` first.`);
    process.exit(1);
  }
  return dir;
}
