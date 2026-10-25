// iOS / Android app glue (Capacitor). Loaded only inside the native app (see main.ts); the web build
// and the claude.ai playtest never fetch it.
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { analytics } from '../core/analytics';
import { saveState } from '../core/save';
import { setVibrator } from '../render/audio';
import type { Game } from '../game';
import { backAction } from './back';

export interface NativeHooks {
  /** Run the island staff for the time the app was in the background, and say what they made. */
  welcomeBack(): void;
}

/** A web vibration pattern ([on, off, on, ...] ms) as taps of matching strength. */
function haptic(ms: number | number[]): void {
  const pattern = Array.isArray(ms) ? ms : [ms];
  let at = 0;
  pattern.forEach((d, i) => {
    if (i % 2 === 0) {
      const style = d < 15 ? ImpactStyle.Light : d < 45 ? ImpactStyle.Medium : ImpactStyle.Heavy;
      setTimeout(() => void Haptics.impact({ style }).catch(() => undefined), at);
    }
    at += d;
  });
}

export async function initNative(game: Game, hooks: NativeHooks): Promise<void> {
  const platform = (window as unknown as { Capacitor: { getPlatform(): string } }).Capacitor.getPlatform();
  analytics.track('native_start', { platform });
  setVibrator(haptic);
  // a game screen: no clock or battery bar over the HUD (safe areas still keep the notch clear)
  void StatusBar.hide().catch(() => undefined);

  void App.addListener('backButton', () => {
    const action = backAction(game.scene.name, game.overlays.map((o) => o.name));
    if (action === 'close_overlay') game.pop();
    else if (action === 'go_village') game.goVillage();
    else if (action === 'exit') void App.minimizeApp(); // keeps running; staff keep working
  });

  // Phones kill background apps without warning: save the moment we leave.
  void App.addListener('pause', () => {
    saveState(game.state);
    void game.account?.flush();
  });
  void App.addListener('resume', () => hooks.welcomeBack());

  // Sign-in (Google / Apple / Facebook) comes back through com.mamvillage.app://auth/callback
  const onLink = (url: string) => {
    if (url.startsWith('com.mamvillage.app://auth')) void game.account?.finishNativeSignIn(url);
  };
  void App.addListener('appUrlOpen', ({ url }) => onLink(url));
  // the phone may have closed the app while the player was in the browser
  const launch = await App.getLaunchUrl().catch(() => undefined);
  if (launch?.url) onLink(launch.url);
}
