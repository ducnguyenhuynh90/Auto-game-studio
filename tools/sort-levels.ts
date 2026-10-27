// Prints the 50 Market Sort levels (src/core/sort.ts): size, goods, locks, timer, and how long the
// solver takes to prove each one winnable.   npx vite-node tools/sort-levels.ts
import { SORT_LEVELS, goodsLeft, sortBoard, sortLevelSpec } from '../src/core/sort';

const t0 = Date.now();
for (let i = 0; i < SORT_LEVELS; i++) {
  const a = Date.now();
  const sp = sortLevelSpec(i);
  try {
    const b = sortBoard(i);
    console.log(`${String(i + 1).padStart(2)} ${sp.tier.padEnd(10)} shelves ${String(sp.shelves).padStart(2)} rows ${sp.depth} kinds ${String(sp.kinds).padStart(2)} goods ${String(goodsLeft(b)).padStart(3)} locked ${sp.locked} time ${sp.time}s  (${Date.now() - a} ms)`);
  } catch (e) {
    console.log(`${i + 1} FAIL ${String(e)}`);
  }
}
console.log(`all levels in ${Date.now() - t0} ms`);
