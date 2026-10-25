// Mực's card: feed him, build his house, pet him (core/dog.ts). He then rides the boat.
import { analytics } from '../core/analytics';
import { SPECIES_BY_ID } from '../core/data';
import { DOG_HOUSE_COST, buildDogHouse, dogHouseProblem, feedDog } from '../core/dog';
import { sfx, vibrate } from '../render/audio';
import { COLORS, H, W, clamp01, ease, outlinedText, panel, portrait, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

export class DogOverlay implements Scene {
  name = 'dog';
  t = 0;
  private line = '';

  constructor(private game: Game) {
    const d = game.state.dog;
    this.line = d.house ? 'He waits by the boat every morning.' : d.fed >= 3 ? 'He trusts you now. He needs a home.' : 'He is hungry and a little shy.';
  }

  update(dt: number): void {
    this.t += dt;
  }

  draw(ctx: Ctx): void {
    const s = this.game.state;
    const d = s.dog;
    ctx.fillStyle = 'rgba(20,15,10,0.5)';
    ctx.fillRect(0, 0, W, H);
    const k = ease.outBack(clamp01(this.t / 0.3));
    ctx.save();
    ctx.translate(W / 2, 470);
    ctx.scale(k, k);
    panel(ctx, -170, -230, 340, 480, COLORS.paper, 24);
    const img = portrait('muc');
    if (img) ctx.drawImage(img, -90, -240, 180, 180);
    outlinedText(ctx, 'Mực', 0, -40, 30, '#fff', COLORS.ink, 6);
    text(ctx, 'Phú Quốc Ridgeback · chó Phú Quốc', 0, -12, 12, 'rgba(43,33,24,0.65)', 'center', 800);
    // trust hearts
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < Math.min(3, d.fed) ? '#e8553a' : 'rgba(43,33,24,0.15)';
      const x = -36 + i * 36;
      ctx.beginPath();
      ctx.moveTo(x, 22);
      ctx.bezierCurveTo(x - 16, 8, x - 12, -6, x, 4);
      ctx.bezierCurveTo(x + 12, -6, x + 16, 8, x, 22);
      ctx.fill();
    }
    text(ctx, this.line, 0, 44, 13, COLORS.ink, 'center', 700);
    ctx.restore();
    this.game.button(ctx, 'dog_close', W - 66, 250, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
    const y0 = 528;
    if (!d.house) {
      this.game.button(ctx, 'dog_feed', 40, y0, W - 80, 52, s.bucket.length ? 'Give him a fish' : 'No fish in your bucket', () => this.feed(), { color: '#e67e22', dark: '#a85a14', size: 18, disabled: !s.bucket.length, pulse: d.fed < 3 && s.bucket.length > 0 });
      const problem = dogHouseProblem(s);
      this.game.button(ctx, 'dog_house', 40, y0 + 60, W - 80, 52, `Build a dog house  ${DOG_HOUSE_COST}`, () => this.house(), { color: COLORS.good, dark: '#2f7a3b', size: 17, disabled: !!problem, coin: false, pulse: !problem });
      if (problem && d.fed < 3) text(ctx, problem, W / 2, y0 + 126, 12, '#7a5aa8', 'center', 900);
    } else {
      text(ctx, 'Mực rides your boat. He barks at rare fish!', W / 2, y0 + 10, 14, COLORS.good, 'center', 900);
      text(ctx, `Fish caught together: ${d.catches}`, W / 2, y0 + 34, 13, COLORS.ink, 'center', 800);
    }
    this.game.button(ctx, 'dog_pet', W / 2 - 70, y0 + 144, 140, 44, 'Pet him', () => {
      this.line = ['Gâu! (tail going like a propeller)', 'He leans on your leg. Heavy!', 'Mực licks your hand. It smells of fish.'][Math.floor(this.t * 7) % 3];
      this.game.world?.village.dogHop();
      sfx.tap();
      vibrate(10);
    }, { color: '#8a7a66', dark: '#5f5244', size: 15 });
  }

  private feed(): void {
    const s = this.game.state;
    const sp = feedDog(s);
    if (!sp) return;
    analytics.track('dog_feed', { species: sp, fed: s.dog.fed });
    this.line = `He gobbles the ${SPECIES_BY_ID[sp].name.toLowerCase()} in one bite!`;
    this.game.world?.village.dogHop();
    sfx.catch();
    vibrate(20);
    this.game.commit();
  }

  private house(): void {
    const s = this.game.state;
    if (!buildDogHouse(s)) return;
    analytics.track('dog_house', {});
    this.line = 'Mực runs in circles, then sleeps in his new house.';
    sfx.upgrade();
    this.game.particles.burst(W / 2, 400, 40, [COLORS.gold, '#fff'], { speed: 250, kind: 'confetti', size: 6, g: 300, life: 1.1 });
    this.game.commit();
  }
}
