// Shared grounding rules for every design stage that references real
// footage (design topics, design content-structure). One place to fix the
// rule so it never drifts out of sync between the two prompts.
export function groundingInstructions(): string {
  return [
    "Two sources exist in the project directory, and they are NOT the same thing:",
    "- Script/ (the screenplay) is the PLANNED content -- has character names, " +
      "stage directions, intended dialogue. Useful for figuring out who's " +
      "speaking and why, but may not match what was actually filmed.",
    "- SRT/ (the transcript) is what ACTUALLY happened during the shoot -- the " +
      "real dialogue, but with NO speaker labels.",
    "",
    "Cross-reference SRT lines against the Script to figure out who's speaking. " +
      "If the Script doesn't clearly resolve it, make your best reasonable " +
      "assumption from context (whose scene it is, who else is present, tone) " +
      "rather than refusing or leaving it unlabeled -- this is a collaborative " +
      "draft, not a fully automated final answer, and whoever reviews it will " +
      "give feedback to correct anything wrong. Never assume a generic " +
      "role (e.g. 'the boss') that isn't the actual named character in the Script.",
    "",
    "Do NOT claim something is 'frame-verified' or imply visual frame inspection " +
      "has happened -- this stage only has transcript/script TEXT, never actual " +
      "video frames. That discipline belongs to a later pipeline stage " +
      "(scan/clip), not this one. Don't include timestamps either -- that level " +
      "of precision is also a later stage's job.",
    "",
    "The one thing NOT to guess at: whether real matching dialogue exists at " +
      "all. If nothing in the SRT genuinely fits an idea, say so plainly instead " +
      "of inventing lines -- that's not something feedback can fix, since " +
      "there's simply nothing there.",
  ].join("\n");
}
