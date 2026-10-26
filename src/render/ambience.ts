// The beach soundscape, all procedural (no audio files): a calm, uneven surf, a low sea bed, a soft breeze,
// a rare distant gull, and an optional slow pentatonic pluck melody with a gentle echo.
// Events are scheduled a little ahead on the audio clock, so the same code renders offline for tests.

/** Vietnamese-folk feel: a major pentatonic on D (D E G A B), two octaves. */
const SCALE = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0];

export interface AmbienceLevels {
  /** Overall surf + breeze + gulls (0 silences them). */
  sea: number;
  /** The melody (0 silences it). */
  music: number;
}

export class Ambience {
  readonly sea: GainNode;
  readonly music: GainNode;
  private noiseBuf: AudioBuffer;
  private nextWave = 0;
  private nextGull = 0;
  private nextPhrase = 0;
  private note = 2;
  private rand: () => number;

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
    levels: AmbienceLevels,
    rand: () => number = Math.random,
  ) {
    this.rand = rand;
    this.sea = ctx.createGain();
    this.sea.gain.value = levels.sea;
    this.sea.connect(out);
    this.music = ctx.createGain();
    this.music.gain.value = levels.music;
    this.music.connect(out);

    // 6 s of white noise, shared by every layer (different filters and start offsets)
    const len = ctx.sampleRate * 6;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = this.rand() * 2 - 1;

    this.seaBed();
    this.breeze();
    const t = ctx.currentTime;
    this.nextWave = t + 0.5;
    this.nextGull = t + 25 + this.rand() * 20;
    this.nextPhrase = t + 4;
  }

  /** Schedule everything that starts before `until` (audio clock seconds). Call it about once a second. */
  scheduleUntil(until: number): void {
    while (this.nextWave < until) {
      this.wave(this.nextWave);
      this.nextWave += 5 + this.rand() * 4.5; // waves never arrive on a beat
    }
    while (this.nextGull < until) {
      this.gull(this.nextGull);
      this.nextGull += 35 + this.rand() * 40;
    }
    while (this.nextPhrase < until) this.nextPhrase = this.phrase(this.nextPhrase);
  }

  private noiseSource(loop = false): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = loop;
    return src;
  }

  private pan(node: AudioNode, p: number): AudioNode {
    if (!('createStereoPanner' in this.ctx)) return node;
    const sp = this.ctx.createStereoPanner();
    sp.pan.value = p;
    node.connect(sp);
    return sp;
  }

  /** The far sea: a deep, steady hush under everything. */
  private seaBed(): void {
    const src = this.noiseSource(true);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = this.ctx.createGain();
    g.gain.value = 0.1;
    src.connect(lp).connect(g).connect(this.sea);
    src.start(this.ctx.currentTime, this.rand() * 5);
  }

  /** Wind through palms: band-passed noise, slowly drifting in pitch and strength. */
  private breeze(): void {
    const src = this.noiseSource(true);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.value = 0.024;
    const drift = this.ctx.createOscillator();
    drift.frequency.value = 0.037;
    const driftDepth = this.ctx.createGain();
    driftDepth.gain.value = 260;
    drift.connect(driftDepth).connect(bp.frequency);
    const swell = this.ctx.createOscillator();
    swell.frequency.value = 0.053;
    const swellDepth = this.ctx.createGain();
    swellDepth.gain.value = 0.016;
    swell.connect(swellDepth).connect(g.gain);
    src.connect(bp).connect(g).connect(this.sea);
    const t = this.ctx.currentTime;
    src.start(t, this.rand() * 5);
    drift.start(t);
    swell.start(t);
  }

  /** One wave: a slow rise as it rolls in, a soft crest, then a long fizzy wash back down the sand. */
  private wave(t: number): void {
    const size = 0.55 + this.rand() * 0.45;
    const rise = 1.4 + this.rand() * 1.2;
    const fall = 3.2 + this.rand() * 2.2;
    const end = t + rise + fall;
    const p = (this.rand() - 0.5) * 0.7;
    // body
    const body = this.noiseSource(true);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(220, t);
    lp.frequency.exponentialRampToValueAtTime(700 + size * 700, t + rise);
    lp.frequency.exponentialRampToValueAtTime(260, end);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 * size, t + rise);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    this.pan(body.connect(lp).connect(g), p).connect(this.sea);
    body.start(t, this.rand() * 5);
    body.stop(end + 0.1);
    // foam: the bright fizz as the wave spreads and drains back
    const foam = this.noiseSource(true);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2600;
    const fg = this.ctx.createGain();
    const ft = t + rise * 0.8;
    fg.gain.setValueAtTime(0.0001, ft);
    fg.gain.exponentialRampToValueAtTime(0.04 * size, ft + 0.5);
    fg.gain.exponentialRampToValueAtTime(0.0001, ft + fall * 0.9);
    this.pan(foam.connect(hp).connect(fg), -p * 0.6).connect(this.sea);
    foam.start(ft, this.rand() * 5);
    foam.stop(ft + fall + 0.6);
  }

  /** A gull far down the beach: two soft, falling cries. */
  private gull(t: number): void {
    const p = (this.rand() - 0.5) * 1.2;
    for (let k = 0; k < 2; k++) {
      const at = t + k * 0.34;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(1250 + this.rand() * 150, at);
      o.frequency.exponentialRampToValueAtTime(820, at + 0.28);
      const vib = this.ctx.createOscillator();
      vib.frequency.value = 22;
      const vibDepth = this.ctx.createGain();
      vibDepth.gain.value = 18;
      vib.connect(vibDepth).connect(o.frequency);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1600; // far away: no sharp edge
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.006, at + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      this.pan(o.connect(lp).connect(g), p).connect(this.sea);
      o.start(at);
      vib.start(at);
      o.stop(at + 0.32);
      vib.stop(at + 0.32);
    }
  }

  /** A short melody (2-4 notes, wandering the scale), then a long rest. Returns when the next starts. */
  private phrase(t: number): number {
    const n = 2 + Math.floor(this.rand() * 3);
    let at = t;
    for (let k = 0; k < n; k++) {
      this.note = Math.max(0, Math.min(SCALE.length - 1, this.note + [-2, -1, -1, 1, 1, 2][Math.floor(this.rand() * 6)]));
      // now and then a đàn bầu-style slide up into the note
      this.pluck(at, SCALE[this.note], k === n - 1 ? 0.04 : 0.032, this.rand() < 0.25);
      at += 0.55 + this.rand() * 0.6;
    }
    if (this.rand() < 0.3) this.note = 2 + Math.floor(this.rand() * 3); // drift home now and then
    return at + 5 + this.rand() * 6;
  }

  private echo: { input: GainNode } | null = null;
  private echoBus(): GainNode {
    if (this.echo) return this.echo.input;
    const input = this.ctx.createGain();
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = 0.42;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.32;
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1800;
    input.connect(this.music);
    input.connect(delay);
    delay.connect(tone).connect(fb).connect(delay);
    tone.connect(this.music);
    this.echo = { input };
    return input;
  }

  private pluck(t: number, f: number, vol: number, slide: boolean): void {
    const out = this.echoBus();
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 1.2); // the string mellows as it rings
    g.connect(lp).connect(out);
    for (const [mult, type, level] of [
      [1, 'triangle', 1],
      [2, 'sine', 0.25],
    ] as const) {
      const o = this.ctx.createOscillator();
      o.type = type;
      const target = f * mult;
      if (slide) {
        o.frequency.setValueAtTime(target * 0.89, t);
        o.frequency.exponentialRampToValueAtTime(target, t + 0.18);
      } else o.frequency.setValueAtTime(target, t);
      const lg = this.ctx.createGain();
      lg.gain.value = level;
      o.connect(lg).connect(g);
      o.start(t);
      o.stop(t + 2.7);
    }
  }
}
