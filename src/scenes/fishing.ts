// Fishing trip: aim (hold to charge) → cast → approach/nibble → bite (tap) → reel (hold/release) → catch card.
import { analytics } from '../core/analytics';
import { BALANCE, RARITY_COLOR, RARITY_LABEL, SPECIES_BY_ID, type SeaId } from '../core/data';
import { Reel, castDistance, castPower, rollShadow, type ShadowSpec } from '../core/fishing';
import { GADGETS, hasRelic, type GadgetId } from '../core/items';
import { SEAS_BY_ID } from '../core/seas';
import { range } from '../core/rng';
import { addCatch, agingLevel, castsPerTrip, duplicateCatch, finishTrip, useGadget, type CaughtFish } from '../core/state';
import { sfx, vibrate } from '../render/audio';
import { COLORS, H, W, clamp01, drawFish, ease, outlinedText, panel, rr, star, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

const NEAR_Y = 600;
const FAR_Y = 175;

interface Shadow extends ShadowSpec {
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  state: 'swim' | 'approach' | 'hooked' | 'flee';
  alpha: number;
  /** Deeper than the current line can reach: visible, but out of range. */
  locked: boolean;
}

type Phase = 'aim' | 'charging' | 'flying' | 'waiting' | 'bite' | 'reel' | 'result' | 'card' | 'summary';

export function depthToY(d: number): number {
  return NEAR_Y - d * (NEAR_Y - FAR_Y);
}

export class FishingScene implements Scene {
  name = 'fishing';
  phase: Phase = 'aim';
  shadows: Shadow[] = [];
  castsLeft: number;
  readonly totalCasts: number;
  /** Gadget effects active this trip (and the Octo Net for the next catch). */
  effects = new Set<GadgetId>();
  tripGadgets: GadgetId[] = [];
  tripXp = 0;
  holdTime = 0;
  power = 0;
  bobber = { x: W / 2, y: NEAR_Y, t: 0, dip: 0 };
  target: Shadow | null = null;
  waitTimer = 0;
  nibbles = 0;
  biteTimer = 0;
  reel: Reel | null = null;
  holding = false;
  resultText = '';
  resultColor = '#fff';
  resultT = 0;
  card: { fish: CaughtFish; isNew: boolean; isRecord: boolean; t: number; gadget?: GadgetId; doubled: boolean; xp: number } | null = null;
  tripCatches: CaughtFish[] = [];
  tripTreasure = 0;
  hintT = 0;
  fullTrip = false;
  earlyTapT = 0;
  t = 0;
  reelTick = 0;

  constructor(
    private game: Game,
    readonly sea: SeaId,
  ) {
    const s = game.state;
    this.totalCasts = castsPerTrip(s);
    this.castsLeft = this.totalCasts;
    for (let i = 0; i < 5; i++) this.spawnShadow(true);
    analytics.track('trip_start', { sea, trip: s.stats.trips + 1 });
    if (s.stats.trips === 1) analytics.funnelStep('second_trip_start');
    if (s.stats.trips === 2) analytics.funnelStep('third_trip_start');
    if (sea === 'reef') analytics.funnelStep('first_reef_trip');
  }

  /** How far the line reaches right now (0..1 of the water). */
  get reach(): number {
    return this.effects.has('rocket') ? 1 : BALANCE.lineReach[this.game.state.upgrades.line];
  }

  /** Activate a gadget from the item bar. */
  useGadget(id: GadgetId): void {
    if (this.effects.has(id) || !useGadget(this.game.state, id)) return;
    this.effects.add(id);
    sfx.upgrade();
    analytics.track('gadget_use', { id, sea: this.sea });
    this.game.toast(`${GADGETS[id].name}!`, GADGETS[id].color, GADGETS[id].desc);
    this.refreshLocks();
    this.game.commit();
  }

  private refreshLocks(): void {
    for (const sh of this.shadows) sh.locked = sh.depth > this.reach + 0.02;
  }

  private waitScale(): number {
    return hasRelic(this.game.state.relics, 'kite') ? 0.5 : 1;
  }

  private get tutorial(): boolean {
    return this.game.state.stats.catches === 0;
  }

  spawnShadow(initial = false): void {
    const g = this.game;
    let spec = rollShadow(g.rng, this.sea, g.state.upgrades.bait);
    // First-ever cast of the game: guarantee a friendly anchovy close to the boat lane.
    if (this.tutorial && this.shadows.length === 0) spec = { species: 'anchovy', size: 10, depth: 0.3 };
    const dir: 1 | -1 = g.rng() < 0.5 ? 1 : -1;
    const sp = SPECIES_BY_ID[spec.species];
    this.shadows.push({
      ...spec,
      x: initial ? range(g.rng, 40, W - 40) : dir === 1 ? -60 : W + 60,
      y: depthToY(spec.depth),
      dir,
      speed: range(g.rng, 22, 42) * (sp.treasure ? 0.3 : 1) * (1 + sp.difficulty * 0.6),
      phase: g.rng() * 10,
      state: 'swim',
      alpha: initial ? 1 : 0,
      locked: spec.depth > this.reach + 0.02,
    });
  }

  // ---------- Input ----------
  down(_x: number, _y: number): void {
    this.holding = true;
    if (this.phase === 'aim') {
      this.phase = 'charging';
      this.holdTime = 0;
    } else if (this.phase === 'bite') {
      this.hook();
    } else if (this.phase === 'waiting') {
      this.earlyTapT = 1.2;
    } else if (this.phase === 'card' && this.card && this.card.t > 0.6) {
      this.closeCard();
    }
  }

  up(_x: number, _y: number): void {
    this.holding = false;
    if (this.phase === 'charging') this.cast();
  }

  // ---------- Flow ----------
  private cast(): void {
    const s = this.game.state;
    this.castsLeft--;
    s.stats.casts++;
    analytics.funnelStep('first_cast');
    const { distance, tangled } = castDistance(this.power, this.reach);
    analytics.track('cast', { power: Math.round(this.power * 100) / 100, sea: this.sea, tangled });
    if (tangled) {
      // Overcharged: the line knots up and the cast is lost. Honest, visible on the meter.
      s.stats.tangles++;
      this.game.shake = 0.3;
      vibrate([20, 30, 20]);
      this.lose('Tangled line! Release before the red', 'tangled');
      return;
    }
    this.phase = 'flying';
    this.bobber = { x: W / 2, y: depthToY(distance), t: 0, dip: 0 };
    sfx.cast();
  }

  private landed(): void {
    sfx.splash();
    this.game.particles.burst(this.bobber.x, this.bobber.y, 14, ['#ffffff', '#bfe9f2'], { speed: 120, size: 3, up: true, g: 400, life: 0.6 });
    // Attract the closest shadow near the landing point. Aim decides which fish you get.
    const R = 95;
    let best: Shadow | null = null;
    let bestD = Infinity;
    for (const sh of this.shadows) {
      if (sh.state !== 'swim' || sh.locked) continue;
      const d = Math.hypot((sh.x - this.bobber.x) * 0.6, sh.y - this.bobber.y);
      if (d < bestD) {
        bestD = d;
        best = sh;
      }
    }
    this.phase = 'waiting';
    this.nibbles = 0;
    if (best && bestD < R) {
      this.target = best;
      this.waitTimer = range(this.game.rng, 0.6, 1.2) * this.waitScale();
    } else {
      // Missed every shadow: the nearest fish still notices, but it takes longer (no dead ends).
      this.target = best;
      this.waitTimer = range(this.game.rng, 1.6, 2.4) * this.waitScale();
    }
    if (this.target) this.target.state = 'approach';
  }

  private startBite(): void {
    this.phase = 'bite';
    this.biteTimer = BALANCE.hookBite[this.game.state.upgrades.hook] + (this.tutorial ? 0.8 : 0);
    sfx.bite();
    vibrate([30, 30, 60]);
    this.game.particles.burst(this.bobber.x, this.bobber.y, 18, ['#ffffff', '#bfe9f2'], { speed: 180, size: 4, up: true, g: 500, life: 0.7 });
    analytics.funnelStep('first_bite');
  }

  private hook(): void {
    if (!this.target) return;
    const sp = SPECIES_BY_ID[this.target.species];
    this.phase = 'reel';
    this.target.state = 'hooked';
    const up = this.game.state.upgrades;
    this.reel = new Reel({ difficulty: sp.difficulty, rodLevel: up.rod, hookLevel: up.hook, assist: this.tutorial, zoneMult: this.effects.has('pearl') ? 1.5 : 1 }, this.game.rng);
    this.hintT = 0;
    sfx.splash();
    vibrate(40);
    this.game.shake = 0.4;
    analytics.track('hook', { species: sp.id, reaction: Math.round((BALANCE.hookBite[up.hook] - this.biteTimer) * 1000) });
  }

  private lose(text: string, reason: string): void {
    const sp = this.target ? SPECIES_BY_ID[this.target.species] : null;
    analytics.track('fish_lost', { reason, species: sp?.id ?? 'none' });
    this.phase = 'result';
    this.resultText = text;
    this.resultColor = '#ffd9cc';
    this.resultT = 0;
    if (this.target && this.target.state !== 'swim') {
      this.target.state = 'flee';
      this.target.dir = this.target.x < W / 2 ? -1 : 1;
    }
    this.target = null;
    this.reel = null;
    sfx.fail();
  }

  private landFish(): void {
    const sh = this.target!;
    const r = this.reel!;
    const s = this.game.state;
    const fresh = r.freshness;
    const res = addCatch(s, sh.species, sh.size, fresh, this.sea, this.game.rng);
    const sp = SPECIES_BY_ID[sh.species];
    this.tripCatches.push(res.fish);
    if (sp.treasure) this.tripTreasure += sp.raw;
    if (res.gadget) this.tripGadgets.push(res.gadget);
    // Octo Net doubles the next real fish (not crates or treasure).
    let doubled = false;
    if (this.effects.has('octo') && !sp.treasure && !sp.crate) {
      this.tripCatches.push(duplicateCatch(s, res.fish));
      this.effects.delete('octo');
      doubled = true;
    }
    this.tripXp += res.xp;
    if (res.levelUps > 0) this.game.levelUp();
    this.shadows = this.shadows.filter((x) => x !== sh);
    this.card = { ...res, t: 0, doubled };
    this.phase = 'card';
    this.target = null;
    this.reel = null;
    if (sp.rarity >= 3) sfx.rare();
    else sfx.catch();
    vibrate(sp.rarity >= 3 ? [40, 40, 40, 40, 120] : 60);
    const colors = sp.rarity >= 3 ? [RARITY_COLOR[sp.rarity], COLORS.gold, '#fff'] : ['#ffffff', '#bfe9f2', COLORS.gold];
    this.game.particles.burst(W / 2, 260, sp.rarity >= 3 ? 60 : 26, colors, { speed: 320, kind: sp.rarity >= 3 ? 'star' : 'confetti', size: 7, g: 300, life: 1.3 });
    analytics.track('catch', { species: sp.id, rarity: sp.rarity, size: sh.size, fresh: Math.round(fresh * 100) / 100, perfect: res.fish.perfect, isNew: res.isNew, sea: this.sea, gadget: res.gadget ?? '' });
    analytics.funnelStep('first_catch', { species: sp.id });
    if (res.isNew) analytics.track('dex_new', { species: sp.id, total: Object.keys(s.dex).length });
    this.game.commit();
    this.spawnShadow();
  }

  private closeCard(): void {
    this.card = null;
    this.nextCast();
  }

  private nextCast(): void {
    if (this.castsLeft <= 0) this.endTrip();
    else this.phase = 'aim';
  }

  endTrip(): void {
    const s = this.game.state;
    this.fullTrip = this.castsLeft <= 0;
    finishTrip(s, this.fullTrip);
    analytics.track('trip_end', { sea: this.sea, catches: this.tripCatches.length, casts: this.totalCasts - this.castsLeft, trip: s.stats.trips });
    this.game.commit();
    this.phase = 'summary';
    this.t = 0;
  }

  // ---------- Update ----------
  update(dt: number): void {
    this.t += dt;
    this.hintT += dt;
    this.earlyTapT = Math.max(0, this.earlyTapT - dt);
    for (const sh of this.shadows) this.updateShadow(sh, dt);
    if (this.phase === 'aim' || this.phase === 'charging') this.refreshLocks();
    this.shadows = this.shadows.filter((sh) => !(sh.state === 'flee' && (sh.x < -100 || sh.x > W + 100)));
    while (this.shadows.filter((s) => s.state === 'swim' || s.state === 'approach').length < 5) this.spawnShadow();
    if (this.card) this.card.t += dt;

    switch (this.phase) {
      case 'charging':
        this.holdTime += dt;
        this.power = castPower(this.holdTime);
        break;
      case 'flying':
        this.bobber.t += dt / 0.55;
        if (this.bobber.t >= 1) this.landed();
        break;
      case 'waiting': {
        this.waitTimer -= dt;
        const tg = this.target;
        if (!tg) {
          if (this.waitTimer <= 0) this.lose('Nothing bit…', 'nothing');
          break;
        }
        if (this.waitTimer <= 0) {
          const close = Math.hypot(tg.x - this.bobber.x, tg.y - this.bobber.y) < 30;
          if (!close) break;
          if (this.nibbles < 2 && this.game.rng() < 0.7) {
            this.nibbles++;
            this.bobber.dip = 1;
            sfx.nibble();
            vibrate(10);
            this.waitTimer = range(this.game.rng, 0.45, 0.8);
          } else {
            this.startBite();
          }
        }
        break;
      }
      case 'bite':
        this.biteTimer -= dt;
        if (this.biteTimer <= 0) this.lose('Too slow! It got away', 'missed_bite');
        break;
      case 'reel': {
        const r = this.reel!;
        const res = r.step(dt, this.holding);
        this.reelTick -= dt;
        if (this.holding && this.reelTick <= 0) {
          sfx.reelTick(r.tension);
          this.reelTick = 0.08;
        }
        if (r.strain > 0.15 && Math.floor(this.t * 10) % 3 === 0) sfx.strain();
        if (r.thrash > 0.2) {
          this.game.particles.burst(this.target!.x, this.target!.y, 3, ['#ffffff'], { speed: 90, size: 3, up: true, g: 300, life: 0.4 });
          vibrate(15);
        }
        if (this.target) {
          // Fish is dragged toward the boat as progress rises.
          const hookY = this.bobber.y;
          const k = clamp01(r.progress);
          this.target.y = hookY + (NEAR_Y + 40 - hookY) * k;
          this.target.x = W / 2 + Math.sin(this.t * (2 + r.thrash * 20)) * (14 + r.thrash * 60);
        }
        if (res === 'caught') this.landFish();
        else if (res === 'snapped') {
          this.game.shake = 0.6;
          sfx.snap();
          this.lose('Snap! The line broke', 'snapped');
        } else if (res === 'escaped') this.lose('It slipped away…', 'escaped');
        break;
      }
      case 'result':
        this.resultT += dt;
        if (this.resultT > 1.4) this.nextCast();
        break;
      default:
        break;
    }
    this.bobber.dip = Math.max(0, this.bobber.dip - dt * 4);
  }

  private updateShadow(sh: Shadow, dt: number): void {
    sh.phase += dt * (3 + sh.speed / 10);
    sh.alpha = Math.min(1, sh.alpha + dt);
    if (sh.state === 'swim') {
      sh.x += sh.dir * sh.speed * dt;
      sh.y += Math.sin(sh.phase * 0.3) * 4 * dt;
      if (sh.x > W + 70) sh.dir = -1;
      if (sh.x < -70) sh.dir = 1;
    } else if (sh.state === 'approach') {
      const dx = this.bobber.x - sh.x;
      const dy = this.bobber.y + 6 - sh.y;
      const d = Math.hypot(dx, dy);
      const sp = Math.max(sh.speed * 1.6, 50);
      if (d > 2) {
        sh.x += (dx / d) * Math.min(d, sp * dt);
        sh.y += (dy / d) * Math.min(d, sp * dt);
        sh.dir = dx > 0 ? 1 : -1;
      }
    } else if (sh.state === 'flee') {
      sh.x += sh.dir * 260 * dt;
      sh.alpha = Math.max(0, sh.alpha - dt);
    }
  }

  // ---------- Draw ----------
  /** Screen y where the cast would land right now (the 3D reticle follows this). */
  aimScreenY(): number {
    if (this.phase !== 'charging') return depthToY(0.35 + Math.sin(this.t * 1.5) * 0.05);
    return depthToY(castDistance(Math.min(this.power, BALANCE.overcast), this.reach).distance);
  }

  /** True while the meter sits in the red overcast band (the 3D reticle turns red). */
  get overcharged(): boolean {
    return this.phase === 'charging' && this.power > BALANCE.overcast;
  }

  draw(ctx: Ctx): void {
    // Water, fish, boat, line and reticle are rendered in 3D (render3d/world.ts); this is the UI layer.
    this.drawPowerMeter(ctx);
    this.drawHud(ctx);
    if (this.phase === 'reel' && this.reel) this.drawReelUi(ctx, this.reel);
    this.drawPrompts(ctx);
    if (this.phase === 'result') {
      const k = clamp01(this.resultT / 0.3);
      outlinedText(ctx, this.resultText, W / 2, 380 - k * 10, 26, this.resultColor, COLORS.ink, 6);
    }
    if (this.phase === 'card' && this.card) this.drawCard(ctx);
    if (this.phase === 'summary') this.drawSummary(ctx);
  }

  private drawPowerMeter(ctx: Ctx): void {
    if (this.phase !== 'charging') return;
    const x = 30;
    const top = 470;
    const h = 220;
    panel(ctx, x - 12, top - 12, 24, h + 24, 'rgba(255,248,236,0.9)', 12);
    // red overcast band at the top: release there and the line tangles
    const red = h * (1 - BALANCE.overcast);
    ctx.fillStyle = 'rgba(216,71,59,0.35)';
    rr(ctx, x - 7, top, 14, red, 6);
    ctx.fill();
    const g = ctx.createLinearGradient(0, top + h, 0, top);
    g.addColorStop(0, '#7fd18b');
    g.addColorStop(1, '#2d7fd8');
    ctx.fillStyle = this.overcharged ? COLORS.bad : g;
    rr(ctx, x - 7, top + h * (1 - this.power), 14, h * this.power, 6);
    ctx.fill();
    ctx.fillStyle = COLORS.bad;
    ctx.fillRect(x - 12, top + red - 1, 24, 3);
    text(ctx, 'TANGLE', x + 4, top - 22, 10, COLORS.bad, 'left');
    text(ctx, 'near', x, top + h + 22, 11, '#fff');
  }

  private drawHud(ctx: Ctx): void {
    // bait remaining
    panel(ctx, 10, 12, 176, 44, 'rgba(255,248,236,0.95)', 14);
    text(ctx, 'Casts', 22, 34, 14, COLORS.ink, 'left');
    for (let i = 0; i < this.totalCasts; i++) {
      const filled = i < this.castsLeft;
      ctx.fillStyle = filled ? '#e74c3c' : 'rgba(43,33,24,0.15)';
      ctx.beginPath();
      ctx.arc(76 + i * (this.totalCasts > 5 ? 17 : 21), 34, 7, 0, Math.PI * 2);
      ctx.fill();
      if (filled) {
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    panel(ctx, W - 130, 12, 120, 44, 'rgba(255,248,236,0.95)', 14);
    text(ctx, `Caught ${this.tripCatches.length}`, W - 70, 34, 16, COLORS.ink);
    text(ctx, SEAS_BY_ID[this.sea].name.toUpperCase(), W / 2, 74, 13, 'rgba(255,255,255,0.85)');
    // active effects
    [...this.effects].forEach((id, i) => {
      const gd = GADGETS[id];
      ctx.fillStyle = gd.color;
      rr(ctx, W - 130, 64 + i * 26, 120, 22, 11);
      ctx.fill();
      text(ctx, gd.name, W - 70, 75 + i * 26, 12, '#fff');
    });
    if (this.phase === 'aim') {
      this.game.button(ctx, 'leave', 10, 66, 92, 34, 'Dock', () => this.endTrip(), { color: '#8a7a66', dark: '#5f5244', size: 15 });
      this.drawItemBar(ctx);
    }
    this.drawShadowLabels(ctx);
  }

  /** Gadgets usable on a trip, as buttons along the bottom-left. */
  private drawItemBar(ctx: Ctx): void {
    const s = this.game.state;
    const usable = (Object.keys(GADGETS) as GadgetId[]).filter((id) => GADGETS[id].scope !== 'jar' && (s.gadgets[id] ?? 0) > 0 && !this.effects.has(id));
    usable.forEach((id, i) => {
      const gd = GADGETS[id];
      const x = 12 + i * 62;
      const y = 776;
      this.game.button(ctx, `gadget_${id}`, x, y, 56, 52, gd.icon, () => this.useGadget(id), { color: gd.color, dark: '#3a2a4a', size: 22 });
      ctx.fillStyle = COLORS.paper;
      ctx.beginPath();
      ctx.arc(x + 50, y + 4, 10, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, String(s.gadgets[id]), x + 50, y + 5, 12, COLORS.ink);
    });
    if (usable.length) text(ctx, 'Gadgets: tap to use', 12, 764, 11, '#fff', 'left');
  }

  /** Locked deep fish say why; the Sonar Shell names every shadow. */
  private drawShadowLabels(ctx: Ctx): void {
    if (this.phase === 'card' || this.phase === 'summary') return;
    const sonar = this.effects.has('sonar');
    let lockedShown = 0;
    for (const sh of this.shadows) {
      if (sh.state === 'flee' || sh.alpha < 0.5) continue;
      if (sonar) {
        const sp = SPECIES_BY_ID[sh.species];
        ctx.font = '700 11px sans-serif';
        const w = ctx.measureText(sp.name).width + 12;
        const sx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, sh.x));
        ctx.fillStyle = RARITY_COLOR[sp.rarity];
        rr(ctx, sx - w / 2, sh.y - 34, w, 18, 9);
        ctx.fill();
        text(ctx, sp.name, sx, sh.y - 25, 11, '#fff');
      }
      if (sh.locked && (this.phase === 'aim' || this.phase === 'charging') && lockedShown < 2) {
        lockedShown++;
        const lx = Math.max(60, Math.min(W - 60, sh.x));
        ctx.fillStyle = 'rgba(43,33,24,0.75)';
        rr(ctx, lx - 52, sh.y + (sonar ? -56 : -30), 104, 18, 9);
        ctx.fill();
        text(ctx, 'Need longer line', lx, sh.y + (sonar ? -47 : -21), 11, '#fff');
      }
    }
  }

  private drawReelUi(ctx: Ctx, r: Reel): void {
    const x = 40;
    const y = 150; // top of screen: keeps the fight between bobber and boat visible
    const w = W - 80;
    const h = 28;
    panel(ctx, x - 10, y - 46, w + 20, h + 70, 'rgba(255,248,236,0.94)', 16);
    // distance / progress
    const sp = SPECIES_BY_ID[this.target?.species ?? 'anchovy'];
    text(ctx, sp.rarity >= 3 ? 'Something big…' : 'Fish on!', x, y - 26, 15, COLORS.ink, 'left');
    ctx.fillStyle = 'rgba(43,33,24,0.12)';
    rr(ctx, x + 120, y - 32, w - 120, 12, 6);
    ctx.fill();
    ctx.fillStyle = COLORS.good;
    rr(ctx, x + 120, y - 32, (w - 120) * clamp01(r.progress), 12, 6);
    ctx.fill();
    // tension track
    ctx.fillStyle = '#d6ecf3';
    rr(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(216,71,59,0.8)';
    rr(ctx, x + w * 0.93, y, w * 0.07, h, 8);
    ctx.fill();
    const zx = x + w * r.zoneLow;
    const zw = w * r.zoneWidth;
    ctx.fillStyle = r.inZone ? '#5fd36b' : '#8ed497';
    rr(ctx, zx, y + 2, zw, h - 4, 8);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COLORS.ink;
    rr(ctx, x, y, w, h, 10);
    ctx.stroke();
    // needle
    const nx = x + w * r.tension;
    ctx.fillStyle = r.strain > 0.1 ? COLORS.bad : COLORS.ink;
    ctx.beginPath();
    ctx.moveTo(nx, y - 4);
    ctx.lineTo(nx - 8, y - 14);
    ctx.lineTo(nx + 8, y - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(nx - 2, y - 4, 4, h + 8);
    text(ctx, 'slack', x + 4, y + h + 13, 11, 'rgba(43,33,24,0.6)', 'left');
    text(ctx, 'snap!', x + w - 4, y + h + 13, 11, COLORS.bad, 'right');
    text(ctx, r.inZone ? 'Perfect tension!' : r.tension > r.zoneHigh ? 'Too tight — let go' : 'Too loose — hold', W / 2, y + h + 13, 12, r.inZone ? COLORS.good : COLORS.ink);
  }

  private drawPrompts(ctx: Ctx): void {
    const pulse = 1 + Math.sin(this.t * 5) * 0.05;
    if (this.phase === 'aim') {
      outlinedText(ctx, 'HOLD to aim', W / 2, 420, 30 * pulse, '#fff', COLORS.ink, 6);
      text(ctx, 'release to cast at a shadow', W / 2, 452, 16, '#fff');
      this.drawHand(ctx, W / 2 + 40, 640, true);
    } else if (this.phase === 'charging') {
      outlinedText(ctx, 'Release!', W / 2, 420, 26, '#fff', COLORS.ink, 6);
    } else if (this.phase === 'waiting') {
      outlinedText(ctx, this.earlyTapT > 0 ? 'Not yet… wait for the splash' : 'Wait for it…', W / 2, 420, 22, '#fff', COLORS.ink, 5);
    } else if (this.phase === 'bite') {
      const k = 1 + Math.sin(this.t * 30) * 0.08;
      outlinedText(ctx, '!', this.bobber.x, this.bobber.y - 50, 64 * k, COLORS.gold, COLORS.ink, 7);
      outlinedText(ctx, 'TAP!', W / 2, 420, 46 * k, '#fff', COLORS.ink, 7);
    } else if (this.phase === 'reel' && this.hintT < 4) {
      outlinedText(ctx, 'HOLD to reel · let go to ease', W / 2, 250, 18, '#fff', COLORS.ink, 5);
    }
  }

  drawHand(ctx: Ctx, x: number, y: number, holdAnim: boolean): void {
    const press = holdAnim ? (Math.sin(this.t * 3) > 0 ? 1 : 0) : 0;
    ctx.save();
    ctx.translate(x, y + press * 6);
    ctx.rotate(-0.3);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 3;
    rr(ctx, -10, -34, 20, 46, 10);
    ctx.fill();
    ctx.stroke();
    rr(ctx, -16, 0, 34, 34, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (press) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x - 8, y - 34, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawCard(ctx: Ctx): void {
    // The fish itself leaps up as a 3D trophy above this panel (see FishingRig.updateTrophy).
    const c = this.card!;
    const sp = SPECIES_BY_ID[c.fish.species];
    const k = ease.outBack(clamp01((c.t - 0.25) / 0.4));
    ctx.save();
    ctx.translate(W / 2, 520);
    ctx.scale(k, k);
    panel(ctx, -160, -80, 320, 200, COLORS.paper, 24);
    ctx.fillStyle = RARITY_COLOR[sp.rarity];
    rr(ctx, -80, -98, 160, 34, 14);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 3;
    ctx.stroke();
    outlinedText(ctx, RARITY_LABEL[sp.rarity].toUpperCase(), 0, -81, 17, '#fff', COLORS.ink, 4);
    outlinedText(ctx, sp.name, 0, -38, 30, '#fff', COLORS.ink, 6);
    text(ctx, sp.local, 0, -10, 15, 'rgba(43,33,24,0.6)', 'center', 600);
    if (c.gadget) {
      // Mystery Crate: show what was inside and what it does
      const gd = GADGETS[c.gadget];
      ctx.fillStyle = gd.color;
      rr(ctx, -120, 6, 240, 30, 12);
      ctx.fill();
      outlinedText(ctx, `Found: ${gd.name}!`, 0, 21, 17, '#fff', COLORS.ink, 4);
      ctx.font = '600 12px sans-serif';
      wrapText(ctx, gd.desc, 280).forEach((l, i) => text(ctx, l, 0, 52 + i * 15, 12, COLORS.ink, 'center', 600));
    } else text(ctx, sp.treasure ? `+${sp.raw} coins!` : `${c.fish.size} cm`, 0, 20, 22, COLORS.ink);
    text(ctx, `+${c.xp} XP`, 130, 104, 12, '#a35bd6', 'right', 900);
    if (!sp.treasure && !sp.crate) {
      const fresh = c.fish.freshness;
      const stars = fresh >= 0.8 ? 3 : fresh >= 0.5 ? 2 : 1;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < stars ? COLORS.gold : 'rgba(43,33,24,0.15)';
        star(ctx, -36 + i * 36, 56, 14);
        if (i < stars) {
          ctx.strokeStyle = COLORS.ink;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      text(ctx, c.fish.perfect ? 'PERFECT CATCH — extra fresh!' : stars === 2 ? 'Good catch' : 'Bruised — less fresh', 0, 88, 14, c.fish.perfect ? COLORS.good : COLORS.ink);
    }
    ctx.restore();
    if (c.doubled && c.t > 0.4) outlinedText(ctx, 'x2  OCTO NET!', W / 2, 395, 22, '#d9a8ff', COLORS.ink, 5);
    if (c.isNew && c.t > 0.5) {
      ctx.save();
      ctx.translate(W / 2 + 140, 440);
      ctx.rotate(0.25);
      const nk = ease.outElastic(clamp01((c.t - 0.5) / 0.6));
      ctx.scale(nk, nk);
      ctx.fillStyle = COLORS.bad;
      star(ctx, 0, 0, 38);
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      outlinedText(ctx, 'NEW!', 0, 2, 17, '#fff', COLORS.ink, 4);
      ctx.restore();
    } else if (c.isRecord && c.t > 0.5) {
      outlinedText(ctx, 'NEW RECORD SIZE!', W / 2, 410, 20, COLORS.gold, COLORS.ink, 5);
    }
    if (c.t > 0.6) outlinedText(ctx, 'tap to continue', W / 2, 680, 16, '#fff', COLORS.ink, 4);
  }

  private drawSummary(ctx: Ctx): void {
    const s = this.game.state;
    ctx.fillStyle = 'rgba(10,30,40,0.6)';
    ctx.fillRect(0, 0, W, H);
    const k = ease.outBack(clamp01(this.t / 0.4));
    ctx.save();
    ctx.translate(W / 2, 400);
    ctx.scale(k, k);
    panel(ctx, -170, -250, 340, 460, COLORS.paper, 24);
    outlinedText(ctx, 'Trip complete!', 0, -212, 30, '#fff', COLORS.ink, 6);
    const fish = this.tripCatches.filter((f) => !SPECIES_BY_ID[f.species].treasure && !SPECIES_BY_ID[f.species].crate);
    if (this.tripCatches.length === 0) {
      text(ctx, 'The sea was quiet today.', 0, -120, 18);
      text(ctx, 'Aim the circle at a shadow!', 0, -90, 15, 'rgba(43,33,24,0.7)');
    }
    fish.slice(0, 9).forEach((f, i) => {
      const cx = -110 + (i % 3) * 110;
      const cy = -140 + Math.floor(i / 3) * 80;
      ctx.fillStyle = 'rgba(43,33,24,0.06)';
      rr(ctx, cx - 48, cy - 34, 96, 68, 12);
      ctx.fill();
      drawFish(ctx, f.species, cx, cy - 6, 62, { wiggle: this.t * 4 + i });
      text(ctx, `${f.size}cm${f.perfect ? ' ★' : ''}`, cx, cy + 22, 12, COLORS.ink);
    });
    if (this.tripTreasure > 0) text(ctx, `Treasure: +${this.tripTreasure} coins`, 0, 95, 18, '#b8860b');
    text(ctx, `+${this.tripXp} XP`, 0, 72, 15, '#a35bd6', 'center', 900);
    if (this.tripGadgets.length) text(ctx, `Found: ${this.tripGadgets.map((g) => GADGETS[g].name).join(', ')}`, 0, 165, 13, '#7a5aa8', 'center', 900);
    const ready = s.jars.filter((j) => j.sealed && agingLevel(s, j, Date.now()) >= 1).length;
    if (ready > 0) {
      const p = 1 + Math.sin(this.t * 5) * 0.05;
      outlinedText(ctx, ready === 1 ? 'Your jar is ready to open!' : `${ready} jars are ready!`, 0, 130, 20 * p, COLORS.gold, COLORS.ink, 5);
    } else if (!this.fullTrip && s.jars.some((j) => j.sealed)) {
      text(ctx, 'Docked early: jars only age on full trips', 0, 130, 15, COLORS.bad);
    } else if (s.bucket.length >= BALANCE.jarSlots && s.jars.some((j) => !j.sealed)) {
      text(ctx, 'You have enough fish to fill a jar!', 0, 130, 16, COLORS.good);
    }
    ctx.restore();
    if (this.t > 0.4) {
      this.game.button(ctx, 'home', W / 2 - 120, 540, 240, 64, 'Back to village', () => this.game.goVillage(), { pulse: true, color: COLORS.good, dark: '#2f7a3b' });
    }
  }
}

function wrapText(ctx: Ctx, s: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
