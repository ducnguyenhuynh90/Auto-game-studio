// Island + puzzle regression: builds, hires, solves Salt 1 and Shop 1 by tapping the real UI, trains
// staff, then lets the staff work and checks the output. Needs the dev server (npm run dev) on :5173.
// node tools/island-qa.mjs [outPrefix]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const prefix = process.argv[2] ?? 'playtest-output/island';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/?reset=1&scene=island&seed=7');
await p.waitForTimeout(1200);
const ev = (fn, arg) => p.evaluate(fn, arg);
await ev(() => {
  const g = window.__mam.game;
  g.state.storySeen.push('island_intro', 'intro', 'first_sale');
  g.state.career = { stage: 1, done: [] }; // a Village Mắm Maker: room for 4 staff (core/team.ts)
  g.overlays = [];
});
const tap = async (x, y) => {
  await p.mouse.click(x, y);
  await p.waitForTimeout(120);
};
const fail = (m) => {
  errs.push(m);
  console.log('FAIL', m);
};
// tile centre in screen space
const tileXY = (t) => ({ x: 20 + (t % 7) * 50 + 25, y: 112 + Math.floor(t / 7) * 50 + 25 });
const cardXY = (i) => ({ x: 20 + (i % 4) * 87.5 + 44, y: 572 + 34 + Math.floor(i / 4) * 110 + 50 });
// 1) dock and salt field on the two beach plots beside the village (2,0) and (4,0); brew house on grass (2,1)
const builds = [
  [2, 0],
  [4, 1],
  [9, 2],
];
for (const [tile, card] of builds) {
  const t = tileXY(tile);
  await tap(t.x, t.y);
  const c = cardXY(card);
  await tap(c.x, c.y);
  await tap(t.x, t.y);
  await tap(195, 676); // hire
}
const st = await ev(() => window.__mam.game.state.island.staff.map((s) => s.role).join(','));
if (st !== 'fisher,salter,brewer') fail(`staff hired: ${st}`);
await p.screenshot({ path: `${prefix}_built.png` });
// 2) Salt puzzle 1: open the hub, tap level 1 of Salt, turn every pipe to its solution
await tap(315, 33);
await tap(30 + ((390 - 60) / 6) * 0.5, 92 + 248 + 134);
const turns = await ev(() => {
  const o = window.__mam.game.top;
  const out = [];
  const cs = Math.min(66, Math.floor((390 - 40) / o.board.w));
  const ox = (390 - cs * o.board.w) / 2;
  o.board.cells.forEach((c, i) => {
    if (c.kind !== 'pipe') return;
    let m = c.mask;
    let k = 0;
    while (m !== c.solved && k < 4) {
      m = ((m << 1) | (m >> 3)) & 15;
      k++;
    }
    for (let j = 0; j < k; j++) out.push([ox + (i % o.board.w) * cs + cs / 2, 210 + Math.floor(i / o.board.w) * cs + cs / 2]);
  });
  return out;
});
for (const [x, y] of turns) await tap(x, y);
await p.waitForTimeout(600);
await p.screenshot({ path: `${prefix}_salt_solved.png` });
const salt = await ev(() => window.__mam.game.state.puzzles.salt[0]);
if (salt !== 3) fail(`salt 1 stars ${salt}`);
await tap(195, 554); // back to puzzles
// 3) Shop puzzle 1: Bà Hai needs Fine (reef 24), Anh Long gets the classic
await tap(30 + ((390 - 60) / 6) * 0.5, 92 + 2 * 248 + 134);
await p.waitForTimeout(300);
const shop = await ev(() => {
  const o = window.__mam.game.top;
  const l = o.level;
  const n = l.customers.length;
  const ch = Math.min(84, Math.floor(430 / n));
  const shelfY = 132 + n * ch + 8;
  const bw = (390 - 32) / l.bottles.length;
  return { ch, shelfY, bw, n };
});
const bottle = (i) => [16 + i * shop.bw + shop.bw / 2, shop.shelfY + 80];
const cust = (i) => [195, 132 + i * shop.ch + 30];
await tap(...bottle(1));
await tap(...cust(1));
await tap(...bottle(0));
await tap(...cust(0));
await tap(195, Math.min(844 - 70, shop.shelfY + 160) + 25);
await p.waitForTimeout(600);
await p.screenshot({ path: `${prefix}_shop_solved.png` });
const shopStars = await ev(() => window.__mam.game.state.puzzles.shop[0]);
if (!(shopStars >= 1)) fail(`shop 1 stars ${shopStars}`);
// 4) train the salter (cap is now 2) and let everyone work for a while
const trained = await ev(() => {
  const g = window.__mam.game;
  const s = g.state;
  const salter = s.island.staff.find((x) => x.role === 'salter');
  s.coins += 500;
  g.overlays = [];
  return salter.level;
});
await tap(...Object.values(tileXY(4)));
await tap(390 - 62, 572 + 76 + 23);
const lvl = await ev(() => window.__mam.game.state.island.staff.find((x) => x.role === 'salter').level);
if (lvl !== trained + 1) fail(`salter level ${trained} → ${lvl}`);
const made = await ev(() => {
  const g = window.__mam.game;
  // ten minutes of staff work through the real game loop (time scale 20)
  g.timeScale = 20;
  for (let i = 0; i < 600; i++) g.update(0.05);
  g.timeScale = 1;
  return g.state.island.made;
});
await p.waitForTimeout(400);
await p.screenshot({ path: `${prefix}_working.png` });
if (!(made.fish > 3 && made.salt > 3)) fail(`staff output ${JSON.stringify(made)}`);
console.log(JSON.stringify({ made, salt, shopStars }));
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'island QA passed, no errors');
await b.close();
process.exit(errs.length ? 1 : 0);
