import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readProjectData, requireProjectDir, srtDir } from "../lib/project";
import { designObjectiveCommand } from "./design-objective";

// Only sizes actually cached locally -- WhisperModel runs with
// local_files_only=True (see cli/lib/transcribe.py), so anything else fails
// fast here instead of the Python process attempting a network download
// that can fail in restricted environments.
const CACHED_MODELS = ["base", "medium", "large-v3"];

type TranscribeOptions = {
  model: string;
};

export async function transcribeCommand(slug: string, options: TranscribeOptions): Promise<void> {
  requireProjectDir(slug);
  const project = readProjectData(slug);

  if (!CACHED_MODELS.includes(options.model)) {
    console.error(
      `\nModel "${options.model}" isn't one of the locally cached sizes (${CACHED_MODELS.join(", ")}).\n` +
        `faster-whisper runs offline (local_files_only=True), so an uncached model fails rather than\n` +
        `silently downloading. Pick one of the cached sizes, or cache the model first.`
    );
    process.exit(1);
  }

  const videoBase = path.basename(project.videoPath, path.extname(project.videoPath));
  const outDir = srtDir(slug);
  fs.mkdirSync(outDir, { recursive: true });
  const srtOutPath = path.join(outDir, `${videoBase}.srt`);
  const wordsOutPath = path.join(outDir, `${videoBase}.words.json`);

  const pythonScript = path.join(__dirname, "..", "lib", "transcribe.py");

  console.log(`\nTranscribing: ${project.videoPath}`);
  console.log(`  model: ${options.model} (cached, offline)\n`);

  try {
    execFileSync("py", [pythonScript, project.videoPath, options.model, srtOutPath, wordsOutPath], {
      stdio: "inherit",
    });
  } catch {
    console.error(`\nTranscription failed -- see the Python error above.`);
    process.exit(1);
  }

  console.log(`\nDone.`);
  console.log(`  - ${path.relative(process.cwd(), srtOutPath)}`);
  console.log(`  - ${path.relative(process.cwd(), wordsOutPath)}`);

  console.log(`\nStarting design objective automatically...\n`);
  try {
    await designObjectiveCommand(slug);
  } catch (err) {
    console.error(
      `\nTranscription saved successfully -- that part is safe and locked in.\n` +
        `Auto-continuing into design objective failed: ${err instanceof Error ? err.message : String(err)}\n` +
        `Nothing was lost. Retry just that stage yourself:\n` +
        `  cutshort design objective ${slug}\n`,
    );
    process.exit(1);
  }
}
