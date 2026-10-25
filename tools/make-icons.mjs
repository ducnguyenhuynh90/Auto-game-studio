// Draws the app icon and splash at store resolution (vector, so no upscaling blur) into assets/,
// then `npx @capacitor/assets generate` makes every iOS / Android size from them (docs/NATIVE.md).
//   node tools/make-icons.mjs
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

// The fish-sauce jar under a nón lá, on the sea: drawn in a 512 box, scaled to any size.
const draw = String.raw`
function jar(ctx, s, withSea) {
  ctx.save();
  ctx.scale(s / 512, s / 512);
  const ink = '#2b1d12';
  if (withSea) {
    const g = ctx.createRadialGradient(256, 200, 40, 256, 256, 380);
    g.addColorStop(0, '#3fb4cc');
    g.addColorStop(1, '#1b6f8a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }
  // jar body
  ctx.lineWidth = 14;
  ctx.strokeStyle = ink;
  const body = ctx.createLinearGradient(160, 0, 352, 0);
  body.addColorStop(0, '#c98444');
  body.addColorStop(0.55, '#b06a32');
  body.addColorStop(1, '#8a4f22');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(256, 300, 92, 104, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // shine
  ctx.fillStyle = 'rgba(255,240,210,0.35)';
  ctx.beginPath();
  ctx.ellipse(222, 268, 18, 40, -0.35, 0, Math.PI * 2);
  ctx.fill();
  // label band
  ctx.fillStyle = '#f3e2bf';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(196, 286, 120, 44, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#b8402f';
  ctx.font = '900 30px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MẮM', 256, 310);
  // neck
  ctx.lineWidth = 14;
  ctx.fillStyle = '#8f5229';
  ctx.beginPath();
  ctx.roundRect(200, 160, 112, 46, 6);
  ctx.fill();
  ctx.stroke();
  // nón lá (conical hat)
  const hat = ctx.createLinearGradient(0, 90, 0, 160);
  hat.addColorStop(0, '#fbe7a6');
  hat.addColorStop(1, '#e8c56d');
  ctx.fillStyle = hat;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(256, 84);
  ctx.lineTo(352, 158);
  ctx.quadraticCurveTo(256, 172, 160, 158);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (withSea) {
    // waves
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    for (const x of [150, 362]) {
      ctx.beginPath();
      ctx.arc(x, 470, 100, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();
    }
  }
  ctx.restore();
}
function canvas(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  fn(c.getContext('2d'));
  return c.toDataURL('image/png');
}
`;

const b = await chromium.launch();
const p = await b.newPage();
await p.setContent('<html><body></body></html>');
const out = await p.evaluate(`(() => { ${draw}
  return {
    // iOS + legacy Android: full-bleed, opaque (the stores reject transparency in the iOS icon)
    'icon-only.png': canvas(1024, 1024, (ctx) => jar(ctx, 1024, true)),
    // the web app (PWA) uses the same art
    '../public/icon-512.png': canvas(512, 512, (ctx) => jar(ctx, 512, true)),
    '../public/icon-192.png': canvas(192, 192, (ctx) => jar(ctx, 192, true)),
    // Android adaptive icon: the jar inside the 66% safe zone, sea colour as the background layer
    'icon-foreground.png': canvas(1024, 1024, (ctx) => { ctx.translate(512 * 0.36, 512 * 0.34); jar(ctx, 1024 * 0.64, false); }),
    'icon-background.png': canvas(1024, 1024, (ctx) => { const g = ctx.createRadialGradient(512, 420, 80, 512, 512, 760); g.addColorStop(0, '#3fb4cc'); g.addColorStop(1, '#1b6f8a'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 1024); }),
    'splash.png': canvas(2732, 2732, (ctx) => { ctx.fillStyle = '#0e3d4f'; ctx.fillRect(0, 0, 2732, 2732); ctx.translate(1366 - 300, 1366 - 330); jar(ctx, 600, false); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff8e8'; ctx.font = '900 96px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Mắm Village', 1366, 1420); }),
  };
})()`);
mkdirSync('assets', { recursive: true });
for (const [name, url] of Object.entries(out)) writeFileSync(`assets/${name}`, Buffer.from(url.split(',')[1], 'base64'));
for (const name of ['splash.png']) writeFileSync(`assets/${name.replace('.png', '-dark.png')}`, Buffer.from(out[name].split(',')[1], 'base64'));
await b.close();
console.log('wrote', Object.keys(out).join(', '), '+ splash-dark.png to assets/');
