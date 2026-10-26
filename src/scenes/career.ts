// The Road to the World's Best Fish Sauce: the stage map (RoadOverlay) and the moment a stage is
// finished (StageUpOverlay: new title, reward, what it unlocks and why). Rules in core/career.ts.
import { analytics } from '../core/analytics';
import { AWARD_ENTRIES, CAREER, STARTING_TITLE, awardCandidate, career, enterAwards, goalDone, type CareerGoal, type StageUp } from '../core/career';
import { BUILDINGS_BY_ID } from '../core/island';
import { sfx } from '../render/audio';
import { COLORS, H, W, clamp01, drawCoin, ease, font, outlinedText, panel, rr, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';
import { BrandOverlay } from './brand';
import { MarketOverlay } from './market';
import { ProductionOverlay } from './production';

const GOLD = '#e0a526';
const THEME_COLOR = ['#5cb85c', '#e67e22', '#a35bd6', '#3a8fd9', '#c0392b', '#d4a017', GOLD];

function fit(ctx: Ctx, s: string, maxW: number, max: number, min: number): number {
  for (let size = max; size > min; size--) {
    ctx.font = font(size, 900);
    if (ctx.measureText(s).width <= maxW) return size;
  }
  return min;
}

/** A round stage medal: gold when earned, coloured for the current stage, grey when ahead. */
function medal(ctx: Ctx, x: number, y: number, r: number, n: number, state: 'done' | 'now' | 'later', color: string): void {
  ctx.fillStyle = state === 'done' ? GOLD : state === 'now' ? color : '#cfc5b3';
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (n === CAREER.length) {
    // the trophy: a cup with handles on a stem and base
    const c = state === 'later' ? '#a99f8d' : '#fff3c4';
    ctx.fillStyle = c;
    ctx.strokeStyle = c;
    ctx.lineWidth = r * 0.09;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.42, y - r * 0.42);
    ctx.lineTo(x + r * 0.42, y - r * 0.42);
    ctx.quadraticCurveTo(x + r * 0.4, y + r * 0.12, x, y + r * 0.16);
    ctx.quadraticCurveTo(x - r * 0.4, y + r * 0.12, x - r * 0.42, y - r * 0.42);
    ctx.fill();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + side * r * 0.42, y - r * 0.2, r * 0.17, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, side < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
      ctx.stroke();
    }
    ctx.fillRect(x - r * 0.07, y + r * 0.14, r * 0.14, r * 0.2);
    rr(ctx, x - r * 0.3, y + r * 0.32, r * 0.6, r * 0.13, 2);
    ctx.fill();
  } else outlinedText(ctx, state === 'done' ? '✓' : String(n), x, y + 1, r * 0.95, '#fff', COLORS.ink, 3);
}

/** Sends the player to where a goal is done. */
export function goToGoal(game: Game, g: CareerGoal): void {
  analytics.track('career_go', { goal: g.id, where: g.where });
  const s = game.state;
  switch (g.where) {
    case 'island':
      game.goIsland();
      break;
    case 'brand':
      game.goIsland();
      game.push(new BrandOverlay(game));
      break;
    case 'fishing':
      game.goFishing(s.sea);
      break;
    case 'brew':
      game.goVillage();
      game.push(new ProductionOverlay(game));
      break;
    case 'market':
      game.goVillage();
      game.push(new MarketOverlay(game));
      break;
    case 'puzzles':
      game.goPuzzles();
      break;
    case 'map':
      game.goMap();
      break;
    case 'awards':
      game.push(new RoadOverlay(game));
      break;
  }
}

export class RoadOverlay implements Scene {
  name = 'career';
  covers3d = true;
  t = 0;

  constructor(private game: Game) {
    analytics.track('career_open', { stage: career(game.state).stage });
  }

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    const s = this.game.state;
    const c = career(s);
    ctx.fillStyle = '#f6ead2';
    ctx.fillRect(0, 0, W, H);
    outlinedText(ctx, 'Road to the World’s Best', W / 2 - 16, 40, 22, '#fff', COLORS.ink, 6);
    text(ctx, 'Nước mắm ngon nhất thế giới', W / 2 - 16, 70, 12, 'rgba(43,33,24,0.65)', 'center', 800);
    this.game.button(ctx, 'road_close', W - 58, 14, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
    const title = c.stage === 0 ? STARTING_TITLE : CAREER[c.stage - 1].title;
    text(ctx, `You are: ${title}`, W / 2, 96, 14, COLORS.ink, 'center', 900);

    // the road, drawn from the first stage (top) to the trophy (bottom)
    let y = 118;
    const rowH = 50;
    const nowH = 258;
    // the path line behind the medals
    ctx.strokeStyle = 'rgba(43,33,24,0.18)';
    ctx.lineWidth = 6;
    ctx.setLineDash([2, 10]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(40, y + 20);
    ctx.lineTo(40, y + rowH * (CAREER.length - 1) + nowH - 20);
    ctx.stroke();
    ctx.setLineDash([]);
    CAREER.forEach((st, i) => {
      const state = i < c.stage ? 'done' : i === c.stage ? 'now' : 'later';
      const color = THEME_COLOR[i];
      if (state === 'now') {
        panel(ctx, 14, y, W - 28, nowH - 8, '#fff', 16);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        rr(ctx, 14, y, W - 28, nowH - 8, 16);
        ctx.stroke();
        medal(ctx, 40, y + 26, 18, i + 1, state, color);
        text(ctx, `STAGE ${i + 1} · ${st.theme.toUpperCase()}`, 66, y + 18, 10.5, color, 'left', 900);
        text(ctx, st.title, 66, y + 36, fit(ctx, st.title, 290, 18, 13), COLORS.ink, 'left', 900);
        text(ctx, `“${st.pitch}”`, 30, y + 60, fit(ctx, `“${st.pitch}”`, W - 64, 11.5, 9), 'rgba(43,33,24,0.75)', 'left', 700);
        st.goals.forEach((g, k) => {
          const gy = y + 80 + k * 34;
          const done = goalDone(s, g);
          const [cur, tot] = g.progress(s);
          ctx.fillStyle = done ? COLORS.good : '#fff';
          ctx.strokeStyle = done ? COLORS.good : 'rgba(43,33,24,0.35)';
          ctx.lineWidth = 2;
          rr(ctx, 28, gy - 9, 18, 18, 5);
          ctx.fill();
          ctx.stroke();
          if (done) text(ctx, '✓', 37, gy + 1, 13, '#fff', 'center', 900);
          text(ctx, g.text, 54, gy - 2, fit(ctx, g.text, 210, 13, 10), done ? 'rgba(43,33,24,0.5)' : COLORS.ink, 'left', 800);
          if (!done && tot > 1) {
            ctx.fillStyle = 'rgba(43,33,24,0.12)';
            rr(ctx, 54, gy + 8, 150, 5, 2.5);
            ctx.fill();
            ctx.fillStyle = color;
            rr(ctx, 54, gy + 8, 150 * Math.min(1, cur / tot), 5, 2.5);
            ctx.fill();
            text(ctx, `${cur}/${tot}`, 210, gy + 10, 9.5, 'rgba(43,33,24,0.6)', 'left', 800);
          }
          if (!done && g.where === 'awards') {
            // the finale: send your best Legendary bottle to the judges
            const best = awardCandidate(s);
            this.game.button(ctx, `road_go_${g.id}`, W - 92, gy - 13, 64, 26, best ? 'Enter' : 'Brew ›', () => {
              if (!best) return goToGoal(this.game, { ...g, where: 'brew' });
              const d = enterAwards(s);
              if (d === null) return;
              sfx.rare();
              analytics.track('award_entry', { degrees: d, entries: career(s).entries ?? 0 });
              this.game.toast(`Entered: a ${d.toFixed(1)}°N bottle`, GOLD, `${career(s).entries}/${AWARD_ENTRIES} for the World Fish Sauce Awards`);
              this.game.commit();
            }, { color: best ? GOLD : color, dark: COLORS.ink, size: 12, pulse: !!best });
          } else if (!done) this.game.button(ctx, `road_go_${g.id}`, W - 92, gy - 13, 64, 26, 'Go ›', () => goToGoal(this.game, g), { color, dark: COLORS.ink, size: 12 });
        });
        // reward + what it opens
        const ry = y + nowH - 30;
        drawCoin(ctx, 34, ry, 8);
        const unl = st.unlocks.map((u) => BUILDINGS_BY_ID[u.building].name).join(', ');
        const reward = `${st.reward.coins.toLocaleString()}${st.reward.freeHire ? ' + a free hire' : ''}${unl ? ` · Unlocks ${unl}` : ''}`;
        text(ctx, reward, 48, ry + 1, fit(ctx, reward, W - 90, 12, 9), COLORS.ink, 'left', 900);
        y += nowH;
      } else {
        medal(ctx, 40, y + 22, 15, i + 1, state, color);
        text(ctx, st.title, 66, y + 15, 14, state === 'later' ? 'rgba(43,33,24,0.55)' : COLORS.ink, 'left', 900);
        const sub = state === 'done' ? `${st.local} · earned` : `${st.theme}${st.unlocks.length ? ` · unlocks ${st.unlocks.map((u) => BUILDINGS_BY_ID[u.building].name).join(', ')}` : ''}`;
        text(ctx, sub, 66, y + 33, fit(ctx, sub, W - 96, 11, 9), state === 'done' ? GOLD : 'rgba(43,33,24,0.5)', 'left', 800);
        y += rowH;
      }
    });
  }
}

/** The big moment: a stage is finished. */
export class StageUpOverlay implements Scene {
  name = 'career_up';
  t = 0;

  constructor(
    private game: Game,
    private stageUp: StageUp,
  ) {
    sfx.rare();
    const final = stageUp.index === CAREER.length - 1;
    game.particles.burst(W / 2, 300, final ? 160 : 90, [GOLD, '#fff', THEME_COLOR[stageUp.index], COLORS.accent], { speed: 440, kind: 'confetti', size: 9, g: 380, life: 2 });
  }

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    const { stage, index } = this.stageUp;
    const final = index === CAREER.length - 1;
    const color = THEME_COLOR[index];
    ctx.fillStyle = `rgba(15,10,5,${0.82 * clamp01(this.t * 3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, 290);
    ctx.rotate(this.t * 0.25);
    ctx.fillStyle = 'rgba(255,220,130,0.13)';
    for (let i = 0; i < 16; i++) {
      ctx.rotate((Math.PI * 2) / 16);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-28, -520);
      ctx.lineTo(28, -520);
      ctx.fill();
    }
    ctx.restore();
    outlinedText(ctx, final ? 'THE WORLD AGREES' : `STAGE ${index + 1} COMPLETE`, W / 2, 120, 20, GOLD, COLORS.ink, 5);
    const k = ease.outElastic(clamp01(this.t / 0.9));
    ctx.save();
    ctx.translate(W / 2, 260);
    ctx.scale(k, k);
    medal(ctx, 0, 0, 62, index + 1, 'done', color);
    ctx.restore();
    text(ctx, 'NEW TITLE', W / 2, 360, 13, 'rgba(255,255,255,0.75)', 'center', 900);
    outlinedText(ctx, stage.title, W / 2, 395, fit(ctx, stage.title, W - 40, 30, 18), '#fff', COLORS.ink, 6);
    text(ctx, stage.local, W / 2, 428, 14, GOLD, 'center', 800);
    // reward
    let y = 470;
    drawCoin(ctx, W / 2 - 60, y, 12);
    text(ctx, `+${stage.reward.coins.toLocaleString()}`, W / 2 - 42, y + 1, 20, '#fff', 'left', 900);
    if (stage.reward.freeHire) text(ctx, '+ a free hire', W / 2 + 40, y + 1, 14, '#fff', 'left', 800);
    y += 40;
    // what this fame unlocks, and why
    for (const u of stage.unlocks) {
      const b = BUILDINGS_BY_ID[u.building];
      text(ctx, `🔓 ${b.name}`, W / 2, y, 16, '#fff', 'center', 900);
      text(ctx, u.why, W / 2, y + 20, fit(ctx, u.why, W - 50, 12, 9), 'rgba(255,255,255,0.8)', 'center', 700);
      y += 50;
    }
    const next = CAREER[index + 1];
    if (next) text(ctx, `Next: ${next.title} · ${next.theme}`, W / 2, Math.max(y + 6, 640), 13, GOLD, 'center', 900);
    else text(ctx, 'Mắm Bà Năm: the best fish sauce in the world.', W / 2, Math.max(y + 6, 640), 14, GOLD, 'center', 900);
    if (this.t > 0.8) {
      if (stage.unlocks.length)
        this.game.button(ctx, 'stage_build', W / 2 - 150, 690, 140, 60, 'Build it ›', () => {
          this.game.pop(this);
          this.game.goIsland();
        }, { color: color, dark: COLORS.ink, size: 18 });
      this.game.button(ctx, 'stage_ok', stage.unlocks.length ? W / 2 + 10 : W / 2 - 100, 690, stage.unlocks.length ? 140 : 200, 60, final ? 'Wonderful!' : 'Let’s go!', () => this.game.pop(this), { color: COLORS.good, dark: '#2f7a3b', size: 18, pulse: true });
    }
  }
}
