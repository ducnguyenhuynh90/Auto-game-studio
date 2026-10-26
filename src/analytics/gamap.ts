// Turns the game's own analytics events (core/analytics.ts, docs/ANALYTICS.md) into Google Analytics 4
// events. Pure functions, unit-tested: every event is forwarded under its own name, funnel steps also
// become their own events (for GA funnel explorations), and a few map onto GA's recommended game events.
import type { AnalyticsEvent } from '../core/analytics';
import { career, careerTitle } from '../core/career';
import { islandLevel } from '../core/island';
import { levelForXp } from '../core/progression';
import type { GameState } from '../core/state';

export type GaParams = Record<string, string | number | boolean>;
export interface GaHit {
  name: string;
  params: GaParams;
}

/** GA4 limits: names [a-zA-Z0-9_] ≤ 40 chars, not starting with a reserved prefix; ≤ 25 params; text ≤ 100. */
export function gaName(raw: string): string {
  let n = raw.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, '');
  if (/^(ga_|google_|firebase_)/.test(n)) n = `mam_${n}`;
  return (n || 'event').slice(0, 40);
}

export function gaParams(p: AnalyticsEvent['p'] = {}): GaParams {
  const out: GaParams = {};
  for (const [k, v] of Object.entries(p).slice(0, 24)) {
    const key = gaName(k);
    out[key] = typeof v === 'string' ? v.slice(0, 100) : v;
  }
  return out;
}

/** The GA hits for one game event (always the event itself; sometimes a recommended GA event too). */
export function toGa(ev: AnalyticsEvent): GaHit[] {
  const p = ev.p ?? {};
  const hits: GaHit[] = [{ name: gaName(ev.e), params: gaParams(p) }];
  const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : Number(p[k] ?? 0) || 0);
  switch (ev.e) {
    case 'funnel':
      // each step as its own event, so GA's funnel exploration can use them directly
      hits.push({ name: gaName(String(p.step)), params: gaParams({ ...p, funnel_step: String(p.step) }) });
      break;
    case 'screen':
      hits.push({ name: 'page_view', params: { page_title: String(p.name), screen_name: String(p.name) } });
      break;
    case 'level_up':
      hits.push({ name: 'level_up', params: { level: num('level'), character: 'captain' } });
      break;
    case 'career_stage':
      hits.push({ name: 'unlock_achievement', params: { achievement_id: `stage_${num('stage')}_${gaName(String(p.title ?? ''))}`.slice(0, 100) } });
      break;
    case 'relic_unlock':
      hits.push({ name: 'unlock_achievement', params: { achievement_id: `relic_${String(p.relic)}` } });
      break;
    case 'puzzle_start':
      hits.push({ name: 'level_start', params: { level_name: `${p.section}_${num('level')}` } });
      break;
    case 'puzzle_end':
      hits.push({ name: 'level_end', params: { level_name: `${p.section}_${num('level')}`, success: num('stars') > 0 } });
      break;
    case 'sell_product':
    case 'contract_done':
      hits.push({ name: 'earn_virtual_currency', params: { virtual_currency_name: 'coins', value: num(ev.e === 'sell_product' ? 'price' : 'pay') } });
      break;
    case 'upgrade':
    case 'staff_hire':
    case 'staff_train':
    case 'building_build':
    case 'brand_up':
      if (num('cost') > 0) hits.push({ name: 'spend_virtual_currency', params: { virtual_currency_name: 'coins', value: num('cost'), item_name: String(p.id ?? p.role ?? ev.e) } });
      break;
    case 'goal_complete':
      if (p.goal === 'catch3') hits.push({ name: 'tutorial_begin', params: {} });
      if (p.goal === 'gear1') hits.push({ name: 'tutorial_complete', params: {} });
      break;
  }
  return hits;
}

/** The player's GA user properties: how far they are (web gtag and the app's Measurement Protocol alike). */
export function playerProps(st: GameState, platform: string): GaParams {
  return {
    captain_level: levelForXp(st.xp),
    career_stage: career(st).stage,
    career_title: careerTitle(st),
    brand_level: st.brand?.level ?? 0,
    island_level: islandLevel(st),
    team_size: st.island.staff.length,
    sea: st.sea,
    relics: st.relics.length,
    dex: Object.keys(st.dex).length,
    platform,
  };
}
