// A believable mid-game save for store screenshots and the preview video (tools/store-shots.mjs):
// a few hours in, built with the real rules (no impossible states). Writes store/demo-save.json.
//   npx vite-node tools/store-save.ts
import { writeFileSync } from 'node:fs';
import { buildDogHouse, feedDog } from '../src/core/dog';
import { build, buyPlot, canExpand, hire, terrain, type BuildingId } from '../src/core/island';
import { makeRng } from '../src/core/rng';
import { SCENES } from '../src/core/story';
import { GOALS } from '../src/core/goals';
import { addCatch, bestJarFill, buyUpgrade, finishTrip, newState, openJar, sealJar } from '../src/core/state';

const s = newState();
const rng = makeRng(7);
const now = Date.now();
s.storySeen = SCENES.map((x) => x.id);
s.goalsDone = GOALS.map((g) => g.id);
// a few hours of fishing at home and on the reef
const haul: [string, number][] = [['anchovy', 18], ['sardine', 9], ['scad', 5], ['mackerel', 3], ['squid', 6], ['snapper', 2], ['grouper', 1], ['crab', 2], ['golden', 1], ['bottle', 1], ['chest', 1]];
for (const [sp, n] of haul) for (let i = 0; i < n; i++) addCatch(s, sp, 10 + rng() * 40, 0.7 + rng() * 0.3, sp === 'squid' || sp === 'snapper' || sp === 'grouper' || sp === 'chest' ? 'reef' : 'lagoon', rng);
for (let t = 0; t < 30; t++) finishTrip(s, true);
s.stats.casts = 190;
s.stats.sold = 14;
s.coins = 60000;
for (const id of ['rod', 'line', 'hook', 'bait', 'boat', 'jars', 'jars', 'jars', 'salt', 'stall'] as const) buyUpgrade(s, id);
// the island business
s.career = { stage: 3, done: [] };
for (let k = 0; k < 10; k++) {
  const t = [...Array(63).keys()].find((i) => canExpand(s, i) && 'bcsgf'.includes(terrain(i)));
  if (t !== undefined) buyPlot(s, t);
}
const plan: [string, BuildingId][] = [['b', 'dock'], ['s', 'saltfield'], ['g', 'brewhouse'], ['g', 'shop'], ['g', 'lantern'], ['g', 'touroffice']];
for (const [ter, id] of plan) {
  const t = s.island.owned.find((i) => terrain(i) === ter && !s.island.buildings.some((b) => b.tile === i));
  if (t !== undefined && build(s, t, id)) hire(s, t);
}
// Mực lives here now
for (let i = 0; i < 3; i++) feedDog(s);
buildDogHouse(s);
// jars: two brewed and opened (bottles on the shelf), one ready to open, one waiting to be filled
for (let k = 0; k < 2; k++) {
  sealJar(s, 0, bestJarFill(s), rng, now - 3600_000);
  s.stats.fullTrips += 3;
  openJar(s, 0, now);
}
sealJar(s, 1, bestJarFill(s), rng, now - 7200_000);
s.stats.fullTrips += 4;
for (let i = 0; i < 6; i++) addCatch(s, 'anchovy', 11, 0.95, 'lagoon', rng);
s.brand = { level: 1, rep: 64 };
s.sort = [3, 3, 3, 2, 3, 3, 2, 3, 3, 3, 2, 3, 3, 3, 3, 2, 3, 3, 3, 2];
s.coins = 1840;
s.xp = Math.max(s.xp, 2600);
s.bucket = s.bucket.slice(-9); // a realistic bucket
s.island.lastTick = now;
writeFileSync('store/demo-save.json', JSON.stringify(s));
console.log(`demo save: coins ${s.coins}, buildings ${s.island.buildings.map((b) => b.id).join(',')}, staff ${s.island.staff.length}, shelf ${s.shelf.length}, bucket ${s.bucket.length}, dex ${Object.keys(s.dex).length}`);
