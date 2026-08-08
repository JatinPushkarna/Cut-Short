import { claudeProvider } from "./claude";
import { codexProvider } from "./codex";
import type { AgentName, AgentProvider } from "./types";

const providers: Record<AgentName, AgentProvider> = {
  claude: claudeProvider,
  codex: codexProvider,
};

export function getAgentProvider(agent: AgentName): AgentProvider {
  return providers[agent];
}

function executionError(agent: AgentName, error: unknown): Error {
  const cause = error as NodeJS.ErrnoException & { stderr?: string | Buffer };
  if (cause.code === "ENOENT") {
    return new Error(`${agent} is not installed or is not available on PATH.`);
  }

  const stderr = cause.stderr?.toString().trim();
  return new Error(
    `${agent} task failed: ${stderr || cause.message || String(error)}`,
  );
}

export function runAgentTask(
  prompt: string,
  projectDir: string,
  agent: AgentName = "claude",
): string {
  try {
    return getAgentProvider(agent).run({ prompt, projectDir });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Claude Code task failed:")
    ) {
      throw error;
    }
    throw executionError(agent, error);
  }
}

// Agent prompts request JSON, but both CLIs can occasionally wrap it in a
// Markdown fence or a short sentence. Keep that provider-independent recovery
// at this boundary so pipeline stages receive the same contract either way.
export function runAgentTaskJson<T>(
  prompt: string,
  projectDir: string,
  agent: AgentName = "claude",
): T {
  const result = runAgentTask(prompt, projectDir, agent);
  const fenced = result.match(/```(?:json)?\s*([\s\S]*?)```/);
  let jsonText = (fenced ? fenced[1] : result).trim();

  if (!jsonText.startsWith("[") && !jsonText.startsWith("{")) {
    const start = jsonText.search(/[[{]/);
    const openChar = jsonText[start];
    const closeChar = openChar === "[" ? "]" : "}";
    const end = jsonText.lastIndexOf(closeChar);
    if (start !== -1 && end > start) {
      jsonText = jsonText.slice(start, end + 1);
    }
  }

  try {
    return JSON.parse(jsonText) as T;
  } catch (error) {
    throw new Error(
      `${agent} task returned invalid JSON.\n\nRaw response:\n${result}\n\nParse error: ${(error as Error).message}`,
    );
  }
}
