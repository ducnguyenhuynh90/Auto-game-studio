// Renders each species' 3D model once into a 2D image so UI cards match the 3D world.
import * as THREE from 'three';
import { makeCharacter, makeFish } from './models';

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
