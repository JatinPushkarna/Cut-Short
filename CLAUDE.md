# Cut-Short — Agent Instructions

Cut-Short turns long-form video into short-form social clips through a
hybrid workflow/agent pipeline (see `README.md` for the full architecture
and pipeline stages). This file covers repo-specific conventions and
gotchas for working on the tool itself.

## Project-specific instructions: `CLAUDE.local.md`

If a `CLAUDE.local.md` file exists alongside this one, Claude Code loads
it automatically — that's where campaign/project-specific instructions
belong (source of truth docs, exact footage paths, project-specific
typography, brand rules). It's gitignored on purpose: this file
(`CLAUDE.md`) stays generic and gets committed; `CLAUDE.local.md` stays
local to whoever's running a given project and never ships in this repo's
history.

@CLAUDE.local.md

## Project data lives under `public/Projects/<slug>/`, not in `src/`

Each project set up via `cutshort init` gets a self-contained, gitignored
folder tree (see `cli/lib/project.ts` for the scaffold logic):

```
public/Projects/<slug>/
  Assets/Video/, Assets/Images/, Assets/Music/SFX/   Remotion-referenceable media
  Script/                                            screenplay/script reference
  SRT/                                                transcript/caption files
  Campaign/                                           objective.md + planning docs
```

A given project's composition code (day-by-day clips, shared components,
project-specific typography) is real project content too, not tool source
code — keep it out of `src/`'s top level (e.g. gitignore
`src/<Project Name>/`) so this repo's own `src/` stays limited to the
generic Remotion scaffold (`Root.tsx`, `Composition.tsx`) and never ships
anyone's actual campaign material.

## Hard rule: never plan a cut from text alone

A transcript or script tells you *what's said*, not *what's on screen* —
who's in frame, which side of an intercut, framing/headroom, whether a
moment is a close-up or a wide shot. Any of that changes punch-zoom
targets, stamp placement, and whether a vertical crop keeps the subject in
frame.

**Before locking any clip's in/out point, punch-zoom target, or crop
decision: extract actual frames from the source video at that timestamp
range with ffmpeg and look at them.** One frame per second is usually
enough to catch cuts; go denser near a suspected edit point.

```bash
ffmpeg -y -ss <start_seconds> -i "<source video path>" \
  -t <duration> -vf "fps=1" "<scratchpad>/f%02d.jpg"
```

Then `Read` the frames before making a creative call. This discipline
caught real bugs during development of this tool: a location mismatch
trusted from an old note, a scene mis-attributed to the wrong moment in
the source, a sound effect that wasn't actually synced to the visual it
was supposed to land on — all caught by pulling real frames and looking,
not by trusting a clean log or a model's self-reported confidence.

## Vertical crop from 16:9 source

Source footage is typically landscape; compositions are vertical (9:16).
Getting vertical out of it is just `objectFit: "cover"` on the video
element inside the vertical canvas — it scales up and **center-crops** the
overflow. It is **not** smart/subject-tracking. If the subject isn't
centered in the original frame (checked via the frame-extraction step
above), adjust with `objectPosition` or a manual crop instead of trusting
the default center-crop.

## Resolution / quality

- Match a composition's `width`/`height` to the **native resolution of the
  source clip actually used**. Don't default to 1080x1920 — if the source
  is 4K, the composition must be built at that size, or the render
  silently downgrades quality even though nothing in the render log
  complains.
- Check source specs before building: `ffprobe -v error -select_streams
  v:0 -show_entries stream=width,height,r_frame_rate -of
  default=noprint_wrappers=1 <file>`.

## Video component: use `OffthreadVideo`, not `@remotion/media`'s `Video`

`@remotion/media`'s `<Video>` decodes in-browser and can time out or crash
trying to decode native 4K footage during render. Use Remotion's core
`OffthreadVideo` (ffmpeg-based, server-side frame extraction — reliable and
fast at 4K) with a separate `<Audio>` tag pointing at the same file for
sound (`OffthreadVideo` doesn't carry audio on its own). Both come from
the base `remotion` package.

## Frame rate

Don't assume every source clip shares one fps — a pre-cut promo export and
a raw cut from a master file can easily differ (e.g. 30fps vs 23.976fps).
Check the actual source fps before building a composition, and either
conform the footage (`ffmpeg -vf fps=30 ...`) or match the composition's
fps to the source.

## Render config gotchas (`remotion.config.ts`)

- **`Config.setCachingEnabled(false)`** is the real switch for disabling
  Remotion's webpack filesystem cache — **not** `cache: false` inside
  `Config.overrideWebpackConfig(...)`. Remotion's bundler
  (`computeHashAndFinalConfig`) re-applies `cache: {type: 'filesystem', ...}`
  *after* your webpackOverride runs, based on this separate option, silently
  clobbering any `cache: false` you set in the webpack config object itself.
  Getting this wrong causes an intermittent `FileSystemInfo`/webpack crash
  (`TypeError: The "data" argument must be of type string... Received
  undefined`, in `hash-digest.js` via `resolveBuildDependencies`) — a Node
  24 + webpack filesystem-cache incompatibility. If that crash reappears,
  this is why.
- `output.hashFunction: "sha256"` override is also needed alongside the
  above (existing workaround for the same underlying issue class).
- Quality settings for a high-fidelity master export: `setVideoImageFormat("png")`
  (lossless intermediate frames), `setCrf(12)`, `setX264Preset("slow")`.

## Transitions — propose motion where it helps, don't default to a plain cut

Static cards and hard cuts are the safe default, but flag it whenever a
livelier transition would help hold attention, and offer a concrete option
rather than just noting it as a nitpick. Good places to look: a beat's
entrance (text snapping/glitching in instead of a plain fade), the cut
between beats (whip-pan, flash, glitch displacement instead of a hard
cut), and any moment holding still for more than ~1s (a slow Ken Burns
push/zoom instead of a static frame).

## Transcription

`faster-whisper` is installed via `py -m pip` (not a project npm
dependency). Models are cached locally (`base`, `medium`, `large-v3` — not
`small`); use `WhisperModel(<size>, device="cpu", compute_type="int8",
local_files_only=True)` with a cached size to avoid a network call that can
fail in this environment.
