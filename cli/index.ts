#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { transcribeCommand } from "./commands/transcribe";
import { designPhasesCommand } from "./commands/design-phases";
import { designTopicsCommand } from "./commands/design-topics";
import { designContentStructureCommand } from "./commands/design-content-structure";

const program = new Command();

program
  .name("cutshort")
  .description(
    "Turn long-form source footage into short-form social clips, built around a repeatable hook/bridge/video/reveal/CTA template and a frame-verified, LLM-assisted pipeline."
  )
  .version("0.1.0");

program
  .command("init")
  .description("Start a new Cut-Short project: gather requirements and set up the project folder.")
  .action(initCommand);

program
  .command("transcribe <slug>")
  .description("Transcribe a project's source video with faster-whisper -> SRT + word-level timestamps.")
  .option("-m, --model <size>", "Whisper model size (base, medium, large-v3 -- must already be cached locally)", "medium")
  .action(transcribeCommand);

const DESIGN_STEPS = ["phases", "topics", "content-structure"] as const;

program
  .command("design <step> <slug>")
  .description(
    `Draft the campaign design, one approved level at a time: ${DESIGN_STEPS.join(" -> ")}.`
  )
  .action(async (step: string, slug: string) => {
    switch (step) {
      case "phases":
        return designPhasesCommand(slug);
      case "topics":
        return designTopicsCommand(slug);
      case "content-structure":
        return designContentStructureCommand(slug);
      default:
        console.error(`\nUnknown design step "${step}" -- must be one of: ${DESIGN_STEPS.join(", ")}`);
        process.exit(1);
    }
  });

program.parse();
