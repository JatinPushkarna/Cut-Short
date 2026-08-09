import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  DEFAULT_AGENT_TIMEOUT_MS,
  type AgentProvider,
  type AgentRunOptions,
} from "./types";

export const codexProvider: AgentProvider = {
  name: "codex",

  run({ prompt, projectDir }, options?: AgentRunOptions): string {
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
    return execFileSync(
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
        encoding: "utf-8",
        maxBuffer: 20 * 1024 * 1024,
        timeout: options?.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
      },
    );
  },
};
