// A single always-visible "next goal" chain. It is the tutorial for the first ~10 minutes and the
// long-term direction after that. Each goal is checked against state, so it never desyncs.
import { SEAS, SEAS_BY_ID, seaComplete, seaLock, type Mission, type Sea } from './seas';
import type { GameState } from './state';

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
  { id: 'seal1', text: 'Fill a jar with 3 fish', reward: 0, done: (s) => s.jars.some((j) => j.sealed) || s.stats.jarsOpened > 0 },
  { id: 'trip2', text: 'Go fishing while it ferments', reward: 5, done: (s) => s.stats.jarsOpened > 0 || s.jars.some((j) => j.sealed && s.stats.fullTrips > j.sealedTrip) },
  { id: 'open1', text: 'Open your jar!', reward: 0, done: (s) => s.stats.jarsOpened >= 1 },
  { id: 'sell1', text: 'Sell your fish sauce', reward: 0, done: (s) => s.stats.sold >= 1 },
  { id: 'jar2', text: 'Buy a second jar', reward: 10, done: (s) => s.upgrades.jars >= 1 },
  { id: 'gear1', text: 'Upgrade your fishing gear', reward: 10, done: (s) => s.upgrades.rod + s.upgrades.line + s.upgrades.hook + s.upgrades.bait >= 1 },
];

export interface GoalView {
  id: string;
  text: string;
  progress?: [number, number];
  reward: number;
  /** Chapter label: 'Tutorial' or the sea's name. */
  chapter: string;
}

function tutorialView(s: GameState, g: Goal): GoalView {
  return { id: g.id, text: g.text, progress: g.progress?.(s), reward: g.reward, chapter: 'Tutorial' };
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

/** The goal shown on the banner, and the one after it, so players always know what's next. */
export function goalPair(s: GameState): { current: GoalView | null; next: GoalView | null } {
  const tut = GOALS.filter((g) => !s.goalsDone.includes(g.id));
  const sea = SEAS_BY_ID[s.sea];
  const seaQueue: GoalView[] = sea.missions.filter((m) => !s.missionsDone.includes(m.id)).map((m) => missionView(s, sea, m));
  const after = seaQueue.length ? null : voyageView(s, sea);
  const queue: GoalView[] = [...tut.map((g) => tutorialView(s, g)), ...seaQueue];
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
