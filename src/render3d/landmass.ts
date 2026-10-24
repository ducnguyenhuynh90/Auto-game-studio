// One continuous island built from the plot map (core/island.ts): a smooth coastline traced around
// every land plot, a painted grass top (your land bright, the rest wild), a grass cliff edge, a sand
// beach ring, shallow lagoon water and rocks along the shore. Built once; only colours change as you buy.
import * as THREE from 'three';
import { COLS, HOME, ROWS, isLand, terrain, type Terrain } from '../core/island';

/** World units per plot. The village diorama (about 9 × 14 units) fills the home plot. */
export const PLOT = 14;
/** The village sits toward the north edge of its plot, so its dock reaches the open sea. */
export const ZOFF = 3;
const homeCol = HOME % COLS;
const homeRow = Math.floor(HOME / COLS);
/** Height of the island's grass top (the village's ground level). */
export const TOP = 0.2;

export function plotCenter(tile: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(((tile % COLS) - homeCol) * PLOT, 0, (Math.floor(tile / COLS) - homeRow) * PLOT + ZOFF);
}

/** Which plot a world point is on (or -1 off the map). */
export function tileAt(x: number, z: number): number {
  const c = Math.floor(x / PLOT + homeCol + 0.5);
  const r = Math.floor((z - ZOFF) / PLOT + homeRow + 0.5);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return -1;
  return r * COLS + c;
}

export const landAt = (c: number, r: number) => c >= 0 && r >= 0 && c < COLS && r < ROWS && isLand(terrain(r * COLS + c));
const corner = (gc: number, gr: number) => new THREE.Vector2((gc - homeCol - 0.5) * PLOT, (gr - homeRow - 0.5) * PLOT + ZOFF);

/** Deterministic noise in [0,1) for a seed. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** The outline of all land plots as one loop (clockwise in x/z), then rounded and roughened. */
function traceCoast(): THREE.Vector2[] {
  // directed boundary edges between land and sea, in grid-corner coordinates
  const edges = new Map<string, [number, number]>();
  const key = (c: number, r: number) => `${c},${r}`;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (!landAt(c, r)) continue;
      if (!landAt(c, r - 1)) edges.set(key(c, r), [c + 1, r]);
      if (!landAt(c + 1, r)) edges.set(key(c + 1, r) + 'R', [c + 1, r + 1]);
      if (!landAt(c, r + 1)) edges.set(key(c + 1, r + 1) + 'B', [c, r + 1]);
      if (!landAt(c - 1, r)) edges.set(key(c, r + 1) + 'L', [c, r]);
    }
  // index outgoing edges by start corner
  const out = new Map<string, [number, number][]>();
  for (const [k, to] of edges) {
    const from = k.replace(/[RBL]$/, '');
    const list = out.get(from) ?? [];
    list.push(to);
    out.set(from, list);
  }
  const startKey = out.keys().next().value as string;
  const pts: [number, number][] = [];
  let cur = startKey.split(',').map(Number) as [number, number];
  for (let guard = 0; guard < 1000; guard++) {
    pts.push(cur);
    const list = out.get(key(...cur));
    if (!list || !list.length) break;
    const next = list.shift()!;
    if (key(...next) === startKey) break;
    cur = next;
  }
  // world space, with each long straight edge split so the coast can wobble
  let poly: THREE.Vector2[] = [];
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const a = corner(p[0], p[1]);
    const b = corner(q[0], q[1]);
    poly.push(a);
    const n = new THREE.Vector2(b.y - a.y, a.x - b.x).normalize();
    for (const f of [0.33, 0.66]) {
      const m = a.clone().lerp(b, f);
      m.addScaledVector(n, (hash(i * 3.7 + f * 11) - 0.5) * 5);
      poly.push(m);
    }
  });
  // Chaikin corner cutting: square plots become a soft, organic island
  for (let it = 0; it < 4; it++) {
    const next: THREE.Vector2[] = [];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      next.push(a.clone().lerp(b, 0.25), a.clone().lerp(b, 0.75));
    });
    poly = next;
  }
  return poly;
}

export const COAST = traceCoast();

/** Pushes every point of a closed loop outward (positive d) along its averaged normal. */
export function offset(poly: THREE.Vector2[], d: number): THREE.Vector2[] {
  // orientation decides which side is "out"
  let area = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  });
  const sign = area > 0 ? -1 : 1;
  return poly.map((p, i) => {
    const a = poly[(i - 1 + poly.length) % poly.length];
    const b = poly[(i + 1) % poly.length];
    const t = b.clone().sub(a).normalize();
    const n = new THREE.Vector2(t.y, -t.x).multiplyScalar(sign);
    return p.clone().addScaledVector(n, d);
  });
}

export function inside(poly: THREE.Vector2[], x: number, z: number): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > z !== b.y > z && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) ins = !ins;
  }
  return ins;
}

function nearestOn(poly: THREE.Vector2[], x: number, z: number): THREE.Vector2 {
  let best = poly[0];
  let bestD = Infinity;
  const p = new THREE.Vector2(x, z);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ab = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
    const q = a.clone().addScaledVector(ab, t);
    const d = q.distanceToSquared(p);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** A flat loop in x/z extruded downward from y = top, `depth` thick. */
export function slab(poly: THREE.Vector2[], top: number, depth: number): THREE.BufferGeometry {
  // shape y = -world z (rotateX(-90°) maps shape (x, y) to world (x, ·, -y))
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, top - depth, 0);
  return g;
}

export function flatShape(poly: THREE.Vector2[], y: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.y)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/** The painted top of the island: a fine grid clipped to the coast, coloured per plot. */
export class Terrain3D {
  geometry: THREE.BufferGeometry;
  /** For each vertex: the 4 plots around it and their bilinear weights, so colours blend softly. */
  private vertexTiles: Int16Array;
  private vertexWeights: Float32Array;
  private vertexNoise: Float32Array;

  constructor(step = 1.25) {
    const inner = COAST;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of inner) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y);
      maxZ = Math.max(maxZ, p.y);
    }
    const nx = Math.ceil((maxX - minX) / step) + 1;
    const nz = Math.ceil((maxZ - minZ) / step) + 1;
    const pos: number[] = [];
    const ins: boolean[] = [];
    const tiles: number[] = [];
    const weights: number[] = [];
    const noise: number[] = [];
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        let x = minX + i * step;
        let z = minZ + j * step;
        const isIn = inside(inner, x, z);
        // bilinear between the four nearest plot centres (sea plots borrow the nearest land)
        const gx = x / PLOT + homeCol;
        const gz = (z - ZOFF) / PLOT + homeRow;
        const c0 = Math.floor(gx);
        const r0 = Math.floor(gz);
        const fx = gx - c0;
        const fz = gz - r0;
        const near = nearestLandTile(x, z);
        for (const [dc, dr, w] of [
          [0, 0, (1 - fx) * (1 - fz)],
          [1, 0, fx * (1 - fz)],
          [0, 1, (1 - fx) * fz],
          [1, 1, fx * fz],
        ] as const) {
          const cc = c0 + dc;
          const rr = r0 + dr;
          const t = landAt(cc, rr) ? rr * COLS + cc : near;
          tiles.push(t);
          weights.push(w);
        }
        if (!isIn) {
          const q = nearestOn(inner, x, z);
          x = q.x;
          z = q.y;
        }
        pos.push(x, TOP, z);
        ins.push(isIn);
        noise.push(hash(i * 13.1 + j * 7.7) * 0.08 - 0.04);
      }
    const index: number[] = [];
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        if (ins[a] || ins[b] || ins[c]) index.push(a, c, b);
        if (ins[b] || ins[c] || ins[d]) index.push(b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    g.setIndex(index);
    g.computeVertexNormals();
    this.geometry = g;
    this.vertexTiles = Int16Array.from(tiles);
    this.vertexWeights = Float32Array.from(weights);
    this.vertexNoise = Float32Array.from(noise);
  }

  /** Repaints the top: each vertex takes its plot's colour (with a little low-poly variation). */
  paint(color: (tile: number) => THREE.Color): void {
    const attr = this.geometry.getAttribute('color') as THREE.BufferAttribute;
    const cache = new Map<number, THREE.Color>();
    const get = (t: number) => {
      let c = cache.get(t);
      if (!c) {
        c = color(t);
        cache.set(t, c);
      }
      return c;
    };
    const n = this.vertexNoise.length;
    for (let v = 0; v < n; v++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < 4; k++) {
        const c = get(this.vertexTiles[v * 4 + k]);
        const w = this.vertexWeights[v * 4 + k];
        r += c.r * w;
        g += c.g * w;
        b += c.b * w;
      }
      const f = 1 + this.vertexNoise[v];
      attr.setXYZ(v, r * f, g * f, b * f);
    }
    attr.needsUpdate = true;
  }
}

function nearestLandTile(x: number, z: number): number {
  let best = HOME;
  let bestD = Infinity;
  const p = new THREE.Vector3();
  for (let t = 0; t < COLS * ROWS; t++) {
    if (!isLand(terrain(t))) continue;
    plotCenter(t, p);
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** How a plot looks before you own it: special finds stay hidden as ordinary land. */
export function disguise(t: Terrain): Terrain {
  if (t === 'c' || t === 's' || t === 'p') return 'b';
  if (t === 't' || t === 'w') return 'g';
  return t;
}
