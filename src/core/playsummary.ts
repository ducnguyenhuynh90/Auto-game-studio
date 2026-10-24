// Folds the event stream into ONE compact per-player summary document. A summary (not raw events)
// keeps remote storage bounded and gives the funnel/retention numbers directly.
import type { AnalyticsEvent } from './analytics';

export interface PlaySummary {
  v: 1;
  iid: string;
  firstSeen: number;
  lastSeen: number;
  /** Session start times (epoch ms), newest last, capped. */
  sessions: number[];
  /** Funnel step → seconds since first launch. */
  funnel: Record<string, number>;
  counts: Record<string, number>;
  lost: Record<string, number>;
  /** Catches by species. */
  species: Record<string, number>;
  /** Screen/overlay views by name. */
  screens: Record<string, number>;
  perfect: number;
  bestDegrees: number;
  goals: string[];
  /** Screen where the last session ended (from app_hidden). */
  lastScreen: string;
  activeSec: number;
  lastError?: string;
  /** Furthest sea sailed to. */
  seas?: string[];
}

const MAX_SESSIONS = 120;
const COUNTED = ['quality_auto_down', 'login', 'cloud_merge', 'js_error', 'mission_complete', 'level_up', 'gadget_use', 'sail', 'cast', 'hook', 'catch', 'fish_lost', 'trip_start', 'trip_end', 'jar_seal', 'jar_open', 'sell_product', 'keep_product', 'sell_fish', 'upgrade', 'dex_new', 'screen', 'session_start'];

export function emptySummary(iid: string, now: number): PlaySummary {
  return { v: 1, iid, firstSeen: now, lastSeen: now, sessions: [], funnel: {}, counts: {}, lost: {}, species: {}, screens: {}, perfect: 0, bestDegrees: 0, goals: [], lastScreen: '', activeSec: 0 };
}

export function applyEvent(s: PlaySummary, ev: AnalyticsEvent): PlaySummary {
  const p = ev.p ?? {};
  // active time: gaps under 60 s between events count as play
  const gap = (ev.t - s.lastSeen) / 1000;
  if (gap > 0 && gap < 60) s.activeSec = Math.round(s.activeSec + gap);
  s.lastSeen = Math.max(s.lastSeen, ev.t);
  if (COUNTED.includes(ev.e)) s.counts[ev.e] = (s.counts[ev.e] ?? 0) + 1;
  switch (ev.e) {
    case 'session_start':
      s.sessions.push(ev.t);
      if (s.sessions.length > MAX_SESSIONS) s.sessions.splice(0, s.sessions.length - MAX_SESSIONS);
      break;
    case 'funnel':
      if (typeof p.step === 'string' && s.funnel[p.step] === undefined) s.funnel[p.step] = Number(p.sec ?? 0);
      break;
    case 'fish_lost':
      s.lost[String(p.reason)] = (s.lost[String(p.reason)] ?? 0) + 1;
      break;
    case 'catch':
      s.species[String(p.species)] = (s.species[String(p.species)] ?? 0) + 1;
      if (p.perfect) s.perfect++;
      break;
    case 'jar_open':
      s.bestDegrees = Math.max(s.bestDegrees, Number(p.degrees ?? 0));
      break;
    case 'goal_complete':
      if (!s.goals.includes(String(p.goal))) s.goals.push(String(p.goal));
      break;
    case 'screen':
      s.screens ??= {};
      s.screens[String(p.name)] = (s.screens[String(p.name)] ?? 0) + 1;
      break;
    case 'js_error':
      s.lastError = String(p.msg ?? '');
      break;
    case 'trip_start':
      s.seas ??= [];
      if (p.sea && !s.seas.includes(String(p.sea))) s.seas.push(String(p.sea));
      break;
    case 'app_hidden':
      s.lastScreen = String(p.scene ?? '');
      break;
  }
  return s;
}
