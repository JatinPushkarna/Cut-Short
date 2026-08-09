import { execFileSync } from "node:child_process";
import {
  DEFAULT_AGENT_TIMEOUT_MS,
  type AgentProvider,
  type AgentRunOptions,
} from "./types";

type ClaudeEnvelope = {
  is_error: boolean;
  result: string;
};

export const claudeProvider: AgentProvider = {
  name: "claude",

  run({ prompt, projectDir }, options?: AgentRunOptions): string {
    const output = execFileSync(
      "claude",
      [
        "-p",
        prompt,
        "--output-format",
        "json",
        "--dangerously-skip-permissions",
        "--add-dir",
        projectDir,
      ],
      {
        encoding: "utf-8",
        maxBuffer: 20 * 1024 * 1024,
        timeout: options?.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
      },
    );

    const envelope = JSON.parse(output) as ClaudeEnvelope;
    if (envelope.is_error) {
      throw new Error(
        `Claude Code task failed: ${envelope.result ?? "(no result)"}`,
      );
    }
    return envelope.result;
  },
};
