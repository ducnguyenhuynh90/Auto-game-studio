// Cloud backup with Supabase, the same project, tables and rules as the web game (supabase/migrations).
// On only when the build has EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Every player is
// signed in anonymously on first launch, so progress is backed up from minute one; the save merge rules
// are the web game's (src/auth/merge.ts). Settings can delete the account (App Store / Google Play rule).
// Google / Apple sign-in to move a save between phones comes later (docs/REACT_NATIVE.md).
import { AppState, Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { analytics } from '@core/analytics';
import { levelForXp } from '@core/progression';
import { loadFromBlob, loadState, resetSave, setOnSaved } from '@core/save';
import type { GameState } from '@core/state';
import { makeBackend, type CloudBackend, type DbLike } from '@web/auth/cloudsave';
import { chooseSave, isFresh, type SaveBlob } from '@web/auth/merge';
import { game } from './store';

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const FLUSH_MS = 15_000;

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
      this.client = createClient(URL_, KEY, { auth: { storage: localStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
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
      const user = data.session!.user;
      void this.sb()
        .from('profiles')
        .upsert({ id: user.id, display_name: 'Guest', provider: 'anonymous', last_seen: new Date().toISOString() }, { onConflict: 'id' })
        .then(
          () => undefined,
          () => undefined,
        );
      this.backend = makeBackend(this.sb() as unknown as DbLike, user.id, () => this.sb().auth.signOut().then(() => undefined));
      await this.merge();
    } catch {
      this.backend = null;
      this.set('Cloud backup unavailable right now. Playing on this device.');
    }
  }

  private async merge(): Promise<void> {
    const s = game.state;
    const local: SaveBlob = { state: s, savedAt: s.savedAt ?? 0 };
    const cloud = await this.backend!.load();
    const choice = chooseSave(local, cloud);
    analytics.track('cloud_merge', { choice, kind: 'anonymous', app: 'react-native' });
    if (choice === 'cloud' && cloud) this.useCloud(cloud);
    else if (choice === 'ask' && cloud) {
      this.conflict = { local, cloud };
      game.toast('Two saves found', '#a35bd6', 'Open Settings (⚙) to choose one');
    } else {
      this.dirty = true;
      await this.flush();
    }
    this.set(this.conflict ? 'Choose which save to keep.' : 'Backed up to the cloud.');
  }

  private useCloud(cloud: SaveBlob): void {
    game.replaceState(loadFromBlob(cloud.state));
    this.lastSynced = Date.now();
    game.toast('Cloud save loaded', '#3a8fd9', 'Welcome back!');
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
    this.backend = makeBackend(this.sb() as unknown as DbLike, res.data.session.user.id, () => auth.signOut().then(() => undefined));
    this.dirty = true;
  }

  private set(status: string): void {
    this.status = status;
    game.changed();
  }
}

export const cloud = new Cloud();
