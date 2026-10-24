// Story cutscenes: chapter card → lines with the speaker's 3D portrait, typewriter text, tap to advance.
// Always skippable; reading vs skipping is measured (EXP-004).
import { analytics } from '../core/analytics';
import { CAST, markSeen, type StoryScene } from '../core/story';
import { sfx } from '../render/audio';
import { COLORS, H, W, clamp01, ease, font, outlinedText, panel, portrait, rr, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

const CHARS_PER_SEC = 45;

export class StoryOverlay implements Scene {
  name = 'story';
  /** Hides the screen's own UI underneath; the 3D world stays visible behind the dim. */
  opaque = true;
  t = 0;
  private sceneIdx = 0;
  private line = 0;
  private lineT = 0;
  private cardT = 0;
  /** The other speaker stays faintly on screen, like a conversation. */
  private lastOther: string | null = null;

  constructor(
    private game: Game,
    private scenes: StoryScene[],
    /** Replays from the Captain's Log don't count as first views. */
    private replay = false,
  ) {
    this.cardT = this.scene.chapter ? 0 : 99;
  }

  private get scene(): StoryScene {
    return this.scenes[this.sceneIdx];
  }

  private get showingCard(): boolean {
    return !!this.scene.chapter && this.cardT < 1.8;
  }

  private get typedChars(): number {
    return Math.floor(this.lineT * CHARS_PER_SEC);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.showingCard) this.cardT += dt;
    else this.lineT += dt;
  }

  down(): void {
    if (this.showingCard) {
      this.cardT = 99;
      return;
    }
    const text = this.scene.lines[this.line].text;
    if (this.typedChars < text.length) {
      this.lineT = 99; // finish the line first
      return;
    }
    sfx.tap();
    const prev = this.scene.lines[this.line].who;
    if (this.line < this.scene.lines.length - 1) {
      this.line++;
      if (this.scene.lines[this.line].who !== prev) this.lastOther = prev;
      this.lineT = 0;
    } else this.finishScene(false);
  }

  private finishScene(skipped: boolean): void {
    const sc = this.scene;
    if (!this.replay) {
      markSeen(this.game.state, sc.id);
      analytics.track('story_view', { id: sc.id, skipped, read: skipped ? this.line : sc.lines.length, total: sc.lines.length });
      this.game.commit();
    }
    if (this.sceneIdx < this.scenes.length - 1) {
      this.sceneIdx++;
      this.line = 0;
      this.lineT = 0;
      this.lastOther = null;
      this.cardT = this.scene.chapter ? 0 : 99;
    } else this.game.pop(this);
  }

  draw(ctx: Ctx): void {
    ctx.fillStyle = 'rgba(15,10,5,0.62)';
    ctx.fillRect(0, 0, W, H);
    // letterbox bars: it's a scene, not a menu
    ctx.fillStyle = '#120c08';
    ctx.fillRect(0, 0, W, 36);
    ctx.fillRect(0, H - 22, W, 22);
    this.game.button(ctx, 'story_skip', W - 92, 44, 80, 34, 'Skip ›', () => this.finishScene(true), { color: '#5f5244', dark: '#3a3028', size: 14 });

    if (this.showingCard) return this.drawCard(ctx);
    const ln = this.scene.lines[this.line];
    const ch = CAST[ln.who];
    const leftSide = ln.who === 'lan';
    // the other speaker, faded
    if (this.lastOther && this.lastOther !== ln.who) this.drawPortrait(ctx, this.lastOther, !leftSide, 0.35, 0);
    const pop = ease.outBack(clamp01(this.lineT / 0.3));
    this.drawPortrait(ctx, ln.who, leftSide, 1, pop);
    // dialogue panel
    const top = 586;
    panel(ctx, 14, top, W - 28, 196, COLORS.paper, 20);
    ctx.font = font(15, 900);
    const tagW = ctx.measureText(ch.name).width + 28;
    const tagX = leftSide ? 28 : W - 28 - tagW;
    ctx.fillStyle = ch.color;
    rr(ctx, tagX, top - 16, tagW, 32, 12);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 3;
    ctx.stroke();
    outlinedText(ctx, ch.name, tagX + tagW / 2, top, 15, '#fff', COLORS.ink, 4);
    text(ctx, ch.title, leftSide ? 38 : W - 38, top + 26, 11, 'rgba(43,33,24,0.5)', leftSide ? 'left' : 'right', 800);
    // typewriter text
    const shown = ln.text.slice(0, this.typedChars);
    ctx.font = font(18, 700);
    wrap(ctx, shown, W - 76).forEach((l, i) => text(ctx, l, 38, top + 54 + i * 26, 18, COLORS.ink, 'left', 700));
    // progress dots + continue hint
    this.scene.lines.forEach((_, i) => {
      ctx.fillStyle = i <= this.line ? ch.color : 'rgba(43,33,24,0.18)';
      ctx.beginPath();
      ctx.arc(W / 2 - (this.scene.lines.length - 1) * 7 + i * 14, top + 176, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    if (this.typedChars >= ln.text.length) {
      const b = Math.sin(this.t * 6) * 3;
      text(ctx, 'tap ▸', W - 40, top + 172 + b, 13, 'rgba(43,33,24,0.6)', 'right', 900);
    }
  }

  private drawPortrait(ctx: Ctx, who: string, left: boolean, alpha: number, pop: number): void {
    const img = portrait(who);
    const size = 280;
    const x = left ? -10 : W - size + 10;
    const y = 586 - size + 24 + (1 - pop) * 30;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (img) {
      if (!left) {
        // speakers on the right face left, toward the conversation
        ctx.translate(x + size, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, size, size);
      } else ctx.drawImage(img, x, y, size, size);
    } else {
      ctx.fillStyle = CAST[who as keyof typeof CAST].color;
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, 80, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawCard(ctx: Ctx): void {
    const c = this.scene.chapter!;
    const k = clamp01(this.cardT / 0.4);
    const out = clamp01((this.cardT - 1.4) / 0.4);
    ctx.save();
    ctx.globalAlpha = k * (1 - out);
    text(ctx, c.number.toUpperCase(), W / 2, 360, 15, COLORS.gold, 'center', 900);
    outlinedText(ctx, c.title, W / 2, 404, 40 * (0.9 + 0.1 * ease.outBack(k)), '#fff', COLORS.ink, 7);
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(W / 2 - 60 * k, 436, 120 * k, 3);
    ctx.restore();
  }
}

function wrap(ctx: Ctx, s: string, maxW: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}
