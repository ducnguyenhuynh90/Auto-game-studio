// Procedural low-poly "cute" models. Everything is built from primitives so art can iterate as fast as code.
import * as THREE from 'three';
import { SPECIES_BY_ID } from '../core/data';

// ---------- Materials ----------
let gradientMap: THREE.DataTexture | null = null;
function toonRamp(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const matCache = new Map<string, THREE.MeshToonMaterial>();
export function toon(color: string | number, opts: { emissive?: string; transparent?: boolean; opacity?: number } = {}): THREE.MeshToonMaterial {
  const key = `${color}|${opts.emissive ?? ''}|${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), transparent: opts.transparent ?? (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1 });
    if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
    matCache.set(key, m);
  }
  return m;
}

const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x2b2118, side: THREE.BackSide });

/** Ink outlines double the draw calls; the low quality tier turns them off. */
export function setOutlinesEnabled(on: boolean): void {
  OUTLINE.visible = on;
}

/** Inverted-hull outline: gives the hand-inked cartoon edge cheaply. */
export function outline(mesh: THREE.Mesh, thickness = 1.06): THREE.Mesh {
  const o = new THREE.Mesh(mesh.geometry, OUTLINE);
  o.scale.setScalar(thickness);
  o.userData.outline = true;
  mesh.add(o);
  return mesh;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// ---------- Fish ----------
export interface FishModel {
  group: THREE.Group;
  tail: THREE.Object3D | null;
  setSilhouette(on: boolean, glow?: string | null): void;
}

const SILHOUETTE = new THREE.MeshBasicMaterial({ color: 0x0b3a4c, transparent: true, opacity: 0.55, depthWrite: false });

const fishTemplates = new Map<string, THREE.Group>();

/**
 * Fish ~1 unit long, facing +x. Each species is built once; later calls clone the template, sharing
 * geometry and materials (much cheaper on weak devices than rebuilding every spawned shadow).
 */
export function makeFish(speciesId: string): FishModel {
  let tpl = fishTemplates.get(speciesId);
  if (!tpl) {
    const built = buildFish(speciesId);
    if (built.tail) built.tail.name = 'tail';
    built.group.traverse((o) => (o.userData.sharedGeo = true));
    tpl = built.group;
    fishTemplates.set(speciesId, tpl);
  }
  const g = tpl.clone(true);
  const parts: { m: THREE.Mesh; mat: THREE.Material }[] = [];
  let tail: THREE.Object3D | null = null;
  g.traverse((o) => {
    if (o.name === 'tail') tail = o;
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.outline) parts.push({ m, mat: m.material as THREE.Material });
  });
  return { group: g, tail, setSilhouette: silhouetteFn(g, parts) };
}

function silhouetteFn(g: THREE.Group, parts: { m: THREE.Mesh; mat: THREE.Material }[]): FishModel['setSilhouette'] {
  return (on, glow) => {
    for (const p of parts) {
      if (p.m.userData.isEye) p.m.visible = !on;
      else p.m.material = on ? SILHOUETTE : p.mat;
      for (const c of p.m.children) if (c.userData.outline) c.visible = !on;
    }
    const old = g.getObjectByName('glow');
    if (old) g.remove(old);
    if (on && glow) {
      const halo = new THREE.Mesh(HALO_GEO, new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.rotation.x = -Math.PI / 2;
      halo.name = 'glow';
      halo.userData.disposeMat = true;
      halo.userData.sharedGeo = true;
      g.add(halo);
    }
  };
}

const HALO_GEO = new THREE.CircleGeometry(0.9, 24);

function buildFish(speciesId: string): FishModel {
  const sp = SPECIES_BY_ID[speciesId];
  const g = new THREE.Group();
  const parts: { m: THREE.Mesh; mat: THREE.Material }[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = g, ol = true) => {
    const m = mesh(geo, mat);
    if (ol) outline(m, 1.07);
    parent.add(m);
    parts.push({ m, mat });
    return m;
  };
  let tail: THREE.Object3D | null = null;

  if (sp.id === 'crab') {
    add(new THREE.SphereGeometry(0.32, 16, 12), toon(sp.color)).scale.set(1.2, 0.55, 1);
    for (const s of [-1, 1]) {
      const claw = add(new THREE.SphereGeometry(0.13, 12, 10), toon(sp.fin));
      claw.position.set(0.32, 0.05, s * 0.3);
      for (let i = 0; i < 3; i++) {
        const leg = add(new THREE.CylinderGeometry(0.025, 0.025, 0.3), toon(sp.fin), g, false);
        leg.position.set(-0.1 + i * 0.12, -0.05, s * 0.32);
        leg.rotation.x = s * 1.1;
      }
    }
    addEyes(g, parts, 0.3, 0.2, 0.09, 0.07);
  } else if (sp.id === 'squid') {
    const mantle = add(new THREE.ConeGeometry(0.2, 0.7, 14), toon(sp.color));
    mantle.rotation.z = -Math.PI / 2;
    mantle.position.x = 0.15;
    const t = new THREE.Group();
    t.position.x = -0.2;
    g.add(t);
    for (let i = 0; i < 5; i++) {
      const ten = add(new THREE.CylinderGeometry(0.03, 0.015, 0.4), toon(sp.fin), t, false);
      ten.rotation.z = Math.PI / 2;
      ten.position.set(-0.2, 0, (i - 2) * 0.06);
    }
    tail = t;
    addEyes(g, parts, -0.12, 0.05, 0.13, 0.08);
  } else if (sp.id === 'bottle') {
    const b = add(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 14), toon('#7cc7a0', { opacity: 0.85 }));
    b.rotation.z = Math.PI / 2;
    const neck = add(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), toon('#7cc7a0', { opacity: 0.85 }));
    neck.rotation.z = Math.PI / 2;
    neck.position.x = 0.32;
    const cork = add(new THREE.CylinderGeometry(0.065, 0.065, 0.07, 10), toon('#c79a5a'));
    cork.rotation.z = Math.PI / 2;
    cork.position.x = 0.43;
    const paper = add(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 10), toon('#fff3d6'), g, false);
    paper.rotation.z = Math.PI / 2;
  } else if (sp.crate) {
    const box = add(new THREE.BoxGeometry(0.5, 0.42, 0.42), toon('#7a5aa8'));
    box.rotation.y = 0.3;
    for (const y of [-0.12, 0.12]) {
      const band = add(new THREE.BoxGeometry(0.52, 0.05, 0.44), toon('#f2c650'), g, false);
      band.position.y = y;
      band.rotation.y = 0.3;
    }
    const q = add(new THREE.TorusGeometry(0.07, 0.025, 6, 12, Math.PI * 1.4), toon('#ffffff'), g, false);
    q.position.set(0.08, 0.06, 0.24);
    q.rotation.set(0, 0.3, -0.6);
    const dot = add(new THREE.SphereGeometry(0.03, 6, 5), toon('#ffffff'), g, false);
    dot.position.set(0.05, -0.1, 0.25);
  } else if (sp.shape === 'prawn' || sp.shape === 'lobster') {
    // curled segmented body, long feelers; lobsters get big spiny antennae
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const r = 0.13 - i * 0.012;
      const seg = add(new THREE.SphereGeometry(r, 10, 8), toon(i % 2 ? sp.color : sp.fin === '#f08a3a' ? '#7fa8d9' : sp.color));
      const a = (i / segs) * 1.6;
      seg.position.set(0.3 - Math.sin(a) * 0.45, -Math.cos(a) * 0.12 + 0.12 - i * 0.02, 0);
      seg.scale.set(1.1, 0.9, 0.9);
    }
    const fan = add(new THREE.ConeGeometry(0.12, 0.2, 5), toon(sp.fin));
    fan.position.set(-0.22, -0.12, 0);
    fan.rotation.z = Math.PI / 2;
    tail = fan;
    for (const z of [-0.06, 0.06]) {
      const ant = add(new THREE.CylinderGeometry(0.008, 0.012, sp.shape === 'lobster' ? 0.9 : 0.7, 4), toon(sp.fin), g, false);
      ant.position.set(0.6, 0.2, z * 2);
      ant.rotation.z = -1.0;
    }
    if (sp.shape === 'lobster') {
      for (const z of [-0.14, 0.14]) {
        const claw = add(new THREE.SphereGeometry(0.08, 8, 6), toon(sp.fin));
        claw.position.set(0.48, -0.05, z);
        claw.scale.set(1.6, 0.7, 0.8);
      }
    } else {
      for (const z of [-0.1, 0.1]) {
        const arm = add(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), toon('#5fa0e8'), g, false);
        arm.position.set(0.55, -0.05, z);
        arm.rotation.z = Math.PI / 2 + 0.2;
      }
    }
    addEyes(g, parts, 0.42, 0.1, 0.07, 0.04);
  } else if (sp.id === 'chest') {
    add(new THREE.BoxGeometry(0.6, 0.32, 0.42), toon('#9c6a32'));
    const lid = add(new THREE.CylinderGeometry(0.21, 0.21, 0.6, 12, 1, false, 0, Math.PI), toon('#b07a3a'));
    lid.rotation.z = Math.PI / 2;
    lid.rotation.y = Math.PI / 2;
    lid.position.y = 0.16;
    const band = add(new THREE.BoxGeometry(0.62, 0.06, 0.44), toon('#f2c650'), g, false);
    band.position.y = 0.05;
    const lock = add(new THREE.BoxGeometry(0.06, 0.12, 0.46), toon('#f2c650'), g, false);
    lock.position.y = 0.12;
  } else {
    const eel = sp.shape === 'eel';
    const tall = eel ? 0.13 : sp.shape === 'angler' ? 0.62 : sp.id === 'grouper' ? 0.5 : sp.id === 'trevally' || sp.id === 'snapper' || sp.id === 'carp' ? 0.44 : 0.32;
    const body = add(new THREE.SphereGeometry(0.5, 20, 14), twoTone(sp.color, sp.belly));
    body.scale.set(1, tall * 1.2, eel ? 0.28 : 0.42);
    if (sp.id === 'oarfish') {
      // the long red crest of the oarfish
      const crest = add(new THREE.BoxGeometry(0.9, 0.08, 0.02), toon(sp.fin), g, false);
      crest.position.y = tall * 0.6;
    }
    if (sp.shape === 'angler') {
      const stalk = add(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 4), toon(sp.fin), g, false);
      stalk.position.set(0.32, 0.42, 0);
      stalk.rotation.z = -0.6;
      const lure = mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }), false);
      lure.position.set(0.44, 0.55, 0);
      g.add(lure);
      const teeth = add(new THREE.ConeGeometry(0.02, 0.06, 3), toon('#ffffff'), g, false);
      teeth.position.set(0.47, -0.04, 0.08);
    }
    if (sp.id === 'carp') {
      // dragon carp whiskers
      for (const z of [-0.12, 0.12]) {
        const wh = add(new THREE.TorusGeometry(0.15, 0.012, 4, 10, Math.PI), toon('#ffd27a'), g, false);
        wh.position.set(0.5, -0.05, z);
        wh.rotation.set(Math.PI / 2, 0, 0.6);
      }
    }
    // tail fin
    const tg = new THREE.Group();
    tg.position.x = -0.45;
    g.add(tg);
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.lineTo(-0.32, 0.26);
    tailShape.quadraticCurveTo(-0.22, 0, -0.32, -0.26);
    tailShape.lineTo(0, 0);
    const tailGeo = new THREE.ExtrudeGeometry(tailShape, { depth: 0.04, bevelEnabled: false });
    tailGeo.translate(0, 0, -0.02);
    add(tailGeo, toon(sp.fin), tg);
    tail = tg;
    // dorsal fin
    const fin = new THREE.Shape();
    fin.moveTo(-0.18, 0);
    fin.quadraticCurveTo(-0.02, 0.28, 0.12, 0);
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.03, bevelEnabled: false });
    finGeo.translate(0, tall * 0.5, -0.015);
    add(finGeo, toon(sp.fin));
    // side fins
    for (const s of [-1, 1]) {
      const pf = add(new THREE.SphereGeometry(0.09, 10, 8), toon(sp.fin), g, false);
      pf.scale.set(1.4, 0.5, 0.3);
      pf.position.set(0.08, -tall * 0.15, s * 0.2);
      pf.rotation.y = s * 0.5;
    }
    addEyes(g, parts, 0.3, tall * 0.12, 0.17, Math.max(0.07, tall * 0.22));
    if (sp.id === 'golden') {
      const sparkle = new THREE.PointLight(0xffd36b, 1.2, 2.5);
      g.add(sparkle);
    }
  }

  return { group: g, tail, setSilhouette: silhouetteFn(g, parts) };
}

function addEyes(g: THREE.Group, parts: { m: THREE.Mesh; mat: THREE.Material }[], x: number, y: number, z: number, r: number): void {
  for (const s of [-1, 1]) {
    const white = mesh(new THREE.SphereGeometry(r, 14, 10), toon('#ffffff'), false);
    white.position.set(x, y, s * z);
    const pupil = mesh(new THREE.SphereGeometry(r * 0.55, 12, 8), new THREE.MeshBasicMaterial({ color: 0x1d1410 }), false);
    pupil.position.set(r * 0.35, r * 0.05, s * r * 0.55);
    const shine = mesh(new THREE.SphereGeometry(r * 0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), false);
    shine.position.set(r * 0.25, r * 0.3, s * r * 0.45);
    pupil.add(shine);
    white.add(pupil);
    white.userData.isEye = true;
    g.add(white);
    parts.push({ m: white, mat: white.material as THREE.Material });
  }
}

/** Vertex-coloured material: back colour on top, belly colour underneath. */
const twoToneCache = new Map<string, THREE.MeshToonMaterial>();
function twoTone(top: string, belly: string): THREE.MeshToonMaterial {
  const key = top + belly;
  let m = twoToneCache.get(key);
  if (!m) {
    const tex = document.createElement('canvas');
    tex.width = 4;
    tex.height = 64;
    const c = tex.getContext('2d')!;
    c.fillStyle = top;
    c.fillRect(0, 0, 4, 36);
    c.fillStyle = belly;
    c.fillRect(0, 36, 4, 28);
    const t = new THREE.CanvasTexture(tex);
    t.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() });
    twoToneCache.set(key, m);
  }
  return m;
}

// ---------- Jar & bottle ----------
export interface JarModel {
  group: THREE.Group;
  body: THREE.Mesh;
  lid: THREE.Group;
}

export function makeJar(): JarModel {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  const prof = [
    [0.0, 0],
    [0.28, 0],
    [0.4, 0.08],
    [0.5, 0.3],
    [0.52, 0.5],
    [0.46, 0.72],
    [0.32, 0.88],
    [0.27, 0.92],
    [0.29, 1.0],
    [0.24, 1.0],
  ];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const body = mesh(new THREE.LatheGeometry(pts, 28), toon('#b06a38'));
  outline(body, 1.04);
  g.add(body);
  const band = mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 28), toon('#f0d2a0'), false);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.55;
  g.add(band);
  const lid = new THREE.Group();
  const cone = mesh(new THREE.ConeGeometry(0.4, 0.22, 24), toon('#e3c27a'));
  outline(cone, 1.06);
  cone.position.y = 0.11;
  lid.add(cone);
  const knob = mesh(new THREE.SphereGeometry(0.05, 8, 6), toon('#a0763a'));
  knob.position.y = 0.24;
  lid.add(knob);
  lid.position.y = 1.0;
  g.add(lid);
  return { group: g, body, lid };
}

export function makeBottle(sauceColor: string, tierColor: string): THREE.Group {
  const g = new THREE.Group();
  const prof = [
    [0, 0],
    [0.24, 0],
    [0.27, 0.04],
    [0.27, 0.55],
    [0.2, 0.7],
    [0.09, 0.8],
    [0.09, 1.0],
    [0, 1.0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const glass = mesh(new THREE.LatheGeometry(prof, 24), toon(sauceColor, { opacity: 0.92 }));
  outline(glass, 1.05);
  g.add(glass);
  const label = mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.26, 24, 1, true), toon('#fff8ec'), false);
  label.position.y = 0.3;
  g.add(label);
  const stripe = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 24, 1, true), toon(tierColor), false);
  stripe.position.y = 0.41;
  g.add(stripe);
  const cap = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 16), toon('#c0392b'));
  cap.position.y = 1.02;
  g.add(cap);
  const shine = mesh(new THREE.BoxGeometry(0.04, 0.35, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }), false);
  shine.position.set(-0.16, 0.6, 0.22);
  g.add(shine);
  return g;
}

// ---------- People & boats ----------
export function makeFisherman(shirt = '#3d6f8f'): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.22, 0.32, 6, 14), toon(shirt));
  outline(body, 1.06);
  body.position.y = 0.42;
  g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.24, 18, 14), toon('#f0c49a'));
  outline(head, 1.05);
  head.position.y = 0.93;
  g.add(head);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1d1410 }), false);
    eye.position.set(s * 0.08, 0.95, 0.21);
    g.add(eye);
    const blush = mesh(new THREE.CircleGeometry(0.04, 10), new THREE.MeshBasicMaterial({ color: 0xff9a8a, transparent: true, opacity: 0.7 }), false);
    blush.position.set(s * 0.14, 0.88, 0.225);
    g.add(blush);
  }
  // nón lá: conical palm-leaf hat
  const hat = mesh(new THREE.ConeGeometry(0.46, 0.3, 28), toon('#f2d98a'));
  outline(hat, 1.04);
  hat.position.y = 1.2;
  g.add(hat);
  const brimRing = mesh(new THREE.TorusGeometry(0.44, 0.015, 4, 28), toon('#c9a95a'), false);
  brimRing.rotation.x = Math.PI / 2;
  brimRing.position.y = 1.06;
  g.add(brimRing);
  return g;
}

export function makeBasketBoat(): THREE.Group {
  const g = new THREE.Group();
  const bowl = mesh(new THREE.SphereGeometry(0.95, 26, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2.4), toon('#7b5a35'));
  bowl.material = toon('#7b5a35');
  (bowl.geometry as THREE.BufferGeometry).scale(1, 0.55, 1);
  bowl.position.y = 0.32;
  const inner = bowl.clone();
  inner.material = new THREE.MeshToonMaterial({ color: '#4a3420', side: THREE.BackSide, gradientMap: toonRamp() });
  g.add(bowl, inner);
  const rim = mesh(new THREE.TorusGeometry(0.93, 0.07, 8, 32), toon('#a57a48'));
  outline(rim, 1.08);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.32;
  g.add(rim);
  const floor = mesh(new THREE.CircleGeometry(0.88, 28), toon('#5a3d20'), false);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.12;
  g.add(floor);
  // woven ribs
  for (let i = 0; i < 10; i++) {
    const rib = mesh(new THREE.TorusGeometry(0.9, 0.012, 4, 20, Math.PI / 2.5), toon('#5a3d20'), false);
    rib.rotation.y = (i / 10) * Math.PI * 2;
    rib.rotation.z = -Math.PI / 2 - 0.1;
    rib.position.y = 0.32;
    g.add(rib);
  }
  return g;
}

/** Boat by level: basket → wooden → junk sailboat → iron trawler. */
export function makeBoat(level: number): THREE.Group {
  if (level >= 3) return makeTrawler();
  if (level === 2) return makeJunk();
  if (level === 1) return makeWoodenBoat();
  return makeBasketBoat();
}

/** Junk with battened red sails, the classic silhouette of the Gulf of Tonkin. */
function makeJunk(): THREE.Group {
  const g = makeWoodenBoat();
  const oldSail = g.children.filter((c) => (c as THREE.Mesh).geometry?.type === 'ShapeGeometry');
  for (const c of oldSail) g.remove(c);
  for (const [x, h] of [
    [-0.55, 1.4],
    [0.35, 1.8],
  ] as const) {
    const mast = mesh(new THREE.CylinderGeometry(0.04, 0.04, h + 0.4), toon('#6e4423'));
    mast.position.set(x, 0.4 + h / 2, 0);
    g.add(mast);
    const sail = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const panel = mesh(new THREE.BoxGeometry(0.75, h / 4 - 0.04, 0.02), toon(i % 2 ? '#c0392b' : '#d9573f'));
      panel.position.set(0.32, 0.55 + (i + 0.5) * (h / 4), 0);
      sail.add(panel);
      const batten = mesh(new THREE.BoxGeometry(0.8, 0.03, 0.04), toon('#3a2a1a'), false);
      batten.position.set(0.32, 0.55 + i * (h / 4), 0);
      sail.add(batten);
    }
    sail.position.x = x;
    g.add(sail);
  }
  return g;
}

function makeTrawler(): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-1.4, 0.45);
  s.lineTo(-1.3, -0.15);
  s.quadraticCurveTo(0, -0.25, 1.3, -0.1);
  s.lineTo(1.6, 0.55);
  s.lineTo(-1.4, 0.45);
  const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
  hullGeo.translate(0, 0, -0.5);
  const hull = mesh(hullGeo, toon('#2f5f8f'));
  outline(hull, 1.03);
  g.add(hull);
  const stripe = mesh(new THREE.BoxGeometry(2.9, 0.1, 1.06), toon('#f5f0e6'), false);
  stripe.position.set(0.1, 0.4, 0);
  g.add(stripe);
  const cabin = mesh(new THREE.BoxGeometry(0.9, 0.6, 0.8), toon('#f5f0e6'));
  outline(cabin, 1.03);
  cabin.position.set(-0.6, 0.8, 0);
  g.add(cabin);
  const roof = mesh(new THREE.BoxGeometry(1.0, 0.08, 0.9), toon('#c0392b'), false);
  roof.position.set(-0.6, 1.14, 0);
  g.add(roof);
  const stack = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 10), toon('#2b2118'));
  stack.position.set(-0.9, 1.4, 0);
  g.add(stack);
  const crane = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4), toon('#f2b233'));
  crane.position.set(0.7, 1.0, 0);
  crane.rotation.z = -0.5;
  g.add(crane);
  return g;
}

export function makeWoodenBoat(): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-1.3, 0.35);
  s.quadraticCurveTo(-1.1, -0.15, 0, -0.18);
  s.quadraticCurveTo(1.1, -0.15, 1.45, 0.45);
  s.lineTo(-1.3, 0.35);
  const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
  hullGeo.translate(0, 0, -0.45);
  const hull = mesh(hullGeo, toon('#4f86b8'));
  outline(hull, 1.03);
  g.add(hull);
  const stripe = mesh(new THREE.BoxGeometry(2.6, 0.08, 0.96), toon('#d24a3a'), false);
  stripe.position.set(0.05, 0.33, 0);
  g.add(stripe);
  // painted eyes on the bow: a real Vietnamese boat tradition
  for (const z of [-0.48, 0.48]) {
    const eye = mesh(new THREE.CircleGeometry(0.1, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }), false);
    eye.position.set(1.05, 0.18, z * 1.02);
    eye.rotation.y = z > 0 ? 0 : Math.PI;
    const pupil = mesh(new THREE.CircleGeometry(0.05, 10), new THREE.MeshBasicMaterial({ color: 0x1d1410 }), false);
    pupil.position.set(0.02, 0, 0.002);
    eye.add(pupil);
    g.add(eye);
  }
  const mast = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8), toon('#6e4423'));
  mast.position.set(-0.1, 1.1, 0);
  g.add(mast);
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0);
  sailShape.lineTo(0, 1.5);
  sailShape.quadraticCurveTo(0.6, 0.8, 0.9, 0.05);
  sailShape.lineTo(0, 0);
  const sail = mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshToonMaterial({ color: '#f5ead0', side: THREE.DoubleSide, gradientMap: toonRamp() }));
  sail.position.set(-0.05, 0.4, 0);
  g.add(sail);
  return g;
}

// ---------- Village props ----------
export function makePalm(h = 2.2): THREE.Group {
  const g = new THREE.Group();
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.09 - i * 0.008, 0.11 - i * 0.008, h / segs, 8), toon(i % 2 ? '#8a6238' : '#7a5532'));
    seg.position.set(Math.sin(i * 0.3) * 0.12 * i * 0.3, (h / segs) * (i + 0.5), 0);
    g.add(seg);
  }
  const top = new THREE.Group();
  top.position.set(0.15, h, 0);
  top.name = 'top';
  for (let i = 0; i < 7; i++) {
    const leaf = mesh(new THREE.SphereGeometry(0.5, 10, 6), toon(i % 2 ? '#4f9a48' : '#5fae52'));
    leaf.scale.set(1.3, 0.12, 0.38);
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 7) * Math.PI * 2;
    leaf.position.x = 0.55;
    leaf.rotation.z = -0.45;
    pivot.add(leaf);
    top.add(pivot);
  }
  for (let i = 0; i < 3; i++) {
    const coco = mesh(new THREE.SphereGeometry(0.09, 8, 6), toon('#6b4a2a'));
    coco.position.set(Math.cos(i * 2.1) * 0.12, -0.1, Math.sin(i * 2.1) * 0.12);
    top.add(coco);
  }
  g.add(top);
  return g;
}

export function makeHouse(level: number): THREE.Group {
  const g = new THREE.Group();
  const big = level >= 6;
  const w = big ? 2.2 : 1.7;
  const d = big ? 1.6 : 1.3;
  const h = big ? 1.2 : 0.95;
  for (const [x, z] of [
    [-w / 2 + 0.12, -d / 2 + 0.12],
    [w / 2 - 0.12, -d / 2 + 0.12],
    [-w / 2 + 0.12, d / 2 - 0.12],
    [w / 2 - 0.12, d / 2 - 0.12],
  ]) {
    const stilt = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35), toon('#6e4423'));
    stilt.position.set(x, 0.17, z);
    g.add(stilt);
  }
  const walls = mesh(new THREE.BoxGeometry(w, h, d), toon(big ? '#f3e2bf' : '#d2a46a'));
  outline(walls, 1.02);
  walls.position.y = 0.35 + h / 2;
  g.add(walls);
  const door = mesh(new THREE.BoxGeometry(0.36, 0.6, 0.04), toon('#6e4423'), false);
  door.position.set(0.15, 0.35 + 0.3, d / 2 + 0.01);
  g.add(door);
  const win = mesh(new THREE.BoxGeometry(0.3, 0.26, 0.04), toon('#ffe2a0', { emissive: '#6b4a10' }), false);
  win.position.set(-w / 2 + 0.4, 0.35 + h * 0.62, d / 2 + 0.01);
  g.add(win);
  const roof = mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.85, 0.9, 4), toon(big ? '#c4553a' : '#d9b35b'));
  outline(roof, 1.03);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.15, 1, 0.85);
  roof.position.y = 0.35 + h + 0.42;
  g.add(roof);
  return g;
}

export function makeMarket(level: number): THREE.Group {
  const g = new THREE.Group();
  const awning = level >= 1 ? '#2f8fbf' : '#e05a3a';
  for (const x of [-0.8, 0.8])
    for (const z of [-0.35, 0.35]) {
      const post = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3), toon('#6e4423'));
      post.position.set(x, 0.65, z);
      g.add(post);
    }
  const table = mesh(new THREE.BoxGeometry(1.8, 0.12, 0.8), toon('#a06a3d'));
  outline(table, 1.03);
  table.position.y = 0.62;
  g.add(table);
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const s = mesh(new THREE.BoxGeometry(1.9 / stripes, 0.06, 1.1), toon(i % 2 ? '#fff4e0' : awning));
    s.position.set(-0.95 + (1.9 / stripes) * (i + 0.5), 1.38, 0.05);
    s.rotation.x = 0.22;
    g.add(s);
    const flap = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 12, 1, false, 0, Math.PI), toon(i % 2 ? '#fff4e0' : awning), false);
    flap.rotation.x = Math.PI / 2;
    flap.rotation.z = Math.PI;
    flap.position.set(-0.95 + (1.9 / stripes) * (i + 0.5), 1.26, 0.6);
    g.add(flap);
  }
  if (level >= 2) {
    const sign = mesh(new THREE.OctahedronGeometry(0.2), toon('#f5c242', { emissive: '#5a3a00' }));
    sign.position.set(0, 1.75, 0.1);
    sign.name = 'star';
    g.add(sign);
  }
  return g;
}

export function makeSaltPile(): THREE.Mesh {
  const m = mesh(new THREE.ConeGeometry(0.3, 0.38, 10), toon('#ffffff'));
  outline(m, 1.05);
  m.position.y = 0.19;
  return m;
}

export function makeLantern(color: string): THREE.Mesh {
  const m = mesh(new THREE.SphereGeometry(0.12, 12, 10), toon(color, { emissive: color === '#e8443a' ? '#5a1010' : '#5a3a00' }), false);
  m.scale.y = 1.25;
  return m;
}

/** A soft radial sunburst used behind catches and reveals. */
export function makeSunburst(color = '#ffe6a0'): THREE.Mesh {
  const rays = 14;
  const geo = new THREE.BufferGeometry();
  const pos: number[] = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const w = 0.12;
    pos.push(0, 0, 0, Math.cos(a - w) * 6, Math.sin(a - w) * 6, 0, Math.cos(a + w) * 6, Math.sin(a + w) * 6, 0);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
}
