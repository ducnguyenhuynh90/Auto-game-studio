// Market: turn products into coins, and coins into visible village upgrades.
import { analytics } from '../core/analytics';
import { SPECIES_BY_ID, UPGRADES, UPGRADES_BY_ID, tierFor, type UpgradeId } from '../core/data';
import { goalPair } from '../core/goals';
import { VILLAGE_STAGES, villageStage } from '../core/evolution';
import { EvolutionOverlay } from './evolution';
import { buyUpgrade, productPrice, sellFish, sellProduct, upgradeCost } from '../core/state';
import { sfx } from '../render/audio';
import { COLORS, H, W, clamp01, stageImage, drawBottle, drawCoin, drawPointer, ease, outlinedText, panel, rr, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

export class MarketOverlay implements Scene {
  name = 'market';
  covers3d = true;
  t = 0;

  tab: 'gear' | 'village';

  constructor(
    private game: Game,
    tab?: 'gear' | 'village',
  ) {
    this.tab = tab ?? 'gear';
    const g = this.goalUpgrade();
    if (!tab && g) this.tab = UPGRADES_BY_ID[g].kind;
  }

  update(dt: number): void {
    this.t += dt;
  }

  private sellAll(): void {
    const s = this.game.state;
    let total = 0;
    for (const p of [...s.shelf]) {
      const price = sellProduct(s, p.uid);
      total += price;
      analytics.track('sell_product', { recipe: p.recipe, degrees: p.degrees, price, where: 'market' });
    }
    if (total > 0) {
      analytics.funnelStep('first_sale', { price: total });
      sfx.coin();
      this.game.coinPulse = 1;
      this.game.float(W / 2, 200, `+${total}`, COLORS.gold, 40);
      this.game.commit();
    }
  }

  private sellBucket(): void {
    const s = this.game.state;
    let total = 0;
    for (const f of [...s.bucket]) total += sellFish(s, f.uid);
    if (total > 0) {
      analytics.track('sell_fish', { count: s.bucket.length, price: total });
      sfx.coin();
      this.game.coinPulse = 1;
      this.game.float(W / 2, 330, `+${total}`, COLORS.gold, 34);
      this.game.commit();
    }
  }

  draw(ctx: Ctx): void {
    const s = this.game.state;
    ctx.fillStyle = 'rgba(20,15,10,0.6)';
    ctx.fillRect(0, 0, W, H);
    const k = ease.outBack(clamp01(this.t / 0.35));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(k, k);
    ctx.translate(-W / 2, -H / 2);
    panel(ctx, 12, 40, W - 24, 780, COLORS.paper, 24);
    outlinedText(ctx, 'Market', W / 2, 76, 30, '#fff', COLORS.ink, 6);
    panel(ctx, 26, 58, 110, 36, '#fff', 18);
    drawCoin(ctx, 46, 76, 11);
    text(ctx, String(s.coins), 64, 77, 18, COLORS.ink, 'left', 900);
    ctx.restore();
    this.game.button(ctx, 'close', W - 66, 54, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });

    // --- Shelf ---
    text(ctx, 'YOUR FISH SAUCE', 30, 118, 13, 'rgba(43,33,24,0.6)', 'left', 900);
    if (s.shelf.length === 0) {
      text(ctx, 'No bottles yet. Open a ready jar!', W / 2, 160, 15, 'rgba(43,33,24,0.6)');
    } else {
      s.shelf.slice(0, 5).forEach((p, i) => {
        const x = 50 + i * 62;
        const tier = tierFor(p.degrees);
        drawBottle(ctx, x, 200, 70, p.recipe, tier.color);
        text(ctx, `${p.degrees.toFixed(0)}°N`, x, 212, 12, COLORS.ink);
      });
      if (s.shelf.length > 5) text(ctx, `+${s.shelf.length - 5}`, 360, 170, 16);
      const total = s.shelf.reduce((sum, p) => sum + productPrice(s, p), 0);
      this.game.button(ctx, 'sellall', 40, 230, W - 80, 56, `Sell all  +${total}`, () => this.sellAll(), { color: COLORS.good, dark: '#2f7a3b', size: 22, pulse: true });
      if (s.stats.sold === 0) drawPointer(ctx, W - 96, 252, this.t);
    }
    // --- Bucket ---
    const fishValue = s.bucket.reduce((sum, f) => sum + SPECIES_BY_ID[f.species].raw, 0);
    text(ctx, `FRESH FISH: ${s.bucket.length}`, 30, 310, 13, 'rgba(43,33,24,0.6)', 'left', 900);
    if (s.bucket.length > 0) {
      this.game.button(ctx, 'sellfish', W - 200, 296, 170, 32, `Sell all fish +${fishValue}`, () => this.sellBucket(), { color: '#c9a36a', dark: '#8f6f40', size: 14 });
      text(ctx, 'Fish are worth more as sauce!', 30, 336, 11, 'rgba(43,33,24,0.5)', 'left');
    }

    // --- Upgrades, in two tabs ---
    const tabs: ['gear' | 'village', string][] = [
      ['gear', 'Fishing Gear'],
      ['village', 'Village'],
    ];
    tabs.forEach(([id, label], i) => {
      const x = 26 + i * ((W - 52) / 2);
      const active = this.tab === id;
      ctx.fillStyle = active ? COLORS.accent : 'rgba(43,33,24,0.08)';
      rr(ctx, x + 2, 352, (W - 52) / 2 - 4, 34, 12);
      ctx.fill();
      text(ctx, label, x + (W - 52) / 4, 369, 15, active ? '#fff' : COLORS.ink, 'center', 900);
      if (this.goalUpgrade() && UPGRADES_BY_ID[this.goalUpgrade()!].kind === id && !active) {
        ctx.fillStyle = COLORS.bad;
        ctx.beginPath();
        ctx.arc(x + (W - 52) / 2 - 12, 356, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      this.game.hitArea(`tab_${id}`, x, 350, (W - 52) / 2, 38, () => (this.tab = id));
    });
    const goalUp = this.goalUpgrade();
    UPGRADES.filter((u) => u.kind === this.tab).forEach((u, i) => {
      const y = 396 + i * 82;
      const lvl = s.upgrades[u.id];
      const next = u.levels[lvl + 1];
      const cost = upgradeCost(s, u.id);
      // tapping the card (not the price) opens this item's evolution roadmap
      this.game.hitArea(`evo_${u.id}`, 26, y, W - 52, 76, () => this.game.push(new EvolutionOverlay(this.game, u.id)));
      const thumb = stageImage(u.id, Math.min(lvl + 1, u.levels.length - 1));
      ctx.fillStyle = '#fff';
      rr(ctx, 26, y, W - 52, 76, 14);
      ctx.fill();
      ctx.strokeStyle = u.id === goalUp ? COLORS.accent : 'rgba(43,33,24,0.25)';
      ctx.lineWidth = u.id === goalUp ? 3 : 2;
      ctx.stroke();
      if (thumb) ctx.drawImage(thumb, W - 196, y + 8, 60, 60);
      text(ctx, `${u.name}: ${u.levels[lvl].name}`, 40, y + 16, 11, 'rgba(43,33,24,0.55)', 'left', 800);
      text(ctx, 'Roadmap ›', W - 166, y + 70, 9, '#3a8fd9', 'center', 900);
      text(ctx, next ? `→ ${next.name}` : 'Maxed out!', 40, y + 34, 16, COLORS.ink, 'left', 900);
      text(ctx, fit(ctx, next ? next.desc : u.levels[lvl].desc, W - 52 - 210, '600 11px sans-serif'), 40, y + 54, 11, 'rgba(43,33,24,0.7)', 'left', 600);
      for (let p = 0; p < u.levels.length - 1; p++) {
        ctx.fillStyle = p < lvl ? COLORS.accent : 'rgba(43,33,24,0.15)';
        rr(ctx, 40 + p * 22, y + 64, 18, 6, 3);
        ctx.fill();
      }
      if (cost !== null) {
        const afford = s.coins >= cost;
        this.game.button(ctx, `up_${u.id}`, W - 136, y + 14, 100, 48, String(cost), () => this.buy(u.id, cost, y), { coin: true, disabled: !afford, color: COLORS.accent, size: 19, pulse: u.id === goalUp && afford });
      }
    });
    if (this.tab === 'village') {
      const y = 396 + 3 * 82;
      const vs = villageStage(s);
      this.game.hitArea('evo_village', 26, y, W - 52, 76, () => this.game.push(new EvolutionOverlay(this.game, 'village')));
      ctx.fillStyle = '#fff6dd';
      rr(ctx, 26, y, W - 52, 76, 14);
      ctx.fill();
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 3;
      ctx.stroke();
      const img = stageImage('village', vs);
      if (img) ctx.drawImage(img, 32, y + 4, 68, 68);
      text(ctx, 'YOUR VILLAGE', 110, y + 18, 11, 'rgba(43,33,24,0.55)', 'left', 900);
      text(ctx, VILLAGE_STAGES[vs].name, 110, y + 38, 17, COLORS.ink, 'left', 900);
      text(ctx, `${VILLAGE_STAGES[vs].local} · stage ${vs + 1}/${VILLAGE_STAGES.length}`, 110, y + 58, 11, 'rgba(43,33,24,0.7)', 'left', 700);
      text(ctx, 'Roadmap ›', W - 40, y + 38, 13, '#3a8fd9', 'right', 900);
    }
  }

  private buy(id: UpgradeId, cost: number, y: number): void {
    purchaseUpgrade(this.game, id, cost, W - 88, y + 38);
  }

  /** The upgrade the current goal asks for, so it can be highlighted. */
  private goalUpgrade(): UpgradeId | null {
    const s = this.game.state;
    const g = goalPair(s).current;
    if (!g) return null;
    if (g.id === 'jar2') return 'jars';
    if (g.id === 'l_mackerel' && s.upgrades.line === 0) return 'line';
    if (g.id.startsWith('voyage_') && /boat/i.test(g.text)) return 'boat';
    if (g.id === 'gear1') {
      const gear: UpgradeId[] = ['line', 'rod', 'hook', 'bait'];
      return gear.sort((a, b) => (upgradeCost(s, a) ?? 1e9) - (upgradeCost(s, b) ?? 1e9))[0];
    }
    return null;
  }
}

/** Shortens text with an ellipsis so it never runs under the buy button. */
function fit(ctx: Ctx, s: string, maxW: number, font: string): string {
  ctx.font = font;
  if (ctx.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 3 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/** Buys an upgrade with the full celebration (shared by the Market and the evolution roadmap). */
export function purchaseUpgrade(game: Game, id: UpgradeId, cost: number, x: number, y: number): boolean {
  const s = game.state;
  if (!buyUpgrade(s, id)) return false;
  const u = UPGRADES_BY_ID[id];
  sfx.upgrade();
  game.shake = 0.25;
  game.particles.burst(x, y, 30, [COLORS.gold, COLORS.accent, '#fff'], { speed: 260, kind: 'confetti', size: 7, g: 400 });
  analytics.track('upgrade', { id, level: s.upgrades[id], cost });
  analytics.funnelStep('first_upgrade', { id });
  const sub: Partial<Record<UpgradeId, string>> = {
    boat: 'New seas on the Sea Chart',
    jars: 'A new jar is in your yard',
    line: 'You can cast into deeper water',
    bait: 'Rare fish bite more often',
    hook: 'Longer bite window, tougher line',
    rod: 'Wider green zone when reeling',
  };
  game.toast(`Evolved: ${u.levels[s.upgrades[id]].name}!`, COLORS.good, sub[id]);
  game.commit();
  return true;
}
