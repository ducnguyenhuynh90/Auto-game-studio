// What the game needs from the platform it runs on. The browser defaults are here; the native app
// (mobile/, React Native) replaces them at start-up with setPlatform() before the game boots.
// Keep this small: the game itself is the same everywhere.

export interface ShareFile {
  /** PNG bytes as base64 (no data: prefix). */
  base64: string;
  name: string;
}

export interface Platform {
  /** 'web' (browser or the claude.ai playtest), 'android' or 'ios' (the app). */
  name: 'web' | 'android' | 'ios';
  /** True inside the iOS / Android app. */
  native: boolean;
  /** The app's own link scheme for sign-in and invites (null on the web). */
  appScheme: string | null;
  /** Open a sign-in page in the system browser; resolves when the browser is closed or returns. */
  openAuthBrowser?(url: string, returnUrl: string): Promise<string | null>;
  /** The phone's share sheet. Returns false when there is none (the caller falls back). */
  share?(o: { title: string; text: string; url: string; file?: ShareFile }): Promise<boolean>;
  /** Copy text to the clipboard. */
  copy?(text: string): Promise<boolean>;
  /** Ask the player for a short text (a name, a friend code); null when cancelled. */
  ask?(o: { title: string; placeholder?: string; initial?: string; maxLength?: number; autocapitalize?: string; ok?: string }): Promise<string | null>;
  /** Open a web page (privacy policy) outside the game. */
  openUrl?(url: string): void;
  /** A new offscreen 2D canvas (the app has no DOM: it hands out Skia-backed canvases). */
  makeCanvas(): HTMLCanvasElement;
  /** The player's language, e.g. 'vi-VN'. */
  language(): string;
}

export const platform: Platform = {
  name: 'web',
  native: false,
  appScheme: null,
  makeCanvas: () => document.createElement('canvas'),
  language: () => (typeof navigator !== 'undefined' && navigator.language) || 'en',
};

export function setPlatform(p: Partial<Platform>): void {
  Object.assign(platform, p);
}
