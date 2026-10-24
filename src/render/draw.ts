// Procedural drawing helpers: all art is code for now so iteration stays fast.
import { RECIPES_BY_ID, SPECIES_BY_ID, type Species } from '../core/data';

export type Ctx = CanvasRenderingContext2D;
export const W = 390;
export const H = 844;

export const COLORS = {
  ink: '#2b2118',
  paper: '#fff8ec',
  paperDark: '#f1e2c8',
  wood: '#a06a3d',
  woodDark: '#6e4423',
  sea: '#2a9db5',
  seaDeep: '#11607a',
  sand: '#f0d9a6',
  grass: '#8cc265',
  accent: '#f27a3a',
  accentDark: '#c4541d',
  good: '#4cae5a',
  bad: '#d8473b',
  gold: '#f5c242',
  sky: '#ffd9a8',
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export function font(size: number, weight = 700): string {
  return `${weight} ${size}px ${FONT}`;
}

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function text(ctx: Ctx, s: string, x: number, y: number, size: number, color = COLORS.ink, align: CanvasTextAlign = 'center', weight = 700): void {
  ctx.font = font(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

export function outlinedText(ctx: Ctx, s: string, x: number, y: number, size: number, fill: string, stroke = COLORS.ink, lw = 5): void {
  ctx.font = font(size, 900);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.strokeText(s, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
}

export function panel(ctx: Ctx, x: number, y: number, w: number, h: number, fill = COLORS.paper, r = 18): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  rr(ctx, x, y + 5, w, h, r);
  ctx.fill();
  ctx.fillStyle = fill;
  rr(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(43,33,24,0.85)';
  ctx.stroke();
  ctx.restore();
}

// ---------- Easing ----------
export const ease = {
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outElastic: (t: number) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

// ---------- Fish ----------
/** Optional provider of pre-rendered 3D fish images (set by main.ts when WebGL is available). */
let iconProvider: ((species: string) => CanvasImageSource | null) | null = null;
export function setFishIconProvider(fn: (species: string) => CanvasImageSource | null): void {
  iconProvider = fn;
}

export function drawFish(ctx: Ctx, speciesId: string, x: number, y: number, len: number, opts: { flip?: boolean; wiggle?: number; angle?: number; alpha?: number } = {}): void {
  const sp = SPECIES_BY_ID[speciesId];
  ctx.save();
  ctx.translate(x, y);
  if (opts.angle) ctx.rotate(opts.angle);
  if (opts.flip) ctx.scale(-1, 1);
  ctx.globalAlpha *= opts.alpha ?? 1;
  const icon = iconProvider?.(speciesId);
  if (icon) {
    // the icon frames a 1-unit fish in 1.24 units; a gentle bob replaces the 2D tail wiggle
    const size = len * 1.24;
    ctx.rotate(Math.sin(opts.wiggle ?? 0) * 0.05);
    ctx.drawImage(icon, -size / 2, -size / 2, size, size);
    ctx.restore();
    return;
  }
  const w = opts.wiggle ?? 0;
  if (sp.id === 'crab') drawCrab(ctx, sp, len);
  else if (sp.id === 'squid') drawSquid(ctx, sp, len, w);
  else if (sp.id === 'bottle') drawBottleItem(ctx, len);
  else if (sp.id === 'chest') drawChest(ctx, len);
  else drawFishBody(ctx, sp, len, w);
  ctx.restore();
}

function drawFishBody(ctx: Ctx, sp: Species, len: number, wiggle: number): void {
  const h = len * (sp.id === 'grouper' ? 0.5 : sp.id === 'trevally' || sp.id === 'snapper' ? 0.46 : 0.34);
  const tailSwing = Math.sin(wiggle) * h * 0.25;
  ctx.lineWidth = Math.max(1.5, len * 0.035);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineJoin = 'round';
  // tail
  ctx.fillStyle = sp.fin;
  ctx.beginPath();
  ctx.moveTo(-len * 0.36, 0);
  ctx.lineTo(-len * 0.56, -h * 0.55 + tailSwing);
  ctx.quadraticCurveTo(-len * 0.48, tailSwing, -len * 0.56, h * 0.55 + tailSwing);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // dorsal fin
  ctx.beginPath();
  ctx.moveTo(-len * 0.12, -h * 0.42);
  ctx.quadraticCurveTo(len * 0.02, -h * 0.85, len * 0.12, -h * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // body
  const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  grad.addColorStop(0, sp.color);
  grad.addColorStop(0.55, sp.color);
  grad.addColorStop(0.56, sp.belly);
  grad.addColorStop(1, sp.belly);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, len * 0.42, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // stripes / spots for identity
  if (sp.id === 'mackerel') {
    ctx.strokeStyle = 'rgba(20,50,60,0.6)';
    ctx.lineWidth = len * 0.025;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * len * 0.08 - len * 0.03, -h * 0.4);
      ctx.quadraticCurveTo(i * len * 0.08 + len * 0.03, -h * 0.2, i * len * 0.08, -h * 0.05);
      ctx.stroke();
    }
  } else if (sp.id === 'grouper') {
    ctx.fillStyle = 'rgba(60,35,20,0.45)';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(((i * 37) % 50) / 100 * len - len * 0.25, ((i * 23) % 30) / 100 * h - h * 0.2, len * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (sp.id === 'anchovy' || sp.id === 'golden') {
    ctx.strokeStyle = sp.id === 'golden' ? '#fff7d6' : '#d8e8ee';
    ctx.lineWidth = len * 0.04;
    ctx.beginPath();
    ctx.moveTo(-len * 0.3, 0);
    ctx.lineTo(len * 0.25, -h * 0.05);
    ctx.stroke();
  }
  // gill
  ctx.strokeStyle = 'rgba(43,33,24,0.5)';
  ctx.lineWidth = Math.max(1, len * 0.02);
  ctx.beginPath();
  ctx.arc(len * 0.18, 0, h * 0.35, -1.1, 1.1);
  ctx.stroke();
  // eye
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(len * 0.28, -h * 0.1, Math.max(2, len * 0.065), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.arc(len * 0.295, -h * 0.1, Math.max(1.2, len * 0.035), 0, Math.PI * 2);
  ctx.fill();
  if (sp.id === 'golden') {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    star(ctx, -len * 0.1, -h * 0.15, len * 0.06);
  }
}

function drawCrab(ctx: Ctx, sp: Species, len: number): void {
  const r = len * 0.32;
  ctx.lineWidth = Math.max(1.5, len * 0.035);
  ctx.strokeStyle = COLORS.ink;
  ctx.fillStyle = sp.fin;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.7, r * 0.1 + i * r * 0.25);
      ctx.lineTo(s * r * 1.4, r * 0.4 + i * r * 0.3);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(s * r * 1.15, -r * 0.7, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = sp.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 0.55, r * 0.12, 0, Math.PI * 2);
  ctx.arc(r * 0.3, -r * 0.55, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawSquid(ctx: Ctx, sp: Species, len: number, wiggle: number): void {
  ctx.lineWidth = Math.max(1.5, len * 0.035);
  ctx.strokeStyle = COLORS.ink;
  ctx.fillStyle = sp.fin;
  for (let i = 0; i < 5; i++) {
    const yy = (i - 2) * len * 0.05;
    ctx.beginPath();
    ctx.moveTo(-len * 0.1, yy);
    ctx.quadraticCurveTo(-len * 0.35, yy + Math.sin(wiggle + i) * len * 0.06, -len * 0.5, yy * 1.6);
    ctx.stroke();
  }
  ctx.fillStyle = sp.color;
  ctx.beginPath();
  ctx.moveTo(len * 0.45, 0);
  ctx.quadraticCurveTo(len * 0.2, -len * 0.2, -len * 0.15, -len * 0.1);
  ctx.lineTo(-len * 0.15, len * 0.1);
  ctx.quadraticCurveTo(len * 0.2, len * 0.2, len * 0.45, 0);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.arc(-len * 0.08, -len * 0.04, len * 0.035, 0, Math.PI * 2);
  ctx.fill();
}

function drawBottleItem(ctx: Ctx, len: number): void {
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.ink;
  ctx.fillStyle = 'rgba(124,199,160,0.85)';
  rr(ctx, -len * 0.35, -len * 0.15, len * 0.55, len * 0.3, len * 0.1);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(len * 0.18, -len * 0.06, len * 0.15, len * 0.12);
  ctx.strokeRect(len * 0.18, -len * 0.06, len * 0.15, len * 0.12);
  ctx.fillStyle = '#c79a5a';
  ctx.fillRect(len * 0.32, -len * 0.07, len * 0.07, len * 0.14);
  ctx.fillStyle = '#fff3d6';
  ctx.fillRect(-len * 0.25, -len * 0.06, len * 0.3, len * 0.12);
}

function drawChest(ctx: Ctx, len: number): void {
  const w = len * 0.7;
  const h = len * 0.45;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = COLORS.ink;
  ctx.fillStyle = '#9c6a32';
  rr(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f2c650';
  ctx.fillRect(-w / 2, -h * 0.1, w, h * 0.16);
  ctx.strokeRect(-w / 2, -h * 0.1, w, h * 0.16);
  ctx.fillRect(-w * 0.07, -h * 0.15, w * 0.14, h * 0.3);
  ctx.strokeRect(-w * 0.07, -h * 0.15, w * 0.14, h * 0.3);
}

export function star(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

// ---------- Jar & bottle ----------
export function drawJar(ctx: Ctx, x: number, y: number, s: number, opts: { lidOffset?: number; lidAngle?: number; wobble?: number; glow?: number; empty?: boolean; fill?: number } = {}): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(opts.wobble ?? 0);
  if (opts.glow) {
    const g = ctx.createRadialGradient(0, -s * 0.5, 0, 0, -s * 0.5, s * 1.3);
    g.addColorStop(0, `rgba(255,220,120,${0.6 * opts.glow})`);
    g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -s * 0.5, s * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = Math.max(2, s * 0.05);
  ctx.strokeStyle = COLORS.ink;
  // body
  const grad = ctx.createLinearGradient(-s * 0.5, 0, s * 0.5, 0);
  grad.addColorStop(0, '#7a4523');
  grad.addColorStop(0.35, '#b56d3a');
  grad.addColorStop(1, '#6b3b1d');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-s * 0.26, -s * 0.9);
  ctx.bezierCurveTo(-s * 0.62, -s * 0.75, -s * 0.6, -s * 0.05, -s * 0.3, 0);
  ctx.lineTo(s * 0.3, 0);
  ctx.bezierCurveTo(s * 0.6, -s * 0.05, s * 0.62, -s * 0.75, s * 0.26, -s * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // glaze band
  ctx.strokeStyle = 'rgba(255,220,170,0.45)';
  ctx.lineWidth = s * 0.04;
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, -s * 0.55);
  ctx.quadraticCurveTo(0, -s * 0.48, s * 0.5, -s * 0.55);
  ctx.stroke();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = Math.max(2, s * 0.05);
  // fill level indicator when filling
  if (opts.fill !== undefined && opts.fill > 0) {
    ctx.fillStyle = '#f5e6c4';
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < opts.fill ? 1 : 0.25;
      ctx.beginPath();
      ctx.arc((i - 1) * s * 0.2, -s * 0.3, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // neck
  ctx.fillStyle = '#8a4f28';
  rr(ctx, -s * 0.28, -s * 1.0, s * 0.56, s * 0.14, s * 0.04);
  ctx.fill();
  ctx.stroke();
  if (!opts.empty) {
    // lid (conical bamboo-hat style)
    ctx.save();
    ctx.translate(0, -s * 1.0 - (opts.lidOffset ?? 0));
    ctx.rotate(opts.lidAngle ?? 0);
    ctx.fillStyle = '#e3c27a';
    ctx.beginPath();
    ctx.moveTo(-s * 0.38, 0);
    ctx.lineTo(0, -s * 0.22);
    ctx.lineTo(s * 0.38, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

export function drawBottle(ctx: Ctx, x: number, y: number, s: number, recipeId: string, tierColor: string): void {
  const recipe = RECIPES_BY_ID[recipeId];
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(2, s * 0.04);
  ctx.strokeStyle = COLORS.ink;
  // glass body
  ctx.fillStyle = recipe.color;
  ctx.beginPath();
  ctx.moveTo(-s * 0.12, -s * 1.0);
  ctx.lineTo(-s * 0.12, -s * 0.78);
  ctx.quadraticCurveTo(-s * 0.32, -s * 0.7, -s * 0.32, -s * 0.5);
  ctx.lineTo(-s * 0.32, -s * 0.05);
  ctx.quadraticCurveTo(-s * 0.32, 0, -s * 0.26, 0);
  ctx.lineTo(s * 0.26, 0);
  ctx.quadraticCurveTo(s * 0.32, 0, s * 0.32, -s * 0.05);
  ctx.lineTo(s * 0.32, -s * 0.5);
  ctx.quadraticCurveTo(s * 0.32, -s * 0.7, s * 0.12, -s * 0.78);
  ctx.lineTo(s * 0.12, -s * 1.0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // shine
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  rr(ctx, -s * 0.24, -s * 0.6, s * 0.07, s * 0.5, s * 0.04);
  ctx.fill();
  // label
  ctx.fillStyle = COLORS.paper;
  rr(ctx, -s * 0.27, -s * 0.45, s * 0.54, s * 0.28, s * 0.04);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tierColor;
  rr(ctx, -s * 0.27, -s * 0.45, s * 0.54, s * 0.07, s * 0.03);
  ctx.fill();
  // cap
  ctx.fillStyle = '#c0392b';
  rr(ctx, -s * 0.14, -s * 1.08, s * 0.28, s * 0.1, s * 0.03);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawCoin(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.save();
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.strokeStyle = '#8a5a12';
  ctx.fillStyle = COLORS.gold;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#c98f1c';
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.strokeRect(x - r * 0.32, y - r * 0.32, r * 0.64, r * 0.64);
  ctx.restore();
}

// ---------- Particles ----------
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'dot' | 'star' | 'confetti' | 'drop';
  rot: number;
  g: number;
}

export class Particles {
  list: Particle[] = [];

  burst(x: number, y: number, n: number, colors: string[], opts: { speed?: number; kind?: Particle['kind']; size?: number; life?: number; g?: number; up?: boolean } = {}): void {
    for (let i = 0; i < n; i++) {
      const a = opts.up ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 220) * (0.4 + Math.random() * 0.8);
      const life = (opts.life ?? 0.9) * (0.6 + Math.random() * 0.6);
      this.list.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        size: (opts.size ?? 5) * (0.6 + Math.random() * 0.8),
        color: colors[i % colors.length],
        kind: opts.kind ?? 'dot',
        rot: Math.random() * 6,
        g: opts.g ?? 500,
      });
    }
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.2;
      p.rot += dt * 6;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx: Ctx): void {
    for (const p of this.list) {
      ctx.save();
      ctx.globalAlpha = clamp01(p.life / p.max * 1.5);
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.kind === 'star') star(ctx, 0, 0, p.size);
      else if (p.kind === 'confetti') ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

/** Bobbing tutorial hand pointing down-left at (x, y). */
export function drawPointer(ctx: Ctx, x: number, y: number, t: number): void {
  const bob = Math.sin(t * 5) * 8;
  ctx.save();
  ctx.translate(x + 18, y + 26 + bob);
  ctx.rotate(-0.5);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  rr(ctx, -8, -30, 16, 40, 8);
  ctx.fill();
  ctx.stroke();
  rr(ctx, -14, 0, 30, 30, 10);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
