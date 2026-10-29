// Soundtrack + encode for the store preview video (after tools/store-trailer.mjs).
// The sea, breeze, gulls and the plucked đàn-bầu-style melody are the game's own procedural audio
// (src/render/ambience.ts), rendered offline in Chromium and scored to the film's cuts; the sound
// effects copy src/render/audio.ts. Writes store/video/soundtrack.wav, then:
//   store/video/app-preview-886x1920.mp4    App Store preview (6.9"/6.7" iPhone), H.264 30 fps, AAC 256k
//   store/video/promo-1080x1920.mp4         Google Play / YouTube / socials
//   store/video/poster.jpg                  a still for the preview's poster frame
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { buildSync } = require('esbuild');
const dir = 'store/video';
const film = JSON.parse(readFileSync(`${dir}/cues.json`, 'utf8'));

const bundle = buildSync({ entryPoints: ['src/render/ambience.ts'], bundle: true, write: false, format: 'iife', globalName: 'AMB' }).outputFiles[0].text;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addScriptTag({ content: bundle });
const wavB64 = await page.evaluate(async ({ film }) => {
  const RATE = 48000;
  const T = film.seconds;
  const ctx = new OfflineAudioContext(2, Math.ceil(RATE * T), RATE);
  // seeded, so the same film always gets the same waves
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  // fade in from silence, out to silence
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.exponentialRampToValueAtTime(1, 1.2);
  master.gain.setValueAtTime(1, T - 1.0);
  master.gain.linearRampToValueAtTime(0, T);
  const amb = new AMB.Ambience(ctx, master, { sea: 0.75, music: 0 }, rand);
  amb.scheduleUntil(T);
  // the score: the game's own pluck, but written to the cut instead of wandering
  const music = ctx.createGain();
  music.gain.value = 2.4;
  music.connect(master);
  amb.music.disconnect();
  amb.music.connect(music);
  amb.music.gain.value = 1;
  const S = [146.83, 164.81, 196.0, 220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0];
  const shots = film.cues.filter((c) => c.type === 'shot').map((c) => c.t);
  const at = (n, beat) => shots[n] + beat * 0.42; // ~72 bpm in eighths
  const pluck = (t, i, v = 0.034, slide = false) => amb.pluck(t, S[i], v, slide);
  // 1 dawn: wistful, rising
  [[2, 5], [4, 6], [5, 7], [8, 6, 1], [9, 5], [11, 4]].forEach(([b, i, sl]) => pluck(at(0, b), i, 0.034, !!sl));
  // 2-3 the promise and the stopwatch: sparse, a question
  [[2, 4], [5, 5], [8, 7], [12, 6], [15, 5]].forEach(([b, i]) => pluck(at(1, b), i, 0.03));
  [[1, 5], [4, 3, 1], [8, 4]].forEach(([b, i, sl]) => pluck(at(3, b), i, 0.03, !!sl));
  // 4 fishing: lighter, moving (cast, then the fight)
  [[0, 7], [1, 8], [2, 9], [4, 8], [6, 7], [8, 8]].forEach(([b, i]) => pluck(at(4, b), i, 0.03));
  // the catch: a little fanfare in the same voice
  const caught = film.cues.find((c) => c.type === 'catch')?.t ?? shots[4] + 4;
  [[0, 9], [1, 10], [2, 11], [4, 10], [5, 11]].forEach(([b, i]) => pluck(caught + 0.3 + b * 0.21, i, 0.026));
  // 6 the island: the theme, home
  [[0, 7], [2, 8], [3, 9], [6, 8, 1], [8, 7], [10, 5], [12, 7], [14, 8]].forEach(([b, i, sl]) => pluck(at(6, b), i, 0.034, !!sl));
  // 7 market: quick and bright
  [[0, 10], [1, 11], [2, 12], [4, 11], [6, 10], [8, 12]].forEach(([b, i]) => pluck(at(7, b), i, 0.024));
  // 8 title: the home chord, slowly
  [[0, 0], [1, 5], [2, 7], [3, 8], [4, 10], [6, 12]].forEach(([b, i]) => pluck(at(8, b * 0.8), i, 0.036));

  // a warm bed under the score: D and A, swelling at the reveal and the title
  const pad = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  pad.connect(lp).connect(master);
  for (const [f, det] of [[73.42, 0], [110, 3], [146.83, -4], [220, 5]]) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(pad);
    o.start(0);
    o.stop(T);
  }
  const g = pad.gain;
  const reveal = film.cues.find((c) => c.type === 'reveal')?.t ?? T * 0.6;
  const title = film.cues.find((c) => c.type === 'title')?.t ?? T - 3;
  g.setValueAtTime(0.0001, 0);
  g.exponentialRampToValueAtTime(0.018, 3);
  g.linearRampToValueAtTime(0.013, reveal - 2.5);
  g.linearRampToValueAtTime(0.028, reveal + 0.3);
  g.linearRampToValueAtTime(0.015, reveal + 3);
  g.linearRampToValueAtTime(0.032, title + 1.2);
  g.linearRampToValueAtTime(0.0001, T);

  // sound effects (same recipes as src/render/audio.ts), on the film's cues
  const fx = ctx.createGain();
  fx.gain.value = 1.5;
  fx.connect(master);
  const tone = (t0, freq, dur, type = 'sine', vol = 0.15, slideTo) => {
    const o = ctx.createOscillator();
    const gg = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gg.gain.setValueAtTime(0.0001, t0);
    gg.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gg).connect(fx);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  };
  const noise = (t0, dur, vol = 0.2, freq = 1200) => {
    const len = Math.floor(RATE * dur);
    const buf = ctx.createBuffer(1, len, RATE);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const gg = ctx.createGain();
    gg.gain.value = vol;
    src.connect(f).connect(gg).connect(fx);
    src.start(t0);
  };
  const SFX = {
    cast: (t) => (noise(t, 0.25, 0.12, 3000), tone(t, 500, 0.25, 'sine', 0.05, 1200), noise(t + 0.9, 0.35, 0.2, 900)),
    bite: (t) => (noise(t, 0.2, 0.3, 1500), tone(t, 880, 0.12, 'square', 0.06, 440)),
    catch: (t) => (noise(t, 0.3, 0.2, 1200), [523, 659, 784].forEach((f, i) => tone(t + i * 0.07, f, 0.18, 'triangle', 0.1))),
    knock: (t, c) => (tone(t, 200 + c.n * 60, 0.12, 'sine', 0.22, 120 + c.n * 40), noise(t, 0.06, 0.15, 800)),
    reveal: (t) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.08, f, 0.3, 'triangle', 0.1)),
    sell: (t) => [784, 988, 1175].forEach((f, i) => tone(t + i * 0.05, f, 0.12, 'triangle', 0.07)),
    tap: (t) => tone(t, 660, 0.06, 'triangle', 0.06),
    beep: (t) => [0, 0.16].forEach((d) => tone(t + 0.25 + d, 1760, 0.07, 'square', 0.035)),
    chapter: (t) => (tone(t + 0.2, 146.83, 1.6, 'sine', 0.08), tone(t + 0.2, 293.66, 1.2, 'triangle', 0.03)),
    title: (t) => tone(t + 0.4, 73.42, 2.5, 'sine', 0.1),
  };
  for (const c of film.cues) SFX[c.type]?.(c.t, c);

  const out = await ctx.startRendering();
  // 16-bit stereo WAV
  const n = out.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 4, true);
  const L = out.getChannelData(0);
  const R = out.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = peak > 0.89 ? 0.89 / peak : 1;
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * k)) * 32767, true);
    v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * k)) * 32767, true);
  }
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}, { film });
await browser.close();
writeFileSync(`${dir}/soundtrack.wav`, Buffer.from(wavB64, 'base64'));
console.log('soundtrack.wav', film.seconds.toFixed(2), 's');

const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const input = ['-framerate', String(film.fps), '-i', `${dir}/frames/%05d.jpg`, '-i', `${dir}/soundtrack.wav`];
const enc = ['-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '17', '-r', String(film.fps), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart'];
const [w, h] = film.width >= 886 ? [886, 1920] : [film.width, film.height];
ff([...input, '-vf', `scale=${w}:${h}:flags=lanczos,setsar=1`, ...enc, `${dir}/app-preview-886x1920.mp4`]);
ff([...input, '-vf', 'scale=1080:1920:flags=lanczos,setsar=1', ...enc, `${dir}/promo-1080x1920.mp4`]);
const posterFrame = film.cues.find((c) => c.type === 'reveal')?.t ?? 18;
ff(['-ss', String(posterFrame + 1.6), '-i', `${dir}/app-preview-886x1920.mp4`, '-frames:v', '1', '-q:v', '2', `${dir}/poster.jpg`]);
console.log('encoded', `${dir}/app-preview-886x1920.mp4`, `${dir}/promo-1080x1920.mp4`);
