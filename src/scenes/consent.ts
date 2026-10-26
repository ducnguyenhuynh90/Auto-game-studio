// Asks once whether play statistics may go to Google Analytics (builds with GA only; analytics/ga.ts).
// Shown in the village after the first catch, so the very first screen is the game, not a form.
import { COLORS, H, W, clamp01, ease, outlinedText, panel, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

export class ConsentOverlay implements Scene {
  name = 'consent';
  t = 0;

  constructor(private game: Game) {}

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    ctx.fillStyle = `rgba(20,15,10,${0.5 * clamp01(this.t * 4)})`;
    ctx.fillRect(0, 0, W, H);
    const k = ease.outBack(clamp01(this.t / 0.3));
    const y = H - 360 + (1 - k) * 360;
    panel(ctx, 14, y, W - 28, 340, COLORS.paper, 22);
    outlinedText(ctx, 'Help us improve?', W / 2, y + 36, 22, '#fff', COLORS.ink, 5);
    const lines = [
      'We’d like to send anonymous play statistics to',
      'Google Analytics: which screens you use, how far you',
      'get, where it gets hard. It helps us make the game better.',
      '',
      'No ads. No name or email. No cookies. You can change',
      'this any time in Settings.',
    ];
    lines.forEach((l, i) => text(ctx, l, W / 2, y + 76 + i * 20, 12.5, COLORS.ink, 'center', 700));
    this.game.button(ctx, 'consent_yes', 30, y + 216, W - 60, 52, 'Yes, happy to help', () => this.answer(true), { color: COLORS.good, dark: '#2f7a3b', size: 18 });
    this.game.button(ctx, 'consent_no', 30, y + 278, W - 60, 44, 'No thanks', () => this.answer(false), { color: '#bdb3a3', dark: '#8f8678', textColor: COLORS.ink, size: 15 });
  }

  private answer(yes: boolean): void {
    this.game.ga?.setConsent(yes);
    this.game.pop(this);
  }
}
