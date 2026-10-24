// Automated playtest: a bot plays the real game in Chromium through the game's input path,
// capturing screenshots at key moments and reporting errors, funnel and economy pacing.
// This is QA + pacing simulation, NOT evidence of player enjoyment.
//
// usage: node tools/playtest.mjs [--trips 8] [--skill 0.7] [--speed 3] [--shots] [--url http://localhost:5173/]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const trips = Number(args.trips ?? 8);
const skill = Number(args.skill ?? 0.7);
const speed = Number(args.speed ?? 3);
const shots = args.shots === 'true';
const base = args.url ?? 'http://localhost:5173/';
const outDir = args.out ?? 'playtest-output';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}?reset=1&seed=${args.seed ?? 7}&speed=${speed}`);
await page.waitForFunction(() => window.__mam);

// Bot runs inside the page so it can react every frame.
await page.evaluate(({ skill }) => {
  const g = window.__mam.game;
  const bot = (window.__bot = { log: [], shotsWanted: [], done: false, trips: 0, startTime: Date.now() });
  const tap = (x, y) => {
    g.pointerDown(x, y);
    g.pointerUp(x, y);
  };
  let wait = 0;
  let aimTarget = null;
  let reactDelay = 0;
  const seen = new Set();
  const shot = (name) => {
    if (!seen.has(name)) {
      seen.add(name);
      bot.shotsWanted.push(name);
    }
  };
  function step() {
    const dt = 1 / 60;
    wait -= dt;
    if (bot.done || wait > 0) return requestAnimationFrame(step);
    const top = g.top;
    const s = g.state;
    try {
      if (top.name === 'jar_fill') {
        shot('jar_fill');
        tap(95, 737);
        setTimeout(() => tap(265, 737), 300);
        wait = 0.8;
      } else if (top.name === 'reveal') {
        if (top.phase === 'knock') {
          if (top.knocks === 1) shot('reveal_knock');
          tap(195, 420);
          wait = 0.35;
        } else if (top.phase === 'count' && top.phaseT > 1.2) shot('reveal_count');
        else if (top.phase === 'done' && top.phaseT > 1) {
          shot('reveal_done');
          bot.log.push({ ev: 'reveal', degrees: top.degrees, recipe: top.recipe, t: g.time });
          tap(130, 738);
          wait = 0.6;
        }
      } else if (top.name === 'market') {
        shot('market');
        if (s.shelf.length) tap(195, 258);
        // buy cheapest affordable upgrade, prioritising goal order
        const order = ['jars', 'rod', 'salt', 'boat', 'stall'];
        const ids = ['jars', 'rod', 'salt', 'boat', 'stall'];
        let bought = false;
        for (const id of order) {
          const i = ids.indexOf(id);
          const lvl = s.upgrades[id];
          const costs = { jars: [40, 140, 320], rod: [70, 260], salt: [110, 300], boat: [180], stall: [90, 280] }[id];
          const c = costs[lvl];
          if (c !== undefined && s.coins >= c) {
            tap(W_ - 88, 378 + i * 84 + 38);
            bot.log.push({ ev: 'upgrade', id, cost: c, t: g.time, trip: s.stats.trips });
            bought = true;
            break;
          }
        }
        if (!bought) tap(W_ - 44, 74);
        wait = 0.5;
      } else if (top.name === 'dex') {
        tap(W_ - 44, 74);
      } else if (top.name === 'village') {
        shot(`village_trip${s.stats.trips}`);
        if (bot.trips >= bot.maxTrips) {
          bot.done = true;
          return;
        }
        const jars = s.jars;
        const n = jars.length;
        const spacing = n <= 2 ? 110 : 84;
        const start = 195 - ((n - 1) * spacing) / 2;
        const now = Date.now();
        const ready = jars.findIndex((j) => j.sealed && (s.stats.trips - j.sealedTrip >= 1 || now - j.sealedAt > 90000));
        const ferm = s.bucket.filter((f) => !['crab'].includes(f.species)).length;
        const empty = jars.findIndex((j) => !j.sealed);
        const costs = { jars: [40, 140, 320], rod: [70, 260], salt: [110, 300], boat: [180], stall: [90, 280] };
        const canBuy = Object.entries(costs).some(([id, c]) => c[s.upgrades[id]] !== undefined && s.coins >= c[s.upgrades[id]]);
        if (ready >= 0) tap(start + ready * spacing, 600);
        else if (empty >= 0 && ferm >= 3) tap(start + empty * spacing, 600);
        else if (s.shelf.length || canBuy) tap(306, 430);
        else {
          bot.trips++;
          const reef = s.upgrades.boat >= 1 && bot.trips % 2 === 0;
          tap(reef ? 317 : s.upgrades.boat >= 1 ? 182 : 250, 760);
        }
        wait = 0.6;
      } else if (top.name === 'fishing') {
        const f = top;
        if (f.phase === 'aim') {
          shot('fish_aim');
          // choose the swimming shadow closest to the centre line, aim at its depth
          const cands = f.shadows.filter((sh) => sh.state === 'swim');
          cands.sort((a, b) => Math.abs(a.x - 195) - Math.abs(b.x - 195));
          const tgt = cands[0];
          aimTarget = tgt ? (600 - tgt.y) / 425 : 0.3;
          aimTarget += (Math.random() - 0.5) * (1 - skill) * 0.5;
          aimTarget = Math.max(0.02, Math.min(0.98, aimTarget));
          g.pointerDown(195, 500);
        } else if (f.phase === 'charging') {
          if (f.power > 0.6) shot('fish_charging');
          if (Math.abs(f.power - aimTarget) < 0.03 && f.holdTime < 1.33) g.pointerUp(195, 500);
          else if (f.holdTime > 3) g.pointerUp(195, 500);
        } else if (f.phase === 'bite') {
          shot('fish_bite');
          reactDelay += dt * g.timeScale;
          const need = 0.25 + (1 - skill) * 0.9 * Math.random();
          if (reactDelay > need) {
            g.pointerDown(195, 500);
            reactDelay = 0;
          }
        } else if (f.phase === 'reel') {
          const r = f.reel;
          if (r.progress > 0.6) shot('fish_reel');
          const noise = (Math.random() - 0.5) * (1 - skill) * 0.5;
          const want = r.tension + noise < r.zoneCenter;
          if (want && !f.holding) g.pointerDown(195, 500);
          if (!want && f.holding) g.pointerUp(195, 500);
        } else if (f.phase === 'card') {
          if (f.card.t > 0.9) {
            shot(`card_${f.card.fish.species}`);
            g.pointerUp(195, 500);
            g.pointerDown(195, 500);
            g.pointerUp(195, 500);
          } else if (f.holding) g.pointerUp(195, 500);
        } else if (f.phase === 'summary') {
          if (f.t > 1) {
            shot(`summary_${s.stats.trips}`);
            bot.log.push({ ev: 'trip', trip: s.stats.trips, coins: s.coins, bucket: s.bucket.length, t: g.time });
            tap(195, 572);
            wait = 0.5;
          }
        } else if (f.holding && f.phase !== 'reel') {
          g.pointerUp(195, 500);
        }
      }
    } catch (e) {
      bot.log.push({ ev: 'bot_error', msg: String(e) });
    }
    requestAnimationFrame(step);
  }
  const W_ = 390;
  bot.maxTrips = 0;
  window.__botStart = (n) => {
    bot.maxTrips = n;
    requestAnimationFrame(step);
  };
}, { skill });

await page.evaluate((n) => window.__botStart(n), trips);
const t0 = Date.now();
let shotIdx = 0;
while (true) {
  const st = await page.evaluate(() => ({ done: window.__bot.done, shots: window.__bot.shotsWanted.splice(0) }));
  for (const name of st.shots) {
    if (shots) await page.screenshot({ path: `${outDir}/${String(++shotIdx).padStart(2, '0')}_${name}.png` });
  }
  if (st.done) break;
  if (Date.now() - t0 > 15 * 60 * 1000) {
    errors.push('timeout');
    break;
  }
  await page.waitForTimeout(100);
}
const report = await page.evaluate(() => {
  const g = window.__mam.game;
  const ev = window.__mam.analytics.events;
  const count = (e) => ev.filter((x) => x.e === e).length;
  return {
    gameSeconds: Math.round(g.time),
    state: { coins: g.state.coins, upgrades: g.state.upgrades, stats: g.state.stats, dex: Object.keys(g.state.dex), cellar: g.state.cellar, goalsDone: g.state.goalsDone },
    funnel: window.__mam.analytics.funnelState(),
    counts: { cast: count('cast'), catch: count('catch'), lost: count('fish_lost'), jar_open: count('jar_open'), upgrade: count('upgrade') },
    lostReasons: ev.filter((x) => x.e === 'fish_lost').map((x) => x.p.reason),
    log: window.__bot.log,
  };
});
report.errors = errors;
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, log: report.log.filter((l) => l.ev !== 'trip').slice(0, 40), trips: report.log.filter((l) => l.ev === 'trip') }, null, 1));
await browser.close();
