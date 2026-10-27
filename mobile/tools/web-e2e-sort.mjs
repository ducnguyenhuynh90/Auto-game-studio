// Market Sort in the React Native app's web build: open it from the village, then play levels 1, 2 and 3
// by tapping goods and shelves the way a player does (moves come from the game's own Hint plan).
// Checks wins, stars, first-clear coins and that the next level opens.
//   (build + serve as in tools/web-e2e.mjs)   node tools/web-e2e-sort.mjs [url] [shots-dir]
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
await p.evaluate(() => {
  const g = globalThis.__mamApp;
  g.state.stats.trips = Math.max(1, g.state.stats.trips);
  g.story = [];
  g.state.storySeen.push('intro');
  g.commit();
});
const id = (x) => p.locator(`[data-testid="${x}"]`).first();
await p.waitForTimeout(500);
await id('sort').click();
await p.waitForTimeout(400);
await p.screenshot({ path: `${shots}/rns_sort_menu.png` });
for (const lv of [1, 2, 3]) {
  if (lv === 1) await id('sort_lvl_1').click();
  else await id('sort_next').click();
  await p.waitForFunction(() => !!globalThis.__mamSort, null, { timeout: 10000 });
  const coins0 = await p.evaluate(() => globalThis.__mamApp.state.coins);
  let moves = 0;
  for (; moves < 400; moves++) {
    const st = await p.evaluate(() => {
      const q = globalThis.__mamSort;
      if (q.result) return { done: true, won: q.result.won, stars: q.result.stars };
      const m = q.hint();
      return { done: false, m };
    });
    if (st.done) {
      if (!st.won) fail.push(`level ${lv} lost`);
      if (st.stars < 1) fail.push(`level ${lv}: no stars`);
      break;
    }
    if (!st.m) {
      fail.push(`level ${lv}: no hint`);
      break;
    }
    await id(`sort_${st.m[0]}_${st.m[1]}`).click();
    await id(`sort_${st.m[2]}_${st.m[3]}`).click();
    if (lv === 3 && moves === 2) await p.screenshot({ path: `${shots}/rns_sort_play.png` });
  }
  await p.waitForTimeout(300);
  const coins1 = await p.evaluate(() => globalThis.__mamApp.state.coins);
  if (coins1 <= coins0) fail.push(`level ${lv}: no first-clear coins`);
  await p.screenshot({ path: `${shots}/rns_sort_result_${lv}.png` });
}
const stars = await p.evaluate(() => globalThis.__mamApp.state.sort);
if (!(stars.length >= 3 && stars.slice(0, 3).every((x) => x > 0))) fail.push(`stars not saved: ${JSON.stringify(stars)}`);
await id('sort_back').click();
await p.waitForTimeout(300);
await p.screenshot({ path: `${shots}/rns_sort_menu_after.png` });
console.log(JSON.stringify({ stars, coins: await p.evaluate(() => globalThis.__mamApp.state.coins) }));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'react native market sort e2e passed');
await b.close();
process.exit(fail.length ? 1 : 0);
