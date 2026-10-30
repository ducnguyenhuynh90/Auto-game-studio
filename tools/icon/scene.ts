// The app icon, rendered with the game's own 3D models (tools/make-icons.mjs drives this page).
// Lan under her nón lá lifts a glowing Golden Anchovy against a Phú Quốc sunset: a face, a catch, a place.
import * as THREE from 'three';
import { makeCharacter, makeFish } from '../../src/render3d/models';

type Layer = 'full' | 'foreground' | 'background';

/** The 3D part: Lan and the fish, transparent background. */
/** `zoom` < 1 pulls the camera back (the Android adaptive layer must fit the middle 66%). */
function render3d(size: number, backdrop: HTMLCanvasElement | null, zoom = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(size, size, false);
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  // the sky is the scene's own background, so nothing shows through the models when layers are combined
  if (backdrop) {
    const t = new THREE.CanvasTexture(backdrop);
    t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t;
  }
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x6a4a5a, 1.05));
  const key = new THREE.DirectionalLight(0xfff0d8, 1.5);
  key.position.set(-2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffa860, 1.6); // the sunset behind her
  rim.position.set(1, 2, -3);
  scene.add(rim);

  const lan = makeCharacter('lan');
  lan.rotation.y = 0.18;
  lan.position.set(-0.13, 0, 0);
  scene.add(lan);

  const fish = makeFish('golden');
  fish.setSilhouette(false);
  fish.group.scale.setScalar(0.42);
  fish.group.position.set(0.39, 1.12, 0.32);
  fish.group.rotation.set(0.2, -0.45, 0.85); // leaping up, nose to the sky
  if (fish.tail) fish.tail.rotation.y = 0.5;
  scene.add(fish.group);

  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  cam.position.set(0.06, 1.06, 3.1 / zoom);
  cam.lookAt(0.07, 1.01, 0);
  r.render(scene, cam);
  return canvas;
}

/** The sun sits behind the golden fish: the prize glows. */
const SUN_X = 0.75;
const SUN_Y = 0.34;

function sky(x: CanvasRenderingContext2D, s: number): void {
  const g = x.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#f2553a');
  g.addColorStop(0.4, '#ff8a3d');
  g.addColorStop(0.7, '#ffc15e');
  g.addColorStop(0.71, '#2bb3cf');
  g.addColorStop(1, '#0d6b8c');
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  // the sun right behind her head: makes the silhouette pop
  const sun = x.createRadialGradient(SUN_X * s, SUN_Y * s, s * 0.02, SUN_X * s, SUN_Y * s, s * 0.36);
  sun.addColorStop(0, 'rgba(255,250,215,1)');
  sun.addColorStop(0.32, 'rgba(255,233,160,0.85)');
  sun.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = sun;
  x.fillRect(0, 0, s, s);
  // soft rays
  x.save();
  x.translate(SUN_X * s, SUN_Y * s);
  x.fillStyle = 'rgba(255,255,230,0.16)';
  for (let i = 0; i < 14; i++) {
    x.rotate((Math.PI * 2) / 14);
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(s, -s * 0.09);
    x.lineTo(s, s * 0.09);
    x.closePath();
    x.fill();
  }
  x.restore();
  // sea glitter under the sun: broken dashes that thin out toward the viewer
  const dashes: [number, number, number][] = [
    [0, 0.2, 0], [0.02, 0.12, -0.05], [0.035, 0.16, 0.04], [0.06, 0.09, -0.03], [0.08, 0.13, 0.05],
    [0.11, 0.07, -0.06], [0.14, 0.1, 0.03], [0.18, 0.06, -0.02], [0.22, 0.08, 0.06],
  ];
  for (const [dy, w, dx] of dashes) {
    x.fillStyle = `rgba(255,240,190,${0.85 - dy * 2.6})`;
    x.beginPath();
    x.ellipse((SUN_X + dx) * s, (0.725 + dy) * s, (w * s) / 2, s * (0.005 + dy * 0.02), 0, 0, Math.PI * 2);
    x.fill();
  }
}

function sparkle(x: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  x.save();
  x.translate(cx, cy);
  x.fillStyle = '#fffbe6';
  x.shadowColor = 'rgba(255,220,120,0.9)';
  x.shadowBlur = r * 1.4;
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r * 0.28 : r;
    x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  x.closePath();
  x.fill();
  x.restore();
}

function compose(size: number, layer: Layer): string {
  // 2D backdrop: the sky (not for the adaptive foreground) and a warm glow where the fish leaps
  const back = document.createElement('canvas');
  back.width = back.height = size;
  const bx = back.getContext('2d')!;
  if (layer !== 'foreground') sky(bx, size);
  if (layer === 'background') return back.toDataURL('image/png');
  const fx = size * SUN_X;
  const fy = size * SUN_Y;
  const glow = bx.createRadialGradient(fx, fy, 0, fx, fy, size * 0.3);
  glow.addColorStop(0, 'rgba(255,236,140,0.85)');
  glow.addColorStop(1, 'rgba(255,236,140,0)');
  bx.fillStyle = glow;
  bx.fillRect(0, 0, size, size);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  if (layer === 'full') x.drawImage(render3d(size, back), 0, 0);
  else {
    x.drawImage(back, 0, 0);
    x.drawImage(render3d(size, null, 0.66), 0, 0);
  }
  if (layer === 'foreground') {
    // everything 2D drawn below also moves into the adaptive icon's safe zone
    x.translate(size * 0.17, size * 0.17);
    x.scale(0.66, 0.66);
  }
  // drops flung off the tail: it has just leapt out of the sea
  x.fillStyle = 'rgba(235,250,255,0.95)';
  x.strokeStyle = 'rgba(30,90,110,0.6)';
  x.lineWidth = size * 0.004;
  for (const [dx, dy, r] of [[0.62, 0.62, 0.016], [0.58, 0.68, 0.011], [0.67, 0.7, 0.013], [0.55, 0.6, 0.008]]) {
    x.beginPath();
    x.ellipse(dx * size, dy * size, r * size * 0.8, r * size, 0, 0, Math.PI * 2);
    x.fill();
    x.stroke();
  }
  sparkle(x, size * 0.9, size * 0.17, size * 0.042);
  sparkle(x, size * 0.6, size * 0.12, size * 0.026);
  sparkle(x, size * 0.93, size * 0.55, size * 0.03);
  if (layer === 'full') {
    // gentle vignette so the edges don't fight the home-screen mask
    const v = x.createRadialGradient(size / 2, size / 2, size * 0.45, size / 2, size / 2, size * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(60,20,0,0.25)');
    x.fillStyle = v;
    x.fillRect(0, 0, size, size);
  }
  return c.toDataURL('image/png');
}

(window as unknown as { renderIcon: typeof compose }).renderIcon = compose;
(window as unknown as { iconReady: boolean }).iconReady = true;
