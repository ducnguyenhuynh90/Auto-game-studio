// Collection view: species found + best sauce per recipe.
import { SEAS_BY_ID } from '../core/seas';
import { RARITY_COLOR, RECIPES, SPECIES, tierFor } from '../core/data';
import { COLORS, H, W, clamp01, drawFish, ease, outlinedText, panel, rr, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

export class DexOverlay implements Scene {
  name = 'dex';
  t = 0;
  page = 0;

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
    const perPage = 12;
    const pages = Math.ceil(SPECIES.length / perPage);
    SPECIES.slice(this.page * perPage, this.page * perPage + perPage).forEach((sp, i) => {
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
        text(ctx, SEAS_BY_ID[sp.seas[0]].name, cx + 52, cy + 86, 10, 'rgba(43,33,24,0.45)', 'center', 600);
      }
    });
    if (pages > 1) {
      text(ctx, `Page ${this.page + 1}/${pages}`, W / 2, 538, 12, 'rgba(43,33,24,0.6)', 'center', 900);
      this.game.button(ctx, 'dexprev', 110, 524, 40, 28, '‹', () => (this.page = (this.page + pages - 1) % pages), { color: '#8a7a66', dark: '#5f5244', size: 16 });
      this.game.button(ctx, 'dexnext', W - 150, 524, 40, 28, '›', () => (this.page = (this.page + 1) % pages), { color: '#8a7a66', dark: '#5f5244', size: 16 });
    }
    // recipe book
    const ry = 568;
    text(ctx, 'RECIPE BOOK · BEST SAUCE', 30, ry, 13, 'rgba(43,33,24,0.6)', 'left', 900);
    const cw = (W - 58) / 2;
    RECIPES.forEach((r, i) => {
      const x = 26 + (i % 2) * (cw + 6);
      const y = ry + 14 + Math.floor(i / 2) * 42;
      const best = s.cellar[r.id];
      ctx.fillStyle = best !== undefined ? '#fff' : 'rgba(43,33,24,0.08)';
      rr(ctx, x, y, cw, 36, 10);
      ctx.fill();
      ctx.fillStyle = r.color;
      rr(ctx, x + 6, y + 7, 10, 22, 4);
      ctx.fill();
      text(ctx, best !== undefined ? r.name : '???', x + 22, y + 11, r.name.length > 16 ? 10 : 11, COLORS.ink, 'left', 800);
      if (best !== undefined) {
        const tier = tierFor(best);
        ctx.fillStyle = tier.color;
        rr(ctx, x + 22, y + 20, 64, 13, 6);
        ctx.fill();
        text(ctx, tier.name, x + 54, y + 27, 9, '#fff', 'center', 900);
        text(ctx, `${best.toFixed(1)}°N`, x + cw - 8, y + 26, 11, COLORS.ink, 'right', 900);
      } else text(ctx, 'Undiscovered', x + 22, y + 26, 10, 'rgba(43,33,24,0.5)', 'left', 600);
    });
    ctx.restore();
    this.game.button(ctx, 'close', W - 66, 54, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
  }
}
