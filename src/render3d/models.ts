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

/** Remove an object and free its geometries. Materials are shared/cached, so they are kept,
 * except one-off materials flagged with userData.disposeMat. */
export function discard(obj: THREE.Object3D | null | undefined): void {
  if (!obj) return;
  obj.parent?.remove(obj);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    // shared template geometry (fish clones) must survive; one-off geometry is freed
    if (m.geometry && !m.userData.outline && !m.userData.sharedGeo) m.geometry.dispose();
    if (m.userData.disposeMat) (m.material as THREE.Material).dispose();
  });
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
/** The player's boat character: Lan (kept for existing callers). */
export function makeFisherman(): THREE.Group {
  return makeCharacter('lan');
}

/** Story cast as chunky toy figures. Each has one signature silhouette detail (Pixar: specificity). */
export function makeCharacter(id: 'lan' | 'nam' | 'rua' | 'toc' | 'tu' | 'hanh' | 'muc'): THREE.Group {
  if (id === 'rua') return makeTurtle();
  if (id === 'muc') return makeDog();
  const look = {
    lan: { shirt: '#3d6f8f', skin: '#f0c49a', hair: '#1d1410' },
    nam: { shirt: '#7a4a9a', skin: '#e2b48a', hair: '#c9c4bc' },
    toc: { shirt: '#5a6470', skin: '#efc6a0', hair: '#141414' },
    tu: { shirt: '#8a6238', skin: '#c99068', hair: '#2a1d14' },
    hanh: { shirt: '#c0603e', skin: '#ecc09a', hair: '#1d1410' },
  }[id];
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.22, 0.32, 6, 14), toon(look.shirt));
  outline(body, 1.06);
  body.position.y = 0.42;
  g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.24, 18, 14), toon(look.skin));
  outline(head, 1.05);
  head.position.y = 0.93;
  g.add(head);
  // hair cap
  const hair = mesh(new THREE.SphereGeometry(0.25, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), toon(look.hair), false);
  hair.position.y = 0.95;
  hair.rotation.x = -0.25;
  g.add(hair);
  for (const sd of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1d1410 }), false);
    eye.position.set(sd * 0.08, 0.95, 0.21);
    g.add(eye);
    const shine = mesh(new THREE.SphereGeometry(0.011, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), false);
    shine.position.set(sd * 0.08 + 0.012, 0.962, 0.24);
    g.add(shine);
    const blush = mesh(new THREE.CircleGeometry(0.04, 10), new THREE.MeshBasicMaterial({ color: 0xff9a8a, transparent: true, opacity: 0.7 }), false);
    blush.position.set(sd * 0.14, 0.88, 0.225);
    g.add(blush);
  }
  const smile = mesh(new THREE.TorusGeometry(0.045, 0.01, 4, 10, Math.PI), new THREE.MeshBasicMaterial({ color: 0x5a2a1a }), false);
  smile.position.set(0, 0.87, 0.225);
  smile.rotation.z = Math.PI;
  g.add(smile);
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  if (id === 'lan') {
    // grandmother's nón lá, two sizes too big
    const hat = add(mesh(new THREE.ConeGeometry(0.56, 0.34, 28), toon('#f2d98a')), 0, 1.21, 0);
    outline(hat, 1.04);
    const brim = add(mesh(new THREE.TorusGeometry(0.54, 0.015, 4, 28), toon('#c9a95a'), false), 0, 1.05, 0);
    brim.rotation.x = Math.PI / 2;
  } else if (id === 'nam') {
    // grey bun, round glasses, bamboo ladle
    add(mesh(new THREE.SphereGeometry(0.11, 12, 10), toon(look.hair)), 0, 1.12, -0.12);
    for (const sd of [-1, 1]) {
      const lens = add(mesh(new THREE.TorusGeometry(0.05, 0.008, 4, 14), new THREE.MeshBasicMaterial({ color: 0x3a2a1a }), false), sd * 0.08, 0.95, 0.225);
      lens.rotation.y = 0;
    }
    const ladle = add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6), toon('#c9a26a'), false), 0.3, 0.55, 0.1);
    ladle.rotation.z = 0.3;
    add(mesh(new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon('#c9a26a'), false), 0.39, 0.27, 0.1);
  } else if (id === 'toc') {
    // sunglasses, red tie, gold stopwatch
    add(mesh(new THREE.BoxGeometry(0.3, 0.06, 0.03), new THREE.MeshBasicMaterial({ color: 0x111111 }), false), 0, 0.96, 0.225);
    add(mesh(new THREE.BoxGeometry(0.06, 0.26, 0.03), toon('#c0392b'), false), 0, 0.52, 0.215);
    add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), toon('#f2c14e', { emissive: '#5a4000' }), false), 0.22, 0.5, 0.12).rotation.x = Math.PI / 2;
    add(mesh(new THREE.BoxGeometry(0.14, 0.025, 0.02), toon('#141414'), false), 0, 0.905, 0.235);
  } else if (id === 'tu') {
    // flat straw hat and a big mustache
    add(mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.05, 20), toon('#d9b35b')), 0, 1.13, 0);
    add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 16), toon('#d9b35b')), 0, 1.2, 0);
    add(mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), toon('#2a1d14'), false), 0, 0.9, 0.235);
  } else if (id === 'hanh') {
    // long ponytail and a glowing lantern
    add(mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), toon(look.hair), false), 0, 0.75, -0.2);
    add(mesh(new THREE.SphereGeometry(0.09, 10, 8), toon('#ffd27a', { emissive: '#c08000' }), false), 0.3, 0.42, 0.12);
    add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), toon('#3a2a1a'), false), 0.3, 0.58, 0.12);
  }
  return g;
}

/** Rùa: an ancient sea turtle with a barnacle crown. */
export function makeTurtle(): THREE.Group {
  const g = new THREE.Group();
  const shell = mesh(new THREE.SphereGeometry(0.42, 18, 12), toon('#4f8a48'));
  outline(shell, 1.05);
  shell.scale.set(1, 0.55, 1.15);
  shell.position.y = 0.32;
  g.add(shell);
  for (let i = 0; i < 6; i++) {
    const plate = mesh(new THREE.CircleGeometry(0.1, 6), toon('#6aa84f'), false);
    const a = (i / 6) * Math.PI * 2;
    plate.position.set(Math.cos(a) * 0.2, 0.5, Math.sin(a) * 0.24);
    plate.rotation.x = -Math.PI / 2 + Math.sin(a) * 0.4;
    g.add(plate);
  }
  const head = mesh(new THREE.SphereGeometry(0.16, 14, 10), toon('#9cc27a'));
  outline(head, 1.06);
  head.position.set(0, 0.42, 0.5);
  head.name = 'head';
  g.add(head);
  for (const sd of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1d1410 }), false);
    eye.position.set(sd * 0.07, 0.47, 0.63);
    g.add(eye);
    const lid = mesh(new THREE.SphereGeometry(0.034, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon('#9cc27a'), false);
    lid.position.set(sd * 0.07, 0.475, 0.63);
    g.add(lid); // half-closed lids: the famous slow blink
    for (const z of [-1, 1]) {
      const flip = mesh(new THREE.SphereGeometry(0.12, 10, 6), toon('#9cc27a'), false);
      flip.scale.set(1.6, 0.3, 0.7);
      flip.position.set(sd * 0.42, 0.2, z * 0.28);
      g.add(flip);
    }
  }
  // barnacle crown
  for (let i = 0; i < 4; i++) {
    const b = mesh(new THREE.ConeGeometry(0.035, 0.07, 6), toon('#e8e2cf'), false);
    b.position.set(-0.06 + i * 0.04, 0.6, 0.48);
    g.add(b);
  }
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

/** Small shrine on a sea rock, inspired by Phú Quốc's Dinh Cậu (a temple-lighthouse on the rocks). */
export function makeShrine(): THREE.Group {
  const g = new THREE.Group();
  const rock = mesh(new THREE.DodecahedronGeometry(0.9, 0), toon('#8a8478'));
  outline(rock, 1.03);
  rock.scale.set(1.2, 0.7, 1);
  rock.position.y = 0.2;
  g.add(rock);
  const base = mesh(new THREE.BoxGeometry(0.7, 0.5, 0.6), toon('#f2e6c8'));
  outline(base, 1.04);
  base.position.y = 0.95;
  g.add(base);
  const roof = mesh(new THREE.ConeGeometry(0.62, 0.38, 4), toon('#c0392b'));
  outline(roof, 1.04);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.38;
  g.add(roof);
  const tip = mesh(new THREE.SphereGeometry(0.07, 8, 6), toon('#f2c14e', { emissive: '#5a4000' }), false);
  tip.position.y = 1.62;
  g.add(tip);
  const door = mesh(new THREE.BoxGeometry(0.2, 0.3, 0.02), toon('#7a1f16'), false);
  door.position.set(0, 0.87, 0.31);
  g.add(door);
  return g;
}

/** Phú Quốc-style wooden fermenting barrel (thùng gỗ), the island's signature. */
export function makeBarrel(): THREE.Group {
  const g = new THREE.Group();
  const prof = [
    [0, 0],
    [0.36, 0],
    [0.42, 0.25],
    [0.44, 0.5],
    [0.42, 0.75],
    [0.36, 1],
    [0, 1],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = mesh(new THREE.LatheGeometry(prof, 18), toon('#9a6a3a'));
  outline(body, 1.04);
  g.add(body);
  for (const y of [0.18, 0.82]) {
    const hoop = mesh(new THREE.TorusGeometry(0.41, 0.025, 4, 18), toon('#3a2a1a'), false);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    g.add(hoop);
  }
  return g;
}

// ---------- Evolution stages: one model per upgrade level ----------

/** Rods evolve: bamboo → red lacquer with gold bands → carbon with a reel → master rod with a dragon head. */
export function makeRod(level: number): THREE.Group {
  const g = new THREE.Group();
  const len = 2.4;
  const colors = ['#c9a66b', '#b03a2e', '#2b2b30', '#f2ead8'];
  const shaft = mesh(new THREE.CylinderGeometry(0.018, 0.034, len, 8), toon(colors[level] ?? colors[0]));
  shaft.position.y = len / 2;
  g.add(shaft);
  if (level === 0) {
    // bamboo nodes
    for (let i = 1; i < 6; i++) {
      const node = mesh(new THREE.TorusGeometry(0.03 - i * 0.002, 0.008, 4, 10), toon('#9a7a45'), false);
      node.rotation.x = Math.PI / 2;
      node.position.y = (i / 6) * len;
      g.add(node);
    }
  } else {
    // decorative bands
    for (let i = 1; i <= level + 1; i++) {
      const band = mesh(new THREE.TorusGeometry(0.032, 0.01, 4, 12), toon('#f2c14e', { emissive: '#3a2a00' }), false);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.25 + i * 0.16;
      g.add(band);
    }
  }
  const grip = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.35, 10), toon(level >= 2 ? '#1a1a1a' : '#6e4423'));
  grip.position.y = 0.18;
  g.add(grip);
  if (level >= 2) {
    const reel = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 14), toon(level === 3 ? '#f2c14e' : '#8a8f96'));
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0.08, 0.45, 0);
    g.add(reel);
  }
  if (level === 3) {
    // dragon head at the tip
    const head = mesh(new THREE.ConeGeometry(0.07, 0.2, 6), toon('#2f8f6a'));
    head.position.y = len + 0.08;
    g.add(head);
    for (const s of [-1, 1]) {
      const horn = mesh(new THREE.ConeGeometry(0.015, 0.1, 4), toon('#f2c14e'), false);
      horn.position.set(s * 0.04, len + 0.17, 0);
      horn.rotation.z = -s * 0.5;
      g.add(horn);
    }
  }
  const tip = new THREE.Object3D();
  tip.name = 'tip';
  tip.position.y = len;
  g.add(tip);
  return g;
}

export function makeSpool(level: number): THREE.Group {
  const g = new THREE.Group();
  const colors = ['#c9b48a', '#f4f0e6', '#3aa0d9', '#e0a21a'];
  const core = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.36, 20), toon(colors[level]));
  outline(core, 1.04);
  g.add(core);
  for (const y of [-0.21, 0.21]) {
    const rim = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 20), toon('#6e4423'));
    rim.position.y = y;
    g.add(rim);
  }
  // more line wound = longer reach
  for (let i = 0; i < level + 1; i++) {
    const wrap = mesh(new THREE.TorusGeometry(0.33 + i * 0.025, 0.015, 4, 20), toon(colors[level]), false);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.y = -0.12 + i * 0.08;
    g.add(wrap);
  }
  g.rotation.x = 0.5;
  return g;
}

export function makeHookModel(level: number): THREE.Group {
  const g = new THREE.Group();
  const colors = ['#8a7a66', '#6b6f75', '#c9d1d9', '#f2c14e'];
  const mat = toon(colors[level], level === 3 ? { emissive: '#4a3000' } : {});
  const shank = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8), mat);
  shank.position.y = 0.4;
  g.add(shank);
  const bend = mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 16, Math.PI * (level === 0 ? 0.6 : 1.1)), mat);
  bend.rotation.z = Math.PI;
  bend.position.set(0.2, 0, 0);
  g.add(bend);
  const eye = mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 12), mat);
  eye.position.y = 0.85;
  g.add(eye);
  if (level >= 1) {
    const barb = mesh(new THREE.ConeGeometry(0.04, 0.14, 6), mat);
    barb.position.set(0.4, 0.07, 0);
    g.add(barb);
  }
  if (level === 3) {
    for (let i = 0; i < 3; i++) {
      const scale = mesh(new THREE.SphereGeometry(0.05, 6, 4), toon('#2f8f6a'), false);
      scale.position.set(0, 0.25 + i * 0.18, 0.03);
      g.add(scale);
    }
  }
  return g;
}

export function makeBaitModel(level: number): THREE.Group {
  const g = new THREE.Group();
  if (level === 0) {
    const bread = mesh(new THREE.BoxGeometry(0.6, 0.35, 0.4), toon('#e8c88a'));
    outline(bread, 1.05);
    g.add(bread);
    const crust = mesh(new THREE.BoxGeometry(0.62, 0.08, 0.42), toon('#b07a3a'), false);
    crust.position.y = 0.17;
    g.add(crust);
  } else if (level === 1) {
    for (let i = 0; i < 6; i++) {
      const seg = mesh(new THREE.SphereGeometry(0.11 - i * 0.01, 10, 8), toon('#f08a5a'));
      const a = (i / 6) * 2.2;
      seg.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0);
      g.add(seg);
    }
  } else if (level === 2) {
    for (let i = 0; i < 3; i++) {
      const strip = mesh(new THREE.BoxGeometry(0.12, 0.6, 0.05), toon('#f4e0e8'));
      outline(strip, 1.05);
      strip.position.x = (i - 1) * 0.18;
      strip.rotation.z = (i - 1) * 0.25;
      g.add(strip);
    }
  } else {
    // glow worms
    for (let i = 0; i < 3; i++) {
      const worm = mesh(new THREE.CapsuleGeometry(0.06, 0.4, 4, 8), toon('#a8ff9a', { emissive: '#3aa040' }));
      worm.position.x = (i - 1) * 0.2;
      worm.rotation.z = Math.sin(i * 2) * 0.6;
      g.add(worm);
    }
    g.add(new THREE.PointLight(0xa8ff9a, 1.2, 2));
  }
  return g;
}

/** A tiny village diorama for each village stage (see core/evolution.ts VILLAGE_STAGES). */
export function makeVillageDiorama(stage: number): THREE.Group {
  const g = new THREE.Group();
  const sand = mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.4, 20), toon('#f0d9a6'), false);
  g.add(sand);
  const grass = mesh(new THREE.CylinderGeometry(1.9, 2.0, 0.2, 20), toon('#8cc265'), false);
  grass.position.y = 0.2;
  g.add(grass);
  const house = makeHouse(stage >= 2 ? 6 : 1);
  house.scale.setScalar(stage >= 2 ? 0.7 : 0.6);
  house.position.set(-0.6, 0.3, -0.5);
  g.add(house);
  const jarCount = [1, 2, 3, 4][stage];
  for (let i = 0; i < jarCount; i++) {
    const j = makeJar();
    j.group.scale.setScalar(0.35);
    j.group.position.set(-0.6 + i * 0.4, 0.3, 1.0);
    g.add(j.group);
  }
  const palm = makePalm(1.6);
  palm.position.set(1.4, 0.3, -0.6);
  g.add(palm);
  if (stage >= 1) {
    const stall = makeMarket(stage >= 3 ? 2 : stage >= 2 ? 1 : 0);
    stall.scale.setScalar(0.55);
    stall.position.set(1.0, 0.3, 0.2);
    g.add(stall);
    for (let i = 0; i < 5; i++) {
      const l = makeLantern(i % 2 ? '#f2b233' : '#e8443a');
      l.scale.setScalar(0.7);
      l.position.set(-1.4 + i * 0.7, 1.7, -1.2);
      g.add(l);
    }
  }
  if (stage >= 2) {
    for (let i = 0; i < 2; i++) {
      const b = makeBarrel();
      b.scale.setScalar(0.4);
      b.position.set(-1.5 + i * 0.35, 0.3, 0.4);
      g.add(b);
    }
    const boat = makeBoat(2);
    boat.scale.setScalar(0.4);
    boat.position.set(1.6, -0.05, 1.6);
    g.add(boat);
  }
  if (stage >= 3) {
    const shrine = makeShrine();
    shrine.scale.setScalar(0.45);
    shrine.position.set(-1.7, 0.1, -1.6);
    g.add(shrine);
    // festival bunting across the village
    const colors = ['#e8443a', '#f2c14e', '#3aa0d9', '#5fae52', '#a35bd6'];
    for (let i = 0; i < 9; i++) {
      const tri = mesh(new THREE.ConeGeometry(0.09, 0.2, 3), toon(colors[i % colors.length]), false);
      tri.rotation.z = Math.PI;
      const u = i / 8;
      tri.position.set(-1.6 + u * 3.2, 2.2 - Math.sin(u * Math.PI) * 0.35, 0.2);
      g.add(tri);
    }
  }
  return g;
}

// ---------- Island business: buildings and staff ----------

/** One model per island building (rendered as map icons). `level` adds a little detail. */
export function makeBuilding(id: string, level = 1): THREE.Group {
  const g = new THREE.Group();
  const ground = mesh(new THREE.CylinderGeometry(1.25, 1.3, 0.12, 6), toon(id === 'dock' || id === 'tradepost' ? '#3fb0c9' : '#9fcf6a'), false);
  ground.position.y = -0.06;
  g.add(ground);
  const add = (o: THREE.Object3D, x: number, y: number, z: number, sc = 1) => {
    o.position.set(x, y, z);
    o.scale.multiplyScalar(sc);
    g.add(o);
    return o;
  };
  switch (id) {
    case 'dock': {
      for (let i = 0; i < 4; i++) {
        const plank = mesh(new THREE.BoxGeometry(0.4, 0.06, 1.6), toon(i % 2 ? '#a57a48' : '#8f6638'));
        add(plank, -0.6 + i * 0.4, 0.3, 0);
      }
      for (const x of [-0.75, 0.75]) for (const z of [-0.7, 0.7]) add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5), toon('#6e4423')), x, 0.1, z);
      add(makeBasketBoat(), 0.2, 0.1, 0.95, 0.45);
      if (level >= 2) add(makeBarrel(), -0.5, 0.33, -0.4, 0.5);
      break;
    }
    case 'saltfield': {
      for (let i = 0; i < 4; i++) {
        const pan = mesh(new THREE.BoxGeometry(0.85, 0.05, 0.85), toon(i % 3 === 0 ? '#e8f4f8' : '#bfe4ee'), false);
        add(pan, (i % 2) * 1 - 0.5, 0.03, Math.floor(i / 2) * 1 - 0.5);
      }
      for (let i = 0; i < 1 + level; i++) add(makeSaltPile(), -0.5 + i * 0.45, 0.04, 0.55, 0.9);
      break;
    }
    case 'brewhouse': {
      add(makeHouse(level >= 3 ? 6 : 1), 0, 0, -0.35, 0.55);
      for (let i = 0; i < 2 + level; i++) add(makeBarrel(), -0.8 + i * 0.4, 0, 0.7, 0.45);
      break;
    }
    case 'shop':
      add(makeMarket(level), 0, 0, 0, 0.75);
      break;
    case 'warehouse': {
      const box = mesh(new THREE.BoxGeometry(1.5, 0.9, 1.1), toon('#b98a52'));
      outline(box, 1.02);
      add(box, 0, 0.45, -0.1);
      const roof = mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.6, 12, 1, false, 0, Math.PI), toon('#7a5a3a'));
      roof.rotation.z = Math.PI / 2;
      add(roof, 0, 0.9, -0.1);
      for (let i = 0; i < level; i++) add(makeBarrel(), -0.6 + i * 0.5, 0, 0.75, 0.4);
      break;
    }
    case 'tradepost': {
      add(makeBoat(2), 0, 0, 0.1, 0.42).rotation.y = 0.6;
      break;
    }
    case 'lantern': {
      for (const x of [-0.6, 0, 0.6]) {
        add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1), toon('#6e4423')), x, 0.55, 0);
        add(makeLantern(x === 0 ? '#f2c14e' : '#e8443a'), x, 1.05, 0.08, 1.4);
      }
      break;
    }
    case 'shrine': {
      const trunk = mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.1, 8), toon('#7a5a3a'));
      add(trunk, -0.5, 0.55, -0.3);
      add(mesh(new THREE.SphereGeometry(0.75, 10, 8), toon('#4f9a48')), -0.5, 1.35, -0.3);
      const s = makeShrine();
      s.remove(s.children[0]); // no sea rock on land
      add(s, 0.45, -0.6, 0.3, 0.6);
      break;
    }
  }
  return g;
}

/** Island staff as chunky toy figures: one prop per role so jobs read at a glance. */
export function makeWorker(role: string, shirtColor?: string): THREE.Group {
  const shirt = shirtColor ?? { fisher: '#2f8fbf', salter: '#f2f2ea', brewer: '#8a4a3a', seller: '#e67e22' }[role] ?? '#888888';
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.22, 0.32, 6, 14), toon(shirt));
  outline(body, 1.06);
  body.position.y = 0.42;
  g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.24, 18, 14), toon('#e9b98e'));
  outline(head, 1.05);
  head.position.y = 0.93;
  g.add(head);
  for (const sd of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1d1410 }), false);
    eye.position.set(sd * 0.08, 0.95, 0.21);
    g.add(eye);
    const blush = mesh(new THREE.CircleGeometry(0.04, 10), new THREE.MeshBasicMaterial({ color: 0xff9a8a, transparent: true, opacity: 0.7 }), false);
    blush.position.set(sd * 0.14, 0.88, 0.225);
    g.add(blush);
  }
  const smile = mesh(new THREE.TorusGeometry(0.045, 0.01, 4, 10, Math.PI), new THREE.MeshBasicMaterial({ color: 0x5a2a1a }), false);
  smile.position.set(0, 0.87, 0.225);
  smile.rotation.z = Math.PI;
  g.add(smile);
  const hatColor = role === 'salter' ? '#f2d98a' : role === 'seller' ? '#c0392b' : '#e8cf86';
  if (role === 'brewer') {
    const cap = mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 14), toon('#fffaf0'));
    cap.position.y = 1.18;
    g.add(cap);
  } else if (role === 'seller') {
    const band = mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 16), toon(hatColor), false);
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.08;
    g.add(band);
  } else {
    const hat = mesh(new THREE.ConeGeometry(0.46, 0.3, 24), toon(hatColor));
    outline(hat, 1.04);
    hat.position.y = 1.2;
    g.add(hat);
  }
  // role prop
  if (role === 'fisher') {
    const rod = mesh(new THREE.CylinderGeometry(0.015, 0.025, 1.3, 6), toon('#c9a66b'), false);
    rod.position.set(0.3, 0.8, 0.1);
    rod.rotation.z = -0.5;
    g.add(rod);
  } else if (role === 'salter') {
    const rake = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), toon('#a57a48'), false);
    rake.position.set(0.3, 0.55, 0.12);
    rake.rotation.z = 0.25;
    g.add(rake);
    const head2 = mesh(new THREE.BoxGeometry(0.36, 0.05, 0.05), toon('#a57a48'), false);
    head2.position.set(0.43, 0.02, 0.12);
    g.add(head2);
  } else if (role === 'brewer') {
    const jar = makeBarrel();
    jar.scale.setScalar(0.3);
    jar.position.set(0.32, 0.2, 0.18);
    g.add(jar);
  } else if (role === 'seller') {
    const bottle = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 10), toon('#b5651d'), false);
    bottle.position.set(0.3, 0.5, 0.2);
    g.add(bottle);
  }
  return g;
}

/**
 * Mực, a Phú Quốc Ridgeback: lean black dog, upright ears, curled tail, and the breed's signature
 * ridge of fur running backwards down the spine (drawn as a lighter stripe of little spikes).
 */
export function makeDog(): THREE.Group {
  const g = new THREE.Group();
  const coat = '#2e2926';
  const body = mesh(new THREE.CapsuleGeometry(0.17, 0.42, 6, 12), toon(coat));
  outline(body, 1.06);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.42, 0);
  g.add(body);
  const chest = mesh(new THREE.SphereGeometry(0.13, 12, 10), toon('#c49a62'), false);
  chest.position.set(0.3, 0.38, 0);
  g.add(chest);
  for (const [x, z] of [
    [0.22, 0.09],
    [0.22, -0.09],
    [-0.22, 0.09],
    [-0.22, -0.09],
  ]) {
    const leg = mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.3, 6), toon(coat));
    leg.position.set(x, 0.15, z);
    leg.name = 'leg';
    g.add(leg);
  }
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0.42, 0.66, 0);
  const skull = mesh(new THREE.SphereGeometry(0.15, 14, 12), toon(coat));
  outline(skull, 1.06);
  head.add(skull);
  const snout = mesh(new THREE.BoxGeometry(0.17, 0.1, 0.11), toon('#3a332f'));
  snout.position.set(0.15, -0.04, 0);
  head.add(snout);
  const nose = mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }), false);
  nose.position.set(0.24, -0.01, 0);
  head.add(nose);
  for (const sd of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.06, 0.16, 4), toon(coat));
    ear.position.set(-0.02, 0.15, sd * 0.08);
    ear.rotation.x = sd * -0.2;
    head.add(ear);
    const eye = mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf2c14e }), false);
    eye.position.set(0.11, 0.04, sd * 0.075);
    head.add(eye);
    const pupil = mesh(new THREE.SphereGeometry(0.013, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }), false);
    pupil.position.set(0.13, 0.04, sd * 0.078);
    head.add(pupil);
  }
  g.add(head);
  // the ridge: a strip of fur growing the "wrong way" along the back
  for (let i = 0; i < 6; i++) {
    const spike = mesh(new THREE.ConeGeometry(0.035, 0.08, 4), toon('#5a4a3e'), false);
    spike.position.set(0.22 - i * 0.075, 0.6, 0);
    spike.rotation.z = Math.PI / 2 + 0.6;
    g.add(spike);
  }
  const tail = mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 10, Math.PI * 1.3), toon(coat), false);
  tail.position.set(-0.4, 0.6, 0);
  tail.name = 'tail';
  g.add(tail);
  return g;
}

/** A little wooden dog house with Mực's name plate. */
export function makeDogHouse(): THREE.Group {
  const g = new THREE.Group();
  const box = mesh(new THREE.BoxGeometry(0.8, 0.55, 0.7), toon('#c49a62'));
  outline(box, 1.04);
  box.position.y = 0.28;
  g.add(box);
  const roof = mesh(new THREE.ConeGeometry(0.66, 0.4, 4), toon('#c0392b'));
  outline(roof, 1.04);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.75;
  g.add(roof);
  const door = mesh(new THREE.CircleGeometry(0.17, 12), new THREE.MeshBasicMaterial({ color: 0x2b2118 }), false);
  door.position.set(0, 0.25, 0.36);
  g.add(door);
  const bowl = mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.07, 12), toon('#3a8fd9'), false);
  bowl.position.set(0.5, 0.04, 0.35);
  g.add(bowl);
  return g;
}
