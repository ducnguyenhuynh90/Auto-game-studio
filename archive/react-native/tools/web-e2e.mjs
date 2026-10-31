// Plays the React Native app's web build in Chromium like a player: casts, hooks, reels by keeping the
// tension in the green zone, fills and seals a jar, fishes again so it ages, opens it, sells the bottle,
// and checks the save survives a reload. The rules under test are the shared ones (../../src/core).
//   npm run web:setup && npx expo export --platform web --output-dir /tmp/rn-web
//   (cd /tmp/rn-web && python3 -m http.server 4180 &)   then:   node tools/web-e2e.mjs [url] [shots-dir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4180/';
const shots = process.argv[3] ?? 'playtest-output';
mkdirSync(shots, { recursive: true });
const fail = [];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => fail.push(`page error: ${e.message}`));
p.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && fail.push(`console: ${m.text().slice(0, 200)}`));
await p.goto(base);
await p.waitForFunction(() => !!globalThis.__mamApp, null, { timeout: 30000 });
await p.waitForTimeout(800);
const byId = (id) => p.locator(`[data-testid="${id}"]`).first();
const storyLen = () => p.evaluate(() => globalThis.__mamApp.story.length);
/** Reads a story scene to its end, a tap per line (the intro must play, then go away). */
async function readStory(tag) {
  let taps = 0;
  while ((await storyLen()) > 0 && taps < 40) {
    if (tag && taps === 1) await p.screenshot({ path: `${shots}/rn_story_${tag}.png` });
    await byId('story_next').click({ position: { x: 40, y: 200 } });
    await p.waitForTimeout(150);
    taps++;
  }
  return taps;
}
/** Taps a button the way a player would: any story scene in the way is read first. */
async function press(id) {
  await readStory('');
  await byId(id).click();
}
if ((await storyLen()) === 0) fail.push('the intro story did not start');
await readStory('intro');
await p.screenshot({ path: `${shots}/rn_village.png` });
const st = () => p.evaluate(() => { const s = globalThis.__mamApp.state; return { coins: s.coins, bucket: s.bucket.length, catches: s.stats.catches, trips: s.stats.trips, jars: s.jars.map((j) => j.sealed), shelf: s.shelf.length, sold: s.stats.sold }; });

/** One fishing trip, played like a person: hold to cast, tap the bite, reel by watching the tension. */
async function fishTrip(tag) {
  await press('go_fishing');
  await p.waitForFunction(() => !!globalThis.__mamTrip, null, { timeout: 10000 });
  await p.waitForTimeout(200);
  await readStory(tag === '1' ? 'sea' : '');
  const water = await byId('water').boundingBox();
  const cx = water.x + water.width / 2;
  const cy = water.y + water.height * 0.55;
  let shot = false;
  for (let guard = 0; guard < 400; guard++) {
    if ((await storyLen()) > 0) {
      await p.mouse.up();
      await readStory('chain');
      continue;
    }
    const ph = await p.evaluate(() => globalThis.__mamTrip.phase);
    if (ph === 'done') break;
    if (ph === 'aim') {
      await p.mouse.move(cx, cy);
      await p.mouse.down();
      await p.waitForTimeout(420 + Math.random() * 180); // a medium cast, well before the red
      await p.mouse.up();
    } else if (ph === 'bite') {
      await p.mouse.down();
      await p.mouse.up();
    } else if (ph === 'reel') {
      if (!shot) {
        await p.screenshot({ path: `${shots}/rn_reel_${tag}.png` });
        shot = true;
      }
      // hold when the tension is below the middle of the green zone, release when above
      const r = await p.evaluate(() => { const r = globalThis.__mamTrip.reel; return r ? { t: r.tension, c: r.zoneCenter } : null; });
      if (r) r.t < r.c ? await p.mouse.down() : await p.mouse.up();
      await p.waitForTimeout(40);
      continue;
    } else if (ph === 'card') {
      await p.waitForTimeout(300);
      await p.mouse.down();
      await p.mouse.up();
    }
    await p.waitForTimeout(120);
  }
  await p.mouse.up();
  await p.screenshot({ path: `${shots}/rn_trip_${tag}.png` });
  await press('dock');
  await p.waitForTimeout(500);
  await readStory('');
}

await fishTrip('1');
let s1 = await st();
if (s1.trips === 1 && s1.catches > 3) fail.push(`trip 1 should have 3 casts, caught ${s1.catches}`);
// 3 casts a trip: a tangled cast means fishing once more before the jar can be filled, like a player
for (let k = 2; k <= 3 && s1.bucket < 3; k++) {
  await fishTrip(`1${k}`);
  s1 = await st();
}
if (s1.bucket < 3) fail.push(`only ${s1.bucket} fish after ${s1.trips} trips`);
// fill the first jar with the best 3 and seal it
await press('fill_0');
await p.waitForTimeout(400);
await p.screenshot({ path: `${shots}/rn_fill.png` });
await press('best3');
await press('seal');
await p.waitForTimeout(400);
if (!(await st()).jars[0]) fail.push('jar not sealed');
await fishTrip('2'); // a full trip ages the jar
await press('open_0');
await p.waitForTimeout(300);
for (let i = 0; i < 3; i++) {
  await press('knock');
  await p.waitForTimeout(200);
}
await p.waitForTimeout(2800);
await p.screenshot({ path: `${shots}/rn_reveal.png` });
await press('sell');
await p.waitForTimeout(400);
const s2 = await st();
if (s2.sold < 1) fail.push('bottle not sold');
// the save survives a reload (SQLite-backed localStorage on phones; the browser's here)
await p.reload();
await p.waitForFunction(() => !!globalThis.__mamApp, null, { timeout: 30000 });
await p.waitForTimeout(500);
await readStory('sale'); // Bà Năm's line about the first sale plays back in the village
const s3 = await st();
if (s3.coins !== s2.coins || s3.catches !== s2.catches) fail.push(`save lost on reload: ${JSON.stringify(s2)} vs ${JSON.stringify(s3)}`);
await press('market');
await p.waitForTimeout(300);
await press('tab_gear');
await p.waitForTimeout(300);
await p.screenshot({ path: `${shots}/rn_market.png` });
await press('close');
await p.waitForTimeout(300);
// the sea chart: the home sea is open, the next one explains why it's locked
await press('seas');
await p.waitForTimeout(300);
await p.screenshot({ path: `${shots}/rn_seas.png` });
await press('sail_reef');
await p.waitForTimeout(300);
if (!(await p.evaluate(() => !!globalThis.__mamApp.help))) fail.push('a locked sea did not explain itself');
await press('help_ok');
await press('close');
await p.waitForTimeout(300);
// settings: sound toggles are remembered
await press('settings');
await press('set_sound');
if ((await p.evaluate(() => localStorage.getItem('mam_muted'))) !== '1') fail.push('sound toggle not saved');
await press('set_sound');
await p.screenshot({ path: `${shots}/rn_settings.png` });
await press('close');
await p.waitForTimeout(300);
// fishing puzzle 1 opens from the puzzle hub and plays in the trip screen
await press('puzzles');
await p.waitForTimeout(300);
await press('level_fishing_1');
await p.waitForFunction(() => !!globalThis.__mamTrip?.puzzle, null, { timeout: 10000 });
await p.waitForTimeout(400);
await p.screenshot({ path: `${shots}/rn_fishing_puzzle.png` });
// tapping the goal goes where it can be done: "Upgrade your fishing gear" with coins → the shop's upgrades
for (let n = 0; n < 5 && (await byId('close').count()); n++) {
  await press('close');
  await p.waitForTimeout(300);
}
await p.evaluate(() => {
  const g = globalThis.__mamApp;
  g.state.goalsDone = ['catch3', 'seal1', 'trip2', 'open1', 'sell1', 'dog_feed', 'jar2', 'dog_home', 'chain2', 'dog_boat'];
  g.state.coins = 1000;
  g.commit();
});
await p.waitForTimeout(300);
await press('goal');
await p.waitForTimeout(400);
if (!(await byId('up_rod').count())) fail.push('goal tap did not open the shop upgrades');
await p.screenshot({ path: `${shots}/rn_goal_shop.png` });
// a mission on the Sea Chart goes where it is done too (Phú Quốc missions: out fishing)
for (let n = 0; n < 5 && (await byId('close').count()); n++) {
  await press('close');
  await p.waitForTimeout(300);
}
await p.evaluate(() => (globalThis.__mamTrip = undefined));
await press('seas');
await p.waitForTimeout(300);
const mission = p.locator('[data-testid^="mission_l_"]').first();
if (!(await mission.count())) fail.push('no tappable mission on the Sea Chart');
else {
  await mission.click();
  await p.waitForFunction(() => !!globalThis.__mamTrip, null, { timeout: 5000 }).catch(() => fail.push('tapping a mission did not go fishing'));
}
console.log(JSON.stringify({ afterTrip1: s1, afterSale: s2, afterReload: s3 }));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'react native web e2e passed');
await b.close();
process.exit(fail.length ? 1 : 0);
