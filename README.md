# WorkHard Simulator

A novelty web app that auto-plays a believable *"hard at work"* session. It
exists purely to **look** like someone is grinding — no real work happens, no
data leaves the page. Pick a scenario from the floating control panel and watch
the screen busy itself.

> ⚠️ For fun only. This is a screen-filler / demo, not a productivity tool.

## Scenarios

- **VS Code** — live-typed, syntax-highlighted code with tab switching, a fake
  terminal running `git` / `npm` commands, and a churning status bar.
- **Claude Code** — a Claude Code CLI session: a typed user prompt, a "thinking"
  spinner with a token counter, streamed assistant prose, and green-bulleted
  tool calls (Read / Edit / Bash / …) with `⎿` tree-connector results.
- **OS Update** — a full-screen *"installing updates"* screen you can switch
  between **Windows** (blue, dot throbber, "已完成 NN%") and **macOS** (black,
  Apple logo, thin progress bar). It crawls and stalls to 100%, "restarts", then
  loops with the next version.

Scenarios are swappable modules registered against a shared core, so adding more
(debugging, writing docs, etc.) is just a matter of dropping in another scenario
file.

## Running

No build step, no dependencies, no server. The page uses plain `<script src>`
tags (no ES modules, no `fetch`), so it runs straight from disk:

- Open `index.html` directly in a browser (`file://`), **or**
- PowerShell: `Start-Process (Resolve-Path .\index.html).Path`

Node is only used for sanity checks, e.g. `node --check js/app.js`.

## Controls

The floating overlay lets you:

- **Switch scenario** — VS Code · Claude Code · OS Update (with a Windows/macOS
  sub-toggle when OS Update is active).
- **Start / Stop** the active scene (or hit <kbd>Space</kbd>).
- **Adjust speed** and **pause**.

## Architecture

Pure static HTML/CSS/vanilla-JS. No framework. A tiny **core + scenarios**
design — the core owns the clock and controls; each scenario is a self-contained
animation module that registers itself.

| File | Role |
|------|------|
| `index.html` | Hosts the scenes (`#scene-vscode`, `#scene-claude`, `#scene-osupdate`) and the shared control overlay. Script load order matters. |
| `css/style.css` | Dark+ (VS Code) + terracotta (Claude CLI) + OS-update themes. All colors are CSS variables at `:root`. |
| `js/core.js` | `window.Sim` — the shared runtime: cancellable `sleep`, `runId` token, speed/pause, control wiring, and the scenario registry + switcher. |
| `js/highlight.js` | `window.Highlighter.highlightLine(line, lang, state)` — per-line tokenizer → HTML-escaped `<span class="tok-*">`. |
| `js/codeSamples.js` | `window.CODE_FILES` — source files the VS Code scenario types. |
| `js/scenarioVscode.js` | VS Code scenario: typing loop, fake terminal, status-bar churn. |
| `js/scenarioClaude.js` | Claude Code CLI scenario: prompt typing, thinking spinner, streamed text, tool calls. |
| `js/scenarioOsupdate.js` | OS Update scenario: Windows/macOS update screens + the Windows↔macOS sub-toggle. |
| `js/boot.js` | Calls `Sim.boot("vscode")` after all scenarios have registered. |

**Load order** (core first, boot last):
`core.js` → `highlight.js` → `codeSamples.js` → `scenarioVscode.js`
→ `scenarioClaude.js` → `scenarioOsupdate.js` → `boot.js`.

### Adding a scenario

1. Add a `#scene-*` container to `index.html`.
2. Create `js/scenario*.js` that calls `Sim.register(id, { label, root, run, reset })`.
3. Wire a `.scn-opt` button in the overlay and add its `<script>` before `boot.js`.
4. Drive **every** wait through `Sim.sleep(ms, myRun)` so pause / speed / cancel
   all keep working.

See [`CLAUDE.md`](CLAUDE.md) for the full architecture notes and conventions.

## License

For personal / novelty use.
