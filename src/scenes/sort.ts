// Market Sort (rules in core/sort.ts): a level map of 50 stalls and the sorting board itself.
// Tap a good to pick it up, tap a shelf to put it there. Three of a kind sell. Boosters cost game coins.
import { analytics } from '../core/analytics';
import {
  GOODS,
  SORT_BOOSTERS,
  SORT_LEVELS,
  SLOTS,
  buySortBooster,
  freeSlot,
  goodsLeft,
  sortBoard,
  sortComplete,
  sortLevelSpec,
  sortMove,
  sortOpen,
  sortReward,
  sortShuffle,
  sortStars,
  sortStarsOf,
  sortStuck,
  sortWon,
  smartHint,
  type HintPlan,
  type SortBoard,
  type SortBooster,
} from '../core/sort';
import { sfx, vibrate } from '../render/audio';
import { COLORS, H, W, clamp01, drawCoin, ease, outlinedText, panel, rr, star, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

const TIER_COLOR: Record<string, string> = { 'super easy': '#5cb85c', easy: '#3a8fd9', medium: '#e67e22', hard: '#c0392b' };

function drawGood(ctx: Ctx, g: number, x: number, y: number, size: number, alpha = 1, lift = 0): void {
  const good = GOODS[g];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = good.color;
  rr(ctx, x - size / 2, y - size / 2 - lift, size, size, size * 0.25);
  ctx.fill();
  ctx.strokeStyle = 'rgba(43,33,24,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `${Math.round(size * 0.68)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(good.emoji, x, y - lift + 1);
  ctx.restore();
}

// ---------- Level map ----------

export class SortMenuOverlay implements Scene {
  name = 'sort_menu';
  covers3d = true;
  t = 0;

  constructor(private game: Game) {
    analytics.track('sort_menu', { cleared: game.state.sort.filter((x) => x > 0).length });
  }

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    const s = this.game.state;
    ctx.fillStyle = '#f3e0c0';
    ctx.fillRect(0, 0, W, H);
    outlinedText(ctx, 'Market Sort', W / 2, 40, 30, '#fff', COLORS.ink, 6);
    text(ctx, "Bà Năm's stall is a mess! Three of a kind on a shelf sell.", W / 2, 72, 12, COLORS.ink, 'center', 700);
    this.game.button(ctx, 'close', W - 62, 18, 48, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
    const cols = 5;
    const gap = (W - 40) / cols;
    const cleared = s.sort.filter((x) => x > 0).length;
    for (let i = 0; i < SORT_LEVELS; i++) {
      const cx = 20 + gap * ((i % cols) + 0.5);
      const cy = 118 + Math.floor(i / cols) * 66;
      const open = sortOpen(s, i);
      const st = sortStarsOf(s, i);
      const tier = sortLevelSpec(i).tier;
      const next = open && st === 0;
      const k = next ? 1 + Math.sin(this.t * 5) * 0.06 : 1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.fillStyle = open ? (st > 0 ? TIER_COLOR[tier] : '#fff') : '#d8cfbf';
      rr(ctx, -26, -22, 52, 44, 12);
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      text(ctx, open ? String(i + 1) : '🔒', 0, 1, open ? 17 : 13, st > 0 ? '#fff' : COLORS.ink, 'center', 900);
      ctx.restore();
      for (let n = 0; n < 3; n++) {
        ctx.fillStyle = n < st ? COLORS.gold : 'rgba(43,33,24,0.15)';
        star(ctx, cx + (n - 1) * 11, cy + 30, 4.5);
      }
      if (open) this.game.hitArea(`sort_lvl_${i}`, cx - gap / 2, cy - 26, gap, 62, () => this.game.push(new SortGameOverlay(this.game, i)));
    }
    text(ctx, `${cleared}/${SORT_LEVELS} cleared · green super easy · blue easy · orange medium · red hard`, W / 2, H - 22, 10.5, 'rgba(43,33,24,0.65)', 'center', 800);
  }
}

// ---------- The board ----------

interface Result {
  won: boolean;
  why: string;
  /** Shelves full but time left: a shuffle can save the level. */
  stuck?: boolean;
  stars: number;
  coins: number;
  t: number;
}

export class SortGameOverlay implements Scene {
  name = 'sort_game';
  covers3d = true;
  t = 0;
  board: SortBoard;
  left: number;
  picked: { s: number; c: number } | null = null;
  hint: [number, number, number, number] | null = null;
  /** The Hint's winning plan; it continues while the player follows it. */
  plan: HintPlan = { states: [], moves: [] };
  freeHint = 1;
  pops: { x: number; y: number; g: number; t: number }[] = [];
  result: Result | null = null;

  constructor(
    private game: Game,
    private level: number,
  ) {
    this.board = sortBoard(level);
    this.left = this.board.time;
    analytics.track('puzzle_start', { section: 'sort', level: level + 1, goods: goodsLeft(this.board) });
  }

  /** Shelf rectangle on screen: 3 columns, as many rows as needed. */
  private cell(s: number): { x: number; y: number; w: number; h: number } {
    const n = this.board.shelves.length;
    const rows = Math.ceil(n / 3);
    const h = Math.min(128, 572 / rows);
    const top = 110 + (600 - rows * h) / 2; // the stall sits in the middle of the wall
    const w = (W - 24) / 3;
    return { x: 12 + (s % 3) * w, y: top + Math.floor(s / 3) * h, w, h };
  }

  private slotPos(s: number, c: number): { x: number; y: number; size: number } {
    const r = this.cell(s);
    const size = Math.min(34, (r.w - 16) / SLOTS - 2);
    const x = r.x + 8 + ((r.w - 16) / SLOTS) * (c + 0.5);
    return { x, y: r.y + r.h - 18 - size / 2, size };
  }

  update(dt: number): void {
    this.t += dt;
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.6);
    if (this.result) {
      this.result.t += dt;
      return;
    }
    this.left = Math.max(0, this.left - dt);
    if (this.left <= 0) this.finish(false, "Time's up!");
  }

  private finish(won: boolean, why: string, stuck = false): void {
    const stars = won ? sortStars(this.left, this.board.time) : 0;
    const r = won ? sortComplete(this.game.state, this.level, stars) : { first: false, coins: 0 };
    // a full stall can still be rescued with a shuffle, so it is not the end of the level yet
    analytics.track(stuck ? 'sort_stuck' : 'puzzle_end', { section: 'sort', level: this.level + 1, stars, moves: this.board.moves, left: Math.round(this.left), why });
    this.result = { won, why, stuck, stars, coins: r.coins, t: 0 };
    if (won) {
      sfx.upgrade();
      this.game.particles.burst(W / 2, 330, 40, [COLORS.gold, '#f27a3a', '#5cb85c', '#3a8fd9'], { up: true });
    } else sfx.fail();
    this.game.commit();
  }

  private tapShelf(s: number, c: number | null): void {
    const b = this.board;
    if (b.shelves[s].lock > 0) {
      sfx.fail();
      this.game.toast(`Tied up: sell ${b.shelves[s].lock} more`, '#8a7a66', 'Every sale loosens the rope');
      return;
    }
    const row = b.shelves[s].rows[0];
    if (!this.picked) {
      if (c !== null && row[c] !== null) {
        this.picked = { s, c };
        sfx.tap();
      }
      return;
    }
    const p = this.picked;
    if (p.s === s && (c === null || c === p.c)) {
      this.picked = null;
      return;
    }
    // tapped another good on a shelf with no room: pick that one instead
    const to = c !== null && row[c] === null ? c : freeSlot(b, s);
    if (to < 0) {
      if (c !== null && row[c] !== null) this.picked = { s, c };
      else sfx.fail();
      return;
    }
    const r = sortMove(b, p.s, p.c, s, to);
    this.picked = null;
    this.hint = null;
    if (!r.ok) return;
    sfx.plop();
    if (r.sold !== null) {
      sfx.coin();
      vibrate(30);
      const cr = this.cell(s);
      this.pops.push({ x: cr.x + cr.w / 2, y: cr.y + cr.h / 2, g: r.sold, t: 0 });
    }
    if (sortWon(b)) this.finish(true, 'Stall cleared!');
    else if (sortStuck(b)) this.finish(false, 'No room left on the shelves', true);
  }

  private useBooster(k: SortBooster): void {
    const s = this.game.state;
    const free = k === 'hint' && this.freeHint > 0;
    if (!free && !buySortBooster(s, k)) {
      sfx.fail();
      this.game.toast(`Needs ${SORT_BOOSTERS[k].cost} coins`, COLORS.bad, 'Earn coins by fishing and selling sauce');
      return;
    }
    if (free) this.freeHint--;
    analytics.track('sort_booster', { booster: k, level: this.level + 1, free });
    if (k === 'hint') this.hint = smartHint(this.board, this.plan);
    if (k === 'shuffle') {
      sortShuffle(this.board, this.game.rng);
      this.picked = null;
      this.hint = null;
      if (sortWon(this.board)) this.finish(true, 'Stall cleared!');
    }
    if (k === 'time') this.left += 60;
    sfx.tap();
    this.game.commit();
  }

  draw(ctx: Ctx): void {
    const b = this.board;
    const s = this.game.state;
    ctx.fillStyle = '#c98f5c';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f3e0c0';
    ctx.fillRect(0, 100, W, 610);
    // top bar: level, timer, goods left, close
    const sp = sortLevelSpec(this.level);
    panel(ctx, 10, 14, 92, 40, '#7a4a2a', 14);
    text(ctx, `Lv ${this.level + 1}`, 56, 34, 18, '#fff', 'center', 900);
    const low = this.left < 20;
    panel(ctx, 110, 14, 132, 40, low ? COLORS.bad : '#b03a2e', 14);
    const mm = Math.floor(this.left / 60);
    const ss = Math.floor(this.left % 60);
    text(ctx, `⏱ ${mm}:${String(ss).padStart(2, '0')}`, 176, 34, 19, '#fff', 'center', 900);
    panel(ctx, 250, 14, 78, 40, '#fff8ec', 14);
    text(ctx, `${goodsLeft(b)} left`, 289, 34, 13, COLORS.ink, 'center', 900);
    this.game.button(ctx, 'sort_close', W - 54, 14, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
    text(ctx, `${sp.tier} · three of a kind sell`, W / 2, 76, 12, '#fff', 'center', 900);
    // shelves
    b.shelves.forEach((sh, si) => {
      const r = this.cell(si);
      ctx.fillStyle = '#a0683a';
      rr(ctx, r.x + 3, r.y + 4, r.w - 6, r.h - 8, 10);
      ctx.fill();
      ctx.fillStyle = '#f7e7cc';
      rr(ctx, r.x + 8, r.y + 9, r.w - 16, r.h - 18, 8);
      ctx.fill();
      ctx.fillStyle = '#c98444';
      ctx.fillRect(r.x + 8, r.y + r.h - 16, r.w - 16, 6); // the plank
      // the row behind, peeking over the front row
      const back = sh.rows[1];
      if (back)
        back.forEach((g, c) => {
          if (g === null) return;
          const p = this.slotPos(si, c);
          drawGood(ctx, g, p.x, p.y - p.size * 0.62, p.size * 0.82, 0.38);
        });
      // the whole shelf is a target too (forgiving taps); registered first so the slots win (last on top)
      this.game.hitArea(`sort_shelf_${si}`, r.x, r.y, r.w, r.h, () => this.tapShelf(si, null));
      if (sh.rows.length > 2) text(ctx, `+${sh.rows.length - 1} rows`, r.x + r.w - 12, r.y + 20, 9, 'rgba(43,33,24,0.55)', 'right', 900);
      sh.rows[0].forEach((g, c) => {
        const p = this.slotPos(si, c);
        const picked = this.picked?.s === si && this.picked.c === c;
        const hinted = this.hint && ((this.hint[0] === si && this.hint[1] === c) || (this.hint[2] === si && this.hint[3] === c));
        if (hinted) {
          ctx.strokeStyle = `rgba(245,194,66,${0.6 + 0.4 * Math.sin(this.t * 8)})`;
          ctx.lineWidth = 4;
          rr(ctx, p.x - p.size / 2 - 4, p.y - p.size / 2 - 4, p.size + 8, p.size + 8, 10);
          ctx.stroke();
        }
        if (g !== null) drawGood(ctx, g, p.x, p.y, p.size, 1, picked ? 10 : 0);
        else {
          ctx.strokeStyle = this.picked ? 'rgba(92,184,92,0.7)' : 'rgba(43,33,24,0.12)';
          ctx.lineWidth = 2;
          rr(ctx, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, p.size * 0.25);
          ctx.stroke();
        }
        this.game.hitArea(`sort_${si}_${c}`, p.x - p.size / 2 - 3, r.y + 4, p.size + 6, r.h - 8, () => this.tapShelf(si, c));
      });
      if (sh.lock > 0) {
        ctx.fillStyle = 'rgba(60,45,30,0.55)';
        rr(ctx, r.x + 3, r.y + 4, r.w - 6, r.h - 8, 10);
        ctx.fill();
        ctx.strokeStyle = '#d9c9a8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(r.x + 10, r.y + 12);
        ctx.lineTo(r.x + r.w - 10, r.y + r.h - 12);
        ctx.moveTo(r.x + r.w - 10, r.y + 12);
        ctx.lineTo(r.x + 10, r.y + r.h - 12);
        ctx.stroke();
        ctx.fillStyle = '#3a8fd9';
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
        text(ctx, String(sh.lock), r.x + r.w / 2, r.y + r.h / 2 + 1, 17, '#fff', 'center', 900);
      }
    });
    // sold pops
    for (const p of this.pops) {
      const k = ease.outBack(clamp01(p.t / 0.3));
      for (let n = 0; n < 3; n++) drawGood(ctx, p.g, p.x + (n - 1) * 30 * k, p.y - p.t * 60, 30, 1 - p.t / 0.6);
      ctx.globalAlpha = 1 - p.t / 0.6;
      outlinedText(ctx, 'Sold!', p.x, p.y - 34 - p.t * 60, 20, COLORS.gold, COLORS.ink, 4);
      ctx.globalAlpha = 1;
    }
    // boosters
    const keys: SortBooster[] = ['hint', 'shuffle', 'time'];
    keys.forEach((k, i) => {
      const bs = SORT_BOOSTERS[k];
      const x = 14 + i * 122;
      const label = k === 'hint' && this.freeHint > 0 ? `${bs.icon} ${bs.name} free` : `${bs.icon} ${bs.name} ${bs.cost}`;
      this.game.button(ctx, `sort_${k}`, x, 726, 116, 50, label, () => this.useBooster(k), { color: '#a35bd6', dark: '#6f3a96', size: 14, disabled: !!this.result });
    });
    drawCoin(ctx, W / 2 - 30, 800, 9);
    text(ctx, String(s.coins), W / 2 - 16, 801, 15, '#fff', 'left', 900);
    if (this.result) this.drawResult(ctx, this.result);
  }

  private drawResult(ctx: Ctx, r: Result): void {
    ctx.fillStyle = 'rgba(20,15,10,0.55)';
    ctx.fillRect(0, 0, W, H);
    const k = ease.outBack(clamp01(r.t / 0.35));
    ctx.save();
    ctx.translate(W / 2, 380);
    ctx.scale(k, k);
    panel(ctx, -165, -150, 330, 290, COLORS.paper, 24);
    outlinedText(ctx, r.won ? 'Sold out!' : 'Oh no…', 0, -110, 32, r.won ? '#fff' : '#ffd9cc', COLORS.ink, 6);
    text(ctx, r.why, 0, -70, 14, COLORS.ink, 'center', 800);
    for (let n = 0; n < 3; n++) {
      ctx.fillStyle = n < r.stars ? COLORS.gold : 'rgba(43,33,24,0.15)';
      star(ctx, (n - 1) * 46, -28, 18);
    }
    if (r.coins) {
      drawCoin(ctx, -40, 20, 11);
      text(ctx, `+${r.coins}`, 4, 21, 20, COLORS.ink, 'center', 900);
    } else if (r.won) text(ctx, 'Best kept', 0, 21, 14, 'rgba(43,33,24,0.6)', 'center', 800);
    else text(ctx, `First clear pays ${sortReward(this.level)} coins`, 0, 21, 13, 'rgba(43,33,24,0.65)', 'center', 800);
    ctx.restore();
    if (r.t < 0.35) return;
    if (r.stuck) {
      // full shelves, time still on the clock: shuffle and keep going, or start again
      const cost = SORT_BOOSTERS.shuffle.cost;
      this.game.button(ctx, 'sort_continue', W / 2 - 150, 450, 300, 54, `🔀 Shuffle & keep going  ${cost}`, () => this.continueAfterStuck(), { color: COLORS.good, dark: '#2f7a3b', size: 16, pulse: true, disabled: this.game.state.coins < cost, whyNot: () => this.game.toast(`Needs ${cost} coins`, COLORS.bad, 'Earn coins by fishing and selling sauce') });
      this.game.button(ctx, 'sort_retry', W / 2 - 150, 514, 140, 44, 'Retry', () => this.restart(), { color: '#8a7a66', dark: '#5f5244', size: 16 });
      this.game.button(ctx, 'sort_back', W / 2 + 10, 514, 140, 44, 'All levels', () => this.game.pop(this), { color: '#a35bd6', dark: '#6f3a96', size: 16 });
      return;
    }
    const next = this.level + 1;
    const hasNext = r.won && next < SORT_LEVELS;
    this.game.button(ctx, 'sort_retry', W / 2 - 150, 450, hasNext ? 140 : 300, 54, 'Retry', () => this.restart(), { color: '#8a7a66', dark: '#5f5244', size: 18 });
    if (hasNext) this.game.button(ctx, 'sort_next', W / 2 + 10, 450, 140, 54, `Level ${next + 1} ›`, () => this.restart(next), { color: COLORS.good, dark: '#2f7a3b', size: 18, pulse: true });
    this.game.button(ctx, 'sort_back', W / 2 - 150, 514, 300, 44, 'All levels', () => this.game.pop(this), { color: '#a35bd6', dark: '#6f3a96', size: 16 });
  }

  private continueAfterStuck(): void {
    if (!buySortBooster(this.game.state, 'shuffle')) return;
    analytics.track('sort_booster', { booster: 'shuffle', level: this.level + 1, free: false, rescue: true });
    sortShuffle(this.board, this.game.rng);
    this.result = null;
    this.game.commit();
    if (sortWon(this.board)) this.finish(true, 'Stall cleared!');
    else if (sortStuck(this.board)) this.finish(false, 'Still no room', true);
  }

  private restart(level = this.level): void {
    this.game.pop(this);
    this.game.push(new SortGameOverlay(this.game, level));
  }
}
