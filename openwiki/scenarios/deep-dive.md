# Scenarios Deep Dive

Each scenario is a self-contained IIFE module that registers with `Sim` and drives its own animation loop. This page covers the internals of each scenario.

## VS Code Scenario (`js/scenarioVscode.js`)

### What it does

Auto-plays an intense coding session in a VS Code-like IDE:

1. Types out source files line-by-line with per-character delays and live syntax highlighting.
2. Switches between files (via tabs or file tree clicks).
3. Runs fake terminal commands (`git status`, `npm test`, `git push`, etc.).
4. Churns the status bar (errors, warnings, branch sync counter).

### Key internals

#### Typing engine

- **Per-character delays** via `charDelay(ch, prev)` — base 22–77ms, halved for fast chars (` .,;:(){}[]=>`), extra delay after `.!?`, and 1.8% chance of a 350–1250ms pause (simulating thought).
- **Per-line typing** via `typeFile(idx, my)` — creates a new DOM line, appends characters one at a time, re-highlights the current line each keystroke.
- **Block comment state** — `blockState` is passed between lines to maintain `/* ... */` context across the file. Finished lines freeze their highlighting and commit their state.
- **Typos** — when `optTypos` checkbox is checked, 1.5% of alphabetic chars are randomly replaced, then backspaced after a short delay.

#### Terminal

- `commandRuns()` returns 6 possible command+output combinations:
  - `git status` — shows a random branch name
  - `npm test` — 3 test suites, 27 tests passed
  - `git add -A && git commit` — random commit message
  - `npm run build` — Vite production build output
  - `git push origin <branch>` — pushes to `github.com:acme/workhard-simulator.git`
  - `npx tsc --noEmit` — "No type errors found"
- Output streams character-by-character; `git push` resets the status-bar "ahead" counter.

#### Status bar

- `stats = { errors: 0, warnings: 0, ahead: 0 }` — jittered by `maybeJitterProblems()` (6% warning change, 3% error change per line finish).
- `flashSaved()` increments `ahead` counter after each file save (shown as `↑ N↓ 0`).

#### Jump-to-file

Clicking a tab or file tree item while running calls `jumpTo(idx)`, which bumps `runId` and starts a new `typeFile` loop from that index. This is a separate async path that catches `"cancelled"` errors.

#### Run loop

```
while (my === Sim.runId):
  typeFile(order % files.length, my)
  sleep(500ms)
  if random < 0.7: runTerminal(my)
  sleep(700ms)
  order++
```

#### Data: `window.CODE_FILES`

Four source files from `js/codeSamples.js`:

| File | Language | Description |
|------|----------|-------------|
| `auth.service.js` | JavaScript | Password hashing (SHA-256 + salt), JWT token signing/verification, user registration & auth |
| `useMetrics.ts` | TypeScript | React hook for polling metrics with cleanup on unmount |
| `pipeline.py` | Python | Async worker pool with retry + exponential backoff |
| `Button.tsx` | TypeScript/React | ForwardRef button component with variants/sizes/loading state |
| `rateLimiter.go` | Go | TokenBucket rate limiter middleware |

Languages supported by the highlighter: JavaScript, TypeScript, Python, Go.

## Claude Code Scenario (`js/scenarioClaude.js`)

### What it does

Auto-plays a Claude Code CLI session: a typed user prompt, a "thinking" spinner with token counter, streamed assistant prose, and green-bulleted tool calls with tree-connector (`⎿`) results.

### Key internals

#### Scripted turns

The `TURNS` array contains 4 scripted dev tasks (in zh-Hant / Traditional Chinese):

1. **"把 auth.service.js 的密碼雜湊從 SHA-256 換成 bcrypt"** — Read auth.service.js, Update to bcrypt, run tests.
2. **"useMetrics 在元件卸載時有 memory leak，幫我修掉"** — Read useMetrics.ts, Grep for setInterval, Update with cancelled flag, type-check.
3. **"幫 rate limiter 補單元測試並跑一次"** — Read rateLimiter.go, Write test file, run Go tests.
4. **"把剛剛的變更 commit 起來，訊息照慣例寫"** — git add/commit.

Each turn: `prompt → think → actions (text + tool calls) → done line`.

#### Thinking phase

- Spinner uses Unicode characters: `✶ ✳ ✻ ✽ ✻ ✳`.
- Randomized verbs: "Cogitating", "Pondering", "Crafting", "Conjuring", "Noodling", "Simmering", "Finagling", "Synthesizing", "Ruminating", "Wrangling".
- Token counter increments by 40–160 per frame.
- Duration is specified in seconds per turn (`think` field).

#### Tool calls

Supported tool types in the scripted data: `Read`, `Update`, `Grep`, `Write`, `Bash`. Each shows:
- A green-bulleted tool name with args
- A brief "running…" pause (500–1200ms)
- A `⎿` tree-connector result with colored output (`r-ok`, `r-add`, `r-dim`, `r-err`)

Result strings are intentional HTML (colored via `.r-*` classes) and are **not** escaped. The prompt, user echo, and tool `arg` **are** escaped.

#### Log management

`trimLog()` keeps the welcome message (first 2 nodes) plus a rolling window of 70 recent output lines.

#### Token counter

`tokens` accumulates across all turns. Displayed as `claude-opus-4.8 · X tokens` in the CLI meta bar. Formatted with `fmtTokens()` (e.g., "1.2k").

#### Run loop

```
while (my === Sim.runId):
  welcome()
  tokens = 0
  loop through TURNS:
    typePrompt(turn.prompt, my)
    submitPrompt()
    think(turn.think, my)
    for each action in turn.actions:
      if text: streamText(action.text, my)
      else: toolCall(action, my)
    append done line
    sleep(1600–2800ms)
```

## OS Update Scenario (`js/scenarioOsupdate.js`)

### What it does

Full-screen "installing updates" screen switchable between Windows and macOS styles. Progress crawls, stalls at realistic zones, finishes, shows a reboot, then loops with the next version.

### Key internals

#### OS styles

| Feature | Windows | macOS |
|---------|---------|-------|
| Background | `#0a64ba` (blue) | `#000` (black) |
| Logo | Dot throbber (10 dots, rotating CSS) | Inline SVG Apple logo |
| Progress | "已完成 NN%" text | Thin progress bar |
| Status text | "正在處理更新" → "正在下載更新" → "正在安裝更新" → "正在設定更新" → "即將完成" | "正在準備安裝…" → "估計剩餘時間：約 N 分鐘" |
| Completion | "即將完成" → "正在重新啟動" | "即將完成…" → "正在重新啟動…" |
| Reboot | Brief black screen (1.5s) | Brief black screen (1.5s) |

#### Progress model

`nextPct(pct)` — non-linear progress:
- < 28%: fast (0.8–4.0% per step)
- 28–33%: stall (0.15–0.65% per step, simulating the ~30% hang)
- 33–70%: fast (0.8–4.0% per step)
- 70–75%: stall (0.15–0.65% per step, simulating the ~72% hang)
- 75–98%: fast (0.8–4.0% per step)
- 98–100%: crawl (0.2–0.9% per step)

`stallMs(pct)` — delay between progress steps:
- 98%+: 700–1600ms
- 28–33% or 70–75%: 500–1200ms
- Otherwise: 180–500ms

#### Version strings

- **Windows**: "Windows 11 23H2 · 累積更新 KB5037771", "功能更新到 Windows 11 版本 24H2", ".NET Framework 累積更新 KB5039895", "惡意軟體移除工具 x64 KB890830"
- **macOS**: "macOS Sequoia 15.5", "macOS Sequoia 15.6", "安全性回應 15.5 (a)"

#### Windows↔macOS toggle

`.os-opt` buttons in the overlay (shown only when OS Update is active):
- Clicking switches the `os` module-level variable
- If running: `Sim.stop(); Sim.start()` to restart with the new OS
- If stopped: calls `reset()` to show the idle message

#### Run loop

```
while (my === Sim.runId):
  render()        // build DOM for current OS
  installOnce(my, versionIndex)  // progress 0→100%
  reboot(my)      // reboot animation + black screen
  versionIndex++
```

## Scenario registration pattern

All scenarios follow the same registration pattern:

```js
Sim.register("id", {
  label: "Display Name",
  root: document.getElementById("scene-id"),
  run(myRun) { /* async animation loop */ },
  reset() { /* restore idle state */ },
});
```

The `run()` function receives `myRun` (the run ID at start time) and must check `myRun === Sim.runId` on every loop iteration. `Sim.sleep(ms, myRun)` handles cancellation automatically.

The `reset()` function is called when:
- The scenario is switched away from (via `setActive`)
- The scenario is stopped (via `stop()`)
