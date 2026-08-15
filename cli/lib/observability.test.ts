import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A real .env with real Langfuse keys is exactly what this feature asks the
// developer to create -- so these tests must never depend on whether one
// actually exists on disk. Mock fs.existsSync to keep the "disabled" tests
// deterministic regardless of the machine they run on.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn().mockReturnValue(false) };
});

describe("traceAgentCall -- Langfuse keys absent", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
  });

  it("passes straight through to run(), untouched", async () => {
    const { traceAgentCall } = await import("./observability");
    const run = vi.fn().mockResolvedValue("result");

    await expect(
      traceAgentCall({ agent: "claude", prompt: "p", projectDir: "/d" }, run),
    ).resolves.toBe("result");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("propagates run()'s rejection unchanged", async () => {
    const { traceAgentCall } = await import("./observability");
    const run = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(
      traceAgentCall({ agent: "claude", prompt: "p", projectDir: "/d" }, run),
    ).rejects.toThrow("boom");
  });
});

describe("traceAgentCall -- Langfuse keys present", () => {
  const forceFlush = vi.fn().mockResolvedValue(undefined);
  const register = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.LANGFUSE_PUBLIC_KEY = "pk_test";
    process.env.LANGFUSE_SECRET_KEY = "sk_test";
    forceFlush.mockResolvedValue(undefined);

    vi.doMock("@langfuse/otel", () => ({
      LangfuseSpanProcessor: vi.fn().mockImplementation(() => ({ forceFlush })),
    }));
    vi.doMock("@opentelemetry/sdk-trace-node", () => ({
      NodeTracerProvider: vi.fn().mockImplementation(() => ({ register })),
    }));
  });

  afterEach(() => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
  });

  it("wraps run() in a generation observation, records the output, and flushes", async () => {
    const update = vi.fn();
    const startActiveObservation = vi.fn(
      async (_name: string, fn: (obs: { update: typeof update }) => unknown, _options: unknown) =>
        fn({ update }),
    );
    vi.doMock("@langfuse/tracing", () => ({ startActiveObservation }));

    const { traceAgentCall } = await import("./observability");
    const run = vi.fn().mockResolvedValue({ ok: true });

    await expect(
      traceAgentCall({ agent: "codex", prompt: "do it", projectDir: "/d" }, run),
    ).resolves.toEqual({ ok: true });

    expect(startActiveObservation).toHaveBeenCalledTimes(1);
    const [, , options] = startActiveObservation.mock.calls[0];
    expect(options).toEqual({ asType: "generation" });
    expect(update).toHaveBeenNthCalledWith(1, {
      input: "do it",
      metadata: expect.objectContaining({ agent: "codex", projectDir: "/d" }),
    });
    expect(update).toHaveBeenNthCalledWith(2, { output: JSON.stringify({ ok: true }) });
    expect(forceFlush).toHaveBeenCalledTimes(1);
  });

  it("marks the observation as an error, still throws, but flushes first", async () => {
    const update = vi.fn();
    const startActiveObservation = vi.fn(async (_name, fn) => fn({ update }));
    vi.doMock("@langfuse/tracing", () => ({ startActiveObservation }));

    const { traceAgentCall } = await import("./observability");
    const run = vi.fn().mockRejectedValue(new Error("agent failed"));

    await expect(
      traceAgentCall({ agent: "claude", prompt: "p", projectDir: "/d" }, run),
    ).rejects.toThrow("agent failed");

    expect(update).toHaveBeenCalledWith({
      level: "ERROR",
      statusMessage: "agent failed",
    });
    expect(forceFlush).toHaveBeenCalledTimes(1);
  });

  it("still flushes and completes the agent task if the tracing library itself throws", async () => {
    const startActiveObservation = vi.fn().mockRejectedValue(new Error("langfuse down"));
    vi.doMock("@langfuse/tracing", () => ({ startActiveObservation }));

    const { traceAgentCall } = await import("./observability");
    const run = vi.fn().mockResolvedValue("unreachable");

    await expect(
      traceAgentCall({ agent: "claude", prompt: "p", projectDir: "/d" }, run),
    ).resolves.toBe("unreachable");
    expect(run).toHaveBeenCalledTimes(1);
    expect(forceFlush).toHaveBeenCalledTimes(1);
  });

  it("returns a successful agent result if recording that result fails", async () => {
    const update = vi.fn((values: Record<string, unknown>) => {
      if ("output" in values) {
        throw new Error("Langfuse output update failed");
      }
    });
    const startActiveObservation = vi.fn(async (_name, fn) => fn({ update }));
    vi.doMock("@langfuse/tracing", () => ({ startActiveObservation }));

    const { traceAgentCall } = await import("./observability");
    const run = vi.fn().mockResolvedValue("agent result");

    await expect(
      traceAgentCall({ agent: "claude", prompt: "p", projectDir: "/d" }, run),
    ).resolves.toBe("agent result");
    expect(run).toHaveBeenCalledTimes(1);
    expect(forceFlush).toHaveBeenCalledTimes(1);
  });
});
