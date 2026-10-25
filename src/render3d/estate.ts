// The island estate around the village, in 3D: one continuous island (render3d/landmass.ts) with every
// plot of the map (core/island.ts), the buildings on them and the staff doing their jobs. The village
// diorama sits on the home plot, so the main screen can zoom from the village out to the whole business.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILDINGS_BY_ID, COLS, HOME, ROWS, buildingAt, canExpand, isLand, staffAt, terrain, type Staff, type Terrain } from '../core/island';
import type { GameState } from '../core/state';
import { COAST, PLOT, TOP, Terrain3D, disguise, flatShape, hash, offset, plotCenter, slab } from './landmass';
import { discard, makeBuilding, makeFish, makePalm, makeSaltPile, makeWorker, mesh, outline, toon } from './models';

export { PLOT, plotCenter };

/** Sea level on the main screen: below the beach, so the island reads as a thick diorama. */
export const SEA_Y = -0.9;

/** Plot colours when owned; unowned land is the same ground, wilder and darker. */
const GROUND: Record<Terrain, string> = { '~': '#2aa3b9', b: '#f2dca4', c: '#f2dca4', s: '#eef0e6', p: '#e8cf94', g: '#8cc265', f: '#79b358', H: '#93c86a', t: '#8cc265', w: '#8cc265' };
const WILD = new THREE.Color('#7d9a5c');
const SAND_WILD = new THREE.Color('#cdbf98');

/** Unit vector from a plot toward the open sea (zero for inland plots). */
export function seaDir(tile: number): THREE.Vector3 {
  const c = tile % COLS;
  const r = Math.floor(tile / COLS);
  const v = new THREE.Vector3();
  for (const [dc, dr] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]) {
    const nc = c + dc;
    const nr = r + dr;
    const land = nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && isLand(terrain(nr * COLS + nc));
    if (!land) v.add(new THREE.Vector3(dc, 0, dr));
  }
  return v.lengthSq() ? v.normalize() : v;
}

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
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
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

interface WorkerView {
  uid: number;
  role: Staff['role'];
  group: THREE.Group;
  base: THREE.Vector3;
  phase: number;
  /** Facing (radians) when standing still. */
  face: number;
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
  private props = new THREE.Group();
  private builds = new THREE.Group();
  private people = new THREE.Group();
  private terrain3d = new Terrain3D();
  private workers: WorkerView[] = [];
  private walkers: Walker[] = [];
  private leaps: { fish: THREE.Group; from: THREE.Vector3; t: number }[] = [];
  private landKey = '';
  private buildKey = '';
  private staffKey = '';
  private made = { fish: -1, salt: -1, jars: -1, bottles: -1, coins: -1 };
  events: EstateEvent[] = [];
  /** Lower-cost mode for weak devices: fewer props and walkers. */
  lite = false;

  constructor() {
    // open sea, lagoon shallows, beach ring, grass cliff and the painted top: one island
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), toon('#2a9fb6'));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, SEA_Y - 0.06, 40);
    const shallows = new THREE.Mesh(flatShape(offset(COAST, 10), SEA_Y + 0.04), new THREE.MeshBasicMaterial({ color: '#7fdbe0', transparent: true, opacity: 0.45, depthWrite: false }));
    const beach = mesh(slab(offset(COAST, 4), -0.15, 1.6), toon('#f0d9a6'), false);
    // only the cliff walls: its top cap would z-fight with the painted top
    const cliff = new THREE.Mesh(slab(COAST, TOP, 1.2), [new THREE.MeshBasicMaterial({ visible: false }), toon('#5f8f3c')]);
    const top = new THREE.Mesh(this.terrain3d.geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    top.receiveShadow = true;
    this.ground.add(sea, shallows, beach, cliff, top);
    // rocks along the shore (kept clear of the village dock)
    const rocks = new THREE.Group();
    const ring = offset(COAST, 3.2);
    ring.forEach((p, i) => {
      if (i % 9 !== 0 || hash(i) < 0.35) return;
      if (Math.abs(p.x) < 10 && p.y < 2) return; // keep the village's own shore clear
      const r = mesh(new THREE.DodecahedronGeometry(0.5 + hash(i + 1) * 0.9, 0), toon(hash(i + 2) < 0.5 ? '#9a958a' : '#b3ada1'), false);
      r.position.set(p.x, -0.1, p.y);
      r.rotation.set(hash(i + 3) * 3, hash(i + 4) * 3, 0);
      r.scale.y = 0.7;
      rocks.add(r);
    });
    this.ground.add(mergeStatic(rocks));
    this.root.add(this.ground, this.props, this.builds, this.people);
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
    const owned = new Set([...s.island.owned, HOME]);
    // paint: your land is bright; land for sale is a little wild; far land is wilder still
    this.terrain3d.paint((tile) => {
      const t = owned.has(tile) ? terrain(tile) : disguise(terrain(tile));
      const c = new THREE.Color(GROUND[t]);
      if (owned.has(tile)) return c;
      const sandy = t === 'b';
      return c.lerp(sandy ? SAND_WILD : WILD, canExpand(s, tile) ? 0.35 : 0.6);
    });
    for (const c of [...this.props.children]) discard(c);
    const raw = new THREE.Group();
    const p = new THREE.Vector3();
    for (let tile = 0; tile < COLS * ROWS; tile++) {
      const t = terrain(tile);
      if (t === '~' || tile === HOME) continue;
      plotCenter(tile, p);
      if (owned.has(tile)) {
        if (!buildingAt(s, tile)) this.decorate(tile, t, p, raw);
      } else this.wild(s, tile, disguise(t), p, raw);
    }
    this.fence(owned, raw);
    this.props.add(mergeStatic(raw));
  }

  /** Untamed land: palms, rocks and tall grass; plots you can buy get a little "for sale" sign. */
  private wild(s: GameState, tile: number, t: Terrain, p: THREE.Vector3, into: THREE.Group): void {
    const n = this.lite ? 2 : t === 'f' ? 5 : 3;
    for (let k = 0; k < n; k++) {
      const a = hash(tile * 9.1 + k) * Math.PI * 2;
      const r = 1.5 + hash(tile * 3.3 + k) * 4.5;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      const pick = hash(tile + k * 17);
      if (t !== 'b' && pick < 0.55) {
        const palm = makePalm(2 + hash(k + tile) * 0.8);
        palm.scale.setScalar(1.5);
        palm.position.set(x, TOP, z);
        palm.rotation.y = a;
        into.add(palm);
      } else if (pick < 0.8) {
        const rock = mesh(new THREE.DodecahedronGeometry(0.6 + hash(k) * 0.5, 0), toon('#a19b8f'), false);
        rock.position.set(x, TOP + 0.2, z);
        rock.scale.y = 0.6;
        into.add(rock);
      } else {
        const tuft = mesh(new THREE.ConeGeometry(0.5, 1.2, 5), toon(t === 'b' ? '#b5b06a' : '#4f7f3a'), false);
        tuft.position.set(x, TOP + 0.6, z);
        into.add(tuft);
      }
    }
    if (canExpand(s, tile)) {
      const post = mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6), toon('#8f6638'), false);
      post.position.set(p.x, TOP + 1.1, p.z + 2);
      const board = mesh(new THREE.BoxGeometry(2.4, 1.3, 0.16), toon('#f2dca4'));
      outline(board, 1.05);
      board.position.set(p.x, TOP + 2.2, p.z + 2.1);
      const coin = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 12), toon('#f2c14e', { emissive: '#5a4000' }), false);
      coin.rotation.x = Math.PI / 2;
      coin.position.set(p.x, TOP + 2.2, p.z + 2.22);
      into.add(post, board, coin);
    }
  }

  /** A low wooden fence along the edge of your land (where it meets land you don't own). */
  private fence(owned: Set<number>, into: THREE.Group): void {
    const half = PLOT / 2;
    const p = new THREE.Vector3();
    for (const tile of owned) {
      const c = tile % COLS;
      const r = Math.floor(tile / COLS);
      plotCenter(tile, p);
      for (const [dc, dr] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const nt = nr * COLS + nc;
        if (!isLand(terrain(nt)) || owned.has(nt)) continue;
        // the edge between the two plots
        const ex = p.x + dc * half;
        const ez = p.z + dr * half;
        const along = new THREE.Vector3(dr !== 0 ? 1 : 0, 0, dc !== 0 ? 1 : 0);
        for (let k = -3; k <= 3; k++) {
          const post = mesh(new THREE.BoxGeometry(0.22, 1, 0.22), toon('#a57a48'), false);
          post.position.set(ex + along.x * k * 2.1, TOP + 0.5, ez + along.z * k * 2.1);
          into.add(post);
        }
        for (const h of [0.45, 0.85]) {
          const rail = mesh(new THREE.BoxGeometry(along.x ? PLOT - 1 : 0.12, 0.12, along.z ? PLOT - 1 : 0.12), toon('#c49a62'), false);
          rail.position.set(ex, TOP + h, ez);
          into.add(rail);
        }
      }
    }
  }

  /** Scenery on owned plots without a building: palms, flowers, salt pans, a pier. */
  private decorate(tile: number, t: Terrain, p: THREE.Vector3, into: THREE.Group): void {
    if (t === 'f' || (t === 'g' && tile % 3 === 0)) {
      const n = t === 'f' ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const palm = makePalm(2.2 + (k % 2) * 0.5);
        palm.scale.setScalar(1.6);
        palm.position.set(p.x - 3.5 + k * 3.4, TOP, p.z - 3 + (k % 2) * 2.5);
        into.add(palm);
      }
    }
    if (t === 'g' || t === 'w' || t === 't') {
      // flowers and bushes so empty land looks alive (and ready to build on)
      const colors = ['#f28aa0', '#f2c14e', '#ffffff', '#c9a0ff'];
      for (let k = 0; k < 5; k++) {
        const a = tile * 2.3 + k * 1.9;
        const bush = mesh(new THREE.SphereGeometry(k % 2 ? 0.45 : 0.3, 8, 6), toon(k % 2 ? '#5fae52' : colors[(tile + k) % colors.length]), false);
        bush.position.set(p.x + Math.cos(a) * 4, TOP + 0.1, p.z + Math.sin(a) * 4);
        into.add(bush);
      }
    }
    if (t === 's') {
      for (let k = 0; k < 4; k++) {
        const pan = mesh(new THREE.BoxGeometry(3.6, 0.06, 3.6), toon(k % 3 ? '#bfe4ee' : '#e8f4f8'), false);
        pan.position.set(p.x - 2.1 + (k % 2) * 4.2, TOP + 0.02, p.z - 2.1 + Math.floor(k / 2) * 4.2);
        into.add(pan);
      }
    }
    if (t === 'p') {
      // the old pier runs out over the water
      const d = seaDir(tile);
      for (let k = 0; k < 6; k++) {
        const plank = mesh(new THREE.BoxGeometry(d.x ? 1.2 : 3, 0.16, d.z ? 1.2 : 3), toon(k % 2 ? '#a57a48' : '#8f6638'));
        plank.position.set(p.x + d.x * (4 + k * 1.25), TOP + 0.05, p.z + d.z * (4 + k * 1.25));
        into.add(plank);
      }
    }
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
      // the icon's little hex plinth isn't needed: buildings stand on the island itself
      g.remove(g.children[0]);
      g.scale.setScalar(BUILDINGS_BY_ID[b.id].charm ? 4 : 5.2);
      // docks, salt fields and the trading post sit on the shore, facing the water
      const shore = BUILDINGS_BY_ID[b.id].needs !== 'land' ? seaDir(b.tile) : new THREE.Vector3();
      g.position.set(p.x + shore.x * 3, TOP, p.z - 0.8 + shore.z * 3);
      if (shore.lengthSq()) g.rotation.y = Math.atan2(shore.x, shore.z);
      g.userData.tile = b.tile;
      raw.add(g);
    }
    this.builds.add(mergeStatic(raw));
  }

  // ---------- Staff ----------
  private rebuildStaff(s: GameState): void {
    const shopLevel = Math.max(0, ...s.island.buildings.filter((b) => b.id === 'shop').map((b) => b.level));
    const key = `${s.island.staff.map((x) => `${x.uid}:${x.tile}:${x.level}`).join(',')}|${s.island.buildings.map((b) => b.tile).join(',')}|${shopLevel}|${this.lite}`;
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
        if (st.role === 'fisher') {
          // on the end of the dock, facing the sea
          const d = seaDir(b.tile);
          const side = new THREE.Vector3(-d.z, 0, d.x);
          base.set(p.x + d.x * 7 + side.x * (i - 1) * 2, 0.45, p.z + d.z * 7 + side.z * (i - 1) * 2);
          g.rotation.y = Math.atan2(d.x, d.z);
        }
        g.position.copy(base);
        this.people.add(g);
        const view: WorkerView = { uid: st.uid, role: st.role, group: g, base, phase: i * 1.7 + b.tile, face: g.rotation.y };
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
    // tourists follow their guide from the Tour Office to the sights and back
    const office = s.island.buildings.find((b) => b.id === 'touroffice');
    const guides = office ? staffAt(s, office.tile).length : 0;
    if (office && guides) {
      const from = plotCenter(office.tile).add(new THREE.Vector3(0, TOP, 3));
      const sights = s.island.buildings.filter((b) => ['brewhouse', 'saltfield', 'shrine', 'dock', 'lantern'].includes(b.id)).map((b) => plotCenter(b.tile).add(new THREE.Vector3(0, TOP, 3.5)));
      sights.push(new THREE.Vector3(0, TOP, 5)); // the village
      const hats = ['#f2c14e', '#ffffff', '#e8443a', '#5aa0d8', '#7fd18b', '#f28aa0'];
      const n = this.lite ? 2 : Math.min(8, guides * 3 + 1);
      for (let i = 0; i < n; i++) {
        const g = mergeStatic(makeWorker('customer', hats[(i + 2) % hats.length]));
        g.scale.setScalar(1.9);
        this.people.add(g);
        this.walkers.push({ group: g, from: from.clone().add(new THREE.Vector3((i % 3) * 0.9 - 0.9, 0, Math.floor(i / 3) * 0.9)), to: sights[i % sights.length], t: (i * 0.13) % 1, speed: 0.035 + (i % 4) * 0.006 });
      }
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
    for (const w of this.workers) {
      const ph = t + w.phase;
      const g = w.group;
      if (w.role === 'fisher') {
        g.rotation.y = w.face;
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
