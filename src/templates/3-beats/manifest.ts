import type { TemplateManifest } from "../contract";

// Built from brief.md (this project's own `cutshort template` run).
export const manifest: TemplateManifest = {
  name: "3 Beats",
  description:
    "Hook+Video (real footage from frame 0, hook text overlaid on top, no " +
    "dimmed still) -> Reveal (reused from default) -> CTA (reused from " +
    "default). No bridge.",
  beats: ["video+hook", "reveal", "cta"],
  components: {
    videoHookOverlay: true,
    ctaCard: true,
    redFlagStamp: true,
  },
};
