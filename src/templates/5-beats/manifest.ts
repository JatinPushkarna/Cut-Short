import type { TemplateManifest } from "../contract";

export const manifest: TemplateManifest = {
  name: "5 Beats",
  description:
    "Hook (dimmed still + claim) -> Bridge (misdirect) -> Video (real clip) -> " +
    "Reveal (twist/verdict) -> CTA. Withholds real footage until the hook has " +
    "earned attention. Superseded by '4 Beats' as the default (2026-08-10: " +
    "Instagram viewers were dropping off during the Bridge beat) -- still " +
    "available when a deliberate misdirect beat genuinely fits the content.",
  beats: ["hook", "bridge", "video", "reveal", "cta"],
  components: {
    hookScene: true,
    bridgeCard: true,
    ctaCard: true,
    redFlagStamp: true,
    glitchFlash: true,
  },
};
