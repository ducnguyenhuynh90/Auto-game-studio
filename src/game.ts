// Game shell: scene stack, immediate-mode buttons, toasts, persistence glue.
import { analytics } from './core/analytics';
import { checkGoals } from './core/goals';
import { makeRng, type Rng } from './core/rng';
import { loadState, saveState } from './core/save';
import type { SeaId } from './core/data';
import type { RelicId } from './core/items';
import { levelForXp } from './core/progression';
import { checkMissions, type GameState } from './core/state';
import { CAST, MISSION_STORY } from './core/story';
import { sfx, unlockAudio, vibrate } from './render/audio';
import type { World } from './render3d/world';
import type { AccountManager } from './auth/account';
import { COLORS, H, Particles, W, clamp01, drawCoin, ease, outlinedText, rr, text, type Ctx } from './render/draw';

export interface Scene {
  name: string;
  /** Opaque overlays hide every layer below them (e.g. the 3D reveal showcase). */
  opaque?: boolean;
  /** Full-screen menus that hide the 3D world (its rendering pauses underneath). */
  covers3d?: boolean;
  update(dt: number): void;
  draw(ctx: Ctx): void;
  down?(x: number, y: number): void;
  up?(x: number, y: number): void;
}

interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  fn: () => void;
  id: string;
}

interface Toast {
  msg: string;
  color: string;
  t: number;
  sub?: string;
}

interface FloatText {
  x: number;
  y: number;
  msg: string;
  color: string;
  t: number;
  size: number;
}

export interface ButtonOpts {
  color?: string;
  dark?: string;
  textColor?: string;
  size?: number;
  disabled?: boolean;
  sub?: string;
  pulse?: boolean;
  coin?: boolean; // draw a coin icon before the label
}

export class Game {
  state: GameState;
  rng: Rng;
  particles = new Particles();
  scene!: Scene;
  overlays: Scene[] = [];
  time = 0;
  timeScale = 1;
  pointer = { x: 0, y: 0, down: false };
  private hits: Hit[] = [];
  private pressedId: string | null = null;
  private toasts: Toast[] = [];
  private floats: FloatText[] = [];
  /** Accounts and cloud save (null until boot wires it). */
  account: AccountManager | null = null;
  /** 3D world layer; null in headless tests. */
  world: World | null = null;
  coinPulse = 0;
  shake = 0;
  // Scene navigation is wired in main.ts to keep this module free of scene imports.
  goVillage: () => void = () => {};
  goFishing: (sea: SeaId) => void = () => {};
  goMap: () => void = () => {};
  setQuality: (q: 'auto' | 'low' | 'medium' | 'high') => void = () => {};

  constructor(seed: number) {
    this.state = loadState();
    this.rng = makeRng(seed);
  }

  setScene(s: Scene): void {
    this.scene = s;
    this.overlays = [];
    analytics.track('screen', { name: s.name });
  }

  push(o: Scene): void {
    this.overlays.push(o);
    analytics.track('screen', { name: o.name });
  }

  pop(o?: Scene): void {
    if (o) this.overlays = this.overlays.filter((x) => x !== o);
    else this.overlays.pop();
  }

  get top(): Scene {
    return this.overlays[this.overlays.length - 1] ?? this.scene;
  }

  /** Persist and evaluate goals after any meaningful state change. */
  commit(): void {
    const done = checkGoals(this.state);
    for (const g of done) {
      analytics.track('goal_complete', { goal: g.id, reward: g.reward });
      this.toast('Goal complete!', COLORS.good, g.reward > 0 ? `${g.text}  +${g.reward}` : g.text);
      if (g.reward > 0) this.coinPulse = 1;
      sfx.upgrade();
    }
    for (const m of checkMissions(this.state)) {
      analytics.track('mission_complete', { mission: m.mission.id, sea: m.sea.id });
      const st = MISSION_STORY[m.mission.id];
      this.toast('Mission complete!  +' + m.mission.reward.coins, '#3a8fd9', st ? `${CAST[st.giver].name}: “${st.done}”` : m.mission.text);
      this.coinPulse = 1;
      sfx.upgrade();
      if (m.levelUps > 0) this.levelUp();
      if (m.relic) {
        analytics.track('relic_unlock', { relic: m.relic, sea: m.sea.id });
        this.relicQueue.push(m.relic);
      }
    }
    saveState(this.state);
  }

  /** Relics waiting to be presented with a full-screen moment (shown by the village). */
  relicQueue: RelicId[] = [];

  levelUp(): void {
    const lvl = levelForXp(this.state.xp);
    analytics.track('level_up', { level: lvl });
    this.toast(`Captain level ${lvl}!`, '#a35bd6', 'Bonus coins for your hard work');
    this.coinPulse = 1;
    sfx.rare();
  }

  toast(msg: string, color = COLORS.accent, sub?: string): void {
    this.toasts.push({ msg, color, t: 0, sub });
  }

  float(x: number, y: number, msg: string, color = COLORS.gold, size = 26): void {
    this.floats.push({ x, y, msg, color, t: 0, size });
  }

  // ---------- Input ----------
  pointerDown(x: number, y: number): void {
    unlockAudio();
    this.pointer = { x, y, down: true };
    const hit = this.findHit(x, y);
    this.pressedId = hit?.id ?? null;
    if (!hit) this.top.down?.(x, y);
  }

  pointerUp(x: number, y: number): void {
    this.pointer = { x, y, down: false };
    const hit = this.findHit(x, y);
    const pressed = this.pressedId;
    this.pressedId = null;
    if (hit && hit.id === pressed) {
      sfx.tap();
      vibrate(8);
      hit.fn();
      return;
    }
    if (!pressed) this.top.up?.(x, y);
  }

  pointerMove(x: number, y: number): void {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  private findHit(x: number, y: number): Hit | undefined {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return undefined;
  }

  /** Registers a tappable region for this frame (used by custom-drawn widgets). */
  hitArea(id: string, x: number, y: number, w: number, h: number, fn: () => void): void {
    this.hits.push({ id, x, y, w, h, fn });
  }

  isPressed(id: string): boolean {
    return this.pressedId === id && this.pointer.down;
  }

  button(ctx: Ctx, id: string, x: number, y: number, w: number, h: number, label: string, fn: () => void, o: ButtonOpts = {}): void {
    const pressed = this.isPressed(id) && !o.disabled;
    const color = o.disabled ? '#bdb3a3' : (o.color ?? COLORS.accent);
    const dark = o.disabled ? '#8f8678' : (o.dark ?? COLORS.accentDark);
    const pulse = o.pulse && !o.disabled ? 1 + Math.sin(this.time * 6) * 0.03 : 1;
    const depth = pressed ? 2 : 6;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-w / 2, -h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    rr(ctx, 0, 8, w, h, h / 3);
    ctx.fill();
    ctx.fillStyle = dark;
    rr(ctx, 0, pressed ? 4 : 0, w, h, h / 3);
    ctx.fill();
    ctx.fillStyle = color;
    rr(ctx, 0, pressed ? 4 : 0, w, h - depth, h / 3);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.ink;
    rr(ctx, 0, pressed ? 4 : 0, w, h - (pressed ? 4 : 0), h / 3);
    ctx.stroke();
    const size = o.size ?? Math.min(26, h * 0.42);
    const cy = (h - depth) / 2 + (pressed ? 4 : 0) - (o.sub ? size * 0.35 : 0);
    const tc = o.textColor ?? '#fff';
    if (o.coin) {
      ctx.font = `900 ${size}px sans-serif`;
      const tw = ctx.measureText(label).width;
      drawCoin(ctx, w / 2 - tw / 2 - size * 0.4, cy, size * 0.42);
      outlinedText(ctx, label, w / 2 + size * 0.35, cy, size, tc, 'rgba(43,33,24,0.9)', 4);
    } else if (tc === '#fff') {
      outlinedText(ctx, label, w / 2, cy, size, tc, 'rgba(43,33,24,0.9)', 4);
    } else {
      // dark label on a light button: an ink outline would smear it
      text(ctx, label, w / 2, cy, size, tc, 'center', 900);
    }
    if (o.sub) text(ctx, o.sub, w / 2, cy + size * 0.85, size * 0.5, 'rgba(255,255,255,0.95)');
    ctx.restore();
    if (!o.disabled) this.hits.push({ id, x, y, w, h, fn });
  }

  // ---------- Frame ----------
  update(rawDt: number): void {
    const dt = Math.min(0.05, rawDt) * this.timeScale;
    this.time += dt;
    this.scene.update(dt);
    for (const o of [...this.overlays]) o.update(dt);
    this.particles.update(dt);
    // Toasts wait while a full-screen moment (the reveal) is on screen, so they never cover it.
    const blocking = this.overlays.some((o) => o.opaque);
    if (!blocking) for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < 2.6);
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1.3);
    this.coinPulse = Math.max(0, this.coinPulse - dt * 2);
    this.shake = Math.max(0, this.shake - dt * 3);
  }

  draw(ctx: Ctx): void {
    this.hits = [];
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake * 14, (Math.random() - 0.5) * this.shake * 14);
    const opaqueIdx = this.overlays.map((o) => !!o.opaque).lastIndexOf(true);
    if (opaqueIdx < 0) this.scene.draw(ctx);
    ctx.restore();
    for (const o of this.overlays.slice(Math.max(0, opaqueIdx))) {
      this.hits = []; // only the top-most layer is interactive
      o.draw(ctx);
    }
    this.particles.draw(ctx);
    this.drawFloats(ctx);
    if (!this.overlays.some((o) => o.opaque)) this.drawToasts(ctx);
  }

  private drawFloats(ctx: Ctx): void {
    for (const f of this.floats) {
      const k = f.t / 1.3;
      ctx.save();
      ctx.globalAlpha = clamp01(1.6 - k * 1.6);
      outlinedText(ctx, f.msg, f.x, f.y - ease.outCubic(k) * 60, f.size * (k < 0.15 ? ease.outBack(k / 0.15) : 1), f.color, COLORS.ink, 5);
      ctx.restore();
    }
  }

  private drawToasts(ctx: Ctx): void {
    this.toasts.slice(0, 2).forEach((t, i) => {
      const inK = ease.outBack(clamp01(t.t / 0.35));
      const outK = clamp01((t.t - 2.2) / 0.4);
      const y = 150 + i * 70 - outK * 40;
      ctx.save();
      ctx.globalAlpha = 1 - outK;
      ctx.translate(W / 2, y);
      ctx.scale(inK, inK);
      const w = 300;
      const h = t.sub ? 62 : 46;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      rr(ctx, -w / 2, -h / 2 + 4, w, h, 16);
      ctx.fill();
      ctx.fillStyle = t.color;
      rr(ctx, -w / 2, -h / 2, w, h, 16);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = COLORS.ink;
      ctx.stroke();
      outlinedText(ctx, t.msg, 0, t.sub ? -10 : 0, 22, '#fff', COLORS.ink, 4);
      if (t.sub) text(ctx, t.sub, 0, 16, 15, '#fff');
      ctx.restore();
    });
  }
}

export const VIEW = { W, H };
