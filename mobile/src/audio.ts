// Sound: the web game's own engine (src/render/audio.ts: effects, the beach ambience in ambience.ts, and
// the remembered Sound / Music switches) running on react-native-audio-api, which implements the Web
// Audio API on iOS and Android. On the web build the browser's AudioContext is used as is.
import { AppState, Platform } from 'react-native';
import { AudioContext as NativeAudioContext } from 'react-native-audio-api';

if (Platform.OS !== 'web' && !(globalThis as { AudioContext?: unknown }).AudioContext) (globalThis as { AudioContext?: unknown }).AudioContext = NativeAudioContext;

// required after the global is in place (a plain require keeps the order)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const audio = require('@web/render/audio') as typeof import('@web/render/audio');

export const { sfx, isMuted, setMuted, isMusicOn, setMusic } = audio;

let started = false;
/** Browsers only allow sound after a touch, so the first touch anywhere starts it (phones too). */
export function startAudio(): void {
  if (started) return;
  started = true;
  audio.unlockAudio();
}

// the sea goes quiet in the background and comes back with the app
AppState.addEventListener('change', (st) => {
  if (started && st === 'active') audio.unlockAudio();
});
