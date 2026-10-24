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

/** Remembered result of a previous auto step-down, so weak devices start right next time. */
const AUTO_KEY = 'mam_quality_auto';
export function loadAutoQuality(): Quality | null {
  try {
    const v = localStorage.getItem(AUTO_KEY);
    return v === 'low' || v === 'medium' || v === 'high' ? v : null;
  } catch {
    return null;
  }
}
export function saveAutoQuality(q: Quality): void {
  try {
    localStorage.setItem(AUTO_KEY, q);
  } catch {
    /* ignore */
  }
}

/** Best guess from device hints. Conservative: a wrong "low" costs looks, a wrong "high" costs players. */
export function detectQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number };
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
