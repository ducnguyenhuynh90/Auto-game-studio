// Collection view: species found + best sauce per recipe.
import { RARITY_COLOR, RECIPES, SPECIES, tierFor } from '../core/data';
import { COLORS, H, W, clamp01, drawFish, ease, outlinedText, panel, rr, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

export class DexOverlay implements Scene {
  name = 'dex';
  t = 0;

  constructor(private game: Game) {}

  update(dt: number): void {
    this.t += dt;
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
    const found = SPECIES.filter((sp) => s.dex[sp.id]).length;
    outlinedText(ctx, 'Fishdex', W / 2, 78, 30, '#fff', COLORS.ink, 6);
    text(ctx, `${found} of ${SPECIES.length} discovered`, W / 2, 108, 14, 'rgba(43,33,24,0.7)');
    SPECIES.forEach((sp, i) => {
      const cx = 30 + (i % 3) * 112;
      const cy = 126 + Math.floor(i / 3) * 102;
      const e = s.dex[sp.id];
      ctx.fillStyle = e ? '#fff' : 'rgba(43,33,24,0.08)';
      rr(ctx, cx, cy, 104, 94, 14);
      ctx.fill();
      ctx.strokeStyle = e ? RARITY_COLOR[sp.rarity] : 'rgba(43,33,24,0.2)';
      ctx.lineWidth = e ? 3 : 2;
      ctx.stroke();
      if (e) {
        drawFish(ctx, sp.id, cx + 52, cy + 36, 70, { wiggle: this.t * 3 + i });
        text(ctx, sp.name, cx + 52, cy + 70, sp.name.length > 12 ? 10 : 12, COLORS.ink);
        text(ctx, sp.treasure ? `x${e.count}` : `best ${e.best}cm · x${e.count}`, cx + 52, cy + 84, 10, 'rgba(43,33,24,0.6)', 'center', 600);
      } else {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.filter = 'brightness(0)';
        drawFish(ctx, sp.id, cx + 52, cy + 38, 70);
        ctx.restore();
        text(ctx, '???', cx + 52, cy + 72, 14, 'rgba(43,33,24,0.5)');
        text(ctx, sp.zones.includes('lagoon') ? 'Lagoon' : 'Reef', cx + 52, cy + 86, 10, 'rgba(43,33,24,0.45)', 'center', 600);
      }
    });
    // recipe book
    const ry = 540;
    text(ctx, 'RECIPE BOOK · BEST SAUCE', 30, ry, 13, 'rgba(43,33,24,0.6)', 'left', 900);
    RECIPES.forEach((r, i) => {
      const y = ry + 18 + i * 44;
      const best = s.cellar[r.id];
      ctx.fillStyle = best !== undefined ? '#fff' : 'rgba(43,33,24,0.08)';
      rr(ctx, 26, y, W - 52, 38, 10);
      ctx.fill();
      ctx.fillStyle = r.color;
      rr(ctx, 34, y + 8, 14, 22, 4);
      ctx.fill();
      text(ctx, best !== undefined ? r.name : '??? Undiscovered recipe', 58, y + 19, 14, COLORS.ink, 'left');
      if (best !== undefined) {
        const tier = tierFor(best);
        text(ctx, `${best.toFixed(1)}°N`, W - 120, y + 19, 14, COLORS.ink, 'right', 900);
        ctx.fillStyle = tier.color;
        rr(ctx, W - 112, y + 8, 76, 22, 8);
        ctx.fill();
        text(ctx, tier.name, W - 74, y + 19, 12, '#fff', 'center', 900);
      }
    });
    ctx.restore();
    this.game.button(ctx, 'close', W - 66, 54, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
  }
}
