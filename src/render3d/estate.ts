// The island estate around the village, in 3D: every plot of the island map (core/island.ts), the
// buildings on them, and the staff doing their jobs. The village diorama sits on the home plot, so the
// main screen can zoom from the village out to the whole business.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILDINGS_BY_ID, COLS, HOME, ROWS, buildingAt, canExpand, staffAt, terrain, type Staff, type Terrain } from '../core/island';
import type { GameState } from '../core/state';
import { discard, makeBuilding, makeFish, makePalm, makeSaltPile, makeWorker, mesh, outline, toon } from './models';

/** World units per plot. The village diorama (about 9 × 14 units) fills the home plot. */
export const PLOT = 14;
const BLOCK = PLOT - 3; // leaves canals of water between plots
const homeCol = HOME % COLS;
const homeRow = Math.floor(HOME / COLS);

export function plotCenter(tile: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(((tile % COLS) - homeCol) * PLOT, 0, (Math.floor(tile / COLS) - homeRow) * PLOT);
}

/** The middle of the whole island, for the overview camera. */
export const ISLAND_CENTER = new THREE.Vector3(((COLS - 1) / 2 - homeCol) * PLOT, 0, ((ROWS - 1) / 2 - homeRow) * PLOT);

const GROUND: Record<Terrain, string> = { '~': '#2aa3b9', b: '#f0d9a6', c: '#f0d9a6', s: '#f4f1e6', p: '#e8cf94', g: '#8cc265', f: '#79b358', H: '#8cc265', t: '#8cc265', w: '#8cc265' };
const FOG: Record<Terrain, string> = { '~': '#2aa3b9', b: '#d9cfb6', c: '#d9cfb6', s: '#d9cfb6', p: '#d9cfb6', g: '#a3b59a', f: '#97ad8f', H: '#a3b59a', t: '#a3b59a', w: '#a3b59a' };

const CLOUD_GEO = new THREE.SphereGeometry(1, 12, 8);
const CLOUD_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
const FOG_CLOUD_MAT = new THREE.MeshLambertMaterial({ color: 0xe6edf0, transparent: true, opacity: 0.95 });

/**
 * Bakes a static group into one mesh per material: the whole island costs a handful of draw calls
 * instead of hundreds (weak phones). Outline hulls share one material, so they merge too.
 */
function mergeStatic(src: THREE.Object3D): THREE.Group {
  src.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    let g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (g.index) {
      const ni = g.toNonIndexed();
      g.dispose();
      g = ni;
    }
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    const list = byMat.get(m.material) ?? [];
    list.push(g);
    byMat.set(m.material, list);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mm = new THREE.Mesh(merged, mat);
    mm.receiveShadow = true;
    mm.userData.outline = false;
    out.add(mm);
  }
  discard(src);
  return out;
}

interface CloudPuff {
  base: THREE.Vector3;
  scale: THREE.Vector3;
}

interface WorkerView {
  uid: number;
  role: Staff['role'];
  group: THREE.Group;
  base: THREE.Vector3;
  phase: number;
  rod?: THREE.Object3D;
}

interface Walker {
  group: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  speed: number;
}

/** Something a worker just made, for the 2D layer to show as floating text. */
export interface EstateEvent {
  pos: THREE.Vector3;
  text: string;
  color: string;
}

export class Estate {
  root = new THREE.Group();
  private ground = new THREE.Group();
  private builds = new THREE.Group();
  private people = new THREE.Group();
  private clouds: { mesh: THREE.InstancedMesh; puffs: CloudPuff[] }[] = [];
  private workers: WorkerView[] = [];
  private walkers: Walker[] = [];
  private leaps: { fish: THREE.Group; from: THREE.Vector3; t: number }[] = [];
  private landKey = '';
  private buildKey = '';
  private staffKey = '';
  private made = { fish: -1, salt: -1, jars: -1, bottles: -1, coins: -1 };
  events: EstateEvent[] = [];
  /** Lower-cost mode for weak devices: fewer clouds and walkers. */
  lite = false;

  constructor() {
    // open sea under everything (the village keeps its own animated water near the camera)
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), toon('#2a9fb6'));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(ISLAND_CENTER.x, -0.32, ISLAND_CENTER.z);
    this.root.add(sea, this.ground, this.builds, this.people);
  }

  sync(s: GameState, t: number, dt: number): void {
    this.rebuildLand(s);
    this.rebuildBuildings(s);
    this.rebuildStaff(s);
    this.animate(s, t, dt);
    this.watchOutput(s);
  }

  // ---------- Land ----------
  private rebuildLand(s: GameState): void {
    const key = `${s.island.owned.join(',')}|${s.island.buildings.map((b) => b.tile).join(',')}|${this.lite}`;
    if (key === this.landKey) return;
    this.landKey = key;
    for (const c of [...this.ground.children]) discard(c);
    this.clouds = [];
    const raw = new THREE.Group();
    const nearPuffs: CloudPuff[] = [];
    const farPuffs: CloudPuff[] = [];
    const owned = new Set(s.island.owned);
    const p = new THREE.Vector3();
    for (let tile = 0; tile < COLS * ROWS; tile++) {
      const t = terrain(tile);
      if (t === '~' || tile === HOME) continue;
      plotCenter(tile, p);
      const mine = owned.has(tile);
      const near = !mine && canExpand(s, tile);
      if (mine || near) {
        const block = mesh(new THREE.BoxGeometry(BLOCK, 0.7, BLOCK), toon(mine ? GROUND[t] : FOG[t]), false);
        block.position.set(p.x, -0.2, p.z);
        raw.add(block);
      }
      // a sandy rim on shore plots
      if ((mine || near) && (t === 'b' || t === 'c' || t === 's' || t === 'p')) {
        const rim = mesh(new THREE.BoxGeometry(BLOCK + 1, 0.4, BLOCK + 1), toon(mine ? '#e9cf8f' : '#cfc6ae'), false);
        rim.position.set(p.x, -0.3, p.z);
        raw.add(rim);
      }
      if (!mine) {
        // unexplored plots sit under cloud: buying one clears it
        // plots next to yours show their land through thin cloud; farther ones are a sea of cloud
        const n = this.lite ? 2 : near ? 3 : 5;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + tile;
          const r = near ? 2.8 : 3.4;
          (near ? nearPuffs : farPuffs).push({
            base: new THREE.Vector3(p.x + Math.cos(a) * r, (near ? 1.6 : 2.4) + (k % 2) * 0.9, p.z + Math.sin(a) * r),
            scale: new THREE.Vector3(near ? 3 : 4.4, near ? 1.4 : 2.2, near ? 2.4 : 3.8),
          });
        }
        continue;
      }
      if (!buildingAt(s, tile)) this.decorate(s, tile, t, p, raw);
    }
    // clouds are instanced: two draw calls for the whole sky of undiscovered plots
    for (const [puffs, mat] of [
      [nearPuffs, CLOUD_MAT],
      [farPuffs, FOG_CLOUD_MAT],
    ] as const) {
      if (!puffs.length) continue;
      const im = new THREE.InstancedMesh(CLOUD_GEO, mat, puffs.length);
      im.userData.sharedGeo = true;
      this.ground.add(im);
      this.clouds.push({ mesh: im, puffs });
    }
    // little bridges join the plots you own (and the village)
    const ownedAll = [...owned];
    for (const a of ownedAll)
      for (const [dc, dr] of [
        [1, 0],
        [0, 1],
      ]) {
        const c = (a % COLS) + dc;
        const r = Math.floor(a / COLS) + dr;
        if (c >= COLS || r >= ROWS) continue;
        const b = r * COLS + c;
        if (!ownedAll.includes(b) || a === HOME || b === HOME) continue;
        const pa = plotCenter(a);
        const pb = plotCenter(b);
        const bridge = mesh(new THREE.BoxGeometry(dc ? 4.2 : 1.6, 0.18, dc ? 1.6 : 4.2), toon('#a57a48'), false);
        outline(bridge, 1.04);
        bridge.position.set((pa.x + pb.x) / 2, 0.12, (pa.z + pb.z) / 2);
        raw.add(bridge);
      }
    this.ground.add(mergeStatic(raw));
  }

  /** Scenery on owned plots without a building: palms, salt pans, a pier. */
  private decorate(s: GameState, tile: number, t: Terrain, p: THREE.Vector3, into: THREE.Group): void {
    if (t === 'f' || (t === 'g' && tile % 3 === 0)) {
      const n = t === 'f' ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const palm = makePalm(2.2 + (k % 2) * 0.5);
        palm.scale.setScalar(1.6);
        palm.position.set(p.x - 3.5 + k * 3.4, 0.15, p.z - 3 + (k % 2) * 2.5);
        palm.userData.deco = tile;
        into.add(palm);
      }
    }
    if (t === 'g' || t === 'w' || t === 't') {
      // flowers and bushes so empty land looks alive (and ready to build on)
      const colors = ['#f28aa0', '#f2c14e', '#ffffff', '#c9a0ff'];
      for (let k = 0; k < 5; k++) {
        const a = tile * 2.3 + k * 1.9;
        const bush = mesh(new THREE.SphereGeometry(k % 2 ? 0.45 : 0.3, 8, 6), toon(k % 2 ? '#5fae52' : colors[(tile + k) % colors.length]), false);
        bush.position.set(p.x + Math.cos(a) * 4, 0.3, p.z + Math.sin(a) * 4);
        bush.userData.deco = tile;
        into.add(bush);
      }
    }
    if (t === 's') {
      for (let k = 0; k < 4; k++) {
        const pan = mesh(new THREE.BoxGeometry(3.6, 0.06, 3.6), toon(k % 3 ? '#bfe4ee' : '#e8f4f8'), false);
        pan.position.set(p.x - 2.1 + (k % 2) * 4.2, 0.17, p.z - 2.1 + Math.floor(k / 2) * 4.2);
        pan.userData.deco = tile;
        into.add(pan);
      }
    }
    if (t === 'p') {
      for (let k = 0; k < 5; k++) {
        const plank = mesh(new THREE.BoxGeometry(1.1, 0.16, 6), toon(k % 2 ? '#a57a48' : '#8f6638'));
        plank.position.set(p.x - 2.4 + k * 1.2, 0.2, p.z + 4);
        plank.userData.deco = tile;
        into.add(plank);
      }
    }
    void s;
  }

  // ---------- Buildings ----------
  private rebuildBuildings(s: GameState): void {
    const key = s.island.buildings.map((b) => `${b.tile}:${b.id}:${b.level}`).join(',');
    if (key === this.buildKey) return;
    this.buildKey = key;
    for (const c of [...this.builds.children]) discard(c);
    const raw = new THREE.Group();
    const p = new THREE.Vector3();
    for (const b of s.island.buildings) {
      plotCenter(b.tile, p);
      const g = makeBuilding(b.id, b.level);
      g.scale.setScalar(BUILDINGS_BY_ID[b.id].charm ? 4 : 5.2);
      g.position.set(p.x, 0.2, p.z - 0.8);
      g.userData.tile = b.tile;
      raw.add(g);
    }
    this.builds.add(mergeStatic(raw));
  }

  // ---------- Staff ----------
  private rebuildStaff(s: GameState): void {
    const shopLevel = Math.max(0, ...s.island.buildings.filter((b) => b.id === 'shop').map((b) => b.level));
    const key = `${s.island.staff.map((x) => `${x.uid}:${x.tile}:${x.level}`).join(',')}|${shopLevel}|${this.lite}`;
    if (key === this.staffKey) return;
    this.staffKey = key;
    for (const c of [...this.people.children]) discard(c);
    this.workers = [];
    this.walkers = [];
    const p = new THREE.Vector3();
    for (const b of s.island.buildings) {
      const team = staffAt(s, b.tile);
      plotCenter(b.tile, p);
      team.forEach((st, i) => {
        const g = mergeStatic(makeWorker(st.role));
        g.scale.setScalar(2.3);
        const base = new THREE.Vector3(p.x - 2.5 + i * 2.5, 0.2, p.z + 3.4);
        if (st.role === 'fisher') base.set(p.x - 2 + i * 2, 0.45, p.z + 4.6); // on the edge of the dock, facing the sea
        g.position.copy(base);
        this.people.add(g);
        const view: WorkerView = { uid: st.uid, role: st.role, group: g, base, phase: i * 1.7 + b.tile };
        if (st.role === 'fisher') {
          // a long rod and line out over the water
          const rod = mesh(new THREE.CylinderGeometry(0.03, 0.05, 2.6, 6), toon('#c9a66b'), false);
          rod.position.set(0.5, 1.0, 0.6);
          rod.rotation.x = 1.0;
          g.add(rod);
          view.rod = rod;
        }
        this.workers.push(view);
      });
    }
    // customers stroll from the village to the shop (more with a bigger shop)
    const shop = s.island.buildings.find((b) => b.id === 'shop');
    if (shop) {
      const n = this.lite ? 1 : Math.min(5, 1 + shopLevel + (staffAt(s, shop.tile).length ? 1 : 0));
      const to = plotCenter(shop.tile).add(new THREE.Vector3(0, 0.2, 3));
      const shirts = ['#5aa0d8', '#c0603e', '#7fd18b', '#a35bd6', '#f2c14e'];
      for (let i = 0; i < n; i++) {
        const g = mergeStatic(makeWorker('customer', shirts[i % shirts.length]));
        g.scale.setScalar(2);
        this.people.add(g);
        this.walkers.push({ group: g, from: new THREE.Vector3(1.5 + i * 0.6, 0.2, 5.5), to, t: i / n, speed: 0.06 + (i % 3) * 0.015 });
      }
    }
  }

  private animate(s: GameState, t: number, dt: number): void {
    const mtx = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (const c of this.clouds) {
      c.puffs.forEach((pf, i) => {
        pos.set(pf.base.x + Math.sin(t * 0.2 + pf.base.z) * 0.6, pf.base.y + Math.sin(t * 0.6 + pf.base.x) * 0.25, pf.base.z);
        c.mesh.setMatrixAt(i, mtx.compose(pos, q, pf.scale));
      });
      c.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const w of this.workers) {
      const ph = t + w.phase;
      const g = w.group;
      if (w.role === 'fisher') {
        g.rotation.y = Math.PI * 0.05;
        if (w.rod) w.rod.rotation.x = 1.0 + Math.sin(ph * 1.3) * 0.12;
        g.position.y = w.base.y + Math.abs(Math.sin(ph * 0.9)) * 0.05;
      } else if (w.role === 'salter') {
        // raking back and forth across the pans
        const x = Math.sin(ph * 0.45) * 3.2;
        g.position.set(w.base.x + x, w.base.y + Math.abs(Math.sin(ph * 4)) * 0.12, w.base.z - 1.5);
        g.rotation.y = Math.cos(ph * 0.45) > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else if (w.role === 'brewer') {
        // walks a loop around the barrels, pausing to stir
        const a = ph * 0.35;
        const stir = Math.sin(a * 2) > 0.6;
        g.position.set(w.base.x + Math.cos(a) * 2.2, w.base.y + (stir ? 0 : Math.abs(Math.sin(ph * 4)) * 0.12), w.base.z - 1 + Math.sin(a) * 1.2);
        g.rotation.y = stir ? Math.sin(ph * 6) * 0.3 : -a;
      } else {
        // the shopkeeper waves at passers-by
        g.rotation.y = Math.sin(ph * 0.8) * 0.5;
        g.position.y = w.base.y + Math.abs(Math.sin(ph * 2.2)) * 0.08;
      }
    }
    for (const w of this.walkers) {
      w.t = (w.t + dt * w.speed) % 1;
      // there and back again: 0..0.45 walk, 0.45..0.55 shop, 0.55..1 walk home
      const k = w.t < 0.45 ? w.t / 0.45 : w.t < 0.55 ? 1 : 1 - (w.t - 0.55) / 0.45;
      const p = w.from.clone().lerp(w.to, k);
      const walking = w.t < 0.45 || w.t >= 0.55;
      w.group.position.set(p.x, p.y + (walking ? Math.abs(Math.sin(t * 7 + w.speed * 50)) * 0.15 : 0), p.z);
      const dir = w.to.clone().sub(w.from);
      w.group.rotation.y = Math.atan2(dir.x, dir.z) + (w.t >= 0.55 ? Math.PI : 0);
    }
    this.leaps = this.leaps.filter((l) => {
      l.t += dt / 0.9;
      const k = Math.min(1, l.t);
      l.fish.position.set(l.from.x, l.from.y + Math.sin(k * Math.PI) * 3, l.from.z + 3 - k * 3);
      l.fish.rotation.z = (k - 0.5) * 3;
      if (l.t >= 1) {
        discard(l.fish);
        return false;
      }
      return true;
    });
    void s;
  }

  /** Turns staff output into visible moments: a fish leaps up to the fisher, numbers float up. */
  private watchOutput(s: GameState): void {
    const m = s.island.made;
    const first = this.made.fish < 0;
    const d = { fish: m.fish - this.made.fish, salt: m.salt - this.made.salt, jars: m.jars - this.made.jars, coins: m.coins - this.made.coins };
    this.made = { ...m };
    if (first) return;
    const at = (role: Staff['role']) => this.workers.find((w) => w.role === role)?.group.position.clone();
    if (d.fish > 0) {
      const p = at('fisher');
      if (p) {
        const fish = makeFish('anchovy').group;
        fish.scale.setScalar(1.4);
        this.people.add(fish);
        this.leaps.push({ fish, from: p.clone(), t: 0 });
        this.events.push({ pos: p.clone().setY(4), text: `+${d.fish} fish`, color: '#bfe9f2' });
      }
    }
    if (d.salt > 0) {
      const p = at('salter');
      if (p) {
        const pile = makeSaltPile();
        pile.scale.setScalar(1.5);
        pile.position.copy(p).add(new THREE.Vector3(0, 0, 1));
        this.people.add(pile);
        setTimeout(() => discard(pile), 1200);
        this.events.push({ pos: p.clone().setY(4), text: `+${d.salt} salt`, color: '#ffffff' });
      }
    }
    if (d.jars > 0) {
      const p = at('brewer');
      if (p) this.events.push({ pos: p.clone().setY(4), text: `+${d.jars} jar`, color: '#e8b07a' });
    }
    if (d.coins > 0) {
      const p = at('seller');
      if (p) this.events.push({ pos: p.clone().setY(4), text: `+${d.coins}`, color: '#f2c14e' });
    }
  }

  /** The part of the island worth looking at: what you own plus the plots you can buy next. */
  focus(s: GameState): { center: THREE.Vector3; width: number; depth: number } {
    const tiles = [HOME, ...s.island.owned];
    for (let t = 0; t < COLS * ROWS; t++) if (canExpand(s, t)) tiles.push(t);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const p = new THREE.Vector3();
    for (const t of tiles) {
      plotCenter(t, p);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    return { center: new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2), width: maxX - minX + PLOT, depth: maxZ - minZ + PLOT };
  }

  /** World anchor for a plot's label: above its building, or just above the ground. */
  plotTop(s: GameState, tile: number): THREE.Vector3 {
    return plotCenter(tile).setY(buildingAt(s, tile) ? 10.5 : 2.5);
  }
}
