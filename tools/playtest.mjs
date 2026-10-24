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
// Default: the production preview (npm run build && npx vite preview --port 4173), immune to HMR reloads.
const base = args.url ?? 'http://localhost:4173/';
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
  let biteStart = null;
  let biteNeed = 0;
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
        const R = window.__mam.rules;
        // buy by priority: the goal's needs first, then a sensible order
        const order = ['jars', 'line', 'rod', 'hook', 'boat', 'bait', 'salt', 'stall'];
        let bought = false;
        for (const id of order) {
          const c = R.upgradeCost(s, id);
          if (c === null || s.coins < c) continue;
          const def = R.UPGRADES.find((u) => u.id === id);
          if (top.tab !== def.kind) {
            tap(def.kind === 'gear' ? 110 : 280, 369);
          } else {
            const i = R.UPGRADES.filter((u) => u.kind === def.kind).findIndex((u) => u.id === id);
            tap(W_ - 86, 396 + i * 82 + 38);
            bot.log.push({ ev: 'upgrade', id, cost: c, t: g.time, trip: s.stats.trips });
          }
          bought = true;
          break;
        }
        if (!bought) tap(W_ - 44, 74);
        wait = 0.5;
      } else if (top.name === 'dex' || top.name === 'missions') {
        tap(W_ - 44, 74);
      } else if (top.name === 'story') {
        shot(`story_${top.scene?.id ?? 'scene'}`);
        // read like a player: tap through each line
        g.pointerDown(195, 300);
        g.pointerUp(195, 300);
        wait = 0.25;
      } else if (top.name === 'relic') {
        shot('relic');
        bot.log.push({ ev: 'relic', trip: s.stats.trips, t: g.time });
        tap(195, 692);
        wait = 0.6;
      } else if (top.name === 'map') {
        shot('map');
        const R = window.__mam.rules;
        const want = R.SEAS.find((x) => !R.seaComplete(s, x) && !R.seaLock(s, x)) ?? R.SEAS.find((x) => x.id === s.sea);
        if (top.sail) {
          // sailing animation
        } else if (top.selected !== want.id) {
          const p = g.world.map.islandScreen(want.id);
          tap(p.x, p.y);
        } else {
          bot.log.push({ ev: 'sail', to: want.id, trip: s.stats.trips });
          bot.trips++;
          tap(195, 810);
        }
        wait = 0.6;
      } else if (top.name === 'village') {
        shot(`village_trip${s.stats.trips}`);
        if (bot.trips >= bot.maxTrips) {
          bot.done = true;
          return;
        }
        const R = window.__mam.rules;
        const jars = s.jars;
        const now = Date.now();
        const ready = jars.findIndex((j) => j.sealed && (s.stats.fullTrips - j.sealedTrip >= 1 || now - j.sealedAt > 90000));
        const ferm = s.bucket.filter((f) => R.canFerment(f)).length;
        const empty = jars.findIndex((j) => !j.sealed);
        const canBuy = R.UPGRADES.some((u) => (R.upgradeCost(s, u.id) ?? Infinity) <= s.coins);
        const jp = (i) => g.world.village.jarScreen(i);
        const mp = g.world.village.marketScreen();
        const want = R.SEAS.find((x) => !R.seaComplete(s, x) && !R.seaLock(s, x));
        if (ready >= 0) tap(jp(ready).x, jp(ready).y - 40);
        else if (empty >= 0 && ferm >= 3) tap(jp(empty).x, jp(empty).y - 40);
        else if (s.shelf.length || canBuy) tap(mp.x, mp.y);
        else if (want && want.id !== s.sea) tap(338, 765);
        else {
          bot.trips++;
          tap(197, 765);
        }
        wait = 0.6;
      } else if (top.name === 'fishing') {
        const f = top;
        if (f.phase === 'aim') {
          shot('fish_aim');
          // choose the swimming shadow closest to the centre line, aim at its depth
          // use a trip gadget now and then, like a curious player would
          const gad = ['sonar', 'pearl', 'rocket', 'octo'].find((id) => (s.gadgets[id] ?? 0) > 0 && !f.effects.has(id));
          if (gad && Math.random() < 0.5) {
            f.useGadget(gad);
            bot.log.push({ ev: 'gadget', id: gad, trip: s.stats.trips });
          }
          const cands = f.shadows.filter((sh) => sh.state === 'swim' && !sh.locked);
          cands.sort((a, b) => Math.abs(a.x - 195) - Math.abs(b.x - 195));
          // a planning player casts at the hungry fish (food chain) when one is up
          const hungry = cands.find((sh) => sh.hungry);
          if (hungry) shot('fish_hungry');
          const tgt = hungry && Math.random() < skill ? hungry : cands[0];
          // power maps to distance: distance = power / overcast * reach
          const depth = tgt ? (600 - tgt.y) / 425 : 0.3;
          aimTarget = (depth / f.reach) * 0.9;
          aimTarget += (Math.random() - 0.5) * (1 - skill) * 0.3;
          aimTarget = Math.max(0.02, Math.min(0.97, aimTarget));
          g.pointerDown(195, 500);
        } else if (f.phase === 'charging') {
          if (f.power > 0.6) shot('fish_charging');
          if (Math.abs(f.power - aimTarget) < 0.03 && f.holdTime < 1.33) g.pointerUp(195, 500);
          if (f.power > 0.9) shot('fish_overcast');
          else if (f.holdTime > 3) g.pointerUp(195, 500);
        } else if (f.phase === 'bite') {
          shot('fish_bite');
          // Reaction is measured on the game clock (headless frame rates are low and uneven).
          if (biteStart === null) {
            biteStart = g.time;
            biteNeed = 0.3 + (1 - skill) * 0.9 * Math.random();
          }
          if (g.time - biteStart > biteNeed) {
            g.pointerDown(195, 500);
            biteStart = null;
          }
        } else if (f.phase === 'reel') {
          biteStart = null;
          const r = f.reel;
          if (r.progress > 0.6) shot('fish_reel');
          const noise = (Math.random() - 0.5) * (1 - skill) * 0.5;
          const want = r.tension + noise < r.zoneCenter;
          if (want && !f.holding) g.pointerDown(195, 500);
          if (!want && f.holding) g.pointerUp(195, 500);
        } else if (f.phase === 'card') {
          if (f.card.t > 0.9 && !f.card.shotDone) {
            f.card.shotDone = true;
            shot(f.card.link ? `card_chain${f.card.link.links}_${f.card.fish.species}` : `card_${f.card.fish.species}`);
            if (f.card.gadget) bot.log.push({ ev: 'crate', gadget: f.card.gadget, trip: s.stats.trips });
            wait = 0.4;
          } else if (f.card.t > 1.4) {
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
    gpu: g.world ? { geometries: g.world.renderer.info.memory.geometries, textures: g.world.renderer.info.memory.textures, calls: g.world.renderer.info.render.calls, tris: g.world.renderer.info.render.triangles } : null,
    state: { coins: g.state.coins, upgrades: g.state.upgrades, stats: g.state.stats, dex: Object.keys(g.state.dex), cellar: g.state.cellar, goalsDone: g.state.goalsDone },
    funnel: window.__mam.analytics.funnelState(),
    counts: { cast: count('cast'), catch: count('catch'), lost: count('fish_lost'), jar_open: count('jar_open'), upgrade: count('upgrade'), mission: count('mission_complete'), relic: count('relic_unlock'), level: count('level_up'), gadget: count('gadget_use'), hungry: count('hungry'), chain_link: count('chain_link') },
    progress: { storySeen: g.state.storySeen, sea: g.state.sea, xp: g.state.xp, missions: g.state.missionsDone, relics: g.state.relics, gadgets: g.state.gadgets },
    lostReasons: ev.filter((x) => x.e === 'fish_lost').map((x) => x.p.reason),
    log: window.__bot.log,
  };
});
report.errors = errors;
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, log: report.log.filter((l) => l.ev !== 'trip').slice(0, 40), trips: report.log.filter((l) => l.ev === 'trip') }, null, 1));
await browser.close();
