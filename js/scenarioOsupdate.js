/* Scenario: OS Update — a believable full-screen "installing updates" screen.
   Toggle between a Windows style (blue background, dot throbber, "已完成 NN%")
   and a macOS style (black background, Apple logo, thin progress bar). Drives a
   percentage that crawls, stalls, finishes, then "restarts" and loops with a new
   version. Registers itself with the Sim core.                                */
(function () {
  "use strict";

  const sleep = (ms, my) => Sim.sleep(ms, my);
  const stage = document.getElementById("osuStage");

  let os = "windows"; // "windows" | "macos"

  // DOM refs filled in by render()
  let refHeading, refPct, refSub, refMeta;   // Windows
  let refBarFill, refRemain;                 // macOS

  const VERSIONS = {
    windows: [
      "Windows 11 23H2 · 累積更新 KB5037771",
      "功能更新到 Windows 11 版本 24H2",
      ".NET Framework 累積更新 KB5039895",
      "惡意軟體移除工具 x64 KB890830",
    ],
    macos: [
      "macOS Sequoia 15.5",
      "macOS Sequoia 15.6",
      "安全性回應 15.5 (a)",
    ],
  };

  // ============================================================
  //  DOM helpers
  // ============================================================
  function el(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }

  function winSpinner() {
    // Classic Windows dot throbber: a ring of dots with a fading comet tail,
    // the whole ring rotating via CSS.
    const wrap = el("div", "osu-spinner");
    const N = 10;
    for (let k = 0; k < N; k++) {
      const dot = el("i");
      dot.style.transform = `rotate(${k * (360 / N)}deg) translateY(-26px)`;
      dot.style.opacity = (0.1 + 0.9 * (k / (N - 1))).toFixed(2);
      wrap.appendChild(dot);
    }
    return wrap;
  }

  function appleLogo() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "osu-apple");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d",
      "M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z");
    svg.appendChild(path);
    return svg;
  }

  // ============================================================
  //  Render the chosen screen
  // ============================================================
  function render() {
    stage.innerHTML = "";
    if (os === "windows") {
      stage.className = "osu-stage osu-win";
      stage.appendChild(winSpinner());
      refHeading = el("div", "osu-heading", "正在處理更新");
      refPct = el("div", "osu-pct", "已完成 0%");
      refSub = el("div", "osu-sub", "請勿關閉電腦。您的電腦將重新啟動數次。");
      refMeta = el("div", "osu-meta", "");
      stage.append(refHeading, refPct, refSub, refMeta);
    } else {
      stage.className = "osu-stage osu-mac";
      stage.appendChild(appleLogo());
      const bar = el("div", "osu-bar");
      refBarFill = el("i");
      bar.appendChild(refBarFill);
      refRemain = el("div", "osu-remain", "正在準備安裝…");
      stage.append(bar, refRemain);
    }
  }

  // ============================================================
  //  Progress model — crawl, stall at the usual sticky zones, finish.
  // ============================================================
  function nextPct(pct) {
    if (pct >= 98) return pct + 0.2 + Math.random() * 0.7;          // crawl at the end
    if (pct >= 70 && pct < 75) return pct + 0.15 + Math.random() * 0.6; // stall ~72%
    if (pct >= 28 && pct < 33) return pct + 0.15 + Math.random() * 0.5; // stall ~30%
    return pct + 0.8 + Math.random() * 3.2;
  }
  function stallMs(pct) {
    if (pct >= 98) return 700 + Math.random() * 900;
    if ((pct >= 28 && pct < 33) || (pct >= 70 && pct < 75)) return 500 + Math.random() * 700;
    return 180 + Math.random() * 320;
  }

  function winStage(pct) {
    if (pct < 25) return "正在下載更新";
    if (pct < 70) return "正在安裝更新";
    if (pct < 96) return "正在設定更新";
    if (pct < 100) return "即將完成，請稍候";
    return "即將完成";
  }
  function macRemain(pct) {
    if (pct >= 100) return "即將完成…";
    const mins = Math.max(1, Math.round((100 - pct) / 100 * 18));
    return `估計剩餘時間：約 ${mins} 分鐘`;
  }

  function setMeta(ver) {
    if (os === "windows") refMeta.textContent = ver;
    else refRemain.textContent = "正在準備安裝…";
  }
  function setProgress(pct) {
    if (os === "windows") {
      refHeading.textContent = winStage(pct);
      refPct.textContent = `已完成 ${Math.floor(pct)}%`;
    } else {
      refBarFill.style.width = pct + "%";
      refRemain.textContent = macRemain(pct);
    }
  }

  // ============================================================
  //  Run loop + idle reset
  // ============================================================
  async function installOnce(my, v) {
    setMeta(VERSIONS[os][v % VERSIONS[os].length]);
    setProgress(0);
    let pct = 0;
    while (pct < 100 && my === Sim.runId) {
      pct = Math.min(100, nextPct(pct));
      setProgress(pct);
      await sleep(stallMs(pct), my);
    }
    setProgress(100);
    await sleep(1600, my);
  }

  async function reboot(my) {
    if (os === "windows") {
      refHeading.textContent = "正在重新啟動";
      refPct.textContent = "";
      refSub.textContent = "請勿關閉電腦。";
      refMeta.textContent = "";
    } else {
      refRemain.textContent = "正在重新啟動…";
    }
    await sleep(2100, my);
    stage.className = "osu-stage osu-black"; // brief black screen, like a real reboot
    stage.innerHTML = "";
    await sleep(1500, my);
  }

  async function run(my) {
    let v = 0;
    while (my === Sim.runId) {
      render();
      await installOnce(my, v);
      await reboot(my);
      v++;
    }
  }

  function reset() {
    render();
    if (os === "windows") {
      refMeta.textContent = "▶ 按 Start working（或空白鍵）開始模擬";
    } else {
      refRemain.textContent = "▶ 按 Start working（或空白鍵）開始模擬";
    }
  }

  // ============================================================
  //  OS switch (Windows / macOS) — sub-control in the overlay
  // ============================================================
  document.querySelectorAll(".os-opt").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.os === os) return;
      os = b.dataset.os;
      document.querySelectorAll(".os-opt").forEach((x) =>
        x.classList.toggle("active", x.dataset.os === os));
      if (Sim.state.active !== "osupdate") return;
      if (Sim.state.running) { Sim.stop(); Sim.start(); } // restart with the new OS
      else reset();
    }));

  Sim.register("osupdate", {
    label: "OS Update",
    root: document.getElementById("scene-osupdate"),
    run,
    reset,
  });
})();
