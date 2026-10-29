// Store screenshots from the real 3D game (the Capacitor app is the same web build) with the demo save.
//   npm run build && npx vite preview --port 4173 &
//   npx vite-node tools/store-save.ts
//   node tools/store-shots.mjs            # raw captures + captioned store frames
//   node tools/store-shots.mjs --compose  # only re-compose captions from the raw captures
//   node tools/store-shots.mjs --only=reveal  # re-capture one shot, then compose
// Writes store/screenshots/raw/*.png (1320x2868 game frames), then the captioned listing frames:
//   store/screenshots/ios-6.9/NN_*.png   1320x2868 (App Store 6.9", also accepted for 6.7"/6.5")
//   store/screenshots/android/NN_*.png   1080x1920 (Google Play phone)
//   store/feature-graphic.png            1024x500  (Google Play)
// and store/screenshots/vi/... with the Vietnamese captions.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.MAM_URL ?? 'http://localhost:4173/';
const RAW = 'store/screenshots/raw';
// --only=reveal,sort re-captures just those (the others keep their last raw capture)
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const want = (id) => !only || only.includes(id);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

/** Caption, sub-line and backdrop colour per frame, in listing order. */
const SHOTS = [
  { id: 'village', bg: ['#ffcf6b', '#f28c38'], en: ['Build a cozy', 'fishing village'], vi: ['Xây làng chài', 'ấm cúng'], sub: { en: 'Fish, brew, sell and grow on Phú Quốc', vi: 'Câu cá, ủ mắm, bán hàng trên đảo Phú Quốc' } },
  { id: 'reel', bg: ['#6fd3e8', '#2a86c9'], en: ['Cast, hook &', 'reel 24 fish'], vi: ['Thả câu, giật,', 'kéo 24 loài cá'], sub: { en: 'Easy to learn, a joy to master', vi: 'Dễ chơi, càng chơi càng mê' } },
  { id: 'reveal', bg: ['#ffd86b', '#c9772a'], en: ['Brew legendary', 'fish sauce'], vi: ['Ủ nước mắm', 'huyền thoại'], sub: { en: 'Knock the jar. Taste the magic.', vi: 'Gõ chum. Nếm vị kỳ diệu.' } },
  { id: 'island', bg: ['#9be38a', '#3c9a52'], en: ['Grow your', 'island business'], vi: ['Mở rộng', 'cơ ngơi trên đảo'], sub: { en: 'Hire a crew, build a brand, welcome tourists', vi: 'Thuê thợ, gây dựng thương hiệu, đón khách' } },
  { id: 'sort', bg: ['#ffb38a', '#e0574a'], en: ['50 relaxing', 'sort puzzles'], vi: ['50 màn xếp hàng', 'thư giãn'], sub: { en: 'Match three goods on the market stalls', vi: 'Ghép ba món hàng trên sạp chợ' } },
  { id: 'story', bg: ['#c7a6f0', '#6a4a9a'], en: ['A heartfelt story', 'from Vietnam'], vi: ['Câu chuyện ấm áp', 'từ Việt Nam'], sub: { en: "Keep Grandpa's promise. Beat InstaMắm.", vi: 'Giữ lời hứa của ông. Đánh bại InstaMắm.' } },
  { id: 'map', bg: ['#7fd6d0', '#2b7a8f'], en: ['Sail five seas', 'of Vietnam'], vi: ['Vượt năm vùng biển', 'Việt Nam'], sub: { en: 'From the lagoon to Hạ Long Bay and beyond', vi: 'Từ đầm phá đến vịnh Hạ Long và xa hơn' } },
];

async function capture() {
  mkdirSync(RAW, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
  const save = readFileSync('store/demo-save.json', 'utf8');
  await ctx.addInitScript((raw) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('mam_save_v1', raw);
      sessionStorage.setItem('seeded', '1');
    }
    localStorage.setItem('mam_ga_consent', 'no');
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, o) {
      if (String(type).startsWith('webgl')) o = { ...(o || {}), preserveDrawingBuffer: true };
      return gc.call(this, type, o);
    };
    // the game exactly as on screen: the 3D world under the 2D interface
    window.__still = () => {
      const w = document.getElementById('game');
      const c = document.createElement('canvas');
      c.width = 1320;
      c.height = 2868;
      const x = c.getContext('2d');
      x.fillStyle = '#7fd6e6';
      x.fillRect(0, 0, c.width, c.height);
      // the view is 390x844 letterboxed into 440x956: fill the frame width, centre vertically
      const h = (c.width * w.height) / w.width;
      const y = (c.height - h) / 2;
      x.drawImage(document.getElementById('world'), 0, y, c.width, h);
      x.drawImage(w, 0, y, c.width, h);
      return c.toDataURL('image/png');
    };
  }, save);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.clock.install();
  await page.goto(`${base}?quality=high&seed=5`);
  for (let i = 0; !(await page.evaluate(() => !!window.__mam?.game?.top)); i++) {
    if (i > 100) throw new Error('the game did not start');
    await page.clock.runFor(100);
  }
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const run = (ms) => page.clock.runFor(ms);
  const clean = () =>
    ev(() => {
      const g = window.__mam.game;
      g.toasts = [];
      g.floats = [];
    });
  const closeAll = () =>
    ev(() => {
      const g = window.__mam.game;
      while (g.overlays.length) g.pop();
    });
  const tapHit = (id) =>
    ev((id) => {
      const g = window.__mam.game;
      const h = g.hits.find((h) => h.id === id);
      if (h) g.pointerDown(h.x + h.w / 2, h.y + h.h / 2), g.pointerUp(h.x + h.w / 2, h.y + h.h / 2);
      return !!h;
    }, id);
  const still = async (id) => {
    await clean();
    await run(50);
    const d = await ev(() => window.__still());
    writeFileSync(`${RAW}/${id}.png`, Buffer.from(d.split(',')[1], 'base64'));
    console.log('raw', id);
  };
  const camera = (z) =>
    ev((z) => {
      const v = window.__mam.game.world.village;
      v.zoom = v.zoomTarget = z;
      if (z === 0) v.pan.set(0, 0, 0);
    }, z);
  const until = async (fn, maxMs = 30000) => {
    for (let t = 0; t < maxMs; t += 50) {
      if (await ev(fn)) return true;
      await run(50);
    }
    return false;
  };

  if (want('village')) {
    // village hub, close up on the jars
    await run(3000);
    await closeAll();
    await camera(0);
    await run(1500);
    await still('village');
  }

  if (want('reel')) {
    // fishing: catch the reel mid-fight
    await ev(() => window.__mam.game.goFishing('lagoon'));
    await run(1500);
    await until(() => window.__mam.game.top.phase === 'aim' && window.__mam.game.top.shadows.some((s) => s.state === 'swim'));
    await ev(() => window.__mam.game.pointerDown(195, 500));
    await until(() => window.__mam.game.top.power > 0.5, 3000);
    await ev(() => window.__mam.game.pointerUp(195, 500));
    await until(() => window.__mam.game.top.phase === 'bite');
    await ev(() => window.__mam.game.pointerDown(195, 500));
    await until(() => {
      const f = window.__mam.game.top;
      if (f.phase !== 'reel') return f.phase === 'card';
      const want = f.reel.tension < f.reel.zoneCenter;
      if (want && !f.holding) window.__mam.game.pointerDown(195, 500);
      if (!want && f.holding) window.__mam.game.pointerUp(195, 500);
      return f.reel.progress > 0.55;
    });
    await still('reel');
  }

  if (want('reveal')) {
    // the jar reveal: three knocks, the count, the bottle
    await ev(() => window.__mam.game.goVillage());
    await camera(0);
    await run(2500);
    await closeAll();
    await camera(0);
    await run(200);
    await tapHit(`jar${await ev(() => window.__mam.game.state.jars.findIndex((j) => j.sealed && window.__mam.rules.agingLevel(window.__mam.game.state, j, Date.now()) >= 1))}`);
    await until(() => window.__mam.game.top.name === 'reveal', 5000);
    for (let k = 0; k < 3; k++) {
      await ev(() => (window.__mam.game.pointerDown(195, 420), window.__mam.game.pointerUp(195, 420)));
      await run(400);
    }
    await until(() => window.__mam.game.top.phase === 'done', 15000);
    await run(1400);
    // nothing on top of the bottle (Mực likes to come and look)
    await ev(() => {
      const g = window.__mam.game;
      while (g.overlays.length && g.top.name !== 'reveal') g.pop();
    });
    await run(100);
    await still('reveal');
  }

  if (want('island')) {
    // the island business: the same hub, zoomed out over the estate
    await closeAll();
    await camera(1);
    await run(2500);
    await closeAll();
    await run(500);
    await still('island');
  }

  if (want('sort')) {
    // Market Sort, a few moves in
    await closeAll();
    await ev(() => window.__mam.sort(20));
    await run(800);
    for (let k = 0; k < 5; k++) {
      await ev(() => {
        const g = window.__mam.game;
        const o = g.top;
        const m = window.__mam.rules.sortHint(o.board, o.plan);
        const hit = (id) => {
          const h = g.hits.find((h) => h.id === id);
          if (h) g.pointerDown(h.x + h.w / 2, h.y + h.h / 2), g.pointerUp(h.x + h.w / 2, h.y + h.h / 2);
        };
        if (m) hit(`sort_${m[0]}_${m[1]}`);
        if (m) hit(`sort_${m[2]}_${m[3]}`);
      });
      await run(500);
    }
    // pick one up so the shot shows the lift
    await ev(() => {
      const o = window.__mam.game.top;
      const m = window.__mam.rules.sortHint(o.board, o.plan);
      const h = m && window.__mam.game.hits.find((h) => h.id === `sort_${m[0]}_${m[1]}`);
      if (h) window.__mam.game.pointerDown(h.x + h.w / 2, h.y + h.h / 2), window.__mam.game.pointerUp(h.x + h.w / 2, h.y + h.h / 2);
    });
    await run(300);
    await still('sort');
  }

  if (want('story')) {
    // the story: Lan and the humming jar
    await closeAll();
    await camera(0);
    await run(1500);
    await closeAll();
    await ev(() => window.__mam.story('intro'));
    await ev(() => (window.__mam.game.top.cardT = 99));
    await run(2600);
    await still('story');
  }

  if (want('map')) {
    // the sea chart
    await closeAll();
    await ev(() => window.__mam.game.goMap());
    await run(3000);
    await closeAll();
    await run(300);
    await still('map');
  }
  await ctx.close();
}

const pngs = {};
const png = (id) => (pngs[id] ??= `data:image/png;base64,${readFileSync(`${RAW}/${id}.png`).toString('base64')}`);

async function compose() {
  const font = `"DejaVu Sans", "Noto Color Emoji", sans-serif`;
  const render = async (w, h, dpr, html, out) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: out });
    await ctx.close();
  };
  // one caption frame: headline on a warm gradient, the game below in a soft rounded "screen"
  const frame = (s, lang, w, h) => {
    const img = png(s.id);
    const [l1, l2] = s[lang];
    // long (Vietnamese) lines get a smaller size instead of wrapping mid-phrase
    const size = Math.min(0.105, 1.4 / Math.max(l1.length, l2.length)) * w;
    const head = Math.round(h * 0.27);
    const shotW = Math.round(w * 0.84);
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:${font}}
      body{background:linear-gradient(170deg,${s.bg[0]},${s.bg[1]});position:relative}
      .sun{position:absolute;width:${w * 1.4}px;height:${w * 1.4}px;left:${-w * 0.2}px;top:${-w * 0.95}px;border-radius:50%;
        background:radial-gradient(circle,rgba(255,255,255,0.35),rgba(255,255,255,0) 60%)}
      .head{position:absolute;top:0;left:0;right:0;height:${head}px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
      h1{margin:0;white-space:nowrap;font-weight:900;font-size:${size}px;line-height:1.05;color:#fff;letter-spacing:-0.5px;
        -webkit-text-stroke:${w * 0.012}px #2b2118;paint-order:stroke fill;text-shadow:0 ${w * 0.008}px 0 #2b2118}
      p{margin:${w * 0.02}px ${w * 0.06}px 0;font-weight:700;font-size:${w * 0.037}px;color:#2b2118;opacity:.85}
      .shot{position:absolute;left:${(w - shotW) / 2}px;top:${head}px;width:${shotW}px;height:${Math.round((shotW * 2868) / 1320)}px;
        border-radius:${w * 0.07}px;overflow:hidden;border:${w * 0.012}px solid #2b2118;box-shadow:0 ${w * 0.02}px ${w * 0.06}px rgba(0,0,0,.35);
        background:url('${img}') center top/cover}
    </style></head><body><div class="sun"></div><div class="head"><h1>${l1}<br>${l2}</h1><p>${s.sub[lang]}</p></div><div class="shot"></div></body></html>`;
  };
  for (const lang of ['en', 'vi']) {
    const root = lang === 'en' ? 'store/screenshots' : 'store/screenshots/vi';
    mkdirSync(`${root}/ios-6.9`, { recursive: true });
    mkdirSync(`${root}/android`, { recursive: true });
    for (const [i, s] of SHOTS.entries()) {
      const n = String(i + 1).padStart(2, '0');
      await render(440, 956, 3, frame(s, lang, 440, 956), `${root}/ios-6.9/${n}_${s.id}.png`);
      await render(360, 640, 3, frame(s, lang, 360, 640), `${root}/android/${n}_${s.id}.png`);
    }
    console.log('composed', root);
  }
  // Google Play feature graphic: logo + tagline on the left, the village on the right
  const fg = (lang) => `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:1024px;height:500px;overflow:hidden;font-family:${font}}
    body{background:linear-gradient(120deg,#ffd36b,#f2883a 55%,#2a86c9 55.2%,#6fd3e8)}
    .shot{position:absolute;right:-40px;top:-60px;width:560px;height:620px;background:url('${png('village')}') center 42%/cover;
      transform:rotate(4deg);border:10px solid #2b2118;border-radius:48px;box-shadow:0 10px 40px rgba(0,0,0,.35)}
    .t{position:absolute;left:56px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center}
    h1{margin:0;font-size:82px;line-height:1;font-weight:900;color:#ffd34d;-webkit-text-stroke:12px #2b2118;paint-order:stroke fill;text-shadow:0 6px 0 #2b2118}
    p{margin:18px 0 0;font-size:30px;font-weight:800;color:#2b2118}
  </style></head><body><div class="shot"></div><div class="t"><h1>Mắm<br>Village</h1><p>${lang === 'en' ? 'Fish, brew & grow a cozy island village' : 'Câu cá, ủ mắm, xây làng chài ấm cúng'}</p></div></body></html>`;
  await render(1024, 500, 1, fg('en'), 'store/feature-graphic.png');
  await render(1024, 500, 1, fg('vi'), 'store/screenshots/vi/feature-graphic.png');
  console.log('feature graphics');
}

if (!process.argv.includes('--compose')) await capture();
await compose();
await browser.close();
