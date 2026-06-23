/* Shared simulator runtime.
   Owns the cancellable/pausable/speed-aware clock, the run-id token, the
   control overlay wiring, and a registry of swappable scenarios.

   A scenario is: register(id, { label, root, run(myRun), reset() }).
   - root  : the DOM container shown only while this scenario is active.
   - run   : async loop driving the animation; MUST await Sim.sleep(ms, myRun)
             so pause / speed / cancel keep working. Rejects with "cancelled"
             once myRun !== Sim.runId.
   - reset : restore the scene to its idle (not-running) look.                */
window.Sim = (function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const state = { running: false, paused: false, runId: 0, speed: 1.3, active: null };
  const scenarios = {};
  const order = [];

  // The one place that honors pause + speed + cancellation.
  function sleep(ms, myRun) {
    return new Promise((resolve, reject) => {
      let remaining = ms / state.speed;
      const tick = () => {
        if (myRun !== state.runId) return reject("cancelled");
        if (state.paused) return void setTimeout(tick, 80);
        const step = Math.min(remaining, 40);
        remaining -= step;
        if (remaining <= 0) resolve();
        else setTimeout(tick, step);
      };
      tick();
    });
  }

  function register(id, scn) { scenarios[id] = scn; order.push(id); }
  function bumpRun() { return ++state.runId; }

  function updateBtn() {
    const b = $("btnToggle");
    if (state.running) {
      b.innerHTML = "&#10073;&#10073; Stop working";
      b.classList.add("running");
    } else {
      b.innerHTML = "&#9658; Start working";
      b.classList.remove("running");
    }
  }

  function start() {
    if (!state.active) return;
    state.running = true;
    state.paused = false;
    const my = bumpRun();
    updateBtn();
    Promise.resolve(scenarios[state.active].run(my)).catch((e) => {
      if (e !== "cancelled") console.error(e);
    });
  }

  function stop() {
    state.running = false;
    bumpRun();                       // cancels the in-flight run()
    updateBtn();
    const scn = scenarios[state.active];
    if (scn && scn.reset) scn.reset();
  }

  function toggle() { state.running ? stop() : start(); }

  function setActive(id) {
    if (!scenarios[id]) return;
    if (state.running) stop();
    state.active = id;
    for (const k of order) scenarios[k].root.classList.toggle("scene-hidden", k !== id);
    document.body.classList.toggle("mode-claude", id === "claude");
    document.body.classList.toggle("mode-vscode", id === "vscode");
    document.body.classList.toggle("mode-osupdate", id === "osupdate");
    document.querySelectorAll(".opt-vscode").forEach((el) => {
      el.style.display = id === "vscode" ? "" : "none";
    });
    document.querySelectorAll(".opt-osupdate").forEach((el) => {
      el.style.display = id === "osupdate" ? "" : "none";
    });
    document.querySelectorAll(".scn-opt").forEach((b) =>
      b.classList.toggle("active", b.dataset.scn === id));
    const scn = scenarios[id];
    if (scn.reset) scn.reset();
  }

  function boot(defaultId) {
    const speedEl = $("speed"), speedVal = $("speedVal");
    state.speed = parseFloat(speedEl.value);
    speedVal.innerHTML = state.speed.toFixed(1) + "&times;";
    speedEl.addEventListener("input", () => {
      state.speed = parseFloat(speedEl.value);
      speedVal.innerHTML = state.speed.toFixed(1) + "&times;";
    });

    $("btnToggle").addEventListener("click", toggle);
    $("btnFull").addEventListener("click", () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });
    $("controlsCollapse").addEventListener("click", () =>
      $("controls").classList.toggle("collapsed"));
    document.querySelectorAll(".scn-opt").forEach((b) =>
      b.addEventListener("click", () => setActive(b.dataset.scn)));

    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "b" || e.key === "B") $("controls").classList.toggle("hidden");
      if (e.key === " ") { e.preventDefault(); toggle(); }
    });

    setActive(defaultId);
  }

  return {
    state, sleep, register, bumpRun, start, stop, toggle, setActive, boot,
    get runId() { return state.runId; },
  };
})();
