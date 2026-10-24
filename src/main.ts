import { analytics } from './core/analytics';
import { startPlaySummary } from './remote';
import { loadFromBlob, resetSave, saveState } from './core/save';
import { AccountManager } from './auth/account';
import { Game } from './game';
import { H, W } from './render/draw';
import { World } from './render3d/world';
import { FpsGovernor, detectQuality, loadAutoQuality, loadQualitySetting, saveAutoQuality, saveQualitySetting, type Quality, type QualitySetting } from './render3d/quality';
import { characterPortrait, fishIcon, stagePreview } from './render3d/icons';
import type { Track } from './core/evolution';
import type { CharacterId } from './core/story';
import { setFishIconProvider, setIslandArtProvider, setPortraitProvider, setStageProvider } from './render/draw';
import { FishingScene } from './scenes/fishing';
import { VillageScene } from './scenes/village';
import { MapScene } from './scenes/map';
import { IslandScene } from './scenes/island';
import { PuzzleHubOverlay, SaltPuzzleOverlay, ShopPuzzleOverlay } from './scenes/puzzles';
import { FISHING_LEVELS } from './core/puzzles';
import { SCENES } from './core/story';
import { build, buyPlot, canExpand, catchUp, hire, terrain, type BuildingId } from './core/island';
import { RevealOverlay } from './scenes/jar';
import { addCatch, canFerment, sealJar, upgradeCost } from './core/state';
import { UPGRADES } from './core/data';
import { SEAS, SEAS_BY_ID, seaComplete, seaLock } from './core/seas';
import type { SeaId } from './core/data';

const params = new URLSearchParams(location.search);
if (params.has('reset')) resetSave();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const worldCanvas = document.getElementById('world') as HTMLCanvasElement;
const seed = Number(params.get('seed') ?? Date.now() % 1e9);
const game = new Game(seed);
// Graphics quality: a manual choice wins; else a remembered auto result; else device hints.
const qualitySetting = (params.get('quality') as QualitySetting | null) ?? loadQualitySetting();
const startQuality: Quality = qualitySetting !== 'auto' ? qualitySetting : (loadAutoQuality() ?? detectQuality());
game.world = new World(worldCanvas, startQuality);
game.particles.scale = game.world.particleScale;
game.setQuality = (q) => {
  saveQualitySetting(q);
  const tier = q === 'auto' ? (loadAutoQuality() ?? detectQuality()) : q;
  game.world?.applyQuality(tier);
  game.particles.scale = game.world?.particleScale ?? 1;
  resize();
  analytics.track('quality', { setting: q, tier });
};
// Step down automatically when the device can't keep ~40 fps (only in auto mode).
const governor = new FpsGovernor(() => {
  const w = game.world;
  if (!w || loadQualitySetting() !== 'auto' || w.quality === 'low') return false;
  const next: Quality = w.quality === 'high' ? 'medium' : 'low';
  w.applyQuality(next);
  game.particles.scale = w.particleScale;
  saveAutoQuality(next);
  resize();
  analytics.track('quality_auto_down', { to: next });
  return true;
});
setFishIconProvider(fishIcon);
setPortraitProvider((id) => characterPortrait(id as CharacterId));
setStageProvider((track, level) => stagePreview(track as Track, level));
setIslandArtProvider((kind, id, level) => stagePreview(kind, kind === 'worker' ? 0 : level, id));
if (params.has('speed')) game.timeScale = Number(params.get('speed'));

game.goVillage = () => game.setScene(new VillageScene(game));
game.goMap = () => game.setScene(new MapScene(game));
game.goIsland = (tile) => game.setScene(new IslandScene(game, tile));
game.goPuzzles = () => {
  game.goIsland();
  game.push(new PuzzleHubOverlay(game));
};
game.goFishingPuzzle = (i) => game.setScene(new FishingScene(game, FISHING_LEVELS[i].sea, i));
// Island staff caught up for the time the game was closed (capped, see core/island.ts).
{
  const away = catchUp(game.state, game.rng, Date.now());
  if (away.fish + away.salt + away.jars + away.bottles > 0) {
    game.toast('While you were away…', '#3a8fd9', `Staff: +${away.fish} fish, +${away.salt} salt, ${away.jars} jars, +${away.coins} coins`);
    analytics.track('island_offline', { ...away });
    saveState(game.state);
  }
}
game.goFishing = (sea) => {
  game.state.sea = sea;
  game.setScene(new FishingScene(game, sea));
};
// A save from before the sea chart may point at a sea whose story is now locked.
if (seaLock(game.state, SEAS_BY_ID[game.state.sea])) game.state.sea = 'lagoon';
game.goVillage();

// Accounts: claude.ai identity inside the playtest page, social login on configured builds.
game.account = new AccountManager({
  getState: () => game.state,
  replaceState: (s) => {
    game.state = loadFromBlob(s);
    saveState(game.state);
    game.goVillage();
  },
  toast: (msg, sub) => game.toast(msg, '#3a8fd9', sub),
});
void game.account.init().then(() => {
  if (game.account?.conflict) game.toast('Two saves found', '#a35bd6', 'Open Settings (≡) to choose one');
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
    const I = { buyPlot, build, hire, canExpand, terrain };
    for (let k = 0; k < 14; k++) {
      const t = [...Array(63).keys()].find((i) => I.canExpand(st, i) && 'bcsgf'.includes(I.terrain(i)));
      if (t !== undefined) I.buyPlot(st, t);
    }
    const plan: [string, BuildingId][] = [['b', 'dock'], ['c', 'dock'], ['s', 'saltfield'], ['b', 'saltfield'], ['g', 'brewhouse'], ['g', 'shop'], ['g', 'warehouse'], ['g', 'lantern'], ['f', 'lantern']];
    for (const [ter, id] of plan) {
      const t = st.island.owned.find((i) => I.terrain(i) === ter && !st.island.buildings.some((b) => b.tile === i));
      if (t !== undefined && I.build(st, t, id)) I.hire(st, t);
    }
    st.coins = 3000;
    st.storySeen = SCENES.map((x) => x.id);
    game.goVillage();
  }
  if (which === 'fpuzzle') game.goFishingPuzzle(Number(params.get('level') ?? 1) - 1);
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
analytics.funnelStep('first_launch');
analytics.track('session_start', { trips: game.state.stats.trips, coins: game.state.coins, returning: game.state.stats.catches > 0 });

// Fit the 390x844 logical view into the window, crisp on high-DPI screens.
let scale = 1;
function resize(): void {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  for (const c of [canvas, worldCanvas]) {
    c.style.width = `${W * scale}px`;
    c.style.height = `${H * scale}px`;
  }
  game.world?.resize(W * scale, H * scale, dpr);
  // The UI layer redraws every frame too: cap its resolution (text stays crisp at 2x).
  const uiDpr = Math.min(dpr, game.world?.quality === 'low' ? 1.5 : 2);
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
});

let last = performance.now();
function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  governor.frame(dt);
  game.update(dt);
  game.world?.render(game, Math.min(0.05, dt) * game.timeScale);
  ctx.clearRect(0, 0, W, H);
  game.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test / QA hook (harmless in production: exposes nothing sensitive).
(window as unknown as Record<string, unknown>).__mam = { game, analytics, rules: { upgradeCost, UPGRADES, SEAS, seaLock, seaComplete, canFerment } };

// Offline + instant repeat loads on self-hosted builds. Not inside the claude.ai artifact frame
// (service workers aren't available there) and not in dev (it would cache stale modules).
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.top === window.self && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* unsupported or blocked: the game works without it */
  });
}
