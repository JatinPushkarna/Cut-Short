import { execWithTreeKillTimeout } from "./exec-with-timeout";
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

  async run({ prompt, projectDir }, options?: AgentRunOptions): Promise<string> {
    const output = await execWithTreeKillTimeout(
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
        timeoutMs: options?.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
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
