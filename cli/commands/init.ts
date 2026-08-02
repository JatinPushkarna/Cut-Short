import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import { PROJECTS_ROOT, projectDir, slugify } from "../lib/project";

type Answers = {
  projectName: string;
  objective: string;
  fileDescription: string;
  platforms: string[];
  isCampaign: boolean;
  campaignDays: number | null;
  hasScript: boolean;
  scriptPath: string | null;
  videoPath: string;
};

export async function initCommand(): Promise<void> {
  console.log("\nCut-Short -- let's set up your project.\n");

  const answers = (await prompts(
    [
      {
        type: "text",
        name: "projectName",
        message: "What would you like to call this project?",
      },
      {
        type: "text",
        name: "objective",
        message: "What's your objective? (e.g. grow followers, announce a release, drive traffic)",
      },
      {
        type: "text",
        name: "fileDescription",
        message: "What is the source file about?",
      },
      {
        type: "multiselect",
        name: "platforms",
        message: "Where would you like to post?",
        choices: [
          { title: "YouTube Shorts", value: "YouTube Shorts" },
          { title: "Instagram Reels", value: "Instagram Reels" },
          { title: "TikTok", value: "TikTok" },
        ],
        min: 1,
        hint: "space to select, enter to confirm",
      },
      {
        type: "confirm",
        name: "isCampaign",
        message: "Is this a multi-day campaign (vs. a single post)?",
        initial: true,
      },
      {
        type: (prev: boolean) => (prev ? "number" : null),
        name: "campaignDays",
        message: "How many days should the campaign run?",
        initial: 7,
      },
      {
        type: "confirm",
        name: "hasScript",
        message: "Do you have a script available?",
        initial: false,
      },
      {
        type: (prev: boolean) => (prev ? "text" : null),
        name: "scriptPath",
        message: "Path to the script file:",
      },
      {
        type: "text",
        name: "videoPath",
        message: "Path to your source video file:",
      },
    ],
    {
      onCancel: () => {
        console.log("\nCancelled -- no project was created.");
        process.exit(1);
      },
    }
  )) as Answers;

  // Referenced by path, not copied -- see objective.md note below for why.
  const videoAbsPath = path.resolve(answers.videoPath);
  if (!fs.existsSync(videoAbsPath)) {
    console.error(`\nCouldn't find a video file at: ${videoAbsPath}`);
    process.exit(1);
  }

  let scriptAbsPath: string | null = null;
  if (answers.scriptPath) {
    scriptAbsPath = path.resolve(answers.scriptPath);
    if (!fs.existsSync(scriptAbsPath)) {
      console.error(`\nCouldn't find a script file at: ${scriptAbsPath}`);
      process.exit(1);
    }
  }

  const slug = slugify(answers.projectName || answers.objective);
  const dir = projectDir(slug);

  if (fs.existsSync(dir)) {
    console.error(`\nA project already exists at projects/${slug} -- pick a different name.`);
    process.exit(1);
  }

  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
  fs.mkdirSync(dir);

  const objectiveMd = buildObjectiveMd(answers, { videoAbsPath, scriptAbsPath });
  fs.writeFileSync(path.join(dir, "objective.md"), objectiveMd);

  console.log(`\nProject created: projects/${slug}/`);
  console.log(`  - objective.md written`);
  console.log(`  - source video referenced (not copied): ${videoAbsPath}`);
  if (scriptAbsPath) {
    console.log(`  - script referenced (not copied): ${scriptAbsPath}`);
  }
  console.log(`\nNext: run \`npm run cutshort -- transcribe ${slug}\`\n`);
}

function buildObjectiveMd(
  answers: Answers,
  paths: { videoAbsPath: string; scriptAbsPath: string | null }
): string {
  const lines: string[] = [];
  lines.push(`# ${answers.projectName || "Untitled Project"}`);
  lines.push("");
  lines.push(`**Created:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push("## Objective");
  lines.push(answers.objective || "_not provided_");
  lines.push("");
  lines.push("## What the source file is about");
  lines.push(answers.fileDescription || "_not provided_");
  lines.push("");
  lines.push("## Platforms");
  for (const p of answers.platforms) {
    lines.push(`- ${p}`);
  }
  lines.push("");
  lines.push("## Campaign length");
  lines.push(answers.isCampaign ? `${answers.campaignDays} days` : "Single post");
  lines.push("");
  lines.push("## Source files");
  lines.push(
    "_Referenced by path, not copied into this folder -- source video/script can be large, and a copy adds no processing benefit. Every later command re-validates these paths still exist before running, since a moved/renamed/deleted source silently breaks a path reference._"
  );
  lines.push("");
  lines.push(`- Script: ${paths.scriptAbsPath ?? "not provided"}`);
  lines.push(`- Video: ${paths.videoAbsPath}`);
  lines.push("");
  return lines.join("\n");
}
