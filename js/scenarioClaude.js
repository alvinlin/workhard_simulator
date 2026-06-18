/* Scenario: Claude Code CLI — auto-plays a productive agentic coding session.
   Mimics the Claude Code terminal UI: a typed user prompt, a "thinking"
   spinner, streamed assistant prose, and green-bulleted tool calls with
   tree-connector (⎿) results. Registers itself with the Sim core.          */
(function () {
  "use strict";

  const sleep = (ms, my) => Sim.sleep(ms, my);
  const $ = (id) => document.getElementById(id);

  const logEl = $("cliLog");
  const inputEl = $("cliInput");
  const inputText = inputEl.querySelector(".cli-text");
  const metaEl = $("cliMeta");

  let tokens = 0;
  const SPIN = ["✶", "✳", "✻", "✽", "✻", "✳"];
  const VERBS = ["Cogitating", "Pondering", "Crafting", "Conjuring", "Noodling",
    "Simmering", "Finagling", "Synthesizing", "Ruminating", "Wrangling"];

  // ============================================================
  //  Scripted session — a loop of realistic dev tasks (zh-Hant).
  // ============================================================
  const TURNS = [
    {
      prompt: "把 auth.service.js 的密碼雜湊從 SHA-256 換成 bcrypt",
      think: 6,
      actions: [
        { type: "text", text: "好的，我先看一下目前的雜湊實作再動手。" },
        { type: "tool", name: "Read", arg: "src/auth/auth.service.js",
          result: ['<span class="r-dim">Read 58 lines</span>'] },
        { type: "text", text: "目前是手刻的 SHA-256 加 salt。我會改用 bcrypt（cost 12），並在登入時把舊雜湊自動遷移。" },
        { type: "tool", name: "Update", arg: "src/auth/auth.service.js",
          result: ['<span class="r-add">Updated src/auth/auth.service.js with 14 additions and 9 removals</span>'] },
        { type: "tool", name: "Bash", arg: "npm test -- auth", desc: "Run auth tests",
          result: ['<span class="r-ok"> PASS </span> tests/auth.service.test.js',
                   '<span class="r-dim">Tests: 9 passed, 9 total</span>'] },
        { type: "text", text: "完成。密碼改用 bcrypt 雜湊，既有的 SHA-256 帳號會在下次登入時自動升級。" },
      ],
    },
    {
      prompt: "useMetrics 在元件卸載時有 memory leak，幫我修掉",
      think: 5,
      actions: [
        { type: "text", text: "我來檢查 interval 與 fetch 的清理邏輯。" },
        { type: "tool", name: "Read", arg: "src/hooks/useMetrics.ts",
          result: ['<span class="r-dim">Read 61 lines</span>'] },
        { type: "tool", name: "Grep", arg: "setInterval|setPoints",
          result: ['<span class="r-dim">Found 4 matches in 1 file</span>'] },
        { type: "text", text: "問題在於 fetch 還在飛時就 unmount，setPoints 會在卸載後被呼叫。我加上 cancelled 旗標並清掉 timer。" },
        { type: "tool", name: "Update", arg: "src/hooks/useMetrics.ts",
          result: ['<span class="r-add">Updated src/hooks/useMetrics.ts with 6 additions and 2 removals</span>'] },
        { type: "tool", name: "Bash", arg: "npm run typecheck", desc: "Type-check",
          result: ['<span class="r-ok">No type errors found.</span>'] },
        { type: "text", text: "修好了，cleanup 會在卸載時取消輪詢並丟棄待處理的 fetch 結果。" },
      ],
    },
    {
      prompt: "幫 rate limiter 補單元測試並跑一次",
      think: 7,
      actions: [
        { type: "text", text: "先看一下 TokenBucket 的介面，再補測試。" },
        { type: "tool", name: "Read", arg: "internal/middleware/rateLimiter.go",
          result: ['<span class="r-dim">Read 52 lines</span>'] },
        { type: "tool", name: "Write", arg: "internal/middleware/rateLimiter_test.go",
          result: ['<span class="r-add">Wrote 74 lines</span>'] },
        { type: "tool", name: "Bash", arg: "go test ./internal/middleware/...", desc: "Run Go tests",
          result: ['<span class="r-ok">ok</span>  <span class="r-dim">acme/internal/middleware  0.182s</span>'] },
        { type: "text", text: "測試涵蓋了爆量、令牌補充與並發三種情境，全部通過。" },
      ],
    },
    {
      prompt: "把剛剛的變更 commit 起來，訊息照慣例寫",
      think: 3,
      actions: [
        { type: "tool", name: "Bash", arg: "git add -A && git commit -m \"…\"", desc: "Commit changes",
          result: ['<span class="r-dim">[main 9c1f2a0]</span> fix: bcrypt hashing, useMetrics cleanup, rate-limit tests',
                   ' <span class="r-add">4 files changed, 132 insertions(+), 13 deletions(-)</span>'] },
        { type: "text", text: "已 commit（9c1f2a0）。要我接著 push 上去嗎？" },
      ],
    },
  ];

  // ============================================================
  //  Rendering helpers
  // ============================================================
  function scrollDown() { logEl.scrollTop = logEl.scrollHeight; }

  function append(html, cls) {
    const d = document.createElement("div");
    if (cls) d.className = cls;
    d.innerHTML = html;
    logEl.appendChild(d);
    scrollDown();
    return d;
  }

  function bumpTokens(n) {
    tokens += n;
    metaEl.textContent = `claude-opus-4.8 · ${fmtTokens(tokens)} tokens`;
  }
  function fmtTokens(n) { return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); }

  function welcome() {
    logEl.innerHTML = "";
    append(
      `<div class="cli-welcome">` +
        `<div class="cw-title"><span class="cw-star">✻</span> Welcome to <b>Claude Code</b></div>` +
        `<div class="cw-sub">/help for help · /status for your current setup</div>` +
        `<div class="cw-cwd">cwd: C:\\dev\\workhard-simulator</div>` +
      `</div>`);
    append(`<span class="cli-tip">※ Tip: press esc to interrupt Claude at any time.</span>`, "cli-tipline");
  }

  function setInput(text) {
    inputText.textContent = text;
    inputEl.classList.toggle("empty", text.length === 0);
  }

  // ============================================================
  //  Animated pieces
  // ============================================================
  async function typePrompt(text, my) {
    setInput("");
    inputEl.classList.add("focus");
    let s = "";
    for (const ch of text) {
      s += ch;
      setInput(s);
      await sleep(38 + Math.random() * 60, my);
      if (Math.random() < 0.02) await sleep(300, my); // think mid-sentence
    }
    await sleep(450, my); // pause before pressing enter
    inputEl.classList.remove("focus");
  }

  function submitPrompt(text) {
    append(`<span class="cli-gt">&#9656;</span> <span class="cli-usertext">${escapeHtml(text)}</span>`, "cli-user");
    setInput("");
  }

  async function think(secs, my) {
    const verb = VERBS[Math.floor(Math.random() * VERBS.length)];
    const line = append("", "cli-think");
    const total = Math.max(2, secs);
    let elapsed = 0, frame = 0;
    while (elapsed < total) {
      const star = SPIN[frame % SPIN.length];
      bumpTokens(40 + Math.floor(Math.random() * 120));
      line.innerHTML =
        `<span class="th-star">${star}</span> ${verb}… ` +
        `<span class="th-meta">(${elapsed}s · ↑ ${fmtTokens(tokens)} tokens · esc to interrupt)</span>`;
      scrollDown();
      await sleep(420, my);
      frame++;
      elapsed = Math.round(frame * 0.42 * 1); // ~real seconds regardless of speed slider feel
    }
    line.remove(); // spinner vanishes once Claude starts answering
  }

  async function streamText(text, my) {
    const d = append(`<span class="ab-dot">●</span> <span class="ab-text"></span>`, "cli-assistant");
    const target = d.querySelector(".ab-text");
    let s = "";
    for (const ch of text) {
      s += ch;
      target.textContent = s;
      scrollDown();
      bumpTokens(2);
      await sleep(14 + Math.random() * 26, my);
    }
  }

  async function toolCall(action, my) {
    const argHtml = `<span class="tc-name">${action.name}</span>` +
      `<span class="tc-paren">(</span><span class="tc-arg">${escapeHtml(action.arg)}</span><span class="tc-paren">)</span>` +
      (action.desc ? ` <span class="tc-desc">— ${escapeHtml(action.desc)}</span>` : "");
    append(`<span class="tc-dot">●</span> ${argHtml}`, "cli-tool");
    // brief "running" beat
    const pending = append(`<span class="tc-tree">⎿</span>  <span class="tc-run">running…</span>`, "cli-result");
    await sleep(500 + Math.random() * 700, my);
    bumpTokens(60 + Math.floor(Math.random() * 200));

    const lines = action.result || [];
    pending.innerHTML =
      `<span class="tc-tree">⎿</span>  ${lines[0] || ""}` +
      lines.slice(1).map((l) => `\n     ${l}`).join("");
    scrollDown();
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function trimLog() {
    // keep welcome (first 2 nodes) + a rolling window of recent output
    const KEEP = 70;
    while (logEl.children.length > KEEP) logEl.removeChild(logEl.children[2]);
  }

  // ============================================================
  //  Run loop + idle reset
  // ============================================================
  async function run(my) {
    welcome();
    tokens = 0;
    bumpTokens(0);
    let i = 0;
    await sleep(700, my);

    while (my === Sim.runId) {
      const turn = TURNS[i % TURNS.length];
      trimLog();

      await typePrompt(turn.prompt, my);
      submitPrompt(turn.prompt);
      await sleep(350, my);
      await think(turn.think, my);

      for (const action of turn.actions) {
        if (action.type === "text") await streamText(action.text, my);
        else await toolCall(action, my);
        await sleep(260 + Math.random() * 260, my);
      }

      append(`<span class="cli-done">✓ done · ${fmtTokens(tokens)} tokens used this session</span>`, "cli-doneline");
      await sleep(1600 + Math.random() * 1200, my);
      i++;
    }
  }

  function reset() {
    welcome();
    tokens = 0;
    bumpTokens(0);
    setInput("");
    inputEl.classList.remove("focus");
    append(`<span class="cli-idle">▶ Press Start working — or hit Space — to watch Claude grind.</span>`, "cli-idleline");
  }

  Sim.register("claude", {
    label: "Claude Code",
    root: document.getElementById("scene-claude"),
    run,
    reset,
  });
})();
