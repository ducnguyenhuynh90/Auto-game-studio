// Cloud backup with Supabase, the same project, tables and rules as the web game (supabase/migrations).
// On only when the build has EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Every player is
// signed in anonymously on first launch, so progress is backed up from minute one; the save merge rules
// are the web game's (src/auth/merge.ts). Settings can delete the account (App Store / Google Play rule).
// Google / Apple sign-in *links* to that anonymous account (same user id, same save), so the save follows
// the player to another phone or the web game. The provider page opens in the system browser (Google
// refuses embedded web views) and comes back by deep link with a one-time code (PKCE).
import { AppState, Platform } from 'react-native';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { analytics } from '@core/analytics';
import { levelForXp } from '@core/progression';
import { loadFromBlob, loadState, resetSave, setOnSaved } from '@core/save';
import type { GameState } from '@core/state';
import { makeBackend, nameOf, providerOf, type CloudBackend, type DbLike, type SocialProvider } from '@web/auth/cloudsave';
import { chooseSave, isFresh, type SaveBlob } from '@web/auth/merge';
import { game } from './store';

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const FLUSH_MS = 15_000;
/** Must be listed in Supabase → Auth → URL Configuration → Redirect URLs (docs/STORE_RELEASE.md). */
export const APP_REDIRECT = 'com.mamvillage.rn://auth/callback';

export type SignInProvider = Extract<SocialProvider, 'google' | 'apple'>;

/** Reads the provider's answer: ?code=… on success, error / error_code (query or #fragment) otherwise. */
export function readCallback(url: string): { code: string | null; error: string | null; errorCode: string | null } {
  const u = new URL(url);
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
  const get = (k: string) => u.searchParams.get(k) ?? hash.get(k);
  return { code: get('code'), error: get('error_description') ?? get('error'), errorCode: get('error_code') };
}

export function describeSave(s: GameState): string {
  return isFresh(s) ? 'New game' : `Captain Lv ${levelForXp(s.xp)} · ${s.stats.catches} fish · ${s.relics.length} relics`;
}

class Cloud {
  readonly configured = !!URL_ && !!KEY;
  /** One line for Settings: what the backup is doing. */
  status = '';
  lastSynced = 0;
  busy = false;
  /** Two different saves with progress: Settings asks which to keep. */
  conflict: { local: SaveBlob; cloud: SaveBlob } | null = null;
  /** The social account this player signed in with (null: anonymous backup only). */
  provider: SocialProvider | null = null;
  name = 'Guest';
  private client: SupabaseClient | null = null;
  private backend: CloudBackend | null = null;
  private dirty = false;
  private writing = false;

  get connected(): boolean {
    return !!this.backend;
  }

  private sb(): SupabaseClient {
    if (!this.client) {
      // Hermes' URL is incomplete; supabase-js needs the full one
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      if (Platform.OS !== 'web') require('react-native-url-polyfill/auto');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
      // the session lives in the same SQLite-backed localStorage as the save
      this.client = createClient(URL_, KEY, { auth: { storage: localStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' } });
    }
    return this.client;
  }

  /** Signs in (anonymously the first time) and settles which save wins. Never blocks play. */
  async start(): Promise<void> {
    if (!this.configured || this.backend) return;
    setOnSaved(() => (this.dirty = true));
    setInterval(() => void this.flush(), FLUSH_MS);
    AppState.addEventListener('change', (st) => st !== 'active' && void this.flush());
    this.set('Connecting…');
    try {
      const auth = this.sb().auth;
      let { data } = await auth.getSession();
      if (!data.session) {
        const res = await auth.signInAnonymously();
        if (res.error || !res.data.session) throw new Error(res.error?.message ?? 'no session');
        data = { session: res.data.session };
      }
      this.attach(data.session!.user);
      await this.merge();
    } catch {
      this.backend = null;
      this.set('Cloud backup unavailable right now. Playing on this device.');
    }
  }

  /** This user's save becomes the backup target; their profile row says who they are. */
  private attach(user: User): void {
    this.provider = providerOf(user);
    this.name = this.provider ? nameOf(user) : 'Guest';
    void this.sb()
      .from('profiles')
      .upsert({ id: user.id, display_name: this.name.slice(0, 40), provider: this.provider ?? 'anonymous', last_seen: new Date().toISOString() }, { onConflict: 'id' })
      .then(
        () => undefined,
        () => undefined,
      );
    this.backend = makeBackend(this.sb() as unknown as DbLike, user.id, () => this.sb().auth.signOut().then(() => undefined));
  }

  private redirect(): string {
    // the browser test build signs in through a popup that comes back to the page itself (index.web.ts)
    return Platform.OS === 'web' ? `${location.origin}/` : APP_REDIRECT;
  }

  /** Opens the provider's page and returns where it sent the player back to (null: closed / cancelled). */
  private async browse(url: string): Promise<string | null> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WebBrowser = require('expo-web-browser') as typeof import('expo-web-browser');
    const res = await WebBrowser.openAuthSessionAsync(url, this.redirect());
    return res.type === 'success' ? res.url : null;
  }

  /**
   * Google / Apple. From the anonymous account it links the identity (same user, same save). If that
   * Google / Apple account already has its own save (made on the web or another phone), it signs in to
   * that account instead and the usual merge rules decide, asking the player when both have progress.
   */
  async signIn(p: SignInProvider): Promise<void> {
    if (!this.configured || this.busy) return;
    this.busy = true;
    this.set('Signing in…');
    analytics.track('login_start', { provider: p, app: 'react-native' });
    try {
      await this.flush(); // the latest progress goes up before anything changes
      const auth = this.sb().auth;
      const before = (await auth.getSession()).data.session?.user ?? null;
      const options = { redirectTo: this.redirect(), skipBrowserRedirect: true };
      let back: string | null = null;
      let cb: ReturnType<typeof readCallback> | null = null;
      if (before?.is_anonymous) {
        const linked = await auth.linkIdentity({ provider: p, options });
        if (!linked.error && linked.data.url) {
          back = await this.browse(linked.data.url);
          if (!back) return this.cancelled(p);
          cb = readCallback(back);
        }
      }
      if (!cb?.code) {
        // not anonymous, or this Google / Apple account already belongs to another player record
        const res = await auth.signInWithOAuth({ provider: p, options });
        if (res.error || !res.data.url) throw new Error(res.error?.message ?? 'no sign-in page');
        back = await this.browse(res.data.url);
        if (!back) return this.cancelled(p);
        cb = readCallback(back);
      }
      if (!cb.code) throw new Error(cb.errorCode ?? cb.error ?? 'no code');
      const ex = await auth.exchangeCodeForSession(cb.code);
      if (ex.error || !ex.data.session) throw new Error(ex.error?.message ?? 'no session');
      const user = ex.data.session.user;
      this.attach(user);
      analytics.track('login', { provider: p, linked: before?.id === user.id, app: 'react-native' });
      if (before?.id === user.id) {
        this.dirty = true;
        await this.flush();
        this.set(`Signed in with ${label(p)}. Your progress is saved to your account.`);
        game.toast(`Signed in, ${this.name}!`, '#3a8fd9', 'Your progress follows you to any phone');
      } else {
        await this.merge('social');
      }
    } catch (e) {
      analytics.track('login_failed', { provider: p, code: String((e as Error)?.message ?? 'unknown').slice(0, 60), app: 'react-native' });
      this.set('Sign-in did not finish. Please try again.');
    } finally {
      this.busy = false;
      game.changed();
    }
  }

  private cancelled(p: SignInProvider): void {
    analytics.track('login_cancel', { provider: p, app: 'react-native' });
    this.set('Sign-in cancelled.');
  }

  /** Back to an anonymous backup; the progress stays on this phone. */
  async signOut(): Promise<void> {
    if (!this.backend || this.busy) return;
    this.busy = true;
    try {
      await this.flush();
      await this.sb()
        .auth.signOut()
        .catch(() => undefined);
      this.backend = null;
      this.provider = null;
      this.name = 'Guest';
      analytics.track('logout', { app: 'react-native' });
      await this.restart();
      this.set('Signed out. Your progress stays on this phone.');
    } finally {
      this.busy = false;
    }
  }

  private async merge(kind: 'anonymous' | 'social' = 'anonymous'): Promise<void> {
    const s = game.state;
    const local: SaveBlob = { state: s, savedAt: s.savedAt ?? 0 };
    const cloud = await this.backend!.load();
    const choice = chooseSave(local, cloud);
    analytics.track('cloud_merge', { choice, kind, app: 'react-native' });
    if (choice === 'cloud' && cloud) this.useCloud(cloud);
    else if (choice === 'ask' && cloud) {
      this.conflict = { local, cloud };
      game.toast('Two saves found', '#a35bd6', 'Open Settings (⚙) to choose one');
    } else {
      this.dirty = true;
      await this.flush();
    }
    this.set(this.conflict ? 'Choose which save to keep.' : this.provider ? `Signed in with ${label(this.provider)}.` : 'Backed up to the cloud.');
  }

  private useCloud(cloud: SaveBlob): void {
    game.replaceState(loadFromBlob(cloud.state));
    this.lastSynced = Date.now();
    game.toast('Cloud save loaded', '#3a8fd9', `Welcome back, ${this.name}!`);
  }

  async resolveConflict(keep: 'local' | 'cloud'): Promise<void> {
    const c = this.conflict;
    if (!c) return;
    this.conflict = null;
    analytics.track('cloud_conflict', { keep, app: 'react-native' });
    if (keep === 'cloud') this.useCloud(c.cloud);
    else {
      this.dirty = true;
      await this.flush();
    }
    this.set('Backed up to the cloud.');
  }

  /** Uploads the save if it changed (every 15 s at most, and when the app goes to the background). */
  async flush(): Promise<void> {
    if (!this.backend || !this.dirty || this.writing || this.conflict) return;
    this.writing = true;
    this.dirty = false;
    const s = game.state;
    try {
      await this.backend.save({ state: s, savedAt: s.savedAt ?? Date.now() });
      this.lastSynced = Date.now();
    } catch {
      this.dirty = true; // next tick
    } finally {
      this.writing = false;
    }
  }

  /** Deletes the account, its cloud save and this phone's save; the game starts over. */
  async deleteAccount(): Promise<boolean> {
    if (!this.backend || this.busy) return false;
    this.busy = true;
    this.set('Deleting…');
    try {
      const { error } = await this.sb().rpc('delete_my_account');
      if (error) throw new Error(error.message);
      await this.sb()
        .auth.signOut()
        .catch(() => undefined);
      this.backend = null;
      this.conflict = null;
      this.dirty = false;
      this.provider = null;
      this.name = 'Guest';
      analytics.track('account_deleted', { app: 'react-native' });
      resetSave();
      game.replaceState(loadState());
      this.set('Account and cloud save deleted.');
      // a fresh anonymous account backs up the new game
      void this.restart();
      return true;
    } catch {
      this.set('Could not delete right now. Check your connection and try again.');
      return false;
    } finally {
      this.busy = false;
    }
  }

  private async restart(): Promise<void> {
    const auth = this.sb().auth;
    const res = await auth.signInAnonymously().catch(() => null);
    if (!res || res.error || !res.data.session) return;
    this.attach(res.data.session.user);
    this.dirty = true;
  }

  private set(status: string): void {
    this.status = status;
    game.changed();
  }
}

export const cloud = new Cloud();
// browser QA only (web build): the services bot reads the backup status
if (Platform.OS === 'web') (globalThis as unknown as { __mamCloud?: Cloud }).__mamCloud = cloud;

function label(p: SocialProvider): string {
  return p === 'google' ? 'Google' : p === 'apple' ? 'Apple' : 'Facebook';
}
