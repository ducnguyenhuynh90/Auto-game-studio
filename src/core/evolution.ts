// Evolution roadmaps: every upgrade line (and the village itself) as a path of named stages,
// each with a short, honest stat line computed from the real balance numbers.
import { BALANCE, UPGRADES_BY_ID, type UpgradeId } from './data';
import { SEAS } from './seas';
import { villageLevel, type GameState } from './state';

export type Track = UpgradeId | 'village';

export interface Stage {
  name: string;
  /** What this stage does, in numbers the player can compare. */
  stat: string;
  desc: string;
  /** Coins to reach this stage from the previous one (0 for the first). */
  cost: number;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function stageStat(id: UpgradeId, level: number): string {
  switch (id) {
    case 'rod':
      return `Green zone ${pct(BALANCE.rodZone[level])}`;
    case 'line':
      return `Reach ${Math.round(BALANCE.lineReach[level] * 60)} m`;
    case 'hook':
      return `Bite ${BALANCE.hookBite[level]}s · holds ${BALANCE.hookSnap[level]}s`;
    case 'bait':
      return level === 0 ? 'Rare fish ×1' : `Rare fish ×${BALANCE.baitRare[level]}`;
    case 'boat': {
      const seas = SEAS.filter((s) => s.boat <= level).map((s) => s.name);
      return `Seas: ${seas.length}`;
    }
    case 'jars':
      return `${level + 1} jar${level ? 's' : ''}`;
    case 'salt':
      return `+${BALANCE.saltBonus[level]}°N per batch`;
    case 'stall':
      return `Sauce price ×${BALANCE.stallMult[level]}`;
  }
}

/** The village grows through four named stages as its buildings are upgraded. */
export const VILLAGE_STAGES: { name: string; local: string; minLevel: number; desc: string }[] = [
  { name: 'Fishing Hamlet', local: 'Xóm chài', minLevel: 1, desc: 'A hut, one jar, one stubborn girl.' },
  { name: 'Mắm Village', local: 'Làng mắm', minLevel: 4, desc: 'Lanterns, a market stall, jars in rows.' },
  { name: 'Busy Harbour', local: 'Bến cảng', minLevel: 7, desc: 'A real house, a salt store, boats at the dock.' },
  { name: 'Pearl of Phú Quốc', local: 'Ngọc Phú Quốc', minLevel: 10, desc: 'Famous across Vietnam. Bà Năm is proud.' },
];

export function villageStage(s: GameState): number {
  const lvl = villageLevel(s);
  let i = 0;
  VILLAGE_STAGES.forEach((st, k) => {
    if (lvl >= st.minLevel) i = k;
  });
  return i;
}

export function stages(track: Track): Stage[] {
  if (track === 'village') return VILLAGE_STAGES.map((v) => ({ name: v.name, stat: `Village Lv ${v.minLevel}+`, desc: v.desc, cost: 0 }));
  return UPGRADES_BY_ID[track].levels.map((l, i) => ({ name: l.name, stat: stageStat(track, i), desc: l.desc, cost: l.cost }));
}

export function currentStage(s: GameState, track: Track): number {
  return track === 'village' ? villageStage(s) : s.upgrades[track];
}

export const TRACK_TITLE: Record<Track, string> = {
  rod: 'Rod',
  line: 'Line',
  hook: 'Hook',
  bait: 'Bait',
  boat: 'Ship',
  jars: 'Jar Yard',
  salt: 'Salt House',
  stall: 'Market Stall',
  village: 'Village',
};
