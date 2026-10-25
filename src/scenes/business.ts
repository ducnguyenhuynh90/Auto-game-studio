// Business report: where the money comes from, where it goes, and a button on every line that leads to
// the action that switches an income on, fixes an idle worker, or cuts a cost (core/business.ts).
import { analytics } from '../core/analytics';
import { BRAND_STAGES } from '../core/brand';
import { costLines, deliverContract, earningsBySource, incomeSources, qualifying, refreshContracts, savingTips, type Fix } from '../core/business';
import { RECIPES_BY_ID } from '../core/data';
import { FESTIVAL, RADIO_AD, adOn, festivalOn, hostFestival, ledger, runAd, upkeepPerHour, wagesPerHour } from '../core/island';
import { sfx } from '../render/audio';
import { COLORS, H, W, clamp01, drawCoin, ease, font, outlinedText, panel, rr, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';
import { BrandOverlay } from './brand';
import { MarketOverlay } from './market';
import { PuzzleHubOverlay } from './puzzles';

type Tab = 'earn' | 'costs' | 'boost';
const STATUS = { active: { c: COLORS.good, t: 'Earning' }, idle: { c: '#e67e22', t: 'Idle' }, off: { c: '#9a948a', t: 'Not set up' } };

function wrap(ctx: Ctx, s: string, maxW: number, size: number): string[] {
  ctx.font = font(size, 700);
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

export class BusinessOverlay implements Scene {
  name = 'business';
  covers3d = true;
  t = 0;

  constructor(
    private game: Game,
    public tab: Tab = 'earn',
  ) {
    refreshContracts(game.state);
    analytics.track('business_open', { tab });
  }

  update(dt: number): void {
    this.t += dt;
  }

  /** Runs the action behind a "Set up" / "Fix" button. */
  private run(a: Fix): void {
    const g = this.game;
    analytics.track('business_fix', { kind: a.kind, building: 'building' in a ? a.building : '' });
    switch (a.kind) {
      case 'build':
        g.goIsland(a.tile ?? undefined);
        if (a.tile === null) g.toast('Buy more land first', '#8a7a66', 'Tap a "for sale" plot next to your land');
        return;
      case 'select':
        return g.goIsland(a.tile);
      case 'market':
        return g.push(new MarketOverlay(g));
      case 'jars':
        return g.push(new MarketOverlay(g, 'village'));
      case 'brand':
        return g.push(new BrandOverlay(g));
      case 'puzzles':
        return g.push(new PuzzleHubOverlay(g));
      case 'fish':
        return g.goFishing(g.state.sea);
      case 'contracts':
      case 'boost':
        this.tab = 'boost';
        return;
    }
  }

  draw(ctx: Ctx): void {
    const s = this.game.state;
    ctx.fillStyle = 'rgba(20,15,10,0.6)';
    ctx.fillRect(0, 0, W, H);
    const k = ease.outBack(clamp01(this.t / 0.3));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(k, k);
    ctx.translate(-W / 2, -H / 2);
    panel(ctx, 10, 30, W - 20, 800, COLORS.paper, 24);
    outlinedText(ctx, 'Business Report', W / 2, 62, 26, '#fff', COLORS.ink, 6);
    ctx.restore();
    this.game.button(ctx, 'biz_close', W - 62, 42, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
    // the bottom line, always on top
    const l = ledger(s);
    const income = Math.round(l.incomeRate);
    const costs = wagesPerHour(s) + upkeepPerHour(s);
    const net = income - costs;
    const cols: [string, string, string][] = [
      ['Earning', `+${income}/h`, COLORS.good],
      ['Costs', `−${costs}/h`, COLORS.bad],
      ['Net', `${net >= 0 ? '+' : '−'}${Math.abs(net)}/h`, net >= 0 ? COLORS.good : COLORS.bad],
    ];
    cols.forEach(([label, v, c], i) => {
      const x = 22 + i * ((W - 44) / 3);
      ctx.fillStyle = '#fff';
      rr(ctx, x + 2, 88, (W - 44) / 3 - 4, 50, 12);
      ctx.fill();
      text(ctx, label, x + (W - 44) / 6, 102, 11, 'rgba(43,33,24,0.6)', 'center', 900);
      text(ctx, v, x + (W - 44) / 6, 124, 17, c, 'center', 900);
    });
    // tabs
    const tabs: [Tab, string][] = [
      ['earn', 'Earn'],
      ['costs', 'Costs'],
      ['boost', 'Boost'],
    ];
    tabs.forEach(([id, label], i) => {
      const x = 22 + i * ((W - 44) / 3);
      const on = this.tab === id;
      ctx.fillStyle = on ? COLORS.accent : 'rgba(43,33,24,0.08)';
      rr(ctx, x + 2, 148, (W - 44) / 3 - 4, 34, 12);
      ctx.fill();
      text(ctx, label, x + (W - 44) / 6, 165, 15, on ? '#fff' : COLORS.ink, 'center', 900);
      this.game.hitArea(`biz_tab_${id}`, x, 146, (W - 44) / 3, 38, () => (this.tab = id));
    });
    if (this.tab === 'earn') this.drawEarn(ctx);
    else if (this.tab === 'costs') this.drawCosts(ctx);
    else this.drawBoost(ctx);
  }

  private drawEarn(ctx: Ctx): void {
    const s = this.game.state;
    const rows = incomeSources(s);
    rows.forEach((r, i) => {
      const y = 192 + i * 66;
      ctx.fillStyle = '#fff';
      rr(ctx, 20, y, W - 40, 60, 12);
      ctx.fill();
      const st = STATUS[r.status];
      ctx.fillStyle = st.c;
      rr(ctx, 20, y, 6, 60, 3);
      ctx.fill();
      text(ctx, r.name, 34, y + 13, 13, COLORS.ink, 'left', 900);
      text(ctx, st.t, 34 + ctx.measureText(r.name).width + 8, y + 13, 9.5, st.c, 'left', 900);
      text(ctx, r.value, W - 30, y + 13, 13, r.status === 'off' ? 'rgba(43,33,24,0.4)' : COLORS.ink, 'right', 900);
      const lines = wrap(ctx, r.how, r.fix ? W - 160 : W - 70, 10);
      lines.slice(0, 2).forEach((ln, j) => text(ctx, ln, 34, y + 31 + j * 13, 10, 'rgba(43,33,24,0.75)', 'left', 700));
      if (r.fix) this.game.button(ctx, `biz_fix_${r.id}`, W - 120, y + 26, 92, 28, r.fix.label, () => this.run(r.fix!.action), { color: r.status === 'idle' ? '#e67e22' : COLORS.good, dark: r.status === 'idle' ? '#a85a14' : '#2f7a3b', size: 11 });
    });
    const totals = earningsBySource(s).filter((x) => x.total > 0);
    const line = totals.length ? `Earned so far: ${totals.map((x) => `${x.name} ${x.total}`).join(' · ')}` : 'Earned so far: nothing yet from staff. Set up a line above!';
    wrap(ctx, line, W - 50, 10).slice(0, 2).forEach((ln, j) => text(ctx, ln, W / 2, 728 + j * 14, 10, '#7a5aa8', 'center', 800));
  }

  private drawCosts(ctx: Ctx): void {
    const s = this.game.state;
    const lines = costLines(s);
    let y = 196;
    text(ctx, 'RUNNING COSTS PER HOUR', 24, y, 11, 'rgba(43,33,24,0.6)', 'left', 900);
    y += 14;
    if (!lines.length) {
      text(ctx, 'No staff or buildings yet: no costs.', W / 2, y + 16, 13, COLORS.ink, 'center', 700);
      y += 36;
    }
    for (const c of lines.slice(0, 9)) {
      ctx.fillStyle = '#fff';
      rr(ctx, 20, y, W - 40, 26, 8);
      ctx.fill();
      text(ctx, c.name, 30, y + 13, 11.5, COLORS.ink, 'left', 800);
      if (c.note) text(ctx, c.note, W - 100, y + 13, 10, '#e67e22', 'right', 900);
      text(ctx, `−${c.perHour}/h`, W - 30, y + 13, 12, COLORS.bad, 'right', 900);
      y += 29;
    }
    const total = wagesPerHour(s) + upkeepPerHour(s);
    text(ctx, `Total −${total}/h · paid so far ${Math.round(ledger(s).wages + ledger(s).upkeep)} · boosts ${ledger(s).boosts ?? 0}`, W / 2, y + 10, 11, COLORS.ink, 'center', 900);
    y += 30;
    text(ctx, 'HOW TO SPEND LESS', 24, y, 11, 'rgba(43,33,24,0.6)', 'left', 900);
    y += 12;
    const tips = savingTips(s);
    if (!tips.length) text(ctx, 'Nothing to fix: every worker is busy. Nice!', W / 2, y + 18, 13, COLORS.good, 'center', 900);
    for (const tip of tips) {
      if (y > H - 110) break;
      ctx.fillStyle = '#fffaf0';
      rr(ctx, 20, y, W - 40, 50, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(43,33,24,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      wrap(ctx, tip.text, tip.fix ? W - 150 : W - 60, 10.5)
        .slice(0, 3)
        .forEach((ln, j) => text(ctx, ln, 30, y + 13 + j * 13, 10.5, COLORS.ink, 'left', 700));
      if (tip.fix) this.game.button(ctx, `biz_tip_${y}`, W - 116, y + 11, 88, 28, tip.fix.label, () => this.run(tip.fix!.action), { color: '#3a8fd9', dark: '#22609e', size: 11 });
      y += 56;
    }
    text(ctx, 'Costs are paid all the time, even offline. If you are broke, staff pause.', W / 2, H - 30, 9.5, 'rgba(43,33,24,0.6)', 'center', 700);
  }

  private drawBoost(ctx: Ctx): void {
    const s = this.game.state;
    const now = Date.now();
    const card = (y: number, h: number, title: string, desc: string, color: string) => {
      ctx.fillStyle = '#fff';
      rr(ctx, 20, y, W - 40, h, 12);
      ctx.fill();
      ctx.fillStyle = color;
      rr(ctx, 20, y, 6, h, 3);
      ctx.fill();
      text(ctx, title, 34, y + 14, 13, COLORS.ink, 'left', 900);
      wrap(ctx, desc, W - 170, 10).slice(0, 3).forEach((ln, j) => text(ctx, ln, 34, y + 32 + j * 13, 10, 'rgba(43,33,24,0.75)', 'left', 700));
    };
    const left = (until?: number) => `${Math.ceil(((until ?? 0) - now) / 60000)} min left`;
    // festival
    card(192, 76, 'Host a festival (lễ hội)', `15 minutes: tour groups ×2, shop prices +20%, +10 attraction. Best with a Tour Office and full shelves.`, '#e8443a');
    if (festivalOn(s, now)) text(ctx, left(s.island.festivalUntil), W - 74, 222, 12, '#e8443a', 'center', 900);
    else
      this.game.button(ctx, 'boost_fest', W - 128, 210, 100, 34, `${FESTIVAL.cost}`, () => {
        if (!hostFestival(s, Date.now())) return;
        sfx.rare();
        analytics.track('festival', {});
        this.game.toast('Festival!', '#e8443a', 'Lanterns up, music on: tourists pour in');
        this.game.commit();
      }, { color: '#e8443a', dark: '#9a2a22', size: 14, coin: true, disabled: s.coins < FESTIVAL.cost });
    // radio ad
    card(276, 76, 'Radio ad on Phú Quốc FM', 'One hour of bigger tour groups (+50%) and +5 attraction. Only worth it with Tour Guides hired.', '#3a8fd9');
    if (adOn(s, now)) text(ctx, left(s.island.adUntil), W - 74, 306, 12, '#3a8fd9', 'center', 900);
    else
      this.game.button(ctx, 'boost_ad', W - 128, 294, 100, 34, `${RADIO_AD.cost}`, () => {
        if (!runAd(s, Date.now())) return;
        sfx.upgrade();
        analytics.track('radio_ad', {});
        this.game.toast('On the radio!', '#3a8fd9', '"Visit Bà Năm\'s mắm village on Phú Quốc!"');
        this.game.commit();
      }, { color: '#3a8fd9', dark: '#22609e', size: 14, coin: true, disabled: s.coins < RADIO_AD.cost });
    // brand
    const b = BRAND_STAGES[s.brand.level];
    card(360, 64, `Brand: ${b.name} ×${b.mult.toFixed(2)}`, 'Every bottle (yours, the shop\'s, souvenirs, orders) sells for more.', '#a35bd6');
    this.game.button(ctx, 'boost_brand', W - 128, 376, 100, 32, 'Brand ›', () => this.run({ kind: 'brand' }), { color: '#a35bd6', dark: '#6f3a96', size: 13 });
    // export orders
    text(ctx, 'EXPORT ORDERS (TRADING POST)', 24, 444, 11, 'rgba(43,33,24,0.6)', 'left', 900);
    const orders = refreshContracts(s, now);
    if (!orders.length) {
      card(456, 60, 'No Trading Post yet', 'Build one on the Old Pier: mainland buyers then send big orders for your bottles.', '#9a948a');
      return;
    }
    orders.forEach((c, i) => {
      const y = 456 + i * 92;
      const fit = qualifying(s, c).length;
      const want = `${c.count} bottle${c.count > 1 ? 's' : ''} ≥ ${c.minDeg}°N${c.recipe ? ` · ${RECIPES_BY_ID[c.recipe].name}` : ''}`;
      card(y, 84, c.buyer, `${want}. You have ${Math.min(fit, c.count)}/${c.count} that fit.`, c.done ? COLORS.good : '#c9a36a');
      drawCoin(ctx, W - 108, y + 16, 8);
      text(ctx, String(c.pay), W - 96, y + 16, 14, COLORS.ink, 'left', 900);
      if (c.done) text(ctx, 'Delivered!', W - 74, y + 52, 13, COLORS.good, 'center', 900);
      else
        this.game.button(ctx, `deliver_${c.id}`, W - 128, y + 36, 100, 34, 'Deliver', () => {
          const pay = deliverContract(s, c.id);
          if (!pay) return;
          sfx.coin();
          analytics.track('contract_done', { pay, count: c.count, minDeg: c.minDeg });
          this.game.coinPulse = 1;
          this.game.float(W / 2, y, `+${pay}`, COLORS.gold, 30);
          this.game.commit();
        }, { color: COLORS.good, dark: '#2f7a3b', size: 14, disabled: fit < c.count });
    });
    text(ctx, 'New orders every 2 hours. They pay well above the market.', W / 2, 740, 10.5, 'rgba(43,33,24,0.6)', 'center', 700);
  }
}
