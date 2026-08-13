import { EventEmitter } from "node:events";
import { execFileSync, spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execWithTreeKillTimeout } from "./exec-with-timeout";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(),
}));

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;
const execFileSyncMock = execFileSync as unknown as ReturnType<typeof vi.fn>;

class FakeChild extends EventEmitter {
  pid = 4242;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

function setPlatform(platform: string) {
  Object.defineProperty(process, "platform", { value: platform });
}

describe("execWithTreeKillTimeout", () => {
  let originalPlatform: string;

  beforeEach(() => {
    originalPlatform = process.platform;
    spawnMock.mockReset();
    execFileSyncMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    vi.useRealTimers();
  });

  it("resolves with stdout on a clean exit", async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const promise = execWithTreeKillTimeout("claude", ["-p", "hi"], {
      timeoutMs: 5_000,
    });
    child.stdout.emit("data", Buffer.from("hello "));
    child.stdout.emit("data", Buffer.from("world"));
    child.emit("close", 0);

    await expect(promise).resolves.toBe("hello world");
  });

  it("rejects with the process's stderr on a non-zero exit", async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const promise = execWithTreeKillTimeout("claude", ["-p", "hi"], {
      timeoutMs: 5_000,
    });
    child.stderr.emit("data", Buffer.from("boom"));
    child.emit("close", 1);

    await expect(promise).rejects.toThrow("boom");
  });

  it("rejects on spawn error (e.g. ENOENT)", async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const promise = execWithTreeKillTimeout("claude", ["-p", "hi"], {
      timeoutMs: 5_000,
    });
    const err = Object.assign(new Error("missing"), { code: "ENOENT" });
    child.emit("error", err);

    await expect(promise).rejects.toBe(err);
  });

  it("kills the whole process tree via taskkill on Windows when the timeout fires", async () => {
    setPlatform("win32");
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const promise = execWithTreeKillTimeout("claude", ["-p", "hi"], {
      timeoutMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "taskkill",
      ["/pid", "4242", "/T", "/F"],
      expect.objectContaining({ stdio: "ignore" }),
    );

    // The child's own close event still needs to fire (e.g. once taskkill
    // actually terminates it) before the promise settles as a timeout.
    child.emit("close", null);
    await expect(promise).rejects.toMatchObject({ code: "ETIMEDOUT" });
  });

  it("kills the process group via SIGKILL on POSIX when the timeout fires", async () => {
    setPlatform("linux");
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    const promise = execWithTreeKillTimeout("claude", ["-p", "hi"], {
      timeoutMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(killSpy).toHaveBeenCalledWith(-4242, "SIGKILL");

    child.emit("close", null);
    await expect(promise).rejects.toMatchObject({ code: "ETIMEDOUT" });
    killSpy.mockRestore();
  });

  it("does not report a timeout if the process closes before the timer fires", async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const promise = execWithTreeKillTimeout("claude", ["-p", "hi"], {
      timeoutMs: 5_000,
    });
    child.stdout.emit("data", Buffer.from("done"));
    child.emit("close", 0);

    await expect(promise).resolves.toBe("done");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });
});
