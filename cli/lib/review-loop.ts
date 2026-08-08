import prompts from "prompts";

// Shared human-checkpoint loop for every judgment-requiring stage: generate
// a candidate, show it, let the human approve/steer/regenerate. Nothing
// here runs unattended past one candidate without an explicit approval --
// see README's "Collaborative by default, not autonomous by default".
export async function reviewLoop<T>(
  generate: (feedback: string | undefined) => T,
  render: (result: T) => string
): Promise<T> {
  let feedback: string | undefined = undefined;

  while (true) {
    console.log("\nAsking the selected agent...\n");
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
