// Usage: npx vite-node wildroot/tools/probe.ts — end-of-level frogs for lesson tuning
import { levelById, simulate, type ActionId } from '../src/sim';
const show = (id: string, sets: ActionId[][], years: number[]) => {
  for (const y of years) {
    const L = { ...levelById(id), years: y };
    console.log(id, 'years', y, sets.map((a) => `${a.join('+') || 'none'}=${[1, 2, 3].map((s) => Math.round(simulate(L, s, a).snaps.at(-1)!.frogs)).join('/')}`).join('  '));
  }
};
show('hide', [[], ['reeds']], [2, 3, 4]);
show('release', [['addFrogs'], ['reeds']], [2, 3, 4]);
show('winter', [[], ['logs'], ['shade'], ['addFrogs']], [2, 3, 4]);
