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
