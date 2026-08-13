import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import { objectiveMdPath, renderObjectiveMd } from "../lib/objective";
import {
  campaignDir,
  imagesDir,
  projectDir,
  scriptDir,
  sfxDir,
  slugify,
  srtDir,
  videoDir,
  writeProjectData,
  type ProjectData,
} from "../lib/project";
import { transcribeCommand } from "./transcribe";

type Answers = {
  projectName: string;
  objective: string;
  targetAudience: string;
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
        name: "targetAudience",
        message: "Who's the target audience? (e.g. demographics, interests, existing fans vs. cold audience)",
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
    console.error(`\nA project already exists at public/Projects/${slug} -- pick a different name.`);
    process.exit(1);
  }

  // One project, one folder: media (Assets/) and plan/reference material
  // (Script/, SRT/, Campaign/) all live under the same public/Projects/<slug>
  // root -- see cli/lib/project.ts for why this has to be under public/.
  fs.mkdirSync(videoDir(slug), { recursive: true });
  fs.mkdirSync(imagesDir(slug), { recursive: true });
  fs.mkdirSync(sfxDir(slug), { recursive: true });
  fs.mkdirSync(scriptDir(slug), { recursive: true });
  fs.mkdirSync(srtDir(slug), { recursive: true });
  fs.mkdirSync(campaignDir(slug), { recursive: true });

  const projectData: ProjectData = {
    slug,
    projectName: answers.projectName,
    objective: answers.objective,
    targetAudience: answers.targetAudience,
    fileDescription: answers.fileDescription,
    platforms: answers.platforms,
    isCampaign: answers.isCampaign,
    campaignDays: answers.isCampaign ? answers.campaignDays : null,
    videoPath: videoAbsPath,
    scriptPath: scriptAbsPath,
    createdAt: new Date().toISOString().slice(0, 10),
    template: null,
  };
  writeProjectData(slug, projectData);
  fs.writeFileSync(objectiveMdPath(slug), renderObjectiveMd(projectData));

  console.log(`\nProject created: public/Projects/${slug}/`);
  console.log(`  - Campaign/objective.md written`);
  console.log(`  - Campaign/project.json written (machine-readable -- later stages read this back)`);
  console.log(`  - Assets/Video, Assets/Images, Assets/Music/SFX, Script/, SRT/ folders ready`);
  console.log(`  - source video referenced (not copied): ${videoAbsPath}`);
  if (scriptAbsPath) {
    console.log(`  - script referenced (not copied): ${scriptAbsPath}`);
  }
  console.log(`\nStarting transcription automatically...\n`);
  try {
    await transcribeCommand(slug, { model: "medium" });
  } catch (err) {
    console.error(
      `\nProject created successfully -- that part is safe and locked in.\n` +
        `Auto-continuing into transcribe failed: ${err instanceof Error ? err.message : String(err)}\n` +
        `Nothing was lost. Retry just that stage yourself:\n` +
        `  cutshort transcribe ${slug}\n`,
    );
    process.exit(1);
  }
}
