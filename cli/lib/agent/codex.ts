import { execFileSync } from "node:child_process";
import type { AgentProvider } from "./types";

export const codexProvider: AgentProvider = {
  name: "codex",

  run({ prompt, projectDir }): string {
    return execFileSync(
      "codex",
      [
        "exec",
        prompt,
        "--ephemeral",
        "--approve-for-me",
        "-C",
        process.cwd(),
        "--add-dir",
        projectDir,
      ],
      { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 },
    );
  },
};
