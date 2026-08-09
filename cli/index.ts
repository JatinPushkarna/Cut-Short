#!/usr/bin/env node
import fs from "node:fs";
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
import { designAmendCommand } from "./commands/design-amend";
import { renderCommand } from "./commands/render";
import {
  isAgentName,
  type AgentName,
  type AgentRunOptions,
} from "./lib/agent/types";

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
  "amend",
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
    "--agent-timeout <seconds>",
    "Maximum time for one agent attempt in seconds",
    "300",
  )
  .option(
    "--retries <count>",
    "Additional agent attempts after a failed proposal attempt (0-3). " +
      "Ignored by build: that stage has real side effects (writes the composition, " +
      "runs ffmpeg) and always runs once, regardless of this flag.",
    "3",
  )
  .option(
    "--finalize",
    "build only: re-extract an already-approved 720p proxy at full native resolution (mechanical, no LLM call)",
  )
  .option(
    "--skip-render",
    "finalize only: don't auto-render after finalizing -- useful when batch-finalizing several topics before rendering them all",
  )
  .option(
    "--feedback <notes>",
    "Non-interactive only (no TTY): regenerate this stage's candidate with revision notes, same as choosing " +
      '"Give feedback and regenerate" in the interactive menu. On Windows, long or multi-line ' +
      "feedback text gets mangled by PowerShell/npm argument passing -- use --feedback-file instead.",
  )
  .option(
    "--feedback-file <path>",
    "Same as --feedback, but read from a file (UTF-8) -- avoids shell quoting issues entirely. " +
      "Errors if both --feedback and --feedback-file are given.",
  )
  .option(
    "--stage <stage>",
    "approve/amend only: which stage's pending candidate (phases|topics|content-structure|edit-copy|build)",
  )
  .option(
    "--input <path>",
    "amend only: JSON file with the exact, already-known proposal content -- no agent call is made",
  )
  .action(
    async (
      step: string,
      slug: string,
      options: {
        topic?: string;
        finalize?: boolean;
        skipRender?: boolean;
        agent: string;
        agentTimeout: string;
        retries: string;
        feedback?: string;
        feedbackFile?: string;
        stage?: string;
        input?: string;
      },
    ) => {
      if (!isAgentName(options.agent)) {
        console.error(
          `\nUnknown agent "${options.agent}" -- must be one of: claude, codex`,
        );
        process.exit(1);
      }
      const agent: AgentName = options.agent;
      const agentTimeoutSeconds = Number(options.agentTimeout);
      const retries = Number(options.retries);
      if (!Number.isInteger(agentTimeoutSeconds) || agentTimeoutSeconds <= 0) {
        console.error("\n--agent-timeout must be a positive whole number of seconds.");
        process.exit(1);
      }
      if (!Number.isInteger(retries) || retries < 0 || retries > 3) {
        console.error("\n--retries must be a whole number from 0 to 3.");
        process.exit(1);
      }
      const agentOptions: AgentRunOptions = {
        timeoutMs: agentTimeoutSeconds * 1000,
        retries,
      };

      if (options.feedback && options.feedbackFile) {
        console.error(
          `\nPass --feedback or --feedback-file, not both -- unclear which one should win.`,
        );
        process.exit(1);
      }
      if (options.feedbackFile) {
        if (!fs.existsSync(options.feedbackFile)) {
          console.error(`\nNo file found at ${options.feedbackFile}.`);
          process.exit(1);
        }
        options.feedback = fs.readFileSync(options.feedbackFile, "utf-8");
      }

      switch (step) {
        case "phases":
          return designPhasesCommand(slug, agent, options.feedback, agentOptions);
        case "topics":
          return designTopicsCommand(slug, agent, options.feedback, agentOptions);
        case "content-structure":
          return designContentStructureCommand(
            slug,
            options.topic,
            agent,
            options.feedback,
            agentOptions,
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
            agentOptions,
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
            skipRender: options.skipRender,
            agent,
            feedback: options.feedback,
            agentOptions,
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
        case "amend":
          if (!options.stage) {
            console.error(
              `\n\`design amend\` needs --stage <stage> -- which pending candidate this content is for.`,
            );
            process.exit(1);
          }
          if (!options.input) {
            console.error(
              `\n\`design amend\` needs --input <path> -- the JSON file with the exact content.`,
            );
            process.exit(1);
          }
          return designAmendCommand(
            slug,
            options.stage,
            options.input,
            options.topic,
            agent,
          );
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
