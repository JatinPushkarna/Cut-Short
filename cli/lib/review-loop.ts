import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import type { AgentName } from "./agent/types";

type PendingCandidate<T> = {
  proposal: T;
  generatedBy: AgentName;
  generatedAt: string;
};

export type ReviewLoopOptions = {
  agent: AgentName;
  // Where a non-interactive run saves its unapproved candidate --
  // see project.ts's pendingCandidatePath().
  pendingPath: string;
  // The exact `cutshort design approve ...` invocation to print, so an
  // agent (or human) reading the output knows precisely what to run next.
  approveCommand: string;
  // From the CLI's --feedback flag -- only meaningful non-interactively,
  // since the interactive loop collects its own feedback via prompts.
  initialFeedback?: string;
};

// Shared human-checkpoint loop for every judgment-requiring stage: generate
// a candidate, show it, let the human approve/steer/regenerate. Nothing
// here runs unattended past one candidate without an explicit approval --
// see README's "Collaborative by default, not autonomous by default".
//
// Two paths, chosen automatically by whether a real terminal is attached
// (process.stdout.isTTY) -- never by a flag, so nothing has to remember to
// pass one. An agent driving this through a tool-call shell has no TTY, the
// same way a human at a real terminal always does; this is what actually
// distinguishes the two cases, not who happens to be issuing the command.
//
// Interactive: unchanged from before -- loop on the arrow-key menu until
// Approve, returning the approved result to the caller to save.
//
// Non-interactive: generate exactly once, write the candidate to disk
// as a *pending* record (not saved to Campaign/design.json), print it in
// full, and exit -- never approving anything on its own. A separate
// `cutshort design approve` command is the only thing that can turn a
// pending candidate into a real, saved one; see design-approve.ts.
export async function reviewLoop<T>(
  generate: (feedback: string | undefined) => T,
  render: (result: T) => string,
  options: ReviewLoopOptions
): Promise<T> {
  if (!process.stdout.isTTY) {
    console.log(`\nAsking ${options.agent}...\n`);
    const result = generate(options.initialFeedback);
    console.log(render(result));

    const pending: PendingCandidate<T> = {
      proposal: result,
      generatedBy: options.agent,
      generatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(options.pendingPath), { recursive: true });
    fs.writeFileSync(options.pendingPath, JSON.stringify(pending, null, 2));

    console.log(
      "\nNot saved -- no interactive terminal detected, so this is a " +
        "proposal only, not an approval.",
    );
    console.log(`To approve:  ${options.approveCommand}`);
    console.log(
      `To revise:   rerun this exact command with --feedback "<notes>"`,
    );
    process.exit(0);
  }

  let feedback: string | undefined = undefined;

  while (true) {
    console.log(`\nAsking ${options.agent}...\n`);
    const result = generate(feedback);
    console.log(render(result));

    const answer = await prompts({
      type: "select",
      name: "action",
      message: "What next?",
      choices: [
        { title: "Approve", value: "approve" },
        { title: "Give feedback and regenerate", value: "feedback" },
        { title: "Regenerate (no feedback)", value: "regenerate" },
      ],
    });

    if (answer.action === "approve") {
      return result;
    }
    if (answer.action === "regenerate") {
      feedback = undefined;
      continue;
    }
    if (answer.action === "feedback") {
      const followUp = await prompts({
        type: "text",
        name: "text",
        message: "What should change?",
      });
      feedback = followUp.text;
      continue;
    }

    // Ctrl+C / cancelled prompt
    console.log("\nCancelled -- nothing was saved.");
    process.exit(1);
  }
}
