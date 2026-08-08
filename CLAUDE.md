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

## Reviewing Codex's work

Codex (a separate coding agent also used in this repo) works on its own
local branches (`codex/<short-description>`, not pushed anywhere) and
never merges its own work — see `AGENTS.md`'s "Git workflow" section for
its side of this convention. When the user asks to review a Codex branch:
diff it against `main`, run the relevant tests, and merge it yourself if
it's clean — no need to ask first, since merging a local branch into
local `main` is reversible. Only escalate to the user for a product
decision, a risky/irreversible change, or a test failure you can't
resolve yourself. The user isn't expected to read the diff themselves;
that review is your job.

This doesn't change how *you* work in this repo — you still commit
directly to `main` as before. The branch-first rule applies to Codex,
not to you: the user reviews your changes live, in this conversation, as
you make them, which is why you don't need a separate branch-and-review
step for your own commits.

## Composition work goes through `cutshort design`/`cutshort render` — never by hand

Building a topic's composition, extracting its clip, or rendering it is
not a task to improvise with raw `ffmpeg`/`npx remotion render` calls or a
hand-written `.tsx` file, even though you have the tools to do exactly
that. It only happens through the pipeline: `cutshort design phases ->
topics -> content-structure -> edit-copy -> build -> build --finalize`,
then `cutshort render` — run by a human at their own interactive terminal.
The `design phases/topics/content-structure/edit-copy/build` steps prompt
for approval and need a real TTY; if you're invoked non-interactively you
cannot drive them, and that's a signal to hand the task back to the user,
not to route around them by working the filesystem directly.

Why this matters more than it looks like it should: each locked stage
records exactly what happened — a frame-verified cut list, which agent
generated it, a human approval — into `Campaign/design.json`. A
hand-authored composition can look identical to a real one on disk while
carrying none of that: no frame verification actually happened, no human
ever reviewed it, and there's no record of either. Run `cutshort design
status <slug>` any time to see what's actually locked per topic versus
what's just sitting in `src/<slug>/` unaccounted for — it cross-checks
`design.json` against the real files on disk and flags anything that
doesn't match, including files left in `Rendered/` that don't belong
there.

**Naming convention is by folder, not by filename suffix.** Proxy vs.
final vs. shipped output are three different folders with the *same*
filename in each (`Assets/Video/<topicId>.mp4` = proxy,
`Final/Video/<topicId>.mp4` = full-res, `Rendered/<topicId>.mp4` = the one
real deliverable) — never `<topicId>-proxy.mp4` or `<topicId>-final.mp4`
sitting next to each other in the same folder. That ambiguity is exactly
what caused real confusion about which file was the actual final render.
Verification/debug output (contact sheets, check frames) belongs in
`.frame-check/` or the scratchpad, never in `Assets/`, `Final/`, or
`Rendered/` — those three folders are pipeline-owned output, not scratch
space. Clean up anything you put elsewhere once you're done with it.

## Two different kinds of work happen in this repo — know which one you're doing

- **Developing the tool** means changing this repo's own code —
  `cli/`, `src/templates/`, config, tests. This is real software
  engineering: write pseudocode first for non-trivial logic and wait for
  approval (see a project's own `CLAUDE.local.md`/`Codex.local.md` for the
  exact rule if one exists), run the test suite (`npm test`) and
  typecheck before calling a change done, and follow the branch/commit
  conventions above.
- **Producing content** means running `cutshort design ...`/`cutshort
  render` (or being asked to help with what those commands should do —
  a hook, a cut, a crop, a caption) to actually build a piece of a
  campaign. This is not code work, and none of the tool-development
  discipline applies to it: there's no logic to pseudocode, and nothing
  here touches this repo's own source, so there's nothing for `npm test`
  to check. The real discipline for this kind of work is frame
  verification (above) and the pipeline-command rule above it — not
  software testing.

If a task turns out to need both — e.g. fixing a real bug in `design
build --finalize` while also trying to get an actual clip out the door —
treat them as two separate things done in order: fix and test the tool
first (pseudocode, tests, the works), then use the now-fixed command to
actually produce the content, through the pipeline like normal. Don't let
"I'm working on this project's content" become a reason to skip tests on
a code change, and don't let "I just fixed a bug in the tool" become a
reason to skip the pipeline commands when producing the content that
prompted the fix.

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

**Extract at a capped resolution (~720p), not full 4K.** Claude's vision
pipeline already downsizes large images to a fixed internal token budget
that's below native 4K anyway — sending full-resolution frames pays for
pixels that get thrown away before the model ever sees them. 720p is
still plenty for what frame-verification actually needs (who's on screen,
cut boundaries, mouth movement for speaker ID, rough face position for
crop math); only re-pull a specific frame at full res if something needs
pixel-level precision (fine hairline crop edges, small burned-in text).
When checking many frames from the same window, batch them into one
contact-sheet image (a grid, via ffmpeg's `tile` filter or a quick
compositing step) instead of one `Read` call per frame — this is what
actually drives token cost up in practice: dozens of individual
single-frame reads while binary-searching an exact cut point.

```bash
ffmpeg -y -ss <start_seconds> -i "<source video path>" \
  -t <duration> -vf "fps=1,scale=-1:720" "<scratchpad>/f%02d.jpg"
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

`cutshort transcribe <slug>` (`cli/commands/transcribe.ts` +
`cli/lib/transcribe.py`) wraps `faster-whisper`, installed via `py -m pip`
(not a project npm dependency, called via a Python subprocess). Models are
cached locally (`base`, `medium`, `large-v3` — not `small`); the command
runs `WhisperModel(<size>, device="cpu", compute_type="int8",
local_files_only=True)` with a cached size to avoid a network call that can
fail in this environment, and rejects an uncached `--model` value before
ever shelling out to Python. Writes `SRT/<video basename>.srt` and
`SRT/<video basename>.words.json` (word-level timestamps) into the
project's `SRT/` folder.
