// Fast economy/progression simulation on the pure rules (no rendering). A simulated player of a given
// skill fishes, brews, sells, upgrades and follows the sea route; we log when milestones happen.
// This measures PACING, not fun. Usage: npx vite-node tools/sim.ts [skill=0.6] [trips=150] [seed=1]
declare const process: { argv: string[] };
import { BALANCE, SPECIES_BY_ID, UPGRADES, type UpgradeId } from '../src/core/data';
import { castDistance, rollShadow } from '../src/core/fishing';
import { checkGoals } from '../src/core/goals';
import { levelForXp } from '../src/core/progression';
import { makeRng } from '../src/core/rng';
import { SEAS, seaComplete, seaLock } from '../src/core/seas';
import { addCatch, agingLevel, bestJarFill, buyUpgrade, castsPerTrip, checkMissions, finishTrip, newState, openJar, sealJar, sellProduct, upgradeCost, useGadget } from '../src/core/state';

const skill = Number(process.argv[2] ?? 0.6);
const trips = Number(process.argv[3] ?? 150);
const rng = makeRng(Number(process.argv[4] ?? 1));
const s = newState();
const SECONDS_PER_CAST = 13; // aim + wait + reel + card, measured roughly from bot runs
const milestones: Record<string, number> = {};
const mark = (k: string, trip: number) => {
  if (milestones[k] === undefined) milestones[k] = trip;
};

const priority: UpgradeId[] = ['jars', 'line', 'rod', 'hook', 'boat', 'bait', 'jars', 'salt', 'stall', 'line', 'boat', 'hook', 'rod', 'bait', 'jars', 'salt', 'stall', 'line', 'boat', 'hook', 'rod', 'bait'];

for (let trip = 1; trip <= trips; trip++) {
  // sail to the first unfinished, unlocked sea
  const target = SEAS.find((x) => !seaComplete(s, x) && !seaLock(s, x));
  if (target) s.sea = target.id;
  const reach = BALANCE.lineReach[s.upgrades.line];
  for (let c = 0; c < castsPerTrip(s); c++) {
    s.stats.casts++;
    // aim: skilled players avoid the red band and pick reachable shadows
    if (rng() < 0.12 * (1 - skill)) {
      s.stats.tangles++;
      continue;
    }
    let spec = rollShadow(rng, s.sea, s.upgrades.bait);
    for (let tries = 0; tries < 4 && spec.depth > reach; tries++) spec = rollShadow(rng, s.sea, s.upgrades.bait);
    if (spec.depth > reach) continue; // only unreachable fish around this cast
    castDistance(Math.min(1, spec.depth / reach) * BALANCE.overcast, reach);
    const sp = SPECIES_BY_ID[spec.species];
    // missed bite / snapped / escaped, harder fish and weak hooks fail more
    const fail = 0.08 + (1 - skill) * 0.2 + sp.difficulty * 0.25 - s.upgrades.hook * 0.05 - s.upgrades.rod * 0.03;
    if (rng() < Math.max(0.03, fail)) continue;
    const fresh = Math.min(1, Math.max(0, skill + (rng() - 0.5) * 0.6 - sp.difficulty * 0.15));
    addCatch(s, spec.species, spec.size, fresh, s.sea, rng);
  }
  finishTrip(s, true);
  // brew: open ready jars (wait for 2 aging levels when possible), seal new ones
  s.jars.forEach((j, i) => {
    if (j.sealed && agingLevel(s, j, 0) >= 2) openJar(s, i, 0);
  });
  for (const p of [...s.shelf]) sellProduct(s, p.uid);
  if ((s.gadgets.salt ?? 0) > 0) useGadget(s, 'salt');
  s.jars.forEach((j, i) => {
    const pick = bestJarFill(s);
    if (!j.sealed && pick.length === BALANCE.jarSlots) sealJar(s, i, pick, rng, 0);
  });
  // sell non-fermentable leftovers and excess fish
  for (const f of [...s.bucket]) if (SPECIES_BY_ID[f.species].sauce === 0 || s.bucket.length > 12) {
    s.coins += SPECIES_BY_ID[f.species].raw;
    s.bucket.splice(s.bucket.indexOf(f), 1);
  }
  for (const id of priority) {
    const cost = upgradeCost(s, id);
    if (cost !== null && s.coins >= cost) {
      buyUpgrade(s, id);
      mark(`buy ${id} ${UPGRADES.find((u) => u.id === id)!.levels[s.upgrades[id]].name}`, trip);
      break;
    }
  }
  checkGoals(s);
  for (const m of checkMissions(s)) {
    mark(`mission ${m.mission.id}`, trip);
    if (m.relic) mark(`RELIC ${m.relic} (${m.sea.name} done)`, trip);
  }
  for (const sea of SEAS) if (!seaLock(s, sea)) mark(`unlock ${sea.name}`, trip);
  for (const id of ['golden', 'carp', 'oarfish', 'giantsquid']) if (s.dex[id]) mark(`caught ${id}`, trip);
  mark(`level ${levelForXp(s.xp)}`, trip);
  if (trip % 25 === 0) mark(`coins ${s.coins} earned ${s.stats.earned} @${trip}`, trip);
}

const min = (t: number) => `${Math.round((t * castsPerTrip(s) * SECONDS_PER_CAST) / 60)} min`;
console.log(`skill ${skill}, ${trips} trips (≈${min(trips)} of fishing)\n`);
for (const [k, t] of Object.entries(milestones).sort((a, b) => a[1] - b[1])) {
  if (k.startsWith('level') && Number(k.split(' ')[1]) % 5 !== 0) continue;
  console.log(`trip ${String(t).padStart(3)} (~${min(t).padStart(7)})  ${k}`);
}
console.log(`\nfinal: coins ${s.coins}, level ${levelForXp(s.xp)}, relics ${s.relics.join(',')}, upgrades ${JSON.stringify(s.upgrades)}, tangles ${s.stats.tangles}`);
