// The browser host: two canvases (3D world under, 2D UI over), pointer input, the frame loop. The game
// itself starts in boot.ts, shared with the native app (mobile/).
import { analytics } from './core/analytics';
import { startPlaySummary } from './remote';
import { bootGame } from './boot';
import { H, W } from './render/draw';
import { World } from './render3d/world';
import { PuzzleHubOverlay, SaltPuzzleOverlay, ShopPuzzleOverlay } from './scenes/puzzles';
import { SCENES } from './core/story';
import { SortGameOverlay, SortMenuOverlay } from './scenes/sort';
import { build, buyPlot, canExpand, hire, terrain, type BuildingId } from './core/island';
import { RevealOverlay } from './scenes/jar';
import { addCatch, sealJar } from './core/state';
import { SEAS_BY_ID } from './core/seas';
import type { SeaId } from './core/data';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const worldCanvas = document.getElementById('world') as HTMLCanvasElement;

declare const __GA__: boolean;
const { game, welcomeBack, tick } = bootGame({
  params,
  makeWorld: (q) => new World(worldCanvas, q),
  relayout: () => resize(),
  // Google Analytics 4 on self-hosted builds with a Measurement ID (analytics/ga.ts, docs/ANALYTICS.md).
  loadGa: __GA__
    ? () =>
        import('./analytics/ga').then(({ initGa, playerProps }) => {
          const ga = initGa();
          if (!ga) return null;
          // who the player is in the game: how far they got (GA user properties)
          ga.setPropsProvider(() => playerProps(game.state, 'web'));
          return ga;
        })
    : undefined,
});

// Dev-only shortcuts for visual QA: ?scene=fishing | reef | reveal
if (import.meta.env.DEV && params.has('scene')) {
  const which = params.get('scene');
  const st = game.state;
  if (which && which in SEAS_BY_ID) game.goFishing(which as SeaId);
  if (which === 'fishing') game.goFishing('lagoon');
  if (which === 'map') game.goMap();
  if (which === 'estate') {
    // a busy island business for visual QA of the main screen overview
    st.stats.sold = Math.max(1, st.stats.sold);
    st.coins = 50000;
    st.career = { stage: 4, done: [] }; // famous enough for every building in the plan
    const I = { buyPlot, build, hire, canExpand, terrain };
    for (let k = 0; k < 14; k++) {
      const t = [...Array(63).keys()].find((i) => I.canExpand(st, i) && 'bcsgf'.includes(I.terrain(i)));
      if (t !== undefined) I.buyPlot(st, t);
    }
    const plan: [string, BuildingId][] = [['b', 'dock'], ['c', 'dock'], ['s', 'saltfield'], ['b', 'saltfield'], ['g', 'brewhouse'], ['g', 'shop'], ['g', 'touroffice'], ['g', 'warehouse'], ['g', 'lantern'], ['f', 'lantern']];
    for (const [ter, id] of plan) {
      const t = st.island.owned.find((i) => I.terrain(i) === ter && !st.island.buildings.some((b) => b.tile === i));
      if (t !== undefined && I.build(st, t, id)) I.hire(st, t);
    }
    st.coins = 3000;
    st.storySeen = SCENES.map((x) => x.id);
    game.goVillage();
  }
  if (which === 'fpuzzle') game.goFishingPuzzle(Number(params.get('level') ?? 1) - 1);
  if (which === 'sort') {
    st.stats.trips = Math.max(1, st.stats.trips);
    st.storySeen = SCENES.map((x) => x.id);
    game.push(new SortMenuOverlay(game));
    if (params.has('level')) game.push(new SortGameOverlay(game, Number(params.get('level')) - 1));
  }
  if (which === 'island' || which === 'puzzles' || which === 'salt' || which === 'shop') {
    // a small running business for visual QA
    st.stats.sold = Math.max(1, st.stats.sold);
    st.coins = Math.max(st.coins, 2000);
    game.goIsland();
    if (which === 'puzzles') game.push(new PuzzleHubOverlay(game));
    if (which === 'salt') game.push(new SaltPuzzleOverlay(game, Number(params.get('level') ?? 1) - 1));
    if (which === 'shop') game.push(new ShopPuzzleOverlay(game, Number(params.get('level') ?? 1) - 1));
  }
  if (which === 'chain') {
    // food chain: an anchovy was just landed on a later trip, so a scad is hungry
    st.stats.trips = Math.max(2, st.stats.trips);
    st.stats.catches = Math.max(5, st.stats.catches);
    game.goFishing('lagoon');
    const f = game.scene as unknown as { chain: number; chainLevel: number; wakeHungry: (l: number) => void };
    f.chain = 1;
    f.chainLevel = 1;
    f.wakeHungry(1);
  }
  if (which === 'reveal') {
    for (let i = 0; i < 3; i++) addCatch(st, 'anchovy', 10, 0.9);
    sealJar(st, 0, st.bucket.map((f) => f.uid), game.rng, Date.now());
    st.stats.trips++;
    st.stats.fullTrips++;
    game.push(new RevealOverlay(game, 0));
  }
}

startPlaySummary();
// Runtime errors are product evidence too (a playtester reloaded 3 times in 90 s and we couldn't tell why).
let errorsReported = 0;
const reportError = (msg: string) => {
  if (errorsReported++ < 5) analytics.track('js_error', { msg: msg.slice(0, 160), scene: game.scene?.name ?? 'boot' });
};
window.addEventListener('error', (e) => reportError(String(e.message)));
window.addEventListener('unhandledrejection', (e) => reportError(String((e as PromiseRejectionEvent).reason)));

// Notches, camera holes and the home bar: the game fits inside the safe area (the app runs edge to edge).
const safeProbe = document.createElement('div');
safeProbe.style.cssText =
  'position:fixed;visibility:hidden;pointer-events:none;' +
  'padding-top:max(env(safe-area-inset-top,0px),var(--safe-area-inset-top,0px));' +
  'padding-bottom:max(env(safe-area-inset-bottom,0px),var(--safe-area-inset-bottom,0px))';
document.body.appendChild(safeProbe);

// Fit the 390x844 logical view into the window, crisp on high-DPI screens.
let scale = 1;
function resize(): void {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cs = getComputedStyle(safeProbe);
  const top = parseFloat(cs.paddingTop) || 0;
  const bottom = parseFloat(cs.paddingBottom) || 0;
  scale = Math.min(window.innerWidth / W, (window.innerHeight - top - bottom) / H);
  for (const c of [canvas, worldCanvas]) {
    c.style.width = `${W * scale}px`;
    c.style.height = `${H * scale}px`;
    c.style.top = `${top}px`;
  }
  game.world?.resize(W * scale, H * scale, dpr);
  // The UI layer redraws every frame too: a 2D canvas of this size costs little even at full
  // device resolution, so only the weakest ("low") tier gets a lower cap to save some blit cost.
  const uiDpr = Math.min(dpr, game.world?.quality === 'low' ? 2 : 3);
  canvas.width = Math.round(W * scale * uiDpr);
  canvas.height = Math.round(H * scale * uiDpr);
  ctx.setTransform(scale * uiDpr, 0, 0, scale * uiDpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function toLogical(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}
// Two fingers pinch-zoom (the island overview); one finger taps, holds and drags as before.
const touches = new Map<number, [number, number]>();
let pinchDist = 0;
const spread = () => {
  const [a, b] = [...touches.values()];
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
};
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, toLogical(e));
  if (touches.size === 2) {
    pinchDist = spread();
    // the first finger's press becomes a pinch, not a tap
    game.pointerCancel();
    return;
  }
  if (touches.size > 2) return;
  game.pointerDown(...toLogical(e));
});
const release = (e: PointerEvent) => {
  e.preventDefault();
  const wasPinch = touches.size >= 2;
  touches.delete(e.pointerId);
  if (wasPinch || touches.size > 0) return;
  game.pointerUp(...toLogical(e));
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, toLogical(e));
  if (touches.size === 2) {
    const d = spread();
    if (pinchDist > 0 && d > 0) game.zoomBy(d / pinchDist);
    pinchDist = d;
    return;
  }
  game.pointerMove(...toLogical(e));
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    game.zoomBy(Math.exp(-e.deltaY * 0.0015));
  },
  { passive: false },
);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  analytics.track(document.hidden ? 'app_hidden' : 'app_visible', { scene: game.scene.name });
  // frames stop in the background; staff worked anyway
  if (!document.hidden) welcomeBack();
});

let last = performance.now();
function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  tick(dt);
  ctx.clearRect(0, 0, W, H);
  game.draw(ctx);
  // a brag card wants this frame: copy it now, while the 3D picture is still in its buffer
  if (game.snapshots.length) {
    const shot = document.createElement('canvas');
    shot.width = canvas.width;
    shot.height = canvas.height;
    const sx = shot.getContext('2d')!;
    sx.drawImage(worldCanvas, 0, 0, shot.width, shot.height);
    sx.drawImage(canvas, 0, 0);
    for (const done of game.snapshots.splice(0)) done(shot);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Offline + instant repeat loads on self-hosted builds. Not inside the claude.ai artifact frame
// (service workers aren't available there) and not in dev (it would cache stale modules).
// The app ships its files inside the install, so it needs no service worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.top === window.self && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* unsupported or blocked: the game works without it */
  });
}
