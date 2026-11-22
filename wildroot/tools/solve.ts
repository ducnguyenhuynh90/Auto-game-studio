// Usage: npx vite-node wildroot/tools/solve.ts [levelId] [seeds]
import { LEVELS, simulate } from '../src/sim';
import { dominantActions, minimalWinners, solve } from '../src/solver';

const pick = process.argv[2];
const seeds = Number(process.argv[3] ?? 40);
for (const level of LEVELS.filter((l) => !pick || l.id === pick)) {
  const res = solve(level, seeds);
  console.log(`\n== ${level.id} (budget ${level.budget}, ${seeds} seeds)`);
  for (const r of res) {
    const last = simulate(level, 1, r.actions).snaps.at(-1)!;
    console.log(
      `${(r.winRate * 100).toFixed(0).padStart(4)}%  c${r.cost}  ${(r.actions.join('+') || '(none)').padEnd(28)}` +
        ` frogs ${last.frogs.toFixed(0).padStart(3)} clar ${(last.clarity * 100).toFixed(0).padStart(3)}% mosq ${last.mosquito.toFixed(0).padStart(3)} fish ${last.fish.toFixed(0).padStart(3)} drag ${last.dragonflies.toFixed(0)}`,
    );
  }
  console.log('minimal winners:', minimalWinners(res).map((r) => r.actions.join('+')));
  console.log('dominant actions:', dominantActions(res));
}
