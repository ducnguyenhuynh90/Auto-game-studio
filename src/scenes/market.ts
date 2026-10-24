// Market: turn products into coins, and coins into visible village upgrades.
import { analytics } from '../core/analytics';
import { SPECIES_BY_ID, UPGRADES, tierFor } from '../core/data';
import { currentGoal } from '../core/goals';
import { buyUpgrade, productPrice, sellFish, sellProduct, upgradeCost } from '../core/state';
import { sfx } from '../render/audio';
import { COLORS, H, W, clamp01, drawBottle, drawCoin, ease, outlinedText, panel, rr, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

export class MarketOverlay implements Scene {
  name = 'market';
  t = 0;

  constructor(private game: Game) {}

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
    }
    // --- Bucket ---
    const fishValue = s.bucket.reduce((sum, f) => sum + SPECIES_BY_ID[f.species].raw, 0);
    text(ctx, `FRESH FISH: ${s.bucket.length}`, 30, 310, 13, 'rgba(43,33,24,0.6)', 'left', 900);
    if (s.bucket.length > 0) {
      this.game.button(ctx, 'sellfish', W - 200, 296, 170, 32, `Sell all fish +${fishValue}`, () => this.sellBucket(), { color: '#c9a36a', dark: '#8f6f40', size: 14 });
      text(ctx, 'Fish are worth more as sauce!', 30, 336, 11, 'rgba(43,33,24,0.5)', 'left');
    }

    // --- Upgrades ---
    text(ctx, 'UPGRADE YOUR VILLAGE', 30, 364, 13, 'rgba(43,33,24,0.6)', 'left', 900);
    // the upgrade the current goal asks for pulses, so new players know where to tap
    const goalUpgrade = ({ jar2: 'jars', rod1: 'rod', salt1: 'salt', boat1: 'boat' } as Record<string, string>)[currentGoal(s)?.id ?? ''];
    UPGRADES.forEach((u, i) => {
      const y = 378 + i * 84;
      const lvl = s.upgrades[u.id];
      const next = u.levels[lvl + 1];
      const cost = upgradeCost(s, u.id);
      ctx.fillStyle = '#fff';
      rr(ctx, 26, y, W - 52, 76, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(43,33,24,0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, next ? next.name : u.levels[lvl].name, 40, y + 20, 17, COLORS.ink, 'left', 900);
      text(ctx, next ? next.desc : 'Maxed out!', 40, y + 44, 12, 'rgba(43,33,24,0.7)', 'left', 600);
      // level pips
      for (let p = 0; p < u.levels.length - 1; p++) {
        ctx.fillStyle = p < lvl ? COLORS.accent : 'rgba(43,33,24,0.15)';
        rr(ctx, 40 + p * 22, y + 58, 18, 7, 3);
        ctx.fill();
      }
      if (cost !== null) {
        const afford = s.coins >= cost;
        this.game.button(ctx, `up_${u.id}`, W - 140, y + 14, 104, 48, String(cost), () => {
          if (buyUpgrade(s, u.id)) {
            sfx.upgrade();
            this.game.shake = 0.25;
            this.game.particles.burst(W - 88, y + 38, 30, [COLORS.gold, COLORS.accent, '#fff'], { speed: 260, kind: 'confetti', size: 7, g: 400 });
            analytics.track('upgrade', { id: u.id, level: s.upgrades[u.id], cost });
            analytics.funnelStep('first_upgrade', { id: u.id });
            this.game.toast(`${u.levels[s.upgrades[u.id]].name}!`, COLORS.good, u.id === 'boat' ? 'The Reef is now open' : u.id === 'jars' ? 'A new jar is in your yard' : undefined);
            this.game.commit();
          }
        }, { coin: true, disabled: !afford, color: COLORS.accent, size: 20, pulse: u.id === goalUpgrade });
      }
    });
  }
}
