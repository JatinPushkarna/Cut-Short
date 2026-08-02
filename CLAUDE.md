# Campaign — Promo Video Pipeline

Remotion project that produces the daily social clips (Instagram Reels /
TikTok / YouTube Shorts) for a short film promo campaign.
Film releases **Aug 15, 2026**.

## Source of truth for the campaign plan

- **`public/Projects/<slug>/Campaign/<plan doc> - Session Handoff.md`**
  and **`public/Projects/<slug>/Campaign/<plan doc> Signal Log.html`**
  are the current, correct campaign plan (goals, 5-beat format, full
  day-by-day calendar, per-platform copy, frame-verified corrections folded
  directly into each day's entry). Trust these — this doc is the only
  plan doc that should be treated as current.
- **`public/Projects/<slug>/Campaign/Promotion/_archive/`** holds superseded
  planning docs (an earlier, differently-numbered/formatted plan that
  pre-dates the 5-beat pivot, plus a since-merged revisions doc). Kept for
  history only — do not use as a reference unless the user explicitly says
  otherwise. See `_archive/README.md` for why each one was retired.
- If a doc ever seems to disagree with what the user is asking for, ask —
  don't assume it's automatically right.

## Source footage

- `public/Projects/<slug>/Assets/Video/<source video>.mp4` — the
  full film. Landscape **16:9, 3840x2160, 23.976fps**. The full transcript
  with timestamps (`.srt`/`.txt`) lives alongside it in
  `public/Projects/<slug>/SRT/`, not in the same folder as the video.
- `public/Projects/<slug>/Script/<script>.pdf` — the
  screenplay (scene numbers, stage directions, shot descriptions).
- Raw per-day exports/pre-cut clips live **outside this repo**, in
  `<external raw footage folder>\<date>\`. Copy in only the
  clips actually being used for a given day's composition.

## Hard rule: never plan a cut from text alone

The SRT and script tell you *what's said*, not *what's on screen* — who's in
frame, which side of an intercut, framing/headroom, whether a moment is a
close-up or a wide shot. Any of that changes punch-zoom targets, stamp
placement, and whether a vertical crop keeps the subject in frame.

**Before locking any clip's in/out point, punch-zoom target, or crop
decision: extract actual frames from `<source video>.mp4` at that
timestamp range with ffmpeg and look at them.** One frame per second is
usually enough to catch cuts; go denser near a suspected edit point.

```bash
ffmpeg -y -ss <start_seconds> -i "public/Projects/<slug>/Assets/Video/<source video>.mp4" \
  -t <duration> -vf "fps=1" "<scratchpad>/f%02d.jpg"
```

Then `Read` the frames before making a creative call.

## Vertical crop from 16:9 source

All compositions are vertical (9:16). The source film is landscape. Getting
vertical out of it is just `objectFit: "cover"` on the video element inside
the vertical canvas — it scales up and **center-crops** the overflow. It is
**not** smart/subject-tracking. If the subject isn't centered in the
original 16:9 frame (checked via the frame-extraction step above), adjust
with `objectPosition` or a manual crop instead of trusting the default
center-crop.

## Resolution / quality

- Match the composition's `width`/`height` to the **native resolution of the
  source clip actually used that day**. Don't default to 1080x1920 — if the
  source is 4K vertical (2160x3840) or 4K landscape cropped to vertical, the
  composition must be built at that size, or the render silently downgrades
  quality even though nothing in the render log complains.
- Check source specs before building: `ffprobe -v error -select_streams v:0
  -show_entries stream=width,height,r_frame_rate -of default=noprint_wrappers=1 <file>`.

## Video component: use `OffthreadVideo`, not `@remotion/media`'s `Video`

`@remotion/media`'s `<Video>` decodes in-browser and **timed out / crashed
trying to decode native 4K footage** during render. Use Remotion's core
`OffthreadVideo` (ffmpeg-based, server-side frame extraction — reliable and
fast at 4K) with a separate `<Audio>` tag pointing at the same file for
sound (OffthreadVideo doesn't carry audio on its own). Both come from the
base `remotion` package.

## Frame rate

Footage in this project is **not all the same fps** — `Day3.mp4` (a pre-cut
promo export) was 30fps; raw cuts from `<source video>.mp4` are
23.976fps. Check the actual source fps before building a composition, and
either conform the footage (`ffmpeg -vf fps=30 ...`) or match the
composition's fps to the source — don't assume 30fps.

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

## Typography — always use `src/<project>/theme.ts`

One shared font loader (`fontFamily`) and type scale (`TYPE.hook`,
`.bridge`, `.caption`, `.reveal`, `.ctaTitle`, `.ctaSubtitle`,
`.ctaCounter`) and wrap helper (`wrapStyle`) used by every text element in
every day's composition. Sizes are tuned for the 2160-wide 4K vertical
canvas — don't hardcode font sizes per composition, and don't reuse 1080p-era
numbers without scaling them up; that's how Day 3 first shipped with
text half the intended size.

The look should read as **modern Instagram/TikTok caption style**, not web
copy: bold/black weights (700–900, currently Poppins), tight negative
letter-spacing on display text, high contrast against the background,
generously large sizes. If a font change is ever considered, stay in that
same family of geometric-rounded bold sans (Poppins, Montserrat, Archivo
Black, Inter Black are the right neighborhood) rather than a thin/regular
weight or a serif/editorial feel — this is a punchy short-form template,
not a title card for a prestige drama.

## Transitions — propose motion where it helps, don't default to a plain cut

Static black cards and hard cuts are the safe default, but flag it whenever
a livelier transition would help hold attention, and offer a concrete
option rather than just noting it as a nitpick. Precedent: `Day4HookPreview`
swapped a flat black HOOK for a dimmed/blurred neutral still with a Ken
Burns push-in, a glitch-style (RGB channel-split) text entrance, and a
glitch-flash transition into the video beat — same 5-beat structure, more
kinetic execution.

Good places to look for this: a beat's entrance (text snapping/glitching in
instead of a plain fade), the cut between beats (whip-pan, flash, glitch
displacement instead of a hard cut), and any moment holding still for more
than ~1s (a slow Ken Burns push/zoom instead of a static frame).

The one constraint that overrides this: **never show actual film footage
during the HOOK beat** — that's the tested, proven part of the format (Day
2's 3x lift came from withholding the film until the hook earned it). A
dimmed/blurred *still* is fine; live/moving footage during HOOK is not —
that's reintroducing the exact variable the format was built to avoid.

## Reusable components

- `src/<project>/CtaCard.tsx` — the standing close for every daily post (a
  "FOLLOW -- for the next one" style CTA + days-left counter). Takes a `daysLeft` prop.
  Reuse this rather than rebuilding the CTA per day.

## Asset organization

- `public/Projects/<slug>/Assets/Video/`, `Assets/Images/`,
  `Assets/Music/SFX/` — processed/final assets actually used by a
  composition (Remotion's `staticFile()` only resolves inside `public/`).
  Copy in only what a composition needs.
- `public/Projects/<slug>/Script/`, `SRT/`, `Campaign/` — screenplay,
  transcript/caption files, and campaign planning docs respectively. Not
  loaded by any composition, reference material only.
- Don't copy raw source footage into the repo until it's actually needed for
  a build — review/scratch work (frame extraction, rough cuts for review)
  can stay in the session scratchpad.

## Transcription

`faster-whisper` is installed via `py -m pip` (not a project npm
dependency). Models are cached locally (`base`, `medium`, `large-v3` — not
`small`); use `WhisperModel(<size>, device="cpu", compute_type="int8",
local_files_only=True)` with a cached size to avoid a network call that can
fail in this environment.
