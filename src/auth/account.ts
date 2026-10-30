// Accounts and cloud save. Guest play is always the default; signing in only adds cloud backup
// and cross-device play. Backends:
//  - claude.ai account: automatic inside the claude.ai playtest page (artifact store, private per player)
//  - Supabase: self-hosted builds with VITE_SUPABASE_*; every player is backed up from the first launch
//    (anonymous account), and Google / Apple / Facebook can be linked to the same account later
//  - Firebase (older alternative): self-hosted builds with VITE_FIREBASE_* and no Supabase config
// We store the game save, a display name and the sign-in method. Never contacts or location.
import { analytics } from '../core/analytics';
import { setOnSaved } from '../core/save';
import type { GameState } from '../core/state';
import { levelForXp } from '../core/progression';
import { chooseSave, isFresh, type SaveBlob } from './merge';

export type { SocialProvider } from './cloudsave';
import type { SocialProvider } from './cloudsave';

export interface AccountInfo {
  /** 'cloud' = a backed-up guest (Supabase anonymous account) that can still link a social login. */
  kind: 'guest' | 'cloud' | 'claude' | 'social';
  provider?: SocialProvider;
  name: string;
}

export type { CloudBackend } from './cloudsave';
import type { CloudBackend } from './cloudsave';

/** Injected at build time: true only for self-hosted builds that have Firebase / Supabase config. */
declare const __FIREBASE__: boolean;
declare const __SUPABASE__: boolean;

interface Host {
  use(name: string): Promise<unknown>;
}

export interface AccountHooks {
  getState(): GameState;
  /** Replace the running game state (after picking the cloud save). */
  replaceState(s: GameState): void;
  toast(msg: string, sub?: string): void;
  /** Wipe this device's save and start a new game (after account deletion). */
  resetLocal?(): void;
}

export class AccountManager {
  info: AccountInfo = { kind: 'guest', name: 'Guest' };
  /** Two real saves disagree: the Settings screen asks the player which to keep. */
  conflict: { local: SaveBlob; cloud: SaveBlob } | null = null;
  status = '';
  lastSynced = 0;
  busy = false;
  private backend: CloudBackend | null = null;
  private dirty = false;
  private writing = false;

  constructor(private hooks: AccountHooks) {
    setOnSaved(() => {
      this.dirty = true;
    });
    setInterval(() => void this.flush(), 15000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.flush();
    });
  }

  /** Social sign-in buttons to show (empty when this build has no Firebase config). */
  get socialProviders(): SocialProvider[] {
    return __SUPABASE__ || __FIREBASE__ ? ['google', 'apple', 'facebook'] : [];
  }

  /** True when progress is already backed up but no social login is linked yet. */
  get canLink(): boolean {
    return this.info.kind === 'cloud';
  }

  /** Warm the Firebase chunk when Settings opens, so a sign-in tap opens its popup instantly
   * (browsers block popups opened too long after the tap). */
  prepareSocial(): void {
    if (__SUPABASE__) void import('./supabase');
    else if (__FIREBASE__) void import('./firebase');
  }

  /** Friends, invites and leaderboards: Supabase builds with a working (guest or social) account. */
  get social(): boolean {
    return __SUPABASE__ && !!this.backend && (this.info.kind === 'cloud' || this.info.kind === 'social');
  }

  /** The friends API (auth/social.ts), loaded on first use; null when this build or session has none. */
  async socialApi(): Promise<typeof import('./social') | null> {
    if (!__SUPABASE__ || !this.social) return null;
    return import('./social');
  }

  get signedIn(): boolean {
    return this.info.kind !== 'guest';
  }

  /** Silent sign-in at boot: claude.ai identity inside the playtest page, or a remembered social session. */
  async init(): Promise<void> {
    const host = (window as unknown as { claude?: Host }).claude;
    if (host?.use) {
      const ok = await this.tryClaude(host).catch(() => false);
      if (ok) return;
    }
    if (__SUPABASE__) {
      await this.connectSupabase();
      return;
    }
    // Only returning social players pay for loading the Firebase SDK at boot.
    if (__FIREBASE__ && hasSocialSession()) {
      const fb = await import('./firebase');
      const restored = await fb.restoreSession();
      if (restored) await this.connect(restored.backend, { kind: 'social', provider: restored.provider, name: restored.name });
    }
  }

  /** Every player gets a backed-up account (anonymous until they link a social login). */
  private async connectSupabase(): Promise<void> {
    if (!__SUPABASE__) return;
    if (__SUPABASE__) {
      const sb = await import('./supabase');
      const session = await sb.startSession().catch(() => null);
      if (!session) {
        this.status = 'Cloud save unavailable right now. Playing on this device.';
        return;
      }
      await this.connect(session.backend, session.provider ? { kind: 'social', provider: session.provider, name: session.name } : { kind: 'cloud', name: 'Guest' });
      if (session.provider) setSocialSession(true);
    }
  }

  /** iOS / Android: the sign-in deep link reopened the app (src/native/index.ts). */
  async finishNativeSignIn(link: string): Promise<void> {
    // the flag must guard the import itself, or builds without Supabase still bundle it
    if (__SUPABASE__) {
      const sb = await import('./supabase');
      const ok = await sb.finishNativeSignIn(link).catch(() => false);
      if (!ok) {
        this.status = 'Sign-in did not finish. Please try again.';
        analytics.track('login_failed', { provider: 'native', code: 'no_code' });
        return;
      }
      await this.connectSupabase();
      if (this.info.kind === 'social') {
        analytics.track('login', { provider: this.info.provider ?? 'unknown' });
        this.hooks.toast('Account linked', `Your village now follows you, ${this.info.name}.`);
      }
    }
  }

  /** Accounts that can be deleted from inside the game (App Store / Google Play rule). */
  get canDelete(): boolean {
    return __SUPABASE__ && !!this.backend;
  }

  /** Deletes the account, its cloud save and this device's save; the game starts fresh. */
  async deleteAccount(): Promise<boolean> {
    if (!__SUPABASE__ || !this.canDelete || this.busy) return false;
    this.busy = true;
    try {
      if (__SUPABASE__) {
        const sb = await import('./supabase');
        await sb.deleteAccount();
      }
      setSocialSession(false);
      this.backend = null;
      this.dirty = false;
      this.info = { kind: 'guest', name: 'Guest' };
      this.status = 'Account and cloud save deleted.';
      analytics.track('account_deleted');
      this.hooks.resetLocal?.();
      return true;
    } catch {
      this.status = 'Could not delete right now. Check your connection and try again.';
      return false;
    } finally {
      this.busy = false;
    }
  }

  private async tryClaude(host: Host): Promise<boolean> {
    const [db, user] = (await Promise.all([host.use('db'), host.use('user')])) as [
      { doc(p: string): { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> } } | null,
      { id(): Promise<string | null>; me(): Promise<{ name: string }> } | null,
    ];
    const id = await user?.id();
    if (!db || !user || !id) return false;
    const ref = db.doc(`data/users/${id}/save`);
    const name = (await user.me()).name || 'Claude account';
    const backend: CloudBackend = {
      async load() {
        const snap = await ref.get();
        const d = snap.exists ? snap.data() : undefined;
        if (!d || typeof d.state !== 'string') return null;
        return { state: JSON.parse(d.state) as GameState, savedAt: Number(d.savedAt ?? 0) };
      },
      async save(b) {
        await ref.set({ state: JSON.stringify(b.state), savedAt: b.savedAt });
      },
    };
    await this.connect(backend, { kind: 'claude', name });
    return true;
  }

  async signIn(provider: SocialProvider): Promise<void> {
    if (__SUPABASE__) {
      if (this.busy) return;
      this.busy = true;
      this.status = 'Opening sign-in…';
      await this.flush(); // the page leaves for the provider: save first
      try {
        const sb = await import('./supabase');
        analytics.track('login_start', { provider, link: this.canLink });
        await sb.signIn(provider); // redirects; startSession() finishes it when the page comes back
      } catch (e) {
        this.status = 'Sign-in did not finish. Please try again.';
        analytics.track('login_failed', { provider, code: String((e as { message?: string })?.message ?? 'unknown').slice(0, 60) });
      } finally {
        this.busy = false;
      }
      return;
    }
    if (!__FIREBASE__ || this.busy) return;
    this.busy = true;
    this.status = 'Signing in…';
    try {
      const fb = await import('./firebase');
      const res = await fb.signIn(provider);
      await this.connect(res.backend, { kind: 'social', provider, name: res.name });
      setSocialSession(true);
      analytics.track('login', { provider });
    } catch (e) {
      this.status = 'Sign-in did not finish. Please try again.';
      analytics.track('login_failed', { provider, code: String((e as { code?: string })?.code ?? 'unknown').slice(0, 60) });
    } finally {
      this.busy = false;
    }
  }

  async signOut(): Promise<void> {
    await this.flush();
    await this.backend?.signOut?.();
    setSocialSession(false);
    this.backend = null;
    this.info = { kind: 'guest', name: 'Guest' };
    this.status = 'Signed out. Your progress stays on this device.';
    analytics.track('logout');
  }

  private async connect(backend: CloudBackend, info: AccountInfo): Promise<void> {
    this.backend = backend;
    this.info = info;
    const s = this.hooks.getState();
    const local: SaveBlob = { state: s, savedAt: s.savedAt ?? 0 };
    let cloud: SaveBlob | null = null;
    try {
      cloud = await backend.load();
    } catch {
      this.status = 'Cloud save unavailable right now. Playing on this device.';
      return;
    }
    const choice = chooseSave(local, cloud);
    analytics.track('cloud_merge', { choice, kind: info.kind });
    if (choice === 'cloud' && cloud) this.useCloud(cloud);
    else if (choice === 'ask' && cloud) this.conflict = { local, cloud };
    else {
      this.dirty = true;
      await this.flush();
    }
    this.status = '';
  }

  private useCloud(cloud: SaveBlob): void {
    this.hooks.replaceState(cloud.state);
    this.lastSynced = Date.now();
    this.hooks.toast('Cloud save loaded', `Welcome back, ${this.info.name}!`);
  }

  /** Player picked which save to keep after a conflict. */
  async resolveConflict(keep: 'local' | 'cloud'): Promise<void> {
    const c = this.conflict;
    if (!c) return;
    this.conflict = null;
    analytics.track('cloud_conflict', { keep });
    if (keep === 'cloud') this.useCloud(c.cloud);
    else {
      this.dirty = true;
      await this.flush();
    }
  }

  /** Upload the current state if it changed (at most every 15 s, and when the app goes to background). */
  async flush(): Promise<void> {
    if (!this.backend || !this.dirty || this.writing || this.conflict) return;
    this.writing = true;
    this.dirty = false;
    const s = this.hooks.getState();
    try {
      await this.backend.save({ state: s, savedAt: s.savedAt ?? Date.now() });
      this.lastSynced = Date.now();
    } catch {
      this.dirty = true; // retry on the next tick
    } finally {
      this.writing = false;
    }
  }

  /** For the conflict dialog: how far each save got. */
  static describe(s: GameState): string {
    return isFresh(s) ? 'New game' : `Captain Lv ${levelForXp(s.xp)} · ${s.stats.catches} fish · ${s.relics.length} relics`;
  }
}

const SOCIAL_KEY = 'mam_social';
function hasSocialSession(): boolean {
  try {
    return localStorage.getItem(SOCIAL_KEY) === '1';
  } catch {
    return false;
  }
}
function setSocialSession(on: boolean): void {
  try {
    if (on) localStorage.setItem(SOCIAL_KEY, '1');
    else localStorage.removeItem(SOCIAL_KEY);
  } catch {
    /* ignore */
  }
}
