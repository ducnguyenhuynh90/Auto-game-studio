// Your team: how many staff you may have, what each job does per hour, and why a hire isn't possible.
// You start by doing every step yourself; each hire hands one step to staff, who work even while the
// game is closed. The team grows with fame (Road stages) and brand, so automation is earned.
import { BRAND_STAGES } from './brand';
import { CAREER, career } from './career';
import { BUILDINGS, BUILDINGS_BY_ID, ROLE, STAFF_MAX_LEVEL, brewSeconds, buildingUpgradeCost, fishSeconds, hireCost, saltSeconds, sellSeconds, slots, tourSeconds, type BuildingId, type Role } from './island';
import type { GameState } from './state';

/** You start with room for 2 staff; every Road stage adds 2, every brand stage 1. */
export function teamCap(s: GameState): number {
  return 2 + 2 * career(s).stage + (s.brand?.level ?? 0);
}

export function teamSize(s: GameState): number {
  return s.island.staff.length;
}

/** What raises the team limit next, for the "how do I get more staff?" line. */
export function nextTeamGrowth(s: GameState): string {
  const st = CAREER[career(s).stage];
  const br = BRAND_STAGES[(s.brand?.level ?? 0) + 1];
  const parts: string[] = [];
  if (st) parts.push(`+2 when you become “${st.title}”`);
  if (br) parts.push(`+1 for the “${br.name}” brand`);
  return parts.length ? parts.join(' · ') : 'Your team is as big as it gets.';
}

export const JOBS: Role[] = ['fisher', 'salter', 'brewer', 'seller', 'guide'];

/** The building each job works at. */
export function workplace(role: Role): BuildingId {
  return BUILDINGS.find((b) => b.role === role)!.id;
}

/** One worker's output per hour at a level, in plain words. */
export function jobRate(role: Role, lvl: number): string {
  const perH = (sec: number) => Math.round(3600 / sec);
  switch (role) {
    case 'fisher':
      return `${perH(fishSeconds(lvl))} fish/h`;
    case 'salter':
      return `${perH(saltSeconds(lvl))} salt/h`;
    case 'brewer':
      return `fills a jar every ${Math.round(brewSeconds)}s when 3 fish + 1 salt are ready`;
    case 'seller':
      return `${perH(sellSeconds(lvl))} bottles sold/h`;
    case 'guide':
      return `${perH(tourSeconds(lvl))} tour groups/h`;
  }
}

/** What the job is, in one line, for players who have never hired anyone. */
export const JOB_PITCH: Record<Role, string> = {
  fisher: 'Catches fish for your bucket, so you don’t have to go out every time.',
  salter: 'Rakes sea salt. Brewers need 1 salt for every jar.',
  brewer: 'Fills, seals and opens jars with bucket fish + salt. Leaves your own jars alone.',
  seller: 'Sells the bottles your Brewers made, at your shop’s price (brand raises it).',
  guide: 'Brings tourists: tickets, souvenir bottles and reputation.',
};

/** What training adds, from level 1 up. */
export function trainingGain(role: Role): string {
  switch (role) {
    case 'fisher':
      return 'Each level: +25% speed and rarer fish';
    case 'salter':
      return 'Each level: +25% speed';
    case 'brewer':
      return 'Each level: +1°N per jar, and waits for longer aging (stronger sauce)';
    case 'seller':
      return 'Each level: +25% speed and +5% price';
    case 'guide':
      return 'Each level: +25% more tours';
  }
}

/** Why you can't hire this job right now (null = you can), as a message core/help.ts explains. */
export function hireProblem(s: GameState, role: Role): string | null {
  const place = workplace(role);
  const def = BUILDINGS_BY_ID[place];
  const sites = s.island.buildings.filter((b) => b.id === place);
  if (!sites.length) return `Build a ${def.name} first`;
  if (teamSize(s) >= teamCap(s)) return `Team full (${teamSize(s)}/${teamCap(s)})`;
  const open = sites.find((b) => s.island.staff.filter((x) => x.tile === b.tile).length < slots(b));
  if (!open) {
    const up = sites.map((b) => buildingUpgradeCost(b)).find((c) => c !== null);
    return up ? `Every place at your ${def.name} is taken: upgrade it (${up} coins) for one more` : `Every place at your ${def.name} is taken: build another`;
  }
  const cost = hireCost(s, role);
  if (s.coins < cost) return `Needs ${cost} coins`;
  return null;
}

/** The building tile a new hire of this job would join (the first with a free place). */
export function hireSite(s: GameState, role: Role): number | null {
  const place = workplace(role);
  const b = s.island.buildings.find((x) => x.id === place && s.island.staff.filter((st) => st.tile === x.tile).length < slots(x));
  return b ? b.tile : null;
}

export { ROLE, STAFF_MAX_LEVEL };
