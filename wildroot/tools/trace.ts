// Usage: npx vite-node wildroot/tools/trace.ts <levelId> <seed> [action+action]
import { LEVELS, habitat, simulate, type ActionId } from '../src/sim';

const level = LEVELS.find((l) => l.id === (process.argv[2] ?? 'missing-frogs'))!;
const seed = Number(process.argv[3] ?? 1);
const actions = (process.argv[4] ?? '').split('+').filter(Boolean) as ActionId[];
const run = simulate(level, seed, actions);
console.log(habitat(run.map));
console.log('t  frogs fish mosq drag plant algae nutr | fishPred oxy refuge recruits winter hunger dry');
for (const s of run.snaps)
  console.log(
    [s.t, s.frogs, s.fish, s.mosquito, s.dragonflies, s.plants, s.algae, s.nutrients].map((v) => String(Math.round(v * 100) / 100).padStart(5)).join(' '),
    '|',
    [s.fishPred, s.oxygenLoss, s.refuge, s.recruits, s.winterLoss, s.hunger, s.shallowDry].map((v) => String(Math.round(v * 100) / 100).padStart(5)).join(' '),
  );
