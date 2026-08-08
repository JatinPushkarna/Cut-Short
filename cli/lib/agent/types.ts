export const AGENT_NAMES = ["claude", "codex"] as const;

export type AgentName = (typeof AGENT_NAMES)[number];

export type AgentTask = {
  prompt: string;
  projectDir: string;
};

export interface AgentProvider {
  readonly name: AgentName;
  run(task: AgentTask): string;
}

export function isAgentName(value: string): value is AgentName {
  return AGENT_NAMES.includes(value as AgentName);
}
