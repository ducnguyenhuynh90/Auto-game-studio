// The Sea Chart: a story route of seas. Tap an island to see its missions, fish and relic, then sail.
import { explain } from '../core/help';
import { infoIcon } from './info';
import { analytics } from '../core/analytics';
import { RARITY_COLOR, SPECIES, type SeaId } from '../core/data';
import { RELICS } from '../core/items';
import { SEAS, SEAS_BY_ID, seaComplete, seaLock } from '../core/seas';
import { sfx } from '../render/audio';
import { COLORS, H, W, clamp01, drawFish, ease, outlinedText, panel, rr, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';
import { drawRelicBadge } from './missions';
import { MarketOverlay } from './market';

export class MapScene implements Scene {
  name = 'map';
  t = 0;
  selected: SeaId | null;
  sail: { from: SeaId; to: SeaId; k: number } | null = null;
  private sheetT = 0;

  constructor(private game: Game) {
    this.selected = game.state.sea;
  }

  update(dt: number): void {
    this.t += dt;
    this.sheetT += dt;
    if (this.sail) {
      this.sail.k = Math.min(1, this.sail.k + dt / 1.6);
      if (this.sail.k >= 1) {
        const to = this.sail.to;
        this.sail = null;
        this.game.goFishing(to);
      }
    }
  }

  private select(id: SeaId): void {
    if (this.sail) return;
    this.selected = id;
    this.sheetT = 0;
  }

  private setSail(id: SeaId): void {
    const s = this.game.state;
    analytics.track('sail', { from: s.sea, to: id });
    sfx.cast();
    if (id === s.sea) {
      this.game.goFishing(id);
      return;
    }
    this.sail = { from: s.sea, to: id, k: 0 };
    s.sea = id;
    this.game.commit();
  }

  draw(ctx: Ctx): void {
    const s = this.game.state;
    const world = this.game.world;
    // title
    panel(ctx, 70, 14, W - 140, 48, COLORS.paper, 18);
    outlinedText(ctx, 'Sea Chart', W / 2, 38, 24, '#fff', COLORS.ink, 5);
    this.game.button(ctx, 'back', 10, 14, 54, 48, '‹', () => this.game.goVillage(), { color: '#8a7a66', dark: '#5f5244', size: 26 });
    // island labels
    for (const sea of SEAS) {
      const p = world?.map.islandScreen(sea.id) ?? { x: W / 2, y: 600 - SEAS.indexOf(sea) * 110 };
      const lock = seaLock(s, sea);
      const done = sea.missions.filter((m) => s.missionsDone.includes(m.id)).length;
      const ly = p.y + 34;
      ctx.font = '900 13px sans-serif';
      const w = Math.max(ctx.measureText(sea.name).width + 24, 96);
      ctx.fillStyle = lock ? 'rgba(90,90,100,0.85)' : sea.id === this.selected ? '#fff1b8' : COLORS.paper;
      rr(ctx, p.x - w / 2, ly - 12, w, 38, 12);
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, sea.name, p.x, ly - 1, 13, lock ? '#fff' : COLORS.ink);
      if (lock) text(ctx, 'Locked', p.x, ly + 15, 10, '#ffd0c0', 'center', 800);
      else {
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i < done ? COLORS.gold : 'rgba(43,33,24,0.2)';
          ctx.beginPath();
          ctx.arc(p.x - 18 + i * 12, ly + 14, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (sea.id === s.sea && !this.sail) text(ctx, 'YOU ARE HERE', p.x, p.y - 58, 10, '#fff', 'center', 900);
      this.game.hitArea(`isle_${sea.id}`, p.x - 60, p.y - 50, 120, 110, () => this.select(sea.id));
    }
    if (this.selected && !this.sail) this.drawSheet(ctx, SEAS_BY_ID[this.selected]);
    if (this.sail) outlinedText(ctx, `Sailing to ${SEAS_BY_ID[this.sail.to].name}…`, W / 2, H - 60, 22, '#fff', COLORS.ink, 6);
  }

  private drawSheet(ctx: Ctx, sea: (typeof SEAS)[number]): void {
    const s = this.game.state;
    const k = ease.outCubic(clamp01(this.sheetT / 0.3));
    const top = H - 300 + (1 - k) * 300;
    ctx.save();
    panel(ctx, 10, top, W - 20, 296, COLORS.paper, 22);
    const lock = seaLock(s, sea);
    ctx.font = '900 22px sans-serif';
    outlinedText(ctx, sea.name, 30 + ctx.measureText(sea.name).width / 2, top + 26, 22, '#fff', COLORS.ink, 5);
    text(ctx, sea.local, 30, top + 50, 12, 'rgba(43,33,24,0.55)', 'left', 700);
    text(ctx, sea.blurb, 30, top + 70, 12, COLORS.ink, 'left', 600);
    // fish of this sea
    const fish = SPECIES.filter((sp) => sp.seas.includes(sea.id) && !sp.crate);
    const found = fish.filter((sp) => s.dex[sp.id]).length;
    text(ctx, `FISH ${found}/${fish.length}`, 30, top + 94, 11, 'rgba(43,33,24,0.6)', 'left', 900);
    fish.slice(0, 8).forEach((sp, i) => {
      const x = 44 + i * 42;
      const y = top + 118;
      ctx.fillStyle = s.dex[sp.id] ? '#fff' : 'rgba(43,33,24,0.08)';
      rr(ctx, x - 19, y - 16, 38, 32, 8);
      ctx.fill();
      ctx.strokeStyle = s.dex[sp.id] ? RARITY_COLOR[sp.rarity] : 'rgba(43,33,24,0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      if (!s.dex[sp.id]) {
        ctx.globalAlpha = 0.3;
        ctx.filter = 'brightness(0)';
      }
      drawFish(ctx, sp.id, x, y, 30);
      ctx.restore();
    });
    // missions
    const done = sea.missions.filter((m) => s.missionsDone.includes(m.id)).length;
    text(ctx, `STORY ${done}/4`, 30, top + 152, 11, 'rgba(43,33,24,0.6)', 'left', 900);
    sea.missions.forEach((m, i) => {
      const d = s.missionsDone.includes(m.id);
      text(ctx, `${d ? '✓' : '•'} ${m.text}`, 30, top + 170 + i * 17, 12, d ? 'rgba(43,33,24,0.45)' : COLORS.ink, 'left', d ? 600 : 800);
    });
    const relic = RELICS[sea.relic];
    drawRelicBadge(ctx, W - 50, top + 34, 18, relic.color, s.relics.includes(sea.relic));
    text(ctx, relic.name, W - 50, top + 64, 10, COLORS.ink, 'center', 800);
    ctx.restore();
    // action
    const by = top + 240;
    if (lock) {
      text(ctx, lock, W / 2, by + 6, 13, COLORS.bad, 'center', 900);
      ctx.font = '900 13px sans-serif';
      infoIcon(ctx, this.game, 'sealock', W / 2 + ctx.measureText(lock).width / 2 + 16, by + 5, () => explain(s, lock), 9);
      if (/boat/i.test(lock)) this.game.button(ctx, 'tomarket', W / 2 - 90, by + 18, 180, 40, 'Go to Market', () => this.game.push(new MarketOverlay(this.game, 'gear')), { color: COLORS.accent, size: 16 });
    } else {
      const here = sea.id === s.sea;
      const complete = seaComplete(s, sea);
      this.game.button(ctx, 'sail', W / 2 - 110, by, 220, 52, here ? 'Fish here' : 'Set sail!', () => this.setSail(sea.id), {
        color: '#2a9db5',
        dark: '#16677a',
        size: 22,
        pulse: !complete,
        sub: complete ? 'Story complete' : undefined,
      });
    }
  }
}
