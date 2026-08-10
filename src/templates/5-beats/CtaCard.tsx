import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { CtaCardProps } from "../contract";
import { COLORS, fitFontSize, fontFamily, noBreakWrap, TYPE, wrapStyle } from "./theme";

// Consistent close for every daily post -- same treatment, only the
// brand name and days-left counter change project to project / day to day.
export const CtaCard: React.FC<CtaCardProps> = ({
  daysLeft,
  brandName,
  statusText,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  // The shared type scale targets a 2160px-wide vertical canvas. Scale only
  // the CTA title down on narrower compositions so a brand name can wrap
  // between words without ever splitting a word such as "DETECTOR".
  const titleFontSize = fitFontSize("ctaTitle", width);
  const subtitleFontSize = fitFontSize("ctaSubtitle", width);
  const counterFontSize = fitFontSize("ctaCounter", width);

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
          fontSize: titleFontSize,
          ...wrapStyle(92),
          ...noBreakWrap,
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
          fontSize: subtitleFontSize,
          ...wrapStyle(88),
          ...noBreakWrap,
          marginTop: 32,
        }}
      >
        follow for the next one
      </div>
      {(statusText || daysLeft !== undefined) && (
        <div
          style={{
            color: COLORS.accent,
            fontFamily,
            ...TYPE.ctaCounter,
            fontSize: counterFontSize,
            ...wrapStyle(88),
            ...noBreakWrap,
            marginTop: 48,
          }}
        >
          {statusText ?? `${daysLeft} DAYS LEFT`}
        </div>
      )}
    </AbsoluteFill>
  );
};
