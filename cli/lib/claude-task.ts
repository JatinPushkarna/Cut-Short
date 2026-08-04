import { execFileSync } from "node:child_process";

// The shared agent-invocation layer every judgment-requiring pipeline stage
// calls into -- one place that knows how to shell out to headless Claude
// Code, so no stage reimplements the tool-use loop or JSON envelope parsing.
// See README's "Inner layer -- agent" section for the architecture this
// implements.

type ClaudeEnvelope = {
  is_error: boolean;
  result: string;
};

// Runs a scoped Claude Code task headlessly and returns its raw text result.
// `projectDir` is the only directory the invocation can read/write inside
// (via --add-dir) -- callers should point this at the specific project
// folder, not the whole repo, to keep each task's access scoped to the one
// thing it's supposed to be doing.
export function runClaudeTask(prompt: string, projectDir: string): string {
  const output = execFileSync(
    "claude",
    ["-p", prompt, "--output-format", "json", "--dangerously-skip-permissions", "--add-dir", projectDir],
    { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 }
  );

  const envelope = JSON.parse(output) as ClaudeEnvelope;
  if (envelope.is_error) {
    throw new Error(`Claude Code task failed: ${envelope.result ?? "(no result)"}`);
  }
  return envelope.result;
}

// Same as runClaudeTask, but for prompts that ask Claude to respond with
// JSON -- strips a ```json ... ``` fence if the model wrapped its answer in
// one despite being asked not to, and falls back to slicing out the first
// [...]/{...} block if there's still prose before or after it (a "no
// commentary" instruction doesn't always get followed to the letter).
export function runClaudeTaskJson<T>(prompt: string, projectDir: string): T {
  const result = runClaudeTask(prompt, projectDir);
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
  } catch (err) {
    throw new Error(
      `Claude Code task returned invalid JSON.\n\nRaw response:\n${result}\n\nParse error: ${(err as Error).message}`
    );
  }
}
