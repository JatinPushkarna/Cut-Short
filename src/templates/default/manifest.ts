import type { TemplateManifest } from "../contract";

export const manifest: TemplateManifest = {
  name: "5 Beats",
  description:
    "Hook (dimmed still + claim) -> Bridge (misdirect) -> Video (real clip) -> " +
    "Reveal (twist/verdict) -> CTA. Withholds real footage until the hook has " +
    "earned attention.",
  beats: ["hook", "bridge", "video", "reveal", "cta"],
  components: {
    hookScene: true,
    bridgeCard: true,
    ctaCard: true,
    redFlagStamp: true,
    glitchFlash: true,
  },
};
