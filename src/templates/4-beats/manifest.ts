import type { TemplateManifest } from "../contract";

// Default as of 2026-08-10: real Instagram viewing pattern showed drop-off
// during the Bridge beat of '5 Beats' -- this cuts straight from the still
// hook to real footage, keeping the one part of that format that's actually
// proven (withholding footage until the hook earns it, see HookScene.tsx),
// dropping only the misdirect beat that sat between it and the payoff.
export const manifest: TemplateManifest = {
  name: "4 Beats",
  description:
    "Hook (dimmed still + claim) -> Video (real clip) -> Reveal (twist/" +
    "verdict) -> CTA. Same as '5 Beats' minus the Bridge -- still withholds " +
    "real footage until the hook has earned attention, just cuts straight " +
    "to the video instead of a misdirect beat first.",
  beats: ["hook", "video", "reveal", "cta"],
  components: {
    hookScene: true,
    ctaCard: true,
    redFlagStamp: true,
    glitchFlash: true,
  },
};
