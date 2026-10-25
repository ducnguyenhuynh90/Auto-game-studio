// three.js world layer. Gameplay logic still lives in screen space (390x844 logical);
// the world maps those positions onto 3D water/ground so logic, hit-testing and visuals agree.
import * as THREE from 'three';
import { RARITY_COLOR, RECIPES_BY_ID, SPECIES_BY_ID, TIERS, tierFor, type SeaId } from '../core/data';
import { hasRelic } from '../core/items';
import { SEAS_BY_ID, seaLock } from '../core/seas';
import { agingLevel, villageLevel, type GameState } from '../core/state';
import { villageStage } from '../core/evolution';
import { H, W } from '../render/draw';
import type { Game } from '../game';
import type { FishingScene } from '../scenes/fishing';
import type { RevealOverlay } from '../scenes/jar';
import { PROFILES, type Quality, type QualityProfile } from './quality';
import { Estate, SEA_Y, plotCenter } from './estate';
import { dogAboard, dogPresent } from '../core/dog';
import {
  discard,
  makeDog,
  makeDogHouse,
  setOutlinesEnabled,
  makeBoat,
  makeBottle,
  makeFish,
  makeFisherman,
  makeCharacter,
  makeTurtle,
  makeShrine,
  makeRod,
  makeBarrel,
  makeHouse,
  makeJar,
  makeLantern,
  makeMarket,
  makePalm,
  makeSaltPile,
  makeSunburst,
  mesh,
  outline,
  toon,
  type FishModel,
  type JarModel,
} from './models';

const BUBBLE_GEO = new THREE.SphereGeometry(0.05, 8, 6);

/** What the map scene exposes to the world layer. */
export interface MapView {
  selected: SeaId | null;
  sail: { from: SeaId; to: SeaId; k: number } | null;
}

export interface ScreenPt {
  x: number;
  y: number;
}

const skyCache = new Map<string, THREE.CanvasTexture>();
function skyTexture(top: string, bottom: string): THREE.CanvasTexture {
  const key = top + bottom;
  const hit = skyCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  skyCache.set(key, t);
  return t;
}

/** Low-poly animated water: vertices bob on CPU, flat shading gives the faceted toy look. */
class Water {
  mesh: THREE.Mesh;
  private base: Float32Array;
  constructor(size: number, segs: number, color: string, opacity: number) {
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    this.base = (geo.attributes.position.array as Float32Array).slice();
    const mat = new THREE.MeshPhongMaterial({ color, flatShading: true, transparent: true, opacity, shininess: 80, specular: 0x9fe8ff });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
  }
  update(t: number): void {
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = this.base[i];
      const z = this.base[i + 2];
      arr[i + 1] = Math.sin(x * 0.9 + t * 1.3) * 0.05 + Math.cos(z * 1.1 + t * 1.1) * 0.05;
    }
    pos.needsUpdate = true;
    // flatShading derives normals in the fragment shader, so no per-frame computeVertexNormals
  }

  /** Rebuild with a different grid density (quality tiers). */
  setSegments(segs: number): void {
    const params = (this.mesh.geometry as THREE.PlaneGeometry).parameters;
    if (params.widthSegments === segs) return;
    const geo = new THREE.PlaneGeometry(params.width, params.height, segs, segs);
    geo.rotateX(-Math.PI / 2);
    this.base = (geo.attributes.position.array as Float32Array).slice();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }
}

class Ripples {
  private list: { m: THREE.Mesh; t: number; life: number; size: number }[] = [];
  constructor(private parent: THREE.Object3D) {}
  spawn(p: THREE.Vector3, size = 1, life = 0.9): void {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.06, p.z);
    this.parent.add(m);
    this.list.push({ m, t: 0, life, size });
  }
  update(dt: number): void {
    for (const r of this.list) {
      r.t += dt;
      const k = r.t / r.life;
      r.m.scale.setScalar(0.1 + k * r.size);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
    }
    for (const r of this.list.filter((r) => r.t >= r.life)) {
      this.parent.remove(r.m);
      r.m.geometry.dispose();
      (r.m.material as THREE.Material).dispose();
    }
    this.list = this.list.filter((r) => r.t < r.life);
  }
}

// =============== Fishing ===============
class FishingRig {
  root = new THREE.Group();
  camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 200);
  readonly water = new Water(70, 56, '#2aa3b9', 0.82);
  private ripples: Ripples;
  private fish = new Map<object, FishModel>();
  private boat = new THREE.Group();
  private boatKind = -1;
  private turtle: THREE.Group | null = null;
  private dog: THREE.Group | null = null;
  private fisher = makeFisherman();
  private rod = new THREE.Group();
  private rodTip: THREE.Object3D = new THREE.Object3D();
  private rodLevel = -1;
  private line: THREE.Line;
  private bobber = new THREE.Group();
  private reticle: THREE.Mesh;
  private trophy: FishModel | null = null;
  private trophyFor: object | null = null;
  private trophyT = 0;
  private trophyFrom = new THREE.Vector3();
  private burst = makeSunburst();
  private prevPhase = '';
  private prevNibbles = 0;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private zone = '';
  private islands = new THREE.Group();

  constructor(private world: World) {
    this.camera.position.set(0, 5.6, 9.6);
    this.camera.lookAt(0, -0.2, -2.6);
    this.root.add(this.camera);
    this.root.add(this.water.mesh);
    this.ripples = new Ripples(this.root);
    // distant islands
    for (const [x, z, s, c] of [
      [-12, -32, 5, '#5f9a62'],
      [-4, -38, 3, '#6aa86b'],
      [14, -30, 6, '#57905a'],
    ] as const) {
      const isl = mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(c), false);
      isl.scale.set(s * 1.6, s * 0.7, s);
      isl.position.set(x, -0.2, z);
      this.islands.add(isl);
      if (s > 4) {
        const p = makePalm(2.4);
        p.position.set(x + 1, s * 0.6, z + 1);
        this.islands.add(p);
      }
    }
    this.root.add(this.islands);
    this.buildZoneProps();
    // boat + fisherman + rod
    this.boat.position.set(-0.35, 0, 3.6);
    this.boat.scale.setScalar(0.8);
    this.root.add(this.boat);
    this.fisher.position.set(0.15, 0.2, 0.1);
    this.fisher.rotation.y = Math.PI + 0.25;
    this.boat.add(this.fisher);
    this.setRod(0);
    this.rod.position.set(0.4, 0.8, -0.1);
    this.boat.add(this.rod);
    // line
    const lg = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, () => new THREE.Vector3()));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.line.frustumCulled = false;
    this.root.add(this.line);
    // bobber
    const top = mesh(new THREE.SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon('#e74c3c'));
    const bot = mesh(new THREE.SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon('#ffffff'));
    outline(top, 1.12);
    outline(bot, 1.12);
    this.bobber.add(top, bot);
    this.root.add(this.bobber);
    // aim reticle
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    this.reticle.rotation.x = -Math.PI / 2;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), this.reticle.material);
    this.reticle.add(dot);
    this.root.add(this.reticle);
    // catch showcase lives in camera space
    this.burst.position.set(0, 0.62, -4.5);
    this.camera.add(this.burst);
  }

  private props = new Map<SeaId, THREE.Group>();

  /** Edge scenery that tells each sea apart at a glance, kept out of the casting lane. */
  private buildZoneProps(): void {
    // x at ~90% of the visible half-width for that depth (portrait camera sees a narrow strip)
    const edge = (side: number, z: number): [number, number] => [side * 0.9 * 0.178 * (9.6 - z), z];
    const sides: [number, number][] = [edge(-1, 1.2), edge(1, -0.5), edge(-1, -5), edge(1, -7.5), edge(-1, -12), edge(1, -15)];
    const group = (id: SeaId) => {
      const g = new THREE.Group();
      g.visible = false;
      this.props.set(id, g);
      this.root.add(g);
      return g;
    };
    // Phú Quốc: palm sandbars, fishing buoys and the shrine rock on the horizon
    const lagoon = group('lagoon');
    sides.forEach(([x, z], i) => {
      if (i % 2 === 0) {
        const bar = mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.2, 12), toon('#f0d9a6'), false);
        bar.scale.z = 0.6;
        bar.position.set(x * 1.05, 0, z);
        lagoon.add(bar);
        const p = makePalm(1.2 + (i % 3) * 0.3);
        p.position.set(x * 1.05, 0.1, z);
        lagoon.add(p);
      } else {
        for (let k = 0; k < 2; k++) {
          const buoy = mesh(new THREE.SphereGeometry(0.13, 10, 8), toon(k ? '#ffffff' : '#e74c3c'), false);
          buoy.position.set(x * (0.8 + k * 0.1), 0.06, z - k * 0.8);
          buoy.name = 'buoy';
          lagoon.add(buoy);
        }
      }
    });
    const shrine = makeShrine();
    shrine.position.set(5, 0, -24);
    shrine.scale.setScalar(1.6);
    lagoon.add(shrine);
    // Reef: coral heads breaking the surface, plus rocks
    const reef = group('reef');
    const coral = ['#ff7a8a', '#ffb347', '#c77dff', '#ff6f61'];
    sides.forEach(([x, z], i) => {
      const g = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const c = mesh(new THREE.ConeGeometry(0.12 + (k % 2) * 0.06, 0.6 + k * 0.15, 6), toon(coral[(i + k) % coral.length]), false);
        c.position.set((k - 1.5) * 0.22, 0.15, (k % 2) * 0.2);
        c.rotation.z = (k - 1.5) * 0.2;
        g.add(c);
      }
      const ball = mesh(new THREE.SphereGeometry(0.28, 10, 8), toon(coral[(i + 2) % coral.length]), false);
      ball.position.set(0.3, 0.05, -0.2);
      g.add(ball);
      g.position.set(x, 0, z);
      reef.add(g);
      const rock = mesh(new THREE.DodecahedronGeometry(0.5, 0), toon('#7d8b8f'), false);
      rock.position.set(Math.sign(x) * 0.95 * 0.178 * (9.6 - (z - 2.2)), 0, z - 2.2);
      rock.scale.set(0.9, 0.5, 0.8);
      reef.add(rock);
    });
    // Delta: mangrove trees on arched roots
    const delta = group('delta');
    sides.forEach(([x, z], i) => {
      const tree = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const root = mesh(new THREE.TorusGeometry(0.35, 0.04, 5, 10, Math.PI), toon('#6b4a2a'), false);
        root.rotation.y = (k / 4) * Math.PI;
        root.position.y = 0;
        tree.add(root);
      }
      const trunk = mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.9, 6), toon('#6b4a2a'), false);
      trunk.position.y = 0.6;
      tree.add(trunk);
      for (let k = 0; k < 3; k++) {
        const leaf = mesh(new THREE.SphereGeometry(0.45 - k * 0.08, 8, 6), toon(k % 2 ? '#3f7f3a' : '#4f9a48'), false);
        leaf.position.set((k - 1) * 0.3, 1.15 + (k % 2) * 0.2, 0);
        tree.add(leaf);
      }
      tree.position.set(x, 0, z);
      tree.scale.setScalar(0.65 + (i % 3) * 0.12);
      tree.position.x = x * 1.08;
      delta.add(tree);
    });
    // Dragon Bay: limestone karst towers (inspired by Hạ Long Bay)
    const bay = group('bay');
    const karst = (x: number, z: number, h: number) => {
      const g = new THREE.Group();
      const rock = mesh(new THREE.CylinderGeometry(0.5 * h * 0.35, 0.75 * h * 0.35, h, 7), toon('#9aa59a'), false);
      rock.position.y = h / 2 - 0.2;
      g.add(rock);
      const cap = mesh(new THREE.SphereGeometry(0.55 * h * 0.35, 8, 6), toon('#5f9a52'), false);
      cap.position.y = h - 0.2;
      cap.scale.y = 0.6;
      g.add(cap);
      g.position.set(x, 0, z);
      return g;
    };
    sides.forEach(([x, z], i) => bay.add(karst(x * 1.15, z, 1.1 + (i % 3) * 0.6)));
    for (const [x, z, h] of [
      [-9, -30, 9],
      [-3, -36, 6],
      [6, -33, 11],
      [13, -28, 7],
    ] as const)
      bay.add(karst(x, z, h));
    // The Abyss: dark spires and glowing jellyfish
    const trench = group('trench');
    sides.forEach(([x, z], i) => {
      const spire = mesh(new THREE.ConeGeometry(0.35, 1.6 + (i % 2) * 0.8, 5), toon('#2a2a3a'), false);
      spire.position.set(x, 0.5, z);
      trench.add(spire);
      const jelly = mesh(new THREE.SphereGeometry(0.18, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: i % 2 ? '#7af0ff' : '#ff8af0', transparent: true, opacity: 0.85 }), false);
      jelly.position.set(x * 0.6, -0.1, z - 1);
      jelly.name = 'jelly';
      trench.add(jelly);
    });
  }

  screenToWater(x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
    const ndc = new THREE.Vector2((x / W) * 2 - 1, -(y / H) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.ray.intersectPlane(this.plane, out);
    return out;
  }

  /** The rod in Lan's hands follows the rod upgrade (bamboo → lacquer → carbon → dragon). */
  private setRod(level: number): void {
    if (level === this.rodLevel) return;
    this.rodLevel = level;
    for (const c of [...this.rod.children]) discard(c);
    const r = makeRod(level);
    this.rod.add(r);
    this.rodTip = r.getObjectByName('tip')!;
  }

  private setBoat(kind: number): void {
    if (kind === this.boatKind) return;
    this.boatKind = kind;
    for (const c of [...this.boat.children]) if (c !== this.fisher && c !== this.rod && c !== this.turtle && c !== this.dog) this.boat.remove(c);
    const b = makeBoat(kind);
    if (kind >= 1) {
      b.rotation.y = Math.PI / 2;
      b.position.y = -0.1;
      b.scale.setScalar(0.9);
      this.fisher.position.set(0.1, 0.2, 0.4);
    }
    this.boat.add(b);
  }

  sync(f: FishingScene, game: Game, dt: number): void {
    const t = game.time;
    if (f.sea !== this.zone) {
      this.zone = f.sea;
      const look = SEAS_BY_ID[f.sea].look;
      this.world.scene.background = skyTexture(look.skyTop, look.skyBottom);
      (this.water.mesh.material as THREE.MeshPhongMaterial).color.set(look.water);
      this.world.scene.fog = new THREE.Fog(look.fog, 22, 55);
      for (const [id, g] of this.props) g.visible = id === f.sea;
      this.islands.visible = f.sea !== 'trench';
    }
    const home = this.props.get('lagoon');
    if (home?.visible) for (const b of home.children) if (b.name === 'buoy') b.position.y = 0.06 + Math.sin(t * 2 + b.position.z) * 0.04;
    const jellies = this.props.get('trench');
    if (jellies?.visible) for (const j of jellies.children) if (j.name === 'jelly') j.position.y = -0.05 + Math.sin(t * 1.5 + j.position.x) * 0.12;
    this.setBoat(game.state.upgrades.boat);
    this.setRod(game.state.upgrades.rod);
    // Rùa rides along once the Lagoon story is done
    if (hasRelic(game.state.relics, 'turtle') && !this.turtle) {
      this.turtle = makeTurtle();
      this.turtle.scale.setScalar(0.5);
      this.turtle.position.set(-0.5, 0.18, 0.15);
      this.turtle.rotation.y = Math.PI - 0.4;
      this.boat.add(this.turtle);
    }
    // Mực rides at the bow once he has a home
    if (dogAboard(game.state) && !this.dog) {
      this.dog = makeDog();
      this.dog.scale.setScalar(0.9);
      this.dog.position.set(0.45, 0.2, -0.35);
      this.dog.rotation.y = Math.PI / 2 + 0.3;
      this.boat.add(this.dog);
    }
    if (this.dog) {
      const head = this.dog.getObjectByName('head');
      const barking = f.barkT > 0;
      if (head) head.rotation.z = barking ? Math.sin(t * 30) * 0.15 + 0.2 : Math.sin(t * 1.7) * 0.08;
      const tail = this.dog.getObjectByName('tail');
      if (tail) tail.rotation.x = Math.sin(t * (barking ? 25 : 8)) * 0.4;
    }
    if (this.turtle) {
      const head = this.turtle.getObjectByName('head');
      if (head) head.position.y = 0.42 + Math.sin(t * 1.3) * 0.03;
    }
    this.water.update(t);
    this.ripples.update(dt);
    this.boat.position.y = Math.sin(t * 1.6) * 0.05;
    this.boat.rotation.z = Math.sin(t * 1.1) * 0.04;

    // shadows → fish meshes
    const alive = new Set<object>();
    const tmp = new THREE.Vector3();
    for (const sh of f.shadows) {
      alive.add(sh);
      let m = this.fish.get(sh);
      const sp = SPECIES_BY_ID[sh.species];
      if (!m) {
        m = makeFish(sh.species);
        const len = Math.min(2.4, 0.3 + Math.sqrt(sh.size) * 0.1);
        m.group.scale.setScalar(len);
        // Glows are honest signals: legendary/epic always glow; the Ancient Compass reveals rares too.
        const compass = hasRelic(game.state.relics, 'compass') && sp.rarity === 3;
        const glow = sp.rarity >= 4 ? (sp.rarity === 5 ? '#ffd35a' : '#c99bff') : sp.crate ? '#d9a8ff' : sp.treasure ? '#fff2b0' : compass ? '#7fd3ff' : null;
        m.setSilhouette(true, glow);
        this.root.add(m.group);
        this.fish.set(sh, m);
      }
      // A hungry fish rises near the surface and shows its true colours (food chain).
      const hungry = !!(sh as { hungry?: boolean }).hungry;
      if (m.group.userData.hungry !== hungry) {
        m.group.userData.hungry = hungry;
        if (hungry) m.setSilhouette(false);
        else if (m.group.userData.revealed) m.setSilhouette(true, null);
      }
      if (hungry) m.group.userData.revealed = true;
      this.screenToWater(sh.x, sh.y, tmp);
      const hooked = sh.state === 'hooked';
      // out-of-reach fish swim deeper, so they read fainter through the water
      m.group.position.set(tmp.x, hooked ? -0.12 : hungry ? -0.04 : sh.locked ? -0.7 : -0.32, tmp.z);
      const heading = sh.state === 'approach' ? Math.atan2(-(f.bobber.y - sh.y), f.bobber.x - sh.x) : sh.dir > 0 ? 0 : Math.PI;
      m.group.rotation.y = heading + Math.sin(sh.phase * 0.5) * 0.15;
      if (hooked && f.reel) m.group.rotation.z = Math.sin(t * 30) * f.reel.thrash * 2;
      if (m.tail) m.tail.rotation.y = Math.sin(sh.phase * (hooked ? 3 : 1.5)) * 0.5;
      m.group.visible = sh.alpha > 0.05;
      if (hooked && Math.random() < 0.15) this.ripples.spawn(m.group.position, 1.2, 0.6);
    }
    for (const [k, m] of this.fish) {
      if (!alive.has(k)) {
        discard(m.group);
        this.fish.delete(k);
      }
    }

    // rod pose
    const tension = f.reel?.tension ?? 0;
    const charge = f.phase === 'charging' ? f.power : 0;
    this.rod.rotation.x = -0.75 - tension * 0.35 + charge * 0.6;
    this.rod.rotation.z = -0.15;
    this.fisher.rotation.x = f.phase === 'reel' ? -0.12 - tension * 0.1 : 0;
    this.camera.updateMatrixWorld();
    this.root.updateMatrixWorld(true);
    const tip = this.rodTip.getWorldPosition(new THREE.Vector3());

    // bobber
    const showLine = ['flying', 'waiting', 'bite', 'reel'].includes(f.phase);
    const landing = this.screenToWater(f.bobber.x, f.bobber.y);
    let bob = landing.clone();
    if (f.phase === 'flying') {
      const k = Math.min(1, f.bobber.t);
      const e = 1 - Math.pow(1 - k, 3);
      bob = tip.clone().lerp(landing, e);
      bob.y += Math.sin(e * Math.PI) * 2.2;
    } else {
      bob.y = 0.06 + Math.sin(t * 3) * 0.03 - f.bobber.dip * 0.12 - (f.phase === 'bite' ? 0.18 + Math.sin(t * 40) * 0.04 : 0);
    }
    this.bobber.visible = showLine && f.phase !== 'reel';
    this.bobber.position.copy(bob);
    if (f.phase !== this.prevPhase) {
      if (f.phase === 'waiting') this.ripples.spawn(landing, 1.6);
      if (f.phase === 'bite') {
        this.ripples.spawn(landing, 2.4, 0.7);
        this.ripples.spawn(landing, 1.4, 0.5);
      }
      if (f.phase === 'reel') this.ripples.spawn(landing, 2.8, 0.8);
      if (f.phase === 'card') this.startTrophy(f);
      this.prevPhase = f.phase;
    }
    if (f.nibbles !== this.prevNibbles) {
      if (f.nibbles > 0) this.ripples.spawn(landing, 0.9, 0.5);
      this.prevNibbles = f.nibbles;
    }

    // line
    this.line.visible = showLine;
    if (showLine) {
      let end = bob;
      if (f.phase === 'reel' && f.target) {
        const fm = this.fish.get(f.target);
        if (fm) end = fm.group.position.clone().setY(0.02);
      }
      const sag = f.phase === 'reel' ? (1 - tension) * 0.9 : 0.6;
      const mid = tip.clone().lerp(end, 0.5);
      mid.y -= sag;
      const curve = new THREE.QuadraticBezierCurve3(tip, mid, end);
      const pts = curve.getPoints(23);
      const jitter = f.reel && f.reel.strain > 0.1 ? f.reel.strain * 0.05 : 0;
      const arr = (this.line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      pts.forEach((p, i) => {
        arr[i * 3] = p.x + (Math.random() - 0.5) * jitter;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
      });
      this.line.geometry.attributes.position.needsUpdate = true;
      const strain = f.reel ? Math.min(1, f.reel.strain / 0.6) : 0;
      (this.line.material as THREE.LineBasicMaterial).color.setRGB(1, 1 - strain * 0.65, 1 - strain * 0.8);
    }

    // aim reticle follows the charge
    this.reticle.visible = f.phase === 'aim' || f.phase === 'charging';
    if (this.reticle.visible) {
      const y = f.aimScreenY();
      const p = this.screenToWater(W / 2, y);
      this.reticle.position.set(p.x, 0.08, p.z);
      const s = f.phase === 'charging' ? 1 : 0.8 + Math.sin(t * 4) * 0.08;
      this.reticle.scale.setScalar(s);
      (this.reticle.material as THREE.MeshBasicMaterial).opacity = f.phase === 'charging' ? 0.95 : 0.5;
      (this.reticle.material as THREE.MeshBasicMaterial).color.set(f.overcharged ? '#ff4a3a' : '#ffffff');
    }

    this.updateTrophy(f, dt, t);
  }

  private startTrophy(f: FishingScene): void {
    if (!f.card) return;
    if (this.trophy) discard(this.trophy.group);
    const sp = SPECIES_BY_ID[f.card.fish.species];
    this.trophy = makeFish(sp.id);
    this.trophyFor = f.card;
    this.trophyT = 0;
    const s = Math.min(1.15, 0.5 + Math.sqrt(sp.size[1]) * 0.055);
    this.trophy.group.scale.setScalar(s);
    this.camera.add(this.trophy.group);
    // start from where the fish was, in camera space
    this.trophyFrom.set(0, -2.2, -4.2);
    (this.burst.material as THREE.MeshBasicMaterial).color.set(sp.rarity >= 3 ? RARITY_COLOR[sp.rarity] : '#ffe6a0');
  }

  private updateTrophy(f: FishingScene, dt: number, t: number): void {
    const active = f.phase === 'card' && f.card && this.trophy && this.trophyFor === f.card;
    this.burst.visible = !!active;
    if (!active) {
      if (this.trophy && f.phase !== 'card') {
        discard(this.trophy.group);
        this.trophy = null;
      }
      return;
    }
    const tr = this.trophy!;
    this.trophyT += dt;
    const k = Math.min(1, this.trophyT / 0.55);
    const target = new THREE.Vector3(0, 0.62, -4.2);
    const p = this.trophyFrom.clone().lerp(target, 1 - Math.pow(1 - k, 3));
    p.y += Math.sin(k * Math.PI) * 0.8;
    tr.group.position.copy(p);
    tr.group.rotation.set(Math.sin(t * 2) * 0.1, -0.5 + Math.sin(t * 1.3) * 0.5, k < 1 ? (1 - k) * 6 : Math.sin(t * 3) * 0.08);
    if (tr.tail) tr.tail.rotation.y = Math.sin(t * 10) * 0.5;
    this.burst.rotation.z = t * 0.4;
    this.burst.scale.setScalar(k * 0.8);
    (this.burst.material as THREE.MeshBasicMaterial).opacity = 0.18;
  }
}

// =============== Village ===============
class VillageRig {
  root = new THREE.Group();
  camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 900);
  /** The whole island business around the village (plots, buildings, staff). */
  estate = new Estate();
  /** 0 = village close-up, 1 = whole-island overview; `zoom` eases toward `zoomTarget`. */
  zoom = 0;
  zoomTarget = 0;
  /** Overview pan offset (world units), set by dragging. */
  pan = new THREE.Vector3();
  /** Overview distance multiplier (pinch / wheel / +−): smaller = closer to the staff at work. */
  overviewScale = 1;
  private scaleNow = 1;
  readonly water = new Water(80, 40, '#2aa3b9', 1);
  private sky = skyTexture('#ffc58a', '#ffeccc');
  private dyn = new THREE.Group();
  private jars: JarModel[] = [];
  private jarPos: THREE.Vector3[] = [];
  private key = '';
  private boat: THREE.Group | null = null;
  private fisher = makeCharacter('nam'); // Bà Năm tends the village
  /** Mực, once he has turned up (core/dog.ts). */
  private dog: THREE.Group | null = null;
  private dogHouse: THREE.Group | null = null;
  private dogHopT = 0;
  private palms: THREE.Group[] = [];
  private market: THREE.Group | null = null;
  private lanterns: THREE.Mesh[] = [];
  private bubbles: THREE.Mesh[] = [];
  private shelfBottles = new THREE.Group();
  marketPos = new THREE.Vector3(1.9, 0, -0.9);
  private hopT = 0;

  /** Make the villager hop (when tapped). */
  hop(): void {
    this.hopT = 0.5;
  }

  /** Mực jumps for joy (fed, petted). */
  dogHop(): void {
    this.dogHopT = 0.6;
  }

  dogScreen(): ScreenPt | null {
    return this.dog ? this.world.project(this.dog.position.clone().setY(0.6), this.camera) : null;
  }

  fisherScreen(): ScreenPt {
    return this.world.project(this.fisher.position.clone().setY(1.0), this.camera);
  }

  constructor(private world: World) {
    this.camera.position.set(0, 14, 17.5);
    this.camera.lookAt(0, 0, -0.9);
    this.root.add(this.estate.root);
    // sea level sits below the island's beach so its sides show (render3d/estate.ts)
    this.water.mesh.position.y = SEA_Y;
    this.root.add(this.water.mesh);
    // the ground is the big island itself (estate.ts): the village stands on its home plot
    // dock
    const dock = new THREE.Group();
    const deck = mesh(new THREE.BoxGeometry(1, 0.12, 3.2), toon('#a06a3d'));
    outline(deck, 1.02);
    deck.position.y = 0.2;
    dock.add(deck);
    for (const z of [-1.4, -0.4, 0.6])
      for (const x of [-0.45, 0.45]) {
        const post = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7), toon('#6e4423'));
        post.position.set(x, -0.55, z);
        dock.add(post);
      }
    dock.position.set(2.6, 0, -6.6);
    this.root.add(dock);
    // palms
    for (const [x, z, h] of [
      [-3.3, -3.4, 2.6],
      [-2.9, 4.2, 2.0],
      [3.4, 1.6, 2.2],
    ] as const) {
      const p = makePalm(h);
      p.position.set(x, 0.15, z);
      this.palms.push(p);
      this.root.add(p);
    }
    this.fisher.position.set(-1.6, 0.2, 0.6);
    this.fisher.scale.setScalar(0.85);
    this.root.add(this.fisher);
    // Phú Quốc landmarks: the shrine rock by the dock, wooden mắm barrels beside the house
    const shrine = makeShrine();
    shrine.position.set(-2.3, SEA_Y + 0.15, -6.6);
    shrine.scale.setScalar(0.9);
    this.root.add(shrine);
    for (const [x, z] of [
      [-3.0, -1.4],
      [-2.55, -1.15],
    ] as const) {
      const b = makeBarrel();
      b.position.set(x, 0.15, z);
      b.scale.setScalar(0.55);
      this.root.add(b);
    }
    this.root.add(this.dyn);
    this.root.add(this.shelfBottles);
  }

  /** Rebuild the parts of the village that depend on upgrades. */
  private rebuild(s: GameState): void {
    const lvl = villageLevel(s);
    // the village visibly evolves through the same four stages as its roadmap (core/evolution.ts)
    const stage = villageStage(s);
    const key = [s.jars.length, s.upgrades.boat, s.upgrades.salt, s.upgrades.stall, stage, lvl].join(',');
    if (key === this.key) return;
    this.key = key;
    for (const c of [...this.dyn.children]) discard(c);
    const house = makeHouse(stage >= 2 ? 6 : 1);
    house.position.set(-1.7, 0.15, -2.9);
    house.rotation.y = 0.25;
    this.dyn.add(house);
    this.market = makeMarket(s.upgrades.stall);
    this.market.position.copy(this.marketPos).setY(0.15);
    this.market.rotation.y = -0.3;
    this.dyn.add(this.market);
    // drying rack between house and market
    const rack = new THREE.Group();
    for (const x of [-0.5, 0.5]) {
      const post = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1), toon('#6e4423'));
      post.position.set(x, 0.5, 0);
      rack.add(post);
    }
    const bar = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1), toon('#6e4423'));
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 0.95;
    rack.add(bar);
    rack.position.set(1.4, 0.15, -3.6);
    rack.name = 'rack';
    this.dyn.add(rack);
    // boat at dock
    this.boat = makeBoat(s.upgrades.boat);
    this.boat.position.set(0.6, SEA_Y + 0.05, -7.6);
    this.boat.scale.setScalar(s.upgrades.boat >= 1 ? 0.8 : 0.75);
    this.boat.rotation.y = s.upgrades.boat >= 1 ? Math.PI / 2 : 0;
    this.dyn.add(this.boat);
    // salt piles
    for (let i = 0; i < (s.upgrades.salt > 0 ? s.upgrades.salt + 1 : 0); i++) {
      const p = makeSaltPile();
      p.position.set(-3.0 + i * 0.5, 0.15, -0.7 + (i % 2) * 0.3);
      this.dyn.add(p);
    }
    // lantern string grows with prosperity
    this.lanterns = [];
    if (stage >= 3) {
      // Pearl of Phú Quốc: a second house and festival bunting
      const h2 = makeHouse(6);
      h2.scale.setScalar(0.75);
      h2.position.set(2.9, 0.15, 3.4);
      h2.rotation.y = -0.6;
      this.dyn.add(h2);
      const colors = ['#e8443a', '#f2c14e', '#3aa0d9', '#5fae52', '#a35bd6'];
      for (let i = 0; i < 12; i++) {
        const tri = mesh(new THREE.ConeGeometry(0.12, 0.26, 3), toon(colors[i % colors.length]), false);
        tri.rotation.z = Math.PI;
        const u = i / 11;
        tri.position.set(-3 + u * 6, 3.0 - Math.sin(u * Math.PI) * 0.5, 0.6);
        this.dyn.add(tri);
      }
    }
    if (stage >= 2) {
      // Busy Harbour: a second boat at the dock
      const extra = makeBoat(1);
      extra.scale.setScalar(0.6);
      extra.rotation.y = Math.PI / 2;
      extra.position.set(3.6, SEA_Y + 0.05, -5.4);
      this.dyn.add(extra);
    }
    if (stage >= 1) {
      const n = Math.min(9, lvl + 1);
      for (let i = 0; i < n; i++) {
        const u = (i + 1) / (n + 1);
        const l = makeLantern(i % 2 ? '#f2b233' : '#e8443a');
        l.position.set(-3 + u * 6, 2.6 - 4 * 0.5 * u * (1 - u), -1.6);
        this.lanterns.push(l);
        this.dyn.add(l);
      }
    }
    // jars
    for (const j of this.jars) discard(j.group);
    this.jars = [];
    this.jarPos = [];
    const n = s.jars.length;
    const spacing = n <= 2 ? 1.5 : 1.15;
    for (let i = 0; i < n; i++) {
      const jm = makeJar();
      const x = (i - (n - 1) / 2) * spacing;
      jm.group.position.set(x, 0.2, 2.5);
      jm.group.scale.setScalar(0.85);
      this.jars.push(jm);
      this.jarPos.push(jm.group.position.clone());
      this.root.add(jm.group);
    }
    const mat = mesh(new THREE.CylinderGeometry(1, 1, 0.04, 28), toon('#c79a5a', { opacity: 0.55 }), false);
    mat.scale.set(n <= 2 ? 2.3 : 2.9, 1, 0.75);
    mat.position.set(0, 0.2, 2.6);
    this.dyn.add(mat);
  }

  /** Camera between the village close-up and the island overview; returns the zoom amount. */
  private placeCamera(s: GameState, dt: number): number {
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 4);
    if (Math.abs(this.zoom - this.zoomTarget) < 0.001) this.zoom = this.zoomTarget;
    const k = this.zoom * this.zoom * (3 - 2 * this.zoom); // smoothstep
    const closeTarget = new THREE.Vector3(0, 0, -0.9);
    // frame what you own (it widens as the island grows); the HUD covers the top and bottom bands
    const f = this.estate.focus(s);
    this.scaleNow += (this.overviewScale - this.scaleNow) * Math.min(1, dt * 6);
    const size = Math.max(f.width * 2.0, f.depth * 1.3, 46) * this.scaleNow;
    // lean toward the village so home stays in view as the estate spreads out
    const farTarget = f.center.clone().lerp(new THREE.Vector3(), 0.3).add(new THREE.Vector3(0, 0, -size * 0.06)).add(this.pan);
    const target = closeTarget.lerp(farTarget, k);
    const offset = new THREE.Vector3(0, 14, 18.4).lerp(new THREE.Vector3(0, size * 0.92, size * 1.08), k);
    this.camera.position.copy(target).add(offset);
    this.camera.lookAt(target);
    // a nearer far-away camera needs a deeper near plane, or distant surfaces flicker
    const near = 0.1 + k * 3;
    if (Math.abs(this.camera.near - near) > 0.01) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    return k;
  }

  /** Screen position of a plot's label anchor (for overview labels and taps). */
  plotScreen(s: GameState, tile: number): ScreenPt {
    return this.world.project(this.estate.plotTop(s, tile), this.camera);
  }

  /** Screen position of the middle of a plot. */
  plotCenterScreen(tile: number): ScreenPt {
    return this.world.project(plotCenter(tile), this.camera);
  }

  /** Screen position of a world point (used for floating staff output). */
  screenOf(p: THREE.Vector3): ScreenPt {
    return this.world.project(p, this.camera);
  }

  sync(game: Game, dt: number): void {
    const s = game.state;
    const t = game.time;
    const k = this.placeCamera(s, dt);
    this.world.scene.background = this.sky;
    this.world.scene.fog = new THREE.Fog('#ffe3bb', 26 + k * 300, 60 + k * 500);
    this.world.setOverviewShadows(k > 0.4);
    this.estate.lite = this.world.quality === 'low';
    this.estate.sync(s, t, dt);
    this.rebuild(s);
    this.water.update(t);
    const now = Date.now();
    s.jars.forEach((j, i) => {
      const jm = this.jars[i];
      if (!jm) return;
      const pressed = game.isPressed(`jar${i}`);
      const lvl = j.sealed ? agingLevel(s, j, now) : 0;
      const ready = j.sealed && lvl >= 1;
      jm.lid.visible = j.sealed;
      const base = this.jarPos[i];
      const hop = ready ? Math.abs(Math.sin(t * 4 + i)) * 0.18 : 0;
      jm.group.position.set(base.x, base.y + hop, base.z);
      const sc = 0.85 * (pressed ? 0.92 : 1);
      const squash = ready ? 1 + Math.sin(t * 8 + i) * 0.04 : 1;
      jm.group.scale.set(sc * squash, sc / squash, sc * squash);
      jm.group.rotation.z = j.sealed && !ready ? Math.sin(t * 2 + i) * 0.03 : ready ? Math.sin(t * 8 + i) * 0.05 : 0;
      const bodyMat = jm.body.material as THREE.MeshToonMaterial;
      if (ready && !jm.body.userData.glowMat) {
        jm.body.userData.glowMat = true;
        jm.body.material = bodyMat.clone();
      }
      if (jm.body.userData.glowMat) {
        const m = jm.body.material as THREE.MeshToonMaterial;
        m.emissive.setRGB(ready ? 0.35 + Math.sin(t * 5) * 0.15 : 0, ready ? 0.22 + Math.sin(t * 5) * 0.1 : 0, 0);
      }
    });
    // fermentation bubbles
    this.bubbles = this.bubbles.filter((b) => {
      b.position.y += dt * 0.6;
      b.scale.multiplyScalar(1 + dt * 0.8);
      (b.material as THREE.MeshBasicMaterial).opacity -= dt * 0.6;
      if ((b.material as THREE.MeshBasicMaterial).opacity <= 0) {
        this.root.remove(b);
        (b.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
    s.jars.forEach((j, i) => {
      if (j.sealed && this.jars[i] && Math.random() < dt * 1.5) {
        const b = new THREE.Mesh(BUBBLE_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
        const p = this.jarPos[i];
        b.position.set(p.x + (Math.random() - 0.5) * 0.3, p.y + 1.1, p.z);
        this.root.add(b);
        this.bubbles.push(b);
      }
    });
    // ambient life
    for (const p of this.palms) {
      const top = p.getObjectByName('top');
      if (top) top.rotation.z = Math.sin(t * 1.2 + p.position.x) * 0.06;
    }
    if (this.boat) {
      this.boat.position.y = SEA_Y + 0.05 + Math.sin(t * 1.5) * 0.05;
      this.boat.rotation.z = Math.sin(t * 1.2) * 0.04;
    }
    // Mực trots around between Bà Năm and the jars; he sleeps by his house once he has one
    if (dogPresent(s) && !this.dog) {
      this.dog = makeDog();
      this.dog.scale.setScalar(1.1);
      this.root.add(this.dog);
    }
    if (s.dog.house && !this.dogHouse) {
      this.dogHouse = makeDogHouse();
      this.dogHouse.position.set(-3.2, 0.2, 1.4);
      this.dogHouse.rotation.y = 0.5;
      this.dogHouse.scale.setScalar(1.2);
      this.root.add(this.dogHouse);
    }
    if (this.dog) {
      this.dogHopT = Math.max(0, this.dogHopT - dt);
      const a = t * 0.35;
      const x = 0.2 + Math.cos(a) * 2.2;
      const z = 0.9 + Math.sin(a * 2) * 0.6;
      const hop = Math.sin((this.dogHopT / 0.6) * Math.PI) * 0.5;
      this.dog.position.set(x, 0.2 + Math.abs(Math.sin(t * 9)) * 0.04 + hop, z);
      // face the way he is trotting
      this.dog.rotation.y = Math.atan2(-Math.cos(a * 2) * 1.2, -Math.sin(a) * 2.2);
      for (const leg of this.dog.children.filter((c) => c.name === 'leg')) leg.rotation.z = Math.sin(t * 12 + leg.position.x * 10) * 0.4;
      const tail = this.dog.getObjectByName('tail');
      if (tail) tail.rotation.x = Math.sin(t * (this.dogHopT > 0 ? 25 : 9)) * 0.5;
    }
    this.hopT = Math.max(0, this.hopT - dt);
    this.fisher.position.y = 0.2 + Math.abs(Math.sin(t * 2.2)) * 0.05 + Math.sin((this.hopT / 0.5) * Math.PI) * 0.6;
    this.fisher.rotation.y = this.hopT > 0 ? 0 : Math.sin(t * 0.5) * 0.6;
    this.lanterns.forEach((l, i) => (l.rotation.z = Math.sin(t * 2 + i) * 0.15));
    const star = this.market?.getObjectByName('star');
    if (star) star.rotation.y = t * 2;
    if (this.market) {
      const pressed = game.isPressed('market');
      this.market.scale.setScalar(pressed ? 0.95 : 1);
    }
    // bottles on the market table
    const shelfKey = String(Math.min(4, s.shelf.length));
    if (this.shelfBottles.userData.key !== shelfKey) {
      this.shelfBottles.userData.key = shelfKey;
      for (const c of [...this.shelfBottles.children]) discard(c);
      s.shelf.slice(0, 4).forEach((p, i) => {
        const b = makeBottle(RECIPES_BY_ID[p.recipe].color, tierFor(p.degrees).color);
        b.scale.setScalar(0.38);
        b.position.set(this.marketPos.x - 0.55 + i * 0.36, 0.84, this.marketPos.z + 0.1 + i * 0.1);
        this.shelfBottles.add(b);
      });
    }
    // fish drying on the rack mirrors your bucket
    const rack = this.dyn.getObjectByName('rack');
    if (rack && rack.userData.n !== Math.min(5, s.bucket.length)) {
      rack.userData.n = Math.min(5, s.bucket.length);
      for (const c of rack.children.filter((c) => c.userData.fish)) discard(c);
      s.bucket.slice(0, 5).forEach((f, i) => {
        const fm = makeFish(f.species);
        fm.group.scale.setScalar(0.32);
        fm.group.rotation.z = -Math.PI / 2;
        fm.group.position.set(-0.4 + i * 0.2, 0.75, 0.05);
        fm.group.userData.fish = true;
        rack.add(fm.group);
      });
    }
  }

  jarScreen(i: number): ScreenPt | null {
    const p = this.jarPos[i];
    if (!p) return null;
    return this.world.project(p, this.camera);
  }
  marketScreen(): ScreenPt {
    return this.world.project(this.marketPos.clone().setY(0.8), this.camera);
  }
}

// =============== Sea chart ===============
/** Island positions on the chart (x, z), bottom (home) to top (the Abyss). */
const CHART: Record<SeaId, [number, number]> = { lagoon: [0, 4.4], reef: [2.1, 1.9], delta: [-2.1, -0.6], bay: [1.9, -3.1], trench: [-1.2, -5.6] };

class MapRig {
  root = new THREE.Group();
  camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 200);
  readonly water = new Water(70, 40, '#2a8fb0', 1);
  private fogs = new Map<SeaId, THREE.Group>();
  private boat: THREE.Group | null = null;
  private boatKind = -1;
  private routeDots: THREE.Mesh[] = [];
  private markers = new Map<SeaId, THREE.Mesh>();

  constructor(private world: World) {
    this.camera.position.set(0, 27, 10);
    this.camera.lookAt(0, 0, 3.4);
    this.root.add(this.water.mesh);
    const ids = Object.keys(CHART) as SeaId[];
    // dotted route
    for (let i = 0; i < ids.length - 1; i++) {
      const [ax, az] = CHART[ids[i]];
      const [bx, bz] = CHART[ids[i + 1]];
      for (let k = 1; k < 8; k++) {
        const u = k / 8;
        const dot = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 8), toon('#fff4e0'), false);
        dot.position.set(ax + (bx - ax) * u + Math.sin(u * Math.PI) * 0.8, 0.12, az + (bz - az) * u);
        this.routeDots.push(dot);
        this.root.add(dot);
      }
    }
    for (const id of ids) {
      const [x, z] = CHART[id];
      const isl = this.island(id);
      isl.position.set(x, 0, z);
      isl.scale.setScalar(0.75);
      this.root.add(isl);
      // fog bank over locked seas
      const fog = new THREE.Group();
      for (let k = 0; k < 7; k++) {
        const puff = mesh(new THREE.SphereGeometry(0.7 + (k % 3) * 0.2, 10, 8), new THREE.MeshToonMaterial({ color: '#ffffff', emissive: '#6a6a6a', transparent: true, opacity: 0.88 }), false);
        puff.position.set(Math.cos(k * 0.9) * 0.8, 0.5 + (k % 2) * 0.3, Math.sin(k * 0.9) * 0.6);
        puff.scale.setScalar(0.75);
        fog.add(puff);
      }
      fog.position.set(x, 0, z);
      this.fogs.set(id, fog);
      this.root.add(fog);
      const marker = mesh(new THREE.ConeGeometry(0.22, 0.5, 4), toon('#e74c3c', { emissive: '#5a1010' }), false);
      marker.rotation.x = Math.PI;
      marker.position.set(x, 2.6, z);
      marker.visible = false;
      this.markers.set(id, marker);
      this.root.add(marker);
    }
  }

  private island(id: SeaId): THREE.Group {
    const g = new THREE.Group();
    const sand = mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.35, 16), toon('#f0d9a6'), false);
    g.add(sand);
    const top = mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.2, 16), toon(id === 'trench' ? '#4a4a5a' : '#8cc265'), false);
    top.position.y = 0.2;
    g.add(top);
    if (id === 'lagoon') {
      const h = makeHouse(1);
      h.scale.setScalar(0.5);
      h.position.set(-0.3, 0.3, 0);
      g.add(h);
      const sh = makeShrine();
      sh.scale.setScalar(0.35);
      sh.position.set(0.9, 0.1, 0.8);
      g.add(sh);
      const p = makePalm(1.4);
      p.position.set(0.7, 0.3, 0.2);
      g.add(p);
    } else if (id === 'reef') {
      const coral = ['#ff7a8a', '#ffb347', '#c77dff'];
      for (let k = 0; k < 6; k++) {
        const c = mesh(new THREE.ConeGeometry(0.12, 0.6 + (k % 3) * 0.2, 6), toon(coral[k % 3]), false);
        c.position.set(Math.cos(k) * 0.7, 0.5, Math.sin(k) * 0.6);
        g.add(c);
      }
    } else if (id === 'delta') {
      for (let k = 0; k < 3; k++) {
        const tree = mesh(new THREE.SphereGeometry(0.45, 8, 6), toon('#3f7f3a'), false);
        tree.position.set((k - 1) * 0.6, 0.8, (k % 2) * 0.3);
        g.add(tree);
        const trunk = mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.6, 6), toon('#6b4a2a'), false);
        trunk.position.set((k - 1) * 0.6, 0.45, (k % 2) * 0.3);
        g.add(trunk);
      }
    } else if (id === 'bay') {
      for (const [x, z, h] of [
        [-0.5, 0, 1.6],
        [0.4, 0.3, 2.2],
        [0.6, -0.5, 1.3],
      ] as const) {
        const rock = mesh(new THREE.CylinderGeometry(0.25, 0.38, h, 7), toon('#9aa59a'), false);
        rock.position.set(x, 0.3 + h / 2, z);
        g.add(rock);
        const cap = mesh(new THREE.SphereGeometry(0.3, 8, 6), toon('#5f9a52'), false);
        cap.position.set(x, 0.3 + h, z);
        cap.scale.y = 0.6;
        g.add(cap);
      }
    } else {
      const whirl = mesh(new THREE.TorusGeometry(0.8, 0.12, 6, 20), toon('#1d3a5a'), false);
      whirl.rotation.x = Math.PI / 2;
      whirl.position.y = 0.32;
      whirl.name = 'whirl';
      g.add(whirl);
      const spire = mesh(new THREE.ConeGeometry(0.3, 1.6, 5), toon('#2a2a3a'), false);
      spire.position.y = 1;
      g.add(spire);
    }
    return g;
  }

  /** Screen position of an island's label anchor. */
  islandScreen(id: SeaId): ScreenPt {
    const [x, z] = CHART[id];
    return this.world.project(new THREE.Vector3(x, 0, z), this.camera);
  }

  sync(game: Game, view: { selected: SeaId | null; sail: { from: SeaId; to: SeaId; k: number } | null }, dt: number): void {
    const s = game.state;
    const t = game.time;
    this.world.scene.background = skyTexture('#9fd3e0', '#e8f4f0');
    this.world.scene.fog = new THREE.Fog('#e8f4f0', 30, 70);
    this.water.update(t);
    void dt;
    for (const [id, fog] of this.fogs) {
      fog.visible = !!seaLock(s, SEAS_BY_ID[id]);
      fog.rotation.y = t * 0.05;
    }
    for (const [id, m] of this.markers) {
      m.visible = id === view.selected;
      m.position.y = 2.6 + Math.sin(t * 4) * 0.15;
      m.rotation.y = t * 2;
    }
    const whirl = this.root.getObjectByName('whirl');
    if (whirl) whirl.rotation.z = t;
    if (this.boatKind !== s.upgrades.boat) {
      discard(this.boat);
      this.boatKind = s.upgrades.boat;
      this.boat = makeBoat(s.upgrades.boat);
      this.boat.scale.setScalar(0.45);
      this.root.add(this.boat);
    }
    // the boat sits at the current sea, or sails along the route
    const at = (id: SeaId) => new THREE.Vector3(CHART[id][0] + 1.5, 0.05, CHART[id][1] + 0.6);
    let pos = at(s.sea);
    if (view.sail) {
      const a = at(view.sail.from);
      const b = at(view.sail.to);
      const k = view.sail.k < 0.5 ? 2 * view.sail.k * view.sail.k : 1 - Math.pow(-2 * view.sail.k + 2, 2) / 2;
      pos = a.clone().lerp(b, k);
      pos.x += Math.sin(k * Math.PI) * 1.2;
      this.boat!.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
    }
    this.boat!.position.copy(pos);
    this.boat!.position.y = Math.sin(t * 2) * 0.05;
  }
}

// =============== Reveal showcase ===============
class Showcase {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 100);
  private jar = makeJar();
  private bottle: THREE.Group | null = null;
  private bottleKey = '';
  private burst = makeSunburst();
  private glow = new THREE.PointLight(0xffd38a, 0, 6);

  constructor() {
    this.scene.background = new THREE.Color('#2a1a10');
    this.camera.position.set(0, 1.25, 12);
    this.camera.lookAt(0, 1.25, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3a2a1a, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 4, 5);
    this.scene.add(key);
    this.burst.position.set(0, 1.0, -3);
    this.burst.scale.setScalar(1.6);
    this.scene.add(this.burst);
    this.jar.group.scale.setScalar(1.9);
    this.scene.add(this.jar.group);
    this.glow.position.set(0, 1.5, -1);
    this.scene.add(this.glow);
  }

  sync(r: RevealOverlay, t: number): void {
    const tier = tierFor(r.shown);
    const ti = TIERS.indexOf(tier);
    const burstMat = this.burst.material as THREE.MeshBasicMaterial;
    this.burst.rotation.z = t * 0.3;
    if (r.phase === 'knock') {
      const k = r.knockT;
      this.jar.group.position.set(0, 0.3, 0);
      this.jar.group.rotation.z = Math.sin(t * 40) * 0.08 * k;
      this.jar.group.scale.set(1.9 * (1 + k * 0.08), 1.9 * (1 - k * 0.08), 1.9 * (1 + k * 0.08));
      this.jar.lid.position.y = 1 + r.knocks * 0.03 + k * 0.08;
      this.jar.lid.rotation.set(0, 0, Math.sin(t * 30) * 0.05 * k);
      this.jar.lid.visible = true;
      burstMat.color.set('#ffdca0');
      burstMat.opacity = 0.08 + r.knocks * 0.08;
      this.glow.intensity = r.knocks * 1.5;
      if (this.bottle) this.bottle.visible = false;
      return;
    }
    const popK = r.phase === 'pop' ? Math.min(1, r.phaseT / 0.7) : 1;
    this.jar.group.rotation.z = 0;
    const settle = Math.min(1, popK * 1.5);
    this.jar.group.scale.setScalar(1.9 - 0.5 * settle);
    this.jar.group.position.set(0, 0.3 - 1.35 * settle, 0);
    this.jar.lid.position.set(popK * 2.5, 1 + popK * 4, popK * 1.5);
    this.jar.lid.rotation.set(popK * 5, 0, popK * 3);
    const key = r.recipeId + '|' + (r.phase === 'done' ? tier.id : 'x');
    if (key !== this.bottleKey) {
      this.bottleKey = key;
      discard(this.bottle);
      this.bottle = makeBottle(RECIPES_BY_ID[r.recipeId].color, r.phase === 'done' ? tier.color : '#fff8ec');
      this.bottle.scale.setScalar(1.55);
      this.scene.add(this.bottle);
    }
    const b = this.bottle!;
    b.visible = true;
    const rise = 1 + 2.70158 * Math.pow(popK - 1, 3) + 1.70158 * Math.pow(popK - 1, 2);
    b.position.set(0, -0.6 + rise * 0.95, 0.3);
    b.rotation.y = r.phase === 'done' ? Math.sin(t * 1.2) * 0.5 : t * 2;
    burstMat.color.set(r.phase === 'pop' ? '#ffe6a0' : tier.color);
    burstMat.opacity = 0.12 + ti * 0.05;
    this.glow.intensity = 1 + ti * 0.6;
    this.glow.color.set(tier.color);
  }
}

// =============== World ===============
export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  fishing: FishingRig;
  village: VillageRig;
  map: MapRig;
  showcase = new Showcase();
  private mode: 'village' | 'fishing' | 'map' = 'village';
  private sun: THREE.DirectionalLight;
  quality: Quality;
  private profile: QualityProfile;
  private css = { w: 390, h: 844, dpr: 1 };
  private frame = 0;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.profile = PROFILES[quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.profile.antialias, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a8f6a, 1.5));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
    this.sun.position.set(5, 12, 7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -9;
    sc.right = 9;
    sc.top = 9;
    sc.bottom = -9;
    this.scene.add(this.sun);
    this.fishing = new FishingRig(this);
    this.village = new VillageRig(this);
    this.map = new MapRig(this);
    this.scene.add(this.village.root, this.fishing.root, this.map.root);
    this.applyQuality(quality);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.css = { w: cssW, h: cssH, dpr };
    this.renderer.setPixelRatio(Math.min(dpr, this.profile.maxDpr) * this.profile.scale);
    this.renderer.setSize(cssW, cssH, false);
  }

  /** Apply a quality tier live (antialiasing is fixed at creation; everything else changes here). */
  applyQuality(q: Quality): void {
    this.quality = q;
    this.profile = PROFILES[q];
    const p = this.profile;
    this.sun.castShadow = p.shadows;
    if (this.sun.shadow.mapSize.x !== p.shadowMap) {
      this.sun.shadow.mapSize.set(p.shadowMap, p.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    setOutlinesEnabled(p.outlines);
    for (const w of [this.fishing.water, this.village.water, this.map.water]) w.setSegments(p.waterSegs);
    this.resize(this.css.w, this.css.h, this.css.dpr);
  }

  get particleScale(): number {
    return this.profile.particles;
  }

  /** The sun's shadow box covers the village; in the island overview shadows are switched off. */
  setOverviewShadows(overview: boolean): void {
    const want = this.profile.shadows && !overview;
    if (this.sun.castShadow !== want) this.sun.castShadow = want;
  }

  project(p: THREE.Vector3, cam: THREE.Camera): ScreenPt {
    const v = p.clone().project(cam);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
  }

  render(game: Game, dt: number): void {
    // Full-screen menus hide the world: keep the last frame on screen and save the GPU.
    if (game.overlays.some((o) => o.covers3d)) return;
    // Low tier draws the 3D layer at half rate; the 2D UI still runs every frame.
    if (++this.frame % this.profile.frameSkip !== 0) return;
    dt *= this.profile.frameSkip;
    const reveal = game.overlays.find((o) => o.name === 'reveal') as RevealOverlay | undefined;
    if (reveal) {
      this.showcase.sync(reveal, game.time);
      this.renderer.render(this.showcase.scene, this.showcase.camera);
      return;
    }
    this.mode = game.scene.name === 'fishing' ? 'fishing' : game.scene.name === 'map' ? 'map' : 'village';
    this.village.root.visible = this.mode === 'village';
    this.fishing.root.visible = this.mode === 'fishing';
    this.map.root.visible = this.mode === 'map';
    let cam: THREE.PerspectiveCamera;
    if (this.mode === 'map') {
      this.map.sync(game, game.scene as unknown as MapView, dt);
      cam = this.map.camera;
    } else if (this.mode === 'fishing') {
      this.fishing.sync(game.scene as FishingScene, game, dt);
      cam = this.fishing.camera;
    } else {
      this.village.sync(game, dt);
      cam = this.village.camera;
    }
    this.renderer.render(this.scene, cam);
  }
}

