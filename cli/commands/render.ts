import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readDesignData, saveDesignData, type Topic } from "../lib/design";
import { readProjectData, renderedDir, renderedVideoPath, requireProjectDir } from "../lib/project";

// Invoke Remotion's actual JS entry point with node directly, rather than
// through the npx wrapper. On Windows, npx resolves to the npx.cmd shim,
// which execFileSync cannot launch (spawnSync ... EINVAL, confirmed by
// hand -- passing shell: true "fixes" it but reintroduces the argument-
// injection risk Node itself warns about, and isn't needed here). This is
// the same class of problem the Codex provider's own Windows fix already
// worked around by calling node directly (see cli/lib/agent/codex.ts) --
// and unlike that fix, this one isn't even platform-conditional: calling
// node on the CLI's own JS file works identically everywhere, so there
// was never a reason to go through npx/npm at all.
export function remotionCliPath(): string {
  return path.resolve(
    process.cwd(),
    "node_modules",
    "@remotion",
    "cli",
    "remotion-cli.js",
  );
}

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
  execFileSync(
    process.execPath,
    [remotionCliPath(), "render", "src/index.ts", compositionId, outputPath],
    { stdio: "inherit" },
  );

  saveDesignData(slug, design!);
  console.log(`\nRendered: ${outputPath}`);
  console.log(
    `\nNot a clean final export yet. Remotion Studio's preview doesn't catch every defect that ` +
      `can appear in the actual exported file -- confirmed by a real single-frame flash that once ` +
      `shipped this way. Before labeling this final:\n` +
      `  1. (done) Rendered the reel.\n` +
      `  2. Run \`cutshort verify-render ${slug} --topic ${topicId}\`.\n` +
      `  3. Inspect every full-frame cut-boundary contact sheet it writes.\n` +
      `  4. Do one normal-speed manual watch in CapCut or VLC -- verify-render's scene detection can ` +
      `miss a subtle cut, a fade, or a cut hidden under full-screen text.\n` +
      `  5. Only then call it final.\n`,
  );
}
