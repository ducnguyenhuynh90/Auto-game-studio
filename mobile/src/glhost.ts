// The 3D layer on expo-gl: three.js (the web game's own src/render3d) draws into native OpenGL ES views.
// The browser lets three.js make its own canvas; here we hand it a ready context and a stand-in canvas,
// and swap the offscreen-picture and canvas-texture helpers (src/render3d/gl.ts) for versions that read
// pixels back from the GPU instead of copying DOM canvases.
import * as THREE from 'three';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { setGlHost } from '@web/render3d/gl';
import { SkiaCanvasElement } from './canvas2d';

/** What three.js needs from a <canvas> when it is given the context directly. */
export function standInCanvas(gl: ExpoWebGLRenderingContext): HTMLCanvasElement {
  return {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    style: {},
    clientWidth: gl.drawingBufferWidth,
    clientHeight: gl.drawingBufferHeight,
    addEventListener() {},
    removeEventListener() {},
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;
}

/** expo-gl doesn't support every pixelStorei setting three.js sends; the unsupported ones are no-ops here. */
export function quietPixelStore(gl: ExpoWebGLRenderingContext): void {
  const raw = gl.pixelStorei.bind(gl);
  const ok = new Set<number>([gl.UNPACK_ALIGNMENT, gl.PACK_ALIGNMENT, gl.UNPACK_FLIP_Y_WEBGL, gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL]);
  gl.pixelStorei = (p: number, v: number | boolean) => {
    if (ok.has(p)) raw(p as never, v as never);
  };
}

function flipRows(px: Uint8Array, w: number, h: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(px.length));
  const row = w * 4;
  for (let y = 0; y < h; y++) out.set(px.subarray(y * row, y * row + row), (h - 1 - y) * row);
  return out;
}

let renderer: THREE.WebGLRenderer | null = null;
let ctx: ExpoWebGLRenderingContext | null = null;

/** One headless GL context for icons, portraits and stage previews; call once before the game boots. */
export async function installGlHost(): Promise<void> {
  ctx = await GLView.createContextAsync();
  quietPixelStore(ctx);
  renderer = new THREE.WebGLRenderer({ canvas: standInCanvas(ctx), context: ctx as unknown as WebGL2RenderingContext, alpha: true });
  setGlHost({
    offscreenRenderer: () => renderer!,
    snapshot(r, scene, camera, size) {
      const gl = ctx!;
      // drawn at twice the size and scaled down: smooth edges without multisampling
      const s2 = size * 2;
      const rt = new THREE.WebGLRenderTarget(s2, s2);
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(scene, camera);
      const px = new Uint8Array(s2 * s2 * 4);
      gl.readPixels(0, 0, s2, s2, gl.RGBA, gl.UNSIGNED_BYTE, px);
      r.setRenderTarget(null);
      rt.dispose();
      gl.endFrameEXP();
      const big = SkiaCanvasElement.fromPixels(flipRows(px, s2, s2), s2, s2);
      const out = new SkiaCanvasElement();
      out.width = size;
      out.height = size;
      out.getContext('2d')!.drawImage(big, 0, 0, size, size);
      return out as unknown as HTMLCanvasElement;
    },
    canvasTexture(c) {
      const sc = c as unknown as SkiaCanvasElement;
      // three.js canvas textures are flipped on upload; a data texture isn't, so flip the rows here
      const t = new THREE.DataTexture(flipRows(sc.getPixels(), sc.width, sc.height), sc.width, sc.height, THREE.RGBAFormat);
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      return t;
    },
  });
}
