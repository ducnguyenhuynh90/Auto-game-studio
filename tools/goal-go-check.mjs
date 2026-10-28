// Taps the goal banner in the real web game for a few goals and checks it opens the right screen:
// "Upgrade your fishing gear" with enough coins → Market on the gear upgrade; without → a note + fishing;
// "Feed Mực" → the dog. Needs: npm run build && npx vite preview --port 4173.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.argv[3] ?? 'playtest-output';
const b = await chromium.launch();
const fail = [];
const cases = [
  { goal: 'gear1', coins: 1000, expect: 'market' },
  { goal: 'gear1', coins: 0, expect: 'fishing' },
  { goal: 'dog_feed', coins: 0, expect: 'dog' },
  { goal: 'jar2', coins: 1000, expect: 'market' },
];
for (const c of cases) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', (e) => fail.push(`${c.goal}: ${e.message}`));
  await p.goto(`${base}?reset=1`);
  await p.waitForFunction(() => !!window.__mam?.game, null, { timeout: 30000 });
  await p.evaluate(({ goal, coins }) => {
    const g = window.__mam.game;
    const ids = ['catch3', 'seal1', 'trip2', 'open1', 'sell1', 'dog_feed', 'jar2', 'dog_home', 'chain2', 'dog_boat', 'gear1'];
    g.state.goalsDone = ids.slice(0, ids.indexOf(goal));
    g.state.coins = coins;
    g.state.stats.casts = 9;
    g.state.stats.sold = Math.max(1, g.state.stats.sold);
    g.state.storySeen = ['intro', 'first_sale', 'dog_arrive', 'dog_trust', 'dog_boat', 'dog_done', 'tutorial_done', 'island_intro', 'food_chain'];
    g.commit();
  }, c);
  await p.waitForTimeout(700);
  const box = await p.locator('canvas').last().boundingBox();
  const k = box.width / 390;
  await p.mouse.click(box.x + 120 * k, box.y + 100 * k);
  await p.waitForTimeout(700);
  const where = await p.evaluate(() => {
    const g = window.__mam.game;
    const top = g.overlays[g.overlays.length - 1];
    return top ? top.name : g.scene?.name;
  });
  await p.screenshot({ path: `${shots}/goalgo_${c.goal}_${c.coins}.png` });
  if (!String(where).includes(c.expect)) fail.push(`${c.goal} with ${c.coins} coins opened "${where}", expected ${c.expect}`);
  await p.close();
}
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'goal banner opens the right screen');
await b.close();
process.exit(fail.length ? 1 : 0);
