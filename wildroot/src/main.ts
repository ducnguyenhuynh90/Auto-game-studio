// WILDROOT game flow: plan (drag cards onto islands) → run (5 years play out) → result (stars,
// strategies, discovery cards) → review (scrub, tap a goal chip to ask Why?).
import { ACTIONS, LEVELS, checkGoals, cost, simulate, type ActionId, type Run, type Snapshot } from './sim';
import { DISCOVERIES, events, newDiscoveries, why, type GameEvent, type Subject } from './explain';
import { minimalWinners, solve } from './solver';
import { World3D, type DioramaView } from './game/scene';
import { isMuted, setMuted, sfx, unlock } from './game/audio';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const END = 20;

// ---------- telemetry (kept local in the prototype) ----------
const tlog: Record<string, unknown>[] = [];
(window as unknown as { __wildroot: unknown }).__wildroot = tlog;
const track = (e: string, p: Record<string, unknown> = {}) => tlog.push({ e, at: Date.now(), ...p });

// ---------- storage ----------
const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem('wildroot2.' + k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem('wildroot2.' + k, JSON.stringify(v)); } catch { /* unavailable */ } },
};

// ---------- card + goal presentation ----------
const CARD: Record<ActionId, { icon: string; name: string; hint: string }> = {
  reeds: { icon: '🌾', name: 'Bờ cỏ nước', hint: 'Bờ thoải có cỏ nước: nòng nọc có chỗ trốn' },
  removeFish: { icon: '🎣', name: 'Bắt bớt cá', hint: 'Mỗi xuân bắt bớt gần nửa số cá' },
  addFrogs: { icon: '🐸', name: 'Thả ếch', hint: 'Thả thêm 25 con ếch' },
  feedFish: { icon: '🍞', name: 'Cho cá ăn', hint: 'Cá nhiều hơn, nước giàu dinh dưỡng hơn' },
  shade: { icon: '🌳', name: 'Cây bóng mát', hint: 'Cây ven bờ che nắng cho ao' },
  logs: { icon: '🪵', name: 'Gỗ mục', hint: 'Chỗ trú đông cho ếch' },
};
const GOALS: { key: 'frogsMin' | 'clarityMin' | 'mosquitoMax' | 'fishMin'; subject: Subject; icon: string }[] = [
  { key: 'frogsMin', subject: 'frogs', icon: '🐸' },
  { key: 'clarityMin', subject: 'clarity', icon: '💧' },
  { key: 'mosquitoMax', subject: 'mosquito', icon: '🦟' },
  { key: 'fishMin', subject: 'fish', icon: '🐟' },
];
const SUBJECT_ICON: Record<Subject, string> = { frogs: '🐸', fish: '🐟', mosquito: '🦟', dragonflies: '🪰', plants: '🌿', clarity: '💧' };
const SEASON_ICON = ['🌸', '☀️', '🍂', '❄️'];
const CAUSE_ICON: [RegExp, string][] = [
  [/cá ăn|bị cá|Cá ăn/, '🐟'], [/oxy|Tảo che/, '🟢'], [/khô/, '🏜️'], [/rét|đông/, '❄️'], [/côn trùng|mồi/, '🦟'],
  [/nước sâu|Chỗ ở/, '🌊'], [/người bắt/, '🎣'], [/cho ăn|Thức ăn/, '🍞'], [/chuồn/, '🪰'], [/Ếch ăn/, '🐸'],
  [/cây nước|chỗ mọc|đẻ trứng/, '🌿'], [/Bóng cây/, '🌳'], [/mưa/, '🌧️'], [/Chất thải/, '💩'], [/kín chỗ/, '📦'],
];
const causeIcon = (label: string) => CAUSE_ICON.find(([re]) => re.test(label))?.[1] ?? '•';

// ---------- state ----------
type Phase = 'plan' | 'run' | 'review';
interface World { actions: ActionId[]; run: Run; appear: Record<ActionId, number> }
const zeroAppear = () => Object.fromEntries(ACTIONS.map((a) => [a.id, 0])) as Record<ActionId, number>;
const SEED = 1;

const progress = {
  stars: store.get<number[]>('stars', LEVELS.map(() => 0)),
  strategies: store.get<Record<string, string[]>>('strategies', {}),
  known: new Set(store.get<string[]>('known', [])),
  unseen: store.get<number>('unseen', 0),
  tutorial: store.get<number>('tutorial', 0),
};
const save = () => {
  store.set('stars', progress.stars);
  store.set('strategies', progress.strategies);
  store.set('known', [...progress.known]);
  store.set('unseen', progress.unseen);
  store.set('tutorial', progress.tutorial);
};

const state = {
  level: Math.min(LEVELS.length - 1, store.get<number>('level', 0)),
  worlds: [] as World[],
  phase: 'plan' as Phase,
  t: 0,
  speed: 1,
  paused: false,
  selected: null as ActionId | null,
  winners: [] as ActionId[][],
  firedEvents: new Set<string>(),
  ev: [[], []] as GameEvent[][],
};
const level = () => LEVELS[state.level];

// ---------- 3D ----------
const world3d = new World3D($<HTMLCanvasElement>('#world'));

function loadLevel(i: number) {
  state.level = i;
  store.set('level', i);
  state.worlds = [0, 1].map(() => ({ actions: [], run: simulate(LEVELS[i], SEED, []), appear: zeroAppear() }));
  state.winners = minimalWinners(solve(LEVELS[i], 30)).map((r) => r.actions);
  toPlan();
  renderTop();
  track('level_selected', { level: LEVELS[i].id });
}

function resim(wi: number) {
  const w = state.worlds[wi];
  w.run = simulate(level(), SEED, w.actions);
}

// ---------- interpolated snapshot ----------
function snapAt(wi: number, t: number): Snapshot {
  const snaps = state.worlds[wi].run.snaps;
  const a = snaps[Math.floor(t)], b = snaps[Math.min(END, Math.ceil(t))];
  const k = t - Math.floor(t);
  if (!b || k === 0) return a;
  const out = { ...a } as Record<string, number>;
  for (const key of Object.keys(a)) {
    const va = (a as unknown as Record<string, number>)[key], vb = (b as unknown as Record<string, number>)[key];
    if (typeof va === 'number') out[key] = va + (vb - va) * k;
  }
  return out as unknown as Snapshot;
}

// ---------- HUD: top ----------
function renderTop() {
  const L = level();
  $('#levelBtn').innerHTML = `${state.level === 0 ? '🐸' : '🏜️'} Màn ${state.level + 1} <small>${'★'.repeat(progress.stars[state.level])}${'☆'.repeat(3 - progress.stars[state.level])}</small>`;
  const g = L.goal;
  $('#goalbar').innerHTML = `<span>🐸≥${g.frogsMin}</span><span>💧≥${g.clarityMin * 100}%</span><span>🦟≤${g.mosquitoMax}</span><span>🐟≥${g.fishMin}</span>`;
  const badge = $('#bookBadge');
  badge.hidden = progress.unseen === 0;
  badge.textContent = String(progress.unseen);
  $('#muteBtn').textContent = isMuted() ? '🔇' : '🔊';
}

// ---------- HUD: island tags + goal chips ----------
const tagsEl = $('#tags');
function buildTags() {
  tagsEl.innerHTML = [0, 1].map((wi) => `
    <div class="tag" data-w="${wi}"><span class="id">${wi ? 'B' : 'A'}</span><span class="pips"></span><span class="applied"></span></div>
    <div class="chips" data-w="${wi}">${GOALS.map((g) => `<button class="chip" data-chip="${g.subject}" data-w="${wi}"><span class="ic">${g.icon}</span><span class="v"></span></button>`).join('')}</div>`).join('');
}
function renderTags() {
  const L = level();
  state.worlds.forEach((w, wi) => {
    const tag = tagsEl.querySelector(`.tag[data-w="${wi}"]`)!;
    const used = cost(w.actions);
    tag.querySelector('.pips')!.innerHTML = Array.from({ length: L.budget }, (_, k) => `<i class="${k < used ? 'used' : ''}"></i>`).join('');
    tag.querySelector('.applied')!.innerHTML = w.actions
      .map((a) => `<button data-remove="${a}" data-w="${wi}" aria-label="Bỏ ${CARD[a].name}" ${state.phase !== 'plan' ? 'disabled' : ''}>${CARD[a].icon}</button>`)
      .join('');
  });
  renderChips();
}
function renderChips() {
  const L = level();
  const live = state.phase !== 'plan';
  state.worlds.forEach((_, wi) => {
    const s = snapAt(wi, live ? state.t : 0);
    const checks = checkGoals(L, s);
    tagsEl.querySelectorAll<HTMLElement>(`.chips[data-w="${wi}"] .chip`).forEach((el, k) => {
      const c = checks[k];
      el.querySelector('.v')!.textContent = c.value;
      el.classList.toggle('ok', live && c.ok);
      el.classList.toggle('no', live && !c.ok);
    });
  });
}
function placeTags() {
  [0, 1].forEach((wi) => {
    const top = world3d.toScreen(wi, -8, 0.4, -8);
    const bottom = world3d.toScreen(wi, 8, -2.4, 8);
    const tag = tagsEl.querySelector<HTMLElement>(`.tag[data-w="${wi}"]`);
    const chips = tagsEl.querySelector<HTMLElement>(`.chips[data-w="${wi}"]`);
    if (tag) { tag.style.left = `${top.x}px`; tag.style.top = `${top.y - 6}px`; }
    if (chips) { chips.style.left = `${bottom.x}px`; chips.style.top = `${bottom.y + 6}px`; }
  });
}

// ---------- HUD: cards ----------
function renderCards() {
  $('#cards').innerHTML = ACTIONS.map((a) => `
    <button class="card ${state.selected === a.id ? 'sel' : ''}" data-card="${a.id}" aria-label="${CARD[a.id].name}, ${a.cost} điểm">
      <span class="ic">${CARD[a.id].icon}</span><span class="nm">${CARD[a.id].name}</span>
      <span class="cost">${'<i></i>'.repeat(a.cost)}</span></button>`).join('');
}

let hintTimer = 0;
function hint(text: string | null, sticky = false) {
  const el = $('#hint');
  clearTimeout(hintTimer);
  if (!text) { el.hidden = true; return; }
  el.textContent = text;
  el.hidden = false;
  if (!sticky) hintTimer = window.setTimeout(() => (el.hidden = true), 2600);
}

function applyCard(wi: number, id: ActionId) {
  const w = state.worlds[wi];
  const tag = tagsEl.querySelector<HTMLElement>(`.tag[data-w="${wi}"]`)!;
  if (w.actions.includes(id)) { sfx.deny(); hint('Đảo này đã có thẻ đó'); return; }
  if (cost([...w.actions, id]) > level().budget) {
    sfx.deny();
    tag.classList.remove('shake'); void tag.offsetWidth; tag.classList.add('shake');
    hint('Hết điểm. Chạm vào biểu tượng trên đảo để bỏ bớt');
    return;
  }
  w.actions = [...w.actions, id];
  resim(wi);
  sfx.place();
  const p = world3d.toScreen(wi, 0, 0.5, 0);
  pop(p.x, p.y, CARD[id].icon, 'good');
  state.selected = null;
  renderCards();
  renderTags();
  track('intervention_applied', { world: wi, action: id });
  tutorialAdvance('placed');
}
function removeCard(wi: number, id: ActionId) {
  const w = state.worlds[wi];
  w.actions = w.actions.filter((a) => a !== id);
  resim(wi);
  sfx.remove();
  renderTags();
  track('intervention_removed', { world: wi, action: id });
}

// drag & drop (or tap card → tap island)
let drag: { id: ActionId; x0: number; y0: number; ghost?: HTMLElement; card: HTMLElement } | null = null;
const dropEl = $('#drop');
$('#cards').addEventListener('pointerdown', (e) => {
  const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
  if (!card || state.phase !== 'plan') return;
  unlock();
  drag = { id: card.dataset.card as ActionId, x0: e.clientX, y0: e.clientY, card };
  card.setPointerCapture(e.pointerId);
});
$('#cards').addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.ghost && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 10) {
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'ghost';
    drag.ghost.textContent = CARD[drag.id].icon;
    document.body.appendChild(drag.ghost);
    drag.card.classList.add('dragging');
    sfx.pick();
    hint(CARD[drag.id].hint);
  }
  if (drag.ghost) {
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
    const wi = world3d.pick(e.clientX, e.clientY);
    dropEl.classList.toggle('on', wi >= 0);
    if (wi >= 0) { const c = world3d.toScreen(wi, 0, 0, 0); dropEl.style.left = `${c.x}px`; dropEl.style.top = `${c.y}px`; }
  }
});
const endDrag = (e: PointerEvent) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  dropEl.classList.remove('on');
  d.card.classList.remove('dragging');
  if (d.ghost) {
    d.ghost.remove();
    const wi = world3d.pick(e.clientX, e.clientY);
    if (wi >= 0 && e.type === 'pointerup') applyCard(wi, d.id);
  } else if (e.type === 'pointerup') {
    state.selected = state.selected === d.id ? null : d.id;
    if (state.selected) { sfx.pick(); hint(`${CARD[d.id].hint}. Chạm một đảo để đặt`, true); } else hint(null);
    renderCards();
  }
};
$('#cards').addEventListener('pointerup', endDrag);
$('#cards').addEventListener('pointercancel', endDrag);

// tap on an island: place the selected card
const canvas = $<HTMLCanvasElement>('#world');
canvas.addEventListener('pointerup', (e) => {
  unlock();
  const wi = world3d.pick(e.clientX, e.clientY);
  if (wi < 0) return;
  if (state.phase === 'plan' && state.selected) { applyCard(wi, state.selected); hint(null); }
});

// ---------- run / timeline ----------
function toPlan() {
  state.phase = 'plan';
  state.t = 0;
  state.selected = null;
  $('#tray').hidden = false;
  $('#timebar').hidden = true;
  renderCards();
  buildTags();
  renderTags();
  hint(null);
  tutorialShow();
}
function startRun() {
  if (state.phase !== 'plan') return;
  unlock();
  sfx.play();
  state.phase = 'run';
  state.t = 0;
  state.paused = false;
  state.firedEvents.clear();
  state.ev = state.worlds.map((w) => events(w.run));
  $('#tray').hidden = true;
  $('#timebar').hidden = false;
  $<HTMLInputElement>('#scrub').disabled = true;
  renderTags();
  renderTime();
  track('simulation_advanced', { level: level().id, a: state.worlds[0].actions, b: state.worlds[1].actions });
  if (state.worlds[0].actions.join() !== state.worlds[1].actions.join()) track('world_forked');
  tutorialAdvance('run');
}
function renderTime() {
  const t = state.t;
  const yi = Math.min(4, Math.floor(Math.min(t, END - 0.001) / 4));
  $('#when').textContent = `Năm ${yi + 1}`;
  $('#season').textContent = SEASON_ICON[Math.floor(Math.min(t, END - 0.001)) % 4];
  $('#years').innerHTML = Array.from({ length: 5 }, (_, y) => `<div class="yr"><i style="width:${Math.max(0, Math.min(1, (t - y * 4) / 4)) * 100}%"></i></div>`).join('');
  $<HTMLInputElement>('#scrub').value = String(t);
  $('#pause').textContent = state.phase === 'run' && !state.paused ? '❚❚' : '▶';
  $('#fast').classList.toggle('on', state.speed > 1);
}

function fireEvents(prevT: number, t: number) {
  state.ev.forEach((list, wi) => {
    for (const e of list) {
      const key = `${wi}:${e.t}:${e.text}`;
      if (e.t > prevT && e.t <= t && !state.firedEvents.has(key) && e.icon) {
        state.firedEvents.add(key);
        const p = world3d.toScreen(wi, (Math.random() - 0.5) * 4, 1.5, (Math.random() - 0.5) * 4);
        pop(p.x, p.y, `${e.icon} ${e.short}`.trim(), e.tone === 'bad' ? 'bad' : 'good');
        if (e.icon === '🐸' && e.tone === 'good') sfx.ribbit(); else if (e.tone === 'bad') sfx.bad(); else sfx.good();
        track('ecosystem_event_triggered', { world: wi, text: e.text });
      }
    }
  });
}

function pop(x: number, y: number, text: string, tone: 'good' | 'bad') {
  const el = document.createElement('div');
  el.className = `pop ${tone}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

function finishRun() {
  state.phase = 'review';
  state.t = END;
  $<HTMLInputElement>('#scrub').disabled = false;
  renderTime();
  renderTags();
  showResult();
}

// ---------- result ----------
function starsFor(run: Run) {
  const c = checkGoals(level(), run.snaps[END]);
  return [c[0].ok, c[1].ok, c[2].ok && c[3].ok];
}
function showResult() {
  const L = level();
  const found = (progress.strategies[L.id] ??= []);
  const fresh: string[] = [];
  const res = state.worlds.map((w, wi) => {
    const stars = starsFor(w.run);
    const won = stars.every(Boolean);
    let newStrat = false;
    if (won) {
      const match = state.winners.find((m) => m.every((a) => w.actions.includes(a)));
      const key = (match ?? w.actions).slice().sort().join('+');
      if (!found.includes(key)) { found.push(key); newStrat = true; }
    }
    progress.stars[state.level] = Math.max(progress.stars[state.level], stars.filter(Boolean).length);
    for (const d of newDiscoveries(w.run, progress.known)) { progress.known.add(d.id); fresh.push(d.id); progress.unseen++; track('discovery_unlocked', { id: d.id, world: wi }); }
    return { stars, won, newStrat };
  });
  save();
  renderTop();
  const total = Math.max(state.winners.length, found.length);
  const anyWin = res.some((r) => r.won);
  track('challenge_result', { level: L.id, a: state.worlds[0].actions, b: state.worlds[1].actions, won: res.map((r) => r.won) });
  if (anyWin) track('challenge_completed', { level: L.id });
  const next = state.level + 1 < LEVELS.length && progress.stars[state.level] >= 3;
  openSheet(`
    <h2>${anyWin ? (res.every((r) => r.won) ? 'Cả hai ao đều hồi sinh!' : 'Một ao đã hồi sinh!') : 'Ếch vẫn chưa trở lại'}</h2>
    <div class="res">${res.map((r, wi) => `
      <div><span class="id" style="color:var(${wi ? '--b' : '--a'})">Đảo ${wi ? 'B' : 'A'}</span>
        <span class="stars">${r.stars.map((s, k) => `<span class="${s ? '' : 'off'}" style="animation-delay:${0.2 + k * 0.18 + wi * 0.55}s">⭐</span>`).join('')}</span>
        <span>${state.worlds[wi].actions.map((a) => CARD[a].icon).join(' ') || '—'}</span>
        ${r.newStrat ? '<span style="color:var(--good)">Cách thắng mới!</span>' : ''}</div>`).join('')}</div>
    <div class="sub" style="text-align:center">⭐ ếch · ⭐ nước trong · ⭐ ao cân bằng</div>
    <div class="strats">Cách thắng đã tìm: ${Array.from({ length: total }, (_, k) => `<i class="${k < found.length ? 'found' : ''}">${k < found.length ? '★' : '?'}</i>`).join('')}</div>
    ${fresh.length ? `<div class="sub">Khám phá mới. Chạm để lật thẻ</div><div class="dcards">${fresh.map((id) => discoveryCard(id, true)).join('')}</div>` : ''}
    <div class="row">
      <button class="btn" data-do="review">🔍 Xem lại</button>
      <button class="btn ${next ? '' : 'primary'}" data-do="retry">🔁 Thử cách khác</button>
      ${next ? '<button class="btn primary" data-do="next">Màn tiếp ➜</button>' : ''}
    </div>`);
  res.forEach((r, wi) => r.stars.forEach((s, k) => s && setTimeout(() => sfx.star(k), (200 + k * 180 + wi * 550))));
  if (fresh.length) setTimeout(() => sfx.discover(), 1500);
}

function discoveryCard(id: string, isNew = false) {
  const d = DISCOVERIES.find((x) => x.id === id)!;
  const known = progress.known.has(id);
  if (!known) return `<div class="dcard locked"><div class="in"><div class="f"><span class="ic">${d.icon}</span><b>?</b></div></div></div>`;
  return `<button class="dcard ${isNew ? 'new' : ''}" data-flip aria-label="${d.concept}"><div class="in">
    <div class="f"><span class="ic">${d.icon}</span><b>${d.concept}</b><small>${d.observation}</small></div>
    <div class="bk"><b>Ngoài đời thực</b>${d.reality}</div></div></button>`;
}

// ---------- sheets ----------
function openSheet(html: string, cls = '') {
  const sheet = $('#sheet');
  sheet.className = `sheet ${cls}`;
  $('#sheetBody').innerHTML = html;
  sheet.hidden = false;
}
const closeSheet = () => ($('#sheet').hidden = true);
$('#sheet').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.id === 'sheet') { closeSheet(); afterSheet(); return; }
  const flip = t.closest<HTMLElement>('[data-flip]');
  if (flip) { flip.classList.toggle('flip'); sfx.pick(); return; }
  const lv = t.closest<HTMLElement>('[data-level]');
  if (lv && !(lv as HTMLButtonElement).disabled) { closeSheet(); loadLevel(Number(lv.dataset.level)); return; }
  const act = t.closest<HTMLElement>('[data-do]')?.dataset.do;
  if (act === 'retry') { closeSheet(); toPlan(); track('challenge_retried'); }
  if (act === 'next') { closeSheet(); loadLevel(state.level + 1); }
  if (act === 'review' || act === 'close') { closeSheet(); afterSheet(); }
});
function afterSheet() {
  if (state.phase === 'review' && progress.tutorial === 2) { progress.tutorial = 3; save(); hint('Chạm 🐸 dưới đảo để hỏi: vì sao?', true); tagsEl.querySelectorAll('[data-chip="frogs"]').forEach((c) => c.classList.add('pulse')); }
}

function openBook() {
  progress.unseen = 0;
  save();
  renderTop();
  openSheet(`<h2>Sổ khám phá</h2><div class="sub">${progress.known.size}/${DISCOVERIES.length} khái niệm. Chạm để lật thẻ</div>
    <div class="dcards">${DISCOVERIES.map((d) => discoveryCard(d.id)).join('')}</div>
    <div class="row"><button class="btn primary" data-do="close">Đóng</button></div>`);
  track('journal_opened');
}
function openLevels() {
  openSheet(`<h2>Chọn màn</h2><div class="levels">${LEVELS.map((L, i) => {
    const locked = i > 0 && progress.stars[i - 1] < 3;
    const st = progress.stars[i];
    const found = (progress.strategies[L.id] ?? []).length;
    return `<button class="lvl" data-level="${i}" ${locked ? 'disabled' : ''}><span class="n">${locked ? '🔒' : i + 1}</span>
      <span><span class="t">${L.title}</span><br><span class="s">${'⭐'.repeat(st)}${'☆'.repeat(3 - st)} · ${found} cách thắng</span></span></button>`;
  }).join('')}</div><div class="row"><button class="btn" data-do="close">Đóng</button></div>`);
}

function openWhy(wi: number, subject: Subject) {
  const t = state.phase === 'plan' ? 0 : Math.round(state.t);
  const w = why(state.worlds[wi].run, t, subject);
  const s = snapAt(wi, state.phase === 'plan' ? 0 : state.t);
  const prev = state.worlds[wi].run.snaps[Math.max(0, t - 4)];
  const val = subject === 'clarity' ? s.clarity * 100 : subject === 'plants' ? s.plants * 100 : (s[subject as 'frogs'] as number);
  const pv = subject === 'clarity' ? prev.clarity * 100 : subject === 'plants' ? prev.plants * 100 : (prev[subject as 'frogs'] as number);
  const arrow = val > pv * 1.08 ? '↗' : val < pv * 0.92 ? '↘' : '→';
  const causes = w.causes.slice(0, 3);
  openSheet(`
    <div class="head"><span class="ic">${SUBJECT_ICON[subject]}</span><span class="big">${Math.round(val)}${subject === 'clarity' ? '%' : ''} ${arrow}</span>
      <span class="sub">Đảo ${wi ? 'B' : 'A'} · Năm ${Math.min(5, Math.floor(Math.max(0, t - 1) / 4) + 1)}</span></div>
    <div class="sub">${subject === 'mosquito' ? 'Ai đang ăn muỗi?' : subject === 'clarity' ? 'Điều gì làm nước đục hay trong?' : 'Điều gì đang giới hạn?'}</div>
    ${causes.map((c, k) => `<div class="cause ${k === 0 && subject !== 'mosquito' ? 'lead' : ''}"><span class="ci">${causeIcon(c.label)}</span>
      <span class="lb">${c.label}</span><div class="bar"><i style="width:${Math.round(Math.min(1, c.share) * 100)}%"></i></div><span class="dt">${c.detail}</span></div>`).join('')}
    <div class="row"><button class="btn primary" data-do="close">OK</button></div>`, 'why');
  sfx.pick();
  track('relationship_inspected', { subject, world: wi, t });
  if (progress.tutorial === 3) { progress.tutorial = 4; save(); hint(null); tagsEl.querySelectorAll('.pulse').forEach((c) => c.classList.remove('pulse')); }
}

// ---------- tutorial ----------
let hand: HTMLElement | null = null;
let handAnim = 0;
let started = false;
function tutorialShow() {
  if (!started) return;
  hand?.remove(); hand = null; cancelAnimationFrame(handAnim);
  $('#go').classList.remove('pulse');
  if (state.level !== 0) return;
  if (progress.tutorial === 0) {
    hint('Kéo một thẻ lên đảo', true);
    hand = document.createElement('div');
    hand.className = 'hand';
    hand.textContent = '👆';
    document.body.appendChild(hand);
    const loop = (time: number) => {
      const card = document.querySelector<HTMLElement>('[data-card="reeds"]');
      if (!hand || !card) return;
      const r = card.getBoundingClientRect();
      const to = world3d.toScreen(0, 0, 0, 0);
      const k = reduceMotion ? 0 : ((time / 1600) % 1);
      const e = Math.min(1, k * 1.4);
      const ease = e * e * (3 - 2 * e);
      hand.style.left = `${r.left + r.width / 2 + (to.x - r.left - r.width / 2) * ease}px`;
      hand.style.top = `${r.top + r.height / 2 + (to.y - r.top - r.height / 2) * ease}px`;
      hand.style.opacity = String(k > 0.85 ? (1 - k) / 0.15 : 1);
      handAnim = requestAnimationFrame(loop);
    };
    handAnim = requestAnimationFrame(loop);
  } else if (progress.tutorial === 1) {
    hint('Đặt cách khác cho đảo B, rồi bấm ▶', true);
    $('#go').classList.add('pulse');
  }
}
function tutorialAdvance(what: 'placed' | 'run') {
  if (progress.tutorial === 0 && what === 'placed') { progress.tutorial = 1; save(); tutorialShow(); }
  else if (progress.tutorial === 1 && what === 'run') { progress.tutorial = 2; save(); $('#go').classList.remove('pulse'); hint('Xuân: ếch đẻ trứng. Đảo nào nhiều ếch con hơn?'); }
  else if (what === 'run') hint(null);
}

// ---------- wiring ----------
document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!t) return;
  unlock();
  if (t.dataset.remove && state.phase === 'plan') removeCard(Number(t.dataset.w), t.dataset.remove as ActionId);
  if (t.dataset.chip) openWhy(Number(t.dataset.w), t.dataset.chip as Subject);
});
$('#go').addEventListener('click', startRun);
$('#pause').addEventListener('click', () => {
  if (state.phase === 'run') { state.paused = !state.paused; }
  else if (state.phase === 'review') { state.phase = 'run'; state.t = 0; state.paused = false; state.firedEvents.clear(); $<HTMLInputElement>('#scrub').disabled = true; }
  renderTime();
});
$('#fast').addEventListener('click', () => { state.speed = state.speed > 1 ? 1 : 3; renderTime(); });
$('#edit').addEventListener('click', () => toPlan());
$('#scrub').addEventListener('input', (e) => {
  if (state.phase !== 'review') return;
  state.t = Number((e.target as HTMLInputElement).value);
  renderTime();
  renderChips();
});
$('#scrub').addEventListener('change', () => track('timeline_scrubbed', { t: state.t }));
$('#bookBtn').addEventListener('click', openBook);
$('#levelBtn').addEventListener('click', openLevels);
$('#muteBtn').addEventListener('click', () => { setMuted(!isMuted()); store.set('muted', isMuted()); renderTop(); });
$('#start').addEventListener('click', () => {
  unlock();
  sfx.play();
  $('#titleScreen').hidden = true;
  started = true;
  tutorialShow();
  track('session_started');
});
setMuted(store.get('muted', false));

function layout() {
  const narrow = innerWidth < 520;
  world3d.pad = { top: narrow ? 70 : 80, bottom: narrow ? 220 : 200, side: 12 };
  world3d.resize();
  placeTags();
}
addEventListener('resize', layout);

// ---------- main loop ----------
let last = performance.now();
let lastSeason = -1;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.phase === 'run' && !state.paused) {
    const prev = state.t;
    state.t = Math.min(END, state.t + dt * (reduceMotion ? 4 : 1.6) * state.speed);
    fireEvents(prev, state.t);
    const s = Math.floor(state.t);
    if (s !== lastSeason) { lastSeason = s; sfx.season(); renderChips(); }
    renderTime();
    if (state.t >= END) finishRun();
  }
  for (const w of state.worlds)
    for (const a of ACTIONS) {
      const target = w.actions.includes(a.id) ? 1 : 0;
      w.appear[a.id] += (target - w.appear[a.id]) * Math.min(1, dt * (target ? 3 : 6));
      if (target && w.appear[a.id] > 0.999) w.appear[a.id] = 1;
    }
  const t = state.phase === 'plan' ? 0 : state.t;
  const views: DioramaView[] = state.worlds.map((w, wi) => ({
    map: w.run.map, snap: snapAt(wi, t), seasonF: t, appear: w.appear, dry: level().dry,
  }));
  world3d.render(views, reduceMotion ? 0 : now);
  placeTags();
  requestAnimationFrame(frame);
}

loadLevel(state.level);
layout();
requestAnimationFrame(frame);

// test hook for tools/shots.mjs (screen position of an island centre)
(window as unknown as { __wrTest: unknown }).__wrTest = { center: (wi: number) => world3d.toScreen(wi, 0, 0, 0) };
