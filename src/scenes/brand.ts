// Brand screen: the name on the bottle. Reputation comes from every bottle sold; the next stage costs
// coins once the reputation is there, and raises every sauce price (core/brand.ts).
import { analytics } from '../core/analytics';
import { BRAND_STAGES, brandProblem, upgradeBrand } from '../core/brand';
import { sfx } from '../render/audio';
import { COLORS, H, W, clamp01, drawBottle, drawCoin, ease, outlinedText, panel, rr, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

export class BrandOverlay implements Scene {
  name = 'brand';
  covers3d = true;
  t = 0;

  constructor(private game: Game) {}

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    const s = this.game.state;
    const b = s.brand;
    ctx.fillStyle = 'rgba(20,15,10,0.6)';
    ctx.fillRect(0, 0, W, H);
    const k = ease.outBack(clamp01(this.t / 0.3));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(k, k);
    ctx.translate(-W / 2, -H / 2);
    panel(ctx, 12, 40, W - 24, 780, COLORS.paper, 24);
    outlinedText(ctx, 'Your Brand', W / 2, 76, 28, '#fff', COLORS.ink, 6);
    ctx.restore();
    this.game.button(ctx, 'close', W - 66, 54, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
    // the bottle as it is labelled today
    const cur = BRAND_STAGES[b.level];
    drawBottle(ctx, 70, 210, 96, 'classic', '#f2c14e');
    text(ctx, cur.name, 120, 120, 18, COLORS.ink, 'left', 900);
    text(ctx, cur.local, 120, 140, 12, 'rgba(43,33,24,0.6)', 'left', 700);
    text(ctx, `Sauce sells for ×${cur.mult.toFixed(2)}`, 120, 166, 15, COLORS.good, 'left', 900);
    const next = BRAND_STAGES[b.level + 1];
    text(ctx, `Reputation ${b.rep}${next ? ` / ${next.rep}` : ''}`, 120, 192, 13, COLORS.ink, 'left', 900);
    if (next) {
      ctx.fillStyle = 'rgba(43,33,24,0.12)';
      rr(ctx, 120, 202, W - 150, 10, 5);
      ctx.fill();
      ctx.fillStyle = '#a35bd6';
      rr(ctx, 120, 202, (W - 150) * Math.min(1, b.rep / next.rep), 10, 5);
      ctx.fill();
    }
    text(ctx, 'Every bottle sold (by you or your shop) adds reputation.', W / 2, 236, 11, 'rgba(43,33,24,0.7)', 'center', 700);
    text(ctx, 'Stronger sauce (°N) builds it faster.', W / 2, 252, 11, 'rgba(43,33,24,0.7)', 'center', 700);
    // the ladder
    BRAND_STAGES.forEach((st, i) => {
      const y = 272 + i * 74;
      const done = i <= b.level;
      const isNext = i === b.level + 1;
      ctx.fillStyle = done ? '#eaf6e4' : '#fff';
      rr(ctx, 24, y, W - 48, 66, 14);
      ctx.fill();
      ctx.strokeStyle = isNext ? '#a35bd6' : 'rgba(43,33,24,0.2)';
      ctx.lineWidth = isNext ? 3 : 2;
      ctx.stroke();
      ctx.fillStyle = done ? COLORS.good : 'rgba(43,33,24,0.25)';
      ctx.beginPath();
      ctx.arc(48, y + 33, 14, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, done ? '✓' : String(i), 48, y + 34, 14, '#fff', 'center', 900);
      text(ctx, st.name, 70, y + 18, 14, COLORS.ink, 'left', 900);
      text(ctx, st.desc, 70, y + 37, 10, 'rgba(43,33,24,0.75)', 'left', 700);
      const problem = isNext ? brandProblem(s) : null;
      text(ctx, i === 0 ? 'Start' : problem ? problem.replace(' (sell more bottles)', '') : `Rep ${st.rep} · ${st.cost} coins`, 70, y + 54, 10, problem ? COLORS.bad : '#7a5aa8', 'left', 900);
      text(ctx, `×${st.mult.toFixed(2)}`, W - 40, y + 20, 16, done ? COLORS.good : COLORS.ink, 'right', 900);
      if (isNext) {
        this.game.button(ctx, 'brand_up', W - 132, y + 30, 96, 30, 'Upgrade', () => {
          if (!upgradeBrand(s)) return;
          sfx.rare();
          analytics.track('brand_up', { level: s.brand.level, rep: s.brand.rep });
          this.game.toast(`${BRAND_STAGES[s.brand.level].name}!`, '#a35bd6', `Every bottle now sells ×${BRAND_STAGES[s.brand.level].mult.toFixed(2)}`);
          this.game.particles.burst(W / 2, 200, 40, [COLORS.gold, '#fff', '#a35bd6'], { speed: 260, kind: 'star', size: 6, g: 300, life: 1.1 });
          this.game.commit();
        }, { color: '#a35bd6', dark: '#6f3a96', size: 13, disabled: !!problem });
      }
    });
    drawCoin(ctx, 40, 806, 9);
    text(ctx, String(s.coins), 54, 807, 14, COLORS.ink, 'left', 900);
  }
}
