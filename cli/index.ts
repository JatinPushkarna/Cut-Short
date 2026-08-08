#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { transcribeCommand } from "./commands/transcribe";
import { designPhasesCommand } from "./commands/design-phases";
import { designTopicsCommand } from "./commands/design-topics";
import { designContentStructureCommand } from "./commands/design-content-structure";
import { designEditCopyCommand } from "./commands/design-edit-copy";
import { designBuildCommand } from "./commands/design-build";
import { designStatusCommand } from "./commands/design-status";
import { designApproveCommand } from "./commands/design-approve";
import { renderCommand } from "./commands/render";
import { isAgentName, type AgentName } from "./lib/agent/types";

const program = new Command();

program
  .name("cutshort")
  .description(
    "Turn long-form source footage into short-form social clips, built around a repeatable hook/bridge/video/reveal/CTA template and a frame-verified, LLM-assisted pipeline.",
  )
  .version("0.1.0");

program
  .command("init")
  .description(
    "Start a new Cut-Short project: gather requirements and set up the project folder.",
  )
  .action(initCommand);

program
  .command("transcribe <slug>")
  .description(
    "Transcribe a project's source video with faster-whisper -> SRT + word-level timestamps.",
  )
  .option(
    "-m, --model <size>",
    "Whisper model size (base, medium, large-v3 -- must already be cached locally)",
    "medium",
  )
  .action(transcribeCommand);

const DESIGN_STEPS = [
  "phases",
  "topics",
  "content-structure",
  "edit-copy",
  "build",
  "status",
  "approve",
] as const;

program
  .command("design <step> <slug>")
  .description(
    `Draft the campaign design, one approved level at a time: ${DESIGN_STEPS.join(" -> ")}.`,
  )
  .option(
    "--topic <id>",
    "Scope to a single topic id (content-structure: optional scope; edit-copy/build/approve: required for those stages)",
  )
  .option("--agent <provider>", "Agent provider: claude or codex", "claude")
  .option(
    "--finalize",
    "build only: re-extract an already-approved 720p proxy at full native resolution (mechanical, no LLM call)",
  )
  .option(
    "--feedback <notes>",
    "Non-interactive only (no TTY): regenerate this stage's candidate with revision notes, same as choosing " +
      '"Give feedback and regenerate" in the interactive menu',
  )
  .option(
    "--stage <stage>",
    "approve only: which pending candidate to approve (phases|topics|content-structure|edit-copy|build)",
  )
  .action(
    async (
      step: string,
      slug: string,
      options: {
        topic?: string;
        finalize?: boolean;
        agent: string;
        feedback?: string;
        stage?: string;
      },
    ) => {
      if (!isAgentName(options.agent)) {
        console.error(
          `\nUnknown agent "${options.agent}" -- must be one of: claude, codex`,
        );
        process.exit(1);
      }
      const agent: AgentName = options.agent;

      switch (step) {
        case "phases":
          return designPhasesCommand(slug, agent, options.feedback);
        case "topics":
          return designTopicsCommand(slug, agent, options.feedback);
        case "content-structure":
          return designContentStructureCommand(
            slug,
            options.topic,
            agent,
            options.feedback,
          );
        case "edit-copy":
          if (!options.topic) {
            console.error(
              `\n\`design edit-copy\` needs --topic <id> -- it operates on one locked topic at a time.`,
            );
            process.exit(1);
          }
          return designEditCopyCommand(
            slug,
            options.topic,
            agent,
            options.feedback,
          );
        case "build":
          if (!options.topic) {
            console.error(
              `\n\`design build\` needs --topic <id> -- it operates on one locked topic at a time.`,
            );
            process.exit(1);
          }
          return designBuildCommand(slug, options.topic, {
            finalize: options.finalize,
            agent,
            feedback: options.feedback,
          });
        case "status":
          return designStatusCommand(slug, options.topic);
        case "approve":
          if (!options.stage) {
            console.error(
              `\n\`design approve\` needs --stage <stage> -- which pending candidate to approve.`,
            );
            process.exit(1);
          }
          return designApproveCommand(slug, options.stage, options.topic);
        default:
          console.error(
            `\nUnknown design step "${step}" -- must be one of: ${DESIGN_STEPS.join(", ")}`,
          );
          process.exit(1);
      }
    },
  );

program
  .command("render <slug>")
  .description(
    "Render a built topic's composition to public/Projects/<slug>/Rendered/<topicId>.mp4 (mechanical, no LLM call).",
  )
  .requiredOption("--topic <id>", "Topic id -- render operates on one built topic at a time")
  .action(async (slug: string, options: { topic: string }) => {
    return renderCommand(slug, options.topic);
  });

program.parse();
