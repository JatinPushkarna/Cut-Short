// The template contract: every src/templates/<name>/ folder must export
// components matching these exact prop shapes. This is what lets `build`
// generate composition code against "whatever template this project uses"
// without knowing or caring which one -- and lets TypeScript catch a
// template that's drifted from the contract at compile time, not runtime.

export type HookSceneProps = {
  bgSrc: string;
  text: string;
};

export type BridgeCardProps = {
  text: string;
};

export type CtaCardProps = {
  daysLeft: number;
  brandName: string;
};

export type RedFlagStampProps = {
  label?: string;
  color?: string;
  beepSfx?: boolean;
  beepSrc: string;
  scale?: number;
  volume?: number;
};

export type GlitchFlashProps = {
  durationInFrames?: number;
};

// The merged video+hook-overlay beat (e.g. "3 Beats"): real footage from
// frame 0, hook text overlaid on top instead of a separate still screen.
// `overlayPositionPct` is deliberately NOT a template-level constant --
// different clips have faces/captions in different places, so this is a
// per-clip calibration `build` supplies later (same category of decision
// as the existing per-clip `objectPosition` crop tuning), not something
// asked once at template-creation time. Defaults to a reasonable top-area
// placement until a real per-clip value is calibrated.
export type VideoHookOverlayProps = {
  videoSrc: string;
  hookText: string;
  overlayPositionPct?: number; // % from top of frame; default ~12
};

// Declares which beats/components a template actually implements -- lets
// `build` know what it has to work with without assuming every template
// has all five original roles (e.g. "3 Beats" has no BridgeCard at all).
export type TemplateManifest = {
  name: string;
  description: string;
  beats: string[];
  components: {
    hookScene?: true;
    bridgeCard?: true;
    videoHookOverlay?: true;
    ctaCard: true; // the one universal beat -- every template has a close
    redFlagStamp?: true;
    glitchFlash?: true;
  };
};

export type TypeScale = {
  fontSize: number;
  fontWeight: number;
  letterSpacing?: number;
  lineHeight?: number;
};

export type ThemeContract = {
  fontFamily: string;
  TYPE: {
    hook: TypeScale;
    bridge: TypeScale;
    caption: TypeScale;
    reveal: TypeScale;
    ctaTitle: TypeScale;
    ctaSubtitle: TypeScale;
    ctaCounter: TypeScale;
  };
  COLORS: {
    white: string;
    dim: string;
    accent: string;
  };
  wrapStyle: (maxWidthPercent: number) => React.CSSProperties;
};
