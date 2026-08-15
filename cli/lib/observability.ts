import { existsSync } from "node:fs";
import path from "node:path";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startActiveObservation } from "@langfuse/tracing";
import type { AgentName } from "./agent/types";

// The single Langfuse integration point for every agent invocation in the
// pipeline -- runner.ts's runAgentTask/runAgentTaskJson call into this, and
// nothing else in the codebase touches Langfuse/OpenTelemetry directly. A
// tracing failure (missing keys, network error, bad credentials) always
// degrades to a console warning, never a broken pipeline run -- same
// contract as AI Studio's ai_studio_observability package, reimplemented
// here independently (no cross-repo dependency).
type Client = { processor: LangfuseSpanProcessor };

let client: Client | null | undefined;

function loadDotEnvOnce(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
    } catch (err) {
      console.warn(`Failed to load .env: ${(err as Error).message}`);
    }
  }
}

function getClient(): Client | null {
  if (client !== undefined) {
    return client;
  }

  // Vitest sets process.env.VITEST for every test run. Never auto-load the
  // real root .env under a test run -- a dev's real Langfuse credentials
  // sitting in that file would otherwise get picked up by any test that
  // exercises runAgentTask/runAgentTaskJson without explicitly mocking this
  // module, silently firing real traces during `npm test`. A test that wants
  // the "keys present" path sets process.env.LANGFUSE_* directly instead
  // (see observability.test.ts), which this check doesn't affect.
  if (
    !process.env.VITEST &&
    (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY)
  ) {
    loadDotEnvOnce();
  }

  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    client = null;
    return client;
  }

  try {
    // "immediate" export mode plus an explicit forceFlush() after every
    // trace (below) is deliberate belt-and-suspenders: this CLI calls
    // process.exit() from many places right after an agent call returns
    // (e.g. review-loop.ts's non-interactive path), which would otherwise
    // race a batched exporter's background flush and silently drop spans.
    const processor = new LangfuseSpanProcessor({ exportMode: "immediate" });
    const provider = new NodeTracerProvider({ spanProcessors: [processor] });
    provider.register();
    client = { processor };
  } catch (err) {
    console.warn(`Langfuse init failed, tracing disabled: ${(err as Error).message}`);
    client = null;
  }

  return client;
}

type TraceParams = {
  agent: AgentName;
  prompt: string;
  projectDir: string;
};

// Langfuse's own client has a `timeout` option (default 5s) for individual
// requests, but that doesn't guarantee forceFlush() itself ever settles --
// the same class of hang execWithTreeKillTimeout works around for the CLI's
// own child-process calls (see exec-with-timeout.ts). A stalled TLS
// handshake or a firewall black-holing the connection can leave the
// underlying network call pending with nothing to reject it. Race it
// against a hard timer so a Langfuse hang can never block a pipeline stage.
const LANGFUSE_FLUSH_TIMEOUT_MS = 8_000;

function withHardTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`${label} timed out after ${ms}ms, continuing without waiting further`);
      resolve(undefined);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        console.warn(`${label} failed: ${(err as Error).message}`);
        resolve(undefined);
      },
    );
  });
}

// Wraps one runAgentTask/runAgentTaskJson call (including its internal
// retries) in a single Langfuse trace. No-ops straight through to run() if
// tracing isn't configured, so callers behave identically either way.
export async function traceAgentCall<T>(params: TraceParams, run: () => Promise<T>): Promise<T> {
  const active = getClient();
  if (!active) {
    return run();
  }

  // Reflects the actual CLI invocation (e.g. "design phases") without
  // requiring every call site in cli/commands/*.ts to pass one in.
  const commandLabel = process.argv.slice(2, 4).join(" ") || params.agent;

  let result: T | undefined;
  let caught: unknown;
  let hadError = false;
  let runStarted = false;
  let runError: unknown;

  try {
    result = await startActiveObservation(
      commandLabel,
      async (generation) => {
        generation.update({
          input: params.prompt,
          metadata: {
            agent: params.agent,
            projectDir: params.projectDir,
            args: process.argv.slice(2),
          },
        });
        let output: T;
        try {
          runStarted = true;
          output = await run();
        } catch (err) {
          runError = err;
          try {
            generation.update({
              level: "ERROR",
              statusMessage: err instanceof Error ? err.message : String(err),
            });
          } catch (updateErr) {
            console.warn(`Langfuse error update failed: ${(updateErr as Error).message}`);
          }
          throw err;
        }

        // Retain the agent result before updating Langfuse. If that update
        // fails, tracing remains optional and we can still return it.
        result = output;
        generation.update({
          output: typeof output === "string" ? output : JSON.stringify(output),
        });
        return output;
      },
      { asType: "generation" },
    );
  } catch (err) {
    // Langfuse is optional. Only propagate errors from the real agent task;
    // tracing setup/export failures must never prevent a pipeline run.
    console.warn(`Langfuse observation failed, continuing without tracing: ${(err as Error).message}`);
    if (runError !== undefined) {
      hadError = true;
      caught = runError;
    } else if (!runStarted) {
      try {
        result = await run();
      } catch (runErr) {
        hadError = true;
        caught = runErr;
      }
    }
  }

  await withHardTimeout(active.processor.forceFlush(), LANGFUSE_FLUSH_TIMEOUT_MS, "Langfuse flush");

  if (hadError) {
    throw caught;
  }
  return result as T;
}
