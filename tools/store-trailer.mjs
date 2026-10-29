// Store preview video ("App Preview" / Play promo): a ~28 s short film cut from the real game.
// The 3D web build runs under a fake clock, so every frame is rendered on time even on a slow machine;
// each frame is composited in the page (3D world + UI + narration) and saved, then ffmpeg encodes it
// with a soundtrack rendered by tools/store-audio.mjs from the game's own procedural audio.
//
//   npm run build && npx vite preview --port 4173 &
//   npx vite-node tools/store-save.ts        # the believable mid-game save
//   node tools/store-trailer.mjs [--fast]    # → store/video/frames + store/video/cues.json
//   node tools/store-audio.mjs               # → store/video/soundtrack.wav + the encoded mp4s
//
// --fast renders at half size for checking the cut (about 4x quicker).
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const fast = process.argv.includes('--fast');
const base = process.env.MAM_URL ?? 'http://localhost:4173/';
const FPS = 30;
const OUT_W = fast ? 443 : 886; // App Store preview size for 6.9"/6.7" iPhones (portrait)
const OUT_H = fast ? 960 : 1920;
const dir = 'store/video';
const frames = `${dir}/frames`;
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 443, height: 960 }, deviceScaleFactor: fast ? 1 : 2 });
const save = readFileSync('store/demo-save.json', 'utf8');
await ctx.addInitScript((raw) => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem('mam_save_v1', raw);
    sessionStorage.setItem('seeded', '1');
  }
  localStorage.setItem('mam_ga_consent', 'no');
  // keep the WebGL picture after it is shown so the page can copy it into the film frame
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, o) {
    if (String(type).startsWith('webgl')) o = { ...(o || {}), preserveDrawingBuffer: true };
    return gc.call(this, type, o);
  };

  // The film frame: world, optional UI, slow push-in, grade, vignette, narration, fades.
  window.__film = (o) => {
    const { w, h } = o;
    const c = (window.__frameCanvas ??= document.createElement('canvas'));
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    const prev = window.__prevFrame;
    x.save();
    const z = o.zoom ?? 1;
    const [fx, fy] = o.focus ?? [0.5, 0.5];
    x.translate(w * fx, h * fy);
    x.scale(z, z);
    x.translate(-w * fx, -h * fy);
    x.filter = o.blur ? `blur(${o.blur}px) saturate(1.1)` : 'saturate(1.12) contrast(1.04)';
    x.drawImage(document.getElementById('world'), 0, 0, w, h);
    if (o.ui) x.drawImage(document.getElementById('game'), 0, 0, w, h);
    x.restore();
    // warm sunrise grade + vignette: it's a film, not a screen recording
    x.fillStyle = 'rgba(255,170,90,0.06)';
    x.fillRect(0, 0, w, h);
    const v = x.createRadialGradient(w / 2, h * 0.48, h * 0.25, w / 2, h * 0.5, h * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(10,6,2,0.42)');
    x.fillStyle = v;
    x.fillRect(0, 0, w, h);
    if (o.xfade && prev) {
      x.globalAlpha = o.xfade;
      x.drawImage(prev, 0, 0);
      x.globalAlpha = 1;
    }
    const u = w / 443; // layout unit
    const cap = o.caption;
    if (cap && cap.a > 0) {
      x.save();
      x.globalAlpha = cap.a;
      const y = h * (cap.y ?? 0.8) + (1 - cap.a) * 12 * u;
      // soft band behind the words
      const band = x.createLinearGradient(0, y - 90 * u, 0, y + 70 * u);
      band.addColorStop(0, 'rgba(0,0,0,0)');
      band.addColorStop(0.5, 'rgba(12,8,4,0.45)');
      band.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = band;
      x.fillRect(0, y - 90 * u, w, 160 * u);
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.shadowColor = 'rgba(0,0,0,0.65)';
      x.shadowBlur = 14 * u;
      x.fillStyle = '#fff6e4';
      x.font = `italic 600 ${30 * u}px "DejaVu Serif", serif`;
      cap.text.split('\n').forEach((line, i, all) => x.fillText(line, w / 2, y + (i - (all.length - 1) / 2) * 40 * u));
      x.restore();
    }
    if (o.title) {
      const t = o.title;
      x.save();
      x.globalAlpha = t.a;
      x.fillStyle = 'rgba(14,9,4,0.35)';
      x.fillRect(0, 0, w, h);
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      const s = 1 + (1 - t.a) * 0.06;
      x.translate(w / 2, h * 0.42);
      x.scale(s, s);
      x.lineJoin = 'round';
      x.font = `900 ${54 * u}px "DejaVu Sans", sans-serif`;
      x.lineWidth = 12 * u;
      x.strokeStyle = '#2b2118';
      x.strokeText('Mắm Village', 0, 0);
      x.fillStyle = '#ffd34d';
      x.fillText('Mắm Village', 0, 0);
      x.font = `italic 600 ${28 * u}px "DejaVu Serif", serif`;
      x.shadowColor = 'rgba(0,0,0,0.7)';
      x.shadowBlur = 12 * u;
      x.fillStyle = '#fff6e4';
      x.fillText(t.sub, 0, 78 * u);
      if (t.sub2) {
        x.font = `700 ${20 * u}px "DejaVu Sans", sans-serif`;
        x.fillText(t.sub2, 0, 128 * u);
      }
      x.restore();
    }
    if (o.fade) {
      x.fillStyle = `rgba(0,0,0,${o.fade})`;
      x.fillRect(0, 0, w, h);
    }
    const keep = (window.__prevFrame ??= document.createElement('canvas'));
    keep.width = w;
    keep.height = h;
    keep.getContext('2d').drawImage(c, 0, 0);
    return c.toDataURL('image/jpeg', 0.93);
  };
}, save);

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.clock.install();
await page.goto(`${base}?quality=high&seed=11`);
await page.clock.runFor(4000);
for (let i = 0; !(await page.evaluate(() => !!window.__mam?.game?.top)); i++) {
  if (i > 100) throw new Error('the game did not start');
  await page.clock.runFor(100);
}

let frame = 0;
const cues = []; // sound cues for the soundtrack, in film seconds
const cue = (type, extra = {}) => cues.push({ t: frame / FPS, type, ...extra });
const tick = () => page.clock.runFor(1000 / FPS);
const ev = (fn, arg) => page.evaluate(fn, arg);
const tap = (x, y) => ev(([x, y]) => (window.__mam.game.pointerDown(x, y), window.__mam.game.pointerUp(x, y)), [x, y]);
const tapHit = (id) =>
  ev((id) => {
    const g = window.__mam.game;
    const h = g.hits.find((h) => h.id === id);
    if (!h) return false;
    g.pointerDown(h.x + h.w / 2, h.y + h.h / 2);
    g.pointerUp(h.x + h.w / 2, h.y + h.h / 2);
    return true;
  }, id);
const top = () => ev(() => window.__mam.game.top.name);
async function shoot(o) {
  const data = await ev((o) => window.__film(o), { w: OUT_W, h: OUT_H, ...o });
  writeFileSync(`${frames}/${String(frame).padStart(5, '0')}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
  frame++;
  if (frame % 30 === 0) console.log(`${(frame / FPS).toFixed(0)} s`);
}
/** Lets the game run off camera (a cut) until `cond` holds. */
async function skipUntil(cond, maxS = 20, arg) {
  for (let i = 0; i < maxS * FPS; i++) {
    if (await ev(cond, arg)) return true;
    await tick();
  }
  return false;
}
const ramp = (i, n, k = 8) => Math.min(1, i / k, (n - 1 - i) / k); // caption in/out
const smooth = (t) => t * t * (3 - 2 * t);
/** One shot: up to `n` frames; `look(i)` gives the frame's options, `act(i)` drives the game and
 *  may return 'cut' to end the shot early. */
let shotNo = 0;
async function shot(n, look, act) {
  cue('shot', { n: shotNo++ });
  for (let i = 0; i < n; i++) {
    if (act && (await act(i)) === 'cut') break;
    await tick();
    await shoot(look(i));
  }
}
const XF = 8; // cross-dissolve frames between shots
/** The hub camera: 0 = the village close-up, 1 = the whole island. Set every frame for a slow, eased move. */
const camera = (z) =>
  ev((z) => {
    const v = window.__mam.game.world.village;
    v.zoom = v.zoomTarget = z;
    if (z === 0) v.pan.set(0, 0, 0);
  }, z);
const closeAll = () =>
  ev(() => {
    const g = window.__mam.game;
    while (g.overlays.length) g.pop();
    g.toasts = [];
  });

// ---- 1. Establishing: the whole island at dawn, then the camera flies down into the village. No UI. (3.4 s)
await ev(() => window.__mam.game.goVillage());
await page.clock.runFor(3500); // toasts and the welcome-back sheet settle off camera
await closeAll();
await camera(1);
await page.clock.runFor(300);
cue('swell');
await shot(
  102,
  (i) => ({
    zoom: 1.0 + 0.04 * smooth(i / 101),
    focus: [0.5, 0.5],
    fade: Math.max(0, 1 - i / 24),
    caption: { text: 'On a little island\nin Vietnam…', a: ramp(i - 10, 92, 10), y: 0.16 },
  }),
  (i) => camera(1 - smooth(Math.max(0, Math.min(1, (i - 26) / 76)))),
);

// ---- 2. The Promise: the game's own story scene (5.2 s)
await ev(() => window.__mam.story('intro'));
cue('chapter');
await shot(52, (i) => ({ ui: true, xfade: Math.max(0, 1 - i / XF) })); // chapter card "The Promise"
await ev(() => {
  const o = window.__mam.game.top;
  o.cardT = 99; // straight to Lan's first line
});
await shot(60, () => ({ ui: true }));
// ---- 3. The villain: Mr. Tốc's stopwatch (2.6 s)
await ev(() => {
  const o = window.__mam.game.top;
  o.line = 2; // "*beep* Tốc, InstaMắm Co. …"
  o.lineT = 0;
  o.lastOther = 'nam';
});
cue('beep');
await shot(70, () => ({ ui: true }));

// ---- 4. "So Lan picked up Grandpa's old rod." Cast, bite, reel, catch
await ev(() => {
  const g = window.__mam.game;
  while (g.overlays.length) g.pop();
  g.goFishing('lagoon');
});
await page.clock.runFor(1600);
await closeAll();
await skipUntil(() => window.__mam.game.top.phase === 'aim' && window.__mam.game.top.shadows.some((s) => s.state === 'swim' && !s.locked));
// One continuous take: aim at the swimming shadow nearest the middle (the playtest bot's rule),
// strike on the bite, keep the tension in the zone, land it. (6.2 s)
let aim = null;
let released = false;
let castAt = 999;
let biteAt = -1;
let landed = false;
let landedAt = 999;
await shot(
  186,
  (i) => ({
    ui: true,
    xfade: Math.max(0, 1 - i / XF),
    caption:
      i < landedAt
        ? { text: "So Lan picked up\nGrandpa's old rod.", a: Math.min(ramp(i, 999, 8), Math.max(0, (castAt + 36 - i) / 8)), y: 0.2 }
        : { text: 'One fish at a time.', a: ramp(i - landedAt - 4, 999, 8), y: 0.2 },
  }),
  async (i) => {
    if (i === 12)
      aim = await ev(() => {
        const f = window.__mam.game.top;
        const c = f.shadows.filter((s) => s.state === 'swim' && !s.locked).sort((a, b) => Math.abs(a.x - 195) - Math.abs(b.x - 195))[0];
        const depth = c ? (600 - c.y) / 425 : 0.3;
        window.__mam.game.pointerDown(195, 500);
        return Math.max(0.05, Math.min(0.95, (depth / f.reach) * 0.9));
      });
    if (aim !== null && !released) {
      const p = await ev(() => window.__mam.game.top.power ?? 0);
      if (p >= aim - 0.03) {
        await ev(() => window.__mam.game.pointerUp(195, 500));
        released = true;
        castAt = i;
        cue('cast');
      }
      return;
    }
    if (!released) return;
    if (i > landedAt + 50) return 'cut';
    const ph = await ev(() => window.__mam.game.top.phase);
    if (ph === 'bite' && biteAt < 0) (biteAt = i), cue('bite');
    if (ph === 'bite' && i - biteAt >= 5) await ev(() => window.__mam.game.pointerDown(195, 500)); // a quick, human strike
    if (ph === 'reel')
      await ev(() => {
        const f = window.__mam.game.top;
        const want = f.reel.tension < f.reel.zoneCenter;
        if (want && !f.holding) window.__mam.game.pointerDown(195, 500);
        if (!want && f.holding) window.__mam.game.pointerUp(195, 500);
      });
    if (ph === 'card' && !landed) {
      landed = true;
      landedAt = i;
      cue('catch');
      await ev(() => window.__mam.game.top.holding && window.__mam.game.pointerUp(195, 500));
    }
  },
);
if (!landed) console.log('warning: the fish was not landed on camera');

// ---- 5. The humming jar: knock, knock, knock… "Good mắm can't be rushed." (5.3 s)
await closeAll();
await ev(() => window.__mam.game.goVillage());
await camera(0);
await page.clock.runFor(2500);
await closeAll();
await camera(0);
await page.clock.runFor(200);
await tapHit(`jar${await ev(() => window.__mam.game.state.jars.findIndex((j) => j.sealed && window.__mam.rules.agingLevel(window.__mam.game.state, j, Date.now()) >= 1))}`);
if (!(await skipUntil(() => window.__mam.game.top.name === 'reveal', 5))) console.log('warning: no reveal');
await shot(
  150,
  (i) => ({ ui: true, xfade: Math.max(0, 1 - i / XF), caption: { text: i < 76 ? 'The best fish sauce…' : '…can’t be rushed.', a: i < 76 ? ramp(i - 4, 70, 8) : ramp(i - 78, 72, 8), y: 0.055 } }),
  async (i) => {
    if ([14, 34, 54].includes(i)) {
      await tap(195, 420);
      cue('knock', { n: [14, 34, 54].indexOf(i) + 1 });
    }
    if (i === 76) cue('reveal');
  },
);

// ---- 6. From one jar to a whole village: the camera pulls back from the jars to the island (3.6 s)
await closeAll();
await camera(0);
await page.clock.runFor(1200);
await closeAll();
await shot(
  108,
  (i) => ({ zoom: 1.0 + 0.03 * smooth(i / 107), focus: [0.5, 0.5], xfade: Math.max(0, 1 - i / XF), caption: { text: 'From one humming jar…\nto a whole village.', a: ramp(i - 6, 102, 10), y: 0.16 } }),
  (i) => camera(smooth(Math.max(0, Math.min(1, (i - 8) / 90)))),
);

// ---- 7. Market day: a few quick sorts (2.4 s)
await closeAll();
await ev(() => window.__mam.sort(20));
await page.clock.runFor(600);
const sortStep = () =>
  ev(() => {
    const g = window.__mam.game;
    const o = g.top;
    if (o.name !== 'sort_game' || o.result) return null;
    const m = window.__mam.rules.sortHint(o.board, o.plan);
    if (!m) return null;
    const hit = (id) => {
      const h = g.hits.find((h) => h.id === id);
      if (h) g.pointerDown(h.x + h.w / 2, h.y + h.h / 2), g.pointerUp(h.x + h.w / 2, h.y + h.h / 2);
    };
    const before = o.board.sold;
    hit(`sort_${m[0]}_${m[1]}`);
    return { before, to: `sort_${m[2]}_${m[3]}` };
  });
let pending = null;
await shot(
  72,
  (i) => ({ ui: true, xfade: Math.max(0, 1 - i / XF), caption: { text: 'Then sell it at the market.', a: ramp(i, 72, 8), y: 0.9 } }),
  async (i) => {
    if (i % 7 === 2) pending = await sortStep();
    if (i % 7 === 5 && pending) {
      const sold = await ev(
        ({ to, before }) => {
          const g = window.__mam.game;
          const h = g.hits.find((h) => h.id === to);
          if (h) g.pointerDown(h.x + h.w / 2, h.y + h.h / 2), g.pointerUp(h.x + h.w / 2, h.y + h.h / 2);
          return g.top.board?.sold > before;
        },
        pending,
      );
      cue(sold ? 'sell' : 'tap');
      pending = null;
    }
  },
);

// ---- 8. Title: the village behind, blurred. "Slow but sure." (3.2 s)
await closeAll();
await camera(0.35);
await page.clock.runFor(600);
await closeAll();
cue('title');
await shot(84, (i) => ({
  zoom: 1.04 + 0.03 * (i / 83),
  blur: 6 * u01(i / 14),
  xfade: Math.max(0, 1 - i / XF),
  title: { a: smooth(u01((i - 6) / 16)), sub: 'Slow but sure.', sub2: 'A cozy fishing & fish-sauce story' },
  fade: Math.max(0, (i - 72) / 12),
}));
function u01(v) {
  return Math.max(0, Math.min(1, v));
}

writeFileSync(`${dir}/cues.json`, JSON.stringify({ fps: FPS, frames: frame, seconds: frame / FPS, width: OUT_W, height: OUT_H, cues }, null, 1));
console.log(`done: ${frame} frames (${(frame / FPS).toFixed(1)} s), ${cues.length} sound cues`);
await browser.close();
