// Evolution roadmap: a climbing path of stages for one upgrade line (or the village), each with its
// 3D model, name and stat. Current stage glows, the next one can be bought, future ones are silhouettes.
import { explain } from '../core/help';
import { showHelp } from './info';
import { analytics } from '../core/analytics';
import type { UpgradeId } from '../core/data';
import { TRACK_TITLE, VILLAGE_STAGES, currentStage, stages, type Track } from '../core/evolution';
import { upgradeCost, villageLevel } from '../core/state';
import { COLORS, H, W, clamp01, drawCoin, ease, font, outlinedText, panel, rr, stageImage, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';
import { purchaseUpgrade } from './market';

export class EvolutionOverlay implements Scene {
  name = 'evolution';
  covers3d = true;
  t = 0;
  /** Stage that just evolved (plays a little burst + bounce). */
  private evolvedAt = -1;
  private evolvedT = 0;

  constructor(
    private game: Game,
    private track: Track,
  ) {
    analytics.track('evolution_view', { track });
  }

  update(dt: number): void {
    this.t += dt;
    this.evolvedT += dt;
  }

  /** Node centres: stage 0 at the bottom, climbing upward and zig-zagging like a road. */
  private nodePos(i: number, n: number): { x: number; y: number } {
    const top = 236;
    const bottom = 716;
    const y = bottom - (i * (bottom - top)) / Math.max(1, n - 1);
    return { x: i % 2 === 0 ? 112 : W - 112, y };
  }

  draw(ctx: Ctx): void {
    const s = this.game.state;
    const st = stages(this.track);
    const cur = currentStage(s, this.track);
    ctx.fillStyle = 'rgba(20,15,10,0.6)';
    ctx.fillRect(0, 0, W, H);
    const k = ease.outBack(clamp01(this.t / 0.3));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(k, k);
    ctx.translate(-W / 2, -H / 2);
    panel(ctx, 12, 40, W - 24, 780, '#f6ecd8', 24);
    outlinedText(ctx, `${TRACK_TITLE[this.track]} Evolution`, W / 2, 78, 26, '#fff', COLORS.ink, 6);
    text(ctx, `Now: ${st[cur].name}  ·  ${cur + 1}/${st.length}`, W / 2, 108, 14, COLORS.ink, 'center', 800);
    if (this.track === 'village') {
      const lvl = villageLevel(s);
      const next = VILLAGE_STAGES[cur + 1];
      text(ctx, next ? `Village Lv ${lvl} → ${next.minLevel} for ${next.name}` : `Village Lv ${lvl} · fully grown!`, W / 2, 130, 12, 'rgba(43,33,24,0.7)', 'center', 700);
      text(ctx, 'Grow it with jars, the salt house, the stall and your ship.', W / 2, 148, 11, 'rgba(43,33,24,0.6)', 'center', 600);
    }

    // the road between stages
    for (let i = 0; i < st.length - 1; i++) {
      const a = this.nodePos(i, st.length);
      const b = this.nodePos(i + 1, st.length);
      ctx.save();
      ctx.strokeStyle = i < cur ? COLORS.gold : 'rgba(43,33,24,0.25)';
      ctx.lineWidth = i < cur ? 8 : 6;
      ctx.setLineDash(i < cur ? [] : [10, 10]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(a.x, (a.y + b.y) / 2, b.x, (a.y + b.y) / 2, b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
    st.forEach((stage, i) => this.drawNode(ctx, i, st.length, stage, cur));
    ctx.restore();
    this.game.button(ctx, 'close', W - 66, 54, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });

    // the buy button sits on the next stage (outside the scale transform so hit areas match)
    if (this.track !== 'village' && cur < st.length - 1 && this.t > 0.3) {
      const id = this.track as UpgradeId;
      const cost = upgradeCost(s, id)!;
      const p = this.nodePos(cur + 1, st.length);
      const left = (cur + 1) % 2 === 0;
      const bx = left ? p.x + 80 : p.x - 80 - 150;
      this.game.button(ctx, 'evolve', bx, p.y + 6, 150, 44, `${cost}`, () => {
        if (purchaseUpgrade(this.game, id, cost, p.x, p.y)) {
          this.evolvedAt = cur + 1;
          this.evolvedT = 0;
          this.game.particles.burst(p.x, p.y, 40, [COLORS.gold, '#fff', COLORS.accent], { speed: 300, kind: 'star', size: 7, g: 200, life: 1.2 });
        }
      }, { coin: true, disabled: s.coins < cost, whyNot: () => showHelp(this.game, explain(s, `Needs ${cost} coins`)), pulse: s.coins >= cost, size: 20, sub: s.coins < cost ? `need ${cost - s.coins} more` : 'Evolve!' });
    }
  }

  private drawNode(ctx: Ctx, i: number, n: number, stage: ReturnType<typeof stages>[number], cur: number): void {
    const p = this.nodePos(i, n);
    const owned = i <= cur;
    const isCur = i === cur;
    const isNext = i === cur + 1;
    const r = 66;
    const bounce = i === this.evolvedAt ? ease.outElastic(clamp01(this.evolvedT / 0.8)) : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(bounce, bounce);
    if (isCur) {
      const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.5);
      g.addColorStop(0, `rgba(255,214,110,${0.55 + Math.sin(this.t * 4) * 0.2})`);
      g.addColorStop(1, 'rgba(255,214,110,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = owned ? '#fffaf0' : isNext ? '#fff3e0' : '#d9cdb6';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = isCur ? 6 : 4;
    ctx.strokeStyle = isCur ? COLORS.gold : owned ? COLORS.good : isNext ? COLORS.accent : 'rgba(43,33,24,0.35)';
    ctx.stroke();
    const img = stageImage(this.track, i);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r - 4, 0, Math.PI * 2);
      ctx.clip();
      if (!owned && !isNext) ctx.filter = 'brightness(0.15)';
      else if (isNext) ctx.filter = 'saturate(0.6)';
      ctx.drawImage(img, -r - 4, -r - 4, (r + 4) * 2, (r + 4) * 2);
      ctx.restore();
    }
    if (!owned && !isNext) outlinedText(ctx, '?', 0, 4, 34, '#fff', COLORS.ink, 5);
    if (owned && !isCur) {
      ctx.fillStyle = COLORS.good;
      ctx.beginPath();
      ctx.arc(r * 0.7, -r * 0.7, 14, 0, Math.PI * 2);
      ctx.fill();
      outlinedText(ctx, '✓', r * 0.7, -r * 0.7 + 1, 15, '#fff', COLORS.ink, 3);
    }
    if (isCur) {
      ctx.fillStyle = COLORS.gold;
      rr(ctx, -30, -r - 14, 60, 22, 10);
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, 'NOW', 0, -r - 3, 12, COLORS.ink, 'center', 900);
    }
    ctx.restore();
    // label on the open side of the road
    const left = i % 2 === 0;
    const lx = left ? p.x + r + 14 : p.x - r - 14;
    const align = left ? 'left' : 'right';
    const maxW = W - 40 - (r + 14) - 112 + 20;
    ctx.font = font(16, 900);
    const name = stage.name;
    text(ctx, name, lx, p.y - 34, ctx.measureText(name).width > maxW ? 13 : 16, owned || isNext ? COLORS.ink : 'rgba(43,33,24,0.6)', align, 900);
    ctx.fillStyle = owned ? COLORS.good : isNext ? COLORS.accent : 'rgba(43,33,24,0.35)';
    ctx.font = font(12, 900);
    const sw = ctx.measureText(stage.stat).width + 16;
    rr(ctx, left ? lx : lx - sw, p.y - 22, sw, 22, 10);
    ctx.fill();
    text(ctx, stage.stat, left ? lx + 8 : lx - 8, p.y - 11, 12, '#fff', align, 900);
    // the next stage shows its Evolve button here instead (only for buyable tracks)
    if (owned || (isNext && this.track === 'village')) {
      ctx.font = font(11, 600);
      const words = stage.desc.split(' ');
      let line = '';
      let row = 0;
      for (const w of words) {
        const t = line ? `${line} ${w}` : w;
        if (ctx.measureText(t).width > maxW && line) {
          text(ctx, line, lx, p.y + 12 + row * 14, 11, 'rgba(43,33,24,0.75)', align, 600);
          line = w;
          row++;
        } else line = t;
      }
      if (line && row < 2) text(ctx, line, lx, p.y + 12 + row * 14, 11, 'rgba(43,33,24,0.75)', align, 600);
    }
    if (stage.cost > 0 && !owned && !isNext) {
      drawCoin(ctx, left ? lx + 8 : lx - 46, p.y + 14, 7);
      text(ctx, String(stage.cost), left ? lx + 20 : lx - 34, p.y + 15, 11, 'rgba(43,33,24,0.6)', 'left', 800);
    }
  }
}
