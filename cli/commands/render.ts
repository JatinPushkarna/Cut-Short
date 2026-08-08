import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readDesignData, saveDesignData, type Topic } from "../lib/design";
import { readProjectData, renderedDir, renderedVideoPath, requireProjectDir } from "../lib/project";

// Purely mechanical -- no LLM call. `design build` already decided the
// composition and the clip it references; this stage's only job is to run
// Remotion's own renderer and put the output where every other stage
// (renderDesignMarkdown's "Rendered" section, in particular) already
// expects to find it: public/Projects/<slug>/Rendered/<topicId>.mp4.
// Before this existed, rendering meant hand-typing an `npx remotion render`
// command, and forgetting the explicit output path silently dropped the
// file into the repo's generic out/ folder instead -- untracked, in the
// wrong place, easy to lose track of.
export async function renderCommand(slug: string, topicId: string): Promise<void> {
  requireProjectDir(slug);
  readProjectData(slug);
  const design = readDesignData(slug);

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
      `\nTopic "${topicId}" has ${structures.length} content structures saved -- render needs ` +
        `exactly one locked variant. Trim design.json down to the one you're building before running this.`,
    );
    process.exit(1);
  }
  const structure = structures[0];

  if (!structure.build) {
    console.error(
      `\nTopic "${topicId}" hasn't been built yet -- run \`cutshort design build ${slug} --topic ${topicId}\` first.`,
    );
    process.exit(1);
  }

  if (structure.build.quality !== "final") {
    console.log(
      `\nWarning: this build is still a 720p review proxy, not the finalized clip -- ` +
        `the render below will be proxy quality too. Run \`cutshort design build ${slug} --topic ${topicId} --finalize\` ` +
        `first if this render is meant to actually go out.`,
    );
  }

  const compositionId = path.basename(structure.build.compositionFile, ".tsx");
  const outputPath = renderedVideoPath(slug, topicId);
  fs.mkdirSync(renderedDir(slug), { recursive: true });

  console.log(`\nRendering ${compositionId} -> ${outputPath} ...`);
  execFileSync("npx", ["remotion", "render", "src/index.ts", compositionId, outputPath], {
    stdio: "inherit",
  });

  saveDesignData(slug, design!);
  console.log(`\nRendered: ${outputPath}`);
}
