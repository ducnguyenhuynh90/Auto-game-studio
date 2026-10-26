// The Road to the World's Best Fish Sauce: the long-term goal after the tutorial.
// Seven stages, each with a theme (build your village, your brand, your quality, your fame) and four
// goals. Finishing a stage makes you more famous: a new title, a reward, and new things to build
// (tourists only come once people know your name). Goals are read from game state, so they never
// desync; a goal stays done once reached (income can dip later without taking it back).
import { islandLevel, type BuildingId } from './island';
import { SEAS_BY_ID } from './seas';
import type { GameState } from './state';

export interface CareerGoal {
  id: string;
  text: string;
  progress: (s: GameState) => [number, number];
  /** Where the goal is done, so the banner can send the player there. */
  where: 'island' | 'brand' | 'fishing' | 'brew' | 'market' | 'puzzles' | 'map' | 'awards';
}

export interface CareerStage {
  title: string;
  local: string;
  theme: string;
  /** One line that makes the stage feel worth it. */
  pitch: string;
  goals: CareerGoal[];
  reward: { coins: number; freeHire?: boolean };
  /** Buildings this stage unlocks, with the reason (shown on the stage-up card). */
  unlocks: { building: BuildingId; why: string }[];
}

export interface CareerState {
  /** Stages finished (the active stage is CAREER[stage]). */
  stage: number;
  /** Goals reached at least once. */
  done: string[];
  /** Legendary bottles entered in the World Fish Sauce Awards (final stage). */
  entries?: number;
  /** °N of each entry, for the trophy card. */
  entryDegrees?: number[];
}

export function newCareer(): CareerState {
  return { stage: 0, done: [] };
}

const cap = (v: number, t: number): [number, number] => [Math.min(Math.max(0, Math.floor(v)), t), t];
const has = (s: GameState, id: BuildingId) => (s.island.buildings.some((b) => b.id === id) ? 1 : 0);
const staffCount = (s: GameState, role: string) => s.island.staff.filter((x) => x.role === role).length;
const bestDeg = (s: GameState) => Math.max(0, ...Object.values(s.cellar));
const income = (s: GameState) => s.island.ledger?.incomeRate ?? 0;
const plotsBought = (s: GameState) => s.island.owned.length - 9;

export const CAREER: CareerStage[] = [
  {
    title: 'Village Mắm Maker',
    local: 'Người làm mắm',
    theme: 'Build your village',
    pitch: 'One jar is a hobby. A brew house is a business.',
    reward: { coins: 150 },
    unlocks: [
      { building: 'shop', why: 'a shop of your own, so staff bottles sell themselves' },
      { building: 'warehouse', why: 'room for more fish and salt' },
    ],
    goals: [
      { id: 'c1_brew', text: 'Build a Brew House', where: 'island', progress: (s) => cap(has(s, 'brewhouse'), 1) },
      { id: 'c1_brewer', text: 'Hire your first Brewer', where: 'island', progress: (s) => cap(staffCount(s, 'brewer'), 1) },
      { id: 'c1_salt', text: 'Build a Salt Field', where: 'island', progress: (s) => cap(has(s, 'saltfield'), 1) },
      // jars, not bottles: made.bottles counts staff *sales*, which need the shop this stage unlocks
      { id: 'c1_jars', text: 'Your Brewers seal 3 jars', where: 'brew', progress: (s) => cap(s.island.made.jars, 3) },
    ],
  },
  {
    title: 'A Name on the Bottle',
    local: 'Có thương hiệu',
    theme: 'Build your brand',
    pitch: 'People buy a name they trust. Give them one.',
    reward: { coins: 300 },
    unlocks: [],
    goals: [
      { id: 'c2_seller', text: 'Hire a Shopkeeper', where: 'island', progress: (s) => cap(staffCount(s, 'seller'), 1) },
      { id: 'c2_label', text: 'Get a Hand-drawn Label', where: 'brand', progress: (s) => cap(s.brand.level, 1) },
      { id: 'c2_rep', text: 'Earn 50 reputation', where: 'market', progress: (s) => cap(s.brand.rep, 50) },
      { id: 'c2_fine', text: 'Brew a Fine sauce (22°N+)', where: 'brew', progress: (s) => cap(bestDeg(s) >= 22 ? 1 : 0, 1) },
    ],
  },
  {
    title: 'Famous on Phú Quốc',
    local: 'Nổi tiếng Phú Quốc',
    theme: 'Become famous',
    pitch: 'When the island knows your name, the tourists follow.',
    reward: { coins: 500, freeHire: true },
    unlocks: [
      { building: 'touroffice', why: 'people know your name now: tourists want to see how your mắm is made' },
      { building: 'shrine', why: 'visitors stop to pray, then shop' },
    ],
    goals: [
      { id: 'c3_brand', text: 'Put Bà Năm’s name on the label', where: 'brand', progress: (s) => cap(s.brand.level, 2) },
      { id: 'c3_income', text: 'Staff earn 200 coins an hour', where: 'island', progress: (s) => cap(income(s), 200) },
      { id: 'c3_land', text: 'Buy 3 more plots of land', where: 'island', progress: (s) => cap(plotsBought(s), 3) },
      { id: 'c3_story', text: 'Finish the Phú Quốc story', where: 'fishing', progress: (s) => cap(SEAS_BY_ID.lagoon.missions.filter((m) => s.missionsDone.includes(m.id)).length, SEAS_BY_ID.lagoon.missions.length) },
    ],
  },
  {
    title: 'Master Brewer',
    local: 'Nghệ nhân mắm',
    theme: 'Perfect your quality',
    pitch: 'Fame opens the door. Quality keeps it open.',
    reward: { coins: 1000 },
    unlocks: [{ building: 'tradepost', why: 'buyers from the mainland want sauce this good' }],
    goals: [
      { id: 'c4_premium', text: 'Brew a Premium sauce (30°N+)', where: 'brew', progress: (s) => cap(bestDeg(s) >= 30 ? 1 : 0, 1) },
      { id: 'c4_aged', text: 'Open your own jar aged ★★★', where: 'brew', progress: (s) => cap(s.stats.bestAging ?? 0, 3) },
      { id: 'c4_train', text: 'Train a Brewer to Lv 5', where: 'island', progress: (s) => cap(Math.max(0, ...s.island.staff.filter((x) => x.role === 'brewer').map((x) => x.level)), 5) },
      { id: 'c4_salt', text: 'Clear Salt Field puzzle 8', where: 'puzzles', progress: (s) => cap(s.puzzles.salt.length, 8) },
    ],
  },
  {
    title: 'Phú Quốc Origin',
    local: 'Chỉ dẫn địa lý',
    theme: 'Trade beyond the island',
    pitch: 'The island’s protected name, on your bottle, on the mainland.',
    reward: { coins: 2500 },
    unlocks: [],
    goals: [
      { id: 'c5_seal', text: 'Earn the Phú Quốc Origin Seal', where: 'brand', progress: (s) => cap(s.brand.level, 4) },
      { id: 'c5_export', text: 'Deliver 2 export orders', where: 'island', progress: (s) => cap(s.stats.exports ?? 0, 2) },
      { id: 'c5_income', text: 'Staff earn 600 coins an hour', where: 'island', progress: (s) => cap(income(s), 600) },
      { id: 'c5_halong', text: 'Sail to Hạ Long Bay', where: 'map', progress: (s) => cap(s.seaStats.bay?.catches ? 1 : 0, 1) },
    ],
  },
  {
    title: 'Famous Across Vietnam',
    local: 'Nổi tiếng cả nước',
    theme: 'The whole country',
    pitch: 'From Hà Nội to Sài Gòn, kitchens ask for your mắm.',
    reward: { coins: 6000 },
    unlocks: [],
    goals: [
      { id: 'c6_brand', text: 'Be Famous Across Vietnam (brand)', where: 'brand', progress: (s) => cap(s.brand.level, 5) },
      { id: 'c6_legend', text: 'Brew a Legendary sauce (40°N+)', where: 'brew', progress: (s) => cap(bestDeg(s) >= 40 ? 1 : 0, 1) },
      { id: 'c6_island', text: 'Grow the island to level 8', where: 'island', progress: (s) => cap(islandLevel(s), 8) },
      { id: 'c6_carp', text: 'Catch the Dragon Carp of Hạ Long', where: 'fishing', progress: (s) => cap(s.dex.carp?.count ?? 0, 1) },
    ],
  },
  {
    title: 'World’s Best Fish Sauce',
    local: 'Nước mắm ngon nhất thế giới',
    theme: 'The world stage',
    pitch: 'The World Fish Sauce Awards taste three Legendary bottles. Send your best.',
    reward: { coins: 15000 },
    unlocks: [],
    goals: [
      { id: 'c7_awards', text: 'Enter 3 Legendary bottles in the Awards', where: 'awards', progress: (s) => cap(career(s).entries ?? 0, AWARD_ENTRIES) },
      { id: 'c7_oarfish', text: 'Catch the Oarfish of the Abyss', where: 'fishing', progress: (s) => cap(s.dex.oarfish?.count ?? 0, 1) },
      { id: 'c7_income', text: 'Staff earn 1,200 coins an hour', where: 'island', progress: (s) => cap(income(s), 1200) },
      { id: 'c7_rep', text: 'Reach 4,000 reputation', where: 'market', progress: (s) => cap(s.brand.rep, 4000) },
    ],
  },
];

/** Before the first stage is finished. */
export const STARTING_TITLE = 'Little Fisher';

export function career(s: GameState): CareerState {
  return (s.career ??= newCareer());
}

/** The title the player has earned (the last finished stage). */
export function careerTitle(s: GameState): string {
  const st = career(s).stage;
  return st === 0 ? STARTING_TITLE : CAREER[st - 1].title;
}

export function activeStage(s: GameState): CareerStage | null {
  return CAREER[career(s).stage] ?? null;
}

export function goalDone(s: GameState, g: CareerGoal): boolean {
  if (career(s).done.includes(g.id)) return true;
  const [c, t] = g.progress(s);
  return c >= t;
}

/** The first unfinished goal of the active stage (what the banner shows). */
export function nextCareerGoal(s: GameState): CareerGoal | null {
  return activeStage(s)?.goals.find((g) => !goalDone(s, g)) ?? null;
}

/** Which stage first allows a building (0 = from the start). */
export function stageFor(id: BuildingId): number {
  const i = CAREER.findIndex((st) => st.unlocks.some((u) => u.building === id));
  return i < 0 ? 0 : i + 1;
}

/** Null if this building may be built at the player's fame; else the reason. */
export function careerLock(s: GameState, id: BuildingId): string | null {
  const need = stageFor(id);
  if (career(s).stage >= need) return null;
  return `Unlocks when you are “${CAREER[need - 1].title}”`;
}

export interface StageUp {
  index: number;
  stage: CareerStage;
}

/**
 * Records goals reached and finishes stages whose goals are all done (paying their rewards).
 * Returns the stages finished now, in order (one call can finish several on an old save).
 */
export function checkCareer(s: GameState): StageUp[] {
  const c = career(s);
  for (const st of CAREER)
    for (const g of st.goals) if (!c.done.includes(g.id) && goalDone(s, g)) c.done.push(g.id);
  const ups: StageUp[] = [];
  while (c.stage < CAREER.length && CAREER[c.stage].goals.every((g) => c.done.includes(g.id))) {
    const stage = CAREER[c.stage];
    s.coins += stage.reward.coins;
    if (stage.reward.freeHire) s.island.freeHires += 1;
    ups.push({ index: c.stage, stage });
    c.stage++;
  }
  return ups;
}

/** True once the final title is won. */
export function worldChampion(s: GameState): boolean {
  return career(s).stage >= CAREER.length;
}

// ---------- The World Fish Sauce Awards (final stage) ----------
export const AWARD_ENTRIES = 3;
export const AWARD_MIN_DEGREES = 40;

/** Your best bottle that may be entered (one you kept, Legendary). */
export function awardCandidate(s: GameState) {
  return s.shelf.filter((p) => !p.auto && p.degrees >= AWARD_MIN_DEGREES).sort((a, b) => b.degrees - a.degrees)[0] ?? null;
}

/** Sends your best Legendary bottle to the judges. The bottle leaves your shelf. */
export function enterAwards(s: GameState): number | null {
  const c = career(s);
  if (CAREER[c.stage]?.goals.every((g) => g.id !== 'c7_awards') || (c.entries ?? 0) >= AWARD_ENTRIES) return null;
  const p = awardCandidate(s);
  if (!p) return null;
  s.shelf = s.shelf.filter((x) => x.uid !== p.uid);
  c.entries = (c.entries ?? 0) + 1;
  (c.entryDegrees ??= []).push(p.degrees);
  return p.degrees;
}
