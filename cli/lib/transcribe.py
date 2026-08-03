"""Transcribe a video with faster-whisper -> SRT + word-level timestamps JSON.

Usage: transcribe.py <video_path> <model_size> <srt_out_path> <words_out_path>

Runs fully offline (local_files_only=True) -- the model size passed in must
already be cached locally, or this fails fast instead of silently trying a
network download that can fail in restricted environments.
"""

import json
import sys

from faster_whisper import WhisperModel


def format_srt_timestamp(seconds: float) -> str:
    total_ms = int(round(seconds * 1000))
    hours, total_ms = divmod(total_ms, 3_600_000)
    minutes, total_ms = divmod(total_ms, 60_000)
    secs, ms = divmod(total_ms, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{ms:03}"


def main() -> None:
    if len(sys.argv) != 5:
        print(
            "usage: transcribe.py <video_path> <model_size> <srt_out_path> <words_out_path>",
            file=sys.stderr,
        )
        sys.exit(1)

    video_path, model_size, srt_out_path, words_out_path = sys.argv[1:5]

    model = WhisperModel(model_size, device="cpu", compute_type="int8", local_files_only=True)
    segments, info = model.transcribe(video_path, word_timestamps=True)

    srt_lines: list[str] = []
    words: list[dict] = []

    for i, segment in enumerate(segments, start=1):
        start_ts = format_srt_timestamp(segment.start)
        end_ts = format_srt_timestamp(segment.end)
        text = segment.text.strip()

        srt_lines.append(str(i))
        srt_lines.append(f"{start_ts} --> {end_ts}")
        srt_lines.append(text)
        srt_lines.append("")

        if segment.words:
            for word in segment.words:
                words.append({"word": word.word, "start": word.start, "end": word.end})

        print(f"  [{start_ts}] {text}", flush=True)

    with open(srt_out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(srt_lines))

    with open(words_out_path, "w", encoding="utf-8") as f:
        json.dump({"language": info.language, "duration": info.duration, "words": words}, f, indent=2)

    print(f"\n{len(words)} words across {info.duration:.1f}s, language={info.language}", flush=True)


if __name__ == "__main__":
    main()
