// Google Analytics 4 for self-hosted builds (web on GitHub Pages, and the iOS / Android apps).
// Compiled in only when VITE_GA_MEASUREMENT_ID is set at build time (__GA__); never in the claude.ai
// playtest page (it can't load outside scripts). No cookies: GA uses the game's anonymous install id.
// The player is asked once (Settings can change it); events before the answer wait in memory, so the
// first session's funnel isn't lost, and are dropped if the answer is no.
import { analytics, type AnalyticsEvent } from '../core/analytics';
import { toGa, type GaParams } from './gamap';

type Gtag = (...args: unknown[]) => void;
const CONSENT_KEY = 'mam_ga_consent';
const PENDING_MAX = 400;

export type Consent = 'yes' | 'no' | null;

function readConsent(): Consent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'yes' || v === 'no' ? v : null;
  } catch {
    return null;
  }
}

class GoogleAnalytics {
  private consent: Consent = readConsent();
  private pending: AnalyticsEvent[] = [];
  private gtag: Gtag | null = null;
  private props: () => GaParams = () => ({});
  private propsT = 0;

  constructor(private readonly id: string) {
    // the build may grant consent up front (VITE_GA_CONSENT=granted) where that is the founder's call
    if (import.meta.env.VITE_GA_CONSENT === 'granted' && this.consent === null) this.consent = 'yes';
    // GA loads a moment after boot: replay this session's earlier events (session_start, first_launch…)
    for (const ev of analytics.events) this.onEvent(ev);
    analytics.onEvent((ev) => this.onEvent(ev));
    if (this.consent === 'yes') this.start();
  }

  get askNeeded(): boolean {
    return this.consent === null;
  }

  get enabled(): boolean {
    return this.consent === 'yes';
  }

  /** Player properties (level, stage, brand…) read from the game whenever they may have changed. */
  setPropsProvider(fn: () => GaParams): void {
    this.props = fn;
    this.pushProps();
  }

  setConsent(yes: boolean): void {
    this.consent = yes ? 'yes' : 'no';
    try {
      localStorage.setItem(CONSENT_KEY, this.consent);
    } catch {
      /* private mode: asked again next time */
    }
    if (yes) this.start();
    else {
      this.pending = [];
      this.gtag?.('consent', 'update', { analytics_storage: 'denied' });
      this.gtag = null;
    }
  }

  private start(): void {
    if (this.gtag) return;
    const w = window as unknown as { dataLayer: unknown[]; gtag: Gtag };
    w.dataLayer = w.dataLayer || [];
    // the standard gtag stub: GA reads these from dataLayer once its script arrives
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer.push(arguments);
    };
    this.gtag = w.gtag;
    const native = (window as unknown as { Capacitor?: { getPlatform?(): string } }).Capacitor?.getPlatform?.() ?? 'web';
    this.gtag('js', new Date());
    this.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    this.gtag('config', this.id, {
      client_id: analytics.iid,
      client_storage: 'none', // no cookies, in browsers and in the app web views alike
      send_page_view: false, // screens are sent as page_view by toGa()
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      // app web views have capacitor:// or localhost origins: give GA a stable, readable location
      page_location: native === 'web' ? location.href.split('?')[0] : `https://app.mamvillage/${native}`,
      platform: native,
      debug_mode: new URLSearchParams(location.search).has('ga_debug') || undefined,
    });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(this.id)}`;
    document.head.appendChild(s);
    this.pushProps();
    for (const ev of this.pending.splice(0)) this.send(ev);
  }

  private pushProps(): void {
    if (!this.gtag) return;
    this.gtag('set', 'user_properties', this.props());
    this.propsT = Date.now();
  }

  private onEvent(ev: AnalyticsEvent): void {
    if (this.consent === 'no') return;
    if (!this.gtag) {
      if (this.pending.length < PENDING_MAX) this.pending.push(ev);
      return;
    }
    this.send(ev);
  }

  private send(ev: AnalyticsEvent): void {
    // progress changes show up on the player as soon as they happen
    if (/^(level_up|career_stage|brand_up|building_build|staff_hire|sail|session_start)$/.test(ev.e) || Date.now() - this.propsT > 120000) this.pushProps();
    for (const h of toGa(ev)) this.gtag?.('event', h.name, { ...h.params, session_ref: ev.sid });
  }
}

let ga: GoogleAnalytics | null = null;

/** Starts GA once (main.ts). Returns null when this build has no Measurement ID. */
export function initGa(): GoogleAnalytics | null {
  const id = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (!id) return null;
  ga ??= new GoogleAnalytics(id);
  return ga;
}

export function getGa(): GoogleAnalytics | null {
  return ga;
}
export { playerProps } from './gamap';
