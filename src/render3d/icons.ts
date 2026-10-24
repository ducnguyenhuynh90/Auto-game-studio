// Renders each species' 3D model once into a 2D image so UI cards match the 3D world.
import * as THREE from 'three';
import { makeFish } from './models';

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
