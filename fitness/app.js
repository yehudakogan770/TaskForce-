// The Fitness page: muscle model, exercise library and demos, workout builder, live workout, history and progress.
// Saved data lives in the app's state under `fitness` (see window.TaskForce in index.html).
import { MUSCLES, CATEGORIES, EXERCISES, muscleById, exerciseById, exercisesFor, relatedMuscles } from "./data.js";

const h = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const DAY = 86400000;
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : 0; };
const fmtNum = n => (Math.round(n * 10) / 10).toLocaleString();
const fmtDate = (t, o = { month: "short", day: "numeric" }) => new Date(t).toLocaleDateString(undefined, o);
const fmtDur = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min"; };
const mmss = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const restText = s => s >= 60 ? (s % 60 ? mmss(s) : s / 60 + " min") : s + " s";
// the info line is never blank
const infoLine = e => [["Equipment", e.equipment || "None (body weight)"], ["Support", e.support || "Floor"], ["Position", e.position || "Standing"]];
// muscles the progress lists rank: surface muscles that at least one exercise in the library trains
const MAJOR = MUSCLES.filter(m => !m.deep && EXERCISES.some(e => e.primary.includes(m.id) || e.secondary.includes(m.id)));

export function mount(root, bridge) {
  const F = () => {
    const f = bridge.fitness();
    if (!Array.isArray(f.workouts)) f.workouts = [];
    if (!Array.isArray(f.history)) f.history = [];
    if (!f.draft || !Array.isArray(f.draft.items)) f.draft = { name: "", items: [], editing: null };
    if (!f.unit) f.unit = "lb";
    return f;
  };
  const save = () => bridge.save();

  const ui = { view: "explore", ex: null, muscle: null, cat: "All", q: "", list: "exercises", adding: false, addQ: "", progEx: null, openHist: null, confirm: null, deep: false };
  let anatomy = null, demo = null, demoLoading = null;

  root.innerHTML = `
  <div class="seg2 fit-tabs" role="group" aria-label="Fitness sections">
    <button type="button" data-fview="explore" aria-pressed="true">Explore</button>
    <button type="button" data-fview="workouts" aria-pressed="false">Workouts</button>
    <button type="button" data-fview="progress" aria-pressed="false">Progress</button>
  </div>
  <div class="fit-cols">
    <section class="fit-model" aria-label="Muscle model">
      <div class="fit-stage">
        <canvas id="fit-canvas" aria-label="3D muscle model. Drag to turn it, pinch or scroll to zoom, tap a muscle to see it."></canvas>
        <div class="fit-overlay" id="fit-loading"><span>Loading the 3D model…</span><i class="fit-bar"></i></div>
        <div class="fit-tag" id="fit-tag" hidden></div>
      </div>
      <div class="fit-views" role="group" aria-label="Turn the model">
        <button type="button" data-aview="front">Front</button><button type="button" data-aview="back">Back</button><button type="button" data-aview="left">Left</button><button type="button" data-aview="right">Right</button><button type="button" data-aview="reset">Reset</button>
      </div>
      <div class="fit-legend">
        <span><i class="sw p"></i>Primary</span><span><i class="sw s"></i>Secondary</span><span><i class="sw n"></i>Not involved</span>
        <label class="fit-check"><input type="checkbox" id="fit-deep"><i></i>Deep muscles</label>
      </div>
      <p class="fit-note" id="fit-model-note">Drag to turn · pinch or scroll to zoom · tap a muscle</p>
    </section>
    <div class="fit-side">
      <div data-fpanel="explore">
        <section class="fit-detail" id="fit-detail" aria-live="polite">
          <div id="fit-detail-head"></div>
          <div class="fit-demo" id="fit-demo" hidden>
            <div class="fit-demo-stage">
              <canvas id="fit-demo-canvas" aria-label="3D demonstration of the exercise. Drag to turn the camera."></canvas>
              <div class="fit-overlay" id="fit-demo-loading"><span>Loading the demonstration…</span><i class="fit-bar"></i></div>
              <i class="fit-progress" id="fit-demo-progress"></i>
            </div>
            <div class="fit-demo-ctl">
              <div class="seg2" role="group" aria-label="Playback">
                <button type="button" id="fit-play" aria-pressed="false">Pause</button>
                <button type="button" id="fit-replay">Replay</button>
                <button type="button" id="fit-slow" aria-pressed="false">Slow</button>
              </div>
              <div class="seg2" role="group" aria-label="Camera">
                <button type="button" data-dview="front" aria-pressed="false">Front</button><button type="button" data-dview="side" aria-pressed="false">Side</button><button type="button" data-dview="back" aria-pressed="false">Back</button><button type="button" data-dview="angled" aria-pressed="true">Angled</button>
              </div>
            </div>
          </div>
          <div id="fit-detail-body"></div>
        </section>
        <section class="fit-library" aria-label="Library">
          <div class="fit-lib-head">
            <h2>Library</h2>
            <div class="seg2" role="group" aria-label="Show"><button type="button" data-flist="exercises" aria-pressed="true">Exercises</button><button type="button" data-flist="muscles" aria-pressed="false">Muscles</button></div>
          </div>
          <input type="text" id="fit-search" placeholder="Search" autocomplete="off" enterkeyhint="search" aria-label="Search the library">
          <div class="fit-cats" id="fit-cats"></div>
          <ul class="fit-list" id="fit-list"></ul>
        </section>
      </div>
      <div data-fpanel="workouts" hidden>
        <section id="fit-session" hidden></section>
        <section id="fit-builder"></section>
        <section id="fit-saved"></section>
      </div>
      <div data-fpanel="progress" hidden>
        <section id="fit-dash"></section>
      </div>
      <div class="fit-toast" id="fit-toast" role="status" hidden></div>
    </div>
  </div>`;
  const $ = id => root.querySelector("#" + id);

  // ---------------------------------------------------------------- 3D model
  const isDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
  const stageBg = () => isDark() ? 0x1b1f27 : 0xeef0f3;
  let three = null;
  async function load3D() {
    const { webglAvailable, createAnatomy } = await import("./anatomy.js");
    if (!webglAvailable()) throw new Error("no-webgl");
    anatomy = await createAnatomy($("fit-canvas"), { background: stageBg(), onPick: id => {
      if (!id) return;
      showMuscle(id, true, true);
    } });
    anatomy.setDeep(ui.deep);
    three = true;
    paintModel();
  }
  function noWebGL() {
    root.querySelector(".fit-stage").innerHTML = `<div class="fit-fallback"><strong>The 3D model can't run on this device.</strong><span>Your browser has 3D graphics (WebGL) turned off or unsupported. Everything else works: browse muscles and exercises in the library below.</span></div>`;
    root.querySelector(".fit-views").hidden = true;
    root.querySelector(".fit-legend").hidden = true;
    $("fit-model-note").hidden = true;
    ui.list = "muscles"; renderLibrary();
  }
  load3D().then(() => { $("fit-loading").hidden = true; }).catch(e => { console.warn(e); three = false; noWebGL(); });

  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    anatomy?.setBackground(stageBg()); demo?.setTheme(isDark());
  });

  // what the model shows depends on the section
  function paintModel() {
    const tag = $("fit-tag");
    if (!anatomy) return;
    let p = [], s = [], sel = null, label = "";
    if (ui.view === "explore") {
      if (ui.ex) { const e = exerciseById[ui.ex]; p = e.primary; s = e.secondary; label = e.name; }
      else if (ui.muscle) { sel = ui.muscle; label = muscleById[ui.muscle].name; }
    } else if (ui.view === "workouts") {
      const items = F().active ? F().active.items : F().draft.items;
      const c = combined(items.map(i => i.ex)); p = c.primary; s = c.secondary;
      label = items.length ? (F().active ? F().active.name || "This workout" : F().draft.name || "This workout") : "";
    } else {
      const sc = muscleScores(30), ranked = Object.entries(sc).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      const cut = Math.max(1, Math.ceil(ranked.length / 3));
      p = ranked.slice(0, cut).map(([id]) => id); s = ranked.slice(cut).map(([id]) => id);
      label = ranked.length ? "Trained in the last 30 days" : "";
    }
    anatomy.highlight(p, s, sel);
    tag.hidden = !label; tag.textContent = label;
  }
  function combined(ids) {
    const p = new Set(), s = new Set();
    ids.forEach(id => { const e = exerciseById[id]; if (!e) return; e.primary.forEach(m => p.add(m)); e.secondary.forEach(m => s.add(m)); });
    return { primary: [...p], secondary: [...s].filter(m => !p.has(m)) };
  }

  root.querySelector(".fit-views").addEventListener("click", e => { const b = e.target.closest("[data-aview]"); if (b) anatomy?.setView(b.dataset.aview); });
  $("fit-deep").addEventListener("change", e => { ui.deep = e.target.checked; anatomy?.setDeep(ui.deep); });

  // ---------------------------------------------------------------- sections
  function setView(v) {
    ui.view = v;
    root.querySelectorAll("[data-fview]").forEach(b => b.setAttribute("aria-pressed", b.dataset.fview === v));
    root.querySelectorAll("[data-fpanel]").forEach(p => { p.hidden = p.dataset.fpanel !== v; });
    if (v === "workouts") renderWorkouts();
    if (v === "progress") renderProgress();
    paintModel();
  }
  root.querySelector(".fit-tabs").addEventListener("click", e => { const b = e.target.closest("[data-fview]"); if (b) setView(b.dataset.fview); });

  // scroll the page (only up and down) so an element sits at the top; scrollIntoView would also nudge the side-swiping pages
  function scrollToEl(el) {
    const page = el.closest(".page") || document.scrollingElement;
    const top = el.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop - 8;
    page.scrollTo({ top, behavior: "smooth" });
  }
  let toastT = 0;
  function toast(t) { const el = $("fit-toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600); }

  // ---------------------------------------------------------------- explore: detail
  const chip = (id, kind) => `<button type="button" class="fit-mchip ${kind}" data-muscle="${id}"><i></i>${h(muscleById[id].name)}</button>`;
  const exLink = e => `<button type="button" class="fit-exlink" data-ex="${e.id}">${h(e.name)}</button>`;
  function renderDetail() {
    const head = $("fit-detail-head"), body = $("fit-detail-body"), demoEl = $("fit-demo");
    if (ui.ex) {
      const e = exerciseById[ui.ex];
      head.innerHTML = `<div class="fit-dhead"><div><h2>${h(e.name)}</h2><div class="fit-sub">${h(e.category)} · ${h(e.difficulty)}</div></div><button type="button" class="fit-x" data-close aria-label="Close">×</button></div>
        <div class="fit-info">${infoLine(e).map(([k, v]) => `<span><b>${k}</b> ${h(v)}</span>`).join("")}</div>`;
      demoEl.hidden = false;
      startDemo(e);
      body.innerHTML = `
        <div class="fit-musc"><div><h3>Primary</h3><div class="fit-chips">${e.primary.map(m => chip(m, "p")).join("")}</div></div>
          ${e.secondary.length ? `<div><h3>Secondary</h3><div class="fit-chips">${e.secondary.map(m => chip(m, "s")).join("")}</div></div>` : ""}</div>
        <div class="fit-rec"><div><span>Sets</span><strong>${e.sets}</strong></div><div><span>Reps</span><strong>${h(e.reps)}</strong></div><div><span>Rest</span><strong>${restText(e.rest)}</strong></div></div>
        <p>${h(e.desc)}</p>
        <h3>Starting position</h3><p>${h(e.start)}</p>
        <h3>How to do it</h3><ol>${e.steps.map(s => `<li>${h(s)}</li>`).join("")}</ol>
        <h3>Posture</h3><p>${h(e.posture)}</p>
        <h3>Breathing</h3><p>${h(e.breathing)}</p>
        <h3>Common mistakes</h3><ul>${e.mistakes.map(s => `<li>${h(s)}</li>`).join("")}</ul>
        <div class="fit-actions"><button type="button" class="btn" data-add-ex="${e.id}">Add to workout</button></div>`;
    } else if (ui.muscle) {
      const m = muscleById[ui.muscle], ex = exercisesFor(m.id), rel = relatedMuscles(m.id);
      demoEl.hidden = true; demo?.pause();
      head.innerHTML = `<div class="fit-dhead"><div><h2>${h(m.name)}</h2><div class="fit-sub">${h(m.region)}${m.deep ? " · deep muscle" : ""}</div></div><button type="button" class="fit-x" data-close aria-label="Close">×</button></div>`;
      body.innerHTML = `
        <h3>Where it is</h3><p>${h(m.location)}</p>
        <h3>What it does</h3><p>${h(m.fn)}</p>
        <h3>Exercises that train it</h3>
        ${ex.primary.length ? `<div class="fit-exgroup"><span class="fit-kind p"><i></i>Main muscle</span>${ex.primary.map(exLink).join("")}</div>` : ""}
        ${ex.secondary.length ? `<div class="fit-exgroup"><span class="fit-kind s"><i></i>Helping muscle</span>${ex.secondary.map(exLink).join("")}</div>` : ""}
        ${!ex.primary.length && !ex.secondary.length ? `<p class="fit-muted">None of the exercises in the library focus on this muscle yet.</p>` : ""}
        ${rel.length ? `<h3>Works together with</h3><div class="fit-chips">${rel.map(r => chip(r, "n")).join("")}</div>` : ""}`;
    } else {
      demoEl.hidden = true; demo?.pause();
      head.innerHTML = "";
      body.innerHTML = `<p class="fit-intro">Tap a muscle on the model to see what it does and which exercises train it, or choose an exercise below to watch it and see the muscles it works.</p>`;
    }
  }
  async function startDemo(e) {
    if (three === false) { $("fit-demo").hidden = true; return; }
    if (!demo) {
      if (!demoLoading) demoLoading = import("./demo.js").then(({ createDemo }) => {
        demo = createDemo($("fit-demo-canvas"), { onFrame: f => { $("fit-demo-progress").style.width = (f * 100).toFixed(1) + "%"; } });
        demo.setTheme(isDark());
        $("fit-demo-loading").hidden = true;
      }).catch(err => { console.warn(err); $("fit-demo").hidden = true; });
      await demoLoading;
      if (!demo || ui.ex !== e.id) return;
    }
    demo.setExercise(e.demo);
    demo.setSpeed(ui.slow ? 0.35 : 1);
    demo.play();
    syncDemoButtons("angled");
  }
  function syncDemoButtons(view) {
    $("fit-play").textContent = demo && !demo.playing ? "Play" : "Pause";
    $("fit-slow").setAttribute("aria-pressed", !!ui.slow);
    if (view) root.querySelectorAll("[data-dview]").forEach(b => b.setAttribute("aria-pressed", b.dataset.dview === view));
  }
  $("fit-play").onclick = () => { if (!demo) return; demo.playing ? demo.pause() : demo.play(); syncDemoButtons(); };
  $("fit-replay").onclick = () => { demo?.replay(); syncDemoButtons(); };
  $("fit-slow").onclick = () => { ui.slow = !ui.slow; demo?.setSpeed(ui.slow ? 0.35 : 1); syncDemoButtons(); };
  root.querySelector(".fit-demo-ctl").addEventListener("click", e => { const b = e.target.closest("[data-dview]"); if (b && demo) { demo.setView(b.dataset.dview); syncDemoButtons(b.dataset.dview); } });

  // turn the model to the side where the main muscles are
  function faceMuscles(ids) {
    if (!anatomy || !ids.length) return;
    let f = 0, b = 0;
    ids.forEach(id => { const v = muscleById[id]?.view; if (v === "front") f++; else if (v === "back") b++; });
    if (f || b) anatomy.setView(b > f ? "back" : "front");
  }
  function showExercise(id, scroll) {
    ui.ex = id; ui.muscle = null;
    faceMuscles(exerciseById[id].primary);
    if (ui.view !== "explore") setView("explore");
    renderDetail(); paintModel(); renderLibrary();
    if (scroll) scrollToEl($("fit-detail"));
  }
  function showMuscle(id, scroll, fromModel) {
    ui.muscle = id; ui.ex = null;
    if (!fromModel) faceMuscles([id]);
    if (ui.view !== "explore") setView("explore");
    renderDetail(); paintModel(); renderLibrary();
    if (scroll && innerWidth < 900) scrollToEl($("fit-detail"));
  }

  // ---------------------------------------------------------------- explore: library
  function renderLibrary() {
    root.querySelectorAll("[data-flist]").forEach(b => b.setAttribute("aria-pressed", b.dataset.flist === ui.list));
    const q = ui.q.trim().toLowerCase();
    if (ui.list === "exercises") {
      $("fit-cats").innerHTML = ["All", ...CATEGORIES].map(c => `<button type="button" class="chip wide" data-cat="${h(c)}" aria-pressed="${ui.cat === c}">${h(c)}</button>`).join("");
      const list = EXERCISES.filter(e => (ui.cat === "All" || e.category === ui.cat) && (!q || [e.name, e.category, e.equipment, ...e.primary.map(m => muscleById[m].name)].join(" ").toLowerCase().includes(q)));
      $("fit-list").innerHTML = list.length ? list.map(e => `<li><button type="button" data-ex="${e.id}" aria-current="${ui.ex === e.id}"><span class="n">${h(e.name)}</span><span class="m">${h(e.category)} · ${h(e.equipment)}</span></button></li>`).join("")
        : `<li class="fit-empty">No exercises match.</li>`;
    } else {
      const regions = [...new Set(MUSCLES.map(m => m.region))];
      $("fit-cats").innerHTML = ["All", ...regions].map(c => `<button type="button" class="chip wide" data-cat="${h(c)}" aria-pressed="${ui.mcat === c || (!ui.mcat && c === "All")}">${h(c)}</button>`).join("");
      const list = MUSCLES.filter(m => (!ui.mcat || ui.mcat === "All" || m.region === ui.mcat) && (!q || (m.name + " " + m.region).toLowerCase().includes(q)));
      $("fit-list").innerHTML = list.length ? list.map(m => { const n = exercisesFor(m.id); return `<li><button type="button" data-muscle="${m.id}" aria-current="${ui.muscle === m.id}"><span class="n">${h(m.name)}</span><span class="m">${h(m.region)}${m.deep ? " · deep" : ""} · ${n.primary.length + n.secondary.length} exercises</span></button></li>`; }).join("")
        : `<li class="fit-empty">No muscles match.</li>`;
    }
  }
  $("fit-search").addEventListener("input", e => { ui.q = e.target.value; renderLibrary(); });
  $("fit-search").addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });
  root.querySelector(".fit-library").addEventListener("click", e => {
    const c = e.target.closest("[data-cat]"); if (c) { if (ui.list === "exercises") ui.cat = c.dataset.cat; else ui.mcat = c.dataset.cat; renderLibrary(); return; }
    const l = e.target.closest("[data-flist]"); if (l) { ui.list = l.dataset.flist; renderLibrary(); }
  });

  // clicks shared by every section
  root.addEventListener("click", e => {
    const t = e.target;
    const ex = t.closest("[data-ex]"); if (ex) { showExercise(ex.dataset.ex, true); return; }
    const mu = t.closest("[data-muscle]"); if (mu) { showMuscle(mu.dataset.muscle, true); return; }
    if (t.closest("[data-close]")) { ui.ex = null; ui.muscle = null; renderDetail(); paintModel(); renderLibrary(); return; }
    const add = t.closest("[data-add-ex]"); if (add) { addToDraft(add.dataset.addEx); toast("Added to your workout. Open Workouts to see it."); }
  });

  // ---------------------------------------------------------------- workouts
  function addToDraft(id) {
    const e = exerciseById[id], d = F().draft;
    d.items.push({ ex: id, sets: e.sets, reps: String(e.reps).split("-").pop(), weight: "", rest: e.rest });
    save();
    if (ui.view === "workouts") { renderBuilder(); paintModel(); }
  }
  const unit = () => F().unit;
  function renderWorkouts() { renderSession(); renderBuilder(); renderSaved(); }

  function renderBuilder() {
    const d = F().draft, el = $("fit-builder");
    if (F().active) { el.hidden = true; return; }
    el.hidden = false;
    const c = combined(d.items.map(i => i.ex));
    const q = ui.addQ.trim().toLowerCase();
    const results = ui.adding ? EXERCISES.filter(e => !q || (e.name + " " + e.category + " " + e.equipment).toLowerCase().includes(q)).slice(0, 12) : [];
    el.innerHTML = `
      <div class="fit-lib-head"><h2>${d.editing ? "Edit workout" : "Build a workout"}</h2>
        <div class="seg2" role="group" aria-label="Weight unit"><button type="button" data-unit="lb" aria-pressed="${unit() === "lb"}">lb</button><button type="button" data-unit="kg" aria-pressed="${unit() === "kg"}">kg</button></div></div>
      <input type="text" id="fit-wname" placeholder="Workout name (e.g. Push day)" value="${h(d.name)}" autocomplete="off" enterkeyhint="done" aria-label="Workout name">
      ${d.items.length ? `<ol class="fit-items">${d.items.map((it, i) => { const e = exerciseById[it.ex]; return `
        <li data-i="${i}">
          <div class="fit-item-head"><button type="button" class="fit-exlink" data-ex="${it.ex}">${h(e.name)}</button>
            <div class="fit-move"><button type="button" data-up="${i}" aria-label="Move up" ${i ? "" : "disabled"}>↑</button><button type="button" data-down="${i}" aria-label="Move down" ${i < d.items.length - 1 ? "" : "disabled"}>↓</button><button type="button" data-rm="${i}" aria-label="Remove">×</button></div></div>
          <div class="fit-nums">
            <label>Sets<input type="number" inputmode="numeric" min="1" max="20" data-f="sets" value="${h(it.sets)}"></label>
            <label>Reps<input type="text" inputmode="numeric" data-f="reps" value="${h(it.reps)}"></label>
            <label>Weight (${unit()})<input type="number" inputmode="decimal" min="0" step="any" data-f="weight" value="${h(it.weight)}" placeholder="—"></label>
            <label>Rest (s)<input type="number" inputmode="numeric" min="0" step="5" data-f="rest" value="${h(it.rest)}"></label>
          </div></li>`; }).join("")}</ol>` : `<p class="fit-muted">No exercises yet. Add some below, or tap “Add to workout” on any exercise in Explore.</p>`}
      ${ui.adding ? `<div class="fit-adder">
          <input type="text" id="fit-addq" placeholder="Find an exercise" value="${h(ui.addQ)}" autocomplete="off" enterkeyhint="search" aria-label="Find an exercise">
          <ul class="fit-list compact">${results.map(e => `<li><button type="button" data-pick="${e.id}"><span class="n">${h(e.name)}</span><span class="m">${h(e.category)} · ${h(e.equipment)}</span></button></li>`).join("") || `<li class="fit-empty">No exercises match.</li>`}</ul>
          <button type="button" class="btn ghost" data-adding="0">Done adding</button></div>`
        : `<button type="button" class="btn ghost fit-addbtn" data-adding="1">+ Add exercise</button>`}
      ${d.items.length ? `<div class="fit-works"><h3>Muscles this workout trains</h3><div class="fit-chips">${c.primary.map(m => chip(m, "p")).join("")}${c.secondary.map(m => chip(m, "s")).join("")}</div>
        <p class="fit-muted">About ${estMinutes(d.items)} min · shown on the model</p></div>` : ""}
      <div class="fit-actions">
        <button type="button" class="btn" data-wsave ${d.items.length ? "" : "disabled"}>${d.editing ? "Save changes" : "Save workout"}</button>
        <button type="button" class="btn ghost" data-wstart ${d.items.length ? "" : "disabled"}>Start now</button>
        ${d.items.length || d.name || d.editing ? `<button type="button" class="btn ghost" data-wclear>${d.editing ? "Cancel edit" : "Clear"}</button>` : ""}
      </div>`;
    if (ui.adding && ui.focusAdd) { ui.focusAdd = false; const i = $("fit-addq"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }
  const estMinutes = items => Math.max(5, Math.round(items.reduce((t, i) => t + (num(i.sets) || 1) * (40 + num(i.rest)), 0) / 60));

  function renderSaved() {
    const el = $("fit-saved"), ws = F().workouts;
    el.innerHTML = `<h2>Saved workouts</h2>` + (ws.length ? `<ul class="fit-saved">${ws.map(w => {
      const last = F().history.find(x => x.workoutId === w.id);
      return `<li><div class="fit-sw-main"><strong>${h(w.name)}</strong><span>${w.items.length} exercise${w.items.length === 1 ? "" : "s"} · about ${estMinutes(w.items)} min${last ? " · last done " + fmtDate(last.start) : ""}</span>
        <span class="fit-sw-ex">${w.items.map(i => h(exerciseById[i.ex]?.name)).join(", ")}</span></div>
        <div class="fit-sw-btns"><button type="button" class="btn" data-wgo="${w.id}" ${F().active ? "disabled" : ""}>Start</button><button type="button" class="btn ghost" data-wedit="${w.id}" ${F().active ? "disabled" : ""}>Edit</button><button type="button" class="btn ghost" data-wdel="${w.id}">${ui.confirm === "w" + w.id ? "Delete?" : "Delete"}</button></div></li>`;
    }).join("")}</ul>` : `<p class="fit-muted">Workouts you save show up here so you can reuse them.</p>`);
  }

  const panelW = root.querySelector('[data-fpanel="workouts"]');
  panelW.addEventListener("input", e => {
    const t = e.target, d = F().draft;
    if (t.id === "fit-wname") { d.name = t.value; save(); return; }
    if (t.id === "fit-addq") { ui.addQ = t.value; ui.focusAdd = true; renderBuilder(); return; }
    const li = t.closest("[data-i]");
    if (li && t.dataset.f) { d.items[+li.dataset.i][t.dataset.f] = t.dataset.f === "reps" ? t.value : t.value === "" ? "" : num(t.value); save(); if (t.dataset.f === "sets" || t.dataset.f === "rest") { const p = root.querySelector(".fit-works .fit-muted"); if (p) p.textContent = `About ${estMinutes(d.items)} min · shown on the model`; } return; }
    // live workout entries
    const row = t.closest("[data-set]");
    if (row && t.dataset.sf) { const [i, j] = row.dataset.set.split(":").map(Number); F().active.items[i].sets[j][t.dataset.sf] = t.value; save(); }
  });
  panelW.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input")) e.target.blur(); });
  panelW.addEventListener("click", e => {
    const t = e.target, d = F().draft, b = s => t.closest(s);
    let x;
    if ((x = b("[data-unit]"))) { F().unit = x.dataset.unit; save(); renderWorkouts(); return; }
    if ((x = b("[data-adding]"))) { ui.adding = x.dataset.adding === "1"; ui.addQ = ""; ui.focusAdd = ui.adding && matchMedia("(pointer: fine)").matches; renderBuilder(); return; }
    if ((x = b("[data-pick]"))) { addToDraft(x.dataset.pick); document.activeElement?.blur(); toast(exerciseById[x.dataset.pick].name + " added."); return; }
    if ((x = b("[data-up]"))) { const i = +x.dataset.up; [d.items[i - 1], d.items[i]] = [d.items[i], d.items[i - 1]]; save(); renderBuilder(); return; }
    if ((x = b("[data-down]"))) { const i = +x.dataset.down; [d.items[i + 1], d.items[i]] = [d.items[i], d.items[i + 1]]; save(); renderBuilder(); return; }
    if ((x = b("[data-rm]"))) { d.items.splice(+x.dataset.rm, 1); save(); renderBuilder(); paintModel(); return; }
    if (b("[data-wsave]")) {
      if (!d.items.length) return;
      const name = d.name.trim() || "Workout " + (F().workouts.length + 1);
      const items = d.items.map(i => ({ ...i }));
      if (d.editing) { const w = F().workouts.find(w => w.id === d.editing); if (w) Object.assign(w, { name, items, updated: Date.now() }); }
      else F().workouts.unshift({ id: uid(), name, items, created: Date.now() });
      F().draft = { name: "", items: [], editing: null }; ui.adding = false;
      save(); renderWorkouts(); paintModel(); toast("Saved “" + name + "”."); return;
    }
    if (b("[data-wstart]")) { startSession({ id: d.editing, name: d.name.trim() || "Workout", items: d.items }); return; }
    if (b("[data-wclear]")) { F().draft = { name: "", items: [], editing: null }; ui.adding = false; save(); renderBuilder(); paintModel(); return; }
    if ((x = b("[data-wgo]"))) { const w = F().workouts.find(w => w.id === x.dataset.wgo); if (w) startSession(w); return; }
    if ((x = b("[data-wedit]"))) { const w = F().workouts.find(w => w.id === x.dataset.wedit); if (w) { F().draft = { name: w.name, items: w.items.map(i => ({ ...i })), editing: w.id }; save(); renderBuilder(); paintModel(); scrollToEl($("fit-builder")); } return; }
    if ((x = b("[data-wdel]"))) {
      const id = x.dataset.wdel;
      if (ui.confirm !== "w" + id) { ui.confirm = "w" + id; renderSaved(); setTimeout(() => { if (ui.confirm === "w" + id) { ui.confirm = null; renderSaved(); } }, 3000); return; }
      ui.confirm = null; F().workouts = F().workouts.filter(w => w.id !== id); if (F().draft.editing === id) F().draft.editing = null; save(); renderWorkouts(); return;
    }
    // live workout
    if ((x = b("[data-done]"))) {
      const [i, j] = x.dataset.done.split(":").map(Number), a = F().active, s = a.items[i].sets[j];
      s.done = !s.done;
      if (s.done) { if (!s.r) s.r = String(a.items[i].reps || ""); a.restEnd = Date.now() + num(a.items[i].rest) * 1000; a.restFor = exerciseById[a.items[i].ex].name; }
      save(); renderSession(); return;
    }
    if ((x = b("[data-addset]"))) { const it = F().active.items[+x.dataset.addset], l = it.sets[it.sets.length - 1] || {}; it.sets.push({ w: l.w || "", r: l.r || "", done: false }); save(); renderSession(); return; }
    if (b("[data-skiprest]")) { F().active.restEnd = 0; save(); tick(); return; }
    if (b("[data-finish]")) { finishSession(); return; }
    if (b("[data-cancel]")) {
      if (ui.confirm !== "cancel") { ui.confirm = "cancel"; renderSession(); setTimeout(() => { if (ui.confirm === "cancel") { ui.confirm = null; renderSession(); } }, 3000); return; }
      ui.confirm = null; delete F().active; save(); renderWorkouts(); paintModel(); return;
    }
  });

  // ---------------------------------------------------------------- live workout
  function startSession(w) {
    if (!w.items.length) return;
    F().active = { id: uid(), workoutId: w.id || null, name: w.name, start: Date.now(), restEnd: 0,
      items: w.items.map(i => ({ ex: i.ex, reps: i.reps, rest: num(i.rest) || 60, sets: Array.from({ length: Math.max(1, num(i.sets) || 1) }, () => ({ w: i.weight === "" || i.weight == null ? "" : String(i.weight), r: "", done: false })) })) };
    save();
    if (ui.view !== "workouts") setView("workouts"); else { renderWorkouts(); paintModel(); }
    scrollToEl($("fit-session"));
  }
  function renderSession() {
    const a = F().active, el = $("fit-session");
    if (!a) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    const best = personalRecords();
    el.innerHTML = `
      <div class="fit-sess-head"><div><h2>${h(a.name)}</h2><div class="fit-sub">Started ${new Date(a.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · <span id="fit-elapsed">${fmtDur(Date.now() - a.start)}</span></div></div>
        <div class="fit-rest" id="fit-rest" hidden></div></div>
      <ol class="fit-sess">${a.items.map((it, i) => { const e = exerciseById[it.ex], pr = best[it.ex]; return `<li>
        <div class="fit-item-head"><button type="button" class="fit-exlink" data-ex="${it.ex}">${h(e.name)}</button><span class="fit-muted">${h(it.reps)} reps · rest ${restText(it.rest)}${pr && pr.w ? ` · best ${fmtNum(pr.w)} ${unit()} × ${pr.r}` : ""}</span></div>
        <div class="fit-sets">${it.sets.map((s, j) => `<div class="fit-set${s.done ? " done" : ""}" data-set="${i}:${j}">
          <span class="fit-setn">${j + 1}</span>
          <label><input type="number" inputmode="decimal" min="0" step="any" data-sf="w" value="${h(s.w)}" placeholder="0" aria-label="Weight for set ${j + 1}"><span>${unit()}</span></label>
          <label><input type="number" inputmode="numeric" min="0" data-sf="r" value="${h(s.r)}" placeholder="${h(String(it.reps).split("-").pop())}" aria-label="Reps for set ${j + 1}"><span>reps</span></label>
          <button type="button" class="fit-tick" data-done="${i}:${j}" aria-pressed="${!!s.done}" aria-label="Set ${j + 1} done"></button></div>`).join("")}
          <button type="button" class="fit-addset" data-addset="${i}">+ Set</button></div></li>`; }).join("")}</ol>
      <div class="fit-actions"><button type="button" class="btn" data-finish>Finish workout</button><button type="button" class="btn ghost" data-cancel>${ui.confirm === "cancel" ? "Discard workout?" : "Cancel"}</button></div>`;
    tick();
  }
  function tick() {
    const a = F().active; if (!a || ui.view !== "workouts") return;
    const el = $("fit-elapsed"); if (el) el.textContent = fmtDur(Date.now() - a.start);
    const r = $("fit-rest"); if (!r) return;
    const left = Math.ceil((a.restEnd - Date.now()) / 1000);
    if (left > 0) { r.hidden = false; r.innerHTML = `<span>Rest</span><strong>${mmss(left)}</strong><button type="button" data-skiprest>Skip</button>`; }
    else if (a.restEnd && left > -4) { r.hidden = false; r.innerHTML = `<span>Rest done</span><strong>Go</strong>`; if (!a.buzzed) { a.buzzed = true; navigator.vibrate?.(200); } }
    else { r.hidden = true; if (a.restEnd) { a.restEnd = 0; a.buzzed = false; } }
    if (left > 0) a.buzzed = false;
  }
  setInterval(tick, 1000);

  function finishSession() {
    const a = F().active;
    const items = a.items.map(it => ({ ex: it.ex, sets: it.sets.filter(s => s.done).map(s => ({ w: num(s.w), r: num(s.r) || num(String(it.reps).split("-").pop()) })) })).filter(it => it.sets.length);
    if (!items.length) { toast("Tick off at least one set first, or Cancel to discard it."); return; }
    const before = personalRecords();
    const entry = { id: uid(), workoutId: a.workoutId, name: a.name, start: a.start, end: Date.now(), unit: unit(), items };
    F().history.unshift(entry); delete F().active;
    save();
    const after = personalRecords();
    const newPR = items.map(i => i.ex).filter(id => after[id] && (!before[id] || after[id].score > before[id].score));
    renderWorkouts(); paintModel();
    toast("Workout saved." + (newPR.length ? " New record: " + newPR.map(id => exerciseById[id].name).join(", ") + "!" : ""));
  }

  // ---------------------------------------------------------------- history and progress
  const sessionSets = s => s.items.reduce((t, i) => t + i.sets.length, 0);
  const sessionVolume = s => s.items.reduce((t, i) => t + i.sets.reduce((u, x) => u + x.w * x.r, 0), 0);
  function personalRecords() {
    const best = {};
    for (const s of F().history) for (const it of s.items) for (const x of it.sets) {
      // weight first, then reps; body-weight moves count reps
      const score = x.w > 0 ? x.w * 1000 + x.r : x.r;
      if (!best[it.ex] || score > best[it.ex].score) best[it.ex] = { w: x.w, r: x.r, score, date: s.start, unit: s.unit || unit() };
    }
    return best;
  }
  function muscleScores(days) {
    const since = Date.now() - days * DAY, sc = {};
    for (const s of F().history) {
      if (s.start < since) continue;
      for (const it of s.items) {
        const e = exerciseById[it.ex]; if (!e) continue;
        e.primary.forEach(m => { sc[m] = (sc[m] || 0) + it.sets.length; });
        e.secondary.forEach(m => { sc[m] = (sc[m] || 0) + it.sets.length * 0.5; });
      }
    }
    return sc;
  }
  const startOfWeek = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d.getTime(); };

  function weekChart() {
    const weeks = 8, now = startOfWeek(Date.now()), data = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const ws = now - i * 7 * DAY, we = ws + 7 * DAY;  // (daylight-saving shifts of an hour don't change which week a workout falls in)
      const ss = F().history.filter(s => s.start >= ws - 3600000 && s.start < we - 3600000);
      data.push({ ws, n: ss.length, sets: ss.reduce((t, s) => t + sessionSets(s), 0) });
    }
    const max = Math.max(1, ...data.map(d => d.sets)), W = 320, H = 130, bw = W / weeks;
    return `<svg viewBox="0 0 ${W} ${H + 18}" class="fit-chart" role="img" aria-label="Sets per week for the last 8 weeks">
      ${data.map((d, i) => { const bh = d.sets / max * (H - 18); return `<rect x="${i * bw + 6}" y="${H - bh}" width="${bw - 12}" height="${Math.max(bh, d.sets ? 2 : 0)}" class="bar"></rect>
        ${d.sets ? `<text x="${i * bw + bw / 2}" y="${H - bh - 5}" class="val">${d.sets}</text>` : ""}
        <text x="${i * bw + bw / 2}" y="${H + 14}" class="lab">${fmtDate(d.ws, { month: "numeric", day: "numeric" })}</text>`; }).join("")}
      <line x1="0" x2="${W}" y1="${H}" y2="${H}" class="axis"></line></svg>`;
  }
  function exerciseChart(id) {
    const pts = F().history.filter(s => s.items.some(i => i.ex === id)).map(s => {
      const sets = s.items.filter(i => i.ex === id).flatMap(i => i.sets);
      const w = Math.max(...sets.map(x => x.w)), r = Math.max(...sets.map(x => x.r));
      return { t: s.start, v: w > 0 ? w : r };
    }).reverse().slice(-12);
    const usesW = F().history.some(s => s.items.some(i => i.ex === id && i.sets.some(x => x.w > 0)));
    if (pts.length < 2) return `<p class="fit-muted">Do this exercise in two or more workouts to see a trend.</p>`;
    const W = 320, H = 120, lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v)), span = hi - lo || 1;
    const xy = pts.map((p, i) => [16 + i * (W - 32) / (pts.length - 1), 12 + (1 - (p.v - lo) / span) * (H - 30)]);
    return `<svg viewBox="0 0 ${W} ${H + 16}" class="fit-chart" role="img" aria-label="Best ${usesW ? "weight" : "reps"} per workout">
      <polyline points="${xy.map(p => p.join(",")).join(" ")}" class="line"></polyline>
      ${xy.map((p, i) => `<rect x="${p[0] - 3.5}" y="${p[1] - 3.5}" width="7" height="7" class="dot"></rect>${i === 0 || i === xy.length - 1 || pts[i].v === hi ? `<text x="${p[0]}" y="${p[1] - 8}" class="val">${fmtNum(pts[i].v)}</text>` : ""}`).join("")}
      <text x="16" y="${H + 12}" class="lab" text-anchor="start">${fmtDate(pts[0].t)}</text><text x="${W - 16}" y="${H + 12}" class="lab" text-anchor="end">${fmtDate(pts[pts.length - 1].t)}</text></svg>
      <p class="fit-muted">Best ${usesW ? "weight (" + unit() + ")" : "reps"} in each workout.</p>`;
  }

  function renderProgress() {
    const hist = F().history, el = $("fit-dash");
    const now = Date.now(), wk = startOfWeek(now);
    const n30 = hist.filter(s => s.start >= now - 30 * DAY), sets30 = n30.reduce((t, s) => t + sessionSets(s), 0);
    const sc = muscleScores(30);
    const ranked = MAJOR.map(m => [m.id, sc[m.id] || 0]).sort((a, b) => b[1] - a[1] || muscleById[a[0]].name.localeCompare(muscleById[b[0]].name));
    const most = ranked.filter(r => r[1] > 0).slice(0, 5), least = ranked.slice().reverse().slice(0, 5).sort((a, b) => a[1] - b[1]);
    const prs = Object.entries(personalRecords()).filter(([id]) => exerciseById[id]).sort((a, b) => b[1].date - a[1].date);
    const done = [...new Set(hist.flatMap(s => s.items.map(i => i.ex)))].filter(id => exerciseById[id]);
    if (!ui.progEx || !done.includes(ui.progEx)) ui.progEx = done[0] || null;
    const bar = (v, max) => `<i class="fit-meter"><b style="width:${Math.round(v / Math.max(1, max) * 100)}%"></b></i>`;
    el.innerHTML = `
      <div class="fit-stats">
        <div><span>Workouts</span><strong>${hist.length}</strong></div>
        <div><span>This week</span><strong>${hist.filter(s => s.start >= wk).length}</strong></div>
        <div><span>Sets, 30 days</span><strong>${sets30}</strong></div>
      </div>
      ${hist.length ? `
      <h2>Sets per week</h2>${weekChart()}
      <div class="fit-two">
        <div><h2>Most trained</h2><ul class="fit-rank">${most.map(([id, v]) => `<li><button type="button" class="fit-exlink" data-muscle="${id}">${h(muscleById[id].name)}</button>${bar(v, most[0][1])}<span>${fmtNum(v)}</span></li>`).join("")}</ul></div>
        <div><h2>Least trained</h2><ul class="fit-rank">${least.map(([id, v]) => `<li><button type="button" class="fit-exlink" data-muscle="${id}">${h(muscleById[id].name)}</button>${bar(v, most[0]?.[1] || 1)}<span>${fmtNum(v)}</span></li>`).join("")}</ul></div>
      </div>
      <p class="fit-muted">Last 30 days, counted in sets (a helping muscle counts half). The model shows the same: bright green for the muscles you trained most, soft green for the rest.</p>
      <h2>Progress</h2>
      <div class="fit-chips">${done.map(id => `<button type="button" class="chip wide" data-progex="${id}" aria-pressed="${ui.progEx === id}">${h(exerciseById[id].name)}</button>`).join("")}</div>
      ${ui.progEx ? exerciseChart(ui.progEx) : ""}
      <h2>Personal records</h2>
      <ul class="fit-prs">${prs.map(([id, p]) => `<li><button type="button" class="fit-exlink" data-ex="${id}">${h(exerciseById[id].name)}</button><strong>${p.w > 0 ? fmtNum(p.w) + " " + p.unit + " × " + p.r : p.r + " reps"}</strong><span>${fmtDate(p.date)}</span></li>`).join("")}</ul>
      <h2>History</h2>
      <ul class="fit-hist">${hist.map(s => `<li>
        <button type="button" class="fit-hrow" data-hist="${s.id}" aria-expanded="${ui.openHist === s.id}"><span class="d">${fmtDate(s.start, { weekday: "short", month: "short", day: "numeric" })}</span><span class="n">${h(s.name)}</span><span class="m">${sessionSets(s)} sets · ${fmtDur(s.end - s.start)}${sessionVolume(s) ? " · " + fmtNum(sessionVolume(s)) + " " + (s.unit || unit()) : ""}</span></button>
        ${ui.openHist === s.id ? `<div class="fit-hdetail">${s.items.map(i => `<div><button type="button" class="fit-exlink" data-ex="${i.ex}">${h(exerciseById[i.ex]?.name || i.ex)}</button><span>${i.sets.map(x => x.w > 0 ? fmtNum(x.w) + "×" + x.r : x.r + " reps").join(", ")}</span></div>`).join("")}
          <button type="button" class="btn ghost" data-hdel="${s.id}">${ui.confirm === "h" + s.id ? "Delete?" : "Delete"}</button></div>` : ""}</li>`).join("")}</ul>`
      : `<p class="fit-muted">Finish a workout in Workouts and your history, records and progress will show up here.</p>`}`;
  }
  root.querySelector('[data-fpanel="progress"]').addEventListener("click", e => {
    let x;
    if ((x = e.target.closest("[data-progex]"))) { ui.progEx = x.dataset.progex; renderProgress(); return; }
    if ((x = e.target.closest("[data-hist]"))) { ui.openHist = ui.openHist === x.dataset.hist ? null : x.dataset.hist; renderProgress(); return; }
    if ((x = e.target.closest("[data-hdel]"))) {
      const id = x.dataset.hdel;
      if (ui.confirm !== "h" + id) { ui.confirm = "h" + id; renderProgress(); setTimeout(() => { if (ui.confirm === "h" + id) { ui.confirm = null; renderProgress(); } }, 3000); return; }
      ui.confirm = null; F().history = F().history.filter(s => s.id !== id); save(); renderProgress(); paintModel();
    }
  });

  // ---------------------------------------------------------------- start
  renderDetail(); renderLibrary();
  if (F().active) setView("workouts");
  return {
    // the whole app state was replaced (restore from a backup, or loaded from the account)
    refresh() { ui.confirm = null; if (ui.view === "workouts") renderWorkouts(); if (ui.view === "progress") renderProgress(); paintModel(); },
    _ui: ui,
  };
}
