// Captures the raw app screens for the store listing from the React Native app's web build, at the
// 6.9" iPhone size (440×956 points × 3 = 1320×2868 px), using the demo save (tools/store-save.ts).
//   node tools/store-raw.mjs [url=http://localhost:4181/] [out=store/raw]
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4181/';
const out = process.argv[3] ?? 'store/raw';
mkdirSync(out, { recursive: true });
const save = readFileSync('store/demo-save.json', 'utf8');
const b = await chromium.launch();
const fail = [];

/** A fresh page with the demo save (optionally changed first). */
async function open(edit) {
  const ctx = await b.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
  const s = JSON.parse(save);
  edit?.(s);
  await ctx.addInitScript((raw) => {
    localStorage.setItem('mam_save_v1', raw);
    localStorage.setItem('mam_ga_consent', 'no');
  }, JSON.stringify(s));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fail.push(e.message));
  await p.goto(base);
  await p.waitForFunction(() => !!globalThis.__mamApp, null, { timeout: 30000 });
  await p.waitForTimeout(1200);
  return p;
}
const id = (p, x) => p.locator(`[data-testid="${x}"]`).first();
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` });

// 1 · the living village
{
  const p = await open();
  await p.waitForTimeout(1500);
  await shot(p, '01_village');
  // 4 · the island business
  await id(p, 'island').click();
  await p.waitForTimeout(900);
  await shot(p, '04_island');
  await p.close();
}
// 2 · fishing: cast, hook, and the reel fight
{
  const p = await open();
  await id(p, 'go_fishing').click();
  await p.waitForFunction(() => !!globalThis.__mamTrip, null, { timeout: 10000 });
  const water = await id(p, 'water').boundingBox();
  const cx = water.x + water.width / 2;
  const cy = water.y + water.height * 0.5;
  let took = 0;
  for (let n = 0; n < 600 && took < 2; n++) {
    const ph = await p.evaluate(() => globalThis.__mamTrip.phase);
    if (ph === 'done') break;
    if (ph === 'aim') {
      await p.mouse.move(cx, cy);
      await p.mouse.down();
      await p.waitForTimeout(500);
      if (took === 0 && n < 3) await shot(p, '02a_cast');
      await p.mouse.up();
    } else if (ph === 'bite') {
      await p.mouse.down();
      await p.mouse.up();
    } else if (ph === 'reel') {
      const r = await p.evaluate(() => { const r = globalThis.__mamTrip.reel; return r ? { t: r.tension, c: r.zoneCenter, prog: r.progress } : null; });
      if (r && r.prog > 0.55 && took === 0) {
        await shot(p, '02_reel');
        took = 1;
      }
      if (r) r.t < r.c ? await p.mouse.down() : await p.mouse.up();
      await p.waitForTimeout(40);
      continue;
    } else if (ph === 'card') {
      if (took === 1) {
        await p.waitForTimeout(500);
        await shot(p, '02b_catch');
        took = 2;
      }
      await p.mouse.down();
      await p.mouse.up();
    }
    await p.waitForTimeout(120);
  }
  await p.close();
}
// 3 · open a ready jar: the °N count-up and the bottle
{
  const p = await open();
  await id(p, 'open_1').click();
  await p.waitForTimeout(400);
  for (let i = 0; i < 3; i++) {
    await id(p, 'knock').click();
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(3200);
  await shot(p, '03_reveal');
  await p.close();
}
// 5 · Market Sort, a few moves into a colourful level
{
  const p = await open();
  await id(p, 'sort').click();
  await p.waitForTimeout(500);
  await shot(p, '05a_sort_menu');
  await id(p, 'sort_lvl_8').click();
  await p.waitForFunction(() => !!globalThis.__mamSort, null, { timeout: 10000 });
  for (let k = 0; k < 4; k++) {
    const m = await p.evaluate(() => globalThis.__mamSort.hint());
    if (!m) break;
    await id(p, `sort_${m[0]}_${m[1]}`).click();
    await id(p, `sort_${m[2]}_${m[3]}`).click();
    await p.waitForTimeout(150);
  }
  // pick one up, so the shot shows how to play
  const m = await p.evaluate(() => globalThis.__mamSort.hint());
  if (m) await id(p, `sort_${m[0]}_${m[1]}`).click();
  await p.waitForTimeout(300);
  await shot(p, '05_sort');
  await p.close();
}
// 6 · the story: Grandpa's jar
{
  const p = await open((s) => (s.storySeen = s.storySeen.filter((x) => x !== 'first_sale')));
  for (let i = 0; i < 3; i++) {
    await id(p, 'story_next').click({ position: { x: 40, y: 200 } });
    await p.waitForTimeout(250);
  }
  await shot(p, '06_story');
  await p.close();
}
// 7 · the sea chart
{
  const p = await open();
  await id(p, 'seas').click();
  await p.waitForTimeout(500);
  await shot(p, '07_seas');
  await p.close();
}
// 8 · team
{
  const p = await open();
  await id(p, 'team').click();
  await p.waitForTimeout(500);
  await shot(p, '08_team');
  await p.close();
}
console.log(fail.length ? 'errors:\n' + fail.join('\n') : 'raw screens captured');
await b.close();
