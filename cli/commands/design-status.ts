import fs from "node:fs";
import path from "node:path";
import {
  readDesignData,
  type ContentStructure,
  type DesignData,
} from "../lib/design";
import { renderedDir, requireProjectDir } from "../lib/project";

// Purely mechanical, no LLM call -- reads design.json and the actual
// filesystem, never trusts either alone. Exists because a stage's own
// prerequisite checks (e.g. `design build` refusing to run without
// editCopy) only ever fire when that stage's command is actually invoked;
// an agent with raw file/bash access can write a composition, extract a
// clip, or run `npx remotion render` directly without ever calling a
// `cutshort` command, and none of those in-command checks can see that.
// This is the filesystem-side backstop: it doesn't care how a file got
// there, only whether design.json's ledger and the real files agree.

type TopicStatus = {
  topicId: string;
  title: string;
  stage: string;
  generatedBy: string;
  nextCommand: string;
};

function formatGeneratedBy(structure: ContentStructure): string {
  const parts: string[] = [];
  if (structure.generatedBy) parts.push(`content-structure:${structure.generatedBy}`);
  if (structure.editCopy?.generatedBy) parts.push(`edit-copy:${structure.editCopy.generatedBy}`);
  if (structure.build?.generatedBy) parts.push(`build:${structure.build.generatedBy}`);
  return parts.length > 0 ? parts.join(", ") : "unknown";
}

function computeTopicStatus(slug: string, topicId: string, title: string, structures: ContentStructure[]): TopicStatus {
  if (structures.length === 0) {
    return {
      topicId,
      title,
      stage: "no content structure yet",
      generatedBy: "--",
      nextCommand: `cutshort design content-structure ${slug} --topic ${topicId}`,
    };
  }
  if (structures.length > 1) {
    return {
      topicId,
      title,
      stage: `${structures.length} variants saved, not trimmed to one`,
      generatedBy: "--",
      nextCommand: `(edit Campaign/design.json down to the one variant you're building, then continue)`,
    };
  }

  const structure = structures[0];
  const generatedBy = formatGeneratedBy(structure);

  if (!structure.editCopy) {
    return { topicId, title, stage: "content structure locked", generatedBy, nextCommand: `cutshort design edit-copy ${slug} --topic ${topicId}` };
  }
  if (!structure.build) {
    return { topicId, title, stage: "edit copy locked", generatedBy, nextCommand: `cutshort design build ${slug} --topic ${topicId}` };
  }
  if (structure.build.quality !== "final") {
    return { topicId, title, stage: "720p proxy built, pending review", generatedBy, nextCommand: `cutshort design build ${slug} --topic ${topicId} --finalize` };
  }
  return { topicId, title, stage: "finalized -- ready to render", generatedBy, nextCommand: `cutshort render ${slug} --topic ${topicId}` };
}

function auditFilesystem(slug: string, design: DesignData | null): string[] {
  const issues: string[] = [];

  // topicId -> absolute compositionFile path, for every topic with a locked build
  const knownCompositions = new Map<string, string>();
  const finalizedTopicIds = new Set<string>();

  for (const phase of design?.phases ?? []) {
    for (const topic of phase.topics ?? []) {
      const structure = topic.contentStructures?.[0];
      if (structure?.build) {
        knownCompositions.set(topic.id, path.resolve(structure.build.compositionFile));
        if (structure.build.quality === "final") {
          finalizedTopicIds.add(topic.id);
        }
      }
    }
  }
  const knownTopicIds = new Set(knownCompositions.keys());

  // 1. Composition files on disk with no matching design.json record.
  const srcDir = path.resolve(process.cwd(), "src", "projects-local", slug);
  const knownCompositionPaths = new Set(knownCompositions.values());
  if (fs.existsSync(srcDir)) {
    for (const file of fs.readdirSync(srcDir)) {
      if (!file.endsWith(".tsx")) continue;
      const fullPath = path.join(srcDir, file);
      if (!knownCompositionPaths.has(fullPath)) {
        issues.push(
          `UNTRACKED COMPOSITION: src/projects-local/${slug}/${file} exists on disk but has no ` +
            `matching design.json build record -- no locked copy, no frame-verified ` +
            `cut list, no human approval on record for this file. Was it hand-authored ` +
            `outside \`design build\`?`,
        );
      }
    }
  }

  // 2. design.json points at a composition file that isn't actually there.
  for (const [topicId, compositionFile] of knownCompositions) {
    if (!fs.existsSync(compositionFile)) {
      issues.push(`MISSING: topic "${topicId}"'s design.json record points at ${compositionFile}, which isn't on disk.`);
    }
  }

  // 3. Rendered/ folder -- exact match (checked for staleness), mis-named/stray, or untracked.
  const renderedDirPath = renderedDir(slug);
  const seenRenderedTopicIds = new Set<string>();
  if (fs.existsSync(renderedDirPath)) {
    for (const file of fs.readdirSync(renderedDirPath)) {
      const exactTopicId = file.endsWith(".mp4") ? file.slice(0, -4) : null;
      if (exactTopicId && knownTopicIds.has(exactTopicId)) {
        seenRenderedTopicIds.add(exactTopicId);
        // A render can exist at exactly the right path and still be stale --
        // e.g. build proxy -> render (while still a proxy) -> finalize. The
        // finalize step rewrites the composition file (a new clip reference)
        // but never re-renders, so the old proxy-era render silently keeps
        // passing an exact-name check unless it's compared against what the
        // composition looks like now.
        const compositionFile = knownCompositions.get(exactTopicId);
        if (compositionFile && fs.existsSync(compositionFile)) {
          const renderedMtime = fs.statSync(path.join(renderedDirPath, file)).mtimeMs;
          const compositionMtime = fs.statSync(compositionFile).mtimeMs;
          if (renderedMtime < compositionMtime) {
            issues.push(
              `STALE RENDER: "Rendered/${file}" is older than its composition file's last ` +
                `change (rendered ${new Date(renderedMtime).toISOString()}, composition changed ` +
                `${new Date(compositionMtime).toISOString()}) -- likely rendered before ` +
                `\`design build --finalize\` (or a later edit) ran. Run \`cutshort render\` again.`,
            );
          }
        }
        continue;
      }
      const matchingTopic = [...knownTopicIds].find((id) => file.startsWith(id));
      if (matchingTopic) {
        issues.push(
          `STRAY FILE IN Rendered/: "${file}" doesn't match the exact "${matchingTopic}.mp4" this ` +
            `pipeline expects. Proxy/final/debug output never belongs in Rendered/ -- that's ` +
            `Assets/Video/, Final/Video/, or .frame-check/. Confirm which file is the real ` +
            `deliverable, then move or delete the other.`,
        );
      } else {
        issues.push(`RENDERED WITH NO MATCHING RECORD: "Rendered/${file}" exists but design.json has no locked build for a topic by that name.`);
      }
    }
  }

  // 4. A finalized topic that was never actually rendered.
  for (const topicId of finalizedTopicIds) {
    if (!seenRenderedTopicIds.has(topicId)) {
      issues.push(`NOT YET RENDERED: topic "${topicId}" is finalized in design.json but Rendered/${topicId}.mp4 doesn't exist -- run \`cutshort render\`.`);
    }
  }

  // 5. A locked, on-disk composition that was never registered in
  // Root.local.tsx -- `design build`'s prompt asks the agent to do this,
  // but nothing mechanically enforces it, so a build can succeed while
  // still leaving `cutshort render` unable to find the composition.
  const rootLocalPath = path.resolve(process.cwd(), "src", "Root.local.tsx");
  const rootLocalContent = fs.existsSync(rootLocalPath)
    ? fs.readFileSync(rootLocalPath, "utf-8")
    : null;
  for (const [topicId, compositionFile] of knownCompositions) {
    if (!fs.existsSync(compositionFile)) continue; // already reported as MISSING above
    const compositionId = path.basename(compositionFile, ".tsx");
    if (!rootLocalContent || !rootLocalContent.includes(`id="${compositionId}"`)) {
      issues.push(
        `NOT REGISTERED: topic "${topicId}"'s composition (${compositionId}) exists on disk ` +
          `and is locked in design.json, but isn't registered in src/Root.local.tsx -- ` +
          `\`cutshort render\` will fail to find it. Add a <Composition id="${compositionId}"> entry.`,
      );
    }
  }

  return issues;
}

export function designStatusCommand(slug: string, topicId?: string): void {
  requireProjectDir(slug);
  const design = readDesignData(slug);

  if (!design) {
    console.log(`\nNo Campaign/design.json for ${slug} yet -- run \`cutshort design phases ${slug}\` first.\n`);
    return;
  }

  if (topicId) {
    const exists = design.phases.some((phase) =>
      (phase.topics ?? []).some((t) => t.id === topicId),
    );
    if (!exists) {
      console.error(`\nTopic "${topicId}" not found for ${slug}.`);
      process.exit(1);
    }
  }

  console.log(`\nPipeline status -- ${slug}\n`);

  for (const phase of design.phases) {
    const topics = (phase.topics ?? []).filter((t) => !topicId || t.id === topicId);
    if (topics.length === 0) continue;

    console.log(`${phase.name} (${phase.id})`);
    for (const topic of topics) {
      const status = computeTopicStatus(slug, topic.id, topic.title, topic.contentStructures ?? []);
      console.log(`  ${status.topicId}: ${status.title}`);
      console.log(`    stage:       ${status.stage}`);
      console.log(`    generated by: ${status.generatedBy}`);
      console.log(`    next:        ${status.nextCommand}`);
    }
    console.log("");
  }

  const issues = auditFilesystem(slug, design);
  if (issues.length === 0) {
    console.log(`Filesystem audit: OK -- every composition and rendered file matches a locked design.json record.\n`);
  } else {
    console.log(`Filesystem audit -- ${issues.length} issue(s) found:\n`);
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
    console.log("");
  }
}
