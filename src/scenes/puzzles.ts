// Puzzle hub and the two board puzzles (salt channels, shop orders). Fishing puzzles run in the
// fishing scene with a fixed school of fish (FishingScene puzzle mode).
import { analytics } from '../core/analytics';
import { RECIPES_BY_ID, tierFor } from '../core/data';
import { ROLE, staffLevelCap, type Role } from '../core/island';
import {
  FISHING_LEVELS,
  LEVELS_PER_SECTION,
  SALT_LEVELS,
  SECTION_INFO,
  SHOP_LEVELS,
  accepts,
  completeLevel,
  levelCount,
  levelOpen,
  saleValue,
  saltBoard,
  saltPar,
  saltSolved,
  saltStars,
  shopBest,
  shopStars,
  stars,
  turnCell,
  watered,
  type Section,
  type SaltBoard,
} from '../core/puzzles';
import { sfx, vibrate } from '../render/audio';
import { COLORS, H, W, clamp01, drawBottle, drawCoin, ease, font, outlinedText, panel, rr, star, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

const SECTIONS: Section[] = ['fishing', 'salt', 'shop'];
const SECTION_ROLES: Record<Section, Role[]> = { fishing: ['fisher'], salt: ['salter', 'brewer'], shop: ['seller'] };

function drawStars(ctx: Ctx, x: number, y: number, n: number, r: number, of = 3): void {
  for (let i = 0; i < of; i++) {
    ctx.fillStyle = i < n ? COLORS.gold : 'rgba(43,33,24,0.15)';
    star(ctx, x + (i - (of - 1) / 2) * r * 2.3, y, r);
    if (i < n) {
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

export function startPuzzle(game: Game, section: Section, index: number): void {
  analytics.track('puzzle_start', { section, level: index + 1 });
  if (section === 'fishing') game.goFishingPuzzle(index);
  else if (section === 'salt') game.push(new SaltPuzzleOverlay(game, index));
  else game.push(new ShopPuzzleOverlay(game, index));
}

/** Shared result card: stars, first-clear reward, retry / next / back. */
function drawResult(game: Game, ctx: Ctx, t: number, r: { section: Section; index: number; stars: number; coins: number; salt: number; detail: string }, close: () => void, retry: () => void): void {
  ctx.fillStyle = 'rgba(20,15,10,0.55)';
  ctx.fillRect(0, 0, W, H);
  const k = ease.outBack(clamp01(t / 0.35));
  ctx.save();
  ctx.translate(W / 2, 400);
  ctx.scale(k, k);
  panel(ctx, -165, -170, 330, 330, COLORS.paper, 24);
  outlinedText(ctx, r.stars > 0 ? 'Solved!' : 'Not quite…', 0, -132, 32, r.stars > 0 ? '#fff' : '#ffd9cc', COLORS.ink, 6);
  drawStars(ctx, 0, -78, r.stars, 22);
  text(ctx, r.detail, 0, -32, 14, COLORS.ink, 'center', 700);
  if (r.coins || r.salt) {
    drawCoin(ctx, -50, 2, 11);
    text(ctx, `+${r.coins}${r.salt ? `   +${r.salt} salt` : ''}`, 6, 3, 18, COLORS.ink, 'center', 900);
  }
  const roles = SECTION_ROLES[r.section];
  if (r.stars > 0) text(ctx, `${roles.map((x) => ROLE[x].title + 's').join(' & ')} can now train to Lv ${staffLevelCap(game.state, roles[0])}`, 0, 34, 12, '#7a5aa8', 'center', 900);
  ctx.restore();
  if (t > 0.35) {
    const next = r.index + 1;
    const hasNext = r.stars > 0 && levelOpen(game.state, r.section, next);
    game.button(ctx, 'res_retry', W / 2 - 150, 470, hasNext ? 140 : 300, 54, 'Retry', retry, { color: '#8a7a66', dark: '#5f5244', size: 18 });
    if (hasNext)
      game.button(ctx, 'res_next', W / 2 + 10, 470, 140, 54, `Level ${next + 1} ›`, () => {
        close();
        startPuzzle(game, r.section, next);
      }, { color: COLORS.good, dark: '#2f7a3b', size: 18, pulse: true });
    game.button(ctx, 'res_back', W / 2 - 150, 532, 300, 44, 'Back to puzzles', close, { color: '#a35bd6', dark: '#6f3a96', size: 16 });
  }
}

// ---------- Hub ----------

export class PuzzleHubOverlay implements Scene {
  name = 'puzzles';
  covers3d = true;
  t = 0;

  constructor(private game: Game) {}

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    ctx.fillStyle = '#f6ead2';
    ctx.fillRect(0, 0, W, H);
    outlinedText(ctx, 'Puzzles', W / 2, 40, 30, '#fff', COLORS.ink, 6);
    text(ctx, 'Staff do the routine. You solve the hard problems.', W / 2, 72, 12, COLORS.ink, 'center', 700);
    this.game.button(ctx, 'close', W - 62, 18, 48, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
    SECTIONS.forEach((sec, i) => this.drawSection(ctx, sec, 92 + i * 248));
  }

  private drawSection(ctx: Ctx, sec: Section, y: number): void {
    const s = this.game.state;
    const info = SECTION_INFO[sec];
    panel(ctx, 12, y, W - 24, 236, '#fffaf0', 18);
    ctx.fillStyle = info.color;
    rr(ctx, 12, y, W - 24, 44, 18);
    ctx.fill();
    ctx.fillRect(12, y + 26, W - 24, 18);
    ctx.font = font(20, 900);
    outlinedText(ctx, info.title, 28 + ctx.measureText(info.title).width / 2, y + 22, 20, '#fff', COLORS.ink, 4);
    text(ctx, info.local, W - 30, y + 23, 12, 'rgba(255,255,255,0.95)', 'right', 900);
    text(ctx, info.blurb, W / 2, y + 62, 12, COLORS.ink, 'center', 600);
    const cleared = s.puzzles[sec].filter((x) => x > 0).length;
    text(ctx, `Trains: ${info.trains} (up to Lv ${staffLevelCap(s, SECTION_ROLES[sec][0])})`, W / 2, y + 82, 12, '#7a5aa8', 'center', 900);
    const n = levelCount(sec);
    const gap = (W - 60) / (n + 1);
    for (let i = 0; i <= n; i++) {
      const cx = 30 + gap * (i + 0.5);
      const cy = y + 134;
      if (i === n) {
        // the rest of the 100-level track
        ctx.fillStyle = 'rgba(43,33,24,0.08)';
        ctx.beginPath();
        ctx.arc(cx, cy, 24, 0, Math.PI * 2);
        ctx.fill();
        text(ctx, `${n + 1}–${LEVELS_PER_SECTION}`, cx, cy - 2, 10, 'rgba(43,33,24,0.55)', 'center', 900);
        text(ctx, 'soon', cx, cy + 34, 10, 'rgba(43,33,24,0.55)', 'center', 900);
        continue;
      }
      const open = levelOpen(s, sec, i);
      const st = stars(s, sec, i);
      if (i > 0) {
        ctx.strokeStyle = st > 0 || open ? info.color : 'rgba(43,33,24,0.2)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - gap + 25, cy);
        ctx.lineTo(cx - 25, cy);
        ctx.stroke();
      }
      const isNext = open && st === 0;
      const pulse = isNext ? 1 + Math.sin(this.t * 5) * 0.06 : 1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = open ? (st > 0 ? info.color : '#fff') : '#d8cfbf';
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      text(ctx, open ? String(i + 1) : '🔒', 0, 1, open ? 20 : 16, open ? (st > 0 ? '#fff' : COLORS.ink) : COLORS.ink, 'center', 900);
      ctx.restore();
      drawStars(ctx, cx, cy + 36, st, 6);
      if (open) this.game.hitArea(`lvl_${sec}_${i}`, cx - 28, cy - 28, 56, 70, () => startPuzzle(this.game, sec, i));
    }
    const titles = sec === 'fishing' ? FISHING_LEVELS : sec === 'salt' ? SALT_LEVELS : SHOP_LEVELS;
    const nextIdx = Math.min(cleared, n - 1);
    text(ctx, cleared >= n ? 'All built levels cleared! More are on the way.' : `Next: ${nextIdx + 1}. ${titles[nextIdx].title}`, W / 2, y + 206, 13, COLORS.ink, 'center', 900);
  }
}

// ---------- Salt field: turn the channels ----------

export class SaltPuzzleOverlay implements Scene {
  name = 'salt_puzzle';
  covers3d = true;
  t = 0;
  board: SaltBoard;
  par: number;
  taps = 0;
  spin: number[] = [];
  result: { stars: number; coins: number; salt: number; t: number } | null = null;

  constructor(
    private game: Game,
    private index: number,
  ) {
    this.board = saltBoard(index);
    this.par = saltPar(this.board);
  }

  private get cell(): number {
    return Math.min(66, Math.floor((W - 40) / this.board.w));
  }
  private get ox(): number {
    return (W - this.cell * this.board.w) / 2;
  }
  private get oy(): number {
    return 210;
  }

  update(dt: number): void {
    this.t += dt;
    this.spin = this.spin.map((a) => a * Math.pow(0.0005, dt));
    if (this.result) this.result.t += dt;
  }

  down(x: number, y: number): void {
    if (this.result) return;
    const c = Math.floor((x - this.ox) / this.cell);
    const r = Math.floor((y - this.oy) / this.cell);
    if (c < 0 || r < 0 || c >= this.board.w || r >= this.board.h) return;
    const i = r * this.board.w + c;
    if (!turnCell(this.board, i)) return;
    this.taps++;
    this.spin[i] = -Math.PI / 2;
    sfx.tap();
    vibrate(6);
    if (saltSolved(this.board)) this.win();
  }

  private win(): void {
    const st = saltStars(this.taps, this.par);
    const r = completeLevel(this.game.state, 'salt', this.index, st);
    analytics.track('puzzle_end', { section: 'salt', level: this.index + 1, stars: st, taps: this.taps, par: this.par });
    this.result = { stars: st, coins: r.coins, salt: r.salt, t: 0 };
    sfx.rare();
    this.game.particles.burst(W / 2, 360, 50, ['#ffffff', '#bfe9f2', COLORS.gold], { speed: 300, kind: 'star', size: 6, g: 300, life: 1.2 });
    this.game.commit();
  }

  draw(ctx: Ctx): void {
    const lvl = SALT_LEVELS[this.index];
    ctx.fillStyle = '#efe0bd';
    ctx.fillRect(0, 0, W, H);
    outlinedText(ctx, `Salt ${this.index + 1} · ${lvl.title}`, W / 2, 40, 22, '#fff', COLORS.ink, 5);
    ctx.font = font(13, 700);
    text(ctx, lvl.hint, W / 2, 76, 12.5, COLORS.ink, 'center', 700);
    text(ctx, `Taps ${this.taps} · ★★★ in ${this.par}`, W / 2, 104, 15, COLORS.ink, 'center', 900);
    this.game.button(ctx, 'sp_back', 12, 130, 100, 40, '‹ Back', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 15 });
    this.game.button(ctx, 'sp_reset', W - 112, 130, 100, 40, 'Reset', () => this.reset(), { color: '#3a8fd9', dark: '#22609e', size: 15 });
    this.drawBoard(ctx);
    const w = watered(this.board);
    const pans = this.board.cells.filter((c) => c.kind === 'pan').length;
    const full = this.board.cells.filter((c, i) => c.kind === 'pan' && w.has(i)).length;
    text(ctx, `Salt pans filled: ${full}/${pans}`, W / 2, this.oy + this.cell * this.board.h + 34, 16, full === pans ? COLORS.good : COLORS.ink, 'center', 900);
    text(ctx, 'Tap a channel to turn it.', W / 2, this.oy + this.cell * this.board.h + 58, 12, 'rgba(43,33,24,0.6)', 'center', 700);
    if (this.result)
      drawResult(this.game, ctx, this.result.t, { section: 'salt', index: this.index, stars: this.result.stars, coins: this.result.coins, salt: this.result.salt, detail: `${this.taps} taps (★★★ in ${this.par})` }, () => this.game.pop(this), () => this.reset());
  }

  private reset(): void {
    this.board = saltBoard(this.index);
    this.taps = 0;
    this.result = null;
    this.spin = [];
  }

  private drawBoard(ctx: Ctx): void {
    const b = this.board;
    const cs = this.cell;
    const wet = watered(b);
    panel(ctx, this.ox - 10, this.oy - 10, cs * b.w + 20, cs * b.h + 20, '#d9c08a', 16);
    b.cells.forEach((c, i) => {
      const x = this.ox + (i % b.w) * cs;
      const y = this.oy + Math.floor(i / b.w) * cs;
      const cx = x + cs / 2;
      const cy = y + cs / 2;
      ctx.fillStyle = c.kind === 'empty' ? '#cdb47e' : '#e9d6a8';
      rr(ctx, x + 2, y + 2, cs - 4, cs - 4, 8);
      ctx.fill();
      if (c.kind === 'pan') {
        const full = wet.has(i);
        ctx.fillStyle = full ? '#bfe9f2' : '#d8c9a6';
        rr(ctx, x + 6, y + 6, cs - 12, cs - 12, 6);
        ctx.fill();
        ctx.strokeStyle = '#8f6f40';
        ctx.lineWidth = 3;
        ctx.stroke();
        if (full)
          for (let k = 0; k < 5; k++) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(x + 14 + ((k * 13) % (cs - 26)), y + 16 + ((k * 17) % (cs - 30)), 3 + (k % 2), 0, Math.PI * 2);
            ctx.fill();
          }
        text(ctx, 'SALT', cx, y + cs - 12, 9, '#6f5432', 'center', 900);
        return;
      }
      if (c.kind === 'empty') return;
      const mask = c.mask;
      const isWet = wet.has(i);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.spin[i] ?? 0);
      ctx.lineCap = 'round';
      const arms = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ];
      for (const pass of [0, 1]) {
        ctx.strokeStyle = pass === 0 ? '#6f5432' : isWet || c.kind === 'gate' ? '#3ab0d0' : '#b59a6a';
        ctx.lineWidth = pass === 0 ? cs * 0.34 : cs * 0.22;
        arms.forEach(([dx, dy], d) => {
          if (!(mask & (1 << d))) return;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo((dx * cs) / 2, (dy * cs) / 2);
          ctx.stroke();
        });
      }
      ctx.restore();
      if (c.kind === 'gate') {
        ctx.fillStyle = '#2a8fb0';
        ctx.beginPath();
        ctx.arc(cx, cy, cs * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
        text(ctx, 'SEA', cx, cy + 1, 10, '#fff', 'center', 900);
      }
    });
  }
}

// ---------- Shop: give every customer the right bottle ----------

export class ShopPuzzleOverlay implements Scene {
  name = 'shop_puzzle';
  covers3d = true;
  t = 0;
  selected: number | null = null;
  /** customer index → bottle index */
  given = new Map<number, number>();
  shake = new Map<number, number>();
  result: { stars: number; coins: number; t: number; total: number; best: number } | null = null;

  constructor(
    private game: Game,
    private index: number,
  ) {}

  private get level() {
    return SHOP_LEVELS[this.index];
  }

  update(dt: number): void {
    this.t += dt;
    for (const [k, v] of this.shake) this.shake.set(k, Math.max(0, v - dt * 2.5));
    if (this.result) this.result.t += dt;
  }

  private total(): number {
    let sum = 0;
    for (const [ci, bi] of this.given) sum += saleValue(this.level.customers[ci], this.level.bottles[bi]);
    return Math.round(sum);
  }

  private give(ci: number): void {
    const l = this.level;
    if (this.selected === null) {
      // tap a served customer to take the bottle back
      if (this.given.delete(ci)) sfx.tap();
      return;
    }
    const b = l.bottles[this.selected];
    if (!accepts(l.customers[ci], b)) {
      this.shake.set(ci, 1);
      sfx.fail();
      vibrate(20);
      return;
    }
    for (const [k, v] of this.given) if (v === this.selected) this.given.delete(k);
    this.given.set(ci, this.selected);
    this.selected = null;
    sfx.catch();
  }

  private serve(): void {
    const l = this.level;
    const best = Math.round(shopBest(l) ?? 0);
    const total = this.total();
    const st = shopStars(total, best, this.given.size === l.customers.length);
    const r = completeLevel(this.game.state, 'shop', this.index, st);
    analytics.track('puzzle_end', { section: 'shop', level: this.index + 1, stars: st, total, best });
    this.result = { stars: st, coins: r.coins, t: 0, total, best };
    if (st > 0) {
      sfx.rare();
      this.game.particles.burst(W / 2, 360, 40, [COLORS.gold, '#fff'], { speed: 280, kind: 'confetti', size: 6, g: 300, life: 1.2 });
    }
    this.game.commit();
  }

  private reset(): void {
    this.given.clear();
    this.selected = null;
    this.result = null;
  }

  draw(ctx: Ctx): void {
    const l = this.level;
    ctx.fillStyle = '#f6ead2';
    ctx.fillRect(0, 0, W, H);
    outlinedText(ctx, `Shop ${this.index + 1} · ${l.title}`, W / 2, 36, 22, '#fff', COLORS.ink, 5);
    text(ctx, l.hint, W / 2, 66, 12.5, COLORS.ink, 'center', 700);
    this.game.button(ctx, 'sh_back', 12, 84, 92, 36, '‹ Back', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 14 });
    this.game.button(ctx, 'sh_reset', W - 104, 84, 92, 36, 'Reset', () => this.reset(), { color: '#3a8fd9', dark: '#22609e', size: 14 });
    drawCoin(ctx, W / 2 - 40, 103, 9);
    text(ctx, `${this.total()}`, W / 2 - 26, 104, 17, COLORS.ink, 'left', 900);
    const n = l.customers.length;
    const ch = Math.min(84, Math.floor(430 / n));
    l.customers.forEach((c, ci) => {
      const y = 132 + ci * ch;
      const sh = (this.shake.get(ci) ?? 0) * Math.sin(this.t * 60) * 8;
      const given = this.given.get(ci);
      ctx.save();
      ctx.translate(sh, 0);
      ctx.fillStyle = given !== undefined ? '#e9f6e4' : '#fff';
      rr(ctx, 12, y, W - 24, ch - 8, 14);
      ctx.fill();
      ctx.strokeStyle = this.selected !== null && accepts(c, l.bottles[this.selected]) && given === undefined ? COLORS.good : 'rgba(43,33,24,0.2)';
      ctx.lineWidth = this.selected !== null && accepts(c, l.bottles[this.selected]) ? 3 : 2;
      ctx.stroke();
      // a simple customer face
      const fx = 46;
      const fy = y + (ch - 8) / 2;
      ctx.fillStyle = c.look.shirt;
      rr(ctx, fx - 18, fy + 6, 36, 22, 10);
      ctx.fill();
      ctx.fillStyle = '#e9b98e';
      ctx.beginPath();
      ctx.arc(fx, fy - 4, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (c.look.hat) {
        ctx.fillStyle = c.look.hat;
        ctx.beginPath();
        ctx.moveTo(fx - 20, fy - 12);
        ctx.lineTo(fx, fy - 30);
        ctx.lineTo(fx + 20, fy - 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(fx - 6, fy - 6, 3, 3);
      ctx.fillRect(fx + 4, fy - 6, 3, 3);
      text(ctx, c.name, 76, fy - 10, 14, COLORS.ink, 'left', 900);
      text(ctx, `“${c.says}”`, 76, fy + 10, 11, 'rgba(43,33,24,0.8)', 'left', 700);
      // the bottle they got
      const bx = W - 52;
      ctx.strokeStyle = 'rgba(43,33,24,0.3)';
      ctx.setLineDash([4, 4]);
      rr(ctx, bx - 24, y + 6, 48, ch - 20, 10);
      ctx.stroke();
      ctx.setLineDash([]);
      if (given !== undefined) {
        const b = l.bottles[given];
        drawBottle(ctx, bx, y + ch - 22, Math.min(40, ch - 34), b.recipe, tierFor(b.degrees).color);
        const tip = c.fav === b.recipe && c.tip ? ` +${c.tip}` : '';
        text(ctx, `${Math.round(saleValue(c, b))}${tip ? '♥' : ''}`, bx - 34, y + ch - 20, 11, COLORS.good, 'right', 900);
      }
      ctx.restore();
      if (!this.result) this.game.hitArea(`cust_${ci}`, 12, y, W - 24, ch - 8, () => this.give(ci));
    });
    // the shelf
    const shelfY = 132 + n * ch + 8;
    panel(ctx, 8, shelfY, W - 16, 150, '#b98a52', 16);
    text(ctx, this.selected === null ? 'Tap a bottle…' : '…then tap the customer for it', W / 2, shelfY + 16, 12, '#fff', 'center', 900);
    const nb = l.bottles.length;
    const bw = (W - 32) / nb;
    l.bottles.forEach((b, bi) => {
      const used = [...this.given.values()].includes(bi);
      const x = 16 + bi * bw + bw / 2;
      const lift = this.selected === bi ? -12 : 0;
      ctx.save();
      if (used) ctx.globalAlpha = 0.3;
      drawBottle(ctx, x, shelfY + 96 + lift, 50, b.recipe, tierFor(b.degrees).color);
      ctx.restore();
      text(ctx, `${b.degrees}°N`, x, shelfY + 114, 13, '#fff', 'center', 900);
      const name = RECIPES_BY_ID[b.recipe].name.replace(' Reserve', '').replace('Classic Anchovy', 'Classic');
      text(ctx, name, x, shelfY + 132, 9.5, '#fff8e8', 'center', 900);
      if (!this.result && !used)
        this.game.hitArea(`bottle_${bi}`, x - bw / 2, shelfY + 20, bw, 126, () => {
          this.selected = this.selected === bi ? null : bi;
          sfx.tap();
        });
    });
    const all = this.given.size === n;
    if (!this.result) this.game.button(ctx, 'serve', W / 2 - 110, Math.min(H - 70, shelfY + 160), 220, 56, all ? 'Serve!' : `Serve (${this.given.size}/${n})`, () => this.serve(), { color: COLORS.good, dark: '#2f7a3b', size: 20, disabled: !all, pulse: all });
    if (this.result)
      drawResult(this.game, ctx, this.result.t, { section: 'shop', index: this.index, stars: this.result.stars, coins: this.result.coins, salt: 0, detail: `Earned ${this.result.total} of a best ${this.result.best}` }, () => this.game.pop(this), () => this.reset());
  }
}
