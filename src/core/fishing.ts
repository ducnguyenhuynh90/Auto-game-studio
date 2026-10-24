// Pure fishing mechanics: what swims, and the reel tension minigame.
// Outcome is decided only by player input + visible fish behaviour (no hidden fake odds).
import { BALANCE, SPECIES, type Species, type ZoneId } from './data';
import { pickWeighted, range, type Rng } from './rng';

export function speciesForZone(zone: ZoneId): Species[] {
  return SPECIES.filter((s) => s.zones.includes(zone));
}

export interface ShadowSpec {
  species: string;
  size: number;
  depth: number; // 0 near .. 1 far, where it swims
}

export function rollShadow(rng: Rng, zone: ZoneId): ShadowSpec {
  const sp = pickWeighted(rng, speciesForZone(zone), (s) => s.weight);
  const size = Math.round(range(rng, sp.size[0], sp.size[1]) * 10) / 10;
  const depth = Math.min(1, Math.max(0, sp.depth + range(rng, -0.15, 0.15)));
  return { species: sp.id, size, depth };
}

/** Triangle wave 0→1→0 used for the hold-to-charge cast meter. */
export function castPower(heldSeconds: number, cyclesPerSecond = 0.75): number {
  const p = (heldSeconds * cyclesPerSecond) % 1;
  return p < 0.5 ? p * 2 : 2 - p * 2;
}

export type ReelResult = null | 'caught' | 'snapped' | 'escaped';

export interface ReelOptions {
  difficulty: number; // 0..1
  rodLevel: number;
  assist?: boolean; // first-catch tutorial: wider zone, no thrash
}

export class Reel {
  tension = 0.3;
  progress = 0.35;
  strain = 0;
  time = 0;
  scoredTime = 0;
  inZoneTime = 0;
  zoneCenter = 0.5;
  zoneWidth: number;
  result: ReelResult = null;
  /** >0 while the fish is mid-thrash; exposed so the renderer can shake the fish. */
  thrash = 0;
  private thrashTimer: number;
  private readonly snapTime: number;
  private readonly d: number;
  private readonly assist: boolean;

  constructor(
    opts: ReelOptions,
    private readonly rng: Rng,
  ) {
    this.d = opts.difficulty;
    this.assist = !!opts.assist;
    this.zoneWidth = BALANCE.rodZone[opts.rodLevel] + (this.assist ? 0.1 : 0);
    this.snapTime = BALANCE.rodSnap[opts.rodLevel];
    this.thrashTimer = this.nextThrash();
  }

  private nextThrash(): number {
    return range(this.rng, 0.9, 2.2) / (0.5 + this.d);
  }

  get zoneLow(): number {
    return this.zoneCenter - this.zoneWidth / 2;
  }
  get zoneHigh(): number {
    return this.zoneCenter + this.zoneWidth / 2;
  }
  get inZone(): boolean {
    return this.tension >= this.zoneLow && this.tension <= this.zoneHigh;
  }
  /** Skill score 0..1: share of the fight spent in the sweet zone. */
  get freshness(): number {
    if (this.scoredTime <= 0) return 1;
    return Math.min(1, this.inZoneTime / this.scoredTime);
  }

  step(dt: number, holding: boolean): ReelResult {
    if (this.result) return this.result;
    this.time += dt;
    const d = this.d;

    this.zoneCenter = 0.5 + Math.sin(this.time * (0.7 + d * 1.2)) * 0.2 * d;

    this.tension += (holding ? 1.15 : -0.95) * dt;
    if (!this.assist) {
      this.thrashTimer -= dt;
      if (this.thrashTimer <= 0) {
        this.thrash = 0.25;
        this.thrashTimer = this.nextThrash();
      }
    }
    if (this.thrash > 0) {
      this.tension += ((0.22 + 0.4 * d) / 0.25) * Math.min(dt, this.thrash);
      this.thrash = Math.max(0, this.thrash - dt);
    }
    this.tension = Math.min(1, Math.max(0, this.tension));

    const rate = 1 / (3.2 + 5 * d);
    if (this.inZone) this.progress += rate * dt;
    else if (this.tension > this.zoneHigh) this.progress += rate * 0.6 * dt;
    else this.progress -= (0.12 + 0.15 * d) * dt;

    if (this.time > 0.4) {
      this.scoredTime += dt;
      if (this.inZone) this.inZoneTime += dt;
    }

    if (this.tension >= 0.97) this.strain += dt;
    else this.strain = Math.max(0, this.strain - dt * 1.5);

    if (this.strain >= this.snapTime) this.result = 'snapped';
    else if (this.progress >= 1) this.result = 'caught';
    else if (this.progress <= 0) this.result = 'escaped';
    return this.result;
  }
}
