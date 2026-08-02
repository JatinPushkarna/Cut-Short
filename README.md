# Cut-Short

**An agentic workflow that turns long-form video into short-form social content** — a deterministic pipeline that hands off to Claude Code, running as a real scoped agent, for the judgment calls that can't be hardcoded: does this footage actually show what the copy claims, is the crop still valid three seconds into the shot, did the render actually produce what the code says it should.

This is a case study in a specific architectural question that most "AI tool" projects skip past: **when should an LLM run the pipeline, and when should the pipeline run the LLM?** Cut-Short's answer is a deliberate split — a hardcoded, auditable workflow for the parts that need predictability and a human approval gate, and a genuinely agentic Claude Code call for the parts that need dynamic, can't-know-ahead-of-time judgment. Not "an AI agent" (that would overclaim — the pipeline's structure is fixed, not model-decided) and not "a script that pings an LLM" (that undersells it — the agentic steps really do decide their own tool use, the same way an interactive Claude Code session does, just scoped to one task).

## What this demonstrates

- **An architecture, not just a feature.** The workflow/agent split below is the actual design contribution — most of these projects either hardcode everything (brittle) or hand the whole thing to a model (unpredictable, expensive, hard to put a human checkpoint in). This does neither.
- **A frame-verification discipline that caught real bugs.** Building the rendering side of this against real footage surfaced concrete, specific failures a text-only pass would have shipped: a location mismatch trusted from an old note, a scene mis-attributed to the wrong moment in the source, a sound effect that wasn't actually synced to the visual it was supposed to land on. Every one was caught by pulling real frames from the actual output and looking, not by trusting a clean log. That discipline is baked into the pipeline (`verify` stage), not a one-off fix.
- **A real reliability finding, not a hypothetical one.** An earlier version of the scene-matching step used a different vision pipeline to batch-analyze footage. It shipped with a confirmed ~1–1.5s timestamp drift at cut boundaries — caught by a mandatory spot-check, not by trusting the pipeline's own self-reported confidence. That result is why Cut-Short's `scan` stage is designed text-search-first, frame-verify-second, rather than "point a model at the whole video and trust what comes back."
- **A deliberate token-optimization strategy, not an afterthought.** Vision tokens scale directly with frame count and resolution — asking a model to "watch" a full-length video by sampling frames throughout gets expensive in direct proportion to how long the source footage is, and that cost hits before a single useful clip exists. Cut-Short's `scan` stage is architected to avoid that cost structure entirely: the transcript is searched as plain text first — free, exact, zero vision tokens — and only the small number of resulting candidate windows, seconds of footage rather than the whole file, ever get frames extracted and sent to a model. The expensive step only ever runs on the narrow slice that's already been shown to matter.

## 1. Architecture

**Two layers, on purpose:**

- **Outer layer — workflow.** A Node CLI (`cli/`) hardcodes the pipeline's stage order and stops for human approval before the expensive step (generation/render). Predictable cost, an auditable sequence, and a real checkpoint before anything gets produced — none of that survives if the whole thing is one autonomous loop.
- **Inner layer — agent.** At the specific stages that need judgment, the CLI shells out to Claude Code headlessly:

  ```
  claude -p "<scoped task prompt>" --output-format json \
      --dangerously-skip-permissions --add-dir <project folder>
  ```

  Claude Code decides its own steps within that call — search the transcript, extract frames, look at them, report back — the same loop an interactive session runs, just scoped to one bounded task and one directory. No hand-rolled tool-use loop, no custom LLM API integration: Claude Code already built that, so Cut-Short's job is to ask well-scoped questions and grant the right access, not reimplement orchestration that already exists.

**Pipeline stages:**

| Stage | What it does | Status |
|---|---|---|
| `init` | Interactive requirements gathering → scaffolds the project folder + `Campaign/objective.md` | Shipped |
| `transcribe` | Runs `faster-whisper` on the source video, saves SRT + word timestamps | Roadmap |
| `scan` | Text-searches the transcript for copy-matching moments, then frame-verifies each candidate | Roadmap |
| `clip` | Confirms in/out points and crop, extracts the sub-clip | Roadmap |
| `copy` | Drafts hook/bridge/reveal copy against a proven formula (see below) | Roadmap |
| `build` | Generates the Remotion composition wiring clip + copy into the 5-beat template | Roadmap |
| `render` | Runs the Remotion render | Roadmap |
| `verify` | Pulls frames from the actual rendered output and checks them against intent | Roadmap |

**The rendering engine is already real and already shipping output**, independent of the CLI orchestration above: a repeatable 5-beat structure (hook → bridge → video → reveal → CTA), a shared typography/component library so no clip re-implements styling from scratch, `OffthreadVideo` + a separate `<Audio>` tag (chosen deliberately after a browser-decoded `<Video>` proved unreliable against native 4K source), multi-speaker intercut support within a single continuously-extracted clip (per-segment `objectPosition` crops, one continuous audio track underneath, no re-exporting per speaker), and a punch-zoom effect that lands on a specific payoff frame instead of a generic hold. The CLI's `build`/`render` stages will wire into this engine directly, not replace it.

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
- `cutshort init` — interactive requirements gathering (objective, platforms, campaign length, script/video paths) → scaffolds the full `public/Projects/<slug>/` tree (`Assets/Video`, `Assets/Images`, `Assets/Music/SFX`, `Script/`, `SRT/`, `Campaign/`) and writes a formatted `Campaign/objective.md`. Source files are referenced by absolute path, never copied — duplicating multi-gigabyte source video costs real time and disk space for zero processing benefit.
- The 5-beat Remotion rendering template and its full shared component library
- Frame-accurate crop/timing decisions as a hard rule — every cut, crop, and timing call gets checked against real extracted frames before it's locked, never inferred from a transcript alone
- Post-render self-verification — every render gets frames pulled from the *actual output file* and inspected, on the principle that a clean render log is not proof anything actually worked

**Roadmap:**
- The `transcribe` → `verify` pipeline stages above
- `runClaudeTask` — the shared Claude Code agent-invocation layer those stages call into
- Explicit speaker/on-screen-mismatch handling — a real, recurring case in intercut footage (the person talking isn't always who's in frame) that needs to be surfaced to a human, not silently resolved either way

## 3. Prerequisites

- **Node.js** + npm
- **ffmpeg**, on `PATH` — frame extraction, and required by Remotion's `OffthreadVideo` at render time
- **Claude Code**, installed and logged in — this is how every agentic stage runs. No separate API key path by design: a direct API integration would mean building and maintaining a tool-use loop, tool schemas, and prompt orchestration by hand, all of which Claude Code already provides.
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
