// The village hub: your jars, the market, the dock. It visibly grows with every upgrade.
import { BALANCE, SPECIES } from '../core/data';
import { goalPair, progressLabel } from '../core/goals';
import { levelForXp, levelProgress } from '../core/progression';
import { SEAS, SEAS_BY_ID, seaComplete, seaLock } from '../core/seas';
import { agingLevel, canFerment, upgradeCost, type Jar } from '../core/state';
import type { UpgradeId } from '../core/data';
import { COLORS, W, clamp01, drawCoin, ease, font, outlinedText, panel, rr, star, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';
import { JarFillOverlay, RevealOverlay } from './jar';
import { MarketOverlay } from './market';
import { DexOverlay } from './dex';
import { MissionsOverlay, RelicOverlay } from './missions';
import { SettingsOverlay } from './settings';
import { StoryOverlay } from './story';
import { pendingScene } from '../core/story';

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
    const g = goalPair(this.game.state).current;
    const id = g?.id ?? '';
    // Relics earned anywhere get their big moment back in the village.
    if (this.game.relicQueue.length && this.game.overlays.length === 0) this.game.push(new RelicOverlay(this.game, this.game.relicQueue.shift()!));
    // story beats play in the village once their moment has come (after any relic celebration)
    if (this.game.overlays.length === 0 && this.t > 0.6) {
      const scene = pendingScene(this.game.state, 'village');
      if (scene) this.game.push(new StoryOverlay(this.game, [scene]));
    }
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
    const g = goalPair(s).current;
    const fishBtn = { x: 197, y: 770 };
    const mapBtn = { x: 338, y: 770 };
    const jars = s.jars.map((_, i) => this.jarPt(i));
    const m = this.marketPt();
    const market = { x: m.x, y: m.y - 10 };
    const readyIdx = s.jars.findIndex((j) => this.jarState(j) === 'ready');
    if (readyIdx >= 0 && (g?.id === 'open1' || g?.id === 'trip2' || s.stats.jarsOpened < 2)) return { x: jars[readyIdx].x, y: jars[readyIdx].y - 60 };
    if (!g) return null;
    const canAfford = (ids: UpgradeId[]) => ids.some((id) => s.coins >= (upgradeCost(s, id) ?? Infinity));
    switch (g.id) {
      case 'seal1': {
        const empty = s.jars.findIndex((j) => !j.sealed);
        return this.fermentableCount() >= 3 && empty >= 0 ? { x: jars[empty].x, y: jars[empty].y - 60 } : fishBtn;
      }
      case 'sell1':
        return market;
      case 'jar2':
        return canAfford(['jars']) || s.shelf.length > 0 ? market : null;
      case 'gear1':
        return canAfford(['rod', 'line', 'hook', 'bait']) || s.shelf.length > 0 ? market : null;
      case 'l_mackerel':
        return s.upgrades.line === 0 ? (canAfford(['line']) ? market : null) : fishBtn;
      default:
        if (g.id.startsWith('voyage_')) return g.text.startsWith('Sail') ? mapBtn : canAfford(['boat']) ? market : null;
        // brewing missions point at a jar when you have fish to fill one
        if (/Brew/.test(g.text)) {
          const empty = s.jars.findIndex((j) => !j.sealed);
          if (empty >= 0 && this.fermentableCount() >= 3) return { x: jars[empty].x, y: jars[empty].y - 60 };
        }
        return s.stats.trips < 3 ? fishBtn : null;
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
    panel(ctx, 10, 12, 116, 44, COLORS.paper, 22);
    ctx.save();
    ctx.translate(34, 34);
    ctx.scale(pk, pk);
    drawCoin(ctx, 0, 0, 13);
    ctx.restore();
    text(ctx, String(s.coins), 54, 35, s.coins >= 10000 ? 16 : 20, COLORS.ink, 'left', 900);
    // Captain level + XP bar
    const lvl = levelForXp(s.xp);
    panel(ctx, 132, 12, 128, 44, COLORS.paper, 22);
    ctx.fillStyle = '#a35bd6';
    ctx.beginPath();
    ctx.arc(154, 34, 16, 0, Math.PI * 2);
    ctx.fill();
    outlinedText(ctx, String(lvl), 154, 35, 15, '#fff', COLORS.ink, 3);
    text(ctx, 'Captain', 176, 25, 11, 'rgba(43,33,24,0.6)', 'left');
    ctx.fillStyle = 'rgba(43,33,24,0.12)';
    rr(ctx, 176, 36, 74, 9, 4);
    ctx.fill();
    ctx.fillStyle = '#a35bd6';
    rr(ctx, 176, 36, 74 * levelProgress(s.xp), 9, 4);
    ctx.fill();
    const found = SPECIES.filter((sp) => s.dex[sp.id]).length;
    this.game.button(ctx, 'dex', 266, 12, 78, 44, `${found}/${SPECIES.length}`, () => this.game.push(new DexOverlay(this.game)), { color: '#3a8fd9', dark: '#22609e', size: 16, sub: 'Fishdex' });
    const acc = this.game.account;
    const needsAttention = !!acc?.conflict || (!!acc && !acc.signedIn && acc.socialProviders.length > 0 && s.stats.jarsOpened > 0);
    this.game.button(ctx, 'settings', 350, 12, 32, 44, '≡', () => this.game.push(new SettingsOverlay(this.game)), { color: '#8a7a66', dark: '#5f5244', size: 18 });
    if (needsAttention) {
      ctx.fillStyle = COLORS.bad;
      ctx.beginPath();
      ctx.arc(378, 16, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Current goal with progress, plus the next one, so the player always knows the plan. */
  private drawGoal(ctx: Ctx): void {
    const s = this.game.state;
    const { current, next } = goalPair(s);
    if (!current) return;
    const k = this.goalFlash;
    ctx.save();
    ctx.translate(W / 2, 112);
    ctx.scale(1 + k * 0.05, 1 + k * 0.05);
    panel(ctx, -184, -46, 368, 100, k > 0.5 ? '#fff1b8' : COLORS.paper, 16);
    // row 1: GOAL chip + goal text (sized to fit)
    ctx.fillStyle = current.chapter === 'Tutorial' ? COLORS.accent : '#3a8fd9';
    rr(ctx, -176, -38, 58, 30, 10);
    ctx.fill();
    text(ctx, 'GOAL', -147, -23, 14, '#fff', 'center', 900);
    text(ctx, current.text, -110, -23, fitSize(ctx, current.text, 280, 18, 13), COLORS.ink, 'left', 900);
    // row 2: progress bar + "Caught 2/3" + reward
    if (current.progress) {
      const [c, t] = current.progress;
      ctx.fillStyle = 'rgba(43,33,24,0.12)';
      rr(ctx, -176, 2, 170, 12, 6);
      ctx.fill();
      ctx.fillStyle = COLORS.good;
      rr(ctx, -176, 2, Math.max(c > 0 ? 12 : 0, 170 * Math.min(1, c / t)), 12, 6);
      ctx.fill();
      text(ctx, progressLabel(current), 2, 8, 15, COLORS.ink, 'left', 900);
    } else text(ctx, current.chapter, -176, 8, 14, 'rgba(43,33,24,0.6)', 'left', 800);
    if (current.reward > 0) {
      drawCoin(ctx, 142, 8, 10);
      text(ctx, String(current.reward), 157, 9, 15, COLORS.ink, 'left', 900);
    }
    ctx.strokeStyle = 'rgba(43,33,24,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-174, 24);
    ctx.lineTo(174, 24);
    ctx.stroke();
    // row 3: what comes next
    const nextText = next ? `Next: ${next.text}` : 'Next: you have done it all, captain!';
    text(ctx, nextText, -174, 39, fitSize(ctx, nextText, 262, 14, 11), 'rgba(43,33,24,0.75)', 'left', 800);
    text(ctx, 'Missions ›', 176, 39, 13, '#3a8fd9', 'right', 900);
    ctx.restore();
    this.game.hitArea('goal', 8, 64, W - 16, 102, () => this.game.push(new MissionsOverlay(this.game)));
  }

  private drawBottom(ctx: Ctx): void {
    const s = this.game.state;
    // bucket
    panel(ctx, 12, 722, 86, 92, COLORS.paper, 18);
    ctx.fillStyle = '#8a6a4a';
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(31, 745);
    ctx.lineTo(79, 745);
    ctx.lineTo(73, 785);
    ctx.lineTo(37, 785);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    outlinedText(ctx, String(s.bucket.length), 55, 765, 22, '#fff', COLORS.ink, 4);
    text(ctx, 'fish', 55, 800, 12, COLORS.ink);
    const sea = SEAS_BY_ID[s.sea];
    this.game.button(ctx, 'fish', 106, 722, 182, 86, 'GO FISHING', () => this.game.goFishing(s.sea), { color: '#2a9db5', dark: '#16677a', size: 24, sub: sea.name, pulse: true });
    const mapNew = SEAS.some((x) => x.id !== s.sea && !seaLock(s, x) && !seaComplete(s, x) && seaComplete(s, sea));
    this.game.button(ctx, 'map', 296, 722, 84, 86, 'Map', () => this.game.goMap(), { color: '#c9a36a', dark: '#8f6f40', size: 20, sub: 'Sea Chart', pulse: mapNew });
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

/** Largest font size (down to min) at which the text fits maxW. */
function fitSize(ctx: Ctx, s: string, maxW: number, max: number, min: number): number {
  for (let size = max; size > min; size--) {
    ctx.font = font(size, 900);
    if (ctx.measureText(s).width <= maxW) return size;
  }
  return min;
}
