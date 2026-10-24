// Renders each species' 3D model once into a 2D image so UI cards match the 3D world.
import * as THREE from 'three';
import type { Track } from '../core/evolution';
import { makeBaitModel, makeBoat, makeBuilding, makeCharacter, makeFish, makeHookModel, makeJar, makeMarket, makeRod, makeSaltPile, makeSpool, makeVillageDiorama, makeWorker } from './models';

const SIZE = 160;
const cache = new Map<string, HTMLCanvasElement>();
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;

function setup(): void {
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a8f6a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  camera = new THREE.OrthographicCamera(-0.62, 0.62, 0.62, -0.62, 0.1, 20);
  camera.position.set(0, 0.6, 5);
  camera.lookAt(0, 0, 0);
}

/** Square image of the species, facing right, ~1 unit long across the frame. */
export function fishIcon(speciesId: string): HTMLCanvasElement | null {
  const hit = cache.get(speciesId);
  if (hit) return hit;
  try {
    if (!renderer) setup();
    const fm = makeFish(speciesId);
    fm.group.rotation.y = -0.35;
    fm.group.rotation.x = 0.15;
    scene!.add(fm.group);
    renderer!.render(scene!, camera!);
    scene!.remove(fm.group);
    const out = document.createElement('canvas');
    out.width = SIZE;
    out.height = SIZE;
    out.getContext('2d')!.drawImage(renderer!.domElement, 0, 0);
    cache.set(speciesId, out);
    return out;
  } catch {
    return null; // no WebGL: callers fall back to 2D drawings
  }
}

const PORTRAIT = 256;
const portraitCache = new Map<string, HTMLCanvasElement>();
let pRenderer: THREE.WebGLRenderer | null = null;
let pScene: THREE.Scene | null = null;
let pCamera: THREE.PerspectiveCamera | null = null;

/** Head-and-shoulders portrait of a story character, rendered once from its 3D model. */
export function characterPortrait(id: 'lan' | 'nam' | 'rua' | 'toc' | 'tu' | 'hanh'): HTMLCanvasElement | null {
  const hit = portraitCache.get(id);
  if (hit) return hit;
  try {
    if (!pRenderer) {
      const canvas = document.createElement('canvas');
      pRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      pRenderer.setSize(PORTRAIT, PORTRAIT, false);
      pRenderer.setClearColor(0x000000, 0);
      pScene = new THREE.Scene();
      pScene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a6a5a, 1.7));
      const key = new THREE.DirectionalLight(0xfff0d8, 2);
      key.position.set(2, 3, 4);
      pScene.add(key);
      pCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    }
    const g = makeCharacter(id);
    const turtle = id === 'rua';
    g.rotation.y = turtle ? -0.6 : 0.25;
    pScene!.add(g);
    pCamera!.position.set(0, turtle ? 0.8 : 1.0, turtle ? 2.5 : 2.9);
    pCamera!.lookAt(0, turtle ? 0.36 : 0.86, 0);
    pRenderer!.render(pScene!, pCamera!);
    pScene!.remove(g);
    const out = document.createElement('canvas');
    out.width = PORTRAIT;
    out.height = PORTRAIT;
    out.getContext('2d')!.drawImage(pRenderer!.domElement, 0, 0);
    portraitCache.set(id, out);
    return out;
  } catch {
    return null;
  }
}

const STAGE = 220;
const stageCache = new Map<string, HTMLCanvasElement>();
let sRenderer: THREE.WebGLRenderer | null = null;
let sScene: THREE.Scene | null = null;
let sCamera: THREE.PerspectiveCamera | null = null;

function buildStage(track: Track | 'building' | 'worker', level: number, id = ''): THREE.Object3D {
  switch (track) {
    case 'building':
      return makeBuilding(id, level);
    case 'worker': {
      const w = makeWorker(id);
      w.rotation.y = -0.4;
      return w;
    }
    case 'rod': {
      const r = makeRod(level);
      r.rotation.z = -0.75;
      return r;
    }
    case 'line':
      return makeSpool(level);
    case 'hook':
      return makeHookModel(level);
    case 'bait':
      return makeBaitModel(level);
    case 'boat': {
      const b = makeBoat(level);
      b.rotation.y = level >= 1 ? 0.5 : 0;
      return b;
    }
    case 'jars': {
      const g = new THREE.Group();
      for (let i = 0; i <= level; i++) {
        const j = makeJar();
        j.group.position.set((i % 2) * 1.1 - 0.55 * Math.min(level, 1), 0, -Math.floor(i / 2) * 1.1);
        g.add(j.group);
      }
      return g;
    }
    case 'salt': {
      const g = new THREE.Group();
      for (let i = 0; i < level * 2 + 1; i++) {
        const p = makeSaltPile();
        p.position.set((i % 3) * 0.6 - 0.6, 0, -Math.floor(i / 3) * 0.6);
        g.add(p);
      }
      return g;
    }
    case 'stall':
      return makeMarket(level);
    case 'village':
      return makeVillageDiorama(level);
  }
}

/** A 3D preview of one evolution stage, auto-framed to fit, rendered once and cached. */
export function stagePreview(track: Track | 'building' | 'worker', level: number, id = ''): HTMLCanvasElement | null {
  const key = `${track}:${level}:${id}`;
  const hit = stageCache.get(key);
  if (hit) return hit;
  try {
    if (!sRenderer) {
      const canvas = document.createElement('canvas');
      sRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      sRenderer.setSize(STAGE, STAGE, false);
      sRenderer.setClearColor(0x000000, 0);
      sScene = new THREE.Scene();
      sScene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a8f6a, 1.6));
      const key2 = new THREE.DirectionalLight(0xfff0d8, 2);
      key2.position.set(3, 5, 4);
      sScene.add(key2);
      sCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    }
    const obj = buildStage(track, level, id);
    sScene!.add(obj);
    // frame the bounding sphere from a 3/4 view
    const sphere = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
    const dist = sphere.radius / Math.sin((32 * Math.PI) / 360) * 1.05;
    const dir = new THREE.Vector3(0.55, 0.55, 1).normalize();
    sCamera!.position.copy(sphere.center).addScaledVector(dir, dist);
    sCamera!.lookAt(sphere.center);
    sRenderer!.render(sScene!, sCamera!);
    sScene!.remove(obj);
    const out = document.createElement('canvas');
    out.width = STAGE;
    out.height = STAGE;
    out.getContext('2d')!.drawImage(sRenderer!.domElement, 0, 0);
    stageCache.set(key, out);
    return out;
  } catch {
    return null;
  }
}
