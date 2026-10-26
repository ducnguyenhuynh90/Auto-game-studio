// "Your Team": every job on one screen. What a worker does, how much per hour, what training adds,
// who you have, and Hire / Train buttons that explain themselves when they can't be used yet.
// Rules in core/team.ts (team size grows with fame and brand) and core/island.ts (hire, train).
import { analytics } from '../core/analytics';
import { explain } from '../core/help';
import { ROLE, hire, hireCost, isAuto, ROLE_STEP, staffUpgradeCost, trainProblem, trainStaff, type Role } from '../core/island';
import { JOBS, JOB_PITCH, hireProblem, hireSite, jobRate, nextTeamGrowth, teamCap, teamSize, trainingGain } from '../core/team';
import { sfx } from '../render/audio';
import { COLORS, H, W, font, islandImage, outlinedText, rr, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';
import { showHelp } from './info';

function fit(ctx: Ctx, s: string, maxW: number, max: number, min: number): number {
  for (let size = max; size > min; size -= 0.5) {
    ctx.font = font(size, 700);
    if (ctx.measureText(s).width <= maxW) return size;
  }
  return min;
}

export class TeamOverlay implements Scene {
  name = 'team';
  covers3d = true;
  t = 0;

  constructor(
    private game: Game,
    /** Highlight one job (opened from a production step). */
    private focus?: Role,
  ) {
    analytics.track('team_open', { size: teamSize(game.state), cap: teamCap(game.state), focus: focus ?? '' });
  }

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    const s = this.game.state;
    ctx.fillStyle = '#f6ead2';
    ctx.fillRect(0, 0, W, H);
    outlinedText(ctx, 'Your Team', W / 2 - 16, 38, 26, '#fff', COLORS.ink, 6);
    this.game.button(ctx, 'team_close', W - 58, 14, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });

    // team size: grows with fame and brand
    const size = teamSize(s);
    const cap = teamCap(s);
    ctx.fillStyle = '#fff';
    rr(ctx, 14, 66, W - 28, 92, 14);
    ctx.fill();
    text(ctx, `Team ${size}/${cap}`, 28, 86, 17, COLORS.ink, 'left', 900);
    for (let i = 0; i < Math.min(cap, 14); i++) {
      ctx.fillStyle = i < size ? COLORS.good : 'rgba(43,33,24,0.15)';
      ctx.beginPath();
      ctx.arc(140 + i * 16, 86, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    const grow = `Grows: ${nextTeamGrowth(s)}`;
    text(ctx, grow, 28, 108, fit(ctx, grow, W - 70, 11, 8.5), '#7a5aa8', 'left', 800);
    text(ctx, 'At first you do every step yourself. Each worker takes one step', 28, 128, 10.5, 'rgba(43,33,24,0.8)', 'left', 700);
    text(ctx, 'off your hands, even while the game is closed (up to 4 h).', 28, 143, 10.5, 'rgba(43,33,24,0.8)', 'left', 700);
    this.game.hitArea('team_grow', 14, 66, W - 28, 52, () => showHelp(this.game, explain(s, `Team full (${size}/${cap})`)));

    // one card per job
    const cardH = 116;
    JOBS.forEach((role, i) => {
      const y = 166 + i * (cardH + 6);
      const team = s.island.staff.filter((x) => x.role === role);
      const focus = this.focus === role;
      ctx.fillStyle = '#fff';
      rr(ctx, 14, y, W - 28, cardH, 14);
      ctx.fill();
      ctx.strokeStyle = focus ? `rgba(230,126,34,${0.6 + 0.4 * Math.sin(this.t * 5)})` : 'rgba(43,33,24,0.15)';
      ctx.lineWidth = focus ? 3 : 2;
      ctx.stroke();
      const img = islandImage('worker', role);
      if (img) ctx.drawImage(img, 20, y + 8, 48, 48);
      text(ctx, ROLE[role].title, 76, y + 16, 15, COLORS.ink, 'left', 900);
      // who you have
      const hp = hireProblem(s, role);
      const who = team.length
        ? `×${team.length} · Lv ${team.map((x) => x.level).join(', ')}${isAuto(s, ROLE_STEP[role]) ? '' : ' · resting'}`
        : hp?.startsWith('Build a ')
          ? `needs a ${hp.slice(8, -6)}`
          : 'not hired yet';
      text(ctx, who, 76, y + 34, 10.5, team.length ? COLORS.good : '#7a5aa8', 'left', 800);
      text(ctx, JOB_PITCH[role], 22, y + 66, fit(ctx, JOB_PITCH[role], W - 50, 10.5, 8.5), COLORS.ink, 'left', 700);
      const lvl = Math.max(1, ...team.map((x) => x.level));
      const rate = `${team.length ? `Lv ${lvl}` : 'Lv 1'}: ${jobRate(role, lvl)}`;
      text(ctx, rate, 22, y + 84, fit(ctx, rate, W - 50, 10.5, 8.5), '#2a7fb5', 'left', 800);
      text(ctx, trainingGain(role), 22, y + 101, fit(ctx, trainingGain(role), W - 50, 10, 8), 'rgba(43,33,24,0.6)', 'left', 700);

      // Hire
      const cost = hireCost(s, role);
      this.game.button(ctx, `team_hire_${role}`, W - 196, y + 10, 84, 34, cost === 0 ? 'Hire free' : `Hire ${cost}`, () => {
        const tile = hireSite(s, role);
        if (tile === null) return;
        const st = hire(s, tile);
        if (!st) return;
        sfx.upgrade();
        analytics.track('staff_hire', { role, cost, staff: s.island.staff.length, from: 'team' });
        this.game.toast(`${st.name} joined as ${ROLE[role].title}!`, COLORS.good, jobRate(role, 1));
        this.game.commit();
      }, { color: COLORS.good, dark: '#2f7a3b', size: 12, disabled: !!hp, whyNot: () => showHelp(this.game, explain(s, hp ?? '')), pulse: focus && !hp });

      // Train the least experienced worker of this job
      const pupil = [...team].sort((a, b) => a.level - b.level)[0];
      if (pupil) {
        const tp = trainProblem(s, pupil);
        const tc = staffUpgradeCost(pupil);
        this.game.button(ctx, `team_train_${role}`, W - 104, y + 10, 84, 34, tc === null ? 'Max Lv' : `Train ${tc}`, () => {
          if (!trainStaff(s, pupil.uid)) return;
          sfx.upgrade();
          analytics.track('staff_train', { role, level: pupil.level, from: 'team' });
          this.game.toast(`${pupil.name} is now Lv ${pupil.level}!`, '#a35bd6', jobRate(role, pupil.level));
          this.game.commit();
        }, { color: '#a35bd6', dark: '#6f3a96', size: 12, disabled: !!tp, whyNot: () => showHelp(this.game, explain(s, tp ?? '')) });
      }
    });
  }
}
