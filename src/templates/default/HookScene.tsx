import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { HookSceneProps } from "../contract";
import { fontFamily, TYPE, wrapStyle } from "./theme";

// Reusable HOOK treatment: a dimmed/blurred *still* (never live footage --
// see CLAUDE.md) behind the hook line, with a slow Ken Burns push-in and a
// glitch-style (RGB channel-split) text entrance instead of a plain fade.
export const HookScene: React.FC<HookSceneProps> = ({ bgSrc, text }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const bgScale = interpolate(frame, [0, durationInFrames], [1.04, 1.14], {
    extrapolateRight: "clamp",
  });

  const settle = interpolate(frame, [0, 10], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const splitPx = settle * 18;
  const opacity = interpolate(frame, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, 8], [0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textBaseStyle: React.CSSProperties = {
    position: "absolute",
    fontFamily,
    ...TYPE.hook,
    ...wrapStyle(88),
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill style={{ transform: `scale(${bgScale})` }}>
        <Img
          src={staticFile(bgSrc)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(22px) brightness(0.4) saturate(0.85)",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.65) 100%)",
        }}
      />

      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", padding: 120, transform: `scale(${scale})` }}
      >
        <div style={{ position: "relative", ...wrapStyle(88) }}>
          <div
            style={{ ...textBaseStyle, left: -splitPx, top: 0, color: "#37e0e0", opacity: opacity * 0.7, mixBlendMode: "screen" }}
          >
            {text}
          </div>
          <div
            style={{ ...textBaseStyle, left: splitPx, top: 0, color: "#ff3b3b", opacity: opacity * 0.7, mixBlendMode: "screen" }}
          >
            {text}
          </div>
          <div style={{ ...textBaseStyle, position: "relative", color: "white", opacity }}>{text}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
