import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { CtaCardProps } from "../contract";
import { COLORS, fontFamily, TYPE, wrapStyle } from "./theme";

// Consistent close for every daily post -- same treatment, only the
// brand name and days-left counter change project to project / day to day.
export const CtaCard: React.FC<CtaCardProps> = ({ daysLeft, brandName }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "black",
        justifyContent: "center",
        alignItems: "center",
        opacity,
        padding: 120,
      }}
    >
      <div
        style={{
          color: COLORS.white,
          fontFamily,
          ...TYPE.ctaTitle,
          ...wrapStyle(92),
          textShadow: "0 4px 20px rgba(0,0,0,0.6)",
        }}
      >
        {brandName}
      </div>
      <div
        style={{
          color: COLORS.dim,
          fontFamily,
          ...TYPE.ctaSubtitle,
          ...wrapStyle(88),
          marginTop: 32,
        }}
      >
        follow for the next one
      </div>
      <div
        style={{
          color: COLORS.accent,
          fontFamily,
          ...TYPE.ctaCounter,
          ...wrapStyle(88),
          marginTop: 48,
        }}
      >
        {daysLeft} DAYS LEFT
      </div>
    </AbsoluteFill>
  );
};
