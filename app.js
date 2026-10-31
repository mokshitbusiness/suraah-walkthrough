/* Suraah meeting page: hand-drawn rendering, evidence, decisions, autosave. */
(() => {
  const E = window.EVIDENCE;
  const C = { blue: "#2254C5", ink: "#0F1015", lime: "#C9DC3C", sky: "#E6EEFC", hill: "#6FA86A", hill2: "#A9CF8F", paper: "#FBFAF3", rose: "#F2A39A" };
  const SVGNS = "http://www.w3.org/2000/svg";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let seedN = 7;
  const seed = (el) => { if (!el.dataset.seed) el.dataset.seed = String(++seedN * 37 % 997 + 1); return +el.dataset.seed; };

  // ------------------------------------------------------------------ state
  // share mode (set by tools/build_share.py): a read-only copy for Suraah's team, nothing is saved
  const SHARE = document.documentElement.dataset.mode === "share";
  const KEY = "suraah-meeting-2026-10-31-shrey";
  let state = { answers: {}, notes: {} };
  let server = false, timer = null;
  const statusEl = $("#saved"), statusText = $("#savedText");

  function setStatus(text, ok) { statusText.textContent = text; statusEl.classList.toggle("offline", !ok); }
  function persistLocal() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private window */ } }
  function save() {
    if (SHARE) { renderSummary(); return; }
    state._clientSavedAt = new Date().toISOString();
    persistLocal();
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!server) { setStatus("saved in this browser only — start meeting/server.py", false); return; }
      try {
        const r = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) });
        const j = await r.json();
        setStatus("saved to repo ✓ " + (j.savedAt || "").slice(11), true);
      } catch (e) { server = false; setStatus("server lost — saved in browser", false); }
    }, 350);
    renderSummary();
  }
  async function load() {
    if (SHARE) return;
    let local = null;
    try { local = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { local = null; }
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      // with the server up, its file is the source of truth (an emptied file means a fresh start)
      if (r.ok) { server = true; const s = await r.json(); state = s && s.answers ? s : { answers: {}, notes: {} }; persistLocal(); }
    } catch (e) { server = false; if (local) state = local; }
    state.answers = state.answers || {}; state.notes = state.notes || {};
    setStatus(server ? "autosave on ✓ saving to repo" : "browser-only save — start meeting/server.py", server);
  }

  // ------------------------------------------------------------------ rough helpers
  function sizeSvg(svg, w, h) { svg.setAttribute("width", w); svg.setAttribute("height", h); svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.innerHTML = ""; return rough.svg(svg); }
  function frame(svg, host, opts = {}) {
    const w = host.offsetWidth, h = host.offsetHeight;
    const rc = sizeSvg(svg, w, h);
    svg.appendChild(rc.rectangle(3, 3, w - 6, h - 6, { roughness: 1.6, bowing: 1.2, stroke: opts.stroke || C.ink, strokeWidth: opts.sw || 2, seed: seed(host) }));
    if (opts.double) svg.appendChild(rc.rectangle(6, 7, w - 12, h - 12, { roughness: 2.2, stroke: opts.stroke2 || C.blue, strokeWidth: 1, seed: seed(host) + 3 }));
  }

  // ------------------------------------------------------------------ evidence figures
  function drawMarks(svg, img, marks, scale = 1) {
    const w = img.clientWidth, h = img.clientHeight;
    const rc = sizeSvg(svg, w, h);
    marks.forEach((m, i) => {
      const x0 = m[0] * w, y0 = m[1] * h, x1 = m[2] * w, y1 = m[3] * h;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ew = (x1 - x0) + 26 * scale, eh = (y1 - y0) + 18 * scale;
      svg.appendChild(rc.ellipse(cx, cy, ew, eh, { stroke: C.blue, strokeWidth: 2.6 * scale, roughness: 1.8, fill: "rgba(201,220,60,.45)", fillStyle: "hachure", hachureGap: 5 * scale, fillWeight: 2 * scale, seed: 11 + i }));
    });
  }
  function renderFigures() {
    $$("figure.ev").forEach((fig) => {
      const ev = E.images[fig.dataset.ev];
      if (!ev) { fig.innerHTML = `<p class="hand">missing evidence: ${fig.dataset.ev}</p>`; return; }
      fig.innerHTML = `<div class="pin"><div class="tape"></div><img alt="${ev.caption}" src="${ev.src}"><svg class="marks"></svg><svg class="frame"></svg></div>
        <figcaption>${fig.dataset.who ? `<b class="blue">${fig.dataset.who}</b><br>` : ""}${ev.caption}<small>${ev.source}</small></figcaption>`;
      const img = $("img", fig);
      img.addEventListener("load", () => drawFigure(fig));
      img.addEventListener("click", () => openLightbox(ev));
    });
  }
  function drawFigure(fig) {
    const ev = E.images[fig.dataset.ev], pin = $(".pin", fig), img = $("img", fig);
    if (!ev || !img.complete || !img.clientWidth) return;
    frame($("svg.frame", fig), pin, { double: true });
    drawMarks($("svg.marks", fig), img, ev.marks);
  }
  function openLightbox(ev) {
    const lb = $("#lightbox"), img = $("img", lb);
    img.src = ev.src; $("p", lb).textContent = `${ev.caption} — ${ev.source}`;
    lb.classList.add("on");
    const go = () => drawMarks($("svg", lb), img, ev.marks, 1.6);
    if (img.complete) setTimeout(go, 30); else img.onload = go;
  }
  $("#lightbox").addEventListener("click", () => $("#lightbox").classList.remove("on"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#lightbox").classList.remove("on"); });

  // ------------------------------------------------------------------ plan-row replicas
  const planLabel = (p) => { const m = p.match(/Q2_(\w+?)_Grade_(\d)/); const s = { Math: "Maths", SSt: "SST" }[m[1]] || m[1]; return `Grade ${m[2]} ${s} plan`; };
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  function renderReplicas() {
    $$(".replica").forEach((el) => {
      const r = E.rows[el.dataset.row];
      if (!r) { el.textContent = "missing row " + el.dataset.row; return; }
      let cols = el.dataset.cols ? el.dataset.cols.split(",").map(Number) : r.header.map((_, i) => i);
      const mark = el.dataset.mark;
      if (mark) r.cells.forEach((c, i) => { if (c.includes(mark) && !cols.includes(i)) cols.push(i); });
      cols = cols.filter((i) => i < r.cells.length).sort((a, b) => a - b);
      const hl = (el.dataset.hl || "").split(",").filter(Boolean).map(Number);
      const cell = (txt) => { let t = esc(txt); if (mark) t = t.split(esc(mark)).join(`<mark style="background:#C9DC3C">${esc(mark)}</mark>`); return t; };
      el.innerHTML = `<div class="who">${planLabel(r.plan)} · table ${r.table} · row ${esc(r.cells[0])}${r.note ? " — " + esc(r.note) : ""}</div>
        <table><tr>${cols.map((i) => `<th>${esc(r.header[i] || "")}</th>`).join("")}</tr>
        <tr>${cols.map((i) => `<td class="${hl.includes(i) ? "hl" : ""}">${cell(r.cells[i] || "")}</td>`).join("")}</tr></table>${el.dataset.page ? `<span class="pagetag">${esc(el.dataset.page)}</span>` : ""}<svg class="frame"></svg>`;
    });
  }
  function drawReplicas() { $$(".replica").forEach((el) => frame($("svg.frame", el), el, { stroke: C.ink, sw: 1.6 })); }

  // ------------------------------------------------------------------ choices
  function choiceEl(id, opts, today, multi) {
    const d = document.createElement("div");
    d.className = "choice"; d.dataset.id = id; d.dataset.opts = opts.join("|");
    if (today) d.dataset.today = today; if (multi) d.dataset.multi = "1";
    return d;
  }
  function wireChoices() {
    $$(".choice").forEach((el) => {
      if (el.dataset.wired) return; el.dataset.wired = "1";
      const id = el.dataset.id, multi = el.dataset.multi === "1", today = el.dataset.today || "";
      el.classList.add("pills");
      el.dataset.opts.split("|").forEach((o) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "pill"; b.textContent = o;
        if (today.split(",").includes(o)) b.classList.add("today");
        b.addEventListener("click", () => {
          if (multi) {
            const cur = new Set(state.answers[id] || []);
            cur.has(o) ? cur.delete(o) : cur.add(o);
            state.answers[id] = [...cur];
          } else {
            state.answers[id] = state.answers[id] === o ? undefined : o;
            if (state.answers[id] === undefined) delete state.answers[id];
          }
          paintChoice(el); save();
        });
        el.appendChild(b);
      });
      paintChoice(el);
    });
  }
  function paintChoice(el) {
    const v = state.answers[el.dataset.id];
    $$(".pill", el).forEach((b) => b.classList.toggle("on", Array.isArray(v) ? v.includes(b.textContent) : v === b.textContent));
  }
  function wireFields() {
    $$("[data-id]").forEach((el) => {
      if (!(el.tagName === "TEXTAREA" || el.tagName === "INPUT")) return;
      const id = el.dataset.id, isNote = el.tagName === "TEXTAREA";
      el.value = (isNote ? state.notes[id] : state.answers[id]) || "";
      el.addEventListener("input", () => { (isNote ? state.notes : state.answers)[id] = el.value; save(); });
    });
  }

  // ------------------------------------------------------------------ decision grids
  // M2: column headers per subject, as used today (cleaned of header drift such as "5. No." or "F/A/A")
  const F1_EN = ["S.No", "Strand", "Big Idea", "Objective (SWBAT…)", "Assessment (F/U/A)", "How Steps", "Suggested Activity"];
  const F2 = ["S.No", "Chapter Name", "Objective", "Assessment (F/U/A/E + Differentiation)", "How Steps", "Suggested Activity", "Date Tracker"];
  const M2 = [
    { s: "English", fam: "F1", where: "G1, G2, G4, G6", gap: "G3, G5", cols: F1_EN },
    { s: "Hindi", fam: "F1", where: "G1, G4, G6", gap: "G3, G5", cols: ["क्र.सं.", "स्ट्रैंड", "मुख्य विचार", "उद्देश्य (विद्यार्थी…)", "मूल्यांकन (F/U/A)", "कैसे करेंगे", "सुझाई गई गतिविधि"],
      variant: { label: "G2 uses विषय · सामग्री", cols: ["क्र.सं.", "विषय", "सामग्री", "उद्देश्य (बच्चे… कर पाएँगे)", "मूल्यांकन प्रश्न (F/U/A)", "कैसे सीखें", "सुझावित गतिविधि"] } },
    { s: "SST", fam: "F1", where: "G6", cols: ["S.No", "Strand", "Big Idea", "Objective (SWBAT…)", "Assessment (F/U/A)", "How Steps", "Student Activity"] },
    { s: "Maths", fam: "F2", where: "G1, G2, G4", gap: "G3, G5", cols: F2,
      variant: { label: "G6 uses F3 (no Chapter column)", cols: ["S.No", "Objective (SWBAT)", "Assessment (F/U/A/E)", "How Steps", "Suggested Activity", "Date Tracker"] } },
    { s: "EVS", fam: "F2", where: "G1, G2, G4", gap: "G3, G5", cols: F2 },
    { s: "Science", fam: "F3", where: "G6", cols: ["S.No", "Objectives", "Assessment (F/U/A/E)", "How Steps", "Suggested Activity", "Date Tracker"] },
  ];
  const MUST = [["sel", "SEL / sharing", "every language chapter"], ["capstone", "Capstone product", "poster, comic, guide"], ["wrap", "Quarter wrap-up", "EVS, SST"],
    ["local", "Local context", "Uttarakhand, village"], ["inclusion", "Inclusion lens", "EVS families"], ["safety", "Safety lens", "EVS, Science"], ["real", "Real-life link", "audits, interviews"]];

  // ------------------------------------------------------------------ M2 header editor
  // State per subject: M2.<S>.headers (array), M2.<S>.locked (time string), M2.<S>.copiedFrom (subject)
  function buildHeaderEditor(host) {
    host.className = "hdr-editor";
    host.innerHTML = "";
    M2.forEach((cfg) => {
      const lane = document.createElement("div");
      lane.className = "lane"; lane.dataset.subj = cfg.s;
      host.appendChild(lane);
      renderLane(lane, cfg);
    });
  }
  const H = (s) => `M2.${s}.headers`, LOCK = (s) => `M2.${s}.locked`, FROM = (s) => `M2.${s}.copiedFrom`;
  function headersOf(cfg) { if (!Array.isArray(state.answers[H(cfg.s)])) state.answers[H(cfg.s)] = [...cfg.cols]; return state.answers[H(cfg.s)]; }
  function relayout() { requestAnimationFrame(drawAsks); }
  function renderLane(lane, cfg) {
    const cols = headersOf(cfg), locked = !!state.answers[LOCK(cfg.s)], from = state.answers[FROM(cfg.s)];
    lane.classList.toggle("locked", locked);
    lane.innerHTML = `
      <div class="lane-head"><span class="lab">${cfg.s}</span><span class="pill today on-today">${cfg.fam} ✎ today</span>
        <span class="hand muted lane-where">today: ${cfg.where}</span>${cfg.gap ? `<span class="nosample">${cfg.gap}: no sample — same columns?</span>` : ""}</div>
      <div class="lane-cols"></div>
      <div class="lane-actions">
        <button type="button" class="pill lock">${locked ? "🔒 locked" : "🔓 lock"}</button>
        <button type="button" class="pill copy">⇢ copy to…</button>
      </div>
      <div class="lane-foot hand">
        ${locked ? `<span class="blue">agreed ✓ ${esc(String(state.answers[LOCK(cfg.s)]))}</span>` : ""}
        ${from ? `<span class="muted">copied from ${esc(from)}</span>` : ""}
        ${!locked && cfg.variant ? `<button type="button" class="keep variant">load ${esc(cfg.variant.label)}</button>` : ""}
        ${!locked ? `<button type="button" class="keep reset">reset to today</button>` : ""}
      </div>
      <div class="copy-pop" hidden></div>`;
    const box = $(".lane-cols", lane);
    const plus = (at) => {
      const p = document.createElement("button"); p.type = "button"; p.className = "add"; p.title = "add a column here"; p.textContent = "+";
      p.addEventListener("click", () => { cols.splice(at, 0, "New column"); save(); renderLane(lane, cfg); const t = $$(".col-txt", lane)[at]; if (t) { t.focus(); document.getSelection().selectAllChildren(t); } });
      return p;
    };
    if (!locked) box.appendChild(plus(0));
    cols.forEach((name, i) => {
      const chip = document.createElement("div");
      chip.className = "col-chip"; chip.dataset.i = i;
      chip.innerHTML = `${locked ? "" : '<span class="grip" title="drag to move">⋮⋮</span>'}<span class="col-txt" ${locked ? "" : 'contenteditable="true" spellcheck="false"'}>${esc(name)}</span>${locked ? "" : '<button type="button" class="del" title="remove">×</button>'}`;
      box.appendChild(chip);
      if (!locked) box.appendChild(plus(i + 1));
      if (locked) return;
      const txt = $(".col-txt", chip);
      txt.addEventListener("input", () => { cols[i] = txt.textContent.trim(); save(); });
      txt.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); txt.blur(); } });
      txt.addEventListener("blur", () => { if (!txt.textContent.trim()) { cols.splice(i, 1); save(); renderLane(lane, cfg); } });
      $(".del", chip).addEventListener("click", () => { cols.splice(i, 1); save(); renderLane(lane, cfg); });
      // drag by the grip only, so text stays editable
      const grip = $(".grip", chip);
      grip.addEventListener("mousedown", () => (chip.draggable = true));
      chip.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; chip.classList.add("dragging"); });
      chip.addEventListener("dragend", () => { chip.draggable = false; chip.classList.remove("dragging"); });
      chip.addEventListener("dragover", (e) => {
        e.preventDefault();
        const r = chip.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
        chip.classList.toggle("drop-before", !after); chip.classList.toggle("drop-after", after);
      });
      chip.addEventListener("dragleave", () => chip.classList.remove("drop-before", "drop-after"));
      chip.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = +e.dataTransfer.getData("text/plain"), after = chip.classList.contains("drop-after");
        chip.classList.remove("drop-before", "drop-after");
        let to = i + (after ? 1 : 0);
        if (Number.isNaN(from) || from === i) return;
        const [moved] = cols.splice(from, 1);
        if (from < to) to -= 1;
        cols.splice(to, 0, moved);
        save(); renderLane(lane, cfg);
      });
    });
    $(".lock", lane).addEventListener("click", () => {
      if (state.answers[LOCK(cfg.s)]) delete state.answers[LOCK(cfg.s)];
      else state.answers[LOCK(cfg.s)] = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      save(); renderLane(lane, cfg);
    });
    const rs = $(".reset", lane); if (rs) rs.addEventListener("click", () => { state.answers[H(cfg.s)] = [...cfg.cols]; delete state.answers[FROM(cfg.s)]; save(); renderLane(lane, cfg); });
    const vr = $(".variant", lane); if (vr) vr.addEventListener("click", () => { state.answers[H(cfg.s)] = [...cfg.variant.cols]; save(); renderLane(lane, cfg); });
    $(".copy", lane).addEventListener("click", () => openCopy(lane, cfg));
    relayout();
  }
  function openCopy(lane, cfg) {
    const pop = $(".copy-pop", lane);
    if (!pop.hidden) { pop.hidden = true; relayout(); return; }
    const others = M2.filter((c) => c.s !== cfg.s);
    const picked = new Set();
    pop.innerHTML = `<span class="hand">copy ${esc(cfg.s)}'s columns to:</span>
      <span class="pills">${others.map((c) => `<button type="button" class="pill tgt" data-s="${c.s}" ${state.answers[LOCK(c.s)] ? "disabled title='locked — unlock it first'" : ""}>${c.s}${state.answers[LOCK(c.s)] ? " 🔒" : ""}</button>`).join("")}
      <button type="button" class="pill all">All</button></span>
      <button type="button" class="pill apply">apply</button><button type="button" class="keep cancel">cancel</button>`;
    pop.hidden = false;
    const paint = () => $$(".tgt", pop).forEach((b) => b.classList.toggle("on", picked.has(b.dataset.s)));
    $$(".tgt", pop).forEach((b) => b.addEventListener("click", () => { picked.has(b.dataset.s) ? picked.delete(b.dataset.s) : picked.add(b.dataset.s); paint(); }));
    $(".all", pop).addEventListener("click", () => { $$(".tgt:not([disabled])", pop).forEach((b) => picked.add(b.dataset.s)); paint(); });
    $(".cancel", pop).addEventListener("click", () => { pop.hidden = true; relayout(); });
    $(".apply", pop).addEventListener("click", () => {
      const src = [...headersOf(cfg)];
      picked.forEach((s) => { state.answers[H(s)] = [...src]; state.answers[FROM(s)] = cfg.s; });
      save();
      $$(".hdr-editor .lane").forEach((l) => { const c = M2.find((x) => x.s === l.dataset.subj); if (l !== lane && picked.has(c.s)) { renderLane(l, c); l.classList.add("flash"); setTimeout(() => l.classList.remove("flash"), 1200); } });
      pop.hidden = true; relayout();
    });
    relayout();
  }

  function buildParts() {
    buildHeaderEditor($('[data-build="M2"]'));
    const g = $('[data-build="must"]');
    MUST.forEach(([k, name, where]) => {
      const b = document.createElement("div"); b.className = "badge"; b.dataset.id = `R.must.${k}`;
      b.innerHTML = `<svg></svg><span>${name}<em>${where}</em></span>`;
      b.addEventListener("click", () => {
        if (state.answers["R.locked"]) return;
        const id = b.dataset.id; state.answers[id] = !state.answers[id]; if (!state.answers[id]) delete state.answers[id]; drawBadge(b); save();
      });
      g.appendChild(b);
    });
    const lockBtn = $(".lockrules");
    const paintLock = () => {
      const at = state.answers["R.locked"];
      lockBtn.textContent = at ? "🔒 locked as school default" : "🔓 lock as school default";
      lockBtn.classList.toggle("on", !!at);
      $("#rulesStamp").textContent = at ? `agreed ✓ ${at}` : "";
      $("#rules").classList.toggle("locked", !!at);
      $$("#rules .founder .choice .pill").forEach((p) => (p.disabled = !!at));
    };
    lockBtn.addEventListener("click", () => {
      if (state.answers["R.locked"]) delete state.answers["R.locked"];
      else state.answers["R.locked"] = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      paintLock(); save();
    });
    // pills are created later by wireChoices; repaint the lock state once they exist
    setTimeout(paintLock, 0);
  }
  function drawBadge(b) {
    const on = !!state.answers[b.dataset.id];
    b.classList.toggle("on", on);
    const svg = $("svg", b), w = b.offsetWidth, h = b.offsetHeight, rc = sizeSvg(svg, w, h);
    svg.appendChild(rc.circle(w / 2, h / 2, w - 12, { stroke: on ? C.blue : C.ink, strokeWidth: on ? 3 : 1.8, roughness: 1.6, fill: on ? C.lime : "none", fillStyle: "hachure", hachureGap: 6, fillWeight: 2.5, seed: seed(b) }));
    if (on) svg.appendChild(rc.linearPath([[w * .70, h * .16], [w * .78, h * .26], [w * .94, h * .04]], { stroke: C.blue, strokeWidth: 3, roughness: 1.2 }));
  }

  // ------------------------------------------------------------------ strands
  function renderStrands() {
    $$("[data-strands]").forEach((el) => {
      const s = E.charts[el.dataset.strands];
      const added = /SEL|कला|प्रस्तुति|सहयोग|रचनात्मकता|चिंतन/;
      el.innerHTML = `<p class="hand" style="margin:0 0 6px"><b>${s.label}</b></p><div class="flow">${s.strands.map((t, i) =>
        `<span class="chip ${added.test(t) ? "added" : ""}">${i + 1}. ${esc(t)}</span>`).join('<span class="arrow">→</span>')}</div>`;
    });
  }

  // ------------------------------------------------------------------ charts
  function approach(ch) {
    const g = ch.grade, s = ch.subject, id = ch.id;
    if ((s === "English" && g === "4") || (s === "English" && g === "2" && /-0[23]-/.test(id)) || (s === "Hindi" && g === "4") ||
      (s === "Maths" && (g === "4" || g === "6")) || s === "Science" || (s === "EVS" && g === "4") || s === "SST") return "book";
    if (s === "English" || (s === "Hindi" && (g === "2" || g === "6"))) return "cycle";
    return "mixed";
  }
  // English + Hindi only: what the rows are made of, and how much of the book they cover
  function drawCoverage(svg) {
    const rc = rough.svg(svg); svg.innerHTML = "";
    const txt = (s, X, Y, o = {}) => { const t = document.createElementNS(SVGNS, "text"); t.setAttribute("x", X); t.setAttribute("y", Y); t.setAttribute("font-family", o.f || "Kalam"); t.setAttribute("font-size", o.s || 15); if (o.w) t.setAttribute("font-weight", o.w); if (o.a) t.setAttribute("text-anchor", o.a); if (o.c) t.setAttribute("fill", o.c); t.textContent = s; svg.appendChild(t); };
    const lang = E.charts.chapters.filter((c) => c.subject === "English" || c.subject === "Hindi");
    const parts = [["Direct", "straight from the book", C.blue], ["Extended", "book, taken further", "#8FB0EC"], ["Added", "school's own", C.lime]];
    [["book", "follow the book", 40], ["cycle", "skill cycle", 135]].forEach(([key, label, y], k) => {
      const xs = lang.filter((c) => approach(c) === key);
      const L = { Direct: 0, Extended: 0, Added: 0 };
      xs.forEach((c) => Object.keys(L).forEach((q) => (L[q] += c.labels[q] || 0)));
      const tot = L.Direct + L.Extended + L.Added || 1;
      const cov = xs.filter((c) => c.cov).map((c) => c.cov[0] / c.cov[1]).sort((a, b) => a - b);
      const med = Math.round(100 * cov[Math.floor(cov.length / 2)]);
      txt(label, 0, y + 30, { f: "Baloo 2", w: 800, s: 18, c: key === "book" ? C.blue : C.ink });
      txt(`${xs.length} chapters`, 0, y + 50, { s: 13, c: "#5B6070" });
      let x = 165; const W = 430;
      parts.forEach(([q, , col], i) => {
        const w = W * L[q] / tot; if (w < 1) return;
        svg.appendChild(rc.rectangle(x, y + 8, w, 42, { fill: col, fillStyle: i === 2 ? "cross-hatch" : "hachure", hachureGap: 5, fillWeight: 2, stroke: C.ink, strokeWidth: 1.4, roughness: 1.4, seed: 40 + k * 5 + i }));
        if (w > 34) { txt(Math.round(100 * L[q] / tot) + "%", x + w / 2, y + 36, { a: "middle", w: 800, f: "Baloo 2", s: 17, c: C.ink }); const t = svg.lastChild; t.setAttribute("stroke", "#fff"); t.setAttribute("stroke-width", "5"); t.setAttribute("paint-order", "stroke"); }
        x += w;
      });
      txt(`covers ~${med}% of the book`, 165 + W + 14, y + 36, { s: 16, c: C.blue });
    });
    let lx = 165; parts.forEach(([, name, col], i) => { svg.appendChild(rc.rectangle(lx, 214, 16, 14, { fill: col, fillStyle: "solid", stroke: C.ink, roughness: 1, seed: 60 + i })); txt(name, lx + 22, 226, { s: 14 }); lx += 165; });
  }
  const SUBJ = { English: C.blue, Hindi: "#E07A5F", Maths: C.ink, EVS: C.hill, Science: "#8E6CCF", SST: "#D4A017" };
  function drawScatter(svg) {
    const W = 760, H = 330, rc = rough.svg(svg); svg.innerHTML = "";
    const pts = E.charts.chapters.filter((c) => c.rows && c.pages && c.pages < 45);
    const maxP = Math.max(...pts.map((p) => p.pages)), maxR = 16;
    const x = (v) => 60 + v / maxP * (W - 100), y = (v) => H - 40 - v / maxR * (H - 70);
    svg.appendChild(rc.line(60, H - 40, W - 30, H - 40, { stroke: C.ink, roughness: 1.2 }));
    svg.appendChild(rc.line(60, H - 40, 60, 20, { stroke: C.ink, roughness: 1.2 }));
    svg.appendChild(rc.rectangle(x(0), y(11), x(maxP) - x(0), y(7) - y(11), { stroke: "none", fill: "rgba(201,220,60,.35)", fillStyle: "hachure", hachureGap: 7, roughness: 1.5 }));
    const txt = (s, X, Y, o = {}) => { const t = document.createElementNS(SVGNS, "text"); t.setAttribute("x", X); t.setAttribute("y", Y); t.setAttribute("font-family", o.f || "Kalam"); t.setAttribute("font-size", o.s || 14); if (o.a) t.setAttribute("text-anchor", o.a); if (o.c) t.setAttribute("fill", o.c); t.textContent = s; svg.appendChild(t); };
    txt("7–11 rows band", x(maxP) - 4, y(11) - 6, { a: "end", c: C.blue });
    txt("pages in the book →", W - 30, H - 12, { a: "end" }); txt("rows ↑", 10, 26);
    for (let v = 0; v <= maxP; v += 5) txt(String(v), x(v), H - 22, { a: "middle", s: 13 });
    [0, 5, 10, 15].forEach((v) => txt(String(v), 48, y(v) + 4, { a: "end", s: 13 }));
    pts.forEach((p, i) => svg.appendChild(rc.circle(x(p.pages), y(p.rows), 12, { fill: SUBJ[p.subject] || C.ink, fillStyle: "solid", stroke: C.ink, strokeWidth: .8, roughness: 1.2, seed: 5 + i })));
    const callout = (id, label, dx, dy) => {
      const p = pts.find((q) => q.id === id); if (!p) return;
      svg.appendChild(rc.circle(x(p.pages), y(p.rows), 26, { stroke: C.blue, strokeWidth: 2.4, roughness: 1.6 }));
      svg.appendChild(rc.line(x(p.pages) + dx * .25, y(p.rows) + dy * .25, x(p.pages) + dx, y(p.rows) + dy, { stroke: C.blue, strokeWidth: 1.8, roughness: 1 }));
      txt(label, x(p.pages) + dx + (dx > 0 ? 4 : -4), y(p.rows) + dy + 4, { a: dx > 0 ? "start" : "end", c: C.blue, s: 15 });
    };
    callout("G2-Hindi-04-maa", `माँ · ${(pts.find((q) => q.id === "G2-Hindi-04-maa") || {}).pages} pages → 10 rows`, 70, 62);
    callout("G6-Science-03-mindful-eating", "Mindful Eating · 26 pages → 10 rows", -40, -50);
    let lx = 70; Object.entries(SUBJ).forEach(([s, col]) => { svg.appendChild(rc.circle(lx, 14, 10, { fill: col, fillStyle: "solid", stroke: C.ink, roughness: 1 })); txt(s, lx + 9, 19, { f: "Baloo 2", s: 13 }); lx += 95; });
  }

  // ------------------------------------------------------------------ decorative drawings
  function drawScene(svg) {
    const host = svg.parentElement, w = host.offsetWidth, h = host.offsetHeight, kind = svg.dataset.draw;
    const rc = sizeSvg(svg, w, h);
    if (kind === "hero" || kind === "hero2") {
      const sx = w * .86, sy = kind === "hero" ? h * .2 : h * .1, r = Math.min(kind === "hero" ? 150 : 110, w * .12);
      svg.appendChild(rc.circle(sx, sy, r, { fill: C.lime, fillStyle: "solid", stroke: C.ink, strokeWidth: 2, roughness: 1.5 }));
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; svg.appendChild(rc.line(sx + Math.cos(a) * r * .65, sy + Math.sin(a) * r * .65, sx + Math.cos(a) * r * .95, sy + Math.sin(a) * r * .95, { stroke: C.ink, strokeWidth: 2, roughness: 1.4, seed: i + 2 })); }
      const base = h - 10;
      svg.appendChild(rc.path(`M0 ${base} C ${w * .18} ${base - 230}, ${w * .32} ${base - 120}, ${w * .5} ${base - 60} S ${w * .8} ${base - 210}, ${w} ${base - 90} L ${w} ${h} L 0 ${h} Z`, { fill: C.hill2, fillStyle: "hachure", hachureGap: 9, stroke: C.hill, strokeWidth: 2, roughness: 1.6 }));
      svg.appendChild(rc.path(`M0 ${base - 20} C ${w * .25} ${base - 110}, ${w * .45} ${base - 10}, ${w * .65} ${base - 70} S ${w * .9} ${base - 30}, ${w} ${base - 40} L ${w} ${h} L 0 ${h} Z`, { fill: C.hill, fillStyle: "zigzag", hachureGap: 11, stroke: C.hill, strokeWidth: 2, roughness: 1.8 }));
      [[.6, .14], [.65, .18], [.55, .2]].forEach(([bx, by], i) => svg.appendChild(rc.path(`M${w * bx} ${h * by} q 10 -10 20 0 q 10 -10 20 0`, { stroke: C.ink, strokeWidth: 2, roughness: .8, seed: 30 + i })));
      const hillY = (x) => base - 20 - 70 * Math.sin(Math.PI * x / w * 1.6) * .6 - 30;
      [[.08, 1], [.12, .8], [.16, 1.1], [.71, .9], [.75, 1.2], [.79, .8], [.93, 1]].forEach(([fx, s], i) => pine(rc, svg, w * fx, hillY(w * fx) - 6, 46 * s, 60 + i));
      [[.36, 1], [.42, .8], [.86, .9]].forEach(([fx, s], i) => house(rc, svg, w * fx, hillY(w * fx) + 8, 40 * s, 80 + i));
    } else if (kind === "blob") {
      const right = svg.dataset.at === "right";
      svg.appendChild(rc.ellipse(right ? w * .78 : w * .2, h * .3, w * .55, h * .5, { fill: C.sky, fillStyle: "hachure", hachureGap: 14, fillWeight: 1.5, stroke: "none", roughness: 2.2, seed: seed(svg) }));
      svg.appendChild(rc.ellipse(right ? w * .12 : w * .9, h * .85, w * .22, h * .18, { fill: "rgba(201,220,60,.35)", fillStyle: "dots", hachureGap: 12, stroke: "none", roughness: 2, seed: seed(svg) + 1 }));
    } else if (kind === "calendar") {
      const x = w * .66, y = h * .2, cw = Math.min(300, w * .26), ch = cw * .9;
      svg.appendChild(rc.rectangle(x, y, cw, ch, { fill: "#fff", fillStyle: "solid", stroke: C.ink, strokeWidth: 2.2, roughness: 1.7 }));
      svg.appendChild(rc.rectangle(x, y, cw, ch * .22, { fill: C.blue, fillStyle: "hachure", hachureGap: 5, stroke: C.ink, strokeWidth: 2, roughness: 1.7 }));
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) svg.appendChild(rc.circle(x + cw * (.14 + c * .18), y + ch * (.36 + r * .17), 8, { fill: r === 2 && c === 3 ? C.lime : C.sky, fillStyle: "solid", stroke: "none", roughness: 1 }));
      svg.appendChild(rc.circle(x + cw * (.14 + 3 * .18), y + ch * (.36 + 2 * .17), 36, { stroke: C.blue, strokeWidth: 3, roughness: 2 }));
    }
  }
  // ------------------------------------------------------------------ scenery and the journey
  function pine(rc, svg, x, y, hgt, sd) {
    svg.appendChild(rc.polygon([[x, y - hgt], [x - hgt * .32, y - hgt * .25], [x + hgt * .32, y - hgt * .25]], { fill: "#3E7F4E", fillStyle: "hachure", hachureGap: 4, stroke: "#2F5E3B", strokeWidth: 1.4, roughness: 1.2, seed: sd }));
    svg.appendChild(rc.polygon([[x, y - hgt * .7], [x - hgt * .4, y], [x + hgt * .4, y]], { fill: "#4E9A5E", fillStyle: "hachure", hachureGap: 4, stroke: "#2F5E3B", strokeWidth: 1.4, roughness: 1.2, seed: sd + 1 }));
    svg.appendChild(rc.line(x, y, x, y + hgt * .15, { stroke: "#6B4A2B", strokeWidth: 3, roughness: .8 }));
  }
  function house(rc, svg, x, y, s, sd) {
    svg.appendChild(rc.rectangle(x - s / 2, y - s * .6, s, s * .6, { fill: "#fff", fillStyle: "solid", stroke: C.ink, strokeWidth: 1.6, roughness: 1.3, seed: sd }));
    svg.appendChild(rc.polygon([[x - s * .62, y - s * .6], [x, y - s * 1.05], [x + s * .62, y - s * .6]], { fill: C.blue, fillStyle: "hachure", hachureGap: 4, stroke: C.ink, strokeWidth: 1.6, roughness: 1.3, seed: sd + 1 }));
    svg.appendChild(rc.rectangle(x - s * .1, y - s * .3, s * .2, s * .3, { fill: C.lime, fillStyle: "solid", stroke: C.ink, strokeWidth: 1, roughness: 1, seed: sd + 2 }));
  }
  // the road winding through the journey stops — सु-राह, the good path
  function drawRoad(svg) {
    const host = svg.parentElement, W = host.offsetWidth, Hh = host.offsetHeight, rc = sizeSvg(svg, W, Hh);
    const hb = host.getBoundingClientRect();
    const pts = $$(".stop-dot", host).map((d) => { const r = d.getBoundingClientRect(); return [r.left - hb.left + r.width / 2, r.top - hb.top + r.height / 2]; });
    if (pts.length < 2) return;
    const path = [[pts[0][0] + 30, 0]];
    pts.forEach(([x, y], i) => { if (i) path.push([x + (i % 2 ? 34 : -34), (y + pts[i - 1][1]) / 2]); path.push([x, y]); });
    path.push([pts[pts.length - 1][0] - 30, Hh]);
    svg.appendChild(rc.curve(path, { stroke: "#E4DCC6", strokeWidth: 30, roughness: .5, bowing: 1.5 }));
    svg.appendChild(rc.curve(path, { stroke: "#B9AE92", strokeWidth: 1.6, roughness: 1.4 }));
    const dash = rc.curve(path, { stroke: "#fff", strokeWidth: 3, roughness: .3 });
    dash.querySelectorAll("path").forEach((p) => p.setAttribute("stroke-dasharray", "10 14"));
    svg.appendChild(dash);
    pts.forEach(([x, y], i) => { if (i % 3 === 2) pine(rc, svg, x - 64, y + 44, 34, 200 + i); });
  }
  function drawNextRoad(svg) {
    const host = svg.parentElement, W = host.offsetWidth, Hh = host.offsetHeight, rc = sizeSvg(svg, W, Hh);
    const hb = host.getBoundingClientRect();
    const pts = $$(".nstop", host).filter((d) => d.offsetParent).map((d) => { const r = d.getBoundingClientRect(); return [r.left - hb.left + r.width / 2, r.top - hb.top + 20]; });
    if (pts.length < 2) return;
    svg.appendChild(rc.curve(pts, { stroke: C.blue, strokeWidth: 3, roughness: 1.3 }));
    pts.forEach(([x, y], i) => svg.appendChild(rc.circle(x, y, 30, { fill: i === 0 ? C.lime : "#fff", fillStyle: "solid", stroke: C.ink, strokeWidth: 2, roughness: 1.5, seed: 300 + i })));
    const [lx, ly] = pts[pts.length - 1];
    svg.appendChild(rc.line(lx + 16, ly - 4, lx + 16, ly - 44, { stroke: C.ink, strokeWidth: 2, roughness: .8 }));
    svg.appendChild(rc.polygon([[lx + 16, ly - 44], [lx + 44, ly - 36], [lx + 16, ly - 28]], { fill: C.lime, fillStyle: "solid", stroke: C.ink, strokeWidth: 1.6, roughness: 1 }));
  }
  const ICONS = {
    template: (rc) => [rc.rectangle(12, 16, 40, 32, { stroke: C.ink, strokeWidth: 2 }), rc.line(12, 26, 52, 26, { stroke: C.blue, strokeWidth: 2.4 }), rc.line(26, 16, 26, 48, { stroke: C.ink }), rc.line(39, 16, 39, 48, { stroke: C.ink })],
    rules: (rc) => [18, 32, 46].flatMap((y, i) => [rc.line(12, y, 52, y, { stroke: C.ink, strokeWidth: 2 }), rc.circle([22, 40, 30][i], y, 10, { fill: C.lime, fillStyle: "solid", stroke: C.ink, strokeWidth: 1.6 })]),
    books: (rc) => [rc.rectangle(12, 18, 10, 32, { fill: C.blue, fillStyle: "hachure", stroke: C.ink }), rc.rectangle(24, 14, 10, 36, { fill: C.lime, fillStyle: "hachure", stroke: C.ink }), rc.polygon([[36, 20], [45, 17], [53, 47], [44, 50]], { fill: "#E07A5F", fillStyle: "hachure", stroke: C.ink })],
    pick: (rc) => [rc.rectangle(10, 22, 44, 20, { stroke: C.ink, strokeWidth: 2 }), rc.linearPath([[40, 29], [45, 35], [50, 29]], { stroke: C.blue, strokeWidth: 2.5 }), rc.line(15, 32, 32, 32, { stroke: C.ink })],
    read: (rc) => [rc.circle(27, 27, 26, { stroke: C.ink, strokeWidth: 2.4, fill: C.sky, fillStyle: "solid" }), rc.line(36, 36, 52, 52, { stroke: C.ink, strokeWidth: 4 })],
    draft: (rc) => [rc.rectangle(12, 12, 30, 40, { stroke: C.ink, strokeWidth: 2, fill: "#fff", fillStyle: "solid" }), rc.line(17, 22, 36, 22, { stroke: C.blue }), rc.line(17, 30, 36, 30, { stroke: C.blue }), rc.polygon([[44, 18], [52, 26], [34, 46], [28, 48], [30, 42]], { fill: C.lime, fillStyle: "solid", stroke: C.ink })],
    check: (rc) => [rc.path("M32 10 L52 18 Q52 42 32 54 Q12 42 12 18 Z", { stroke: C.ink, strokeWidth: 2, fill: C.sky, fillStyle: "solid" }), rc.linearPath([[22, 32], [30, 40], [43, 24]], { stroke: C.blue, strokeWidth: 3.5 })],
    review: (rc) => [rc.rectangle(8, 16, 22, 32, { stroke: C.ink, strokeWidth: 2, fill: "#fff", fillStyle: "solid" }), rc.rectangle(34, 16, 22, 32, { stroke: C.ink, strokeWidth: 2, fill: C.lime, fillStyle: "hachure" }), rc.line(28, 32, 36, 32, { stroke: C.blue, strokeWidth: 2.5 })],
    export: (rc) => [rc.line(32, 10, 32, 38, { stroke: C.blue, strokeWidth: 3 }), rc.linearPath([[22, 28], [32, 38], [42, 28]], { stroke: C.blue, strokeWidth: 3 }), rc.linearPath([[12, 40], [12, 52], [52, 52], [52, 40]], { stroke: C.ink, strokeWidth: 2.4 })],
  };
  function drawJourney() {
    $$(".stop-dot").forEach((d, i) => {
      const svg = $("svg", d), rc = sizeSvg(svg, 64, 64);
      svg.appendChild(rc.circle(32, 32, 60, { fill: "#fff", fillStyle: "solid", stroke: i < 3 ? C.blue : C.ink, strokeWidth: 2.6, roughness: 1.6, seed: 400 + i }));
      (ICONS[svg.dataset.icon] || (() => []))(rc).forEach((n) => svg.appendChild(n));
    });
    const road = $('svg[data-draw="road"]'); if (road) drawRoad(road);
    const nr = $('svg[data-draw="nextroad"]'); if (nr) drawNextRoad(nr);
    $$(".totool").forEach((el, i) => {
      if (!el.dataset.built) { el.dataset.built = "1"; el.innerHTML = `<svg></svg><span class="tt-k">→ in the tool</span><b>${esc(el.dataset.tool)}</b><span class="tt-s">${esc(el.dataset.sub || "")}</span>`; }
      const svg = $("svg", el), w = el.offsetWidth, h = el.offsetHeight, rc = sizeSvg(svg, w, h);
      svg.appendChild(rc.ellipse(w / 2, h / 2, w - 8, h - 6, { fill: C.lime, fillStyle: "hachure", hachureGap: 6, fillWeight: 2, stroke: C.blue, strokeWidth: 2.4, roughness: 1.7, seed: 500 + i }));
    });
    [["#rules", C.blue], [".parking", C.ink]].forEach(([sel, col]) => { const el = $(sel); if (el) frame($("svg.frame", el), el, { stroke: col, sw: 2, double: true, stroke2: C.lime }); });
  }
  function drawSmall() {
    $$('svg[data-draw="ring"]').forEach((svg, i) => { const p = svg.parentElement, rc = sizeSvg(svg, p.offsetWidth, p.offsetHeight); svg.appendChild(rc.ellipse(p.offsetWidth / 2, p.offsetHeight / 2, p.offsetWidth + 10, p.offsetHeight + 6, { stroke: i % 2 ? C.blue : C.ink, strokeWidth: 2, roughness: 2, seed: 50 + i })); });
    $$('svg[data-draw="dotnum"]').forEach((svg, i) => { const rc = sizeSvg(svg, 50, 50); svg.appendChild(rc.circle(25, 25, 46, { fill: C.blue, fillStyle: "solid", stroke: C.ink, strokeWidth: 2, roughness: 1.8, seed: 70 + i })); });
    $$('svg[data-draw="arrow"]').forEach((svg) => { const rc = sizeSvg(svg, 140, 90); svg.appendChild(rc.curve([[8, 60], [50, 20], [100, 30], [128, 52]], { stroke: C.blue, strokeWidth: 3, roughness: 1.4 })); svg.appendChild(rc.linearPath([[108, 40], [130, 54], [110, 68]], { stroke: C.blue, strokeWidth: 3, roughness: 1 })); });
    $$("h2 .u").forEach((u, i) => {
      let s = $("svg", u);
      if (!s) { s = document.createElementNS(SVGNS, "svg"); s.style.cssText = "position:absolute;left:0;bottom:-12px;overflow:visible;pointer-events:none"; u.appendChild(s); }
      const w = u.offsetWidth, rc = sizeSvg(s, w, 16);
      s.appendChild(rc.curve([[0, 8], [w * .3, 3], [w * .6, 12], [w, 5]], { stroke: C.lime, strokeWidth: 6, roughness: 1.6, seed: 90 + i }));
    });
    drawAsks();
    $$(".badge").forEach(drawBadge);
  }
  function drawAsks() {
    $$(".ask").forEach((a, i) => {
      const svg = $("svg.bubble", a), w = a.offsetWidth, h = a.offsetHeight, rc = sizeSvg(svg, w, h + 30), r = 26;
      const d = `M ${r} 4 H ${w - r} Q ${w - 4} 4 ${w - 4} ${r} V ${h - r} Q ${w - 4} ${h - 4} ${w - r} ${h - 4} H 90 L 46 ${h + 24} L 58 ${h - 4} H ${r} Q 4 ${h - 4} 4 ${h - r} V ${r} Q 4 4 ${r} 4 Z`;
      svg.appendChild(rc.path(d, { stroke: C.blue, strokeWidth: 2.4, roughness: 1.4, fill: "#fff", fillStyle: "solid", seed: 120 + i }));
    });
  }
  function drawAll() {
    $$("svg.bg").forEach(drawScene);
    drawSmall();
    $$("figure.ev").forEach(drawFigure);
    drawReplicas();
    const cov = $('svg[data-draw="coverage"]'); if (cov) drawCoverage(cov);
    const sc = $('svg[data-draw="scatter"]'); if (sc) drawScatter(sc);
    drawJourney();
  }

  // ------------------------------------------------------------------ summary, copy, download, nav
  function renderSummary() {
    const dl = $("#summary"); if (!dl) return;
    const a = state.answers, n = state.notes, groups = {};
    const isDefaultHeaders = (k) => { const m = k.match(/^M2\.(\w+)\.headers$/); if (!m) return false; const c = M2.find((x) => x.s === m[1]); return c && JSON.stringify(c.cols) === JSON.stringify(a[k]) && !a[`M2.${m[1]}.locked`]; };
    Object.keys(a).sort().filter((k) => !isDefaultHeaders(k)).forEach((k) => { const g = k.split(".")[0]; (groups[g] = groups[g] || []).push(`${k.split(".").slice(1).join(" ") || k}: ${Array.isArray(a[k]) ? a[k].join(", ") : a[k] === true ? "✓" : a[k]}`); });
    Object.keys(n).sort().forEach((k) => { if (n[k]) { const g = k.split(".")[0]; (groups[g] = groups[g] || []).push(`note: ${n[k]}`); } });
    const NAMES = { J1: "Journey · 1 Templates", J2: "Journey · 2 Rules", R: "Planning rules (founder)", T: "Your take", S: "Getting started", M2: "Templates (columns)", wrap: "Other" };
    dl.innerHTML = Object.keys(groups).sort().map((g) => `<dt>${NAMES[g] || g}</dt>${groups[g].map((x) => `<dd>${esc(x)}</dd>`).join("")}`).join("") || '<dd class="muted">nothing ticked yet</dd>';
  }
  $$(".msg button").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("pre", b.parentElement).innerText); b.textContent = "copied ✓"; } catch (e) { b.textContent = "select & copy"; }
    setTimeout(() => (b.textContent = "copy message"), 1800);
  }));
  $("#dl").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "suraah-meeting-2026-10-31-shrey.json"; a.click();
  });
  // scroll spy: the current scene is the last one whose top has passed 40% of the viewport
  // (a visibility threshold never fires for scenes taller than the screen, like the journey)
  let spyQueued = false;
  const spy = () => {
    spyQueued = false;
    const line = innerHeight * .4, scenes = $$("section.scene").filter((s) => s.offsetParent);
    let cur = scenes[0];
    scenes.forEach((s) => { if (s.getBoundingClientRect().top <= line) cur = s; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = scenes[scenes.length - 1];
    $$(".nav a").forEach((l) => l.classList.toggle("on", l.getAttribute("href") === "#" + cur.id));
  };
  const queueSpy = () => { if (!spyQueued) { spyQueued = true; requestAnimationFrame(spy); } };
  addEventListener("scroll", queueSpy, { passive: true });
  addEventListener("resize", queueSpy);
  queueSpy();

  // ------------------------------------------------------------------ boot
  (async () => {
    await load();
    renderFigures(); renderReplicas(); renderStrands(); buildParts(); wireChoices(); wireFields(); renderSummary();
    const go = () => requestAnimationFrame(drawAll);
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(go);
    let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(go, 200); });
    window.addEventListener("load", go);
  })();
})();
