// three.js diorama world: two floating pond islands, voxel tiles, instanced creatures,
// seasonal light. Pure presentation: it reads snapshots, it never changes the simulation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Cell, SIZE, type ActionId, type Snapshot } from '../sim';

const BASE = -2.4;
const CAP = 0.2;
const WATER_TOP = -0.16;
const topOf = (c: Cell) => (c === Cell.Deep ? -1.0 : c === Cell.Shallow || c === Cell.Reeds ? -0.45 : 0);
const isWater = (c: Cell) => c === Cell.Deep || c === Cell.Shallow || c === Cell.Reeds;

export function hash(n: number) {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
const easeOutBack = (t: number) => {
  const c = 1.9;
  return t <= 0 ? 0 : t >= 1 ? 1 : 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const C = (h: string) => new THREE.Color(h);
const PAL = {
  land: [C('#9ccc6a'), C('#7fb956'), C('#c7b25c'), C('#e6ece8')],
  land2: [C('#8dc061'), C('#73ad4d'), C('#b99f50'), C('#d9e1de')],
  crown: [C('#7cc46a'), C('#4f9a45'), C('#e08a3a'), C('#9a8f80')],
  sky: [C('#cfe9df'), C('#cfe7f3'), C('#f1e2c8'), C('#dfe7ef')],
  soil: C('#8a6446'),
  soilDark: C('#6e4f38'),
  sand: C('#d8c48f'),
  bed: C('#6f6a4c'),
  waterClear: C('#3b9cc4'),
  waterAlgae: C('#7aa83a'),
  mud: C('#a88d5c'),
};

function colored(g: THREE.BufferGeometry, hex: string) {
  const c = C(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g.index ? g.toNonIndexed() : g;
}

function frogGeometry() {
  return frogParts().scale(1.4, 1.4, 1.4);
}
function frogParts() {
  const body = new THREE.SphereGeometry(0.17, 10, 8);
  body.scale(1.1, 0.75, 1.25);
  const eyeL = new THREE.SphereGeometry(0.06, 8, 6).translate(-0.08, 0.12, 0.13);
  const eyeR = new THREE.SphereGeometry(0.06, 8, 6).translate(0.08, 0.12, 0.13);
  const pupilL = new THREE.SphereGeometry(0.03, 6, 4).translate(-0.08, 0.13, 0.18);
  const pupilR = new THREE.SphereGeometry(0.03, 6, 4).translate(0.08, 0.13, 0.18);
  return mergeGeometries([
    colored(body, '#6dbb3c'), colored(eyeL, '#ffffff'), colored(eyeR, '#ffffff'),
    colored(pupilL, '#1b1b1b'), colored(pupilR, '#1b1b1b'),
  ])!;
}
function fishGeometry() {
  return fishParts().scale(1.3, 1.3, 1.3);
}
function fishParts() {
  const body = new THREE.SphereGeometry(0.13, 10, 6);
  body.scale(1.7, 0.8, 0.7);
  const tail = new THREE.ConeGeometry(0.1, 0.16, 6).rotateZ(Math.PI / 2).translate(-0.27, 0, 0);
  return mergeGeometries([colored(body, '#f2873a'), colored(tail, '#e0662a')])!;
}
function dragonGeometry() {
  return dragonParts().scale(1.3, 1.3, 1.3);
}
function dragonParts() {
  const body = new THREE.BoxGeometry(0.42, 0.04, 0.04);
  const w1 = new THREE.BoxGeometry(0.06, 0.01, 0.42).translate(0.06, 0.02, 0);
  const w2 = new THREE.BoxGeometry(0.06, 0.01, 0.36).translate(-0.03, 0.02, 0);
  return mergeGeometries([colored(body, '#2a62e0'), colored(w1, '#bfe0ff'), colored(w2, '#bfe0ff')])!;
}
function treeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.07, 0.1, 0.5, 6).translate(0, 0.25, 0);
  return colored(trunk, '#7a573a');
}

const MAX = { trees: 48, logs: 12, reeds: 320, pads: 140, fish: 60, frogs: 80, flies: 40, mosq: 90 };

export interface DioramaView {
  map: Cell[];
  snap: Snapshot;
  /** Continuous season position (0 = start of spring). */
  seasonF: number;
  appear: Record<ActionId, number>;
  dry: boolean;
}

class Diorama {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  private soil: THREE.InstancedMesh;
  private cap: THREE.InstancedMesh;
  private water: THREE.InstancedMesh;
  private crowns: THREE.InstancedMesh;
  private trunks: THREE.InstancedMesh;
  private logs: THREE.InstancedMesh;
  private reeds: THREE.InstancedMesh;
  private pads: THREE.InstancedMesh;
  private fish: THREE.InstancedMesh;
  private frogs: THREE.InstancedMesh;
  private flies: THREE.InstancedMesh;
  private mosq: THREE.InstancedMesh;
  private tufts: THREE.InstancedMesh;
  private flowers: THREE.InstancedMesh;
  private decor = { tufts: [] as number[], flowers: [] as number[] };
  private map: Cell[] = [];
  spots = { trees: [] as number[], logs: [] as number[], reeds: [] as number[], pads: [] as number[], frog: [] as number[], water: [] as number[] };
  private pondR = 4.2;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private col = new THREE.Color();
  private e = new THREE.Euler();

  constructor(mats: Mats) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const n = SIZE * SIZE;
    const mk = (g: THREE.BufferGeometry, mat: THREE.Material, count: number, cast = false) => {
      const im = new THREE.InstancedMesh(g, mat, count);
      im.castShadow = cast;
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.count = 0;
      this.group.add(im);
      return im;
    };
    this.soil = mk(box, mats.flat, n);
    this.cap = mk(box, mats.flat, n);
    this.water = mk(box, mats.water, n);
    this.water.receiveShadow = false;
    this.trunks = mk(treeGeometry(), mats.vcol, MAX.trees, true);
    this.crowns = mk(new THREE.IcosahedronGeometry(0.42, 0), mats.flat, MAX.trees, true);
    this.logs = mk(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 7).rotateZ(Math.PI / 2), mats.log, MAX.logs, true);
    this.reeds = mk(new THREE.ConeGeometry(0.035, 0.9, 4).translate(0, 0.45, 0), mats.reed, MAX.reeds, true);
    this.pads = mk(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 9), mats.pad, MAX.pads);
    this.fish = mk(fishGeometry(), mats.vcol, MAX.fish);
    this.frogs = mk(frogGeometry(), mats.vcol, MAX.frogs, true);
    this.flies = mk(dragonGeometry(), mats.vcol, MAX.flies, true);
    this.mosq = mk(new THREE.BoxGeometry(0.05, 0.05, 0.05), mats.mosq, MAX.mosq);
    this.tufts = mk(new THREE.ConeGeometry(0.12, 0.32, 5).translate(0, 0.16, 0), mats.tuft, 90, true);
    this.flowers = mk(new THREE.IcosahedronGeometry(0.09, 0).translate(0, 0.2, 0), mats.flat, 60);
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(SIZE, 3, SIZE), mats.hit);
    this.hit.position.y = -1;
    this.group.add(this.hit);
  }

  private cellPos(i: number, jx = 0.5, jz = 0.5) {
    return [(i % SIZE) + jx - SIZE / 2, Math.floor(i / SIZE) + jz - SIZE / 2] as const;
  }

  setMap(map: Cell[]) {
    if (map.join() === this.map.join()) return;
    this.map = map;
    const sp: Diorama["spots"] = { trees: [], logs: [], reeds: [], pads: [], frog: [], water: [] };
    this.spots = sp;
    let maxDeep = 0;
    map.forEach((c, i) => {
      const [x, z] = this.cellPos(i);
      const top = topOf(c) + (c === Cell.Land ? hash(i) * 0.06 : 0);
      this.v.set(x, (BASE + top - CAP) / 2, z);
      this.s.set(1, top - CAP - BASE, 1);
      this.soil.setMatrixAt(i, this.m.compose(this.v, this.q.identity(), this.s));
      this.soil.setColorAt(i, (hash(i + 99) > 0.5 ? PAL.soil : PAL.soilDark));
      this.v.set(x, top - CAP / 2, z);
      this.s.set(1, CAP, 1);
      this.cap.setMatrixAt(i, this.m.compose(this.v, this.q, this.s));
      if (c === Cell.Tree) sp.trees.push(i);
      if (c === Cell.Log) sp.logs.push(i);
      if (c === Cell.Reeds) for (let k = 0; k < 5; k++) sp.reeds.push(i * 8 + k);
      if (c === Cell.Shallow || c === Cell.Reeds) { sp.pads.push(i); sp.frog.push(i); }
      if (isWater(c)) sp.water.push(i);
      const d = Math.hypot(x, z * 1.15);
      if (c === Cell.Land && d < 6.4) sp.frog.push(i);
      if (c === Cell.Deep) maxDeep = Math.max(maxDeep, d);
    });
    this.pondR = Math.max(1.5, maxDeep - 0.4);
    this.decor = { tufts: [], flowers: [] };
    map.forEach((c, i) => {
      if (c !== Cell.Land) return;
      if (hash(i * 13) < 0.2 && this.decor.tufts.length < 90) this.decor.tufts.push(i);
      else if (hash(i * 17) < 0.14 && this.decor.flowers.length < 60) this.decor.flowers.push(i);
    });
    const FLOWER = ['#f7a6c4', '#ffd84a', '#ffffff', '#c8a2ff'].map((h) => C(h));
    this.decor.flowers.forEach((i, k) => this.flowers.setColorAt(k, FLOWER[Math.floor(hash(i * 5) * 4)]));
    if (this.flowers.instanceColor) this.flowers.instanceColor.needsUpdate = true;
    this.soil.count = this.cap.count = map.length;
    this.soil.instanceMatrix.needsUpdate = this.cap.instanceMatrix.needsUpdate = true;
    if (this.soil.instanceColor) this.soil.instanceColor.needsUpdate = true;
  }

  update(view: DioramaView, time: number) {
    this.setMap(view.map);
    const { snap: s, seasonF, appear } = view;
    const si = Math.floor(seasonF) % 4;
    const blend = smooth(0.75, 1, seasonF - Math.floor(seasonF));
    const next = (si + 1) % 4;
    const winter = si === 3 ? 1 - blend : si === 2 ? blend : 0;
    const warm = 1 - winter;
    const tsec = time / 1000;

    // tiles
    this.map.forEach((c, i) => {
      if (isWater(c)) this.cap.setColorAt(i, c === Cell.Deep ? PAL.bed : PAL.sand);
      else {
        const pal = hash(i * 3) > 0.5 ? PAL.land : PAL.land2;
        this.cap.setColorAt(i, this.col.copy(pal[si]).lerp(pal[next], blend));
      }
    });
    this.cap.instanceColor!.needsUpdate = true;

    // decoration: grass tufts all year, flowers in spring and summer
    this.tufts.count = this.decor.tufts.length;
    this.decor.tufts.forEach((i, k) => {
      const [x, z] = this.cellPos(i, 0.25 + hash(i) * 0.5, 0.25 + hash(i + 1) * 0.5);
      const sc = (0.8 + hash(i + 2) * 0.6) * (1 - 0.4 * winter);
      this.v.set(x, hash(i) * 0.06, z);
      this.tufts.setMatrixAt(k, this.m.compose(this.v, this.q.setFromEuler(this.e.set(0, i, Math.sin(tsec + i) * 0.06)), this.s.set(sc, sc, sc)));
    });
    this.tufts.instanceMatrix.needsUpdate = true;
    const bloom = si === 0 || si === 1 ? 1 - (si === 1 ? blend : 0) : si === 3 ? blend : 0;
    this.flowers.count = this.decor.flowers.length;
    this.decor.flowers.forEach((i, k) => {
      const [x, z] = this.cellPos(i, 0.3 + hash(i) * 0.4, 0.3 + hash(i + 3) * 0.4);
      const sc = Math.max(0.001, bloom) * (0.8 + hash(i + 4) * 0.5);
      this.v.set(x, hash(i) * 0.06, z);
      this.flowers.setMatrixAt(k, this.m.compose(this.v, this.q.identity(), this.s.set(sc, sc, sc)));
    });
    this.flowers.instanceMatrix.needsUpdate = true;

    // water: greens with algae, shallow cells dry up into mud
    const waterCol = this.col.copy(PAL.waterClear).lerp(PAL.waterAlgae, Math.min(1, s.algae * 1.15));
    let w = 0;
    for (const i of this.spots.water) {
      const c = this.map[i];
      const shallow = c !== Cell.Deep;
      const dryHere = shallow && hash(i * 7) < s.shallowDry * 1.15;
      if (dryHere) { this.cap.setColorAt(i, PAL.mud); continue; }
      const [x, z] = this.cellPos(i);
      const floor = topOf(c);
      const bob = Math.sin(tsec * 1.3 + i) * 0.006;
      this.v.set(x, (floor + WATER_TOP) / 2 + bob, z);
      this.s.set(1.001, WATER_TOP - floor, 1.001);
      this.water.setMatrixAt(w, this.m.compose(this.v, this.q.identity(), this.s));
      this.water.setColorAt(w, winter > 0.6 ? this.col.clone().lerp(C('#dfeef5'), 0.5) : waterCol);
      w++;
    }
    this.water.count = w;
    this.water.instanceMatrix.needsUpdate = true;
    if (this.water.instanceColor) this.water.instanceColor.needsUpdate = true;

    // trees (shade action): pop in, autumn colours, bare in winter
    const ta = easeOutBack(appear.shade);
    this.trunks.count = this.crowns.count = Math.min(MAX.trees, this.spots.trees.length);
    this.spots.trees.slice(0, MAX.trees).forEach((i, k) => {
      const [x, z] = this.cellPos(i, 0.3 + hash(i) * 0.4, 0.3 + hash(i + 5) * 0.4);
      const sc = ta * (0.8 + hash(i + 9) * 0.5);
      this.v.set(x, 0, z);
      this.trunks.setMatrixAt(k, this.m.compose(this.v, this.q.identity(), this.s.set(sc, sc * 1.3, sc)));
      const sway = Math.sin(tsec * 0.8 + i) * 0.04;
      this.v.set(x + sway, 0.72 * sc * 1.3, z);
      const crown = sc * (1 - 0.35 * winter);
      this.crowns.setMatrixAt(k, this.m.compose(this.v, this.q.setFromEuler(this.e.set(0, i, 0)), this.s.set(crown, crown * 1.1, crown)));
      this.crowns.setColorAt(k, this.col.copy(PAL.crown[si]).lerp(PAL.crown[next], blend));
    });
    this.trunks.instanceMatrix.needsUpdate = this.crowns.instanceMatrix.needsUpdate = true;
    if (this.crowns.instanceColor) this.crowns.instanceColor.needsUpdate = true;

    // logs
    const la = easeOutBack(appear.logs);
    this.logs.count = Math.min(MAX.logs, this.spots.logs.length);
    this.spots.logs.slice(0, MAX.logs).forEach((i, k) => {
      const [x, z] = this.cellPos(i);
      this.v.set(x, 0.1 + (1 - Math.min(1, appear.logs)) * 1.5, z);
      this.logs.setMatrixAt(k, this.m.compose(this.v, this.q.setFromEuler(this.e.set(0, hash(i) * Math.PI, 0)), this.s.set(la, la, la)));
    });
    this.logs.instanceMatrix.needsUpdate = true;

    // reeds and lily pads follow plant cover
    const fill = s.plantCap > 0 ? Math.min(1, s.plants / Math.max(0.05, s.plantCap)) : 0;
    const ra = easeOutBack(appear.reeds);
    let r = 0;
    for (const code of this.spots.reeds) {
      const i = code >> 3, k = code & 7;
      if (r >= MAX.reeds) break;
      const [x, z] = this.cellPos(i, 0.15 + hash(code) * 0.7, 0.15 + hash(code + 3) * 0.7);
      const h = ra * (0.35 + 0.75 * fill) * (0.7 + hash(code + 1) * 0.6) * (1 - 0.45 * winter);
      if (h < 0.02) continue;
      this.v.set(x, topOf(Cell.Reeds), z);
      this.e.set(Math.sin(tsec * 1.6 + code) * 0.08, 0, Math.cos(tsec * 1.3 + k) * 0.08);
      this.reeds.setMatrixAt(r++, this.m.compose(this.v, this.q.setFromEuler(this.e), this.s.set(1, h, 1)));
    }
    this.reeds.count = r;
    this.reeds.instanceMatrix.needsUpdate = true;

    const padsN = Math.min(this.spots.pads.length, MAX.pads, Math.round(s.plants * 140 * warm + 2));
    this.pads.count = padsN;
    for (let k = 0; k < padsN; k++) {
      const i = this.spots.pads[Math.floor(hash(k * 13 + 1) * this.spots.pads.length)];
      if (hash(i * 7) < s.shallowDry * 1.15) { this.v.set(0, -5, 0); this.pads.setMatrixAt(k, this.m.compose(this.v, this.q, this.s.set(0, 0, 0))); continue; }
      const [x, z] = this.cellPos(i, 0.2 + hash(k * 3) * 0.6, 0.2 + hash(k * 5) * 0.6);
      const sc = 0.7 + hash(k) * 0.6;
      this.v.set(x, WATER_TOP + 0.015, z);
      this.pads.setMatrixAt(k, this.m.compose(this.v, this.q.identity(), this.s.set(sc, 1, sc)));
    }
    this.pads.instanceMatrix.needsUpdate = true;

    // fish swim loops inside the deep water
    const fishN = Math.min(MAX.fish, Math.round(s.fish / 1.6));
    this.fish.count = fishN;
    for (let k = 0; k < fishN; k++) {
      const rad = 0.6 + hash(k * 7) * (this.pondR - 0.6);
      const dir = hash(k) > 0.5 ? 1 : -1;
      const a = hash(k * 3) * Math.PI * 2 + dir * tsec * (0.25 + hash(k * 11) * 0.35);
      this.v.set(Math.cos(a) * rad, -0.55 - hash(k * 5) * 0.25, (Math.sin(a) * rad) / 1.15);
      this.e.set(0, -a - (dir * Math.PI) / 2 + (dir < 0 ? Math.PI : 0), 0);
      this.fish.setMatrixAt(k, this.m.compose(this.v, this.q.setFromEuler(this.e), this.s.set(1, 1, 1)));
    }
    this.fish.instanceMatrix.needsUpdate = true;

    // frogs sit around the edge and hop now and then
    const frogN = Math.min(MAX.frogs, Math.round(s.frogs / 1.8), this.spots.frog.length * 3);
    this.frogs.count = frogN;
    for (let k = 0; k < frogN; k++) {
      const i = this.spots.frog[Math.floor(hash(k * 17 + 3) * this.spots.frog.length)];
      const [x, z] = this.cellPos(i, 0.2 + hash(k * 7) * 0.6, 0.2 + hash(k * 13) * 0.6);
      const onWater = isWater(this.map[i]);
      const hopPhase = (tsec * 0.7 + hash(k * 29) * 10) % 3;
      const hop = warm > 0.5 && hopPhase < 0.35 ? Math.sin((hopPhase / 0.35) * Math.PI) * 0.35 : 0;
      this.v.set(x, (onWater ? WATER_TOP + 0.08 : 0.08) + hop, z);
      const sc = 0.85 + hash(k) * 0.4;
      this.frogs.setMatrixAt(k, this.m.compose(this.v, this.q.setFromEuler(this.e.set(0, hash(k * 31) * Math.PI * 2, 0)), this.s.set(sc, sc, sc)));
    }
    this.frogs.instanceMatrix.needsUpdate = true;

    // dragonflies patrol over the plants in warm seasons
    const flyN = Math.min(MAX.flies, Math.round(s.dragonflies * warm));
    this.flies.count = flyN;
    for (let k = 0; k < flyN; k++) {
      const rad = this.pondR + 0.3 + hash(k * 3) * 1.2;
      const a = hash(k) * 6.28 + tsec * (0.5 + hash(k * 5) * 0.6);
      this.v.set(Math.cos(a) * rad, 0.9 + Math.sin(tsec * 2 + k) * 0.25 + hash(k * 7) * 0.6, (Math.sin(a) * rad) / 1.15);
      this.flies.setMatrixAt(k, this.m.compose(this.v, this.q.setFromEuler(this.e.set(0, -a, Math.sin(tsec * 30 + k) * 0.15)), this.s.set(1, 1, 1)));
    }
    this.flies.instanceMatrix.needsUpdate = true;

    // mosquitoes: a jittery cloud over the water
    const mN = Math.min(MAX.mosq, Math.round((s.mosquito / 1.4) * (0.3 + 0.7 * warm)));
    this.mosq.count = mN;
    for (let k = 0; k < mN; k++) {
      const i = this.spots.water[Math.floor(hash(k * 41 + 9) * this.spots.water.length)];
      const [x, z] = this.cellPos(i, hash(k * 3), hash(k * 19));
      this.v.set(x + Math.sin(tsec * 5 + k) * 0.15, 0.25 + hash(k) * 0.7 + Math.sin(tsec * 7 + k * 2) * 0.08, z + Math.cos(tsec * 6 + k) * 0.15);
      this.mosq.setMatrixAt(k, this.m.compose(this.v, this.q.identity(), this.s.set(1, 1, 1)));
    }
    this.mosq.instanceMatrix.needsUpdate = true;
  }
}

interface Mats {
  flat: THREE.Material; vcol: THREE.Material; water: THREE.Material; log: THREE.Material; reed: THREE.Material;
  pad: THREE.Material; mosq: THREE.Material; hit: THREE.Material; tuft: THREE.Material;
}

export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  readonly worlds: Diorama[];
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private snow: THREE.Points;
  private ray = new THREE.Raycaster();
  private portrait = false;
  /** Screen padding (px) kept free for the HUD. */
  pad = { top: 80, bottom: 190, side: 12 };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = PAL.sky[0].clone();

    this.hemi = new THREE.HemisphereLight('#ffffff', '#6b7a5a', 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.2);
    this.sun.position.set(14, 26, 8);
    this.sun.castShadow = true;
    const small = Math.min(innerWidth, innerHeight) < 600;
    this.sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(this.sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
    const mats: Mats = {
      flat: std({ color: '#ffffff' }),
      vcol: std({ vertexColors: true, roughness: 0.7 }),
      water: std({ color: '#ffffff', transparent: true, opacity: 0.78, roughness: 0.25 }),
      log: std({ color: '#86603f' }),
      reed: std({ color: '#4c9a4a' }),
      pad: std({ color: '#5fae4c' }),
      tuft: std({ color: '#5a9c3e' }),
      mosq: new THREE.MeshBasicMaterial({ color: '#2b2b2b' }),
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    };
    this.worlds = [new Diorama(mats), new Diorama(mats)];
    for (const w of this.worlds) this.scene.add(w.group);

    const snowGeo = new THREE.BufferGeometry();
    const pts = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) pts.set([(hash(i) - 0.5) * 60, hash(i + 1) * 14, (hash(i + 2) - 0.5) * 60], i * 3);
    snowGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, transparent: true, opacity: 0 }));
    this.scene.add(this.snow);
    this.resize();
  }

  /** Place the islands side by side (landscape) or stacked (portrait) and fit the camera. */
  resize() {
    const W = this.renderer.domElement.clientWidth || innerWidth;
    const H = this.renderer.domElement.clientHeight || innerHeight;
    this.renderer.setSize(W, H, false);
    this.portrait = H > W * 1.05;
    const gap = this.portrait ? 21 : 11.5;
    const across = new THREE.Vector3(1, 0, -1).normalize();
    const depth = new THREE.Vector3(1, 0, 1).normalize();
    const off = this.portrait ? depth.multiplyScalar(gap) : across.multiplyScalar(gap);
    this.worlds[0].group.position.copy(off).multiplyScalar(-1);
    this.worlds[1].group.position.copy(off);

    this.camera.position.set(30, 30, 30);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, -1, 0);
    this.camera.updateMatrixWorld();
    // project island corners into camera space and fit them into the free screen area
    const inv = this.camera.matrixWorldInverse;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const p = new THREE.Vector3();
    for (const w of this.worlds)
      for (const x of [-SIZE / 2, SIZE / 2]) for (const z of [-SIZE / 2, SIZE / 2]) for (const y of [BASE, 1.6]) {
        p.set(x, y, z).add(w.group.position).applyMatrix4(inv);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
    const aw = W - this.pad.side * 2, ah = Math.max(120, H - this.pad.top - this.pad.bottom);
    const scale = Math.min(aw / (maxX - minX), ah / (maxY - minY));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const yTop = cy + (this.pad.top + ah / 2) / scale;
    Object.assign(this.camera, { left: cx - W / 2 / scale, right: cx + W / 2 / scale, top: yTop, bottom: yTop - H / scale });
    this.camera.updateProjectionMatrix();
  }

  get isPortrait() { return this.portrait; }

  /** Screen position (px) of a point on island wi, in island-local coordinates. */
  toScreen(wi: number, x: number, y: number, z: number) {
    const p = new THREE.Vector3(x, y, z).add(this.worlds[wi].group.position).project(this.camera);
    const el = this.renderer.domElement;
    return { x: ((p.x + 1) / 2) * el.clientWidth, y: ((1 - p.y) / 2) * el.clientHeight };
  }

  /** Which island (0/1) is under a screen point, or -1. */
  pick(px: number, py: number): number {
    const el = this.renderer.domElement;
    const ndc = new THREE.Vector2((px / el.clientWidth) * 2 - 1, -(py / el.clientHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObjects(this.worlds.map((w) => w.hit), false)[0];
    return hit ? this.worlds.findIndex((w) => w.hit === hit.object) : -1;
  }

  render(views: DioramaView[], time: number) {
    const f = views[0].seasonF;
    const si = Math.floor(f) % 4;
    const blend = smooth(0.75, 1, f - Math.floor(f));
    (this.scene.background as THREE.Color).copy(PAL.sky[si]).lerp(PAL.sky[(si + 1) % 4], blend);
    const winter = si === 3 ? 1 - blend : si === 2 ? blend : 0;
    this.sun.intensity = 2.2 - 0.7 * winter;
    const mat = this.snow.material as THREE.PointsMaterial;
    mat.opacity = 0.9 * winter;
    this.snow.visible = winter > 0.02;
    if (this.snow.visible) {
      const pos = this.snow.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setY(i, 14 - (((time / 1000) * (0.8 + hash(i) * 0.6) + hash(i + 1) * 14) % 16));
      pos.needsUpdate = true;
    }
    views.forEach((v, i) => this.worlds[i].update(v, time));
    this.renderer.render(this.scene, this.camera);
  }
}
