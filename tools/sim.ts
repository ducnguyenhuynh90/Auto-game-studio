// Fast economy/progression simulation on the pure rules (no rendering). A simulated player of a given
// skill fishes, brews, sells, upgrades and follows the sea route; we log when milestones happen.
// This measures PACING, not fun. Usage: npx vite-node tools/sim.ts [skill=0.6] [trips=150] [seed=1]
declare const process: { argv: string[] };
import { BALANCE, SPECIES_BY_ID, UPGRADES, type UpgradeId } from '../src/core/data';
import { castDistance, rollShadow } from '../src/core/fishing';
import { BUILDINGS_BY_ID, build, buyPlot, canExpand, hire, hireCost, placeProblem, staffAt, terrain, tickIsland, trainStaff, COLS, ROWS, type BuildingId } from '../src/core/island';
import { completeLevel } from '../src/core/puzzles';
import { upgradeBrand } from '../src/core/brand';
import { buildDogHouse, feedDog } from '../src/core/dog';
import { HUNGRY_DIFFICULTY, addChainLink, foodLevel, rollHungry } from '../src/core/chain';
import { checkGoals } from '../src/core/goals';
import { careerLock, checkCareer, enterAwards, nextCareerGoal } from '../src/core/career';
import { deliverContract, refreshContracts } from '../src/core/business';
import { levelForXp } from '../src/core/progression';
import { makeRng } from '../src/core/rng';
import { SEAS, seaComplete, seaLock } from '../src/core/seas';
import { addCatch, agingLevel, bestJarFill, buyUpgrade, castsPerTrip, checkMissions, finishTrip, newState, openJar, sealJar, sellProduct, upgradeCost, useGadget } from '../src/core/state';

const skill = Number(process.argv[2] ?? 0.6);
const trips = Number(process.argv[3] ?? 150);
const rng = makeRng(Number(process.argv[4] ?? 1));
const s = newState();
const castsAt: number[] = [];
const SECONDS_PER_CAST = 13; // aim + wait + reel + card, measured roughly from bot runs
const milestones: Record<string, number> = {};
const mark = (k: string, trip: number) => {
  if (milestones[k] === undefined) milestones[k] = trip;
};

// island automation (build 3.0): pass --island to let the simulated player run the business
const useIsland = process.argv.includes('--island');
const SECONDS_PER_TRIP_REAL = 90; // a trip plus village time; staff work during it
let clock = 1_000_000;
const islandPlan: BuildingId[] = ['dock', 'saltfield', 'brewhouse', 'shop', 'touroffice', 'dock', 'warehouse', 'lantern', 'brewhouse', 'tradepost', 'shrine'];
function runIsland(trip: number): void {
  if (!useIsland || s.stats.sold < 1) return;
  // staff work while the player fishes
  for (let k = 0; k < SECONDS_PER_TRIP_REAL / 10; k++) {
    clock += 10_000;
    tickIsland(s, 10, rng, clock);
  }
  // the player solves about one puzzle per section every 4 trips (5 built per section)
  if (trip % 4 === 0) for (const sec of ['fishing', 'salt', 'shop'] as const) {
    const i = s.puzzles[sec].filter((x) => x > 0).length;
    if (i < 10) completeLevel(s, sec, i, 2);
  }
  // build the next thing on the plan, buying land when needed; hire into empty slots; train
  // (buildings the player isn't famous enough for yet are skipped, like a real player would)
  const want = islandPlan.find((id, i) => !careerLock(s, id) && s.island.buildings.filter((b) => b.id === id).length < islandPlan.slice(0, i + 1).filter((x) => x === id).length);
  if (want && s.coins >= BUILDINGS_BY_ID[want].cost) {
    const spot = s.island.owned.find((t) => !placeProblem(s, t, want));
    if (spot !== undefined) {
      build(s, spot, want);
      mark(`island: build ${want}`, trip);
    } else {
      for (let t = 0; t < COLS * ROWS; t++) if (canExpand(s, t) && 'bcsp'.includes(terrain(t)) === (BUILDINGS_BY_ID[want].needs !== 'land') && buyPlot(s, t).ok) break;
    }
  }
  for (const b of s.island.buildings) {
    const role = BUILDINGS_BY_ID[b.id].role;
    if (role && staffAt(s, b.tile).length < b.level && s.coins >= hireCost(s, role) + 50) hire(s, b.tile);
  }
  for (const st of s.island.staff) trainStaff(s, st.uid);
  // follow the Road's goals that need a decision: land, export orders
  const g = nextCareerGoal(s)?.id;
  if (g === 'c3_land' || g === 'c6_island')
    for (let t = 0; t < COLS * ROWS; t++) if (canExpand(s, t) && buyPlot(s, t).ok) break;
  if (s.island.buildings.some((b) => b.id === 'tradepost')) {
    refreshContracts(s, clock);
    for (const c of s.island.contracts ?? []) if (!c.done && deliverContract(s, c.id)) mark('export order delivered', trip);
  }
}

const priority: UpgradeId[] = ['jars', 'line', 'rod', 'hook', 'boat', 'bait', 'jars', 'salt', 'stall', 'line', 'boat', 'hook', 'rod', 'bait', 'jars', 'salt', 'stall', 'line', 'boat', 'hook', 'rod', 'bait'];

for (let trip = 1; trip <= trips; trip++) {
  // sail to the first unfinished, unlocked sea
  const target = SEAS.find((x) => !seaComplete(s, x) && !seaLock(s, x));
  if (target) s.sea = target.id;
  const reach = BALANCE.lineReach[s.upgrades.line];
  // food chain (from trip 2): after a catch, a hungry fish one level up rises within reach
  let chain = 0;
  let hungry: string | null = null;
  for (let c = 0; c < castsPerTrip(s); c++) {
    s.stats.casts++;
    // aim: skilled players avoid the red band and pick reachable shadows
    if (rng() < 0.12 * (1 - skill)) {
      s.stats.tangles++;
      continue;
    }
    // planners (share = skill) cast at the hungry fish; everyone else fishes as before
    const chasing = hungry !== null && rng() < skill;
    let spec = rollShadow(rng, s.sea, s.upgrades.bait);
    if (chasing) {
      const hsp = SPECIES_BY_ID[hungry!];
      spec = { species: hungry!, size: (hsp.size[0] + hsp.size[1]) / 2, depth: Math.min(hsp.depth, reach - 0.1) };
    }
    for (let tries = 0; tries < 4 && spec.depth > reach; tries++) spec = rollShadow(rng, s.sea, s.upgrades.bait);
    if (spec.depth > reach) {
      chain = 0;
      hungry = null;
      continue; // only unreachable fish around this cast
    }
    castDistance(Math.min(1, spec.depth / reach) * BALANCE.overcast, reach);
    const sp = SPECIES_BY_ID[spec.species];
    const diff = sp.difficulty * (chasing ? HUNGRY_DIFFICULTY : 1);
    // missed bite / snapped / escaped, harder fish and weak hooks fail more
    const fail = 0.08 + (1 - skill) * 0.2 + diff * 0.25 - s.upgrades.hook * 0.05 - s.upgrades.rod * 0.03;
    if (rng() < Math.max(0.03, fail)) {
      chain = 0;
      hungry = null;
      continue;
    }
    const fresh = Math.min(1, Math.max(0, skill + (rng() - 0.5) * 0.6 - diff * 0.15));
    addCatch(s, spec.species, spec.size, fresh, s.sea, rng);
    if (trip < 2) continue;
    const lvl = foodLevel(spec.species);
    chain = chasing ? chain + 1 : lvl ? 1 : 0;
    if (chain >= 2) addChainLink(s, chain);
    hungry = lvl ? rollHungry(rng, s.sea, lvl, s.upgrades.bait) : null;
  }
  finishTrip(s, true);
  castsAt[trip] = s.stats.casts; // trips get longer with the boat, so time is counted per cast
  // brew: open ready jars (wait for 2 aging levels when possible), seal new ones
  s.jars.forEach((j, i) => {
    if (j.sealed && agingLevel(s, j, 0) >= 2) openJar(s, i, 0);
  });
  // staff bottles are left for the shopkeeper once there is one (that is what earns the income rate)
  const seller = s.island.staff.some((x) => x.role === 'seller');
  // the banner's goal steers the player, like a real one: keep Legendary bottles for the awards
  const goal = nextCareerGoal(s)?.id;
  if (s.island.buildings.some((b) => b.id === 'tradepost')) {
    refreshContracts(s, clock);
    for (const c of s.island.contracts ?? []) if (!c.done && deliverContract(s, c.id)) mark('export order delivered', trip);
  }
  if (goal === 'c7_awards') while (enterAwards(s) !== null) mark('AWARDS entry', trip);
  for (const p of [...s.shelf]) if (!p.auto || !seller) sellProduct(s, p.uid);
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
  runIsland(trip);
  // Mực: feed him after the first sale, then build his house
  while (s.stats.sold >= 1 && s.dog.fed < 3 && feedDog(s));
  buildDogHouse(s);
  if (upgradeBrand(s)) mark(`brand ${s.brand.level}`, trip);
  checkGoals(s);
  for (const up of checkCareer(s)) mark(`CAREER stage ${up.index + 1}: ${up.stage.title}`, trip);
  for (const m of checkMissions(s)) {
    mark(`mission ${m.mission.id}`, trip);
    if (m.relic) mark(`RELIC ${m.relic} (${m.sea.name} done)`, trip);
  }
  for (const sea of SEAS) if (!seaLock(s, sea)) mark(`unlock ${sea.name}`, trip);
  for (const id of ['golden', 'carp', 'oarfish', 'giantsquid', 'trevally']) if (s.dex[id]) mark(`caught ${id}`, trip);
  mark(`level ${levelForXp(s.xp)}`, trip);
  if (trip % 25 === 0) mark(`coins ${s.coins} earned ${s.stats.earned} @${trip}`, trip);
}

const min = (t: number) => `${Math.round(((castsAt[t] ?? t * castsPerTrip(s)) * SECONDS_PER_CAST) / 60)} min`;
console.log(`skill ${skill}, ${trips} trips (≈${min(trips)} of fishing)\n`);
for (const [k, t] of Object.entries(milestones).sort((a, b) => a[1] - b[1])) {
  if (k.startsWith('level') && Number(k.split(' ')[1]) % 5 !== 0) continue;
  console.log(`trip ${String(t).padStart(3)} (~${min(t).padStart(7)})  ${k}`);
}
console.log(`degrees made ${JSON.stringify(s.cellar)} shelf ${JSON.stringify(s.shelf.map((p) => p.degrees))}`);
console.log(`career ${JSON.stringify(s.career)} owned ${s.island.owned.length}`);
console.log(`staff ${JSON.stringify(s.island.staff.map((x) => x.role + x.level))} shelf ${s.shelf.length} auto ${s.shelf.filter((p) => p.auto).length} jars ${JSON.stringify(s.jars.map((j) => (j.sealed ? (j.auto ? "A" : "P") : "-")))} buildings ${s.island.buildings.map((b) => b.id).join(",")} unpaid ${s.island.unpaid}`);
console.log(`\nfinal: coins ${s.coins}, level ${levelForXp(s.xp)}, relics ${s.relics.join(',')}, upgrades ${JSON.stringify(s.upgrades)}, tangles ${s.stats.tangles}, brand ${s.brand.level} rep ${s.brand.rep}, ledger ${JSON.stringify(s.island.ledger)}, island ${JSON.stringify(s.island.made)}, chain links ${s.stats.chains}, best chain ${s.stats.bestChain}`);
