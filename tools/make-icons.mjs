// The app icon and splash, rendered with the game's own 3D models (tools/icon/scene.ts): Lan under her
// nón lá with a glowing Golden Anchovy leaping in front of a Phú Quốc sunset. Writes the source art to
// mobile/assets/ (the iOS / Android app) and the web icons to public/, then
// `npm run icons` makes every iOS / Android size from them (docs/NATIVE.md).
//   node tools/make-icons.mjs
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const { chromium } = createRequire(import.meta.url)('playwright');
const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = `http://localhost:${server.config.server.port}/tools/icon/icon.html`;

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('page error:', e.message));
await p.goto(url);
await p.waitForFunction(() => window.iconReady, null, { timeout: 120000 });

const out = await p.evaluate(() => {
  const icon = (size, layer) => window.renderIcon(size, layer);
  const img = (src) => new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.src = src;
  });
  const canvasOf = async (w, h, fn) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    await fn(c.getContext('2d'));
    return c.toDataURL('image/png');
  };
  const full = icon(1024, 'full');
  const fg = icon(1024, 'foreground');
  const bg = icon(1024, 'background');
  return (async () => {
    // splash: the icon art as a rounded tile over the dusk sea, with the name
    const splash = await canvasOf(2732, 2732, async (x) => {
      const g = x.createLinearGradient(0, 0, 0, 2732);
      g.addColorStop(0, '#3a1f2e');
      g.addColorStop(1, '#0e3d4f');
      x.fillStyle = g;
      x.fillRect(0, 0, 2732, 2732);
      x.save();
      x.beginPath();
      x.roundRect(1366 - 420, 1366 - 560, 840, 840, 190);
      x.clip();
      x.drawImage(await img(full), 1366 - 420, 1366 - 560, 840, 840);
      x.restore();
      x.font = '900 150px "Trebuchet MS", Arial, sans-serif';
      x.textAlign = 'center';
      x.lineJoin = 'round';
      x.lineWidth = 26;
      x.strokeStyle = '#2b2118';
      x.strokeText('Mắm Village', 1366, 1800);
      x.fillStyle = '#ffd34d';
      x.fillText('Mắm Village', 1366, 1800);
    });
    const scaled = async (src, s) => canvasOf(s, s, async (x) => x.drawImage(await img(src), 0, 0, s, s));
    return {
      // the mobile app (mobile/android + mobile/ios): full-bleed opaque icon, adaptive layers, splash
      'mobile/assets/icon-only.png': full,
      'mobile/assets/icon-foreground.png': fg,
      'mobile/assets/icon-background.png': bg,
      'mobile/assets/splash.png': splash,
      'mobile/assets/splash-dark.png': splash,
      // the web app (PWA, GitHub Pages)
      'public/icon-512.png': await scaled(full, 512),
      'public/icon-192.png': await scaled(full, 192),
    };
  })();
});
for (const [path, data] of Object.entries(out)) {
  mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive: true });
  writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'));
}
await b.close();
await server.close();
console.log('wrote', Object.keys(out).length, 'images:', Object.keys(out).join(', '));
