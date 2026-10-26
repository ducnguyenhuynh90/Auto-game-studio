// The ⓘ explanation card: what a requirement means, the player's numbers, and buttons to the fix.
// Text in core/help.ts; any scene shows it with infoIcon() or showHelp().
import { analytics } from '../core/analytics';
import type { Help, HelpAction } from '../core/help';
import { COLORS, H, W, clamp01, ease, font, outlinedText, panel, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

/** Word-wraps a line to a width, at a font size. */
function wrap(ctx: Ctx, s: string, maxW: number, size: number): string[] {
  ctx.font = font(size, 700);
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      out.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

/** Navigation for the card's buttons, wired by main.ts (keeps this module free of scene imports). */
export const helpRoutes: Partial<Record<HelpAction, (g: Game) => void>> = {};

export class InfoOverlay implements Scene {
  name = 'info';
  t = 0;

  constructor(
    private game: Game,
    private help: Help,
  ) {
    // no "go to the island" button when you are already there
    if (game.scene?.name === 'island') this.help = { ...help, actions: help.actions.filter((a) => a.action !== 'island') };
    analytics.track('help_open', { title: help.title.slice(0, 40) });
  }

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    const h = this.help;
    ctx.fillStyle = `rgba(20,15,10,${0.55 * clamp01(this.t * 4)})`;
    ctx.fillRect(0, 0, W, H);
    const size = 13;
    const lines = h.lines.flatMap((l) => wrap(ctx, l, W - 96, size));
    const boxH = 96 + lines.length * 19 + (h.actions.length ? 56 : 0) + 50;
    const y0 = Math.max(60, (H - boxH) / 2);
    const k = ease.outBack(clamp01(this.t / 0.25));
    ctx.save();
    ctx.translate(W / 2, y0 + boxH / 2);
    ctx.scale(k, k);
    ctx.translate(-W / 2, -(y0 + boxH / 2));
    panel(ctx, 24, y0, W - 48, boxH, COLORS.paper, 20);
    ctx.fillStyle = '#3a8fd9';
    ctx.beginPath();
    ctx.arc(56, y0 + 34, 15, 0, Math.PI * 2);
    ctx.fill();
    outlinedText(ctx, 'i', 56, y0 + 35, 18, '#fff', COLORS.ink, 3);
    text(ctx, h.title, 80, y0 + 34, 16, COLORS.ink, 'left', 900);
    lines.forEach((l, i) => text(ctx, l, 48, y0 + 72 + i * 19, size, l.startsWith('✓') ? COLORS.good : COLORS.ink, 'left', 700));
    ctx.restore();
    let by = y0 + 72 + lines.length * 19 + 14;
    if (h.actions.length) {
      const bw = (W - 96 - (h.actions.length - 1) * 10) / h.actions.length;
      h.actions.forEach((a, i) => {
        this.game.button(ctx, `help_${a.action}`, 48 + i * (bw + 10), by, bw, 42, a.label, () => {
          analytics.track('help_go', { action: a.action });
          this.game.pop(this);
          helpRoutes[a.action]?.(this.game);
        }, { color: i === 0 ? COLORS.good : '#3a8fd9', dark: i === 0 ? '#2f7a3b' : '#22609e', size: 14 });
      });
      by += 56;
    }
    this.game.button(ctx, 'help_ok', W / 2 - 70, by, 140, 38, 'Got it', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 15 });
  }
}

export function showHelp(game: Game, help: Help): void {
  game.push(new InfoOverlay(game, help));
}

/** A small round ⓘ button that opens the explanation. */
export function infoIcon(ctx: Ctx, game: Game, id: string, x: number, y: number, help: () => Help, r = 10): void {
  ctx.fillStyle = '#3a8fd9';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  text(ctx, 'i', x, y + 1, r * 1.3, '#fff', 'center', 900);
  game.hitArea(`info_${id}`, x - r - 8, y - r - 8, r * 2 + 16, r * 2 + 16, () => showHelp(game, help()));
}
