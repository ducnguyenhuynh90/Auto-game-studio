// "How fish sauce is made": the whole line on one screen, live. Each step shows its stock, who does it
// (you, or staff with an Auto switch), and moving progress; the bottom estimates what the staff line
// earns per hour and names its slowest step with a button that fixes it (core/business.ts lineEstimate).
import { analytics } from '../core/analytics';
import { lineEstimate, staffJars, suggestPlot, type Fix } from '../core/business';
import { BALANCE } from '../core/data';
import { ROLE, bucketCap, isAuto, islandUnlocked, saltCap, setAuto, staffAt, type Role, type Step } from '../core/island';
import { agingLevel, canFerment, productPrice } from '../core/state';
import { sfx } from '../render/audio';
import { COLORS, H, W, clamp01, drawBottle, drawCoin, drawFish, drawJar, font, outlinedText, panel, rr, star, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';
import { JarFillOverlay, RevealOverlay } from './jar';
import { MarketOverlay } from './market';

const CARD_H = 82;
const TOP = 104;

export class ProductionOverlay implements Scene {
  name = 'production';
  covers3d = true;
  t = 0;

  constructor(private game: Game) {
    analytics.track('production_open', {});
  }

  update(dt: number): void {
    this.t += dt;
  }

  private staffOf(role: Role) {
    return this.game.state.island.staff.filter((x) => x.role === role);
  }

  /** "Staff: 2 Fishers" or "You", plus the Auto switch when there is staff for this step. */
  private who(ctx: Ctx, y: number, step: Step, role: Role): void {
    const s = this.game.state;
    const team = this.staffOf(role);
    const unlocked = islandUnlocked(s);
    const auto = team.length > 0 && isAuto(s, step);
    const label = auto ? `Staff: ${team.length} ${ROLE[role].title}${team.length > 1 ? 's' : ''}` : 'You do this';
    text(ctx, label, 92, y + 70, 10.5, auto ? COLORS.good : '#7a5aa8', 'left', 900);
    if (!unlocked || !team.length) return;
    // the switch: AUTO (staff work, paid) / YOU (staff rest, unpaid)
    const x = W - 92;
    const sy = y + 50;
    ctx.fillStyle = auto ? COLORS.good : '#bdb3a3';
    rr(ctx, x, sy, 70, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(auto ? x + 58 : x + 12, sy + 12, 9, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, auto ? 'AUTO' : 'YOU', auto ? x + 26 : x + 44, sy + 12, 10, '#fff', 'center', 900);
    this.game.hitArea(`auto_${step}`, x - 6, sy - 6, 82, 36, () => {
      setAuto(s, step, !auto);
      sfx.tap();
      analytics.track('auto_toggle', { step, auto: !auto });
      this.game.toast(!auto ? `Staff ${ROLE[role].verb} again` : `You ${step === 'sell' ? 'sell' : step === 'brew' ? 'brew' : step === 'tours' ? 'guide' : step === 'fish' ? 'fish' : 'make salt'} by hand`, !auto ? COLORS.good : '#7a5aa8', !auto ? 'Their wages are paid again' : 'Their staff rest: no wages while off');
      this.game.commit();
    });
  }

  private card(ctx: Ctx, i: number, title: string, running: boolean): number {
    const y = TOP + i * (CARD_H + 6);
    ctx.fillStyle = '#fff';
    rr(ctx, 14, y, W - 28, CARD_H, 14);
    ctx.fill();
    ctx.strokeStyle = running ? 'rgba(92,184,92,0.6)' : 'rgba(43,33,24,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = running ? COLORS.good : '#c9bfae';
    ctx.beginPath();
    ctx.arc(30, y + 18, 11, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, String(i + 1), 30, y + 19, 12, '#fff', 'center', 900);
    text(ctx, title, 92, y + 15, 14, COLORS.ink, 'left', 900);
    // a flowing arrow to the next step while things move
    if (i < 5) {
      for (let k = 0; k < 3; k++) {
        const p = ((this.t * (running ? 0.8 : 0) + k / 3) % 1) * 6;
        ctx.fillStyle = running ? COLORS.good : 'rgba(43,33,24,0.2)';
        ctx.beginPath();
        ctx.arc(50, y + CARD_H + p, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return y;
  }

  private run(a: Fix): void {
    const g = this.game;
    if (a.kind === 'build') {
      g.goIsland(a.tile ?? undefined);
      if (a.tile === null) g.toast('Buy more land first', '#8a7a66', 'Tap a "for sale" plot next to your land');
    } else if (a.kind === 'select') g.goIsland(a.tile);
    else if (a.kind === 'jars') g.push(new MarketOverlay(g, 'village'));
    else if (a.kind === 'market') g.push(new MarketOverlay(g));
  }

  draw(ctx: Ctx): void {
    const s = this.game.state;
    const now = Date.now();
    ctx.fillStyle = '#f6ead2';
    ctx.fillRect(0, 0, W, H);
    outlinedText(ctx, 'How fish sauce is made', W / 2 - 18, 40, 21, '#fff', COLORS.ink, 6);
    text(ctx, 'Catch → Salt → Fill jars → Ferment → Bottle → Sell', W / 2, 72, 12, 'rgba(43,33,24,0.7)', 'center', 800);
    this.game.button(ctx, 'prod_close', W - 58, 14, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
    const est = lineEstimate(s, now);
    const fermentable = s.bucket.filter(canFerment).length;

    // 1. catch fish
    let y = this.card(ctx, 0, 'Catch fish', s.bucket.length > 0 || (isAuto(s, 'fish') && this.staffOf('fisher').length > 0));
    for (let k = 0; k < Math.min(6, s.bucket.length); k++) drawFish(ctx, s.bucket[k].species, 56 + (k % 3) * 9, y + 36 + Math.floor(k / 3) * 14, 22, { wiggle: this.t * 3 + k });
    text(ctx, `Bucket ${s.bucket.length}/${islandUnlocked(s) ? bucketCap(s) : '∞'} · ${fermentable} good for sauce`, 92, y + 36, 11, COLORS.ink, 'left', 700);
    if (est.steps[0].perHour > 0) text(ctx, `${Math.round(est.steps[0].perHour * BALANCE.jarSlots)} fish/h`, W - 26, y + 15, 11, COLORS.good, 'right', 900);
    this.who(ctx, y, 'fish', 'fisher');
    if (!isAuto(s, 'fish') || !this.staffOf('fisher').length) this.game.button(ctx, 'prod_fish', W - 104, y + 26, 82, 26, 'Go fishing', () => this.game.goFishing(s.sea), { color: '#2a9db5', dark: '#16677a', size: 11 });

    // 2. salt
    y = this.card(ctx, 1, 'Make salt', s.island.salt > 0);
    for (let k = 0; k < Math.min(5, s.island.salt); k++) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(43,33,24,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(46 + k * 8, y + 56);
      ctx.lineTo(52 + k * 8, y + 42);
      ctx.lineTo(58 + k * 8, y + 56);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    text(ctx, `Salt ${s.island.salt}/${saltCap(s)} · staff jars need 1 salt each`, 92, y + 36, 11, COLORS.ink, 'left', 700);
    if (est.steps[1].perHour > 0) text(ctx, `${Math.round(est.steps[1].perHour)} salt/h`, W - 26, y + 15, 11, COLORS.good, 'right', 900);
    this.who(ctx, y, 'salt', 'salter');

    // 3. fill jars (3 fish + 1 salt) — every jar, whose it is, and its state
    y = this.card(ctx, 2, 'Fill jars: 3 fish + salt', s.jars.some((j) => j.sealed));
    s.jars.forEach((j, i) => {
      const x = 104 + i * 40;
      drawJar(ctx, x, y + 44, 20, { empty: !j.sealed, fill: j.sealed ? 1 : 0 });
      text(ctx, j.sealed ? (j.auto ? 'Staff' : 'You') : 'Empty', x, y + 56, 8.5, j.sealed ? (j.auto ? COLORS.good : '#7a5aa8') : 'rgba(43,33,24,0.5)', 'center', 900);
    });
    const emptyIdx = s.jars.findIndex((j) => !j.sealed);
    if (emptyIdx >= 0 && fermentable >= BALANCE.jarSlots)
      this.game.button(ctx, 'prod_fill', W - 104, y + 6, 82, 26, 'Fill a jar', () => this.game.push(new JarFillOverlay(this.game, emptyIdx)), { color: '#e67e22', dark: '#a85a14', size: 11 });
    this.who(ctx, y, 'brew', 'brewer');

    // 4. ferment — live progress per sealed jar
    y = this.card(ctx, 3, 'Ferment (time makes it stronger)', s.jars.some((j) => j.sealed));
    const sealed = s.jars.map((j, i) => ({ j, i })).filter((x) => x.j.sealed);
    if (!sealed.length) text(ctx, 'No jar is fermenting. Fill one!', 92, y + 38, 11, 'rgba(43,33,24,0.6)', 'left', 700);
    sealed.slice(0, 2).forEach(({ j, i }, k) => {
      const yy = y + 30 + k * 22;
      const lvl = agingLevel(s, j, now);
      const secs = (now - j.sealedAt) / 1000;
      const toNext = lvl >= BALANCE.maxAging ? 1 : clamp01((secs - lvl * BALANCE.agingSecondsPerLevel) / BALANCE.agingSecondsPerLevel);
      text(ctx, `Jar ${i + 1}`, 92, yy + 6, 10, COLORS.ink, 'left', 900);
      ctx.fillStyle = 'rgba(43,33,24,0.12)';
      rr(ctx, 130, yy, 130, 12, 6);
      ctx.fill();
      ctx.fillStyle = lvl >= 1 ? COLORS.gold : '#c98a4a';
      rr(ctx, 130, yy, 130 * toNext, 12, 6);
      ctx.fill();
      for (let st = 0; st < BALANCE.maxAging; st++) {
        ctx.fillStyle = st < lvl ? COLORS.gold : 'rgba(43,33,24,0.15)';
        star(ctx, 272 + st * 14, yy + 6, 6);
      }
      const left = lvl >= BALANCE.maxAging ? 'max' : `${Math.max(0, Math.ceil(BALANCE.agingSecondsPerLevel - (secs % BALANCE.agingSecondsPerLevel)))}s`;
      text(ctx, left, W - 26, yy + 6, 9.5, 'rgba(43,33,24,0.6)', 'right', 800);
    });
    // bubbles while fermenting
    if (sealed.length)
      for (let k = 0; k < 4; k++) {
        const p = (this.t * 0.6 + k / 4) % 1;
        ctx.fillStyle = `rgba(201,138,74,${0.6 * (1 - p)})`;
        ctx.beginPath();
        ctx.arc(52 + k * 7, y + 66 - p * 36, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

    // 5. open & bottle
    const ready = s.jars.map((j, i) => ({ j, i })).filter((x) => x.j.sealed && agingLevel(s, x.j, now) >= 1);
    y = this.card(ctx, 4, 'Open & bottle', ready.length > 0);
    drawBottle(ctx, 56, y + 70, 34, 'classic', '#f2c14e');
    text(ctx, ready.length ? `${ready.length} jar${ready.length > 1 ? 's' : ''} ready · more ★ = stronger sauce` : 'Jars open after ★ (or more, for stronger sauce)', 92, y + 36, 10.5, COLORS.ink, 'left', 700);
    const mine = ready.find((x) => !x.j.auto) ?? (!isAuto(s, 'brew') || !this.staffOf('brewer').length ? ready[0] : undefined);
    if (mine) this.game.button(ctx, 'prod_open', W - 104, y + 48, 82, 26, 'Open', () => this.game.push(new RevealOverlay(this.game, mine.i)), { color: COLORS.gold, dark: '#b8860b', size: 12, pulse: true });
    text(ctx, isAuto(s, 'brew') && this.staffOf('brewer').length ? 'Staff open their own jars' : 'You open your jars', 92, y + 70, 10.5, isAuto(s, 'brew') && this.staffOf('brewer').length ? COLORS.good : '#7a5aa8', 'left', 900);

    // 6. sell
    const staffMade = s.shelf.filter((p) => p.auto).length;
    y = this.card(ctx, 5, 'Sell', s.shelf.length > 0);
    drawCoin(ctx, 56, y + 50, 13);
    const avg = s.shelf.length ? Math.round(s.shelf.reduce((a, p) => a + productPrice(s, p), 0) / s.shelf.length) : est.price;
    text(ctx, `Shelf ${s.shelf.length} bottle${s.shelf.length === 1 ? '' : 's'} (${staffMade} staff-made) · ~${avg} coins each`, 92, y + 36, 10.5, COLORS.ink, 'left', 700);
    if (s.shelf.length) this.game.button(ctx, 'prod_sell', W - 104, y + 6, 82, 26, 'Sell now', () => this.game.push(new MarketOverlay(this.game)), { color: '#e67e22', dark: '#a85a14', size: 11, pulse: staffMade > 3 });
    this.who(ctx, y, 'sell', 'seller');

    this.drawEstimate(ctx, est);
  }

  private drawEstimate(ctx: Ctx, est: ReturnType<typeof lineEstimate>): void {
    const s = this.game.state;
    const y = TOP + 6 * (CARD_H + 6) + 2;
    panel(ctx, 14, y, W - 28, H - y - 14, '#fffaf0', 14);
    if (!islandUnlocked(s)) {
      text(ctx, 'Right now you do every step yourself.', W / 2, y + 26, 13, COLORS.ink, 'center', 900);
      text(ctx, 'After your first sale you can hire staff for each step.', W / 2, y + 48, 11.5, 'rgba(43,33,24,0.7)', 'center', 700);
      return;
    }
    const brewing = this.staffOf('brewer').length > 0 && isAuto(s, 'brew');
    if (!brewing) {
      text(ctx, 'Staff line: not brewing yet', W / 2, y + 22, 14, COLORS.ink, 'center', 900);
      text(ctx, 'Hire a Brewer (Brew House) and staff fish + salt become sauce.', W / 2, y + 44, 11, 'rgba(43,33,24,0.75)', 'center', 700);
      const tile = s.island.buildings.find((b) => b.id === 'brewhouse')?.tile;
      this.game.button(ctx, 'prod_brewfix', W / 2 - 80, y + 60, 160, 32, tile !== undefined ? 'Hire a Brewer' : 'Build Brew House', () => this.run(tile !== undefined ? { kind: 'select', tile } : { kind: 'build', building: 'brewhouse', tile: suggestPlot(s, 'brewhouse') }), { color: COLORS.good, dark: '#2f7a3b', size: 13 });
      return;
    }
    const bph = Math.round(est.bottlesPerHour * 10) / 10;
    text(ctx, `Staff line: ~${bph} bottles/h at ~${est.degrees}°N, sells ~${Math.round(est.soldPerHour * 10) / 10}/h`, W / 2, y + 18, 12, COLORS.ink, 'center', 900);
    ctx.font = font(15, 900);
    text(ctx, `≈ +${est.coinsPerHour} coins/h (sauce + tours)`, W / 2, y + 40, 16, est.coinsPerHour > 0 ? COLORS.good : COLORS.bad, 'center', 900);
    // capacity of each step in jars per hour: the shortest bar is what limits the whole line
    const names: Record<string, string> = { fish: 'Fish (÷3)', salt: 'Salt', brew: 'Jars', sell: 'Selling' };
    const max = Math.max(1, ...est.steps.map((x) => x.perHour));
    est.steps.forEach((st, i) => {
      const by = y + 100 + i * 17;
      const slow = st.id === est.bottleneck;
      text(ctx, names[st.id], 28, by + 5, 10, slow ? '#e67e22' : COLORS.ink, 'left', 900);
      ctx.fillStyle = 'rgba(43,33,24,0.1)';
      rr(ctx, 100, by, W - 190, 10, 5);
      ctx.fill();
      ctx.fillStyle = slow ? '#e67e22' : COLORS.good;
      rr(ctx, 100, by, Math.max(2, (W - 190) * Math.min(1, st.perHour / max)), 10, 5);
      ctx.fill();
      text(ctx, `${Math.round(st.perHour)}/h`, W - 28, by + 5, 10, slow ? '#e67e22' : COLORS.ink, 'right', 900);
    });
    // the next thing to do, in one line with one button
    let msg = '';
    let fix: { label: string; action: Fix } | null = null;
    const brewhouse = s.island.buildings.find((b) => b.id === 'brewhouse');
    if (est.soldPerHour === 0 && est.bottlesPerHour > 0) {
      msg = 'Nobody sells: staff bottles wait on your shelf. Sell by hand, or hire a Shopkeeper.';
      const shop = s.island.buildings.find((b) => b.id === 'shop');
      fix = shop ? { label: staffAt(s, shop.tile).length ? 'Market' : 'Hire', action: staffAt(s, shop.tile).length ? { kind: 'market' } : { kind: 'select', tile: shop.tile } } : { label: 'Sauce Shop', action: { kind: 'build', building: 'shop', tile: suggestPlot(s, 'shop') } };
    } else if (staffJars(s) === 0) {
      msg = 'Every jar holds your own sauce: staff have no jar to fill.';
      fix = { label: 'More jars', action: { kind: 'jars' } };
    } else if (est.bottleneck === 'fish') {
      msg = 'Slowest step: catching fish (3 per jar).';
      const dock = s.island.buildings.find((b) => b.id === 'dock');
      fix = dock ? { label: 'Fishers', action: { kind: 'select', tile: dock.tile } } : { label: 'Dock', action: { kind: 'build', building: 'dock', tile: suggestPlot(s, 'dock') } };
    } else if (est.bottleneck === 'salt') {
      msg = 'Slowest step: salt (1 per jar).';
      const f = s.island.buildings.find((b) => b.id === 'saltfield');
      fix = f ? { label: 'Salt Makers', action: { kind: 'select', tile: f.tile } } : { label: 'Salt Field', action: { kind: 'build', building: 'saltfield', tile: suggestPlot(s, 'saltfield') } };
    } else if (est.bottleneck === 'brew') {
      msg = s.upgrades.jars < 3 ? 'Slowest step: jars (each ferments ~2 min). More jars = more at once.' : 'Slowest step: brewing. Hire another Brewer.';
      fix = s.upgrades.jars < 3 ? { label: 'More jars', action: { kind: 'jars' } } : brewhouse ? { label: 'Brewers', action: { kind: 'select', tile: brewhouse.tile } } : null;
    } else if (est.bottleneck === 'sell') {
      msg = 'Slowest step: selling. Another Shopkeeper, or tourists who buy souvenirs.';
    }
    const lines = wrapLines(ctx, msg, fix ? W - 150 : W - 60);
    lines.slice(0, 2).forEach((ln, i) => text(ctx, ln, 28, y + 64 + i * 14, 10.5, '#7a5aa8', 'left', 800));
    if (fix) {
      const f = fix;
      this.game.button(ctx, 'prod_fix', W - 120, y + 56, 96, 30, f.label, () => this.run(f.action), { color: '#3a8fd9', dark: '#22609e', size: 12 });
    }
    text(ctx, 'Estimate, before wages. Hand-sold staff bottles count too.', W / 2, H - 26, 9.5, 'rgba(43,33,24,0.55)', 'center', 700);
  }
}

function wrapLines(ctx: Ctx, s: string, maxW: number): string[] {
  ctx.font = font(10.5, 800);
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}
