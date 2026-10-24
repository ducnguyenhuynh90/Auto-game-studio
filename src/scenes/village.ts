// The village hub: your jars, the market, the dock. It visibly grows with every upgrade.
import { BALANCE, SPECIES } from '../core/data';
import { currentGoal } from '../core/goals';
import { agingLevel, canFerment, upgradeCost, villageLevel, type Jar } from '../core/state';
import { COLORS, H, W, clamp01, drawCoin, drawJar, ease, outlinedText, panel, rr, star, text, type Ctx } from '../render/draw';
import { isMuted, setMuted } from '../render/audio';
import type { Game, Scene } from '../game';
import { JarFillOverlay, RevealOverlay } from './jar';
import { MarketOverlay } from './market';
import { DexOverlay } from './dex';

const JAR_Y = 640;
const MARKET = { x: 236, y: 370, w: 140, h: 120 };

export function jarPositions(n: number): { x: number; y: number }[] {
  const spacing = n <= 2 ? 110 : 84;
  const start = W / 2 - ((n - 1) * spacing) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: start + i * spacing, y: JAR_Y }));
}

export class VillageScene implements Scene {
  name = 'village';
  t = 0;
  private lastGoal = '';
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
    const jars = jarPositions(s.jars.length);
    const readyIdx = s.jars.findIndex((j) => this.jarState(j) === 'ready');
    if (readyIdx >= 0 && (g?.id === 'open1' || g?.id === 'trip2' || s.stats.jarsOpened < 2)) return { x: jars[readyIdx].x, y: jars[readyIdx].y - 40 };
    if (!g) return null;
    switch (g.id) {
      case 'catch3':
        return fishBtn;
      case 'seal1': {
        const empty = s.jars.findIndex((j) => !j.sealed);
        return this.fermentableCount() >= 3 && empty >= 0 ? { x: jars[empty].x, y: jars[empty].y - 40 } : fishBtn;
      }
      case 'trip2':
        return fishBtn;
      case 'open1':
        return fishBtn;
      case 'sell1':
        return { x: MARKET.x + MARKET.w / 2, y: MARKET.y + 50 };
      case 'jar2':
      case 'rod1':
      case 'salt1':
      case 'boat1': {
        const id = ({ jar2: 'jars', rod1: 'rod', salt1: 'salt', boat1: 'boat' } as const)[g.id];
        const cost = upgradeCost(s, id) ?? Infinity;
        return s.coins >= cost || s.shelf.length > 0 ? { x: MARKET.x + MARKET.w / 2, y: MARKET.y + 50 } : null;
      }
      default:
        return null;
    }
  }

  draw(ctx: Ctx): void {
    const s = this.game.state;
    this.drawWorld(ctx);
    this.drawJars(ctx);
    this.drawTopBar(ctx);
    this.drawGoal(ctx);
    this.drawBottom(ctx);
    const p = this.pointTarget();
    if (p && this.game.overlays.length === 0) this.drawHand(ctx, p.x, p.y);
    if (s.shelf.length > 0) {
      // bottles waiting on the market table
      const b = 1 + Math.sin(this.t * 4) * 0.08;
      ctx.save();
      ctx.translate(MARKET.x + MARKET.w - 14, MARKET.y + 6);
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
  }

  private drawWorld(ctx: Ctx): void {
    const s = this.game.state;
    const lvl = villageLevel(s);
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, 200);
    sky.addColorStop(0, '#ffc98f');
    sky.addColorStop(1, '#ffe9c7');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 200);
    ctx.fillStyle = 'rgba(255,245,215,0.95)';
    ctx.beginPath();
    ctx.arc(70, 150, 26, 0, Math.PI * 2);
    ctx.fill();
    // sea
    const sea = ctx.createLinearGradient(0, 170, 0, 330);
    sea.addColorStop(0, '#1f88a3');
    sea.addColorStop(1, '#4cc0c9');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 170, W, 170);
    ctx.fillStyle = 'rgba(60,110,90,0.6)';
    ctx.beginPath();
    ctx.moveTo(200, 172);
    ctx.quadraticCurveTo(260, 140, 330, 172);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const y = 200 + i * 28;
      const off = (this.t * 10 + i * 50) % 80;
      ctx.beginPath();
      for (let x = -80 + off; x < W; x += 80) {
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 12, y - 4, x + 24, y);
      }
      ctx.stroke();
    }
    // dock
    ctx.fillStyle = COLORS.woodDark;
    for (let i = 0; i < 4; i++) ctx.fillRect(278 + i * 30, 250, 6, 70);
    ctx.fillStyle = COLORS.wood;
    rr(ctx, 270, 244, 120, 14, 3);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    // boat at the dock
    const by = 286 + Math.sin(this.t * 1.5) * 3;
    ctx.lineWidth = 2.5;
    if (s.upgrades.boat >= 1) {
      ctx.fillStyle = '#4f86b8';
      ctx.beginPath();
      ctx.moveTo(150, by - 6);
      ctx.quadraticCurveTo(170, by + 22, 210, by + 22);
      ctx.quadraticCurveTo(250, by + 22, 268, by - 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d24a3a';
      ctx.fillRect(156, by - 7, 108, 6);
      ctx.fillStyle = '#f5ead0';
      ctx.beginPath();
      ctx.moveTo(210, by - 8);
      ctx.lineTo(210, by - 70);
      ctx.lineTo(250, by - 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#7b5a35';
      ctx.beginPath();
      ctx.ellipse(230, by, 32, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#4a3420';
      ctx.beginPath();
      ctx.ellipse(230, by - 4, 25, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // land
    ctx.fillStyle = COLORS.sand;
    ctx.beginPath();
    ctx.moveTo(0, 318);
    ctx.quadraticCurveTo(140, 300, 270, 330);
    ctx.lineTo(W, 340);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();
    const grass = ctx.createLinearGradient(0, 360, 0, H);
    grass.addColorStop(0, '#9fd078');
    grass.addColorStop(1, '#79b356');
    ctx.fillStyle = grass;
    ctx.beginPath();
    ctx.moveTo(0, 360);
    ctx.quadraticCurveTo(200, 340, W, 372);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();
    // palm trees
    this.drawPalm(ctx, 26, 380, 1);
    if (lvl >= 4) this.drawPalm(ctx, 372, 560, 0.8);
    // house: shack grows with village level
    this.drawHouse(ctx, lvl);
    if (s.upgrades.salt >= 1) this.drawSaltHouse(ctx, s.upgrades.salt);
    this.drawMarket(ctx);
    // yard mat under the jars
    ctx.fillStyle = 'rgba(160,110,60,0.25)';
    ctx.beginPath();
    ctx.ellipse(W / 2, JAR_Y + 4, 175, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, 'JAR YARD', W / 2, JAR_Y + 30, 12, 'rgba(43,33,24,0.45)');
    // lanterns appear as the village prospers
    if (lvl >= 3) {
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 345);
      ctx.quadraticCurveTo(W / 2, 395, W, 345);
      ctx.stroke();
      const n = Math.min(9, lvl + 1);
      for (let i = 1; i <= n; i++) {
        const x = (W / (n + 1)) * i;
        const u = x / W;
        const y = 345 + 4 * 50 * u * (1 - u) + 6;
        ctx.fillStyle = i % 2 ? '#e8443a' : '#f2b233';
        ctx.beginPath();
        ctx.ellipse(x, y + Math.sin(this.t * 2 + i) * 1.5, 7, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  private drawPalm(ctx: Ctx, x: number, y: number, s: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = '#7a5532';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(8, -50, 0, -100);
    ctx.stroke();
    ctx.fillStyle = '#4f9a48';
    const sway = Math.sin(this.t * 1.2) * 0.06;
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.translate(0, -100);
      ctx.rotate((i / 6) * Math.PI * 2 + sway);
      ctx.beginPath();
      ctx.ellipse(28, 0, 30, 8, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawHouse(ctx: Ctx, lvl: number): void {
    const x = 50;
    const y = 470;
    const big = lvl >= 6;
    const w = big ? 150 : 120;
    const h = big ? 90 : 70;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.ink;
    // stilts
    ctx.fillStyle = COLORS.woodDark;
    ctx.fillRect(x + 8, y - 6, 8, 14);
    ctx.fillRect(x + w - 16, y - 6, 8, 14);
    ctx.fillStyle = big ? '#f3e2bf' : '#c99b62';
    ctx.fillRect(x, y - h, w, h - 6);
    ctx.strokeRect(x, y - h, w, h - 6);
    // door + window
    ctx.fillStyle = '#6e4423';
    ctx.fillRect(x + w / 2 - 14, y - 46, 28, 40);
    ctx.strokeRect(x + w / 2 - 14, y - 46, 28, 40);
    ctx.fillStyle = '#ffe2a0';
    ctx.fillRect(x + 12, y - h + 16, 22, 20);
    ctx.strokeRect(x + 12, y - h + 16, 22, 20);
    // roof: thatch then terracotta
    ctx.fillStyle = big ? '#c4553a' : '#d9b35b';
    ctx.beginPath();
    ctx.moveTo(x - 18, y - h + 4);
    ctx.lineTo(x + w / 2, y - h - 46);
    ctx.lineTo(x + w + 18, y - h + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // fish drying rack: shows bucket contents
    const s = this.game.state;
    const rx = 168;
    const ry = 440;
    ctx.strokeStyle = COLORS.woodDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx, ry + 30);
    ctx.lineTo(rx, ry - 20);
    ctx.moveTo(rx + 56, ry + 30);
    ctx.lineTo(rx + 56, ry - 20);
    ctx.moveTo(rx - 4, ry - 16);
    ctx.lineTo(rx + 60, ry - 16);
    ctx.stroke();
    void s;
  }

  private drawSaltHouse(ctx: Ctx, level: number): void {
    const x = 20;
    const y = 545;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    for (let i = 0; i < level + 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 26, y);
      ctx.lineTo(x + 13 + i * 26, y - 22);
      ctx.lineTo(x + 26 + i * 26, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    text(ctx, 'SALT', x + 26, y + 12, 10, 'rgba(43,33,24,0.5)');
  }

  private drawMarket(ctx: Ctx): void {
    const s = this.game.state;
    const { x, y, w, h } = MARKET;
    const pressed = this.game.isPressed('market');
    ctx.save();
    if (pressed) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(0.96, 0.96);
      ctx.translate(-x - w / 2, -y - h / 2);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.ink;
    ctx.fillStyle = COLORS.woodDark;
    ctx.fillRect(x + 10, y + 20, 7, h - 20);
    ctx.fillRect(x + w - 17, y + 20, 7, h - 20);
    // awning stripes
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#fff4e0' : s.upgrades.stall >= 1 ? '#2f8fbf' : '#e05a3a';
      ctx.fillRect(x + (w / stripes) * i, y + 6, w / stripes, 30);
    }
    ctx.strokeRect(x, y + 6, w, 30);
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#fff4e0' : s.upgrades.stall >= 1 ? '#2f8fbf' : '#e05a3a';
      ctx.beginPath();
      ctx.arc(x + (w / stripes) * (i + 0.5), y + 36, w / stripes / 2, 0, Math.PI);
      ctx.fill();
    }
    // table
    ctx.fillStyle = COLORS.wood;
    ctx.fillRect(x + 4, y + 76, w - 8, 16);
    ctx.strokeRect(x + 4, y + 76, w - 8, 16);
    // goods on the table
    for (let i = 0; i < Math.min(4, s.shelf.length); i++) {
      ctx.fillStyle = '#9c5a2a';
      rr(ctx, x + 18 + i * 28, y + 50, 14, 26, 4);
      ctx.fill();
      ctx.stroke();
    }
    if (s.upgrades.stall >= 2) {
      ctx.fillStyle = COLORS.gold;
      star(ctx, x + w / 2, y - 6, 12);
      ctx.stroke();
    }
    ctx.restore();
    panel(ctx, x + 22, y + h - 6, w - 44, 26, COLORS.paper, 10);
    text(ctx, 'MARKET', x + w / 2, y + h + 7, 14, COLORS.ink);
    this.game.hitArea('market', x, y, w, h + 24, () => this.game.push(new MarketOverlay(this.game)));
  }

  private drawJars(ctx: Ctx): void {
    const s = this.game.state;
    const pos = jarPositions(s.jars.length);
    const now = Date.now();
    s.jars.forEach((j, i) => {
      const p = pos[i];
      const st = this.jarState(j);
      const pressed = this.game.isPressed(`jar${i}`);
      const size = 62 * (pressed ? 0.94 : 1);
      if (st === 'empty') {
        drawJar(ctx, p.x, p.y, size, { empty: true });
        const can = this.fermentableCount() >= BALANCE.jarSlots;
        ctx.save();
        ctx.globalAlpha = can ? 0.8 + Math.sin(this.t * 5) * 0.2 : 0.55;
        ctx.fillStyle = can ? COLORS.good : '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 32, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        outlinedText(ctx, '+', p.x, p.y - 32, 22, can ? '#fff' : COLORS.ink, COLORS.ink, can ? 3 : 0.1);
        ctx.restore();
        text(ctx, can ? 'Fill me!' : 'Empty', p.x, p.y + 16, 12, COLORS.ink);
      } else if (st === 'fermenting') {
        const wob = Math.sin(this.t * 2 + i) * 0.02;
        drawJar(ctx, p.x, p.y, size, { wobble: wob });
        // bubbles
        for (let b = 0; b < 3; b++) {
          const k = (this.t * 0.6 + b / 3 + i * 0.2) % 1;
          ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
          ctx.beginPath();
          ctx.arc(p.x - 8 + b * 8, p.y - 80 - k * 30, 3 + k * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        const prog = clamp01((now - j.sealedAt) / 1000 / BALANCE.agingSecondsPerLevel);
        ctx.fillStyle = 'rgba(43,33,24,0.2)';
        rr(ctx, p.x - 26, p.y + 10, 52, 8, 4);
        ctx.fill();
        ctx.fillStyle = '#b5651d';
        rr(ctx, p.x - 26, p.y + 10, 52 * prog, 8, 4);
        ctx.fill();
        text(ctx, 'Fermenting', p.x, p.y + 28, 11, COLORS.ink);
      } else {
        const lvl = agingLevel(s, j, now);
        const bounce = Math.abs(Math.sin(this.t * 4 + i)) * 6;
        drawJar(ctx, p.x, p.y, size, { glow: 0.7 + Math.sin(this.t * 4) * 0.3, wobble: Math.sin(this.t * 8 + i) * 0.04 });
        outlinedText(ctx, '!', p.x, p.y - 98 - bounce, 30, COLORS.gold, COLORS.ink, 5);
        for (let k = 0; k < BALANCE.maxAging; k++) {
          ctx.fillStyle = k < lvl ? COLORS.gold : 'rgba(43,33,24,0.2)';
          star(ctx, p.x - 18 + k * 18, p.y + 14, 7);
          if (k < lvl) {
            ctx.strokeStyle = COLORS.ink;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
        text(ctx, lvl >= BALANCE.maxAging ? 'Fully aged!' : 'Ready!', p.x, p.y + 30, 12, COLORS.ink);
      }
      this.game.hitArea(`jar${i}`, p.x - 40, p.y - 110, 80, 145, () => this.tapJar(i));
    });
    // locked next jar slot teaser
    if (s.jars.length < 4 && s.stats.jarsOpened > 0) {
      text(ctx, `+ more jars at the Market`, W / 2, JAR_Y + 48, 11, 'rgba(43,33,24,0.4)');
    }
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
