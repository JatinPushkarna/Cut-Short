import { claudeProvider } from "./claude";
import { codexProvider } from "./codex";
import {
  DEFAULT_AGENT_RETRIES,
  DEFAULT_AGENT_TIMEOUT_MS,
  type AgentName,
  type AgentProvider,
  type AgentRunOptions,
} from "./types";

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

  // A provider (e.g. Claude's is_error envelope check) can already throw a
  // clear, agent-specific message of its own -- pass it through as-is rather
  // than wrapping it in a second "<agent> task failed:" prefix on top of it.
  if (
    error instanceof Error &&
    /task (failed|returned invalid JSON)/.test(error.message)
  ) {
    return error;
  }

  const stderr = cause.stderr?.toString().trim();
  return new Error(
    `${agent} task failed: ${stderr || cause.message || String(error)}`,
  );
}

function isRetryable(error: unknown): boolean {
  const cause = error as NodeJS.ErrnoException;
  return !["ENOENT", "EACCES", "EINVAL"].includes(cause.code ?? "");
}

function waitBeforeRetry(): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}

function resolvedOptions(options?: AgentRunOptions): Required<AgentRunOptions> {
  return {
    timeoutMs: options?.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
    retries: options?.retries ?? DEFAULT_AGENT_RETRIES,
  };
}

function runOnce(
  prompt: string,
  projectDir: string,
  agent: AgentName,
  timeoutMs: number,
): string {
  return getAgentProvider(agent).run({ prompt, projectDir }, { timeoutMs });
}

function runWithRetries<T>(
  agent: AgentName,
  options: Required<AgentRunOptions>,
  run: () => T,
): T {
  const maxAttempts = options.retries + 1;
  const failures: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Agent attempt ${attempt}/${maxAttempts}`);
    try {
      return run();
    } catch (error) {
      const formatted = executionError(agent, error);
      failures.push(formatted.message);
      if (!isRetryable(error) || attempt === maxAttempts) {
        const priorAttempts = failures.slice(0, -1);
        if (priorAttempts.length > 0) {
          formatted.message += `\nPrior attempts:\n${priorAttempts.join("\n")}`;
        }
        throw formatted;
      }

      console.log(
        `Attempt ${attempt} failed: ${formatted.message}\nRetrying in 1 second...`,
      );
      waitBeforeRetry();
    }
  }

  throw new Error(`${agent} task failed without an attempt result.`);
}

export function runAgentTask(
  prompt: string,
  projectDir: string,
  agent: AgentName = "claude",
  options?: AgentRunOptions,
): string {
  const resolved = resolvedOptions(options);
  return runWithRetries(agent, resolved, () =>
    runOnce(prompt, projectDir, agent, resolved.timeoutMs),
  );
}

// Agent prompts request JSON, but both CLIs can occasionally wrap it in a
// Markdown fence or a short sentence. Keep that provider-independent recovery
// at this boundary so pipeline stages receive the same contract either way.
export function runAgentTaskJson<T>(
  prompt: string,
  projectDir: string,
  agent: AgentName = "claude",
  options?: AgentRunOptions,
): T {
  const resolved = resolvedOptions(options);
  return runWithRetries(agent, resolved, () => {
    const result = runOnce(prompt, projectDir, agent, resolved.timeoutMs);
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
  });
}
