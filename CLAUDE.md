# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository.

## What this is

**WorkHard Simulator** — a novelty web app that auto-plays a believable "hard
at work" session. It exists to *look* like someone is grinding. Pick a scenario
from the floating control panel:

- **VS Code** — live-typed, syntax-highlighted code with tab switching, a fake
  terminal running git/npm commands, and a churning status bar.
- **Claude Code** — a Claude Code CLI session: a typed user prompt, a "thinking"
  spinner with token counter, streamed assistant prose, and green-bulleted tool
  calls (Read/Edit/Bash/…) with `⎿` tree-connector results.

Scenarios are swappable modules registered against a shared core, so adding more
(debugging, writing docs, etc.) is a matter of dropping in another scenario file.

## Running

No build step, no dependencies, no server required. The page uses plain
`<script src>` tags (no ES modules, no `fetch`), so it runs straight from disk:

- Open `index.html` directly in a browser (`file://`), or
- PowerShell: `Start-Process (Resolve-Path .\index.html).Path`

Node is only used for sanity checks, e.g. `node --check js/app.js`.

## Architecture

Pure static HTML/CSS/vanilla-JS. No framework. A tiny **core + scenarios**
design — the core owns the clock and controls; each scenario is a self-contained
animation module that registers itself.

| File | Role |
|------|------|
| `index.html` | Hosts both scenes (`#scene-vscode`, `#scene-claude`) and the shared control overlay. Script load order matters (see below). |
| `css/style.css` | Dark+ (VS Code) + terracotta (Claude CLI) themes. All colors are CSS variables at `:root`. |
| `js/core.js` | `window.Sim` — the shared runtime: cancellable `sleep`, `runId` token, speed/pause, control wiring, and the scenario registry + switcher. |
| `js/highlight.js` | `window.Highlighter.highlightLine(line, lang, state)` — per-line tokenizer → HTML-escaped `<span class="tok-*">`. `state` carries block-comment context. (VS Code scenario.) |
| `js/codeSamples.js` | `window.CODE_FILES` — source files the VS Code scenario types. Each: `{ name, icon, lang, code }`. |
| `js/scenarioVscode.js` | VS Code scenario: typing loop, fake terminal, status-bar churn. |
| `js/scenarioClaude.js` | Claude Code CLI scenario: prompt typing, thinking spinner, streamed text, tool calls. Conversation lives in the `TURNS` array. |
| `js/boot.js` | Calls `Sim.boot("vscode")` after all scenarios have registered. |

Load order: `core.js` → `highlight.js` → `codeSamples.js` → `scenarioVscode.js`
→ `scenarioClaude.js` → `boot.js`. Core must be first (scenarios call
`Sim.register`); boot must be last.

### The core (`js/core.js`)

- **Scenario interface.** `Sim.register(id, { label, root, run(myRun), reset() })`.
  `root` is the DOM container shown only while active; `run` is the async loop;
  `reset` restores the idle look. `Sim.setActive(id)` swaps scenes, `Sim.start/stop`
  drive the active one.
- **Cancellable runs via `runId`.** A monotonically increasing `Sim.runId` token
  identifies the active run. start/stop/scene-switch and the VS Code "jump to file"
  all bump it via `Sim.bumpRun()`. Every `await Sim.sleep(ms, myRun)` rejects with
  `"cancelled"` once `myRun !== Sim.runId`, unwinding the in-flight loop. `run()`
  is wrapped by core; ad-hoc loops must `try/catch` and swallow `"cancelled"`.
- **`Sim.sleep(ms, myRun)`** is the one place that honors `paused` (parks itself)
  and `speed` (divides the delay). Never use raw `setTimeout` for a simulated
  wait — route through `Sim.sleep` so pause/speed/cancel all keep working.

### Scenario notes

- **VS Code typing** is per-line: `newLine()` creates a `.line`, characters are
  appended and the *current line only* is re-highlighted each keystroke; finished
  lines freeze and commit `blockState` for multi-line comments. Terminal output
  streams from `commandRuns()`; `git push` resets the status-bar "ahead" counter.
- **Claude CLI** drives the scripted `TURNS` array (prompt → think → actions).
  Tool `result` strings are intentional HTML (colored via `.r-*` classes) and are
  **not** escaped; the prompt, user echo, and tool `arg` **are** escaped.

## Conventions

- Keep it **dependency-free and buildless**. Don't introduce npm packages, a
  bundler, or ES modules unless the no-server `file://` workflow is preserved.
  (jsdom is used ad-hoc for smoke tests only — never required at runtime.)
- New scenario: add a `#scene-*` container + a `js/scenario*.js` that calls
  `Sim.register`, wire a `.scn-opt` button in the overlay, and add its `<script>`
  before `boot.js`. Drive every wait through `Sim.sleep(ms, myRun)`.
- New "typed" VS Code file: add to `window.CODE_FILES`; for a new language add a
  keyword map + `LANG_LABEL` entry and confirm `highlightLine` handles it.
- All theme colors belong in `:root` variables. Match the terse, comment-light
  vanilla-JS style.
