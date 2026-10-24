import { analytics } from './core/analytics';
import { resetSave } from './core/save';
import { Game } from './game';
import { H, W } from './render/draw';
import { FishingScene } from './scenes/fishing';
import { VillageScene } from './scenes/village';

const params = new URLSearchParams(location.search);
if (params.has('reset')) resetSave();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const seed = Number(params.get('seed') ?? Date.now() % 1e9);
const game = new Game(seed);
if (params.has('speed')) game.timeScale = Number(params.get('speed'));

game.goVillage = () => game.setScene(new VillageScene(game));
game.goFishing = (zone) => {
  game.state.zone = zone;
  game.setScene(new FishingScene(game, zone));
};
game.goVillage();

analytics.funnelStep('first_launch');
analytics.track('session_start', { trips: game.state.stats.trips, coins: game.state.coins, returning: game.state.stats.catches > 0 });

// Fit the 390x844 logical view into the window, crisp on high-DPI screens.
let scale = 1;
function resize(): void {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
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
  ctx.clearRect(0, 0, W, H);
  game.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test / QA hook (harmless in production: exposes nothing sensitive).
(window as unknown as Record<string, unknown>).__mam = { game, analytics };
