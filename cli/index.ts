#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { transcribeCommand } from "./commands/transcribe";

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

program.parse();
