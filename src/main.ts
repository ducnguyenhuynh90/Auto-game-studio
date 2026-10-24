import { analytics } from './core/analytics';
import { startPlaySummary } from './remote';
import { resetSave } from './core/save';
import { Game } from './game';
import { H, W } from './render/draw';
import { World } from './render3d/world';
import { fishIcon } from './render3d/icons';
import { setFishIconProvider } from './render/draw';
import { FishingScene } from './scenes/fishing';
import { VillageScene } from './scenes/village';
import { MapScene } from './scenes/map';
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
game.world = new World(worldCanvas);
setFishIconProvider(fishIcon);
if (params.has('speed')) game.timeScale = Number(params.get('speed'));

game.goVillage = () => game.setScene(new VillageScene(game));
game.goMap = () => game.setScene(new MapScene(game));
game.goFishing = (sea) => {
  game.state.sea = sea;
  game.setScene(new FishingScene(game, sea));
};
// A save from before the sea chart may point at a sea whose story is now locked.
if (seaLock(game.state, SEAS_BY_ID[game.state.sea])) game.state.sea = 'lagoon';
game.goVillage();

// Dev-only shortcuts for visual QA: ?scene=fishing | reef | reveal
if (import.meta.env.DEV && params.has('scene')) {
  const which = params.get('scene');
  const st = game.state;
  if (which && which in SEAS_BY_ID) game.goFishing(which as SeaId);
  if (which === 'fishing') game.goFishing('lagoon');
  if (which === 'map') game.goMap();
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
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function toLogical(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  game.pointerDown(...toLogical(e));
});
canvas.addEventListener('pointerup', (e) => {
  e.preventDefault();
  game.pointerUp(...toLogical(e));
});
canvas.addEventListener('pointercancel', (e) => game.pointerUp(...toLogical(e)));
canvas.addEventListener('pointermove', (e) => game.pointerMove(...toLogical(e)));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  analytics.track(document.hidden ? 'app_hidden' : 'app_visible', { scene: game.scene.name });
});

let last = performance.now();
function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  game.update(dt);
  game.world?.render(game, Math.min(0.05, dt) * game.timeScale);
  ctx.clearRect(0, 0, W, H);
  game.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test / QA hook (harmless in production: exposes nothing sensitive).
(window as unknown as Record<string, unknown>).__mam = { game, analytics, rules: { upgradeCost, UPGRADES, SEAS, seaLock, seaComplete, canFerment } };
