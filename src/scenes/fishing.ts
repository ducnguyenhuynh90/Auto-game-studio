// Fishing trip: aim (hold to charge) → cast → approach/nibble → bite (tap) → reel (hold/release) → catch card.
import { analytics } from '../core/analytics';
import { BALANCE, RARITY_COLOR, RARITY_LABEL, SPECIES_BY_ID, type ZoneId } from '../core/data';
import { Reel, castPower, rollShadow, type ShadowSpec } from '../core/fishing';
import { range } from '../core/rng';
import { addCatch, agingLevel, finishTrip, type CaughtFish } from '../core/state';
import { sfx, vibrate } from '../render/audio';
import { COLORS, H, W, clamp01, drawFish, ease, outlinedText, panel, rr, star, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

const NEAR_Y = 600;
const FAR_Y = 175;
const ROD_TIP = { x: 222, y: 668 };
const BOAT_Y = 745;

interface Shadow extends ShadowSpec {
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  state: 'swim' | 'approach' | 'hooked' | 'flee';
  alpha: number;
}

type Phase = 'aim' | 'charging' | 'flying' | 'waiting' | 'bite' | 'reel' | 'result' | 'card' | 'summary';

function depthToY(d: number): number {
  return NEAR_Y - d * (NEAR_Y - FAR_Y);
}

function shadowLen(sp: ShadowSpec): number {
  // On-screen size grows with real size but compressed so tiny fish stay visible.
  return 22 + Math.sqrt(sp.size) * 7.5;
}

export class FishingScene implements Scene {
  name = 'fishing';
  phase: Phase = 'aim';
  shadows: Shadow[] = [];
  castsLeft = BALANCE.castsPerTrip;
  holdTime = 0;
  power = 0;
  bobber = { x: W / 2, y: NEAR_Y, sx: 0, sy: 0, t: 0, dip: 0 };
  target: Shadow | null = null;
  waitTimer = 0;
  nibbles = 0;
  biteTimer = 0;
  reel: Reel | null = null;
  holding = false;
  resultText = '';
  resultColor = '#fff';
  resultT = 0;
  card: { fish: CaughtFish; isNew: boolean; isRecord: boolean; t: number } | null = null;
  tripCatches: CaughtFish[] = [];
  tripTreasure = 0;
  hintT = 0;
  earlyTapT = 0;
  t = 0;
  reelTick = 0;

  constructor(
    private game: Game,
    readonly zone: ZoneId,
  ) {
    for (let i = 0; i < 5; i++) this.spawnShadow(true);
    const s = game.state;
    analytics.track('trip_start', { zone, trip: s.stats.trips + 1 });
    if (s.stats.trips === 1) analytics.funnelStep('second_trip_start');
    if (s.stats.trips === 2) analytics.funnelStep('third_trip_start');
    if (zone === 'reef') analytics.funnelStep('first_reef_trip');
  }

  private get tutorial(): boolean {
    return this.game.state.stats.catches === 0;
  }

  spawnShadow(initial = false): void {
    const g = this.game;
    let spec = rollShadow(g.rng, this.zone);
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
    this.phase = 'flying';
    this.castsLeft--;
    s.stats.casts++;
    const ty = depthToY(this.power);
    this.bobber = { x: W / 2, y: ty, sx: ROD_TIP.x, sy: ROD_TIP.y, t: 0, dip: 0 };
    sfx.cast();
    analytics.track('cast', { power: Math.round(this.power * 100) / 100, zone: this.zone });
    analytics.funnelStep('first_cast');
  }

  private landed(): void {
    sfx.splash();
    this.game.particles.burst(this.bobber.x, this.bobber.y, 14, ['#ffffff', '#bfe9f2'], { speed: 120, size: 3, up: true, g: 400, life: 0.6 });
    // Attract the closest shadow near the landing point. Aim decides which fish you get.
    const R = 95;
    let best: Shadow | null = null;
    let bestD = Infinity;
    for (const sh of this.shadows) {
      if (sh.state !== 'swim') continue;
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
      this.waitTimer = range(this.game.rng, 0.6, 1.2);
    } else {
      // Missed every shadow: the nearest fish still notices, but it takes longer (no dead ends).
      this.target = best;
      this.waitTimer = range(this.game.rng, 1.6, 2.4);
    }
    if (this.target) this.target.state = 'approach';
  }

  private startBite(): void {
    this.phase = 'bite';
    const rod = this.game.state.upgrades.rod;
    this.biteTimer = BALANCE.rodBite[rod] + (this.tutorial ? 0.8 : 0);
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
    this.reel = new Reel({ difficulty: sp.difficulty, rodLevel: this.game.state.upgrades.rod, assist: this.tutorial }, this.game.rng);
    this.hintT = 0;
    sfx.splash();
    vibrate(40);
    this.game.shake = 0.4;
    analytics.track('hook', { species: sp.id, reaction: Math.round((BALANCE.rodBite[this.game.state.upgrades.rod] - this.biteTimer) * 1000) });
  }

  private lose(text: string, reason: string): void {
    const sp = this.target ? SPECIES_BY_ID[this.target.species] : null;
    analytics.track('fish_lost', { reason, species: sp?.id ?? 'none' });
    this.phase = 'result';
    this.resultText = text;
    this.resultColor = '#ffd9cc';
    this.resultT = 0;
    if (this.target) {
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
    const res = addCatch(s, sh.species, sh.size, fresh);
    const sp = SPECIES_BY_ID[sh.species];
    this.tripCatches.push(res.fish);
    if (sp.treasure) this.tripTreasure += sp.raw;
    this.shadows = this.shadows.filter((x) => x !== sh);
    this.card = { ...res, t: 0 };
    this.phase = 'card';
    this.target = null;
    this.reel = null;
    if (sp.rarity >= 3) sfx.rare();
    else sfx.catch();
    vibrate(sp.rarity >= 3 ? [40, 40, 40, 40, 120] : 60);
    const colors = sp.rarity >= 3 ? [RARITY_COLOR[sp.rarity], COLORS.gold, '#fff'] : ['#ffffff', '#bfe9f2', COLORS.gold];
    this.game.particles.burst(W / 2, 330, sp.rarity >= 3 ? 60 : 26, colors, { speed: 320, kind: sp.rarity >= 3 ? 'star' : 'confetti', size: 7, g: 300, life: 1.3 });
    analytics.track('catch', { species: sp.id, rarity: sp.rarity, size: sh.size, fresh: Math.round(fresh * 100) / 100, perfect: res.fish.perfect, isNew: res.isNew, zone: this.zone });
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
    finishTrip(s);
    analytics.track('trip_end', { zone: this.zone, catches: this.tripCatches.length, casts: BALANCE.castsPerTrip - this.castsLeft, trip: s.stats.trips });
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
  draw(ctx: Ctx): void {
    this.drawWater(ctx);
    for (const sh of this.shadows) this.drawShadow(ctx, sh);
    this.drawAimGuide(ctx);
    this.drawLineAndBobber(ctx);
    this.drawBoat(ctx);
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

  private drawWater(ctx: Ctx): void {
    const reef = this.zone === 'reef';
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, reef ? '#ffcf9c' : '#ffd9a8');
    g.addColorStop(0.09, reef ? '#ffb88a' : '#ffe9c4');
    g.addColorStop(0.1, reef ? '#0c4f6e' : '#1b7f9a');
    g.addColorStop(0.55, reef ? '#137291' : '#2aa3b9');
    g.addColorStop(1, reef ? '#1d97a8' : '#5cc9cf');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // distant islands
    ctx.fillStyle = reef ? 'rgba(40,70,80,0.55)' : 'rgba(60,110,90,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, 85);
    ctx.quadraticCurveTo(50, 50, 110, 84);
    ctx.quadraticCurveTo(140, 70, 170, 85);
    ctx.lineTo(0, 85);
    ctx.moveTo(260, 85);
    ctx.quadraticCurveTo(320, 40, 390, 80);
    ctx.lineTo(390, 85);
    ctx.fill();
    // sun
    ctx.fillStyle = 'rgba(255,240,200,0.9)';
    ctx.beginPath();
    ctx.arc(300, 52, 18, 0, Math.PI * 2);
    ctx.fill();
    // wave lines
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const y = 110 + i * 46 + Math.sin(this.t * 0.8 + i) * 4;
      const off = (this.t * 12 * (i % 2 ? 1 : -1) + i * 70) % 120;
      ctx.beginPath();
      for (let x = -120 + off; x < W + 60; x += 120) {
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 15, y - 5, x + 30, y);
      }
      ctx.stroke();
    }
    // depth hints
    text(ctx, 'deep water', W - 12, FAR_Y - 40, 12, 'rgba(255,255,255,0.35)', 'right');
    text(ctx, 'shallows', W - 12, NEAR_Y + 30, 12, 'rgba(255,255,255,0.35)', 'right');
  }

  private drawShadow(ctx: Ctx, sh: Shadow): void {
    const sp = SPECIES_BY_ID[sh.species];
    const len = shadowLen(sh);
    const hooked = sh.state === 'hooked';
    ctx.save();
    ctx.globalAlpha = sh.alpha * (hooked ? 0.9 : 0.75);
    // Rarity shimmer is an honest signal: what you see is what is there.
    if (sp.rarity >= 4) {
      const pulse = 0.5 + Math.sin(this.t * 4 + sh.phase) * 0.3;
      const gg = ctx.createRadialGradient(sh.x, sh.y, 0, sh.x, sh.y, len);
      gg.addColorStop(0, sp.id === 'golden' ? `rgba(255,215,90,${pulse})` : `rgba(200,150,255,${pulse * 0.8})`);
      gg.addColorStop(1, 'rgba(255,215,90,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, len, 0, Math.PI * 2);
      ctx.fill();
    } else if (sp.treasure) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.sin(this.t * 6) * 0.3})`;
      star(ctx, sh.x + len * 0.3, sh.y - len * 0.25, 5);
    }
    ctx.translate(sh.x, sh.y);
    if (sh.dir < 0) ctx.scale(-1, 1);
    ctx.fillStyle = hooked ? 'rgba(10,30,40,0.75)' : 'rgba(8,40,55,0.55)';
    const h = len * 0.32;
    const tail = Math.sin(sh.phase) * h * 0.3;
    ctx.beginPath();
    ctx.ellipse(0, 0, len * 0.45, h / 2, 0, 0, Math.PI * 2);
    ctx.moveTo(-len * 0.38, 0);
    ctx.lineTo(-len * 0.62, -h * 0.5 + tail);
    ctx.lineTo(-len * 0.62, h * 0.5 + tail);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawAimGuide(ctx: Ctx): void {
    if (this.phase !== 'charging' && this.phase !== 'aim') return;
    const y = depthToY(this.phase === 'charging' ? this.power : 0.35 + Math.sin(this.t * 1.5) * 0.05);
    ctx.save();
    ctx.globalAlpha = this.phase === 'charging' ? 1 : 0.45;
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ROD_TIP.x, ROD_TIP.y);
    ctx.quadraticCurveTo(W / 2 + 20, (ROD_TIP.y + y) / 2 - 80, W / 2, y);
    ctx.stroke();
    ctx.setLineDash([]);
    // landing reticle
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(W / 2, y, 34, 13, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(W / 2, y, 6, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
    if (this.phase === 'charging') {
      // power meter beside the boat
      const x = 30;
      const top = 470;
      const h = 220;
      panel(ctx, x - 12, top - 12, 24, h + 24, 'rgba(255,248,236,0.9)', 12);
      const g = ctx.createLinearGradient(0, top + h, 0, top);
      g.addColorStop(0, '#7fd18b');
      g.addColorStop(1, '#2d7fd8');
      ctx.fillStyle = g;
      rr(ctx, x - 7, top + h * (1 - this.power), 14, h * this.power, 6);
      ctx.fill();
    }
  }

  private bobberPos(): { x: number; y: number } {
    const b = this.bobber;
    if (this.phase === 'flying') {
      const k = ease.outCubic(clamp01(b.t));
      const x = b.sx + (b.x - b.sx) * k;
      const y = b.sy + (b.y - b.sy) * k - Math.sin(k * Math.PI) * 120;
      return { x, y };
    }
    return { x: b.x, y: b.y };
  }

  private drawLineAndBobber(ctx: Ctx): void {
    if (!['flying', 'waiting', 'bite', 'reel'].includes(this.phase)) return;
    let { x, y } = this.bobberPos();
    if (this.phase === 'reel' && this.target) {
      x = this.target.x;
      y = this.target.y;
    }
    const strain = this.reel ? clamp01(this.reel.strain / 0.6) : 0;
    const tension = this.reel ? this.reel.tension : 0;
    ctx.save();
    ctx.strokeStyle = strain > 0.1 ? `rgb(255,${Math.round(255 - strain * 160)},${Math.round(255 - strain * 200)})` : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.6 + tension;
    ctx.beginPath();
    ctx.moveTo(ROD_TIP.x, ROD_TIP.y);
    const sag = this.phase === 'reel' ? (1 - tension) * 60 : 40;
    const jitter = strain > 0.1 ? (Math.random() - 0.5) * 6 * strain : 0;
    ctx.quadraticCurveTo((ROD_TIP.x + x) / 2 + jitter, (ROD_TIP.y + y) / 2 + sag, x, y);
    ctx.stroke();
    ctx.restore();
    if (this.phase === 'reel') return;
    // bobber
    const bob = Math.sin(this.t * 3) * 2 + this.bobber.dip * 7 + (this.phase === 'bite' ? 10 + Math.sin(this.t * 40) * 3 : 0);
    if (this.phase !== 'flying') {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      const rk = (this.t * 0.8) % 1;
      ctx.globalAlpha = 1 - rk;
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 10 + rk * 26, 4 + rk * 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.ink;
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(0, 0, 8, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawBoat(ctx: Ctx): void {
    const bobY = Math.sin(this.t * 1.6) * 3;
    const reeling = this.phase === 'reel' && this.reel;
    ctx.save();
    ctx.translate(W / 2 - 20, BOAT_Y + bobY);
    // ripple
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 22, 120, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    const wooden = this.game.state.upgrades.boat >= 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.ink;
    if (wooden) {
      ctx.fillStyle = '#4f86b8';
      ctx.beginPath();
      ctx.moveTo(-110, -5);
      ctx.quadraticCurveTo(-90, 45, 0, 45);
      ctx.quadraticCurveTo(90, 45, 120, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d24a3a';
      ctx.fillRect(-100, -5, 215, 9);
      ctx.strokeRect(-100, -5, 215, 9);
      // eye on the bow (Vietnamese boat tradition)
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(85, 14, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.beginPath();
      ctx.arc(87, 14, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // thúng chai: round woven basket boat
      ctx.fillStyle = '#7b5a35';
      ctx.beginPath();
      ctx.ellipse(0, 8, 74, 32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(40,25,10,0.45)';
      ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 18, -20);
        ctx.quadraticCurveTo(i * 22, 10, i * 16, 38);
        ctx.stroke();
      }
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 3;
      ctx.fillStyle = '#a57a48';
      ctx.beginPath();
      ctx.ellipse(0, -4, 74, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#4a3420';
      ctx.beginPath();
      ctx.ellipse(0, -2, 62, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // fisherman with nón lá (conical hat)
    const lean = reeling ? -0.12 - this.reel!.tension * 0.1 : 0;
    ctx.save();
    ctx.translate(10, -12);
    ctx.rotate(lean);
    ctx.fillStyle = '#3d6f8f';
    rr(ctx, -14, -42, 28, 40, 10);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(0, -52, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f2d98a';
    ctx.beginPath();
    ctx.moveTo(-26, -54);
    ctx.lineTo(0, -80);
    ctx.lineTo(26, -54);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    // rod
    const bend = reeling ? this.reel!.tension * 26 : this.phase === 'charging' ? -this.power * 18 : 0;
    ctx.save();
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 6, BOAT_Y - 30 + bobY);
    ctx.quadraticCurveTo(W / 2 + 10, ROD_TIP.y + 20 + bend * 0.3, ROD_TIP.x + bend * 0.3, ROD_TIP.y + bend + bobY);
    ctx.stroke();
    ctx.restore();
  }

  private drawHud(ctx: Ctx): void {
    // bait remaining
    panel(ctx, 10, 12, 176, 44, 'rgba(255,248,236,0.95)', 14);
    text(ctx, 'Casts', 22, 34, 14, COLORS.ink, 'left');
    for (let i = 0; i < BALANCE.castsPerTrip; i++) {
      const filled = i < this.castsLeft;
      ctx.fillStyle = filled ? '#e74c3c' : 'rgba(43,33,24,0.15)';
      ctx.beginPath();
      ctx.arc(82 + i * 21, 34, 8, 0, Math.PI * 2);
      ctx.fill();
      if (filled) {
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    panel(ctx, W - 130, 12, 120, 44, 'rgba(255,248,236,0.95)', 14);
    text(ctx, `Caught ${this.tripCatches.length}`, W - 70, 34, 16, COLORS.ink);
    text(ctx, this.zone === 'reef' ? 'THE REEF' : 'THE LAGOON', W / 2, 74, 13, 'rgba(255,255,255,0.75)');
    if (this.phase === 'aim') {
      this.game.button(ctx, 'leave', 10, 66, 92, 34, 'Dock', () => this.endTrip(), { color: '#8a7a66', dark: '#5f5244', size: 15 });
    }
  }

  private drawReelUi(ctx: Ctx, r: Reel): void {
    const x = 40;
    const y = 520;
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
      outlinedText(ctx, 'HOLD to reel · let go to ease', W / 2, 440, 18, '#fff', COLORS.ink, 5);
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
    const c = this.card!;
    const sp = SPECIES_BY_ID[c.fish.species];
    ctx.fillStyle = `rgba(10,30,40,${0.55 * clamp01(c.t * 3)})`;
    ctx.fillRect(0, 0, W, H);
    // rays for rare
    if (sp.rarity >= 3) {
      ctx.save();
      ctx.translate(W / 2, 330);
      ctx.rotate(this.t * 0.4);
      ctx.fillStyle = `rgba(255,230,150,${0.18 * clamp01(c.t * 2)})`;
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-40, -420);
        ctx.lineTo(40, -420);
        ctx.fill();
      }
      ctx.restore();
    }
    const k = ease.outBack(clamp01(c.t / 0.45));
    ctx.save();
    ctx.translate(W / 2, 400);
    ctx.scale(k, k);
    panel(ctx, -160, -200, 320, 380, COLORS.paper, 24);
    ctx.fillStyle = RARITY_COLOR[sp.rarity];
    rr(ctx, -160, -200, 320, 46, 24);
    ctx.fill();
    ctx.fillRect(-160, -170, 320, 16);
    outlinedText(ctx, RARITY_LABEL[sp.rarity].toUpperCase(), 0, -176, 18, '#fff', COLORS.ink, 4);
    const fl = Math.min(220, 70 + sp.size[1] * 1.6);
    drawFish(ctx, sp.id, 0, -70, fl, { wiggle: this.t * 8, angle: Math.sin(this.t * 3) * 0.08 });
    outlinedText(ctx, sp.name, 0, 22, 30, '#fff', COLORS.ink, 6);
    text(ctx, sp.local, 0, 50, 16, 'rgba(43,33,24,0.6)', 'center', 600);
    text(ctx, sp.treasure ? `+${sp.raw} coins!` : `${c.fish.size} cm`, 0, 84, 22, COLORS.ink);
    if (!sp.treasure) {
      const fresh = c.fish.freshness;
      const stars = fresh >= 0.8 ? 3 : fresh >= 0.5 ? 2 : 1;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < stars ? COLORS.gold : 'rgba(43,33,24,0.15)';
        star(ctx, -36 + i * 36, 120, 14);
        if (i < stars) {
          ctx.strokeStyle = COLORS.ink;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      text(ctx, c.fish.perfect ? 'PERFECT CATCH — extra fresh!' : stars === 2 ? 'Good catch' : 'Bruised — less fresh', 0, 150, 14, c.fish.perfect ? COLORS.good : COLORS.ink);
    }
    ctx.restore();
    if (c.isNew && c.t > 0.3) {
      ctx.save();
      ctx.translate(W / 2 + 130, 215);
      ctx.rotate(0.25);
      const nk = ease.outElastic(clamp01((c.t - 0.3) / 0.6));
      ctx.scale(nk, nk);
      ctx.fillStyle = COLORS.bad;
      star(ctx, 0, 0, 38);
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      outlinedText(ctx, 'NEW!', 0, 2, 17, '#fff', COLORS.ink, 4);
      ctx.restore();
    } else if (c.isRecord && c.t > 0.3) {
      outlinedText(ctx, 'NEW RECORD SIZE!', W / 2, 640, 20, COLORS.gold, COLORS.ink, 5);
    }
    if (c.t > 0.6) text(ctx, 'tap to continue', W / 2, 700, 16, 'rgba(255,255,255,0.85)');
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
    const fish = this.tripCatches.filter((f) => !SPECIES_BY_ID[f.species].treasure);
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
    const ready = s.jars.filter((j) => j.sealed && agingLevel(s, j, Date.now()) >= 1).length;
    if (ready > 0) {
      const p = 1 + Math.sin(this.t * 5) * 0.05;
      outlinedText(ctx, ready === 1 ? 'Your jar is ready to open!' : `${ready} jars are ready!`, 0, 130, 20 * p, COLORS.gold, COLORS.ink, 5);
    } else if (s.bucket.length >= BALANCE.jarSlots && s.jars.some((j) => !j.sealed)) {
      text(ctx, 'You have enough fish to fill a jar!', 0, 130, 16, COLORS.good);
    }
    ctx.restore();
    if (this.t > 0.4) {
      this.game.button(ctx, 'home', W / 2 - 120, 540, 240, 64, 'Back to village', () => this.game.goVillage(), { pulse: true, color: COLORS.good, dark: '#2f7a3b' });
    }
  }
}
