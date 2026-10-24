// The village hub: your jars, the market, the dock. It visibly grows with every upgrade.
import { BALANCE, SPECIES } from '../core/data';
import { currentGoal } from '../core/goals';
import { agingLevel, canFerment, upgradeCost, villageLevel, type Jar } from '../core/state';
import { COLORS, W, clamp01, drawCoin, ease, outlinedText, panel, rr, star, text, type Ctx } from '../render/draw';
import { isMuted, setMuted } from '../render/audio';
import type { Game, Scene } from '../game';
import { JarFillOverlay, RevealOverlay } from './jar';
import { MarketOverlay } from './market';
import { DexOverlay } from './dex';

const JAR_Y = 640;

export function jarPositions(n: number): { x: number; y: number }[] {
  const spacing = n <= 2 ? 110 : 84;
  const start = W / 2 - ((n - 1) * spacing) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: start + i * spacing, y: JAR_Y }));
}

export class VillageScene implements Scene {
  name = 'village';
  t = 0;
  private lastGoal = '';
  private tip: { text: string; t: number } | null = null;
  private tipIdx = 0;
  private goalFlash = 0;

  constructor(private game: Game) {}

  update(dt: number): void {
    this.t += dt;
    const g = currentGoal(this.game.state);
    const id = g?.id ?? '';
    if (id !== this.lastGoal) {
      this.lastGoal = id;
      this.goalFlash = 1;
    }
    this.goalFlash = Math.max(0, this.goalFlash - dt * 0.8);
    if (this.tip) {
      this.tip.t += dt;
      if (this.tip.t > 4) this.tip = null;
    }
  }

  private fermentableCount(): number {
    return this.game.state.bucket.filter(canFerment).length;
  }

  private jarState(j: Jar): 'empty' | 'fermenting' | 'ready' {
    if (!j.sealed) return 'empty';
    return agingLevel(this.game.state, j, Date.now()) >= 1 ? 'ready' : 'fermenting';
  }

  tapJar(i: number): void {
    const s = this.game.state;
    const j = s.jars[i];
    const st = this.jarState(j);
    if (st === 'empty') {
      if (this.fermentableCount() >= BALANCE.jarSlots) this.game.push(new JarFillOverlay(this.game, i));
      else this.game.toast(`Need ${BALANCE.jarSlots} fish to fill a jar`, COLORS.accent, `You have ${this.fermentableCount()}. Go fishing!`);
    } else if (st === 'fermenting') {
      const secs = Math.max(0, Math.ceil(BALANCE.agingSecondsPerLevel - (Date.now() - j.sealedAt) / 1000));
      this.game.toast('Fermenting…', '#8a6a4a', `Ready after a fishing trip (or ${secs}s)`);
    } else {
      this.game.push(new RevealOverlay(this.game, i));
    }
  }

  /** Where the tutorial hand should point, based purely on state. */
  private pointTarget(): { x: number; y: number } | null {
    const s = this.game.state;
    const g = currentGoal(s);
    const fishBtn = { x: W / 2 + 60, y: 770 };
    const jars = s.jars.map((_, i) => this.jarPt(i));
    const m = this.marketPt();
    const readyIdx = s.jars.findIndex((j) => this.jarState(j) === 'ready');
    if (readyIdx >= 0 && (g?.id === 'open1' || g?.id === 'trip2' || s.stats.jarsOpened < 2)) return { x: jars[readyIdx].x, y: jars[readyIdx].y - 60 };
    if (!g) return null;
    switch (g.id) {
      case 'catch3':
        return fishBtn;
      case 'seal1': {
        const empty = s.jars.findIndex((j) => !j.sealed);
        return this.fermentableCount() >= 3 && empty >= 0 ? { x: jars[empty].x, y: jars[empty].y - 60 } : fishBtn;
      }
      case 'trip2':
        return fishBtn;
      case 'open1':
        return fishBtn;
      case 'sell1':
        return { x: m.x, y: m.y - 10 };
      case 'jar2':
      case 'rod1':
      case 'salt1':
      case 'boat1': {
        const id = ({ jar2: 'jars', rod1: 'rod', salt1: 'salt', boat1: 'boat' } as const)[g.id];
        const cost = upgradeCost(s, id) ?? Infinity;
        return s.coins >= cost || s.shelf.length > 0 ? { x: m.x, y: m.y - 10 } : null;
      }
      default:
        return null;
    }
  }

  /** Jar base position on screen (projected from the 3D world when available). */
  private jarPt(i: number): { x: number; y: number } {
    return this.game.world?.village.jarScreen(i) ?? jarPositions(this.game.state.jars.length)[i];
  }

  private marketPt(): { x: number; y: number } {
    return this.game.world?.village.marketScreen() ?? { x: 306, y: 430 };
  }

  draw(ctx: Ctx): void {
    // The village itself is 3D (render3d/world.ts). This layer adds labels, hit areas and HUD.
    this.drawJarLabels(ctx);
    this.drawMarketLabel(ctx);
    this.drawVillager(ctx);
    this.drawTopBar(ctx);
    this.drawGoal(ctx);
    this.drawBottom(ctx);
    const p = this.pointTarget();
    if (p && this.game.overlays.length === 0) this.drawHand(ctx, p.x, p.y);
  }

  /** Context-aware advice from the villager: what matters now first, then general craft tips. */
  private villagerTips(): string[] {
    const s = this.game.state;
    const tips: string[] = [];
    if (s.stats.catches === 0) tips.push('Big shadows far out are bigger fish!');
    if (s.bucket.filter(canFerment).length >= BALANCE.jarSlots && s.jars.some((j) => !j.sealed)) tips.push('You have enough fish. Fill a jar!');
    if (s.jars.some((j) => j.sealed)) tips.push('Jars age on full fishing trips. Patience makes stronger sauce!');
    tips.push(
      'Keep the line in the green for fresh, perfect fish.',
      'Three anchovies make the Classic: the village way.',
      'Good fish sauce is measured in độ đạm, °N. Higher is better!',
      'Golden shadows... I have only heard stories.',
      'The Salt House adds strength to every batch.',
    );
    return tips;
  }

  private drawVillager(ctx: Ctx): void {
    const w = this.game.world;
    if (!w) return;
    const p = w.village.fisherScreen();
    this.game.hitArea('villager', p.x - 30, p.y - 30, 60, 80, () => {
      const tips = this.villagerTips();
      this.tip = { text: tips[this.tipIdx % tips.length], t: 0 };
      this.tipIdx++;
      w.village.hop();
    });
    if (!this.tip) return;
    const k = ease.outBack(clamp01(this.tip.t / 0.25));
    const fade = clamp01((4 - this.tip.t) / 0.4);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(Math.max(110, Math.min(W - 110, p.x + 60)), p.y - 70);
    ctx.scale(k, k);
    ctx.font = '700 13px sans-serif';
    const lines = wrap(ctx, this.tip.text, 190);
    const h = lines.length * 17 + 16;
    panel(ctx, -105, -h, 210, h, COLORS.paper, 14);
    lines.forEach((l, i) => text(ctx, l, 0, -h + 16 + i * 17, 13, COLORS.ink));
    ctx.restore();
  }

  private drawMarketLabel(ctx: Ctx): void {
    const s = this.game.state;
    const m = this.marketPt();
    panel(ctx, m.x - 42, m.y + 34, 84, 26, COLORS.paper, 10);
    text(ctx, 'MARKET', m.x, m.y + 47, 14, COLORS.ink);
    if (s.shelf.length > 0) {
      const b = 1 + Math.sin(this.t * 4) * 0.08;
      ctx.save();
      ctx.translate(m.x + 46, m.y - 40);
      ctx.scale(b, b);
      ctx.fillStyle = COLORS.bad;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      outlinedText(ctx, String(s.shelf.length), 0, 1, 15, '#fff', COLORS.ink, 3);
      ctx.restore();
    }
    this.game.hitArea('market', m.x - 70, m.y - 80, 140, 145, () => this.game.push(new MarketOverlay(this.game)));
  }

  private drawJarLabels(ctx: Ctx): void {
    const s = this.game.state;
    const now = Date.now();
    s.jars.forEach((j, i) => {
      const p = this.jarPt(i);
      const st = this.jarState(j);
      if (st === 'empty') {
        const can = this.fermentableCount() >= BALANCE.jarSlots;
        ctx.save();
        ctx.globalAlpha = can ? 0.85 + Math.sin(this.t * 5) * 0.15 : 0.7;
        ctx.fillStyle = can ? COLORS.good : '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 92, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        outlinedText(ctx, '+', p.x, p.y - 92, 22, can ? '#fff' : COLORS.ink, COLORS.ink, can ? 3 : 0.1);
        ctx.restore();
        this.tag(ctx, p.x, p.y + 18, can ? 'Fill me!' : 'Empty');
      } else if (st === 'fermenting') {
        const prog = clamp01((now - j.sealedAt) / 1000 / BALANCE.agingSecondsPerLevel);
        ctx.fillStyle = 'rgba(43,33,24,0.35)';
        rr(ctx, p.x - 28, p.y + 10, 56, 9, 4);
        ctx.fill();
        ctx.fillStyle = '#f2b233';
        rr(ctx, p.x - 28, p.y + 10, 56 * prog, 9, 4);
        ctx.fill();
        this.tag(ctx, p.x, p.y + 30, 'Fermenting');
      } else {
        const lvl = agingLevel(s, j, now);
        const bounce = Math.abs(Math.sin(this.t * 4 + i)) * 8;
        outlinedText(ctx, '!', p.x, p.y - 122 - bounce, 34, COLORS.gold, COLORS.ink, 5);
        for (let k = 0; k < BALANCE.maxAging; k++) {
          ctx.fillStyle = k < lvl ? COLORS.gold : 'rgba(255,255,255,0.6)';
          star(ctx, p.x - 18 + k * 18, p.y + 16, 8);
          ctx.strokeStyle = COLORS.ink;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        this.tag(ctx, p.x, p.y + 36, lvl >= BALANCE.maxAging ? 'Fully aged!' : 'Ready!');
      }
      this.game.hitArea(`jar${i}`, p.x - 42, p.y - 110, 84, 150, () => this.tapJar(i));
    });
  }

  private tag(ctx: Ctx, x: number, y: number, label: string): void {
    ctx.font = '700 12px sans-serif';
    const w = ctx.measureText(label).width + 16;
    ctx.fillStyle = 'rgba(255,248,236,0.92)';
    rr(ctx, x - w / 2, y - 10, w, 20, 10);
    ctx.fill();
    text(ctx, label, x, y, 12, COLORS.ink);
  }

  private drawTopBar(ctx: Ctx): void {
    const s = this.game.state;
    const pk = 1 + this.game.coinPulse * 0.25;
    panel(ctx, 10, 12, 150, 44, COLORS.paper, 22);
    ctx.save();
    ctx.translate(36, 34);
    ctx.scale(pk, pk);
    drawCoin(ctx, 0, 0, 14);
    ctx.restore();
    text(ctx, String(s.coins), 60, 35, 22, COLORS.ink, 'left', 900);
    // village level
    panel(ctx, 168, 12, 92, 44, COLORS.paper, 22);
    text(ctx, 'Village', 214, 27, 11, 'rgba(43,33,24,0.6)');
    text(ctx, `Lv ${villageLevel(s)}`, 214, 44, 17, COLORS.ink, 'center', 900);
    // fishdex
    const found = SPECIES.filter((sp) => s.dex[sp.id]).length;
    this.game.button(ctx, 'dex', 268, 12, 76, 44, `${found}/${SPECIES.length}`, () => this.game.push(new DexOverlay(this.game)), { color: '#3a8fd9', dark: '#22609e', size: 16, sub: 'Fishdex' });
    this.game.button(ctx, 'mute', 350, 12, 32, 44, isMuted() ? 'x' : '♪', () => setMuted(!isMuted()), { color: '#8a7a66', dark: '#5f5244', size: 16 });
  }

  private drawGoal(ctx: Ctx): void {
    const s = this.game.state;
    const g = currentGoal(s);
    if (!g) return;
    const k = this.goalFlash;
    const sc = 1 + ease.outElastic(1 - k) * 0 + k * 0.06;
    ctx.save();
    ctx.translate(W / 2, 90);
    ctx.scale(sc, sc);
    panel(ctx, -180, -22, 360, 46, k > 0.5 ? '#fff1b8' : COLORS.paper, 16);
    ctx.fillStyle = COLORS.accent;
    rr(ctx, -172, -14, 52, 30, 10);
    ctx.fill();
    text(ctx, 'GOAL', -146, 1, 13, '#fff', 'center', 900);
    const prog = g.progress?.(s);
    const label = prog ? `${g.text} (${prog[0]}/${prog[1]})` : g.text;
    text(ctx, label, -110, 1, label.length > 28 ? 14 : 16, COLORS.ink, 'left');
    if (g.reward > 0) {
      drawCoin(ctx, 148, 1, 9);
      text(ctx, String(g.reward), 162, 2, 13, COLORS.ink, 'left');
    }
    ctx.restore();
  }

  private drawBottom(ctx: Ctx): void {
    const s = this.game.state;
    // bucket
    panel(ctx, 12, 722, 96, 92, COLORS.paper, 18);
    ctx.fillStyle = '#8a6a4a';
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(34, 745);
    ctx.lineTo(86, 745);
    ctx.lineTo(80, 785);
    ctx.lineTo(40, 785);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    outlinedText(ctx, String(s.bucket.length), 60, 765, 22, '#fff', COLORS.ink, 4);
    text(ctx, 'fish', 60, 800, 12, COLORS.ink);
    const reef = s.upgrades.boat >= 1;
    if (reef) {
      this.game.button(ctx, 'fish', 118, 722, 128, 86, 'Lagoon', () => this.game.goFishing('lagoon'), { color: '#2a9db5', dark: '#16677a', size: 22, sub: 'anchovies' });
      this.game.button(ctx, 'reef', 254, 722, 126, 86, 'Reef', () => this.game.goFishing('reef'), { color: '#1c5f8f', dark: '#0f3a59', size: 22, sub: 'rare fish', pulse: !s.dex.snapper });
    } else {
      this.game.button(ctx, 'fish', 118, 722, 262, 86, 'GO FISHING', () => this.game.goFishing('lagoon'), { color: '#2a9db5', dark: '#16677a', size: 30, pulse: true });
    }
  }

  private drawHand(ctx: Ctx, x: number, y: number): void {
    const bob = Math.sin(this.t * 5) * 8;
    ctx.save();
    ctx.translate(x + 18, y + 26 + bob);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 3;
    rr(ctx, -8, -30, 16, 40, 8);
    ctx.fill();
    ctx.stroke();
    rr(ctx, -14, 0, 30, 30, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function wrap(ctx: Ctx, s: string, maxW: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
