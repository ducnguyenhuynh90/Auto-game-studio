// Tiny WebAudio synth: no files, starts only after the first tap.
let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) { muted = m; }
export function isMuted() { return muted; }
export function unlock() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { ctx = null; }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, delay = 0, slide = 0) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  pick: () => tone(660, 0.08, 'triangle', 0.08),
  place: () => { tone(392, 0.12, 'triangle'); tone(587, 0.16, 'triangle', 0.1, 0.06); },
  remove: () => tone(440, 0.14, 'triangle', 0.08, 0, 0.6),
  deny: () => tone(180, 0.18, 'square', 0.05),
  play: () => { tone(523, 0.1, 'sine'); tone(784, 0.18, 'sine', 0.1, 0.08); },
  season: () => tone(1046, 0.05, 'sine', 0.03),
  good: () => { tone(659, 0.1, 'triangle', 0.08); tone(880, 0.14, 'triangle', 0.08, 0.07); },
  bad: () => tone(220, 0.25, 'sine', 0.08, 0, 0.7),
  ribbit: () => { tone(300, 0.07, 'sawtooth', 0.04, 0, 1.6); tone(320, 0.07, 'sawtooth', 0.04, 0.1, 1.6); },
  star: (k: number) => tone(784 * Math.pow(1.26, k), 0.3, 'triangle', 0.1, k * 0.18),
  discover: () => [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.25, 'sine', 0.08, k * 0.08)),
};
