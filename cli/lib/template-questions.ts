// Maintained question set for `cutshort template <slug>`'s "create new"
// path -- structural/visual scaffolding questions only. Copy strategy
// (what the hook claims, whether the bridge misdirects) is `design`'s job,
// not this stage's -- these questions stay scoped to aesthetics/structure.

export const BEAT_STRUCTURE_QUESTION = `The default template uses 5 beats:
  1. Hook (2s) -- dimmed still image, text overlay
  2. Bridge (1.5s) -- text over black
  3. Video -- the real clip, captions burned in
  4. Reveal -- text/stamp overlay
  5. CTA -- brand + days-left counter

What structure do you want for this new template -- which beats, in what order?`;

export const HOOK_STYLE_CHOICES = [
  { title: "Still: blurred/dimmed key frame from the clip (default's approach)", value: "still-blurred" },
  { title: "Still: plain black screen", value: "still-black" },
  { title: "Video hook overlay: start on real footage, hook text overlaid on top", value: "video-overlay" },
];

export const FONT_QUESTION =
  "What font should this template use? (e.g. keep the shared Poppins default, or name a different bold/geometric sans)";

export const BACKGROUND_QUESTION =
  "What background/treatment should sit behind overlaid text (if any)? " +
  "(e.g. none -- text directly on footage, a solid color panel, a translucent/semi-transparent scrim, a gradient fade)";

// Deliberately NOT asked here: exact overlay position. That's a per-clip
// calibration `build` handles later (same category as the existing
// per-clip `objectPosition` crop tuning), not a one-time template answer --
// see VideoHookOverlayProps in src/templates/contract.ts.

export const TEMPLATE_DESIGN_QUESTIONS = [
  "What should this template be called?",
  BEAT_STRUCTURE_QUESTION,
  "How should the HOOK look?", // -> HOOK_STYLE_CHOICES
  FONT_QUESTION,
  BACKGROUND_QUESTION,
  "Which components (if any) get reused from an existing template vs. built new?",
  "Any other structural rule this template should follow?",
];
