import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { BridgeCardProps } from "../contract";
import { fitFontSize, fontFamily, noBreakWrap, TYPE, wrapStyle } from "./theme";

// The plain "TEXT" bridge beat (2-3.5s): a short line telling the viewer
// what to watch for. Simple fade -- this beat doesn't hold long enough to
// need the glitch/kinetic treatment reserved for footage cuts.
export const BridgeCard: React.FC<BridgeCardProps> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps * 0.3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "black", justifyContent: "center", alignItems: "center", padding: 120 }}>
      <div
        style={{
          opacity,
          color: "#d8d8d8",
          fontFamily,
          ...TYPE.bridge,
          fontSize: fitFontSize("bridge", width),
          ...wrapStyle(85),
          ...noBreakWrap,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
