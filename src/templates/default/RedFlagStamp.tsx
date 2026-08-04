import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { RedFlagStampProps } from "../contract";
import { fontFamily } from "./theme";

// Stamped reveal card for verdict beats --
// "RED FLAG." for a caught-vague-answer beat, or pass color="green" /
// label="GREEN FLAG." beepSfx={false} for a clean-truth exception
// (per the format rule: a clean-truth beat gets silence instead of a beep -- that's
// the signal, not an oversight).
//
// The beep is synced to the stamp's own entrance, not buried mid-dialogue
// in the video beat -- the verdict card is where the "gotcha" lands.
//
// `scale`/`volume` let a day dial the stamp down (e.g. a milder
// answer gets a smaller, quieter verdict than a more consequential one -- "this one
// hurts more" is the point, not a bigger gotcha).
export const RedFlagStamp: React.FC<RedFlagStampProps> = ({
  label = "RED FLAG.",
  color = "#e23b3b",
  beepSfx = true,
  beepSrc,
  scale = 1,
  volume = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Stamp-impact entrance: overshoot scale + a quick flash + slight settle
  // shake, instead of a plain fade -- this is the format's punchline beat.
  const stampScale = spring({
    frame,
    fps,
    config: { damping: 9, mass: 0.5, stiffness: 210 },
    from: 1.6,
    to: 1,
  });
  const opacity = interpolate(frame, [0, 3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flashOpacity = interpolate(frame, [0, 2, 8], [0.9, 0.2, 0], {
    extrapolateRight: "clamp",
  });
  const shake = interpolate(frame, [0, 4, 8, 12], [6, -4, 2, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "black", justifyContent: "center", alignItems: "center" }}>
      {beepSfx && (
        <Sequence from={0} durationInFrames={20}>
          <Audio src={staticFile(beepSrc)} volume={volume} />
        </Sequence>
      )}
      <AbsoluteFill style={{ backgroundColor: color, opacity: flashOpacity, mixBlendMode: "screen" }} />
      <div
        style={{
          opacity,
          transform: `rotate(-7deg) scale(${stampScale * scale}) translateY(${shake}px)`,
          border: `10px solid ${color}`,
          borderRadius: 16,
          padding: "36px 64px",
          boxShadow: `0 0 0 4px rgba(0,0,0,0.4) inset, 0 0 60px ${color}55`,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 132,
            fontWeight: 900,
            letterSpacing: 2,
            color,
            textAlign: "center",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      </div>
    </AbsoluteFill>
  );
};
