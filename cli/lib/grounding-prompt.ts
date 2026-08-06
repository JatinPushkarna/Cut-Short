// Shared grounding rules for every design stage that references real
// footage (design topics, design content-structure). One place to fix the
// rule so it never drifts out of sync between the two prompts.
export function groundingInstructions(
  options: { allowFrameVerification: boolean; projectDirPath?: string } = { allowFrameVerification: false }
): string {
  const lines = [
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
  ];

  if (options.allowFrameVerification) {
    // A vague "the project directory" phrase let a real run write frames next
    // to the source video's own folder instead -- spelling out the literal
    // absolute path removes that ambiguity.
    const frameCheckDir = options.projectDirPath
      ? `${options.projectDirPath}/.frame-check`
      : "<project directory>/.frame-check";
    lines.push(
      "Before finalizing content for a topic, you must pull real frames from " +
        "the source video at the candidate timestamp range and look at them -- " +
        "never lock a claim about who's on screen, framing, whether a punch-in " +
        "exists, or which template/component fits based on transcript text " +
        "alone. Use ffmpeg to extract at ~1fps, capped to 720p (not full " +
        "resolution -- it gets downsized before you ever see it anyway):"
    );
    lines.push(
      '  ffmpeg -y -ss <start_seconds> -i "<source video path from project.json>" ' +
        `-t <duration> -vf "fps=1,scale=-1:720" "${frameCheckDir}/f%02d.jpg"`
    );
    lines.push(
      `Write frames to exactly this path: ${frameCheckDir} -- not next to the ` +
        "source video's own folder, not anywhere else convenient. Throwaway " +
        "inspection output, not a build artifact. If checking many frames from " +
        "the same window, tile them into one contact-sheet image (ffmpeg's tile " +
        "filter) instead of reading each frame individually -- that's what " +
        "actually drives token cost up in practice. Only once you've looked at " +
        "real frames may you include approximate timestamps or make any " +
        "visual-framing claim as fact."
    );
  } else {
    lines.push(
      "Do NOT claim something is 'frame-verified' or imply visual frame " +
        "inspection has happened -- this stage only has transcript/script " +
        "TEXT, never actual video frames. That discipline belongs to a later " +
        "stage, not this one. Don't include timestamps either -- that level " +
        "of precision is also a later stage's job."
    );
  }

  lines.push("");
  lines.push(
    "The one thing NOT to guess at: whether real matching dialogue exists at " +
      "all. If nothing in the SRT genuinely fits an idea, say so plainly instead " +
      "of inventing lines -- that's not something feedback can fix, since " +
      "there's simply nothing there."
  );

  return lines.join("\n");
}
