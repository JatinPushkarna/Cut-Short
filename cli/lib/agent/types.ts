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

// Which provider to shell out to when --agent is omitted -- match whichever
// coding agent is actually running this command, so it never pays the cost
// (extra process spawn, its own startup/tool-call overhead) of invoking the
// OTHER agent by accident. This is what caused a real edit-copy timeout: a
// Claude Code session ran `design edit-copy` without --agent, silently got
// the previous hardcoded "claude" default, and both agents overlapping in
// the same shell added enough overhead to blow through --agent-timeout.
//
// CLAUDECODE=1 is a confirmed, first-party signal Claude Code sets on every
// shell command it runs. CODEX_SANDBOX / CODEX_SANDBOX_NETWORK_DISABLED are
// what Codex sets when it runs a shell command under its own sandbox --
// less certain (OpenAI's own docs call these informal/undocumented, and
// they're conditional on sandbox mode/platform), so verify in a real Codex
// session that at least one of these is actually set before trusting this.
// Falls back to "claude" -- today's behavior -- if neither is detected, so
// this can only improve on a recognized environment, never regress an
// unrecognized one (a human's own terminal, CI, etc.).
export function detectDefaultAgent(): AgentName {
  if (process.env.CLAUDECODE) {
    return "claude";
  }
  if (process.env.CODEX_SANDBOX || process.env.CODEX_SANDBOX_NETWORK_DISABLED) {
    return "codex";
  }
  return "claude";
}
