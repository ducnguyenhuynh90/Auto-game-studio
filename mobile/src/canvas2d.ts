// The browser's 2D canvas, drawn by Skia. The game's UI layer (../src/scenes, ../src/render) is
// written against CanvasRenderingContext2D; this is the subset it uses, so the very same drawing code runs
// natively, with no WebView. Two kinds of canvas:
//  - SkiaCanvasElement: an offscreen canvas (document.createElement('canvas')): icons, brag cards, textures.
//  - the frame context (beginFrame): records the UI layer into a picture every frame for <Canvas>.
import {
  AlphaType,
  BlendMode,
  ClipOp,
  ColorType,
  ImageFormat,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  type SkCanvas,
  type SkColor,
  type SkColorFilter,
  type SkFont,
  type SkImage,
  type SkPaint,
  type SkPathBuilder,
  type SkPathEffect,
  type SkShader,
  type SkSurface,
  type SkTypeface,
  type SkTypefaceFontProvider,
  type SkParagraph,
} from '@shopify/react-native-skia';

// ---------- colours ----------
const colorCache = new Map<string, SkColor>();
function color(css: string): SkColor {
  let c = colorCache.get(css);
  if (!c) {
    c = Skia.Color(css);
    if (colorCache.size > 4000) colorCache.clear();
    colorCache.set(css, c);
  }
  return c;
}

// ---------- gradients ----------
export class Gradient {
  private stops: [number, string][] = [];
  private shader: SkShader | null = null;
  constructor(
    private kind: 'linear' | 'radial',
    private a: number[],
  ) {}
  addColorStop(offset: number, c: string): void {
    this.stops.push([offset, c]);
    this.shader = null;
  }
  toShader(): SkShader {
    if (this.shader) return this.shader;
    const stops = this.stops.length ? this.stops : ([[0, 'transparent']] as [number, string][]);
    const colors = stops.map((s) => color(s[1]));
    const pos = stops.map((s) => s[0]);
    const a = this.a;
    this.shader =
      this.kind === 'linear'
        ? // [x0, y0, x1, y1]
          Skia.Shader.MakeLinearGradient(Skia.Point(a[0], a[1]), Skia.Point(a[2], a[3]), colors, pos, TileMode.Clamp)
        : // [x0, y0, r0, x1, y1, r1]
          Skia.Shader.MakeTwoPointConicalGradient(Skia.Point(a[0], a[1]), a[2], Skia.Point(a[3], a[4]), a[5], colors, pos, TileMode.Clamp);
    return this.shader;
  }
}
type Style = string | Gradient;

// ---------- fonts ----------
const fontCache = new Map<string, { font: SkFont; ascent: number; descent: number; weight: number; size: number }>();
let faces: [number, SkTypeface][] = [];
const FAMILY = 'GameUI';
let provider: SkTypefaceFontProvider | null = null;
/** The fonts the UI draws with, by weight (the app bundles Nunito, with Vietnamese, in assets/fonts). */
export function setFonts(byWeight: [number, SkTypeface][]): void {
  faces = [...byWeight].sort((x, y) => x[0] - y[0]);
  fontCache.clear();
  paraCache.clear();
  provider = Skia.TypefaceFontProvider.Make();
  for (const [, face] of faces) provider.registerFont(face, FAMILY);
}

// Symbols and emoji (★ ✓ ⓘ 🎁 🐟…) aren't in the UI font. Text with them is laid out by Skia's paragraph
// engine, which falls back to the phone's own symbol and emoji fonts; plain text takes the fast path.
const missingCache = new Map<string, boolean>();
const PLAIN = /^[\x20-\x7e]*$/;
function needsFallback(s: string, font: SkFont): boolean {
  if (PLAIN.test(s)) return false;
  for (const ch of s) {
    if (ch.charCodeAt(0) < 0x7f) continue;
    let miss = missingCache.get(ch);
    if (miss === undefined) {
      miss = font.getGlyphIDs(ch).some((g) => g === 0);
      missingCache.set(ch, miss);
    }
    if (miss) return true;
  }
  return false;
}
const paraCache = new Map<string, SkParagraph>();
function paragraph(s: string, css: string, weight: number, size: number, color: SkColor, stroke: SkPaint | null, key: string): SkParagraph | null {
  if (!provider) return null;
  let p = paraCache.get(key);
  if (p) return p;
  const style = { fontFamilies: [FAMILY], fontSize: size, fontStyle: { weight }, color };
  const b = Skia.ParagraphBuilder.Make({}, provider);
  if (stroke) b.pushStyle(style, stroke);
  else b.pushStyle(style);
  b.addText(s);
  p = b.build();
  p.layout(100000);
  if (paraCache.size > 400) paraCache.clear();
  paraCache.set(key, p);
  return p;
}
/** The bundled weight closest to the one asked for (the browser's font matching, simplified). */
function faceFor(weight: number): SkTypeface | undefined {
  let best: [number, SkTypeface] | undefined;
  for (const f of faces) if (!best || Math.abs(f[0] - weight) < Math.abs(best[0] - weight) || (Math.abs(f[0] - weight) === Math.abs(best[0] - weight) && f[0] > best[0])) best = f;
  return best?.[1];
}
function getFont(css: string): { font: SkFont; ascent: number; descent: number; weight: number; size: number } {
  let f = fontCache.get(css);
  if (f) return f;
  // "900 13px sans-serif", "bold 16px …", "12px …"
  const m = css.match(/(?:(normal|bold|bolder|lighter|[1-9]00)\s+)?(?:(?:italic|oblique)\s+)?([\d.]+)px/);
  const w = m?.[1];
  const weight = w === 'bold' || w === 'bolder' ? 700 : w === 'lighter' ? 300 : w === 'normal' || !w ? 400 : Number(w);
  const size = m ? Number(m[2]) : 10;
  const font = Skia.Font(faceFor(weight), size);
  const metrics = font.getMetrics();
  f = { font, ascent: metrics.ascent, descent: metrics.descent, weight, size };
  fontCache.set(css, f);
  return f;
}

// ---------- CSS filters used by the game ----------
function filterOf(css: string): SkColorFilter | null {
  if (!css || css === 'none') return null;
  const b = css.match(/brightness\(([\d.]+)\)/);
  if (b) {
    const k = Number(b[1]);
    return Skia.ColorFilter.MakeMatrix([k, 0, 0, 0, 0, 0, k, 0, 0, 0, 0, 0, k, 0, 0, 0, 0, 0, 1, 0]);
  }
  const s = css.match(/saturate\(([\d.]+)\)/);
  if (s) {
    const v = Number(s[1]);
    const r = 0.213, g = 0.715, bl = 0.072;
    return Skia.ColorFilter.MakeMatrix([
      r + (1 - r) * v, g - g * v, bl - bl * v, 0, 0,
      r - r * v, g + (1 - g) * v, bl - bl * v, 0, 0,
      r - r * v, g - g * v, bl + (1 - bl) * v, 0, 0,
      0, 0, 0, 1, 0,
    ]);
  }
  return null;
}

/** Anything drawImage accepts: an offscreen canvas, or a host image (the 3D layer for brag cards). */
export interface ImageSourceLike {
  width: number;
  height: number;
  skImage(): SkImage | null;
}

interface State {
  fillStyle: Style;
  strokeStyle: Style;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  filter: string;
  dash: number[];
  lineDashOffset: number;
}
const initial = (): State => ({
  fillStyle: '#000',
  strokeStyle: '#000',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  globalAlpha: 1,
  filter: 'none',
  dash: [],
  lineDashOffset: 0,
});

const DEG = 180 / Math.PI;

/** CanvasRenderingContext2D (the parts the game uses) on a Skia canvas. */
export class SkiaContext2D {
  canvas: SkCanvas;
  private st: State = initial();
  private stack: State[] = [];
  private path: SkPathBuilder = Skia.PathBuilder.Make();
  private paint: SkPaint = Skia.Paint();
  private clearPaint: SkPaint;
  private baseSave = 0;
  private dashEffect: SkPathEffect | null = null;
  private dashKey = '';
  private filterKey = 'none';
  private colorFilter: SkColorFilter | null = null;
  /** set by SkiaCanvasElement: the snapshot of a canvas is redone after it was drawn on */
  onDraw: (() => void) | null = null;

  constructor(canvas: SkCanvas, readonly owner: { width: number; height: number } | null = null) {
    this.canvas = canvas;
    this.paint.setAntiAlias(true);
    this.clearPaint = Skia.Paint();
    this.clearPaint.setBlendMode(BlendMode.Clear);
    this.baseSave = canvas.save();
  }

  /** Re-target a new canvas (each frame records into a fresh picture). */
  reset(canvas: SkCanvas): void {
    this.canvas = canvas;
    this.st = initial();
    this.stack = [];
    this.path = Skia.PathBuilder.Make();
    this.baseSave = canvas.save();
  }

  // ----- state -----
  get fillStyle(): Style {
    return this.st.fillStyle;
  }
  set fillStyle(v: Style) {
    this.st.fillStyle = v;
  }
  get strokeStyle(): Style {
    return this.st.strokeStyle;
  }
  set strokeStyle(v: Style) {
    this.st.strokeStyle = v;
  }
  get lineWidth(): number {
    return this.st.lineWidth;
  }
  set lineWidth(v: number) {
    if (v > 0 && Number.isFinite(v)) this.st.lineWidth = v;
  }
  get lineCap(): CanvasLineCap {
    return this.st.lineCap;
  }
  set lineCap(v: CanvasLineCap) {
    this.st.lineCap = v;
  }
  get lineJoin(): CanvasLineJoin {
    return this.st.lineJoin;
  }
  set lineJoin(v: CanvasLineJoin) {
    this.st.lineJoin = v;
  }
  get font(): string {
    return this.st.font;
  }
  set font(v: string) {
    this.st.font = v;
  }
  get textAlign(): CanvasTextAlign {
    return this.st.textAlign;
  }
  set textAlign(v: CanvasTextAlign) {
    this.st.textAlign = v;
  }
  get textBaseline(): CanvasTextBaseline {
    return this.st.textBaseline;
  }
  set textBaseline(v: CanvasTextBaseline) {
    this.st.textBaseline = v;
  }
  get globalAlpha(): number {
    return this.st.globalAlpha;
  }
  set globalAlpha(v: number) {
    if (v >= 0 && v <= 1) this.st.globalAlpha = v;
  }
  get filter(): string {
    return this.st.filter;
  }
  set filter(v: string) {
    this.st.filter = v;
  }
  get lineDashOffset(): number {
    return this.st.lineDashOffset;
  }
  set lineDashOffset(v: number) {
    this.st.lineDashOffset = v;
  }
  // unused by the game, accepted so code that sets them doesn't throw
  globalCompositeOperation = 'source-over';
  imageSmoothingEnabled = true;
  shadowBlur = 0;
  shadowColor = 'transparent';
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  miterLimit = 10;

  setLineDash(d: number[]): void {
    this.st.dash = d.length % 2 ? [...d, ...d] : [...d];
  }
  getLineDash(): number[] {
    return [...this.st.dash];
  }

  save(): void {
    this.stack.push({ ...this.st, dash: [...this.st.dash] });
    this.canvas.save();
  }
  restore(): void {
    const s = this.stack.pop();
    if (!s) return;
    this.st = s;
    this.canvas.restore();
  }

  // ----- transforms -----
  translate(x: number, y: number): void {
    this.canvas.translate(x, y);
  }
  scale(x: number, y: number): void {
    this.canvas.scale(x, y);
  }
  rotate(a: number): void {
    this.canvas.rotate(a * DEG, 0, 0);
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.canvas.concat(Skia.Matrix([a, c, e, b, d, f, 0, 0, 1]));
  }
  setTransform(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0): void {
    // back to the frame's base matrix, then the new one (the game only calls this between frames)
    this.canvas.restoreToCount(this.baseSave);
    this.baseSave = this.canvas.save();
    this.stack = [];
    this.transform(a, b, c, d, e, f);
  }
  resetTransform(): void {
    this.setTransform();
  }

  // ----- paths -----
  beginPath(): void {
    this.path = Skia.PathBuilder.Make();
  }
  closePath(): void {
    this.path.close();
  }
  moveTo(x: number, y: number): void {
    this.path.moveTo(x, y);
  }
  lineTo(x: number, y: number): void {
    if (this.path.isEmpty()) this.path.moveTo(x, y);
    else this.path.lineTo(x, y);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    if (this.path.isEmpty()) this.path.moveTo(cx, cy);
    this.path.quadTo(cx, cy, x, y);
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (this.path.isEmpty()) this.path.moveTo(c1x, c1y);
    this.path.cubicTo(c1x, c1y, c2x, c2y, x, y);
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void {
    if (this.path.isEmpty()) this.path.moveTo(x1, y1);
    this.path.arcToTangent(x1, y1, x2, y2, r);
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.path.addRect(Skia.XYWHRect(x, y, w, h));
  }
  roundRect(x: number, y: number, w: number, h: number, r: number | number[] = 0): void {
    const rr = Array.isArray(r) ? (r[0] ?? 0) : r;
    const rad = Math.max(0, Math.min(typeof rr === 'number' ? rr : 0, Math.abs(w) / 2, Math.abs(h) / 2));
    const nx = w < 0 ? x + w : x;
    const ny = h < 0 ? y + h : y;
    this.path.addRRect(Skia.RRectXY(Skia.XYWHRect(nx, ny, Math.abs(w), Math.abs(h)), rad, rad));
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false): void {
    if (rx < 0 || ry < 0) return;
    const TAU = Math.PI * 2;
    let sweep: number;
    if (!ccw) {
      sweep = a1 - a0;
      if (sweep >= TAU) sweep = TAU;
      else if (sweep < 0) sweep = (sweep % TAU) + TAU;
    } else {
      sweep = a1 - a0;
      if (sweep <= -TAU) sweep = -TAU;
      else if (sweep > 0) sweep = (sweep % TAU) - TAU;
    }
    const oval = Skia.XYWHRect(-rx, -ry, rx * 2, ry * 2);
    // built around the origin, then rotated and moved into place (the browser's ellipse rotation)
    const b = Skia.PathBuilder.Make();
    const start = a0 * DEG;
    const sw = sweep * DEG;
    if (Math.abs(sw) >= 359.999) {
      b.arcToOval(oval, start, sw / 2, true);
      b.arcToOval(oval, start + sw / 2, sw / 2, false);
    } else b.arcToOval(oval, start, sw, true);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    b.transform(Skia.Matrix([cos, -sin, x, sin, cos, y, 0, 0, 1]));
    const seg = b.detach();
    // the browser joins the arc to the current point with a straight line
    if (this.path.isEmpty()) this.path.addPath(seg);
    else {
      const p0 = seg.getPoint(0);
      this.path.lineTo(p0.x, p0.y);
      this.path.addPath(seg, undefined, true);
    }
  }

  // ----- paint setup -----
  private setupPaint(style: Style | null, stroke: boolean): SkPaint {
    const p = this.paint;
    p.setShader(null);
    p.setPathEffect(null);
    if (style instanceof Gradient) {
      p.setColor(color('#000'));
      p.setShader(style.toShader());
      p.setAlphaf(this.st.globalAlpha);
    } else if (style !== null) {
      p.setColor(color(style));
      p.setAlphaf(p.getAlphaf() * this.st.globalAlpha);
    } else {
      p.setColor(color('#000'));
      p.setAlphaf(this.st.globalAlpha);
    }
    if (this.filterKey !== this.st.filter) {
      this.filterKey = this.st.filter;
      this.colorFilter = filterOf(this.st.filter);
    }
    p.setColorFilter(this.colorFilter);
    if (stroke) {
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeWidth(this.st.lineWidth);
      p.setStrokeCap(this.st.lineCap === 'round' ? StrokeCap.Round : this.st.lineCap === 'square' ? StrokeCap.Square : StrokeCap.Butt);
      p.setStrokeJoin(this.st.lineJoin === 'round' ? StrokeJoin.Round : this.st.lineJoin === 'bevel' ? StrokeJoin.Bevel : StrokeJoin.Miter);
      p.setStrokeMiter(this.miterLimit);
      if (this.st.dash.length) {
        const key = this.st.dash.join(',') + '|' + this.st.lineDashOffset;
        if (key !== this.dashKey) {
          this.dashKey = key;
          this.dashEffect = Skia.PathEffect.MakeDash(this.st.dash, this.st.lineDashOffset);
        }
        p.setPathEffect(this.dashEffect);
      }
    } else p.setStyle(PaintStyle.Fill);
    return p;
  }

  // ----- drawing -----
  fill(): void {
    this.canvas.drawPath(this.path.build(), this.setupPaint(this.st.fillStyle, false));
    this.onDraw?.();
  }
  stroke(): void {
    this.canvas.drawPath(this.path.build(), this.setupPaint(this.st.strokeStyle, true));
    this.onDraw?.();
  }
  clip(): void {
    this.canvas.clipPath(this.path.build(), ClipOp.Intersect, true);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.canvas.drawRect(Skia.XYWHRect(x, y, w, h), this.setupPaint(this.st.fillStyle, false));
    this.onDraw?.();
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.canvas.drawRect(Skia.XYWHRect(x, y, w, h), this.setupPaint(this.st.strokeStyle, true));
    this.onDraw?.();
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    this.canvas.drawRect(Skia.XYWHRect(x, y, w, h), this.clearPaint);
    this.onDraw?.();
  }

  // ----- text -----
  measureText(text: string): TextMetrics {
    const f = getFont(this.st.font);
    const str = String(text);
    let width: number;
    if (needsFallback(str, f.font)) {
      const p = paragraph(str, this.st.font, f.weight, f.size, color('#000'), null, `m|${this.st.font}|${str}`);
      width = p ? p.getMaxIntrinsicWidth() : f.font.getTextWidth(str);
    } else width = f.font.getTextWidth(str);
    return {
      width,
      actualBoundingBoxAscent: -f.ascent,
      actualBoundingBoxDescent: f.descent,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: width,
      fontBoundingBoxAscent: -f.ascent,
      fontBoundingBoxDescent: f.descent,
    } as TextMetrics;
  }
  private textAt(text: string, x: number, y: number, maxWidth: number | undefined, stroke: boolean): void {
    const s = String(text);
    if (!s) return;
    const f = getFont(this.st.font);
    const style = stroke ? this.st.strokeStyle : this.st.fillStyle;
    const p = this.setupPaint(style, stroke);
    let para: SkParagraph | null = null;
    if (needsFallback(s, f.font)) {
      const c = p.getColor();
      const col = new Float32Array([c[0], c[1], c[2], c[3]]) as unknown as SkColor;
      const key = `${stroke ? `s${this.st.lineWidth}` : 'f'}|${this.st.font}|${Array.from(c as unknown as number[]).join(',')}|${s}`;
      para = paragraph(s, this.st.font, f.weight, f.size, col, stroke ? p.copy() : null, key);
    }
    let w = para ? para.getMaxIntrinsicWidth() : f.font.getTextWidth(s);
    let sx = 1;
    if (maxWidth !== undefined && w > maxWidth && maxWidth > 0) {
      sx = maxWidth / w;
      w = maxWidth;
    }
    const a = this.st.textAlign;
    const dx = a === 'center' ? -w / 2 : a === 'right' || a === 'end' ? -w : 0;
    const b = this.st.textBaseline;
    const dy = b === 'middle' ? -(f.ascent + f.descent) / 2 : b === 'top' || b === 'hanging' ? -f.ascent : b === 'bottom' || b === 'ideographic' ? -f.descent : 0;
    this.canvas.save();
    this.canvas.translate(x + dx, y + dy);
    if (sx !== 1) this.canvas.scale(sx, 1);
    if (para) {
      // a paragraph is placed by its top; line 0's baseline goes where the text baseline is
      const base = para.getLineMetrics()[0]?.baseline ?? -f.ascent;
      para.paint(this.canvas, 0, -base);
    } else this.canvas.drawText(s, 0, 0, p, f.font);
    this.canvas.restore();
    this.onDraw?.();
  }
  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.textAt(text, x, y, maxWidth, false);
  }
  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this.textAt(text, x, y, maxWidth, true);
  }

  // ----- gradients -----
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Gradient {
    return new Gradient('linear', [x0, y0, x1, y1]);
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Gradient {
    // packed as [x0, y0, r0, x1, y1, r1] for MakeTwoPointConicalGradient
    return new Gradient('radial', [x0, y0, r0, x1, y1, r1]);
  }

  // ----- images -----
  drawImage(img: ImageSourceLike, ...a: number[]): void {
    const sk = img?.skImage?.();
    if (!sk) return;
    const iw = sk.width();
    const ih = sk.height();
    // the source's own size in CSS terms (a canvas may be drawn at a different pixel size)
    const kx = iw / (img.width || iw);
    const ky = ih / (img.height || ih);
    let src = Skia.XYWHRect(0, 0, iw, ih);
    let dst: ReturnType<typeof Skia.XYWHRect>;
    if (a.length === 2) dst = Skia.XYWHRect(a[0], a[1], img.width, img.height);
    else if (a.length === 4) dst = Skia.XYWHRect(a[0], a[1], a[2], a[3]);
    else {
      src = Skia.XYWHRect(a[0] * kx, a[1] * ky, a[2] * kx, a[3] * ky);
      dst = Skia.XYWHRect(a[4], a[5], a[6], a[7]);
    }
    const p = this.setupPaint(null, false);
    this.canvas.drawImageRect(sk, src, dst, p);
    this.onDraw?.();
  }

  // for brag cards' "tiny" blur trick and similar: whole-canvas pixel access is not supported
  getImageData(): never {
    throw new Error('getImageData is not available in the app');
  }
}

/** An offscreen <canvas> (document.createElement('canvas')) backed by a CPU Skia surface. */
export class SkiaCanvasElement implements ImageSourceLike {
  private w = 300;
  private h = 150;
  private surface: SkSurface | null = null;
  private ctx: SkiaContext2D | null = null;
  private snap: SkImage | null = null;
  style: Record<string, string> = {};

  get width(): number {
    return this.w;
  }
  set width(v: number) {
    this.w = Math.max(1, Math.floor(v));
    this.surface = null;
  }
  get height(): number {
    return this.h;
  }
  set height(v: number) {
    this.h = Math.max(1, Math.floor(v));
    this.surface = null;
  }

  private ensure(): SkiaContext2D {
    if (!this.surface) {
      this.surface = Skia.Surface.Make(this.w, this.h);
      if (!this.surface) throw new Error(`could not make a ${this.w}x${this.h} canvas`);
      this.snap = null;
      if (this.ctx) this.ctx.reset(this.surface.getCanvas());
      else {
        this.ctx = new SkiaContext2D(this.surface.getCanvas(), this);
        this.ctx.onDraw = () => {
          this.snap = null;
        };
      }
    }
    return this.ctx!;
  }

  getContext(kind: string): SkiaContext2D | null {
    return kind === '2d' ? this.ensure() : null;
  }

  skImage(): SkImage | null {
    this.ensure();
    if (!this.snap) {
      this.surface!.flush();
      this.snap = this.surface!.makeImageSnapshot();
    }
    return this.snap;
  }

  /** RGBA bytes, top row first, not premultiplied (for 3D textures). */
  getPixels(): Uint8Array {
    const img = this.skImage()!;
    const px = img.readPixels(0, 0, { width: this.w, height: this.h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
    return px instanceof Uint8Array ? px : new Uint8Array(this.w * this.h * 4);
  }

  /** A canvas holding these pixels (RGBA, top row first, not premultiplied). */
  static fromPixels(px: Uint8Array, w: number, h: number): SkiaCanvasElement {
    const c = new SkiaCanvasElement();
    c.width = w;
    c.height = h;
    const data = Skia.Data.fromBytes(px);
    const img = Skia.Image.MakeImage({ width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }, data, w * 4);
    if (img) c.getContext('2d')!.drawImage({ width: w, height: h, skImage: () => img }, 0, 0);
    return c;
  }

  toDataURL(type = 'image/png', quality = 0.92): string {
    const img = this.skImage();
    if (!img) return 'data:,';
    const jpeg = type === 'image/jpeg';
    return `data:${jpeg ? 'image/jpeg' : 'image/png'};base64,${img.encodeToBase64(jpeg ? ImageFormat.JPEG : ImageFormat.PNG, Math.round(quality * 100))}`;
  }

  toBlob(cb: (b: null) => void): void {
    cb(null); // the app shares pictures through toDataURL (src/native/share.ts)
  }

  // the browser canvas API the game may touch
  addEventListener(): void {}
  removeEventListener(): void {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: this.w, height: this.h, right: this.w, bottom: this.h, x: 0, y: 0 };
  }
}

/** Records the UI layer each frame into a picture for the screen's <Canvas>. */
export class FrameRecorder {
  private recorder = Skia.PictureRecorder();
  ctx: SkiaContext2D | null = null;

  begin(w: number, h: number): SkiaContext2D {
    const c = this.recorder.beginRecording(Skia.XYWHRect(0, 0, w, h));
    if (this.ctx) this.ctx.reset(c);
    else this.ctx = new SkiaContext2D(c);
    return this.ctx;
  }

  end() {
    return this.recorder.finishRecordingAsPicture();
  }
}
