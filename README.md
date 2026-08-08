# Cut-Short

**An agentic workflow that turns long-form video into short-form social content** — a deterministic pipeline that hands off to Claude Code or Codex, running as a real scoped agent, for the judgment calls that can't be hardcoded: does this footage actually show what the copy claims, is the crop still valid three seconds into the shot, did the render actually produce what the code says it should.

This is a case study in a specific architectural question that most "AI tool" projects skip past: **when should an LLM run the pipeline, and when should the pipeline run the LLM?** Cut-Short's answer is a deliberate split — a hardcoded, auditable workflow for the parts that need predictability and a human approval gate, and a genuinely agentic coding-agent call for the parts that need dynamic, can't-know-ahead-of-time judgment. Not "an AI agent" (that would overclaim — the pipeline's structure is fixed, not model-decided) and not "a script that pings an LLM" (that undersells it — the agentic steps really do decide their own tool use, the same way an interactive coding-agent session does, just scoped to one task).

## What this demonstrates

- **An architecture, not just a feature.** The workflow/agent split below is the actual design contribution — most of these projects either hardcode everything (brittle) or hand the whole thing to a model (unpredictable, expensive, hard to put a human checkpoint in). This does neither.
- **Footage selection is driven by the campaign design, not the other way around.** The pipeline doesn't cut clips first and caption them after — `design` runs before `scan`/`clip` and drafts the _whole_ campaign package: the hook/bridge/reveal narrative, plus the per-platform title, description, and hashtags for YouTube Shorts, Instagram Reels, and TikTok. It's informed by the script (scene numbers, stage directions, shot descriptions — structural information the transcript alone can't give you) and the objective captured back in `init`. Only once that design exists does `scan` go looking for footage that actually serves it.
- **Collaborative by default, not autonomous by default.** Every agentic stage is built to propose something — a draft campaign design, a candidate cut, a crop — and check it with you, rather than run the whole pipeline unattended end to end. It's fully capable of running autonomously across every stage if you explicitly want that, but that's an opt-in, never the default.
- **A deliberate token-optimization strategy, not an afterthought.** Vision tokens scale directly with frame count and resolution — asking a model to "watch" a full-length video by sampling frames throughout gets expensive in direct proportion to how long the source footage is, and that cost hits before a single useful clip exists. Cut-Short's `scan` stage is architected to avoid that cost structure entirely: the transcript is searched as plain text first — free, exact, zero vision tokens — and only the small number of resulting candidate windows, seconds of footage rather than the whole file, ever get frames extracted and sent to a model. The expensive step only ever runs on the narrow slice that's already been shown to matter.

## 1. Architecture

**Two layers, on purpose:**

- **Outer layer — workflow.** A Node CLI (`cli/`) hardcodes the pipeline's stage order and stops for human approval before the expensive step (generation/render). Predictable cost, an auditable sequence, and a real checkpoint before anything gets produced — none of that survives if the whole thing is one autonomous loop.
- **Inner layer — agent.** At the specific stages that need judgment, the CLI shells out to Claude Code or Codex headlessly (Claude is the default; use `--agent codex` to switch):

  ```
  claude -p "<scoped task prompt>" --output-format json \
      --dangerously-skip-permissions --add-dir <project folder>

  codex exec "<scoped task prompt>" --ephemeral \
      --dangerously-bypass-approvals-and-sandbox -C <repo folder>
  ```

  The selected agent decides its own steps within that call — search the transcript, extract frames, look at them, report back — the same loop an interactive session runs, just scoped to one bounded task. No hand-rolled tool-use loop or custom LLM API integration: the coding-agent CLIs already provide that, so Cut-Short's job is to ask well-scoped questions and grant the right access, not reimplement orchestration that already exists.

**Pipeline stages:**

| Stage        | What it does                                                                                                                                                                                                                                | Status   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `init`       | Interactive requirements gathering → scaffolds the project folder + `Campaign/objective.md`                                                                                                                                                 | Shipped  |
| `transcribe` | Runs `faster-whisper` on the source video, saves SRT + word timestamps                                                                                                                                                                      | Shipped  |
| `design`     | Five gated sub-steps, each with a human approval loop: `phases` → `topics` → `content-structure` (drafts the hook/bridge/reveal narrative + per-platform copy, decides/reuses a template) → `edit-copy` (locks a frame-verified cut list) → `build` (generates the real Remotion composition and extracts the clip -- a 720p review proxy first, then a mechanical `--finalize` step for the full-resolution clip) | Shipped  |
| `scan`       | Text-searching the transcript for candidate footage, as its own separate stage                                                                                                                                                              | Absorbed into `content-structure`/`edit-copy` |
| `clip`       | Confirming in/out points and crop, extracting the sub-clip, as its own separate stage                                                                                                                                                       | Absorbed into `build`/`build --finalize` |
| `render`     | Runs the Remotion render to `Rendered/<topicId>.mp4` (mechanical, no LLM call)                                                                                                                                                              | Shipped  |
| `verify`     | Pulls frames from the actual rendered output and checks them against intent                                                                                                                                                                  | Roadmap  |

**Recommended: review the plan in Claude Code's Plan Mode before `render` runs.** `render` is the one genuinely expensive, hard-to-undo step in the pipeline — the workflow already stops for approval there by design (see below), and a last human pass over the plan (which clip, which crop, which campaign design) in Plan Mode before committing to it is a cheap extra checkpoint on top of that gate.

**The rendering engine is real and shipping output**, and the CLI's `build`/`render` stages are wired directly into it, not a separate thing: a repeatable 5-beat structure (hook → bridge → video → reveal → CTA), a shared typography/component library so no clip re-implements styling from scratch, `OffthreadVideo` + a separate `<Audio>` tag (chosen deliberately after a browser-decoded `<Video>` proved unreliable against native 4K source), multi-speaker intercut support within a single continuously-extracted clip (per-segment `objectPosition` crops, one continuous audio track underneath, no re-exporting per speaker), and a punch-zoom effect that lands on a specific payoff frame instead of a generic hold.

**Data model — one gitignored root per project:**

```
public/Projects/<slug>/
  Assets/Video/, Assets/Images/, Assets/Music/SFX/    Remotion-referenceable media (staticFile() only resolves inside public/)
  Script/                                             screenplay reference
  SRT/                                                transcript/caption files
  Campaign/                                           objective.md + campaign planning docs
```

Everything a project needs lives in this one gitignored tree — generated at runtime, this repo ships the tool, not anyone's source footage.

## 2. Features

**Shipped:**

- `cutshort init` — interactive requirements gathering (objective, platforms, campaign length, script/video paths) → scaffolds the full `public/Projects/<slug>/` tree (`Assets/Video`, `Assets/Images`, `Assets/Music/SFX`, `Script/`, `SRT/`, `Campaign/`) and writes a formatted `Campaign/objective.md` plus a machine-readable `Campaign/project.json` that later stages read back. Source files are referenced by absolute path, never copied — duplicating multi-gigabyte source video costs real time and disk space for zero processing benefit.
- `cutshort transcribe <slug>` — runs `faster-whisper` (offline, `local_files_only=True` against an already-cached model size) on the project's source video, writes `SRT/<video>.srt` and `SRT/<video>.words.json` (word-level timestamps). Re-validates the source video/script paths from `project.json` still exist before running.
- `cutshort design phases|topics|content-structure|edit-copy|build <slug>` — the full design pipeline described in the table above, each step gated behind a human approval loop before the next can run
- `cutshort render <slug> --topic <id>` — mechanical Remotion render of a built topic to `Rendered/<topicId>.mp4`
- `cutshort design status <slug>` — read-only, mechanical, no LLM call: shows each topic's current pipeline stage and which agent generated it, and cross-checks `design.json` against the actual filesystem to flag compositions/renders that exist without a matching locked record
- A provider-neutral agent runner (`--agent claude|codex`) — every LLM-driven design step can run against either Claude Code or Codex headlessly
- The 5-beat Remotion rendering template and its full shared component library
- Frame-accurate crop/timing decisions as a hard rule — every cut, crop, and timing call gets checked against real extracted frames before it's locked, never inferred from a transcript alone
- Post-render self-verification — every render gets frames pulled from the _actual output file_ and inspected, on the principle that a clean render log is not proof anything actually worked

**Roadmap:**

- `verify` — an automated pass that pulls frames from the actual rendered output and checks them against intent, rather than a human doing it by hand
- Explicit speaker/on-screen-mismatch handling — a real, recurring case in intercut footage (the person talking isn't always who's in frame) that needs to be surfaced to a human, not silently resolved either way

## 3. Prerequisites

- **Node.js** + npm
- **ffmpeg**, on `PATH` — frame extraction, and required by Remotion's `OffthreadVideo` at render time
- **Claude Code or Codex CLI**, installed and logged in — Claude is the default; pass `--agent codex` to an agent-powered `design` command to use Codex. No separate API integration is needed because both CLIs already provide the tool-use loop.
- **Python 3** + `faster-whisper` — needed once the `transcribe` stage lands

## 4. How to Run

**Get the code — with Git:**

```bash
git clone <repo-url>
cd cut-short
```

**Get the code — without Git:**

On the GitHub repo page, click **Code → Download ZIP**, extract it anywhere, then open a terminal (PowerShell on Windows) and `cd` into the extracted folder.

**Install dependencies** (required either way, before anything else will run):

```bash
npm install
```

**Start a new project:**

```bash
npm run cutshort -- init
```

This launches the interactive wizard (see [Prerequisites](#3-prerequisites) above for what needs to be on `PATH` before running the rest of the pipeline).

**Preview the rendering engine's existing compositions:**

```bash
npm run dev
```

**Render a specific composition:**

```bash
npx remotion render <CompositionId> out/<name>.mp4
```

The rest of the pipeline (`transcribe` through `verify`) is next — each stage moves from Roadmap to Shipped in the table above as it lands.
