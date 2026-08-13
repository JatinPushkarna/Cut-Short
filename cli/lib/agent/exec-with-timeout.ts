import { execFileSync, spawn } from "node:child_process";

export type ExecWithTimeoutOptions = {
  timeoutMs: number;
  maxBufferBytes?: number;
};

// execFileSync's own `timeout` option only signals the immediate child.
// The agent CLIs we shell out to (claude/codex) spawn their own child
// processes for tool calls (ffmpeg, more shells) -- on Windows, killing just
// the immediate child leaves those grandchildren running, and if one of them
// still holds the inherited stdout pipe open, execFileSync's synchronous
// read never sees EOF and blocks forever even though the timeout "fired".
// This is what caused a real edit-copy hang. Killing the whole process tree
// (not just the immediate child) is the actual fix, which requires managing
// the child asynchronously instead of relying on execFileSync's built-in
// timeout.
export function execWithTreeKillTimeout(
  executable: string,
  args: string[],
  options: ExecWithTimeoutOptions,
): Promise<string> {
  const maxBufferBytes = options.maxBufferBytes ?? 20 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, options.timeoutMs);

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk;
      if (stdout.length > maxBufferBytes) {
        killTree(child.pid);
        settle(() =>
          reject(new Error(`Output exceeded maxBuffer (${maxBufferBytes} bytes).`)),
        );
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      settle(() => reject(err));
    });

    child.on("close", (code) => {
      settle(() => {
        if (timedOut) {
          const err = new Error("timed out") as NodeJS.ErrnoException;
          err.code = "ETIMEDOUT";
          reject(err);
          return;
        }
        if (code !== 0) {
          const err = new Error(
            stderr.trim() || `exited with code ${code}`,
          ) as NodeJS.ErrnoException & { stderr?: string };
          err.stderr = stderr;
          reject(err);
          return;
        }
        resolve(stdout);
      });
    });
  });
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // Best-effort -- the process may have already exited on its own.
    }
    return;
  }
  try {
    // Negative pid targets the whole process group (see `detached: true` above).
    process.kill(-pid, "SIGKILL");
  } catch {
    // Best-effort -- the process may have already exited on its own.
  }
}
