export const AGENT_NAMES = ["claude", "codex"] as const;

export type AgentName = (typeof AGENT_NAMES)[number];

export type AgentTask = {
  prompt: string;
  projectDir: string;
};

export type AgentRunOptions = {
  /** Maximum duration for one provider process. */
  timeoutMs?: number;
  /** Number of additional attempts after the first failed attempt. */
  retries?: number;
};

export const DEFAULT_AGENT_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_AGENT_RETRIES = 3;

export interface AgentProvider {
  readonly name: AgentName;
  run(task: AgentTask, options?: AgentRunOptions): string;
}

export function isAgentName(value: string): value is AgentName {
  return AGENT_NAMES.includes(value as AgentName);
}
