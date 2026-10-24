// Captain's Log (all missions, relics and gadgets at a glance) and the relic-unlock celebration.
import { GOALS, progressLabel } from '../core/goals';
import { GADGETS, RELICS, type GadgetId, type RelicId } from '../core/items';
import { levelForXp, levelProgress, xpForLevel } from '../core/progression';
import { SEAS, SEAS_BY_ID, seaLock } from '../core/seas';
import { sfx } from '../render/audio';
import { COLORS, H, W, clamp01, drawCoin, ease, outlinedText, panel, rr, star, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

function check(ctx: Ctx, x: number, y: number, done: boolean): void {
  ctx.fillStyle = done ? COLORS.good : '#fff';
  rr(ctx, x - 10, y - 10, 20, 20, 6);
  ctx.fill();
  ctx.strokeStyle = done ? '#2f7a3b' : 'rgba(43,33,24,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (done) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x - 1, y + 4);
    ctx.lineTo(x + 6, y - 5);
    ctx.stroke();
  }
}

export function drawRelicBadge(ctx: Ctx, x: number, y: number, r: number, color: string, owned: boolean): void {
  ctx.save();
  ctx.fillStyle = owned ? color : 'rgba(43,33,24,0.15)';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = owned ? COLORS.ink : 'rgba(43,33,24,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = owned ? 'rgba(255,255,255,0.85)' : 'rgba(43,33,24,0.25)';
  star(ctx, x, y, r * 0.45);
  ctx.restore();
}

export class MissionsOverlay implements Scene {
  name = 'missions';
  covers3d = true;
  t = 0;
  /** Which sea's missions are shown (defaults to the current one). */
  private seaIdx: number;

  constructor(private game: Game) {
    this.seaIdx = SEAS.findIndex((x) => x.id === game.state.sea);
  }

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
    outlinedText(ctx, "Captain's Log", W / 2, 78, 28, '#fff', COLORS.ink, 6);
    // level
    const lvl = levelForXp(s.xp);
    text(ctx, `Captain level ${lvl}`, 30, 112, 15, COLORS.ink, 'left', 900);
    text(ctx, `${s.xp - xpForLevel(lvl)} / ${xpForLevel(lvl + 1) - xpForLevel(lvl)} XP`, W - 30, 112, 12, 'rgba(43,33,24,0.6)', 'right');
    ctx.fillStyle = 'rgba(43,33,24,0.12)';
    rr(ctx, 30, 122, W - 60, 10, 5);
    ctx.fill();
    ctx.fillStyle = '#a35bd6';
    rr(ctx, 30, 122, (W - 60) * levelProgress(s.xp), 10, 5);
    ctx.fill();

    let y = 160;
    // tutorial chapter while unfinished
    const tutLeft = GOALS.filter((g) => !s.goalsDone.includes(g.id));
    if (tutLeft.length) {
      text(ctx, `CHAPTER 0 · TUTORIAL  ${GOALS.length - tutLeft.length}/${GOALS.length}`, 30, y, 12, 'rgba(43,33,24,0.6)', 'left', 900);
      y += 22;
      for (const g of GOALS.slice(0, 7)) {
        const done = s.goalsDone.includes(g.id);
        check(ctx, 40, y, done);
        text(ctx, g.text, 60, y, 13, done ? 'rgba(43,33,24,0.45)' : COLORS.ink, 'left', done ? 600 : 800);
        y += 26;
      }
      y += 8;
    }

    // sea chapter with arrows to browse
    const sea = SEAS[this.seaIdx];
    const lock = seaLock(s, sea);
    text(ctx, `CHAPTER ${this.seaIdx + 1} · ${sea.name.toUpperCase()}`, W / 2, y, 13, COLORS.ink, 'center', 900);
    const ay = y - 14;
    if (this.seaIdx > 0) this.game.button(ctx, 'prevsea', 24, ay, 36, 28, '‹', () => this.seaIdx--, { color: '#8a7a66', dark: '#5f5244', size: 18 });
    if (this.seaIdx < SEAS.length - 1) this.game.button(ctx, 'nextsea', W - 60, ay, 36, 28, '›', () => this.seaIdx++, { color: '#8a7a66', dark: '#5f5244', size: 18 });
    y += 18;
    text(ctx, lock ? `Locked · ${lock}` : sea.blurb, W / 2, y, 11, lock ? COLORS.bad : 'rgba(43,33,24,0.65)', 'center', 700);
    y += 22;
    for (const m of sea.missions) {
      const done = s.missionsDone.includes(m.id);
      const [c, t] = m.progress(s);
      check(ctx, 40, y + 4, done);
      text(ctx, m.text, 60, y, 13, done ? 'rgba(43,33,24,0.45)' : COLORS.ink, 'left', done ? 600 : 800);
      if (!done && !lock) {
        ctx.fillStyle = 'rgba(43,33,24,0.12)';
        rr(ctx, 60, y + 10, 120, 6, 3);
        ctx.fill();
        ctx.fillStyle = COLORS.good;
        rr(ctx, 60, y + 10, 120 * Math.min(1, c / t), 6, 3);
        ctx.fill();
        text(ctx, progressLabel({ text: m.text, progress: [c, t] }), 186, y + 13, 11, COLORS.ink, 'left', 800);
      }
      drawCoin(ctx, W - 92, y + 4, 8);
      text(ctx, String(m.reward.coins), W - 80, y + 5, 12, COLORS.ink, 'left');
      if (m.reward.gadget) {
        ctx.fillStyle = GADGETS[m.reward.gadget].color;
        rr(ctx, W - 52, y - 5, 20, 20, 6);
        ctx.fill();
        text(ctx, GADGETS[m.reward.gadget].icon, W - 42, y + 5, 11, '#fff');
      }
      y += 38;
    }
    const relic = RELICS[sea.relic];
    const owned = s.relics.includes(sea.relic);
    drawRelicBadge(ctx, 44, y + 6, 16, relic.color, owned);
    text(ctx, `Story reward: ${relic.name}`, 70, y, 13, COLORS.ink, 'left', 900);
    text(ctx, relic.desc, 70, y + 16, 11, 'rgba(43,33,24,0.65)', 'left', 600);
    y += 46;

    // relic shelf + gadget bag
    text(ctx, 'RELICS', 30, y, 12, 'rgba(43,33,24,0.6)', 'left', 900);
    (Object.keys(RELICS) as RelicId[]).forEach((id, i) => drawRelicBadge(ctx, 110 + i * 48, y, 15, RELICS[id].color, s.relics.includes(id)));
    y += 36;
    text(ctx, 'GADGET BAG', 30, y, 12, 'rgba(43,33,24,0.6)', 'left', 900);
    const bag = (Object.keys(GADGETS) as GadgetId[]).filter((id) => (s.gadgets[id] ?? 0) > 0);
    if (!bag.length) text(ctx, 'Empty. Haul up Mystery Crates to find gadgets.', 130, y, 11, 'rgba(43,33,24,0.55)', 'left', 600);
    bag.forEach((id, i) => {
      const gd = GADGETS[id];
      ctx.fillStyle = gd.color;
      rr(ctx, 120 + i * 50, y - 14, 44, 28, 10);
      ctx.fill();
      text(ctx, `${gd.icon}×${s.gadgets[id]}`, 142 + i * 50, y, 12, '#fff');
    });
    ctx.restore();
    this.game.button(ctx, 'close', W - 66, 54, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
  }
}

/** Full-screen moment when a sea's story is finished and its relic is earned. */
export class RelicOverlay implements Scene {
  name = 'relic';
  t = 0;

  constructor(
    private game: Game,
    private relic: RelicId,
  ) {
    sfx.rare();
    game.particles.burst(W / 2, 330, 80, [RELICS[relic].color, COLORS.gold, '#fff'], { speed: 420, kind: 'star', size: 8, g: 200, life: 1.8 });
  }

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    const r = RELICS[this.relic];
    const sea = SEAS.find((x) => x.relic === this.relic)!;
    ctx.fillStyle = `rgba(15,10,5,${0.8 * clamp01(this.t * 3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, 330);
    ctx.rotate(this.t * 0.3);
    ctx.fillStyle = 'rgba(255,230,150,0.12)';
    for (let i = 0; i < 14; i++) {
      ctx.rotate((Math.PI * 2) / 14);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-30, -480);
      ctx.lineTo(30, -480);
      ctx.fill();
    }
    ctx.restore();
    outlinedText(ctx, `${SEAS_BY_ID[sea.id].name} story complete!`, W / 2, 150, 22, '#fff', COLORS.ink, 5);
    const k = ease.outElastic(clamp01(this.t / 0.9));
    ctx.save();
    ctx.translate(W / 2, 330);
    ctx.scale(k, k);
    ctx.rotate(Math.sin(this.t * 2) * 0.05);
    drawRelicBadge(ctx, 0, 0, 80, r.color, true);
    ctx.restore();
    outlinedText(ctx, 'RELIC FOUND', W / 2, 460, 20, COLORS.gold, COLORS.ink, 5);
    outlinedText(ctx, r.name, W / 2, 500, 34, '#fff', COLORS.ink, 7);
    text(ctx, r.desc, W / 2, 545, 15, 'rgba(255,255,255,0.9)', 'center', 700);
    const next = SEAS[SEAS.findIndex((x) => x.id === sea.id) + 1];
    if (next) text(ctx, `A new sea calls: ${next.name}`, W / 2, 590, 14, COLORS.gold, 'center', 900);
    if (this.t > 0.8) this.game.button(ctx, 'relic_ok', W / 2 - 100, 660, 200, 64, 'Amazing!', () => this.game.pop(this), { color: COLORS.good, dark: '#2f7a3b', pulse: true });
  }
}
