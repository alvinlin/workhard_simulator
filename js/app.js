/* WorkHard Simulator — drives the fake VS Code "intense coding" session. */
(function () {
  "use strict";

  const files = window.CODE_FILES;
  const { highlightLine } = window.Highlighter;

  // ---- DOM refs ----
  const $ = (id) => document.getElementById(id);
  const codeArea = $("codeArea");
  const editor = $("editor");
  const minimap = $("minimap");
  const tabsEl = $("tabs");
  const fileTreeEl = $("fileTree");
  const terminalEl = $("terminal");
  const breadcrumbFile = $("bcFile");
  const windowTitle = $("windowTitle");

  const stPos = $("stPos");
  const stLang = $("stLang");
  const stErr = $("stErr");
  const stWarn = $("stWarn");
  const stSync = $("stSync");
  const panelProblems = $("panelProblems");

  const btnToggle = $("btnToggle");
  const btnFull = $("btnFull");
  const speedEl = $("speed");
  const speedVal = $("speedVal");
  const optTerminal = $("optTerminal");
  const optTypos = $("optTypos");
  const controls = $("controls");
  const controlsCollapse = $("controlsCollapse");

  const LANG_LABEL = {
    javascript: "JavaScript", typescript: "TypeScript",
    python: "Python", go: "Go",
  };
  const ICON_COLOR = { JS: "#e8d44d", TS: "#3b9eff", PY: "#4b8bbe", GO: "#00add8" };

  // ---- runtime state ----
  let running = false;
  let paused = false;       // true while user stopped; loop parks itself
  let runId = 0;            // bumped to cancel an in-flight session
  let speed = parseFloat(speedEl.value);
  let stats = { errors: 0, warnings: 0, ahead: 0 };

  // ============================================================
  //  Build the static chrome (file tree + tabs)
  // ============================================================
  function buildChrome() {
    fileTreeEl.innerHTML = "";
    tabsEl.innerHTML = "";
    files.forEach((f, idx) => {
      const li = document.createElement("li");
      li.dataset.idx = idx;
      li.innerHTML = `<span class="fi" style="color:${ICON_COLOR[f.icon] || "#ccc"}">${f.icon}</span>${f.name}`;
      fileTreeEl.appendChild(li);

      const tab = document.createElement("div");
      tab.className = "tab";
      tab.dataset.idx = idx;
      tab.innerHTML = `<span class="fi" style="color:${ICON_COLOR[f.icon] || "#ccc"}">${f.icon}</span>${f.name}<span class="tab-close"></span>`;
      tabsEl.appendChild(tab);
    });
  }

  function setActiveFile(idx) {
    const f = files[idx];
    [...fileTreeEl.children].forEach((li, i) => li.classList.toggle("active", i === idx));
    [...tabsEl.children].forEach((t, i) => t.classList.toggle("active", i === idx));
    breadcrumbFile.textContent = f.name;
    windowTitle.textContent = `${f.name} — workhard-simulator — Visual Studio Code`;
    stLang.textContent = LANG_LABEL[f.lang] || f.lang;
  }

  function markTabDirty(idx, dirty) {
    const t = tabsEl.children[idx];
    if (t) t.classList.toggle("dirty", dirty);
  }

  // ============================================================
  //  Cancellable, pause-aware, speed-aware wait
  // ============================================================
  function sleep(ms, myRun) {
    return new Promise((resolve, reject) => {
      let remaining = ms / speed;
      const tick = () => {
        if (myRun !== runId) return reject("cancelled");
        if (paused) { setTimeout(tick, 80); return; }
        const step = Math.min(remaining, 40);
        remaining -= step;
        if (remaining <= 0) resolve();
        else setTimeout(tick, step);
      };
      tick();
    });
  }

  // ============================================================
  //  Editor rendering
  // ============================================================
  let curLineEl = null;     // <div.line> currently being typed
  let curTextEl = null;     // its .ln-text span
  let lineCount = 0;
  let blockState = {};       // multi-line highlight state (block comments)

  function resetEditor() {
    codeArea.innerHTML = "";
    minimap.innerHTML = "";
    curLineEl = curTextEl = null;
    lineCount = 0;
    blockState = {};
  }

  function newLine(text) {
    // finalize previous current-line styling
    if (curLineEl) curLineEl.classList.remove("cur");
    lineCount++;
    const line = document.createElement("div");
    line.className = "line cur";
    const num = document.createElement("span");
    num.className = "ln-num";
    num.textContent = lineCount;
    const txt = document.createElement("span");
    txt.className = "ln-text";
    line.appendChild(num);
    line.appendChild(txt);
    codeArea.appendChild(line);
    curLineEl = line;
    curTextEl = txt;
    renderCurrentLine(text || "", true);
    addMinimapLine(text || "");
  }

  let curRaw = "";
  function renderCurrentLine(raw, withCaret) {
    curRaw = raw;
    const lang = files[activeIdx].lang;
    const { html, state } = highlightLine(raw, lang, blockState);
    curTextEl.innerHTML = html + (withCaret ? '<span class="caret"></span>' : "");
    // commit block-comment state only when the line is "done"
    if (!withCaret) blockState = state;
    // keep caret line in view
    const lineTop = curLineEl.offsetTop;
    const viewTop = editor.scrollTop;
    const viewBot = viewTop + editor.clientHeight;
    if (lineTop > viewBot - 60 || lineTop < viewTop) {
      editor.scrollTop = lineTop - editor.clientHeight + 80;
    }
  }

  function addMinimapLine(text) {
    const bar = document.createElement("div");
    bar.className = "mm-line";
    const len = Math.min(text.replace(/\t/g, "  ").length, 60);
    bar.style.width = Math.max(2, len * 1.1) + "px";
    const indent = text.match(/^\s*/)[0].length;
    bar.style.marginLeft = Math.min(indent * 1.1, 24) + "px";
    // colour roughly by content
    let c = "#3a3a3a";
    if (/^\s*(\/\/|#|\/\*|\*)/.test(text)) c = "#2f4030";
    else if (/["'`]/.test(text)) c = "#4a3b33";
    else if (/\b(function|def|func|class|const|import|export)\b/.test(text)) c = "#2f3f55";
    bar.style.background = c;
    minimap.appendChild(bar);
    if (minimap.children.length > 200) minimap.removeChild(minimap.firstChild);
  }

  // ============================================================
  //  Typing engine
  // ============================================================
  const FAST = new Set(" .,;:(){}[]=>".split(""));

  function charDelay(ch, prev) {
    let base = 22 + Math.random() * 55;          // ~baseline cadence
    if (FAST.has(ch)) base *= 0.55;              // burst through punctuation
    if (ch === " " && prev === " ") base *= 0.3; // indentation flies by
    if (".!?".includes(prev)) base += 120;       // think after sentences
    if (Math.random() < 0.018) base += 350 + Math.random() * 900; // occasional pondering
    return base;
  }

  async function typeFile(idx, myRun) {
    activeIdx = idx;
    setActiveFile(idx);
    resetEditor();
    markTabDirty(idx, true);

    const lines = files[idx].code.replace(/\n$/, "").split("\n");
    let prev = "";

    for (let li = 0; li < lines.length; li++) {
      const target = lines[li];
      newLine("");
      let typed = "";

      let c = 0;
      while (c < target.length) {
        const ch = target[c];

        // occasional typo on word characters, then a corrective backspace burst
        if (optTypos.checked && /[a-z]/.test(ch) && Math.random() < 0.015) {
          const wrong = "asdfghjklqwertyuiop"[Math.floor(Math.random() * 19)];
          renderCurrentLine(typed + wrong, true);
          updateCursor(li + 1, typed.length + 2);
          await sleep(charDelay(wrong, prev), myRun);
          await sleep(150 + Math.random() * 250, myRun); // notice the mistake
          renderCurrentLine(typed, true);                // backspace
          await sleep(90, myRun);
        }

        typed += ch;
        renderCurrentLine(typed, true);
        updateCursor(li + 1, typed.length + 1);
        await sleep(charDelay(ch, prev), myRun);
        prev = ch;
        c++;
      }
      renderCurrentLine(typed, false); // finalize line (caret removed)

      // pause at end of line — longer after blank lines / block ends
      let endPause = 30 + Math.random() * 70;
      if (target.trim() === "" || target.trim() === "}") endPause += 120;
      if (/\{$/.test(target.trim())) endPause += 60;
      await sleep(endPause, myRun);

      maybeJitterProblems();
    }

    // file finished -> "save"
    await sleep(400, myRun);
    markTabDirty(idx, false);
    flashSaved();
  }

  let activeIdx = 0;

  function updateCursor(line, col) {
    stPos.textContent = `Ln ${line}, Col ${col}`;
  }

  // ============================================================
  //  Status bar churn (problems counter feels alive)
  // ============================================================
  function maybeJitterProblems() {
    if (Math.random() < 0.06) {
      stats.warnings = Math.max(0, stats.warnings + (Math.random() < 0.5 ? 1 : -1));
    }
    if (Math.random() < 0.03) {
      stats.errors = Math.max(0, stats.errors + (Math.random() < 0.6 ? 1 : -1));
    }
    renderStats();
  }
  function renderStats() {
    stErr.textContent = stats.errors;
    stWarn.textContent = stats.warnings;
    panelProblems.textContent = stats.errors + stats.warnings;
  }
  let saveTimer = null;
  function flashSaved() {
    stats.ahead++;
    stSync.innerHTML = `&#8635; 0&#8595; ${stats.ahead}&#8593;`;
  }

  // ============================================================
  //  Fake terminal
  // ============================================================
  function termWrite(html) {
    const span = document.createElement("div");
    span.innerHTML = html;
    terminalEl.appendChild(span);
    terminalEl.scrollTop = terminalEl.scrollHeight;
    return span;
  }
  function clearCaret() {
    terminalEl.querySelectorAll(".t-caret").forEach((c) => c.remove());
  }

  async function typeCommand(cmd, myRun) {
    clearCaret();
    const promptHtml = '<span class="t-path">PS C:\\dev\\workhard-simulator</span> <span class="t-branch">(main)</span><span class="t-prompt">&gt;</span> ';
    const line = termWrite(promptHtml + '<span class="cmd"></span><span class="t-caret"></span>');
    const cmdSpan = line.querySelector(".cmd");
    for (const ch of cmd) {
      cmdSpan.textContent += ch;
      terminalEl.scrollTop = terminalEl.scrollHeight;
      await sleep(35 + Math.random() * 45, myRun);
    }
    line.querySelector(".t-caret")?.remove();
    return line;
  }

  // a pool of believable command runs
  function commandRuns() {
    const branch = ["feat/auth-tokens", "fix/rate-limit", "chore/metrics", "main"][Math.floor(Math.random() * 4)];
    return [
      {
        cmd: "git status",
        out: [
          'On branch <span class="t-branch">' + branch + "</span>",
          'Changes not staged for commit:',
          '  <span class="t-warn">modified:   ' + files[activeIdx].name + "</span>",
          'no changes added to commit (use "git add")',
        ],
      },
      {
        cmd: "npm test",
        out: [
          '<span class="t-dim">&gt; jest --runInBand</span>',
          "",
          '<span class="t-ok"> PASS </span> tests/auth.service.test.js',
          '<span class="t-ok"> PASS </span> tests/pipeline.test.js',
          '<span class="t-ok"> PASS </span> tests/rateLimiter.test.js',
          '<span class="t-ok">Test Suites: 3 passed, 3 total</span>',
          '<span class="t-ok">Tests:       27 passed, 27 total</span>',
          '<span class="t-dim">Time:        2.8 s</span>',
        ],
      },
      {
        cmd: "git add -A && git commit -m \"refactor: tighten token validation\"",
        out: [
          '<span class="t-branch">[' + branch + ' 4f2a9c1]</span> refactor: tighten token validation',
          ' <span class="t-info">3 files changed, 48 insertions(+), 12 deletions(-)</span>',
        ],
      },
      {
        cmd: "npm run build",
        out: [
          '<span class="t-dim">vite v5.2.0 building for production...</span>',
          "&#10003; 412 modules transformed.",
          '<span class="t-info">dist/assets/index-8f3c1.js   142.6 kB &#9474; gzip: 46.1 kB</span>',
          '<span class="t-ok">&#10003; built in 3.41s</span>',
        ],
      },
      {
        cmd: "git push origin " + branch,
        out: [
          '<span class="t-dim">Enumerating objects: 14, done.</span>',
          '<span class="t-dim">Writing objects: 100% (8/8), 1.21 KiB</span>',
          'To github.com:acme/workhard-simulator.git',
          '<span class="t-ok">   3a1f0c2..4f2a9c1  ' + branch + " -> " + branch + "</span>",
        ],
      },
      {
        cmd: "npx tsc --noEmit",
        out: ['<span class="t-ok">No type errors found.</span>'],
      },
    ];
  }

  async function runTerminal(myRun) {
    if (!optTerminal.checked) return;
    const run = commandRuns()[Math.floor(Math.random() * 6)];
    await typeCommand(run.cmd, myRun);
    await sleep(300, myRun);
    for (const l of run.out) {
      termWrite(l || "&nbsp;");
      await sleep(90 + Math.random() * 160, myRun);
    }
    if (run.cmd.startsWith("git push")) { stats.ahead = 0; stSync.innerHTML = "&#8635; 0&#8595; 0&#8593;"; }
    termWrite('<span class="t-path">PS C:\\dev\\workhard-simulator</span> <span class="t-branch">(main)</span><span class="t-prompt">&gt;</span> <span class="t-caret"></span>');
    terminalEl.scrollTop = terminalEl.scrollHeight;
  }

  // ============================================================
  //  Main session loop
  // ============================================================
  async function session(myRun) {
    // initial terminal greeting
    terminalEl.innerHTML = "";
    termWrite('<span class="t-dim">PowerShell 7.4.1 — type a command, or just look busy.</span>');
    termWrite('<span class="t-path">PS C:\\dev\\workhard-simulator</span> <span class="t-branch">(main)</span><span class="t-prompt">&gt;</span> <span class="t-caret"></span>');

    let order = 0;
    try {
      while (myRun === runId) {
        const idx = order % files.length;
        await typeFile(idx, myRun);
        await sleep(500, myRun);
        if (Math.random() < 0.7) await runTerminal(myRun);
        await sleep(700, myRun);
        order++;
      }
    } catch (e) {
      if (e !== "cancelled") console.error(e);
    }
  }

  // ============================================================
  //  Controls
  // ============================================================
  function start() {
    running = true;
    paused = false;
    runId++;
    btnToggle.innerHTML = "&#10073;&#10073; Stop working";
    btnToggle.classList.add("running");
    session(runId);
  }
  function stop() {
    running = false;
    runId++; // cancels the in-flight session
    btnToggle.innerHTML = "&#9658; Start working";
    btnToggle.classList.remove("running");
  }

  btnToggle.addEventListener("click", () => (running ? stop() : start()));

  speedEl.addEventListener("input", () => {
    speed = parseFloat(speedEl.value);
    speedVal.innerHTML = speed.toFixed(1) + "&times;";
  });

  btnFull.addEventListener("click", () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  controlsCollapse.addEventListener("click", () => controls.classList.toggle("collapsed"));

  // Boss key: hide the control panel entirely
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "b" || e.key === "B") controls.classList.toggle("hidden");
    if (e.key === " ") { e.preventDefault(); running ? stop() : start(); }
  });

  // Let tree / tab clicks jump to a file even mid-session
  function jumpTo(idx) {
    if (!running) { setActiveFile(idx); return; }
    runId++;                 // cancel current typing
    const my = runId;
    (async () => {
      try {
        await typeFile(idx, my);
        await sleep(500, my);
        // resume rolling session from the next file
        let order = idx + 1;
        while (my === runId) {
          const i = order % files.length;
          await sleep(400, my);
          if (Math.random() < 0.7) await runTerminal(my);
          await sleep(600, my);
          await typeFile(i, my);
          order++;
        }
      } catch (_) { /* cancelled */ }
    })();
  }
  fileTreeEl.addEventListener("click", (e) => {
    const li = e.target.closest("li"); if (li) jumpTo(+li.dataset.idx);
  });
  tabsEl.addEventListener("click", (e) => {
    const t = e.target.closest(".tab"); if (t) jumpTo(+t.dataset.idx);
  });

  // ---- boot ----
  buildChrome();
  setActiveFile(0);
  renderStats();
  // seed a tiny preview so the editor isn't blank before "Start"
  resetEditor();
  newLine("// Press ▶ Start working — or hit Space — to begin the grind.");
  curLineEl.classList.remove("cur");
})();
