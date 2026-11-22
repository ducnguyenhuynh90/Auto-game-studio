// WILDROOT game flow on one island: lesson intro → plan (drag cards) → run (seasons play out)
// → result (stars, takeaway, hint on failure) → review (scrub, tap a goal chip to ask Why?).
// Six short lessons each add one card and one idea before the two open challenges.
import { ACTIONS, LEVELS, checkGoals, cost, simulate, type ActionId, type GoalKey, type Level, type Run, type Snapshot } from './sim';
import { DISCOVERIES, events, newDiscoveries, why, type GameEvent, type Subject } from './explain';
import { minimalWinners, solve } from './solver';
import { World3D, type DioramaView } from './game/scene';
import { isMuted, setMuted, sfx, unlock } from './game/audio';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- telemetry (kept local in the prototype) ----------
const tlog: Record<string, unknown>[] = [];
(window as unknown as { __wildroot: unknown }).__wildroot = tlog;
const track = (e: string, p: Record<string, unknown> = {}) => tlog.push({ e, at: Date.now(), ...p });

// ---------- storage ----------
const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem('wildroot3.' + k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem('wildroot3.' + k, JSON.stringify(v)); } catch { /* unavailable */ } },
};

// ---------- presentation data ----------
const CARD: Record<ActionId, { icon: string; name: string; hint: string }> = {
  reeds: { icon: '🌾', name: 'Bờ cỏ nước', hint: 'Bờ thoải có cỏ nước: nòng nọc có chỗ trốn' },
  removeFish: { icon: '🎣', name: 'Bắt bớt cá', hint: 'Mỗi xuân bắt bớt gần nửa số cá' },
  addFrogs: { icon: '🐸', name: 'Thả ếch', hint: 'Thả thêm 25 con ếch' },
  feedFish: { icon: '🍞', name: 'Cho cá ăn', hint: 'Cá nhiều hơn, nước giàu dinh dưỡng hơn' },
  shade: { icon: '🌳', name: 'Cây bóng mát', hint: 'Cây ven bờ che nắng cho ao' },
  logs: { icon: '🪵', name: 'Gỗ mục', hint: 'Chỗ trú đông cho ếch' },
};
const GOAL_UI: Record<GoalKey, { subject: Subject; icon: string; text: (L: Level) => string }> = {
  frogsMin: { subject: 'frogs', icon: '🐸', text: (L) => `≥${L.goal.frogsMin}` },
  clarityMin: { subject: 'clarity', icon: '💧', text: (L) => `≥${Math.round(L.goal.clarityMin * 100)}%` },
  mosquitoMax: { subject: 'mosquito', icon: '🦟', text: (L) => `≤${L.goal.mosquitoMax}` },
  fishMin: { subject: 'fish', icon: '🐟', text: (L) => `≥${L.goal.fishMin}` },
};
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
const zeroAppear = () => Object.fromEntries(ACTIONS.map((a) => [a.id, 0])) as Record<ActionId, number>;
const SEED = 1;

const progress = {
  stars: store.get<Record<string, number>>('stars', {}),
  strategies: store.get<Record<string, string[]>>('strategies', {}),
  known: new Set(store.get<string[]>('known', [])),
  unseen: store.get<number>('unseen', 0),
};
const save = () => {
  store.set('stars', progress.stars);
  store.set('strategies', progress.strategies);
  store.set('known', [...progress.known]);
  store.set('unseen', progress.unseen);
};
const cleared = (i: number) => (progress.stars[LEVELS[i].id] ?? 0) > 0;
const unlocked = (i: number) => i === 0 || cleared(i - 1);
const firstOpen = () => { const i = LEVELS.findIndex((_, k) => !cleared(k)); return i < 0 ? LEVELS.length - 1 : i; };

const state = {
  level: 0,
  actions: [] as ActionId[],
  run: null as unknown as Run,
  appear: zeroAppear(),
  phase: 'plan' as Phase,
  t: 0,
  speed: 1,
  paused: false,
  selected: null as ActionId | null,
  winners: [] as ActionId[][],
  firedEvents: new Set<string>(),
  ev: [] as GameEvent[],
  placedThisLevel: false,
  askedWhy: false,
};
const level = () => LEVELS[state.level];
const END = () => level().years * 4;

// ---------- 3D ----------
const world3d = new World3D($<HTMLCanvasElement>('#world'));

function loadLevel(i: number, intro = true) {
  state.level = i;
  state.actions = [];
  state.appear = zeroAppear();
  state.placedThisLevel = false;
  state.askedWhy = false;
  state.run = simulate(LEVELS[i], SEED, []);
  state.winners = LEVELS[i].kind === 'challenge' ? minimalWinners(solve(LEVELS[i], 30)).map((r) => r.actions) : [];
  toPlan();
  renderTop();
  track('level_selected', { level: LEVELS[i].id });
  if (intro) showIntro();
}
const resim = () => { state.run = simulate(level(), SEED, state.actions); };

// ---------- interpolated snapshot ----------
function snapAt(t: number): Snapshot {
  const snaps = state.run.snaps;
  const a = snaps[Math.floor(t)], b = snaps[Math.min(END(), Math.ceil(t))];
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
function levelLabel(i: number) {
  const L = LEVELS[i];
  const lessons = LEVELS.filter((l) => l.kind === 'lesson').length;
  return L.kind === 'lesson' ? `Bài ${i + 1}/${lessons}` : `Thử thách ${i - lessons + 1}`;
}
function renderTop() {
  const L = level();
  const st = progress.stars[L.id] ?? 0;
  $('#levelBtn').innerHTML = `${L.icon} ${levelLabel(state.level)} <small>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</small>`;
  const goals = $('#goalbar');
  goals.hidden = L.checks.length === 0;
  goals.innerHTML = `<span class="gl">Mục tiêu</span>` + L.checks.map((k) => `<span>${GOAL_UI[k].icon}${GOAL_UI[k].text(L)}</span>`).join('');
  const badge = $('#bookBadge');
  badge.hidden = progress.unseen === 0;
  badge.textContent = String(progress.unseen);
  $('#muteBtn').textContent = isMuted() ? '🔇' : '🔊';
}

// ---------- HUD: island tag + goal chips ----------
const tagsEl = $('#tags');
const chipKeys = (): GoalKey[] => (level().observe ? ['frogsMin', 'fishMin'] : level().checks);
function buildTags() {
  tagsEl.innerHTML = `
    <div class="tag"><span class="pips"></span><span class="applied"></span></div>
    <div class="chips">${chipKeys().map((k) => `<button class="chip" data-chip="${GOAL_UI[k].subject}" data-key="${k}"><span class="ic">${GOAL_UI[k].icon}</span><span class="v"></span>${level().observe ? '' : `<span class="tg">${GOAL_UI[k].text(level())}</span>`}</button>`).join('')}</div>`;
}
function renderTags() {
  const L = level();
  const tag = tagsEl.querySelector<HTMLElement>('.tag')!;
  tag.hidden = L.budget === 0 && L.preset.length === 0;
  const used = cost(state.actions);
  tag.querySelector('.pips')!.innerHTML = Array.from({ length: L.budget }, (_, k) => `<i class="${k < used ? 'used' : ''}"></i>`).join('');
  tag.querySelector('.applied')!.innerHTML =
    L.preset.map((a) => `<span class="lock" title="Có sẵn">${CARD[a].icon}</span>`).join('') +
    state.actions.map((a) => `<button data-remove="${a}" aria-label="Bỏ ${CARD[a].name}" ${state.phase !== 'plan' ? 'disabled' : ''}>${CARD[a].icon}</button>`).join('');
  renderChips();
}
function renderChips() {
  const L = level();
  const live = state.phase !== 'plan' && !L.observe;
  const s = snapAt(state.phase === 'plan' ? 0 : state.t);
  const all = checkGoals({ ...L, checks: ['frogsMin', 'clarityMin', 'mosquitoMax', 'fishMin'] }, s);
  tagsEl.querySelectorAll<HTMLElement>('.chip').forEach((el) => {
    const c = all.find((x) => x.key === el.dataset.key)!;
    el.querySelector('.v')!.textContent = c.value;
    el.classList.toggle('ok', live && c.ok);
    el.classList.toggle('no', live && !c.ok);
  });
}
function placeTags() {
  const top = world3d.toScreen(0, -8, 0.4, -8);
  const bottom = world3d.toScreen(0, 8, -2.4, 8);
  const tag = tagsEl.querySelector<HTMLElement>('.tag');
  const chips = tagsEl.querySelector<HTMLElement>('.chips');
  if (tag) { tag.style.left = `${top.x}px`; tag.style.top = `${top.y - 6}px`; }
  if (chips) { chips.style.left = `${bottom.x}px`; chips.style.top = `${bottom.y + 6}px`; }
}

// ---------- HUD: cards ----------
function renderCards() {
  const L = level();
  $('#cards').innerHTML = L.cards.map((id) => {
    const a = ACTIONS.find((x) => x.id === id)!;
    const isNew = L.newCard === id;
    return `<button class="card ${state.selected === id ? 'sel' : ''} ${isNew ? 'new' : ''}" data-card="${id}" aria-label="${CARD[id].name}, ${a.cost} điểm">
      ${isNew ? '<span class="newtag">MỚI</span>' : ''}<span class="ic">${CARD[id].icon}</span><span class="nm">${CARD[id].name}</span>
      <span class="cost">${'<i></i>'.repeat(a.cost)}</span></button>`;
  }).join('');
  $('#cards').hidden = L.cards.length === 0;
}

let hintTimer = 0;
function hint(text: string | null, sticky = false) {
  const el = $('#hint');
  clearTimeout(hintTimer);
  if (!text) { el.hidden = true; return; }
  el.textContent = text;
  el.hidden = false;
  if (!sticky) hintTimer = window.setTimeout(() => (el.hidden = true), 2800);
}

function applyCard(id: ActionId) {
  const tag = tagsEl.querySelector<HTMLElement>('.tag')!;
  if (state.actions.includes(id)) { sfx.deny(); hint('Đảo đã có thẻ này'); return; }
  if (cost([...state.actions, id]) > level().budget) {
    sfx.deny();
    tag.classList.remove('shake'); void tag.offsetWidth; tag.classList.add('shake');
    hint('Hết điểm. Chạm biểu tượng trên đảo để bỏ bớt');
    return;
  }
  state.actions = [...state.actions, id];
  resim();
  sfx.place();
  const p = world3d.toScreen(0, 0, 0.5, 0);
  pop(p.x, p.y, CARD[id].icon, 'good');
  state.selected = null;
  state.placedThisLevel = true;
  renderCards();
  renderTags();
  guide();
  track('intervention_applied', { action: id, level: level().id });
}
function removeCard(id: ActionId) {
  state.actions = state.actions.filter((a) => a !== id);
  resim();
  sfx.remove();
  renderTags();
  guide();
  track('intervention_removed', { action: id });
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
    const on = world3d.pick(e.clientX, e.clientY) >= 0;
    dropEl.classList.toggle('on', on);
    if (on) { const c = world3d.toScreen(0, 0, 0, 0); dropEl.style.left = `${c.x}px`; dropEl.style.top = `${c.y}px`; }
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
    if (world3d.pick(e.clientX, e.clientY) >= 0 && e.type === 'pointerup') applyCard(d.id);
  } else if (e.type === 'pointerup') {
    state.selected = state.selected === d.id ? null : d.id;
    if (state.selected) { sfx.pick(); hint(`${CARD[d.id].hint}. Chạm đảo để đặt`, true); } else guide();
    renderCards();
  }
};
$('#cards').addEventListener('pointerup', endDrag);
$('#cards').addEventListener('pointercancel', endDrag);
$<HTMLCanvasElement>('#world').addEventListener('pointerup', (e) => {
  unlock();
  if (world3d.pick(e.clientX, e.clientY) < 0) return;
  if (state.phase === 'plan' && state.selected) applyCard(state.selected);
});

// ---------- guidance: one short step at a time ----------
let hand: HTMLElement | null = null;
let handAnim = 0;
function stopHand() { hand?.remove(); hand = null; cancelAnimationFrame(handAnim); }
function startHand(card: ActionId) {
  stopHand();
  hand = document.createElement('div');
  hand.className = 'hand';
  hand.textContent = '👆';
  document.body.appendChild(hand);
  const loop = (time: number) => {
    const el = document.querySelector<HTMLElement>(`[data-card="${card}"]`);
    if (!hand || !el) return;
    const r = el.getBoundingClientRect();
    const to = world3d.toScreen(0, 0, 0, 0);
    const k = reduceMotion ? 0 : (time / 1700) % 1;
    const e = Math.min(1, k * 1.4);
    const ease = e * e * (3 - 2 * e);
    hand.style.left = `${r.left + r.width / 2 + (to.x - r.left - r.width / 2) * ease}px`;
    hand.style.top = `${r.top + r.height / 2 + (to.y - r.top - r.height / 2) * ease}px`;
    hand.style.opacity = String(k > 0.85 ? (1 - k) / 0.15 : 1);
    handAnim = requestAnimationFrame(loop);
  };
  handAnim = requestAnimationFrame(loop);
}
/** Shows the next useful step for the current level. */
function guide() {
  const L = level();
  const go = $('#go');
  go.classList.remove('pulse');
  if (state.phase !== 'plan' || !started || !$('#sheet').hidden) { stopHand(); return; }
  if (L.observe) { stopHand(); hint('Bấm ▶ để xem ao trong 2 năm', true); go.classList.add('pulse'); return; }
  if (L.kind === 'lesson' && L.newCard && !state.placedThisLevel) {
    hint(`Kéo ${CARD[L.newCard].icon} lên đảo`, true);
    startHand(L.newCard);
    return;
  }
  stopHand();
  if (state.actions.length > 0) { hint('Bấm ▶ để xem kết quả', true); go.classList.add('pulse'); }
  else hint(L.kind === 'challenge' ? 'Kéo thẻ lên đảo. Bạn có 3 điểm' : 'Chọn một thẻ', true);
}

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
  guide();
}
function startRun() {
  if (state.phase !== 'plan') return;
  unlock();
  sfx.play();
  stopHand();
  state.phase = 'run';
  state.t = 0;
  state.paused = false;
  state.firedEvents.clear();
  state.ev = events(state.run);
  $('#tray').hidden = true;
  $('#timebar').hidden = false;
  $<HTMLInputElement>('#scrub').max = String(END());
  $<HTMLInputElement>('#scrub').disabled = true;
  $('#go').classList.remove('pulse');
  renderTags();
  renderTime();
  hint(level().observe ? 'Xuân: ếch đẻ trứng. Hè: ếch con lên bờ. Có không?' : null, true);
  track('simulation_advanced', { level: level().id, actions: state.actions });
}
function renderTime() {
  const t = state.t;
  const years = level().years;
  const yi = Math.min(years - 1, Math.floor(Math.min(t, END() - 0.001) / 4));
  $('#when').textContent = `Năm ${yi + 1}/${years}`;
  $('#season').textContent = SEASON_ICON[Math.floor(Math.min(t, END() - 0.001)) % 4];
  $('#years').style.gridTemplateColumns = `repeat(${years}, 1fr)`;
  $('#years').innerHTML = Array.from({ length: years }, (_, y) => `<div class="yr"><i style="width:${Math.max(0, Math.min(1, (t - y * 4) / 4)) * 100}%"></i></div>`).join('');
  $<HTMLInputElement>('#scrub').value = String(t);
  $('#pause').textContent = state.phase === 'run' && !state.paused ? '❚❚' : '▶';
  $('#fast').classList.toggle('on', state.speed > 1);
}

function fireEvents(prevT: number, t: number) {
  for (const e of state.ev) {
    const key = `${e.t}:${e.text}`;
    if (e.t > prevT && e.t <= t && !state.firedEvents.has(key) && e.icon && e.icon !== '🏆') {
      state.firedEvents.add(key);
      const p = world3d.toScreen(0, (Math.random() - 0.5) * 4, 1.5, (Math.random() - 0.5) * 4);
      pop(p.x, p.y, `${e.icon} ${e.short}`.trim(), e.tone === 'bad' ? 'bad' : 'good');
      if (e.icon === '🐸' && e.tone === 'good') sfx.ribbit(); else if (e.tone === 'bad') sfx.bad(); else sfx.good();
      track('ecosystem_event_triggered', { text: e.text });
    }
  }
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
  state.t = END();
  $<HTMLInputElement>('#scrub').disabled = false;
  renderTime();
  renderTags();
  if (level().observe && !state.askedWhy) {
    hint('Ếch giảm rồi. Chạm 🐸 để hỏi: vì sao?', true);
    tagsEl.querySelector('[data-chip="frogs"]')?.classList.add('pulse');
    return;
  }
  showResult();
}

// ---------- result ----------
function starsFor(L: Level, run: Run): boolean[] {
  if (L.observe) return [true, true, true];
  const c = checkGoals(L, run.snaps[END()]);
  const ok = c.every((x) => x.ok);
  if (L.kind === 'lesson') return [ok, ok, ok];
  const by = (k: GoalKey) => c.find((x) => x.key === k)!.ok;
  return [by('frogsMin'), by('clarityMin'), by('mosquitoMax') && by('fishMin')];
}
function failHint(L: Level, run: Run) {
  const s = run.snaps[END()];
  const bad = checkGoals(L, s).find((c) => !c.ok);
  if (!bad) return '';
  const w = why(run, END(), GOAL_UI[bad.key].subject);
  const top = w.causes[0];
  return top ? `<div class="tip"><span class="ci">${causeIcon(top.label)}</span><span><b>Gợi ý:</b> ${GOAL_UI[bad.key].icon} chưa đạt. Lý do lớn nhất: ${top.label.toLowerCase()}.</span></div>` : '';
}
function showResult() {
  const L = level();
  const stars = starsFor(L, state.run);
  const n = stars.filter(Boolean).length;
  const won = L.observe || stars.every(Boolean);
  const before = progress.stars[L.id] ?? 0;
  if (won) progress.stars[L.id] = Math.max(before, n);
  else if (L.kind === 'challenge') progress.stars[L.id] = before; // partial stars never unlock the next level
  let newStrat = false;
  const found = (progress.strategies[L.id] ??= []);
  if (won && L.kind === 'challenge') {
    const match = state.winners.find((m) => m.every((a) => state.actions.includes(a)));
    const key = (match ?? state.actions).slice().sort().join('+');
    if (!found.includes(key)) { found.push(key); newStrat = true; }
  }
  const FOCUS: Record<string, string> = { watch: 'predation', hide: 'refuge', release: 'root-cause', green: 'eutrophication', mosquito: 'side-effect', 'dry-pond': 'microclimate' };
  const fresh = newDiscoveries(state.run, progress.known).map((d) => d.id).sort((a, b) => Number(b === FOCUS[L.id]) - Number(a === FOCUS[L.id]));
  for (const id of fresh) { progress.known.add(id); progress.unseen++; track('discovery_unlocked', { id }); }
  save();
  renderTop();
  track('challenge_result', { level: L.id, actions: state.actions, won });
  if (won) track('challenge_completed', { level: L.id });
  const hasNext = state.level + 1 < LEVELS.length;
  const total = Math.max(state.winners.length, found.length);
  openSheet(`
    <h2>${won ? (L.kind === 'lesson' ? 'Hoàn thành bài học!' : 'Ao đã hồi sinh!') : 'Chưa đạt. Thử lại nhé'}</h2>
    <div class="res1"><span class="stars">${stars.map((s, k) => `<span class="${s ? '' : 'off'}" style="animation-delay:${0.2 + k * 0.18}s">⭐</span>`).join('')}</span>
      ${L.kind === 'challenge' ? '<span class="sub">⭐ ếch · ⭐ nước trong · ⭐ ao cân bằng</span>' : ''}
      ${newStrat ? '<span style="color:var(--good)">Cách thắng mới!</span>' : ''}</div>
    ${won ? `<div class="takeaway"><span class="ci">💡</span><span>${L.lesson}</span></div>` : failHint(L, state.run)}
    ${L.kind === 'challenge' && total ? `<div class="strats">Cách thắng đã tìm: ${Array.from({ length: total }, (_, k) => `<i class="${k < found.length ? 'found' : ''}">${k < found.length ? '★' : '?'}</i>`).join('')}</div>` : ''}
    ${fresh.length ? `<div class="sub">Thẻ kiến thức mới. Chạm để lật</div><div class="dcards one">${discoveryCard(fresh[0], true)}</div>
      ${fresh.length > 1 ? `<div class="sub" style="text-align:center">+${fresh.length - 1} thẻ nữa trong 📖 Sổ khám phá</div>` : ''}` : ''}
    ${won && hasNext ? '<button class="btn primary wide" data-do="next">Tiếp ➜</button>' : ''}
    <div class="row">
      ${L.observe ? '' : '<button class="btn" data-do="review">🔍 Xem lại</button>'}
      <button class="btn ${won && hasNext ? '' : 'primary'}" data-do="retry">🔁 ${won ? 'Chơi lại' : 'Thử lại'}</button>
    </div>`);
  if (won) stars.forEach((s, k) => s && setTimeout(() => sfx.star(k), 200 + k * 180)); else sfx.bad();
  if (fresh.length) setTimeout(() => sfx.discover(), 1100);
}

function discoveryCard(id: string, isNew = false) {
  const d = DISCOVERIES.find((x) => x.id === id)!;
  if (!progress.known.has(id)) return `<div class="dcard locked"><div class="in"><div class="f"><span class="ic">${d.icon}</span><b>?</b></div></div></div>`;
  return `<button class="dcard ${isNew ? 'new' : ''}" data-flip aria-label="${d.concept}"><div class="in">
    <div class="f"><span class="ic">${d.icon}</span><b>${d.concept}</b><small>${d.observation}</small></div>
    <div class="bk"><b>Ngoài đời thực</b>${d.reality}</div></div></button>`;
}

// ---------- intro card ----------
function showIntro() {
  const L = level();
  const nc = L.newCard;
  openSheet(`
    <div class="intro"><span class="eyebrow">${levelLabel(state.level)}</span>
      <span class="big-ic">${L.icon}</span><h2>${L.title}</h2><p>${L.problem}</p>
      ${L.checks.length ? `<div class="goalrow">${L.checks.map((k) => `<span>${GOAL_UI[k].icon} ${GOAL_UI[k].text(L)}</span>`).join('')}<span>⏳ ${L.years} năm</span></div>` : ''}
      ${nc ? `<div class="newcard"><span class="card new"><span class="newtag">MỚI</span><span class="ic">${CARD[nc].icon}</span><span class="nm">${CARD[nc].name}</span></span><span>${CARD[nc].hint}</span></div>` : ''}
      ${L.preset.length ? `<div class="sub">Có sẵn trên đảo: ${L.preset.map((a) => CARD[a].icon + ' ' + CARD[a].name).join(', ')}</div>` : ''}
    </div>
    <div class="row"><button class="btn primary" data-do="begin">Bắt đầu</button></div>`, 'introsheet');
}

// ---------- sheets ----------
function openSheet(html: string, cls = '') {
  const sheet = $('#sheet');
  sheet.className = `sheet ${cls}`;
  $('#sheetBody').innerHTML = html;
  sheet.hidden = false;
  stopHand();
  hint(null);
}
function closeSheet() { $('#sheet').hidden = true; }
$('#sheet').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.id === 'sheet') { if (!$('#sheet').classList.contains('introsheet')) { closeSheet(); afterSheet(); } return; }
  const flip = t.closest<HTMLElement>('[data-flip]');
  if (flip) { flip.classList.toggle('flip'); sfx.pick(); return; }
  const lv = t.closest<HTMLElement>('[data-level]');
  if (lv && !(lv as HTMLButtonElement).disabled) { closeSheet(); loadLevel(Number(lv.dataset.level)); return; }
  const act = t.closest<HTMLElement>('[data-do]')?.dataset.do;
  if (!act) return;
  unlock();
  closeSheet();
  if (act === 'retry') { loadLevel(state.level, false); track('challenge_retried'); }
  else if (act === 'next') loadLevel(state.level + 1);
  else afterSheet();
});
function afterSheet() {
  if (state.phase === 'plan') guide();
  if (state.phase === 'review' && level().observe && state.askedWhy) showResult();
}

function openBook() {
  progress.unseen = 0;
  save();
  renderTop();
  openSheet(`<h2>Sổ khám phá</h2><div class="sub">${progress.known.size}/${DISCOVERIES.length} thẻ kiến thức. Chạm để lật</div>
    <div class="dcards">${DISCOVERIES.map((d) => discoveryCard(d.id)).join('')}</div>
    <div class="row"><button class="btn primary" data-do="close">Đóng</button></div>`);
  track('journal_opened');
}
function openLevels() {
  const lessons = LEVELS.filter((l) => l.kind === 'lesson').length;
  const row = (L: Level, i: number) => {
    const locked = !unlocked(i);
    const st = progress.stars[L.id] ?? 0;
    return `<button class="lvl ${i === state.level ? 'cur' : ''}" data-level="${i}" ${locked ? 'disabled' : ''}><span class="n">${locked ? '🔒' : L.icon}</span>
      <span><span class="t">${L.title}</span><br><span class="s">${levelLabel(i)} · ${'⭐'.repeat(st)}${'☆'.repeat(3 - st)}</span></span></button>`;
  };
  openSheet(`<h2>Hành trình</h2>
    <div class="sub">Bài học</div><div class="levels">${LEVELS.slice(0, lessons).map((L, i) => row(L, i)).join('')}</div>
    <div class="sub">Thử thách</div><div class="levels">${LEVELS.slice(lessons).map((L, i) => row(L, i + lessons)).join('')}</div>
    <div class="row"><button class="btn" data-do="close">Đóng</button></div>`);
}

function openWhy(subject: Subject) {
  const t = state.phase === 'plan' ? 0 : Math.round(state.t);
  const w = why(state.run, t, subject);
  const s = snapAt(state.phase === 'plan' ? 0 : state.t);
  const prev = state.run.snaps[Math.max(0, t - 4)];
  const pick = (x: Snapshot) => (subject === 'clarity' ? x.clarity * 100 : subject === 'plants' ? x.plants * 100 : (x[subject as 'frogs'] as number));
  const val = pick(s), pv = pick(prev);
  const arrow = val > pv * 1.08 ? '↗' : val < pv * 0.92 ? '↘' : '→';
  openSheet(`
    <div class="head"><span class="ic">${SUBJECT_ICON[subject]}</span><span class="big">${Math.round(val)}${subject === 'clarity' ? '%' : ''} ${arrow}</span>
      <span class="sub">Năm ${Math.min(level().years, Math.floor(Math.max(0, t - 1) / 4) + 1)}</span></div>
    <div class="sub">${subject === 'mosquito' ? 'Ai đang ăn muỗi?' : subject === 'clarity' ? 'Điều gì làm nước đục hay trong?' : 'Điều gì đang giới hạn?'}</div>
    ${w.causes.slice(0, 3).map((c, k) => `<div class="cause ${k === 0 && subject !== 'mosquito' ? 'lead' : ''}"><span class="ci">${causeIcon(c.label)}</span>
      <span class="lb">${c.label}</span><div class="bar"><i style="width:${Math.round(Math.min(1, c.share) * 100)}%"></i></div><span class="dt">${c.detail}</span></div>`).join('')}
    <div class="row"><button class="btn primary" data-do="close">OK</button></div>`, 'why');
  sfx.pick();
  track('relationship_inspected', { subject, t });
  if (subject === 'frogs' && !state.askedWhy) {
    state.askedWhy = true;
    tagsEl.querySelectorAll('.pulse').forEach((c) => c.classList.remove('pulse'));
  }
}

// ---------- wiring ----------
let started = false;
document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!t) return;
  unlock();
  if (t.dataset.remove && state.phase === 'plan') removeCard(t.dataset.remove as ActionId);
  if (t.dataset.chip) openWhy(t.dataset.chip as Subject);
});
$('#go').addEventListener('click', startRun);
$('#pause').addEventListener('click', () => {
  if (state.phase === 'run') state.paused = !state.paused;
  else if (state.phase === 'review') { state.phase = 'run'; state.t = 0; state.paused = false; state.firedEvents.clear(); $<HTMLInputElement>('#scrub').disabled = true; }
  renderTime();
});
$('#fast').addEventListener('click', () => { state.speed = state.speed > 1 ? 1 : 3; renderTime(); });
$('#edit').addEventListener('click', () => { if (!level().observe) { closeSheet(); toPlan(); } });
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
  loadLevel(firstOpen());
  track('session_started');
});
setMuted(store.get('muted', false));

function layout() {
  const narrow = innerWidth < 520;
  world3d.pad = { top: narrow ? 70 : 80, bottom: narrow ? 210 : 200, side: 16 };
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
    state.t = Math.min(END(), state.t + dt * (reduceMotion ? 4 : 1.6) * state.speed);
    fireEvents(prev, state.t);
    const s = Math.floor(state.t);
    if (s !== lastSeason) { lastSeason = s; sfx.season(); renderChips(); }
    renderTime();
    if (state.t >= END()) finishRun();
  }
  for (const a of ACTIONS) {
    const target = state.actions.includes(a.id) || level().preset.includes(a.id) ? 1 : 0;
    state.appear[a.id] += (target - state.appear[a.id]) * Math.min(1, dt * (target ? 3 : 6));
    if (target && state.appear[a.id] > 0.999) state.appear[a.id] = 1;
  }
  const t = state.phase === 'plan' ? 0 : state.t;
  const view: DioramaView = { map: state.run.map, snap: snapAt(t), seasonF: t, appear: state.appear, dry: level().dry };
  world3d.render([view], reduceMotion ? 0 : now);
  placeTags();
  requestAnimationFrame(frame);
}

loadLevel(firstOpen(), false);
layout();
requestAnimationFrame(frame);

// test hook for tools/shots.mjs (screen position of the island centre)
(window as unknown as { __wrTest: unknown }).__wrTest = { center: () => world3d.toScreen(0, 0, 0, 0) };
