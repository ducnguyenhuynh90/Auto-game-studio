// Crafting (fill + seal a jar) and the signature moment: opening a jar to reveal the sauce.
import { analytics } from '../core/analytics';
import { BALANCE, RARITY_COLOR, RECIPES_BY_ID, SPECIES_BY_ID, TIERS, tierFor } from '../core/data';
import { agingLevel, bestJarFill, canFerment, jarDegrees, openJar, productPrice, recipeFor, sealJar, sellProduct, type Product } from '../core/state';
import { sfx, vibrate } from '../render/audio';
import { COLORS, H, W, clamp01, drawBottle, drawFish, drawJar, ease, outlinedText, panel, rr, star, text, type Ctx } from '../render/draw';
import type { Game, Scene } from '../game';

export class JarFillOverlay implements Scene {
  name = 'jar_fill';
  t = 0;
  chosen: number[] = [];
  page = 0;

  constructor(
    private game: Game,
    private jarIndex: number,
  ) {}

  update(dt: number): void {
    this.t += dt;
  }

  private toggle(uid: number): void {
    const i = this.chosen.indexOf(uid);
    if (i >= 0) this.chosen.splice(i, 1);
    else if (this.chosen.length < BALANCE.jarSlots) {
      this.chosen.push(uid);
      sfx.plop();
    }
  }

  private seal(): void {
    const s = this.game.state;
    const recipe = recipeFor(this.chosen.map((uid) => s.bucket.find((f) => f.uid === uid)!));
    if (!sealJar(s, this.jarIndex, this.chosen, this.game.rng, Date.now())) return;
    sfx.seal();
    vibrate(50);
    analytics.track('jar_seal', { recipe, jar: this.jarIndex });
    analytics.funnelStep('first_seal', { recipe });
    this.game.commit();
    this.game.pop(this);
    this.game.toast('Jar sealed!', '#8a6a4a', 'It ferments while you fish');
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
    panel(ctx, 14, 60, W - 28, 730, COLORS.paper, 24);
    outlinedText(ctx, 'Fill your jar', W / 2, 96, 28, '#fff', COLORS.ink, 6);
    text(ctx, 'Pick 3 fish. Fresher fish make better sauce.', W / 2, 126, 14, 'rgba(43,33,24,0.7)');

    // jar with slots
    const chosenFish = this.chosen.map((uid) => s.bucket.find((f) => f.uid === uid)!);
    drawJar(ctx, W / 2, 290, 120, { empty: true, fill: chosenFish.length });
    for (let i = 0; i < BALANCE.jarSlots; i++) {
      const sx = W / 2 - 110 + i * 110;
      const sy = 330;
      ctx.fillStyle = 'rgba(43,33,24,0.08)';
      rr(ctx, sx - 44, sy - 26, 88, 52, 12);
      ctx.fill();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(43,33,24,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      const f = chosenFish[i];
      if (f) {
        drawFish(ctx, f.species, sx, sy, 64, { wiggle: this.t * 6 + i });
        this.game.hitArea(`slot${i}`, sx - 44, sy - 26, 88, 52, () => this.toggle(f.uid));
      }
    }
    const recipe = chosenFish.length ? RECIPES_BY_ID[recipeFor(chosenFish)] : null;
    if (recipe) {
      outlinedText(ctx, recipe.name, W / 2, 380, 22, '#fff', COLORS.ink, 5);
      text(ctx, recipe.blurb, W / 2, 404, 13, 'rgba(43,33,24,0.7)');
    } else {
      text(ctx, 'Tip: 3 Anchovies = Classic recipe', W / 2, 390, 14, 'rgba(43,33,24,0.6)');
    }

    // bucket grid
    const fish = [...s.bucket].sort((a, b) => Number(canFerment(b)) - Number(canFerment(a)) || SPECIES_BY_ID[b.species].sauce - SPECIES_BY_ID[a.species].sauce || b.freshness - a.freshness);
    const perPage = 12;
    const pages = Math.max(1, Math.ceil(fish.length / perPage));
    this.page = Math.min(this.page, pages - 1);
    fish.slice(this.page * perPage, this.page * perPage + perPage).forEach((f, i) => {
      const cx = 30 + (i % 4) * 84;
      const cy = 428 + Math.floor(i / 4) * 78;
      const sp = SPECIES_BY_ID[f.species];
      const usable = canFerment(f);
      const sel = this.chosen.includes(f.uid);
      ctx.save();
      ctx.globalAlpha = usable ? 1 : 0.45;
      ctx.fillStyle = sel ? '#ffe6a8' : '#fff';
      rr(ctx, cx, cy, 78, 70, 12);
      ctx.fill();
      ctx.lineWidth = sel ? 4 : 2;
      ctx.strokeStyle = sel ? COLORS.accent : RARITY_COLOR[sp.rarity];
      ctx.stroke();
      drawFish(ctx, f.species, cx + 39, cy + 26, 52);
      const stars = f.freshness >= 0.8 ? 3 : f.freshness >= 0.5 ? 2 : 1;
      for (let st = 0; st < 3; st++) {
        ctx.fillStyle = st < stars ? COLORS.gold : 'rgba(43,33,24,0.15)';
        star(ctx, cx + 25 + st * 14, cy + 56, 6);
      }
      if (!usable) text(ctx, 'sell only', cx + 39, cy + 10, 10, COLORS.bad);
      ctx.restore();
      if (usable) this.game.hitArea(`f${f.uid}`, cx, cy, 78, 70, () => this.toggle(f.uid));
    });
    if (pages > 1) {
      this.game.button(ctx, 'page', W / 2 - 50, 664, 100, 30, `Page ${this.page + 1}/${pages}`, () => (this.page = (this.page + 1) % pages), { color: '#8a7a66', dark: '#5f5244', size: 13 });
    }
    ctx.restore();

    this.game.button(ctx, 'auto', 30, 706, 130, 62, 'Best 3', () => {
      this.chosen = bestJarFill(s);
      sfx.plop();
    }, { color: '#3a8fd9', dark: '#22609e', size: 20 });
    const ready = this.chosen.length === BALANCE.jarSlots;
    this.game.button(ctx, 'seal', 170, 706, 190, 62, 'Seal jar', () => this.seal(), { color: COLORS.good, dark: '#2f7a3b', disabled: !ready, pulse: ready, size: 24 });
    this.game.button(ctx, 'close', W - 64, 64, 44, 40, 'x', () => this.game.pop(this), { color: '#8a7a66', dark: '#5f5244', size: 18 });
  }
}

type RevealPhase = 'knock' | 'pop' | 'count' | 'done';

export class RevealOverlay implements Scene {
  name = 'reveal';
  t = 0;
  phase: RevealPhase = 'knock';
  knocks = 0;
  knockT = 0;
  phaseT = 0;
  shown = 0;
  lastTier = 0;
  lastTick = 0;
  product: Product | null = null;
  newRecipe = false;
  newBest = false;
  sold = false;
  private readonly degrees: number;
  private readonly recipe: string;
  private readonly agingLvl: number;

  constructor(
    private game: Game,
    private jarIndex: number,
  ) {
    const s = game.state;
    const j = s.jars[jarIndex];
    // Quality is fully determined before the reveal: the animation only shows it.
    this.degrees = jarDegrees(s, j, Date.now());
    this.recipe = j.recipe;
    this.agingLvl = agingLevel(s, j, Date.now());
  }

  update(dt: number): void {
    this.t += dt;
    this.phaseT += dt;
    this.knockT = Math.max(0, this.knockT - dt * 3);
    if (this.phase === 'pop' && this.phaseT > 0.7) {
      this.phase = 'count';
      this.phaseT = 0;
    }
    if (this.phase === 'count') {
      // Ease-out count so the last few degrees crawl: that is where the anticipation lives.
      const dur = 2.2;
      const k = clamp01(this.phaseT / dur);
      const v = this.degrees * ease.outCubic(k);
      if (Math.floor(v) !== Math.floor(this.shown)) {
        sfx.tick(Math.floor(v));
        if (Math.floor(v) % 2 === 0) vibrate(5);
      }
      this.shown = v;
      const ti = TIERS.indexOf(tierFor(v));
      if (ti > this.lastTier) {
        this.lastTier = ti;
        sfx.tierUp(ti);
        vibrate(30);
        this.game.particles.burst(W / 2, 470, 16 + ti * 8, [TIERS[ti].color, '#fff'], { speed: 260, kind: 'star', size: 6, g: 200, life: 0.9 });
      }
      if (k >= 1) this.finish();
    }
  }

  private finish(): void {
    this.phase = 'done';
    this.phaseT = 0;
    this.shown = this.degrees;
    const s = this.game.state;
    const res = openJar(s, this.jarIndex, Date.now());
    if (!res) return;
    this.product = res.product;
    this.newRecipe = res.newRecipe;
    this.newBest = res.newBest;
    const tier = tierFor(this.degrees);
    const ti = TIERS.indexOf(tier);
    if (ti >= 2) {
      sfx.rare();
      this.game.particles.burst(W / 2, 330, 40 + ti * 25, [tier.color, COLORS.gold, '#fff', COLORS.accent], { speed: 420, kind: 'confetti', size: 9, g: 380, life: 1.8 });
      this.game.shake = 0.3 + ti * 0.1;
    } else {
      sfx.catch();
    }
    vibrate(ti >= 3 ? [60, 40, 60, 40, 200] : 80);
    analytics.track('jar_open', { recipe: this.recipe, degrees: this.degrees, tier: tier.id, aging: this.agingLvl, newRecipe: res.newRecipe });
    analytics.funnelStep('first_reveal', { tier: tier.id });
    this.game.commit();
  }

  down(): void {
    if (this.phase !== 'knock') return;
    this.knocks++;
    this.knockT = 1;
    sfx.knock(this.knocks);
    vibrate(20 + this.knocks * 15);
    this.game.particles.burst(W / 2, 300, 6 + this.knocks * 6, ['#ffe9a8', '#fff'], { speed: 140 + this.knocks * 60, size: 4, g: 100, life: 0.6 });
    if (this.knocks >= 3) {
      this.phase = 'pop';
      this.phaseT = 0;
      sfx.pop();
      this.game.shake = 0.5;
      this.game.particles.burst(W / 2, 260, 50, ['#ffe9a8', '#fff', COLORS.gold], { speed: 380, kind: 'star', size: 6, g: 250, life: 1.2 });
    }
  }

  private sell(): void {
    if (!this.product) return;
    const s = this.game.state;
    const price = sellProduct(s, this.product.uid);
    this.sold = true;
    sfx.coin();
    this.game.coinPulse = 1;
    this.game.float(W / 2, 600, `+${price}`, COLORS.gold, 40);
    analytics.track('sell_product', { recipe: this.product.recipe, degrees: this.product.degrees, price, where: 'reveal' });
    analytics.funnelStep('first_sale', { price });
    this.game.commit();
    this.game.pop(this);
  }

  draw(ctx: Ctx): void {
    const s = this.game.state;
    ctx.fillStyle = 'rgba(15,10,5,0.82)';
    ctx.fillRect(0, 0, W, H);
    const tier = tierFor(this.shown);
    const ti = TIERS.indexOf(tier);
    // light rays intensify through the sequence
    const rayK = this.phase === 'knock' ? this.knocks * 0.06 : this.phase === 'pop' ? 0.25 : 0.2 + ti * 0.05;
    ctx.save();
    ctx.translate(W / 2, 300);
    ctx.rotate(this.t * 0.3);
    ctx.fillStyle = this.phase === 'knock' ? `rgba(255,220,150,${rayK})` : hexA(tier.color, rayK);
    for (let i = 0; i < 14; i++) {
      ctx.rotate((Math.PI * 2) / 14);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-34, -480);
      ctx.lineTo(34, -480);
      ctx.fill();
    }
    ctx.restore();

    const recipe = RECIPES_BY_ID[this.recipe];
    if (this.phase === 'knock') {
      const wob = Math.sin(this.t * 40) * 0.08 * this.knockT;
      const sq = 1 + this.knockT * 0.06;
      ctx.save();
      ctx.translate(W / 2, 420);
      ctx.scale(sq, 2 - sq);
      drawJar(ctx, 0, 0, 170, { wobble: wob, glow: 0.3 + this.knocks * 0.25, lidOffset: this.knocks * 4 + this.knockT * 8 });
      ctx.restore();
      // cracks of light leaking from the lid
      ctx.strokeStyle = `rgba(255,235,170,${0.4 + this.knocks * 0.2})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < this.knocks * 3; i++) {
        const a = -Math.PI / 2 + (i - this.knocks * 1.5) * 0.25;
        ctx.beginPath();
        ctx.moveTo(W / 2 + Math.cos(a) * 60, 250 + Math.sin(a) * 20);
        ctx.lineTo(W / 2 + Math.cos(a) * 120, 250 + Math.sin(a) * 60);
        ctx.stroke();
      }
      outlinedText(ctx, recipe.name, W / 2, 140, 26, '#fff', COLORS.ink, 6);
      text(ctx, `Aged ${'★'.repeat(this.agingLvl)}${'☆'.repeat(BALANCE.maxAging - this.agingLvl)}`, W / 2, 172, 16, COLORS.gold);
      const p = 1 + Math.sin(this.t * 6) * 0.06;
      outlinedText(ctx, ['TAP to open!', 'Again!', 'One more!'][this.knocks] ?? '', W / 2, 560, 34 * p, '#fff', COLORS.ink, 7);
      return;
    }

    // jar after pop: lid flies away, bottle rises
    const popK = this.phase === 'pop' ? clamp01(this.phaseT / 0.7) : 1;
    drawJar(ctx, W / 2, 560, 150, { lidOffset: 20 + popK * 600, lidAngle: popK * 4, glow: 0.8 });
    const rise = ease.outBack(popK);
    const by = 560 - 80 - rise * 160;
    drawBottle(ctx, W / 2, by, 190, this.recipe, tier.color);
    outlinedText(ctx, recipe.name, W / 2, 120, 26, '#fff', COLORS.ink, 6);

    if (this.phase === 'count' || this.phase === 'done') {
      // the degree counter
      const done = this.phase === 'done';
      const stamp = done ? ease.outElastic(clamp01(this.phaseT / 0.7)) : 1;
      outlinedText(ctx, `${this.shown.toFixed(1)}°N`, W / 2, 180, 52 * (done ? 1 + (stamp - 1) * 0.3 : 1), '#fff', COLORS.ink, 8);
      ctx.save();
      ctx.translate(W / 2, 236);
      ctx.scale(stamp, stamp);
      ctx.rotate(done ? -0.06 : 0);
      ctx.fillStyle = tier.color;
      rr(ctx, -95, -22, 190, 44, 14);
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      outlinedText(ctx, tier.name.toUpperCase(), 0, 1, 26, '#fff', COLORS.ink, 5);
      ctx.restore();
      // tier ladder so players see how close the next tier was (honest, from real value)
      const lx = 40;
      const lw = W - 80;
      const maxD = 50;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      rr(ctx, lx, 280, lw, 10, 5);
      ctx.fill();
      TIERS.forEach((t) => {
        ctx.fillStyle = t.color;
        ctx.fillRect(lx + (lw * t.min) / maxD - 1, 276, 3, 18);
      });
      ctx.fillStyle = tier.color;
      rr(ctx, lx, 280, (lw * Math.min(maxD, this.shown)) / maxD, 10, 5);
      ctx.fill();
    }

    if (this.phase === 'done' && this.product) {
      if (this.newRecipe) this.badge(ctx, W / 2 + 120, 120, 'NEW\nRECIPE', COLORS.bad);
      else if (this.newBest) this.badge(ctx, W / 2 + 120, 120, 'NEW\nBEST', '#3a8fd9');
      const next = TIERS[ti + 1];
      if (next) text(ctx, `${(next.min - this.degrees).toFixed(1)}°N from ${next.name}`, W / 2, 312, 14, 'rgba(255,255,255,0.75)');
      if (this.phaseT > 0.6) {
        const tip = this.agingLvl < BALANCE.maxAging ? 'Tip: let jars age longer (more trips) for higher °N' : 'Tip: perfect catches make fresher, stronger sauce';
        text(ctx, tip, W / 2, 668, 13, 'rgba(255,255,255,0.7)');
        const price = productPrice(s, this.product);
        this.game.button(ctx, 'sell', 30, 700, 200, 76, `Sell ${price}`, () => this.sell(), { color: COLORS.good, dark: '#2f7a3b', coin: true, size: 26, pulse: true });
        this.game.button(ctx, 'keep', 240, 700, 120, 76, 'Keep', () => {
          analytics.track('keep_product', { recipe: this.recipe, degrees: this.degrees });
          this.game.pop(this);
        }, { color: '#8a7a66', dark: '#5f5244', size: 22, sub: 'sell later' });
      }
    }
  }

  private badge(ctx: Ctx, x: number, y: number, label: string, color: string): void {
    const k = ease.outElastic(clamp01(this.phaseT / 0.8));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.25);
    ctx.scale(k, k);
    ctx.fillStyle = color;
    star(ctx, 0, 0, 42);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 3;
    ctx.stroke();
    label.split('\n').forEach((l, i) => outlinedText(ctx, l, 0, -8 + i * 17, 14, '#fff', COLORS.ink, 3));
    ctx.restore();
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
