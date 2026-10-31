// Google Analytics 4 for the app, through the Measurement Protocol (no gtag.js in React Native).
// On only when the build has EXPO_PUBLIC_GA_MEASUREMENT_ID and EXPO_PUBLIC_GA_API_SECRET, and only after
// the player says yes (asked once; Settings can change it). Same events, names and player properties as
// the web game (src/analytics/gamap.ts), same consent key, same anonymous install id. No ad ids.
import { AppState, Platform } from 'react-native';
import { analytics, type AnalyticsEvent } from '@core/analytics';
import type { GameState } from '@core/state';
import { playerProps, toGa } from '@web/analytics/gamap';
import { mpBodies, mpUrl, type MpHit } from '@web/analytics/mp';

const ID = process.env.EXPO_PUBLIC_GA_MEASUREMENT_ID ?? '';
const SECRET = process.env.EXPO_PUBLIC_GA_API_SECRET ?? '';
const CONSENT_KEY = 'mam_ga_consent';
const QUEUE_MAX = 400;
const SEND_EVERY_MS = 10_000;
const SESSION_GAP_MS = 30 * 60_000; // GA's own session timeout

type Consent = 'yes' | 'no' | null;

function readConsent(): Consent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'yes' || v === 'no' ? v : null;
  } catch {
    return null;
  }
}

class AppAnalytics {
  readonly configured = !!ID && !!SECRET;
  private consent: Consent = readConsent();
  private queue: MpHit[] = [];
  private sessionId = Math.floor(Date.now() / 1000);
  private hiddenAt = 0;
  private sending = false;
  private state: () => GameState | null = () => null;

  constructor() {
    if (!this.configured) return;
    if (process.env.EXPO_PUBLIC_GA_CONSENT === 'granted' && this.consent === null) this.consent = 'yes';
    // this session's events so far (session_start, first_launch…) happened before this module loaded
    for (const ev of analytics.events) this.onEvent(ev);
    analytics.onEvent((ev) => this.onEvent(ev));
    setInterval(() => void this.send(), SEND_EVERY_MS);
    AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        if (this.hiddenAt && Date.now() - this.hiddenAt > SESSION_GAP_MS) this.sessionId = Math.floor(Date.now() / 1000);
        this.hiddenAt = 0;
      } else {
        this.hiddenAt = Date.now();
        void this.send(); // the app may be closed from the background: send what we have
      }
    });
  }

  /** Where the player properties (level, stage, brand…) come from. */
  setState(fn: () => GameState): void {
    this.state = fn;
  }

  get askNeeded(): boolean {
    return this.configured && this.consent === null;
  }

  get enabled(): boolean {
    return this.configured && this.consent === 'yes';
  }

  setConsent(yes: boolean): void {
    this.consent = yes ? 'yes' : 'no';
    try {
      localStorage.setItem(CONSENT_KEY, this.consent);
    } catch {
      /* asked again next time */
    }
    analytics.track('stats_consent', { yes, app: 'react-native' });
    if (yes) void this.send();
    else this.queue = [];
  }

  private onEvent(ev: AnalyticsEvent): void {
    if (this.consent === 'no') return;
    for (const h of toGa(ev)) if (this.queue.length < QUEUE_MAX) this.queue.push({ ...h, params: { ...h.params, session_ref: ev.sid }, at: ev.t });
  }

  private async send(): Promise<void> {
    if (!this.enabled || this.sending || !this.queue.length) return;
    this.sending = true;
    const hits = this.queue.splice(0);
    const st = this.state();
    const props = st ? playerProps(st, Platform.OS) : { platform: Platform.OS };
    let sent = 0;
    try {
      for (const body of mpBodies(analytics.iid, this.sessionId, hits, props)) {
        const res = await fetch(mpUrl(ID, SECRET), { method: 'POST', body: JSON.stringify(body) });
        if (!res.ok && res.status >= 500) throw new Error(String(res.status));
        sent += body.events.length;
      }
    } catch {
      // offline: keep the unsent ones for the next try (the newest win if the queue is full)
      this.queue = [...hits.slice(sent), ...this.queue].slice(-QUEUE_MAX);
    } finally {
      this.sending = false;
    }
  }
}

export const ga = new AppAnalytics();
