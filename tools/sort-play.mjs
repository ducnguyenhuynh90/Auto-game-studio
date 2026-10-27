// Plays Market Sort levels in the real game (headless Chromium) by tapping like a player: it asks the
// game's own hint for a move, then taps the good and the shelf on screen. Checks wins, stars and coins.
//   npm run build && npx vite preview --port 4173 &   node tools/sort-play.mjs [levels=1,5,20,50] [url]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const levels = (process.argv[2] ?? '1,5,20,50').split(',').map(Number);
const base = process.argv[3] ?? 'http://localhost:4173/';
mkdirSync('playtest-output', { recursive: true });
const b = await chromium.launch();
const fail = [];
const out = [];
for (const lv of levels) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', (e) => fail.push(`L${lv} page error: ${e.message}`));
  await p.goto(`${base}?reset=1`);
  await p.waitForFunction(() => !!window.__mam?.game, null, { timeout: 30000 });
  // open the level from the menu the way a player does (earlier levels marked done so it is open)
  await p.evaluate((n) => {
    const g = window.__mam.game;
    g.state.stats.trips = Math.max(1, g.state.stats.trips);
    g.state.sort = Array.from({ length: n - 1 }, () => 1);
    g.state.storySeen = ['intro', 'first_sale', 'dog_arrive', 'dog_trust', 'dog_boat', 'dog_done', 'tutorial_done', 'island_intro', 'food_chain'];
    g.commit();
  }, lv);
  await p.waitForTimeout(600);
  const tap = async (x, y) => {
    const box = await p.locator('canvas').first().boundingBox();
    const k = box.width / 390;
    await p.mouse.click(box.x + x * k, box.y + y * k);
  };
  await tap(390 - 118 + 54, 193); // 🛒 Market Sort (island not open yet: the upper slot)
  await p.waitForTimeout(400);
  const cols = 5;
  const gap = (390 - 40) / cols;
  await tap(20 + gap * (((lv - 1) % cols) + 0.5), 118 + Math.floor((lv - 1) / cols) * 66);
  await p.waitForTimeout(400);
  const open = await p.evaluate(() => window.__mam.game.overlays.some((o) => o.name === 'sort_game'));
  if (!open) {
    fail.push(`L${lv}: level did not open from the menu`);
    await p.screenshot({ path: `playtest-output/sort_L${lv}_menu.png` });
    await p.close();
    continue;
  }
  const coins0 = await p.evaluate(() => window.__mam.game.state.coins);
  let moves = 0;
  for (; moves < 1500; moves++) {
    const st = await p.evaluate(() => {
      const o = window.__mam.game.overlays.find((x) => x.name === 'sort_game');
      if (o.result) return { done: true, won: o.result.won, stars: o.result.stars };
      const m = window.__mam.rules.sortHint(o.board, o.plan);
      if (!m) return { done: false, stuck: true };
      const a = o.slotPos(m[0], m[1]);
      const c = o.slotPos(m[2], m[3]);
      return { done: false, a, c };
    });
    if (st.done) {
      out.push({ level: lv, won: st.won, stars: st.stars, moves });
      break;
    }
    if (st.stuck) {
      fail.push(`L${lv}: hint found no move`);
      break;
    }
    await tap(st.a.x, st.a.y);
    await tap(st.c.x, st.c.y);
    if (moves === 3) await p.screenshot({ path: `playtest-output/sort_L${lv}_play.png` });
  }
  await p.waitForTimeout(500);
  await p.screenshot({ path: `playtest-output/sort_L${lv}_result.png` });
  const coins1 = await p.evaluate(() => window.__mam.game.state.coins);
  const r = out.find((x) => x.level === lv);
  if (!r?.won) fail.push(`L${lv}: not won (${JSON.stringify(r)})`);
  else if (coins1 <= coins0) fail.push(`L${lv}: no first-clear coins`);
  await p.close();
}
console.log(JSON.stringify(out));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'market sort play-through passed');
await b.close();
process.exit(fail.length ? 1 : 0);
