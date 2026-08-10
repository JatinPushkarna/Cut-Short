import { loadFont } from "@remotion/google-fonts/Poppins";
import type { ThemeContract } from "../contract";

// Single font load shared by every text component so every frame in every
// day's composition uses the exact same family/weights -- no drift.
export const { fontFamily } = loadFont("normal", {
  weights: ["600", "700", "800", "900"],
  subsets: ["latin"],
});

// Type scale tuned for the 2160x3840 (4K vertical) canvas. Bigger than a
// naive "double the old 1080p numbers" pass -- these read like native
// IG/TikTok caption templates at full size, not scaled-up web copy.
export const TYPE: ThemeContract["TYPE"] = {
  hook: { fontSize: 132, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.15 },
  bridge: { fontSize: 92, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.25 },
  caption: { fontSize: 88, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2 },
  reveal: { fontSize: 140, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.15 },
  ctaTitle: { fontSize: 148, fontWeight: 900, letterSpacing: 4, lineHeight: 1.1 },
  ctaSubtitle: { fontSize: 72, fontWeight: 700, letterSpacing: 0, lineHeight: 1.2 },
  ctaCounter: { fontSize: 56, fontWeight: 800, letterSpacing: 2, lineHeight: 1.2 },
};

export const COLORS: ThemeContract["COLORS"] = {
  white: "#ffffff",
  dim: "#d8d8d8",
  accent: "#E3A94C",
};

// Shared wrap behavior: centered, generous width so multi-line hooks read
// like a template, breaking long words instead of overflowing the frame.
export const wrapStyle: ThemeContract["wrapStyle"] = (maxWidthPct) => ({
  textAlign: "center",
  maxWidth: `${maxWidthPct}%`,
  wordWrap: "break-word",
  overflowWrap: "break-word",
  whiteSpace: "normal",
});

// Per-role cap on fontSize as a fraction of canvas width -- the TYPE scale
// above is tuned for a 2160px-wide canvas, so on a narrower export each
// role's font must shrink or long/wide words force a mid-character wrap
// (every letter on its own line) instead of a normal word wrap. hook and
// ctaTitle are the original, shipped-and-tested values; the rest were
// derived from the same fontSize/canvasWidth relationship those two share
// (fontSize / ~1473) and confirmed against a real `remotion still` render
// at 1080px width with deliberately long test strings per role (2026-08-10)
// -- word-boundary wrapping held for every role; reveal's box ran tight
// against a full 5-line sentence, which is fine given reveal copy is
// written short in practice, but is the one role worth re-checking if a
// real day ever gives it an unusually long reveal line.
const WIDTH_CLAMP_RATIO: Record<keyof ThemeContract["TYPE"], number> = {
  hook: 0.09,
  bridge: 0.0625,
  caption: 0.06,
  reveal: 0.095,
  ctaTitle: 0.1,
  ctaSubtitle: 0.049,
  ctaCounter: 0.038,
};

export function fitFontSize(
  role: keyof ThemeContract["TYPE"],
  canvasWidth: number,
): number {
  return Math.min(TYPE[role].fontSize, canvasWidth * WIDTH_CLAMP_RATIO[role]);
}

// Word-boundary-only wrap: never break a word mid-character even when it's
// wider than the container at the clamped font size -- combine with
// wrapStyle() and fitFontSize() on any text node using the TYPE scale.
export const noBreakWrap: React.CSSProperties = {
  wordWrap: "normal",
  overflowWrap: "normal",
  wordBreak: "normal",
};
