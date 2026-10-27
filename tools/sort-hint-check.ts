// Follows the in-game smart hint from the start of each Market Sort level and reports wins and speed.
//   npx vite-node tools/sort-hint-check.ts [levels=1,10,20,30,40,50]
import { SORT_LEVELS, goodsLeft, smartHint, sortBoard, sortMove, sortWon, type HintPlan } from '../src/core/sort';

const levels = (process.argv[2] ?? Array.from({ length: SORT_LEVELS }, (_, i) => i + 1).join(',')).split(',').map(Number).filter((n) => n >= 1 && n <= SORT_LEVELS);
for (const lv of levels) {
  const b = sortBoard(lv - 1);
  const t0 = Date.now();
  let worst = 0;
  let n = 0;
  const plan: HintPlan = { states: [], moves: [] };
  for (; n < 3000 && !sortWon(b); n++) {
    const a = Date.now();
    const m = smartHint(b, plan);
    worst = Math.max(worst, Date.now() - a);
    if (!m) break;
    if (!sortMove(b, ...m).ok) {
      console.log(`L${lv}: hint gave an illegal move ${m}`);
      break;
    }
  }
  console.log(`L${lv}: ${sortWon(b) ? 'won' : `NOT won (${goodsLeft(b)} left)`} in ${n} moves, ${Date.now() - t0} ms, slowest hint ${worst} ms`);
}
