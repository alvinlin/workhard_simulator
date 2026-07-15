# WorkHard Simulator — Quick Start

## What this is

**WorkHard Simulator** is a novelty, zero-dependency web app that auto-plays a believable *"hard at work"* session. It exists purely to **look** like someone is grinding — no real work happens, no data leaves the page.

Open a single `index.html` file in any browser and pick a scenario from the floating control panel. The screen busies itself.

> ⚠️ For fun only. This is a screen-filler / demo, not a productivity tool.

## Scenarios

| Scenario | What it simulates |
|----------|-------------------|
| **VS Code** | Live-typed, syntax-highlighted code with tab switching, a fake terminal running `git` / `npm` commands, and a churning status bar. |
| **Claude Code** | A Claude Code CLI session: typed user prompt, "thinking" spinner with token counter, streamed assistant prose, and green-bulleted tool calls (Read / Edit / Bash / Grep / Write) with `⎿` tree-connector results. |
| **OS Update** | Full-screen "installing updates" screen switchable between **Windows** (blue, dot throbber, "已完成 NN%") and **macOS** (black, Apple logo, thin progress bar). Crawls and stalls to 100%, "restarts", then loops with the next version. |

## Running

No build step, no dependencies, no server. The page uses plain `<script src>` tags (no ES modules, no `fetch`), so it runs straight from disk:

- Open `index.html` directly in a browser (`file://`), **or**
- PowerShell: `Start-Process (Resolve-Path .\index.html).Path`

Node is only used for sanity checks (e.g. `node --check js/app.js`).

## Controls

The floating overlay (press **B** to hide) lets you:

- **Switch scenario** — VS Code · Claude Code · OS Update
- **OS Update sub-toggle** — Switch between Windows/macOS styles (shown only when OS Update is active)
- **Start / Stop** the active scene (or hit <kbd>Space</kbd>)
- **Adjust speed** (range slider, 0.4×–3×)
- **Pause** (via speed slider at 0)
- **VS Code options** — Toggle fake terminal commands, toggle typo-then-fix behavior
- **Fullscreen** — Enter focus mode

## Architecture at a glance

Pure static HTML/CSS/vanilla-JS. No framework. A tiny **core + scenarios** design:

- **`js/core.js`** — `window.Sim` — the shared runtime: cancellable `sleep`, `runId` token, speed/pause, control wiring, and the scenario registry + switcher.
- **`js/highlight.js`** — `window.Highlighter.highlightLine()` — per-line tokenizer → HTML-escaped `<span class="tok-*">` with block-comment state tracking.
- **`js/codeSamples.js`** — `window.CODE_FILES` — realistic source files the VS Code scenario types.
- **`js/scenarioVscode.js`** — VS Code scenario: typing loop, fake terminal, status-bar churn.
- **`js/scenarioClaude.js`** — Claude Code CLI scenario: prompt typing, thinking spinner, streamed text, tool calls. Drives the scripted `TURNS` array.
- **`js/scenarioOsupdate.js`** — OS Update scenario: Windows/macOS update screens, percentage/progress model, Windows↔macOS sub-toggle.
- **`js/boot.js`** — Calls `Sim.boot("vscode")` after all scenarios have registered.
- **`css/style.css`** — All theme colors as CSS variables at `:root`. Dark+ (VS Code) + terracotta (Claude CLI) + OS-update themes.

See [Architecture Overview](/architecture/overview.md) for the full design.

See [Scenarios Deep Dive](/scenarios/deep-dive.md) for scenario-specific internals.

## Adding a new scenario

1. Add a `#scene-*` container div to `index.html`.
2. Create `js/scenario*.js` that calls `Sim.register(id, { label, root, run(myRun), reset() })`.
3. Wire a `.scn-opt` button in the overlay.
4. Add its `<script src>` before `boot.js` in `index.html`.
5. Drive **every** wait through `Sim.sleep(ms, myRun)` so pause / speed / cancel all keep working.

## Source files at a glance

| File | Lines | Role |
|------|-------|------|
| `index.html` | ~173 | Single HTML host: 3 scene containers + control overlay + script imports |
| `css/style.css` | ~400+ | All theme colors as CSS variables; VS Code Dark+, Claude terracotta, OS Update themes |
| `js/core.js` | ~122 | `window.Sim` — shared runtime, cancellable clock, scenario registry, control wiring |
| `js/highlight.js` | ~167 | `window.Highlighter.highlightLine()` — per-line tokenizer with block-comment state |
| `js/codeSamples.js` | ~280 | `window.CODE_FILES` — 5 realistic source files (JS, TS, Python, Go) |
| `js/scenarioVscode.js` | ~347 | VS Code scenario — typing, terminal, status bar, jump-to-file |
| `js/scenarioClaude.js` | ~247 | Claude Code scenario — prompt, thinking, streamed text, tool calls |
| `js/scenarioOsupdate.js` | ~204 | OS Update scenario — Windows/macOS screens, crawl/stall progress, reboot |
| `js/boot.js` | ~2 | Calls `Sim.boot("vscode")` |

## OpenWiki

This repository uses OpenWiki for recurring code documentation. The scheduled GitHub Actions workflow (`openwiki-update.yml`) refreshes the wiki daily. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code and letting OpenWiki regenerate.

## Backlog

- **Testing** — `js/app.js` smoke-test with jsdom; document test workflow.
- **CSS theme details** — Claude CLI terracotta palette, OS update animations.
