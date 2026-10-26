// Google Analytics 4 Measurement Protocol: the request bodies the React Native app sends (it has no
// gtag.js). Pure and unit-tested; the hits themselves come from gamap.ts, the same as the web game's.
// https://developers.google.com/analytics/devguides/collection/protocol/ga4
import type { GaHit, GaParams } from './gamap';

export const MP_MAX_EVENTS = 25; // GA's limit per request

export interface MpHit extends GaHit {
  /** When it happened (ms), so a batch sent later still lands at the right time. */
  at: number;
}

export interface MpBody {
  client_id: string;
  user_properties: Record<string, { value: string | number | boolean }>;
  events: { name: string; params: GaParams; timestamp_micros: number }[];
}

/**
 * One request body per 25 hits. Every event carries session_id and engagement_time_msec: without them GA
 * keeps the event but leaves it out of sessions, engagement and most reports.
 */
export function mpBodies(clientId: string, sessionId: number, hits: MpHit[], props: GaParams): MpBody[] {
  const user_properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, { value: v }]));
  const out: MpBody[] = [];
  for (let i = 0; i < hits.length; i += MP_MAX_EVENTS) {
    out.push({
      client_id: clientId,
      user_properties,
      events: hits.slice(i, i + MP_MAX_EVENTS).map((h) => ({
        name: h.name,
        params: { ...h.params, session_id: sessionId, engagement_time_msec: 100 },
        timestamp_micros: Math.round(h.at * 1000),
      })),
    });
  }
  return out;
}

export function mpUrl(measurementId: string, apiSecret: string, debug = false): string {
  return `https://www.google-analytics.com/${debug ? 'debug/' : ''}mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
}
