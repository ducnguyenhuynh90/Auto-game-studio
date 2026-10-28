// A single always-visible "next goal" chain. It is the tutorial for the first ~10 minutes and the
// long-term direction after that. Each goal is checked against state, so it never desyncs.
import { CAREER, activeStage, career, goalDone, type CareerGoal } from './career';
import { SEAS, SEAS_BY_ID, seaComplete, seaLock, type Mission, type Sea } from './seas';
import { BALANCE, type UpgradeId } from './data';
import { agingLevel, canFerment, upgradeCost, type GameState } from './state';

export interface Goal {
  id: string;
  text: string;
  reward: number;
  done: (s: GameState) => boolean;
  progress?: (s: GameState) => [number, number];
}

/** The tutorial chapter. After it, sea missions take over as the player's goals. */
export const GOALS: Goal[] = [
  { id: 'catch3', text: 'Catch 3 fish', reward: 5, done: (s) => s.stats.catches >= 3, progress: (s) => [Math.min(3, s.stats.catches), 3] },
  { id: 'seal1', text: 'Fill a jar with 3 fish', reward: 0, done: (s) => s.jars.some((j) => j.sealed) || s.stats.jarsOpened > 0, progress: (s) => [Math.min(3, s.bucket.filter((f) => f.species !== 'crab').length), 3] },
  { id: 'trip2', text: 'Go fishing while it ferments', reward: 5, done: (s) => s.stats.jarsOpened > 0 || s.jars.some((j) => j.sealed && s.stats.fullTrips > j.sealedTrip) },
  { id: 'open1', text: 'Open your jar!', reward: 0, done: (s) => s.stats.jarsOpened >= 1 },
  { id: 'sell1', text: 'Sell your fish sauce', reward: 0, done: (s) => s.stats.sold >= 1 },
  // Mực, the Phú Quốc dog, arrives after the first sale (core/dog.ts)
  { id: 'dog_feed', text: 'Feed Mực 3 fish', reward: 5, done: (s) => s.dog.fed >= 3, progress: (s) => [Math.min(3, s.dog.fed), 3] },
  { id: 'jar2', text: 'Buy a second jar', reward: 10, done: (s) => s.upgrades.jars >= 1 },
  { id: 'dog_home', text: 'Build Mực a dog house', reward: 10, done: (s) => s.dog.house },
  { id: 'chain2', text: 'Chain 2 fish: big eats small', reward: 10, done: (s) => (s.stats.bestChain ?? 0) >= 2, progress: (s) => [Math.min(2, Math.max(s.stats.bestChain ?? 0, 0)), 2] },
  { id: 'dog_boat', text: 'Take Mực fishing: catch 3 fish', reward: 15, done: (s) => s.dog.catches >= 3, progress: (s) => [Math.min(3, s.dog.catches), 3] },
  { id: 'gear1', text: 'Upgrade your fishing gear', reward: 10, done: (s) => s.upgrades.rod + s.upgrades.line + s.upgrades.hook + s.upgrades.bait >= 1 },
];

/** Past-tense verb for a goal's progress counter: "Catch 3 fish" → "Caught 2/3". */
const VERBS: Record<string, string> = {
  catch: 'Caught',
  feed: 'Fed',
  take: 'Caught',
  chain: 'Chained',
  land: 'Landed',
  brew: 'Brewed',
  haul: 'Hauled',
  fill: 'Fish ready',
  buy: 'Bought',
  sell: 'Sold',
  open: 'Opened',
  upgrade: 'Upgraded',
  go: 'Trips',
};

/** "Caught 2/3" style label for a goal or mission with progress. */
export function progressLabel(g: { text: string; progress?: [number, number] }): string {
  const [c, t] = g.progress ?? [0, 1];
  const verb = VERBS[g.text.split(' ')[0].toLowerCase()] ?? 'Done';
  return `${verb} ${c}/${t}`;
}

export interface GoalView {
  id: string;
  text: string;
  progress?: [number, number];
  reward: number;
  /** Chapter label: 'Tutorial', 'Stage 3 · Famous on Phú Quốc' or the sea's name. */
  chapter: string;
  /** A Road to the World's Best goal (core/career.ts). */
  career?: CareerGoal;
}

function tutorialView(s: GameState, g: Goal): GoalView {
  // one-step goals still show a counter (0/1) so every goal reads the same way
  return { id: g.id, text: g.text, progress: g.progress?.(s) ?? [g.done(s) ? 1 : 0, 1], reward: g.reward, chapter: 'Tutorial' };
}

function missionView(s: GameState, sea: Sea, m: Mission): GoalView {
  return { id: m.id, text: m.text, progress: m.progress(s), reward: m.reward.coins, chapter: sea.name };
}

/** Where the story should go once a sea is finished. */
function voyageView(s: GameState, from: Sea): GoalView | null {
  const next = SEAS.find((x) => !seaComplete(s, x));
  if (!next) return null;
  const lock = seaLock(s, next);
  const text = lock ? `${lock.replace('Needs', 'Get')} to reach ${next.name}` : `Sail to ${next.name} on the Sea Chart`;
  return { id: `voyage_${next.id}`, text, reward: 0, chapter: from.name };
}

function careerView(s: GameState, g: CareerGoal): GoalView {
  const i = career(s).stage;
  return { id: g.id, text: g.text, progress: g.progress(s), reward: 0, chapter: `Stage ${i + 1}/${CAREER.length} · ${CAREER[i].title}`, career: g };
}

/** The goal shown on the banner, and the one after it, so players always know what's next. */
export function goalPair(s: GameState): { current: GoalView | null; next: GoalView | null } {
  const tut = GOALS.filter((g) => !s.goalsDone.includes(g.id));
  // after the tutorial, the Road to the World's Best leads; the sea story follows behind it
  const stage = tut.length ? null : activeStage(s);
  const road = stage ? stage.goals.filter((g) => !goalDone(s, g)).map((g) => careerView(s, g)) : [];
  const sea = SEAS_BY_ID[s.sea];
  const seaQueue: GoalView[] = sea.missions.filter((m) => !s.missionsDone.includes(m.id)).map((m) => missionView(s, sea, m));
  const after = seaQueue.length ? null : voyageView(s, sea);
  const queue: GoalView[] = [...tut.map((g) => tutorialView(s, g)), ...road, ...seaQueue];
  if (after) {
    queue.push(after);
    // preview the first mission waiting at the destination
    const dest = SEAS.find((x) => !seaComplete(s, x));
    const first = dest?.missions.find((m) => !s.missionsDone.includes(m.id));
    if (dest && first) queue.push(missionView(s, dest, first));
  }
  return { current: queue[0] ?? null, next: queue[1] ?? null };
}

export function currentGoal(s: GameState): Goal | null {
  return GOALS.find((g) => !s.goalsDone.includes(g.id)) ?? null;
}

/** Marks every satisfied goal done (in order) and returns the ones newly completed. */
export function checkGoals(s: GameState): Goal[] {
  const completed: Goal[] = [];
  for (const g of GOALS) {
    if (s.goalsDone.includes(g.id)) continue;
    if (!g.done(s)) break; // goals are sequential: only the current one can complete
    s.goalsDone.push(g.id);
    s.coins += g.reward;
    completed.push(g);
  }
  return completed;
}

// ---------- Where a goal is done ----------

/** The upgrade a goal asks for (highlighted in the market), if any. */
export function goalUpgrade(s: GameState, g: GoalView): UpgradeId | null {
  if (g.id === 'jar2') return 'jars';
  if (g.id === 'l_mackerel' && s.upgrades.line === 0) return 'line';
  if (g.id.startsWith('voyage_') && /boat/i.test(g.text)) return 'boat';
  if (g.id === 'gear1') {
    const gear: UpgradeId[] = ['line', 'rod', 'hook', 'bait'];
    return gear.sort((a, b) => (upgradeCost(s, a) ?? 1e9) - (upgradeCost(s, b) ?? 1e9))[0];
  }
  return null;
}

export type GoalPlace = 'fish' | 'fill' | 'open' | 'sell' | 'shop' | 'dog' | 'map' | 'career' | 'missions';

/** Where tapping the goal takes the player: the screen where they can do it now. */
export interface GoalTarget {
  to: GoalPlace;
  /** Shop: the upgrade to buy (its tab opens and it is highlighted). */
  upgrade?: UpgradeId;
  /** A short note when the goal can't be done yet and this is the step that gets there. */
  why?: string;
  /** What to do about it (the toast's second line). */
  hint?: string;
}

const fermentable = (s: GameState) => s.bucket.filter(canFerment).length;

/**
 * The screen where the current goal can be done. If it can't be done yet (not enough coins or fish),
 * this is the step that gets the player there, with a note saying why.
 */
export function goalTarget(s: GameState, g: GoalView, now = Date.now()): GoalTarget {
  if (g.career) return { to: 'career' };
  const up = goalUpgrade(s, g);
  if (up) {
    const cost = upgradeCost(s, up);
    if (cost !== null && s.coins >= cost) return { to: 'shop', upgrade: up };
    if (cost !== null) {
      const short = cost - s.coins;
      // bottles on the shelf are the quickest coins; otherwise go fishing
      return s.shelf.length ? { to: 'sell', why: `Need ${short} more coins`, hint: 'Sell your fish sauce' } : { to: 'fish', why: `Need ${short} more coins`, hint: 'Catch fish, brew, sell' };
    }
  }
  if (g.id.startsWith('voyage_')) return { to: 'map' };
  switch (g.id) {
    case 'seal1':
      return fermentable(s) >= BALANCE.jarSlots ? { to: 'fill' } : { to: 'fish', why: `Need ${BALANCE.jarSlots} fish for a jar` };
    case 'open1':
      return s.jars.some((j) => j.sealed && agingLevel(s, j, now) >= 1) ? { to: 'open' } : { to: 'fish', why: 'The jar ages while you fish' };
    case 'trip2':
      return { to: 'fish' };
    case 'sell1':
      return s.shelf.length ? { to: 'sell' } : { to: 'open' };
    case 'dog_feed':
    case 'dog_home':
      return { to: 'dog' };
  }
  // sea missions: brewing ones happen at the jars, the rest at sea
  if (/^brew/i.test(g.text)) {
    if (s.jars.some((j) => j.sealed && agingLevel(s, j, now) >= 1)) return { to: 'open' };
    return fermentable(s) >= BALANCE.jarSlots && s.jars.some((j) => !j.sealed) ? { to: 'fill' } : { to: 'fish', why: 'Catch the fish for this sauce first' };
  }
  // a mission of a sea you are not in: sail there first
  const sea = SEAS.find((x) => x.missions.some((m) => m.id === g.id));
  if (sea && sea.id !== s.sea) return { to: 'map', why: `This one is in ${sea.name}` };
  return { to: 'fish' };
}
