// WILDROOT MVP UI: two parallel worlds, one shared timeline.
import { ACTIONS, Cell, LEVELS, SIZE, checkGoals, cost, simulate, type ActionId, type Run, type Snapshot } from './sim';
import { DISCOVERIES, SUBJECTS, events, newDiscoveries, when, why, type Subject } from './explain';

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- telemetry (GDD 18.1; kept local in this prototype) ----------
const log: { e: string; at: number; [k: string]: unknown }[] = [];
(window as unknown as { __wildroot: typeof log }).__wildroot = log;
const track = (e: string, props: Record<string, unknown> = {}) => {
  log.push({ e, at: Date.now(), ...props });
  console.debug('[wildroot]', e, props);
};

// ---------- state ----------
interface World { actions: ActionId[]; run: Run }
const store = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem('wildroot.' + k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem('wildroot.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ }
  },
};

const state = {
  level: 0,
  seed: 1,
  worlds: [] as World[],
  ran: false,
  t: 0,
  playing: false,
  metric: 'frogs' as Subject,
  known: new Set<string>(store.get<string[]>('known', [])),
};

const level = () => LEVELS[state.level];
const resim = () => {
  for (const w of state.worlds) w.run = simulate(level(), state.seed, w.actions);
};
function reset(levelIdx: number) {
  state.level = levelIdx;
  state.worlds = [0, 1].map(() => ({ actions: [], run: simulate(LEVELS[levelIdx], state.seed, []) }));
  state.ran = false;
  state.t = 0;
  stop();
  renderAll();
}

// ---------- header ----------
function renderHeader() {
  const L = level();
  $('#title').textContent = L.title;
  $('#problem').textContent = L.problem;
  const g = L.goal;
  $('#goals').innerHTML =
    `<b>Mục tiêu sau ${L.years} năm:</b> <span>Ếch ≥ ${g.frogsMin}</span><span>Nước trong ≥ ${g.clarityMin * 100}%</span>` +
    `<span>Muỗi ≤ ${g.mosquitoMax}</span><span>Cá ≥ ${g.fishMin}</span><span>Ngân sách ${L.budget} điểm / thế giới</span>`;
  $('#levels').innerHTML = LEVELS.map((l, i) => `<button data-level="${i}" aria-pressed="${i === state.level}">Màn ${i + 1}: ${l.title}</button>`).join('');
  $('#seed').textContent = `Thời tiết #${state.seed} · dùng chung cho cả hai thế giới`;
}

// ---------- worlds ----------
function renderWorld(wi: number) {
  const el = $(`.world[data-w="${wi}"]`);
  const w = state.worlds[wi];
  const L = level();
  const left = L.budget - cost(w.actions);
  if (!el.dataset.built) {
    el.innerHTML = `
      <div class="whead"><h2>Thế giới ${wi ? 'B' : 'A'}<small>cùng ao</small></h2><span class="budget"></span></div>
      <canvas class="pond" width="480" height="480" aria-label="Bản đồ ao, thế giới ${wi ? 'B' : 'A'}"></canvas>
      <div class="actions"></div>
      <div class="status" aria-live="polite"></div>
      <div class="species"><span class="lbl">Vì sao?</span></div>`;
    $('.species', el).insertAdjacentHTML(
      'beforeend',
      SUBJECTS.map((s) => `<button data-why="${s.id}" data-w="${wi}">${s.icon} ${s.name}</button>`).join(''),
    );
    el.dataset.built = '1';
  }
  $('.budget', el).textContent = `còn ${left}/${L.budget} điểm`;
  $('.actions', el).innerHTML = ACTIONS.map((a) => {
    const on = w.actions.includes(a.id);
    const dis = !on && a.cost > left;
    return `<button class="act" data-act="${a.id}" data-w="${wi}" aria-pressed="${on}" ${dis ? 'disabled' : ''} title="${a.hint}">${a.name}<b>${a.cost}đ</b></button>`;
  }).join('');
  renderStatus(wi);
}

function renderStatus(wi: number) {
  const el = $(`.world[data-w="${wi}"] .status`);
  const s = snapAt(wi);
  el.innerHTML = checkGoals(level(), s)
    .map((g) => `<div class="${state.ran ? (g.ok ? 'ok' : 'no') : ''}"><span>${state.ran ? (g.ok ? '✓' : '✗') : '·'} ${g.label}</span><span>${g.value}</span></div>`)
    .join('');
}

const snapAt = (wi: number): Snapshot => state.worlds[wi].run.snaps[state.ran ? state.t : 0];

// ---------- pond drawing ----------
function hash(n: number) {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
function mix(c1: string, c2: string, k: number) {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
}

let palette: Record<string, string> = {};
const readPalette = () => {
  palette = Object.fromEntries(['land', 'land2', 'deep', 'shallow', 'reed', 'tree', 'log', 'algae', 'mud', 'frog', 'fish', 'dragon', 'mosq'].map((k) => [k, css('--' + k)]));
};

function drawPond(wi: number, time: number) {
  const cv = $<HTMLCanvasElement>(`.world[data-w="${wi}"] canvas`);
  const ctx = cv.getContext('2d')!;
  const run = state.worlds[wi].run;
  const s = snapAt(wi);
  const cs = cv.width / SIZE;
  const P = palette;
  const water = mix(P.deep, P.algae, Math.min(1, s.algae * 1.1));
  const shallowC = mix(mix(P.shallow, P.algae, Math.min(1, s.algae)), P.mud, s.shallowDry);
  const cells: Record<number, number[]> = {};
  run.map.forEach((c, i) => {
    (cells[c] ??= []).push(i);
    const x = (i % SIZE) * cs, y = Math.floor(i / SIZE) * cs;
    ctx.fillStyle =
      c === Cell.Deep ? water : c === Cell.Shallow || c === Cell.Reeds ? shallowC : (i + Math.floor(i / SIZE)) % 2 ? P.land : P.land2;
    ctx.fillRect(x, y, cs + 0.5, cs + 0.5);
  });
  const at = (i: number, jx = 0.5, jy = 0.5) => [((i % SIZE) + jx) * cs, (Math.floor(i / SIZE) + jy) * cs] as const;
  const wob = (k: number) => (reduceMotion ? 0 : Math.sin(time / 600 + k * 1.7) * cs * 0.12);

  // reeds: stems scale with plant cover
  const reedCells = cells[Cell.Reeds] ?? [];
  const fill = s.plantCap > 0 ? Math.min(1, s.plants / Math.max(0.05, s.plantCap)) : 0;
  ctx.strokeStyle = P.reed; ctx.lineWidth = Math.max(1.5, cs * 0.08); ctx.lineCap = 'round';
  reedCells.forEach((i, k) => {
    const stems = Math.round(fill * 4);
    for (let j = 0; j < stems; j++) {
      const [x, y] = at(i, 0.15 + hash(k * 9 + j) * 0.7, 0.85);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + wob(k + j) * 0.5, y - cs * (0.45 + hash(k + j * 3) * 0.35)); ctx.stroke();
    }
  });
  // natural shallow plants (sparse)
  (cells[Cell.Shallow] ?? []).forEach((i, k) => {
    if (hash(i) > s.plants * 4) return;
    const [x, y] = at(i, 0.5, 0.8);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - cs * 0.4); ctx.stroke();
    void k;
  });
  // trees
  (cells[Cell.Tree] ?? []).forEach((i) => {
    const [x, y] = at(i);
    ctx.fillStyle = P.tree; ctx.beginPath(); ctx.arc(x, y, cs * 0.46, 0, Math.PI * 2); ctx.fill();
  });
  // logs
  (cells[Cell.Log] ?? []).forEach((i) => {
    const [x, y] = at(i);
    ctx.fillStyle = P.log; ctx.beginPath(); ctx.roundRect(x - cs * 0.42, y - cs * 0.16, cs * 0.84, cs * 0.32, cs * 0.16); ctx.fill();
  });
  // fish in deep water
  const deep = cells[Cell.Deep] ?? [];
  const nFish = Math.round(s.fish / 3);
  ctx.fillStyle = P.fish;
  for (let k = 0; k < nFish && deep.length; k++) {
    const i = deep[Math.floor(hash(k * 31 + 7) * deep.length)];
    const [x, y] = at(i, 0.2 + hash(k * 5) * 0.6, 0.2 + hash(k * 11) * 0.6);
    const dx = wob(k) * 1.5;
    ctx.beginPath(); ctx.ellipse(x + dx, y, cs * 0.28, cs * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + dx - cs * 0.24, y); ctx.lineTo(x + dx - cs * 0.42, y - cs * 0.12); ctx.lineTo(x + dx - cs * 0.42, y + cs * 0.12); ctx.fill();
  }
  // frogs on the edge (shallow, reeds, near land)
  const edge = run.map.map((c, i) => [c, i] as const).filter(([c, i]) => {
    if (c === Cell.Shallow || c === Cell.Reeds) return true;
    const x = i % SIZE, y = Math.floor(i / SIZE);
    return c !== Cell.Deep && Math.hypot(x + 0.5 - SIZE / 2, (y + 0.5 - SIZE / 2) * 1.15) < 6.2;
  }).map(([, i]) => i);
  const nFrog = Math.round(s.frogs / 3);
  for (let k = 0; k < nFrog && edge.length; k++) {
    const i = edge[Math.floor(hash(k * 17 + 3) * edge.length)];
    const [x, y] = at(i, 0.25 + hash(k * 7) * 0.5, 0.25 + hash(k * 13) * 0.5);
    const hop = reduceMotion ? 0 : Math.max(0, Math.sin(time / 400 + k * 2.3) - 0.85) * cs * 1.2;
    ctx.fillStyle = P.frog; ctx.beginPath(); ctx.arc(x, y - hop, cs * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x - cs * 0.09, y - hop - cs * 0.15, cs * 0.07, 0, Math.PI * 2); ctx.arc(x + cs * 0.09, y - hop - cs * 0.15, cs * 0.07, 0, Math.PI * 2); ctx.fill();
  }
  // dragonflies over plants
  const flyOver = reedCells.length ? reedCells : (cells[Cell.Shallow] ?? []);
  ctx.strokeStyle = P.dragon; ctx.lineWidth = Math.max(1.5, cs * 0.09);
  for (let k = 0; k < Math.round(s.dragonflies / 1.5) && flyOver.length; k++) {
    const i = flyOver[Math.floor(hash(k * 23 + 1) * flyOver.length)];
    const [x0, y0] = at(i, 0.5, 0.2);
    const x = x0 + (reduceMotion ? 0 : Math.sin(time / 500 + k) * cs * 0.8), y = y0 + (reduceMotion ? 0 : Math.cos(time / 700 + k) * cs * 0.4);
    ctx.beginPath(); ctx.moveTo(x - cs * 0.3, y); ctx.lineTo(x + cs * 0.3, y); ctx.moveTo(x - cs * 0.05, y - cs * 0.22); ctx.lineTo(x - cs * 0.05, y + cs * 0.22); ctx.stroke();
  }
  // mosquitoes: specks over water
  const wet = [...deep, ...(cells[Cell.Shallow] ?? []), ...reedCells];
  ctx.fillStyle = P.mosq;
  for (let k = 0; k < Math.round(s.mosquito / 2.5) && wet.length; k++) {
    const i = wet[Math.floor(hash(k * 41 + 9) * wet.length)];
    const [x, y] = at(i, hash(k * 3), hash(k * 19));
    ctx.fillRect(x + wob(k) * 0.6, y + wob(k + 5) * 0.6, Math.max(1.5, cs * 0.08), Math.max(1.5, cs * 0.08));
  }
}

// ---------- chart ----------
const metricOf = (s: Snapshot, m: Subject) =>
  m === 'clarity' ? s.clarity * 100 : m === 'plants' ? s.plants * 100 : (s[m as 'frogs'] as number);

function goalLine(m: Subject): number | null {
  const g = level().goal;
  return m === 'frogs' ? g.frogsMin : m === 'clarity' ? g.clarityMin * 100 : m === 'mosquito' ? g.mosquitoMax : m === 'fish' ? g.fishMin : null;
}

function drawChart() {
  const cv = $<HTMLCanvasElement>('#chart');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const m = state.metric;
  const runs = state.worlds.map((w) => w.run);
  const steps = runs[0].snaps.length - 1;
  const gl = goalLine(m);
  const maxV = Math.max(10, gl ?? 0, ...runs.flatMap((r) => r.snaps.map((s) => metricOf(s, m)))) * 1.1;
  const top = 10, bottom = H - 18, left = 34, right = W - 8;
  const X = (t: number) => left + (t / steps) * (right - left);
  const Y = (v: number) => bottom - (v / maxV) * (bottom - top);
  ctx.font = `11px ${css('--font-data')}`;
  ctx.fillStyle = css('--muted');
  ctx.strokeStyle = css('--line');
  ctx.lineWidth = 1;
  const stepV = maxV > 120 ? 50 : maxV > 60 ? 25 : maxV > 25 ? 10 : 5;
  for (let v = 0; v <= maxV; v += stepV) {
    ctx.beginPath(); ctx.moveTo(left, Y(v)); ctx.lineTo(right, Y(v)); ctx.stroke();
    ctx.fillText(String(v), 2, Y(v) + 4);
  }
  for (let y = 1; y <= 5; y++) ctx.fillText(`N${y}`, X(y * 4) - 14, H - 4);
  if (gl !== null) {
    ctx.setLineDash([4, 4]); ctx.strokeStyle = css('--muted');
    ctx.beginPath(); ctx.moveTo(left, Y(gl)); ctx.lineTo(right, Y(gl)); ctx.stroke(); ctx.setLineDash([]);
  }
  const until = state.ran ? state.t : 0;
  runs.forEach((r, wi) => {
    const col = css(wi ? '--b' : '--a');
    // full future path faint (only after a run; scrubbing reveals the rest)
    ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.18;
    if (state.ran) { ctx.beginPath(); r.snaps.forEach((s, t) => (t ? ctx.lineTo(X(t), Y(metricOf(s, m))) : ctx.moveTo(X(t), Y(metricOf(s, m))))); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    r.snaps.slice(0, until + 1).forEach((s, t) => (t ? ctx.lineTo(X(t), Y(metricOf(s, m))) : ctx.moveTo(X(t), Y(metricOf(s, m)))));
    ctx.stroke();
    const s = r.snaps[until];
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(until), Y(metricOf(s, m)), 4, 0, Math.PI * 2); ctx.fill();
  });
  ctx.strokeStyle = css('--ink'); ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.moveTo(X(until), top); ctx.lineTo(X(until), bottom); ctx.stroke(); ctx.globalAlpha = 1;
}

function renderMetrics() {
  $('#metrics').innerHTML = SUBJECTS.map((s) => `<button data-metric="${s.id}" aria-pressed="${s.id === state.metric}">${s.icon} ${s.name}</button>`).join('');
}

// ---------- timeline ----------
function renderTime() {
  const scrub = $<HTMLInputElement>('#scrub');
  scrub.disabled = !state.ran;
  scrub.value = String(state.t);
  $('#when').textContent = state.ran ? when(state.t) : 'Bắt đầu';
  const play = $<HTMLButtonElement>('#play');
  play.disabled = !state.ran;
  play.textContent = state.playing ? 'Dừng' : state.t >= 20 ? 'Xem lại' : 'Tiếp tục';
  $('#run').textContent = state.ran ? 'Chạy lại 5 năm' : 'Chạy 5 năm';
  state.worlds.forEach((_, i) => renderStatus(i));
  renderLog();
  drawChart();
}

let playTimer = 0;
function play() {
  stop();
  if (state.t >= 20) state.t = 0;
  state.playing = true;
  const tick = () => {
    if (state.t >= 20) { stop(); onReachedEnd(); return; }
    state.t++;
    renderTime();
    playTimer = window.setTimeout(tick, reduceMotion ? 120 : 280);
  };
  playTimer = window.setTimeout(tick, 200);
  renderTime();
}
function stop() {
  clearTimeout(playTimer);
  state.playing = false;
}

// ---------- event log & journal ----------
function renderLog() {
  const el = $('#log');
  if (!state.ran) {
    el.innerHTML = '<li class="past"><time>—</time><span class="empty">Chạy 5 năm để xem diễn biến.</span></li>';
    return;
  }
  const items = state.worlds.flatMap((w, wi) => events(w.run).map((e) => ({ ...e, wi })));
  items.sort((a, b) => a.t - b.t || a.wi - b.wi);
  el.innerHTML = items
    .map((e) => `<li class="${e.t <= state.t ? 'past' : ''}"><time>${when(e.t)}</time><span class="${e.tone}"><span class="${e.wi ? 'B' : 'A'}">${e.wi ? 'B' : 'A'}</span> ${e.text}</span></li>`)
    .join('');
}

function renderJournal() {
  const found = DISCOVERIES.filter((d) => state.known.has(d.id));
  $('#jcount').textContent = `${found.length}/${DISCOVERIES.length}`;
  const ev = store.get<Record<string, string>>('evidence', {});
  $('#journal').innerHTML = found.length
    ? found.map((d) => `<div class="disc"><span class="k">Khái niệm</span><h3>${d.concept}</h3><p>${d.observation}</p>
        <p><b>Bằng chứng:</b> ${ev[d.id] ?? ''}</p><p><b>Thử tiếp:</b> ${d.tryNext}</p><p class="real">Ngoài đời thực: ${d.reality}</p></div>`).join('')
    : '<p class="empty">Chưa có khám phá nào. Thử nghiệm để mở khóa.</p>';
}

let toastTimer = 0;
function toast(msg: string) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 3200);
}

function onReachedEnd() {
  const ev = store.get<Record<string, string>>('evidence', {});
  const fresh: string[] = [];
  state.worlds.forEach((w, wi) => {
    for (const d of newDiscoveries(w.run, state.known)) {
      state.known.add(d.id);
      ev[d.id] = `${d.evidence(w.run)} (thế giới ${wi ? 'B' : 'A'}: ${w.actions.length ? w.actions.map((a) => ACTIONS.find((x) => x.id === a)!.name).join(' + ') : 'không can thiệp'})`;
      fresh.push(d.concept);
      track('discovery_unlocked', { id: d.id, world: wi });
    }
  });
  store.set('known', [...state.known]);
  store.set('evidence', ev);
  renderJournal();
  const results = state.worlds.map((w) => checkGoals(level(), w.run.snaps[w.run.snaps.length - 1]).every((g) => g.ok));
  track('challenge_result', { level: level().id, seed: state.seed, a: state.worlds[0].actions, b: state.worlds[1].actions, results });
  if (results.some(Boolean)) track('challenge_completed', { level: level().id });
  const winText = results[0] && results[1] ? 'Cả hai thế giới đều đạt mục tiêu.' : results[0] ? 'Thế giới A đạt mục tiêu.' : results[1] ? 'Thế giới B đạt mục tiêu.' : 'Chưa thế giới nào đạt mục tiêu.';
  toast(fresh.length ? `${winText} Khám phá mới: ${fresh.join(', ')}` : winText);
}

// ---------- why dialog ----------
function openWhy(wi: number, subject: Subject) {
  stop();
  const w = state.worlds[wi];
  const i = state.ran ? state.t : 0;
  const res = why(w.run, i, subject);
  const sub = SUBJECTS.find((s) => s.id === subject)!;
  $('#whyWhere').textContent = `Thế giới ${wi ? 'B' : 'A'} · ${when(i)}`;
  $('#whyTitle').textContent = `${sub.icon} ${sub.name}: vì sao?`;
  $('#whyHead').textContent = res.headline;
  $('#whyCauses').innerHTML = res.causes.length
    ? res.causes.map((c, k) => `<div class="cause"><span>${k === 0 ? '<b>' + c.label + '</b>' : c.label}</span>
        <div class="bar"><i style="width:${Math.round(Math.min(1, c.share) * 100)}%"></i></div><small>${c.detail}</small></div>`).join('')
    : '<p class="empty">Không có yếu tố nào đáng kể.</p>';
  $<HTMLDialogElement>('#whyDlg').showModal();
  track('relationship_inspected', { subject, world: wi, t: i });
}

// ---------- wiring ----------
function renderAll() {
  readPalette();
  renderHeader();
  renderMetrics();
  state.worlds.forEach((_, i) => renderWorld(i));
  renderTime();
  renderJournal();
}

document.addEventListener('click', (ev) => {
  const t = (ev.target as HTMLElement).closest('button');
  if (!t) return;
  if (t.dataset.level) { reset(Number(t.dataset.level)); track('level_selected', { level: level().id }); return; }
  if (t.dataset.act) {
    const wi = Number(t.dataset.w);
    const w = state.worlds[wi];
    const id = t.dataset.act as ActionId;
    w.actions = w.actions.includes(id) ? w.actions.filter((a) => a !== id) : [...w.actions, id];
    resim();
    state.ran = false; state.t = 0; stop();
    renderWorld(wi);
    renderTime();
    track('intervention_selected', { world: wi, action: id, on: w.actions.includes(id) });
    return;
  }
  if (t.dataset.why) { openWhy(Number(t.dataset.w), t.dataset.why as Subject); return; }
  if (t.dataset.metric) { state.metric = t.dataset.metric as Subject; renderMetrics(); drawChart(); return; }
});

$('#run').addEventListener('click', () => {
  resim();
  state.ran = true; state.t = 0;
  track('simulation_advanced', { level: level().id, seed: state.seed, a: state.worlds[0].actions, b: state.worlds[1].actions });
  if (state.worlds[0].actions.join() !== state.worlds[1].actions.join()) track('world_forked', {});
  play();
});
$('#play').addEventListener('click', () => (state.playing ? (stop(), renderTime()) : play()));
$('#scrub').addEventListener('input', (e) => {
  stop();
  state.t = Number((e.target as HTMLInputElement).value);
  renderTime();
  if (state.t >= 20) onReachedEnd();
});
$('#scrub').addEventListener('change', () => track('timeline_scrubbed', { t: state.t }));
$('#reseed').addEventListener('click', () => {
  state.seed = (state.seed % 999) + 1 + Math.floor(Math.random() * 50);
  resim();
  state.ran = false; state.t = 0; stop();
  renderHeader();
  renderTime();
  track('seed_changed', { seed: state.seed });
});
$('#whyClose').addEventListener('click', () => $<HTMLDialogElement>('#whyDlg').close());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readPalette(); drawChart(); });
new MutationObserver(() => { readPalette(); drawChart(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
addEventListener('resize', () => drawChart());

function frame(time: number) {
  if (!document.hidden) { drawPond(0, time); drawPond(1, time); }
  if (reduceMotion) setTimeout(() => requestAnimationFrame(frame), 250);
  else requestAnimationFrame(frame);
}

track('session_started', {});
reset(0);
requestAnimationFrame(frame);
