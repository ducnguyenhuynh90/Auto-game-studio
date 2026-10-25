// The business report: every way the island earns and spends, what each needs to switch on, which
// staff are idle and why, and concrete ways to cut costs. Also export contracts at the Trading Post.
// Pure rules: the report screen (scenes/business.ts) only draws these and runs the linked actions.
import { BALANCE, saucePrice } from './data';
import { spawnWeight, speciesForSea } from './fishing';
import { brandMult } from './brand';
import {
  BUILDINGS_BY_ID,
  ROLE,
  ROLE_STEP,
  brewSeconds,
  isAuto,
  sellSeconds,
  shopMult,
  tourSeconds,
  UPKEEP,
  attraction,
  bucketCap,
  fishSeconds,
  ledger,
  level,
  placeProblem,
  saltCap,
  saltSeconds,
  staffLevelCap,
  terrain,
  ticketPrice,
  tourGroup,
  upkeepPerHour,
  wage,
  wagesPerHour,
  type BuildingId,
  type Contract,
  type Role,
  type Staff,
} from './island';
import { makeRng } from './rng';
import { agingLevel, canFerment, type GameState, type Product } from './state';

/** Where a "Set up" / "Fix" button leads. */
export type Fix =
  | { kind: 'build'; building: BuildingId; tile: number | null }
  | { kind: 'select'; tile: number }
  | { kind: 'market' | 'brand' | 'puzzles' | 'fish' | 'contracts' | 'boost' | 'jars' };

export interface Source {
  id: string;
  name: string;
  /** What it makes: coins per hour, or goods per hour that feed the next step. */
  value: string;
  status: 'active' | 'idle' | 'off';
  /** One line: what it needs, or what is blocking it. */
  how: string;
  fix?: { label: string; action: Fix };
}

const has = (s: GameState, id: BuildingId) => s.island.buildings.some((b) => b.id === id);
const firstOf = (s: GameState, id: BuildingId) => s.island.buildings.find((b) => b.id === id);
const staffOf = (s: GameState, role: Role) => s.island.staff.filter((x) => x.role === role);

/** An owned plot where this building can go right now (ignoring coins), or null if land must be bought. */
export function suggestPlot(s: GameState, id: BuildingId): number | null {
  for (const t of s.island.owned) {
    const p = placeProblem(s, t, id);
    if (!p || p === `Needs ${BUILDINGS_BY_ID[id].cost} coins`) return t;
  }
  return null;
}

function setUp(s: GameState, building: BuildingId, role: Role | null): { how: string; fix: { label: string; action: Fix } } {
  const b = firstOf(s, building);
  const def = BUILDINGS_BY_ID[building];
  if (!b) {
    const where = def.needs === 'shore' ? 'on the shore' : def.needs === 'pier' ? 'on the Old Pier' : 'on open land';
    const lvl = def.minLevel > 1 ? ` (island Lv ${def.minLevel})` : '';
    return { how: `Build a ${def.name} ${where}${lvl}${role ? `, then hire a ${ROLE[role].title}` : ''}.`, fix: { label: `Build · ${def.cost}`, action: { kind: 'build', building, tile: suggestPlot(s, building) } } };
  }
  return { how: `Hire a ${ROLE[role!].title} at your ${def.name}.`, fix: { label: 'Hire ›', action: { kind: 'select', tile: b.tile } } };
}

/** A full store usually means the brewing step is the bottleneck: fix that first, then storage. */
function fullStore(s: GameState, what: string): { why: string; fix: { label: string; action: Fix } } {
  if (!staffOf(s, 'brewer').length) return { why: `${what}: no brewer`, fix: { label: 'Hire brewer', action: { kind: 'select', tile: firstOf(s, 'brewhouse')!.tile } } };
  if (s.upgrades.jars < 3) return { why: `${what}: brewers need more jars`, fix: { label: 'More jars', action: { kind: 'jars' } } };
  if (staffOf(s, 'brewer').length < 2) return { why: `${what}: one brewer can't keep up`, fix: { label: 'Brew House', action: { kind: 'select', tile: firstOf(s, 'brewhouse')!.tile } } };
  return { why: what, fix: { label: 'Warehouse', action: { kind: 'build', building: 'warehouse', tile: suggestPlot(s, 'warehouse') } } };
}

/** Why a staff member is not working right now (null = busy), and what fixes it. */
export function idleReason(s: GameState, st: Staff, now = Date.now()): { why: string; fix: { label: string; action: Fix } } | null {
  switch (st.role) {
    case 'fisher':
      if (s.bucket.length >= bucketCap(s) && !level(s, 'tradepost')) {
        if (!has(s, 'brewhouse')) return { why: 'bucket full: nobody turns fish into sauce', fix: { label: 'Brew House', action: { kind: 'build', building: 'brewhouse', tile: suggestPlot(s, 'brewhouse') } } };
        return fullStore(s, 'bucket full');
      }
      return null;
    case 'salter':
      if (s.island.salt >= saltCap(s)) {
        if (!staffOf(s, 'brewer').length) return { why: 'salt store full: no brewer uses it', fix: has(s, 'brewhouse') ? { label: 'Hire brewer', action: { kind: 'select', tile: firstOf(s, 'brewhouse')!.tile } } : { label: 'Brew House', action: { kind: 'build', building: 'brewhouse', tile: suggestPlot(s, 'brewhouse') } } };
        return fullStore(s, 'salt store full');
      }
      return null;
    case 'brewer': {
      const free = s.jars.some((j) => !j.sealed);
      const ready = s.jars.some((j) => j.sealed && j.auto && agingLevel(s, j, now) >= 1);
      if (!free && !ready) {
        if (s.jars.some((j) => j.sealed && j.auto)) return null; // jars are ageing: that is work in progress
        return { why: 'all jars hold your own sauce', fix: { label: 'More jars', action: { kind: 'jars' } } };
      }
      if (free && s.island.salt < 1)
        return { why: 'no salt', fix: has(s, 'saltfield') ? { label: 'Hire salter', action: { kind: 'select', tile: firstOf(s, 'saltfield')!.tile } } : { label: 'Salt Field', action: { kind: 'build', building: 'saltfield', tile: suggestPlot(s, 'saltfield') } } };
      if (free && s.bucket.filter(canFerment).length < BALANCE.jarSlots && !ready)
        return { why: 'not enough fish', fix: has(s, 'dock') ? { label: 'Hire fisher', action: { kind: 'select', tile: firstOf(s, 'dock')!.tile } } : { label: 'Dock', action: { kind: 'build', building: 'dock', tile: suggestPlot(s, 'dock') } } };
      return null;
    }
    case 'seller':
      if (!s.shelf.some((p) => p.auto))
        return { why: 'no staff-made bottles to sell', fix: has(s, 'brewhouse') ? { label: 'Brewer', action: { kind: 'select', tile: firstOf(s, 'brewhouse')!.tile } } : { label: 'Brew House', action: { kind: 'build', building: 'brewhouse', tile: suggestPlot(s, 'brewhouse') } } };
      return null;
    case 'guide':
      return null;
  }
}

const perHour = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}/h`;

/** Every way the business can earn, with its status and the action that switches it on. */
export function incomeSources(s: GameState, now = Date.now()): Source[] {
  const l = ledger(s);
  const rate = (k: string) => l.src?.[k]?.rate ?? 0;
  const out: Source[] = [];
  const team = (role: Role) => staffOf(s, role);
  const anyIdle = (role: Role) => team(role).length > 0 && team(role).every((st) => idleReason(s, st, now));
  const firstIdle = (role: Role) => team(role).map((st) => idleReason(s, st, now)).find(Boolean) ?? null;
  const line = (id: string, name: string, building: BuildingId, role: Role, value: string, active: string): Source => {
    if (!team(role).length) {
      const su = setUp(s, building, role);
      return { id, name, value: '—', status: 'off', how: su.how, fix: su.fix };
    }
    const idle = anyIdle(role) ? firstIdle(role) : null;
    return { id, name, value, status: idle ? 'idle' : 'active', how: idle ? `Idle: ${idle.why}.` : active, fix: idle?.fix };
  };
  // the coin earners
  out.push(line('shop', 'Shop sales', 'shop', 'seller', perHour(rate('shop')), 'Shopkeepers sell staff-made bottles (brand raises the price).'));
  const tours = rate('tours') + rate('souvenirs');
  out.push(line('tours', 'Tourists', 'touroffice', 'guide', perHour(tours), `Groups of ${tourGroup(s, now)} · ticket ${ticketPrice(s, now)} · attraction ${attraction(s, now)}. Build more to see!`));
  if (has(s, 'tradepost')) {
    out.push({ id: 'trade', name: 'Traders buy spare fish', value: perHour(rate('trade')), status: rate('trade') > 0.5 ? 'active' : 'idle', how: 'When the bucket is full, traders buy what your fishers catch.' });
    const open = (s.island.contracts ?? []).filter((c) => !c.done).length;
    out.push({ id: 'contracts', name: 'Export orders', value: `${open} open`, status: open ? 'active' : 'idle', how: 'Big orders from the mainland pay well above the market price.', fix: { label: 'Orders ›', action: { kind: 'contracts' } } });
  } else {
    const su = setUp(s, 'tradepost', null);
    out.push({ id: 'contracts', name: 'Traders & export orders', value: '—', status: 'off', how: `${su.how} Traders buy spare fish; export orders pay big.`, fix: su.fix });
  }
  // the production chain that feeds the shop and the tourists
  const fishPerHour = team('fisher').reduce((a, st) => a + (3600 / fishSeconds(st.level)) * (terrain(st.tile) === 'c' ? 1.25 : 1), 0);
  out.push(line('fishing', 'Auto fishing', 'dock', 'fisher', `${Math.round(fishPerHour)} fish/h`, 'Fishers fill your bucket for the Brew House.'));
  const saltPerHour = team('salter').reduce((a, st) => a + (3600 / saltSeconds(st.level)) * (terrain(st.tile) === 's' ? 1.5 : 1), 0);
  out.push(line('salt', 'Salt making', 'saltfield', 'salter', `${Math.round(saltPerHour)} salt/h`, 'Salt Makers dry salt: brewers use 1 per jar.'));
  out.push(line('brew', 'Auto fish sauce', 'brewhouse', 'brewer', `${s.jars.length} jar${s.jars.length > 1 ? 's' : ''}`, `3 fish + 1 salt per jar; aged, opened and sold. More jars = more sauce at once.`));
  out.push({ id: 'you', name: 'You: fishing, selling, puzzles', value: 'any time', status: 'active', how: 'Your own trips, the market and puzzle rewards. Hand-made bottles sell at your stall.', fix: { label: 'Go fishing', action: { kind: 'fish' } } });
  return out;
}

export interface CostLine {
  name: string;
  perHour: number;
  note?: string;
}

/** Every running cost per hour, grouped by job and by building type. */
export function costLines(s: GameState, now = Date.now()): CostLine[] {
  const out: CostLine[] = [];
  for (const role of Object.keys(ROLE) as Role[]) {
    const team = staffOf(s, role);
    if (!team.length) continue;
    const idle = team.filter((st) => idleReason(s, st, now)).length;
    out.push({ name: `${ROLE[role].title}s ×${team.length} (wages)`, perHour: team.reduce((a, st) => a + wage(st), 0), note: idle ? `${idle} idle` : undefined });
  }
  const byType = new Map<BuildingId, number>();
  for (const b of s.island.buildings) byType.set(b.id, (byType.get(b.id) ?? 0) + b.level);
  for (const [id, lv] of byType) {
    const n = s.island.buildings.filter((b) => b.id === id).length;
    out.push({ name: `${BUILDINGS_BY_ID[id].name} ×${n} (upkeep)`, perHour: lv * UPKEEP[id] });
  }
  return out;
}

/** Concrete ways to spend less (or waste less), each with the action that does it. */
export function savingTips(s: GameState, now = Date.now()): { text: string; fix?: { label: string; action: Fix } }[] {
  const tips: { text: string; fix?: { label: string; action: Fix } }[] = [];
  if (s.island.unpaid) tips.push({ text: 'Wages are unpaid, so staff have stopped. Sell bottles to pay them.', fix: { label: 'Market ›', action: { kind: 'market' } } });
  for (const st of s.island.staff) {
    const r = idleReason(s, st, now);
    if (!r) continue;
    tips.push({ text: `${st.name} (${ROLE[st.role].title}) is idle: ${r.why}. Fix it, or let them go to save ${wage(st)}/h.`, fix: r.fix });
    if (tips.length >= 3) break;
  }
  const untrained = s.island.staff.find((st) => st.level < staffLevelCap(s, st.role));
  if (untrained) tips.push({ text: `Train ${untrained.name}: each level is +25% work for only +15% wage.`, fix: { label: 'Train ›', action: { kind: 'select', tile: untrained.tile } } });
  else if (s.island.staff.length) tips.push({ text: 'Solve puzzles to unlock higher staff levels: more work per coin of wage.', fix: { label: 'Puzzles ›', action: { kind: 'puzzles' } } });
  const salter = s.island.staff.find((st) => st.role === 'salter' && terrain(st.tile) !== 's');
  if (salter) tips.push({ text: 'A Salt Field on a Salt Flat makes 50% more salt for the same wage.' });
  const fisher = s.island.staff.find((st) => st.role === 'fisher' && terrain(st.tile) !== 'c');
  if (fisher) tips.push({ text: 'A Dock on a Fishing Cove fishes 25% faster for the same wage.' });
  if (wagesPerHour(s) + upkeepPerHour(s) > 0 && !has(s, 'shop') && !has(s, 'touroffice'))
    tips.push({ text: 'Nothing turns your staff work into coins yet: a Sauce Shop or Tour Office does.', fix: { label: 'Sauce Shop', action: { kind: 'build', building: 'shop', tile: suggestPlot(s, 'shop') } } });
  return tips.slice(0, 5);
}

// ---------- Export contracts ----------

const BUYERS = ['Sài Gòn restaurant', 'Hà Nội phở shop', 'Hội An café', 'Cần Thơ market', 'Đà Nẵng hotel', 'Huế royal kitchen', 'Seoul Vietnamese deli', 'Paris bistro', 'Tokyo noodle bar'];
const SLOT_MS = 2 * 3600 * 1000;

/** Orders change every 2 hours (decided by the time slot, so they are the same on every device). */
export function refreshContracts(s: GameState, now = Date.now()): Contract[] {
  const isl = s.island;
  if (!has(s, 'tradepost')) return [];
  const slot = Math.floor(now / SLOT_MS);
  if (isl.contractSlot === slot && isl.contracts) return isl.contracts;
  const rng = makeRng(slot * 31 + 7);
  const made = Object.keys(s.cellar);
  const grades = [15, 18, 22, 25, 30].filter((_, i) => i <= 1 + s.brand.level);
  isl.contracts = [0, 1, 2].map((i) => {
    const count = 2 + Math.floor(rng() * 3);
    const minDeg = grades[Math.floor(rng() * grades.length)];
    // some buyers want a recipe you have already brewed (always possible to fulfil)
    const recipe = made.length && rng() < 0.35 ? made[Math.floor(rng() * made.length)] : undefined;
    const pay = Math.round((count * saucePrice(minDeg + 2, 0) * brandMult(s) * (recipe ? 1.9 : 1.6)) / 5) * 5;
    return { id: slot * 10 + i, buyer: BUYERS[Math.floor(rng() * BUYERS.length)], count, minDeg, recipe, pay };
  });
  isl.contractSlot = slot;
  return isl.contracts;
}

/** Bottles on your shelf that fit an order, weakest first (so the best ones stay for the market). */
export function qualifying(s: GameState, c: Contract): Product[] {
  return s.shelf.filter((p) => p.degrees >= c.minDeg && (!c.recipe || p.recipe === c.recipe)).sort((a, b) => a.degrees - b.degrees);
}

export function deliverContract(s: GameState, id: number): number {
  const c = s.island.contracts?.find((x) => x.id === id);
  if (!c || c.done) return 0;
  const fit = qualifying(s, c);
  if (fit.length < c.count) return 0;
  const used = new Set(fit.slice(0, c.count).map((p) => p.uid));
  s.shelf = s.shelf.filter((p) => !used.has(p.uid));
  s.coins += c.pay;
  s.stats.earned += c.pay;
  s.stats.sold += c.count;
  s.brand.rep += c.count * 3;
  c.done = true;
  const l = ledger(s);
  l.income += c.pay;
  l.src ??= {};
  const e = (l.src.contracts ??= { total: 0, rate: 0 });
  e.total += c.pay;
  return c.pay;
}

/** Lifetime earnings by source, for the report's totals. */
export function earningsBySource(s: GameState): { name: string; total: number }[] {
  const src = ledger(s).src ?? {};
  const names: Record<string, string> = { shop: 'Shop sales', hand: 'Staff bottles you sold', tours: 'Tour tickets', souvenirs: 'Souvenir bottles', trade: 'Traders', contracts: 'Export orders' };
  return Object.entries(names).map(([k, name]) => ({ name, total: Math.round(src[k]?.total ?? 0) }));
}


// ---------- The production line: what staff make per hour, the bottleneck, and estimated income ----------

export interface LineStep {
  id: 'fish' | 'salt' | 'brew' | 'sell';
  /** Units per hour this step can deliver right now (0 when nobody does it). */
  perHour: number;
}

export interface LineEstimate {
  steps: LineStep[];
  /** Bottles per hour the staff line can produce, and sell. */
  bottlesPerHour: number;
  soldPerHour: number;
  /** Estimated °N and price of a staff-made bottle. */
  degrees: number;
  price: number;
  /** Estimated coins per hour from staff sales and tours (before wages). */
  coinsPerHour: number;
  toursPerHour: number;
  /** The slowest step (where to invest next), or null if the line isn't running at all. */
  bottleneck: LineStep['id'] | null;
}

/** Jars the staff can use: empty ones and their own (your own sealed jars are off-limits). */
export function staffJars(s: GameState): number {
  return s.jars.filter((j) => !j.sealed || j.auto).length;
}

/** Expected °N of a staff bottle: the sea's usual fish at the fishers' freshness, salt, aging, brewer. */
export function staffDegrees(s: GameState): number {
  const fishers = staffOf(s, 'fisher');
  const lvl = fishers.length ? Math.max(...fishers.map((f) => f.level)) : 1;
  const pool = speciesForSea(s.sea).filter((sp) => sp.sauce > 0 && sp.rarity < 5);
  const total = pool.reduce((a, sp) => a + spawnWeight(sp, Math.min(3, lvl - 1)), 0) || 1;
  const sauce = pool.reduce((a, sp) => a + sp.sauce * spawnWeight(sp, Math.min(3, lvl - 1)), 0) / total;
  const brewers = staffOf(s, 'brewer');
  const blvl = brewers.length ? Math.max(...brewers.map((b) => b.level)) : 1;
  const fresh = Math.min(0.85, 0.35 + 0.09 * lvl);
  const d = sauce * 1.05 + fresh * BALANCE.freshnessBonus + BALANCE.saltBonus[s.upgrades.salt] + BALANCE.agingBonus[blvl >= 3 ? 2 : 1] + (blvl - 1);
  return Math.round(d * 10) / 10;
}

export function lineEstimate(s: GameState, now = Date.now()): LineEstimate {
  const rateOf = (role: Role, base: (l: number) => number, bonus: (st: Staff) => number) =>
    isAuto(s, ROLE_STEP[role]) ? staffOf(s, role).reduce((a, st) => a + (3600 / base(st.level)) * bonus(st), 0) : 0;
  const fishPH = rateOf('fisher', fishSeconds, (st) => (terrain(st.tile) === 'c' ? 1.25 : 1));
  const saltPH = rateOf('salter', saltSeconds, (st) => (terrain(st.tile) === 's' ? 1.5 : 1));
  const brewers = isAuto(s, 'brew') ? staffOf(s, 'brewer') : [];
  const wait = brewers.some((b) => b.level >= 3) ? 2 : 1;
  // one jar: a brewer's turn to seal it, the aging, another turn to open it
  const cycle = 2 * brewSeconds + BALANCE.agingSecondsPerLevel * wait;
  const jarPH = brewers.length ? Math.min((staffJars(s) * 3600) / cycle, brewers.length * (3600 / brewSeconds / 2)) : 0;
  const steps: LineStep[] = [
    { id: 'fish', perHour: fishPH / BALANCE.jarSlots },
    { id: 'salt', perHour: saltPH },
    { id: 'brew', perHour: jarPH },
  ];
  const bottlesPerHour = brewers.length ? Math.min(...steps.map((x) => x.perHour)) : 0;
  const sellPH = rateOf('seller', sellSeconds, () => 1);
  const guides = isAuto(s, 'tours') ? staffOf(s, 'guide') : [];
  const toursPerHour = guides.reduce((a, g) => a + 3600 / tourSeconds(g.level), 0);
  const souvenirPH = toursPerHour * Math.floor(tourGroup(s, now) / 3);
  steps.push({ id: 'sell', perHour: sellPH + souvenirPH });
  const soldPerHour = Math.min(bottlesPerHour, sellPH + souvenirPH);
  const degrees = staffDegrees(s);
  const sellerLvl = Math.max(1, ...staffOf(s, 'seller').map((x) => x.level));
  const price = Math.round(saucePrice(degrees, s.upgrades.stall) * shopMult(s, sellerLvl, now));
  const tickets = toursPerHour * tourGroup(s, now) * ticketPrice(s, now);
  const coinsPerHour = Math.round(soldPerHour * price + tickets);
  const running = steps.filter((x) => x.perHour > 0);
  const bottleneck = brewers.length || fishPH || saltPH ? [...steps].sort((a, b) => a.perHour - b.perHour)[0].id : null;
  return { steps, bottlesPerHour, soldPerHour, degrees, price, coinsPerHour, toursPerHour, bottleneck: running.length ? bottleneck : null };
}
