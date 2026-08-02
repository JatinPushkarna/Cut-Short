#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init";

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

program.parse();
