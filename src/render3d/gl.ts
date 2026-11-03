// How the 3D layer makes offscreen pictures (fish icons, portraits, stage previews) and textures from 2D
// canvases. The browser defaults are here. The native app (mobile/, expo-gl) swaps in its own with
// setGlHost(), because it has no DOM canvases: it renders into a framebuffer and reads the pixels back.
import * as THREE from 'three';
import { platform } from '../platform';

export interface GlHost {
  /** The renderer offscreen pictures are drawn with (one shared WebGL context). */
  offscreenRenderer(): THREE.WebGLRenderer;
  /** Render scene → a new 2D canvas of size×size (transparent background). */
  snapshot(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, size: number): HTMLCanvasElement;
  /** A texture from a small 2D canvas (sky gradients, two-tone fish skins). */
  canvasTexture(c: HTMLCanvasElement): THREE.Texture;
}

let shared: THREE.WebGLRenderer | null = null;

const browserHost: GlHost = {
  offscreenRenderer() {
    shared ??= new THREE.WebGLRenderer({ canvas: platform.makeCanvas(), alpha: true, antialias: true, preserveDrawingBuffer: true });
    return shared;
  },
  snapshot(renderer, scene, camera, size) {
    // Render at 2x and downsample into the cached canvas: free supersampling that smooths edges
    // on these baked icons/portraits without growing their cached size or cost anywhere they're drawn.
    const ss = 2;
    renderer.setPixelRatio(ss);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    const out = platform.makeCanvas();
    out.width = size;
    out.height = size;
    out.getContext('2d')!.drawImage(renderer.domElement, 0, 0, size, size);
    return out;
  },
  canvasTexture(c) {
    return new THREE.CanvasTexture(c);
  },
};

export const glHost: GlHost = { ...browserHost };

export function setGlHost(h: Partial<GlHost>): void {
  Object.assign(glHost, h);
}
