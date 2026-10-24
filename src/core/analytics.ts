// Minimal behavioural analytics. Events are stored locally (ring buffer) and, when
// VITE_ANALYTICS_URL is configured, sent with sendBeacon. No personal data is collected:
// only an anonymous random install id. See docs/ANALYTICS.md for the event spec.

export interface AnalyticsEvent {
  e: string;
  t: number; // epoch ms
  sid: string; // session id
  iid: string; // anonymous install id
  p?: Record<string, string | number | boolean>;
}

const STORE_KEY = 'mam_events';
const FUNNEL_KEY = 'mam_funnel';
const MAX_EVENTS = 3000;

export const FUNNEL_STEPS = [
  'first_launch',
  'first_cast',
  'first_bite',
  'first_catch',
  'first_seal',
  'second_trip_start',
  'first_reveal',
  'first_sale',
  'first_upgrade',
  'third_trip_start',
  'first_reef_trip',
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

function rid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* storage unavailable: analytics stays in memory */
  }
}

class Analytics {
  readonly sid = rid();
  readonly iid: string;
  readonly events: AnalyticsEvent[] = [];
  private funnel: Record<string, number>;
  private readonly endpoint: string | undefined = import.meta.env?.VITE_ANALYTICS_URL;

  constructor() {
    this.iid = safeGet('mam_iid') ?? rid();
    safeSet('mam_iid', this.iid);
    this.funnel = JSON.parse(safeGet(FUNNEL_KEY) ?? '{}');
  }

  track(e: string, p?: AnalyticsEvent['p']): void {
    const ev: AnalyticsEvent = { e, t: Date.now(), sid: this.sid, iid: this.iid, p };
    this.events.push(ev);
    const stored: AnalyticsEvent[] = JSON.parse(safeGet(STORE_KEY) ?? '[]');
    stored.push(ev);
    safeSet(STORE_KEY, JSON.stringify(stored.slice(-MAX_EVENTS)));
    if (this.endpoint && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(this.endpoint, JSON.stringify(ev));
    }
  }

  /** Records a funnel milestone once per install (with seconds since first launch). */
  funnelStep(step: FunnelStep, p?: AnalyticsEvent['p']): void {
    if (this.funnel[step]) return;
    const now = Date.now();
    this.funnel[step] = now;
    safeSet(FUNNEL_KEY, JSON.stringify(this.funnel));
    const start = this.funnel.first_launch ?? now;
    this.track('funnel', { step, sec: Math.round((now - start) / 1000), ...p });
  }

  funnelState(): Record<string, number> {
    return { ...this.funnel };
  }
}

export const analytics = new Analytics();
