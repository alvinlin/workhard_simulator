# Architecture Overview

## Design philosophy

WorkHard Simulator is a **zero-dependency, buildless** web app. No frameworks, no bundlers, no ES modules, no server. It runs from a single `index.html` opened via `file://`. The entire app is vanilla HTML + CSS + JavaScript.

## High-level structure

```
index.html          ← Single HTML host for all scenes + control overlay
css/style.css       ← All theme colors as CSS variables at :root
js/
  core.js           ← window.Sim — shared runtime, registry, controls
  highlight.js      ← window.Highlighter — per-line syntax tokenizer
  codeSamples.js    ← window.CODE_FILES — source files for VS Code scenario
  scenarioVscode.js  ← VS Code scenario module
  scenarioClaude.js  ← Claude Code scenario module
  scenarioOsupdate.js ← OS Update scenario module
  boot.js           ← Calls Sim.boot("vscode")
```

## The boot sequence

Script load order is critical (declared in `index.html`):

```
core.js → highlight.js → codeSamples.js → scenarioVscode.js
→ scenarioClaude.js → scenarioOsupdate.js → boot.js
```

1. `core.js` defines `window.Sim` (IIFE) with `register`, `sleep`, `start`, `stop`, `setActive`, `boot`.
2. `highlight.js` defines `window.Highlighter.highlightLine` (IIFE).
3. `codeSamples.js` defines `window.CODE_FILES` (IIFE).
4. Each `scenario*.js` calls `Sim.register(id, {...})` to self-register.
5. `boot.js` calls `Sim.boot("vscode")` — wires the control overlay, sets the default scene.

## The core (`js/core.js`)

`window.Sim` is a singleton IIFE exposing:

### Scenario interface

```js
Sim.register(id, { label, root, run(myRun), reset() })
```

- `id` — unique scenario identifier (`"vscode"`, `"claude"`, `"osupdate"`)
- `label` — display name shown in the overlay
- `root` — the DOM container (`#scene-vscode`, `#scene-claude`, `#scene-osupdate`) shown only while active
- `run(myRun)` — async loop driving the animation; MUST `await Sim.sleep(ms, myRun)` for pause/speed/cancel to work
- `reset()` — restore the scene to its idle (not-running) look

### Cancellable runs via `runId`

A monotonically increasing `Sim.runId` token identifies the active run. The following bump it:

- Start/stop toggles
- Scene switches
- VS Code "jump to file"

Every `await Sim.sleep(ms, myRun)` rejects with `"cancelled"` once `myRun !== Sim.runId`, unwinding the in-flight loop. `run()` is wrapped by core; ad-hoc loops must `try/catch` and swallow `"cancelled"`.

### `Sim.sleep(ms, myRun)`

The **one place** that honors `paused`, `speed`, and cancellation. Never use raw `setTimeout` for a simulated wait — route through `Sim.sleep` so pause/speed/cancel all keep working.

Internally: divides the delay by `state.speed`, polls for `state.paused` (parks itself), and checks `myRun !== state.runId` on every tick.

### Control wiring (`Sim.boot`)

- Speed slider → `state.speed` (default 1.3×, range 0.4–3)
- Start/Stop button → `toggle()` → `start()` / `stop()`
- Fullscreen button → `requestFullscreen()` / `exitFullscreen()`
- Scene buttons (`.scn-opt`) → `setActive(id)`
- Boss key **B** → hide the control overlay
- **Space** → toggle start/stop

### State machine

```js
state = { running: false, paused: false, runId: 0, speed: 1.3, active: null }
```

- `running` — is the current scenario animating?
- `paused` — time frozen (speed slider at 0)
- `runId` — monotonically increasing cancellation token
- `speed` — time multiplier (1.3 default)
- `active` — currently selected scenario id

## CSS theming

All theme colors are CSS custom properties defined at `:root` in `css/style.css`. The body gets a class (`mode-vscode`, `mode-claude`, `mode-osupdate`) set by `Sim.setActive()` for scenario-specific styling. Key color groups:

- **VS Code (Dark+)** — `--bg: #1e1e1e`, `--statusbar: #007acc`, syntax tokens
- **Claude CLI** — terracotta palette (`.cli-titlebar`, `.cli-log`, `.cli-bottom`)
- **OS Update** — Windows blue (`osu-win`), macOS black (`osu-mac`, `osu-black`)

## Scenario registration pattern

Each scenario module is an IIFE that:

1. Captures DOM references by ID.
2. Defines local animation helpers (`typeFile`, `typeCommand`, `think`, `toolCall`, etc.).
3. Defines `run(myRun)` — the main async animation loop.
4. Defines `reset()` — restore idle state.
5. Calls `Sim.register("id", { label, root, run, reset })` at the bottom.
6. May set up scenario-specific overlay buttons (e.g., OS Update's Windows/macOS toggle).

## Adding a new scenario — step by step

1. **Add a scene container** to `index.html`:
   ```html
   <div id="scene-mynew" class="scene scene-hidden">
     <!-- your scene DOM -->
   </div>
   ```

2. **Create `js/scenarioMyNew.js`** with an IIFE:
   ```js
   (function () {
     "use strict";
     const sleep = (ms, my) => Sim.sleep(ms, my);
     // ... DOM refs, run(), reset() ...
     Sim.register("mynew", {
       label: "My New Scenario",
       root: document.getElementById("scene-mynew"),
       run,
       reset,
     });
   })();
   ```

3. **Wire a scenario button** in the overlay:
   ```html
   <button class="scn-opt" data-scn="mynew">My New Scenario</button>
   ```

4. **Add the script tag** before `boot.js` in `index.html`.

5. **Drive every wait through `Sim.sleep(ms, myRun)`**.

## GitHub Actions integration

`.github/workflows/openwiki-update.yml` runs daily at 08:00 UTC (and on demand via `workflow_dispatch`). It:

1. Checks out the repo.
2. Installs Node.js 22.
3. Installs OpenWiki globally.
4. Runs `openwiki code --update --print`.
5. Creates a pull request with documentation updates via `peter-evans/create-pull-request`.

Uses OpenRouter (`z-ai/glm-5.2`) with LangChain tracing.
