// The island business in the React Native app's web build, played through the real screens:
// buy land, build, hire, check the ⓘ help on a locked button, Team, How it's made (rake salt),
// Brand ("How?" card), Road, Business report, Mực, and clear Salt 1 and Shop 1.
//   (build + serve as in tools/web-e2e.mjs)   node tools/web-e2e-business.mjs [url] [shots-dir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4181/';
const shots = process.argv[3] ?? 'playtest-output';
mkdirSync(shots, { recursive: true });
const fail = [];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => fail.push(`page error: ${e.message}`));
await p.goto(base);
await p.waitForFunction(() => !!globalThis.__mamApp, null, { timeout: 30000 });
// a player who has sold their first bottle (the island opens), with some savings
await p.evaluate(() => {
  const g = globalThis.__mamApp;
  g.state.stats.sold = Math.max(1, g.state.stats.sold);
  g.state.coins = 3000;
  for (let i = 0; i < 4; i++) g.state.bucket.push({ uid: 9000 + i, species: 'anchovy', size: 10, freshness: 0.9, perfect: true });
  g.commit();
});
const id = (x) => p.locator(`[data-testid="${x}"]`).first();
// story scenes (the intro, Mực's arrival…) are covered by web-e2e.mjs; skip them here
const skipStory = async () => {
  while (await p.evaluate(() => globalThis.__mamApp.story.length > 0)) {
    await id('story_skip').click();
    await p.waitForTimeout(150);
  }
};
const click = async (x, wait = 350) => {
  await skipStory();
  await id(x).click();
  await p.waitForTimeout(wait);
  await skipStory();
};
const st = () => p.evaluate(() => { const s = globalThis.__mamApp.state; return { coins: s.coins, owned: s.island.owned.length, buildings: s.island.buildings.map((b) => b.id), staff: s.island.staff.map((x) => x.role), salt: s.island.salt, fed: s.dog.fed, puzzles: s.puzzles }; });
const shot = (n) => p.screenshot({ path: `${shots}/rnb_${n}.png` });

await p.waitForTimeout(600);
await shot('village');
await click('island');
await shot('island');
// buy a plot next to the village, then build a Brew House on owned grass and hire a Brewer
const t = await p.evaluate(() => {
  const s = globalThis.__mamApp.state;
  const owned = new Set(s.island.owned);
  const nb = (i) => [i - 7, i + 7, i % 7 ? i - 1 : -1, i % 7 < 6 ? i + 1 : -1];
  const buy = [...Array(63).keys()].find((i) => !owned.has(i) && [...owned].some((o) => nb(o).includes(i)) && document.querySelector(`[data-testid="tile_${i}"]`) && !document.querySelector(`[data-testid="tile_${i}"]`).hasAttribute('aria-disabled'));
  return { buy };
});
await click(`tile_${t.buy}`);
await shot('plot');
await click('buy_plot');
const grass = await p.evaluate(() => {
  const s = globalThis.__mamApp.state;
  const layout = ['~bbHbc~', 'bggggfb', 'sgfgwgc', 'bggfggb', 'bgtgggb', '~bggfgb', '~bgfggp', '~~bggb~', '~~~bc~~'];
  return s.island.owned.find((i) => layout[Math.floor(i / 7)][i % 7] === 'g' && !s.island.buildings.some((b) => b.tile === i));
});
await click(`tile_${grass}`);
await shot('build_menu');
// a locked building explains itself (the shop needs fame: Road stage 1)
await click('build_shop');
if (!(await id('help_ok').isVisible().catch(() => false))) fail.push('locked Sauce Shop did not open its ⓘ card');
await shot('help_card');
await click('help_ok');
await click('build_brewhouse');
await click('hire');
let s1 = await st();
if (!s1.buildings.includes('brewhouse')) fail.push('brew house not built');
if (!s1.staff.includes('brewer')) fail.push('brewer not hired');
await click('close');
// Team
await click('team');
await shot('team');
await click('close');
// How it's made: rake salt by hand (no salt maker yet)
await click('how');
const saltBefore = (await st()).salt;
await click('rake_salt', 1800);
if ((await st()).salt <= saltBefore) fail.push('rake salt did nothing');
await shot('production');
await click('close');
// Road
await click('road');
await shot('road');
await click('close');
// Mực
await click('dog');
await click('dog_feed');
if ((await st()).fed < 1) fail.push('Mực not fed');
await shot('dog');
await click('close');
// Island tools: Brand (with its How? card when locked), Business, Puzzles
await click('island');
await click('tool_Brand');
await shot('brand');
if (await id('brand_how').isVisible().catch(() => false)) {
  await click('brand_how');
  if (!(await id('help_ok').isVisible())) fail.push('brand How? card missing');
  await click('help_ok');
}
await click('close');
await click('tool_Business');
await shot('business');
await click('close');
await click('tool_Puzzles');
await shot('puzzles');
// Salt 1: turn every channel back to where the water flows (the bot reads the board like eyes)
await click('level_salt_1');
for (let guard = 0; guard < 40; guard++) {
  const next = await p.evaluate(() => {
    const b = globalThis.__mamSalt;
    const i = b.cells.findIndex((c) => c.kind === 'pipe' && c.mask !== c.solved);
    return i;
  });
  if (next < 0) break;
  await click(`cell_${next}`, 120);
}
await p.waitForTimeout(300);
await shot('salt_done');
if (!(await id('puzzle_done').isVisible().catch(() => false))) fail.push('salt 1 not solved');
else await click('puzzle_done');
// Shop 1: find the best assignment (like a careful player), give each bottle, serve
await click('level_shop_1');
const plan = await p.evaluate(() => {
  const { l, accepts, saleValue } = globalThis.__mamShop;
  let best = null;
  const used = new Set();
  const pick = [];
  const go = (ci, sum) => {
    if (ci === l.customers.length) {
      if (!best || sum > best.sum) best = { sum, pick: [...pick] };
      return;
    }
    l.bottles.forEach((bt, bi) => {
      if (used.has(bi) || !accepts(l.customers[ci], bt)) return;
      used.add(bi);
      pick.push(bi);
      go(ci + 1, sum + saleValue(l.customers[ci], bt));
      pick.pop();
      used.delete(bi);
    });
  };
  go(0, 0);
  return best?.pick ?? [];
});
for (let ci = 0; ci < plan.length; ci++) {
  await click(`bottle_${plan[ci]}`, 120);
  await click(`customer_${ci}`, 120);
}
await click('serve', 500);
await shot('shop_done');
// back to the hub: the living village shows the buildings, the workers and Mực
await click('puzzle_done');
while (await id('close').count()) await click('close', 400);
await p.waitForTimeout(600);
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => (++n, performance.now() - t0 < 1000 ? requestAnimationFrame(f) : res(n)); requestAnimationFrame(f); }));
if (fps < 20) fail.push(`village scene runs at ${fps} fps`);
await shot('village_living');
const s2 = await st();
if (!(s2.puzzles.salt[0] > 0)) fail.push('salt 1 not recorded');
if (!(s2.puzzles.shop[0] === 3)) fail.push(`shop 1 stars ${s2.puzzles.shop[0]}`);
console.log(JSON.stringify(s2));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'react native business e2e passed');
await b.close();
process.exit(fail.length ? 1 : 0);
