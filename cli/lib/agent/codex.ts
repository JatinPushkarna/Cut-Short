import path from "node:path";
import { execWithTreeKillTimeout } from "./exec-with-timeout";
import {
  DEFAULT_AGENT_TIMEOUT_MS,
  type AgentProvider,
  type AgentRunOptions,
} from "./types";

export const codexProvider: AgentProvider = {
  name: "codex",

  async run({ prompt, projectDir }, options?: AgentRunOptions): Promise<string> {
    // On Windows, launching npm's .cmd shim with execFileSync fails on Node 24.
    // Call the globally installed JS entry point with Node instead. Keeping
    // shell:false also prevents prompt text from being interpreted by a shell.
    const isWindows = process.platform === "win32";
    const executable = isWindows ? process.execPath : "codex";
    const codexArgs = isWindows
      ? [
          path.join(
            process.env.APPDATA ?? "",
            "npm",
            "node_modules",
            "@openai",
            "codex",
            "bin",
            "codex.js",
          ),
        ]
      : [];
    return execWithTreeKillTimeout(
      executable,
      [
        ...codexArgs,
        "exec",
        prompt,
        "--ephemeral",
        "--approve-for-me",
        "-C",
        process.cwd(),
        "--add-dir",
        projectDir,
      ],
      {
        timeoutMs: options?.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
      },
    );
  },
};
