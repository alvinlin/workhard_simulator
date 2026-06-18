# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository.

## What this is

**WorkHard Simulator** — a novelty web app that mimics Visual Studio Code and
auto-plays an "intensely coding" session: live-typed source code with syntax
highlighting, tab switching, a fake terminal running git/npm commands, and a
churning status bar. It exists to *look* like someone is hard at work.

The first (and current) scenario simulates working in VS Code. The design
leaves room for additional scenarios later (e.g. debugging, writing docs).

## Running

No build step, no dependencies, no server required. The page uses plain
`<script src>` tags (no ES modules, no `fetch`), so it runs straight from disk:

- Open `index.html` directly in a browser (`file://`), or
- PowerShell: `Start-Process (Resolve-Path .\index.html).Path`

Node is only used for sanity checks, e.g. `node --check js/app.js`.

## Architecture

Pure static HTML/CSS/vanilla-JS. No framework. Three layers:

| File | Role |
|------|------|
| `index.html` | VS Code chrome: title bar, activity bar, sidebar/explorer, tabs, editor + minimap, terminal panel, status bar, and the floating control overlay. |
| `css/style.css` | Dark+ theme. All colors are CSS variables at `:root` (UI + `--tok-*` syntax tokens). |
| `js/codeSamples.js` | `window.CODE_FILES` — the source files that get "typed". Each: `{ name, icon, lang, code }`. |
| `js/highlight.js` | `window.Highlighter.highlightLine(line, lang, state)` — per-line tokenizer returning HTML-escaped `<span class="tok-*">` markup. `state` carries multi-line context (block comments). |
| `js/app.js` | The engine: typing loop, terminal, status-bar churn, controls. |

Scripts load in order: `codeSamples.js` → `highlight.js` → `app.js`. `app.js`
wraps everything in one IIFE and reads the two globals above.

### How the engine works (`js/app.js`)

- **Cancellable session via `runId`.** A monotonically increasing `runId` token
  identifies the active session. Starting, stopping, or jumping files bumps
  `runId`. Every `await sleep(ms, myRun)` rejects with `"cancelled"` once
  `myRun !== runId`, which unwinds the in-flight async loop. Callers wrap loops
  in `try/catch` and swallow `"cancelled"`.
- **`sleep(ms, myRun)`** is the one place that honors `paused` (parks itself) and
  `speed` (divides the delay). Never use raw `setTimeout` for simulated waits —
  route through `sleep` so pause/speed/cancel all keep working.
- **Typing** is per-line: `newLine()` creates a `.line`, then characters are
  appended and the *current line only* is re-highlighted each keystroke (with a
  caret). Finished lines are highlighted once and frozen, which also commits the
  `blockState` for multi-line comments.
- **Terminal** commands stream from `commandRuns()` (a pool of believable
  git/npm runs). `git push` resets the status-bar "ahead" counter.

## Conventions

- Keep it **dependency-free and buildless**. Don't introduce npm packages, a
  bundler, or ES modules unless the no-server `file://` workflow is preserved.
- New "typed" files: add an entry to `window.CODE_FILES`. If it's a new language,
  add a keyword map + `LANG_LABEL` entry, and confirm `highlightLine` handles it.
- All theme colors belong in `:root` variables, not inline literals.
- Match the existing terse, comment-light vanilla-JS style.
