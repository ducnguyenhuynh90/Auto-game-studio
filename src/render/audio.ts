// Procedural WebAudio sound effects: no asset pipeline needed while we iterate on feel.
let ctx: AudioContext | null = null;
let muted = false;

let ambientGain: GainNode | null = null;

export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    startAmbient();
  } catch {
    ctx = null;
  }
}

/** Soft looping surf (filtered noise with a slow swell) plus an occasional gull. */
function startAmbient(): void {
  if (!ctx) return;
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; // brown-ish noise
    d[i] = last * 6;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  ambientGain = ctx.createGain();
  ambientGain.gain.value = muted ? 0 : 0.05;
  // the swell modulates its own stage so muting (ambientGain → 0) silences it completely
  const swellStage = ctx.createGain();
  swellStage.gain.value = 1;
  const swell = ctx.createOscillator();
  swell.frequency.value = 0.12;
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 0.5;
  swell.connect(swellDepth).connect(swellStage.gain);
  src.connect(filter).connect(swellStage).connect(ambientGain).connect(ctx.destination);
  src.start();
  swell.start();
  const gull = () => {
    if (!muted && ctx && ctx.state === 'running') {
      tone(1400, 0.18, 'sine', 0.025, 900);
      tone(1500, 0.22, 'sine', 0.02, 1000, 0.22);
    }
    setTimeout(gull, 9000 + Math.random() * 14000);
  };
  setTimeout(gull, 6000);
}

export function setMuted(m: boolean): void {
  muted = m;
  if (ambientGain && ctx) ambientGain.gain.setTargetAtTime(m ? 0 : 0.05, ctx.currentTime, 0.2);
}
export function isMuted(): boolean {
  return muted;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, slideTo?: number, delay = 0): void {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.2, filterFreq = 1200, delay = 0): void {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
}

export const sfx = {
  tap: () => tone(660, 0.06, 'triangle', 0.08),
  cast: () => {
    noise(0.25, 0.12, 3000);
    tone(500, 0.25, 'sine', 0.05, 1200);
  },
  splash: () => noise(0.35, 0.25, 900),
  nibble: () => tone(220, 0.05, 'sine', 0.08),
  bite: () => {
    noise(0.2, 0.3, 1500);
    tone(880, 0.12, 'square', 0.08, 440);
  },
  reelTick: (pitch: number) => tone(300 + pitch * 500, 0.03, 'square', 0.025),
  strain: () => tone(140, 0.08, 'sawtooth', 0.04),
  snap: () => {
    tone(1200, 0.15, 'sawtooth', 0.1, 200);
    noise(0.1, 0.2, 4000);
  },
  catch: () => {
    noise(0.3, 0.2, 1200);
    [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, undefined, i * 0.07));
  },
  rare: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, undefined, i * 0.08)),
  fail: () => tone(300, 0.3, 'triangle', 0.1, 150),
  plop: () => tone(300, 0.12, 'sine', 0.15, 600),
  seal: () => {
    tone(180, 0.2, 'sine', 0.2, 90);
    noise(0.1, 0.1, 600);
  },
  knock: (i: number) => {
    tone(200 + i * 60, 0.12, 'sine', 0.2, 120 + i * 40);
    noise(0.06, 0.15, 800);
  },
  pop: () => {
    tone(400, 0.15, 'sine', 0.2, 1400);
    noise(0.15, 0.2, 2500);
  },
  tick: (i: number) => tone(500 + i * 18, 0.04, 'triangle', 0.05),
  tierUp: (i: number) => tone(523 * Math.pow(1.26, i), 0.25, 'triangle', 0.12),
  coin: () => {
    tone(988, 0.08, 'square', 0.05);
    tone(1319, 0.25, 'square', 0.05, undefined, 0.07);
  },
  upgrade: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, undefined, i * 0.06)),
};

export function vibrate(ms: number | number[]): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
