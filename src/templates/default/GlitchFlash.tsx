import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import type { GlitchFlashProps } from "../contract";

// Reusable glitch-style cut: a soft flash + horizontal RGB-split
// displacement bars that ease in and settle out, instead of a hard snap.
// Reserve this for a real jump/time-skip -- a plain cut is fine for a
// natural back-and-forth intercut (see CLAUDE.md).
export const GlitchFlash: React.FC<GlitchFlashProps> = ({ durationInFrames = 18 }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const flashOpacity = interpolate(
    frame,
    [0, durationInFrames * 0.25, durationInFrames * 0.55, durationInFrames],
    [0, 0.5, 0.12, 0],
    { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) },
  );
  const barsOpacity = interpolate(frame, [0, durationInFrames * 0.3, durationInFrames * 0.75, durationInFrames], [0, 0.5, 0.3, 0], {
    extrapolateRight: "clamp",
  });
  const bars = [0.18, 0.42, 0.61, 0.79];

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: "white", opacity: flashOpacity }} />
      {bars.map((y, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        const shift = dir * (1 - progress) * 60;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${y * 100}%`,
              height: 26,
              backgroundColor: i % 2 === 0 ? "#37e0e0" : "#ff3b3b",
              transform: `translateX(${shift}px)`,
              opacity: barsOpacity,
              mixBlendMode: "screen",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
