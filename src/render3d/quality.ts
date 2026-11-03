// Graphics quality tiers for weak devices: picked from device hints at boot, stepped down at runtime
// when the measured frame rate stays low, and overridable in Settings (remembered per device).

export type Quality = 'low' | 'medium' | 'high';
export type QualitySetting = Quality | 'auto';

export interface QualityProfile {
  /** Max device-pixel-ratio rendered (fill rate is the #1 cost on weak GPUs). */
  maxDpr: number;
  /** Render scale on top of DPR (low tier renders below native resolution). */
  scale: number;
  antialias: boolean;
  shadows: boolean;
  shadowMap: number;
  outlines: boolean;
  /** Render the 3D layer every Nth frame (2 = 30 fps on a 60 Hz screen). */
  frameSkip: number;
  waterSegs: number;
  particles: number; // multiplier on particle counts
}

export const PROFILES: Record<Quality, QualityProfile> = {
  high: { maxDpr: 2, scale: 1, antialias: true, shadows: true, shadowMap: 1024, outlines: true, frameSkip: 1, waterSegs: 56, particles: 1 },
  medium: { maxDpr: 1.5, scale: 1, antialias: true, shadows: true, shadowMap: 512, outlines: true, frameSkip: 1, waterSegs: 36, particles: 0.7 },
  low: { maxDpr: 1, scale: 0.8, antialias: false, shadows: false, shadowMap: 256, outlines: false, frameSkip: 2, waterSegs: 20, particles: 0.4 },
};

const KEY = 'mam_quality';

export function loadQualitySetting(): QualitySetting {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'auto') return v;
  } catch {
    /* storage unavailable */
  }
  return 'auto';
}

export function saveQualitySetting(q: QualitySetting): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* ignore */
  }
}

/** Remembered result of a previous auto step-down, so weak devices start right next time. It expires:
 * one slow session (battery saver, a hot phone, a busy background app) must not keep a fast phone on a
 * lower tier for good. After AUTO_TTL_MS the game starts from its usual guess again; a genuinely weak
 * device steps back down within seconds (FpsGovernor) and the fresh result is remembered again. */
const AUTO_KEY = 'mam_quality_auto';
export const AUTO_TTL_MS = 3 * 24 * 3600 * 1000;
export function loadAutoQuality(now = Date.now()): Quality | null {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (!raw) return null;
    // a bare tier is from before results were dated: treat it as expired
    const v = JSON.parse(raw) as { q?: unknown; at?: unknown };
    if (typeof v !== 'object' || v === null || typeof v.at !== 'number' || now - v.at > AUTO_TTL_MS || now < v.at) return null;
    return v.q === 'low' || v.q === 'medium' || v.q === 'high' ? v.q : null;
  } catch {
    return null;
  }
}
export function saveAutoQuality(q: Quality, now = Date.now()): void {
  try {
    localStorage.setItem(AUTO_KEY, JSON.stringify({ q, at: now }));
  } catch {
    /* ignore */
  }
}

/** Best guess from device hints. Conservative: a wrong "low" costs looks, a wrong "high" costs players. */
export function detectQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number; product?: string };
  // The app (React Native) never reports hardwareConcurrency/deviceMemory/userAgent, so the
  // browser heuristic below would always read as "4 cores, 4GB, not mobile" and settle on
  // "medium" for every phone, weak or flagship — visibly soft on today's high-density screens.
  // Start optimistic there instead; the FpsGovernor steps a genuinely weak device down live.
  if (nav.product === 'ReactNative') return 'high';
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  if (cores <= 2 || mem <= 2) return 'low';
  if (mobile && (cores <= 4 || mem <= 3)) return 'low';
  if (mobile || cores <= 4 || mem <= 4) return 'medium';
  return 'high';
}

/**
 * Watches real frame times and asks for a lower tier when the game can't keep up.
 * Only steps DOWN during a session (stepping up and down makes the image flicker).
 */
export class FpsGovernor {
  private samples: number[] = [];
  private warmup = 3; // seconds ignored after start or a change (shader compiles, loading)
  constructor(private onStepDown: () => boolean) {}

  frame(dt: number): void {
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    if (dt <= 0 || dt > 1) return; // tab switches, debugger pauses
    this.samples.push(dt);
    // judge every ~2 s of play (time-based, so a 3 fps device is judged as quickly as a 50 fps one)
    const total = this.samples.reduce((a, b) => a + b, 0);
    if (total < 2) return;
    const avg = total / this.samples.length;
    this.samples = [];
    if (1 / avg < 40 && this.onStepDown()) this.warmup = 3;
  }
}
