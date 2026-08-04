import { AbsoluteFill, Audio, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { VideoHookOverlayProps } from "../contract";
import { fontFamily, TYPE, wrapStyle } from "./theme";

// Per brief.md: "Video hook overlay: start on real footage, hook text
// overlaid on top" -- the Hook and Video beats merge into one, no separate
// dimmed-still screen (a deliberate departure from the default's proven
// withhold-footage approach, see CLAUDE.local.md).
//
// Placement: top area, a translucent black scrim panel behind the text so
// it stays legible against any footage, avoiding both center (faces) and
// bottom (where burned-in captions live). `overlayPositionPct` is a per-clip
// calibration -- `build` will supply the real value once it can check where
// faces/captions actually land in a specific clip; the default here is a
// generic starting point, not a final answer.
//
// Modern, calm entrance -- fade + slight slide-up, no glitch/RGB-split (that
// treatment stays default's signature, not reused here).
export const VideoHookOverlay: React.FC<VideoHookOverlayProps> = ({
  videoSrc,
  hookText,
  overlayPositionPct = 12,
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(frame, [0, 12], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <OffthreadVideo src={staticFile(videoSrc)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <Audio src={staticFile(videoSrc)} />

      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: `${overlayPositionPct}%` }}>
        <div
          style={{
            opacity,
            transform: `translateY(${translateY}px)`,
            backgroundColor: "rgba(0,0,0,0.55)",
            borderRadius: 24,
            padding: "28px 56px",
          }}
        >
          <div style={{ fontFamily, ...TYPE.caption, ...wrapStyle(80), color: "white" }}>{hookText}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
