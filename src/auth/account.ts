// Accounts and cloud save. Guest play is always the default; signing in only adds cloud backup
// and cross-device play. Two backends:
//  - claude.ai account: automatic inside the claude.ai playtest page (artifact store, private per player)
//  - Google / Apple / Facebook via Firebase: self-hosted builds with VITE_FIREBASE_* config
// We store the game save and a display name. Never email or contacts.
import { analytics } from '../core/analytics';
import { setOnSaved } from '../core/save';
import type { GameState } from '../core/state';
import { levelForXp } from '../core/progression';
import { chooseSave, isFresh, type SaveBlob } from './merge';

export type SocialProvider = 'google' | 'apple' | 'facebook';

export interface AccountInfo {
  kind: 'guest' | 'claude' | 'social';
  provider?: SocialProvider;
  name: string;
}

export interface CloudBackend {
  load(): Promise<SaveBlob | null>;
  save(blob: SaveBlob): Promise<void>;
  signOut?(): Promise<void>;
}

/** Injected at build time: true only for self-hosted builds that have Firebase config. */
declare const __FIREBASE__: boolean;

interface Host {
  use(name: string): Promise<unknown>;
}

export interface AccountHooks {
  getState(): GameState;
  /** Replace the running game state (after picking the cloud save). */
  replaceState(s: GameState): void;
  toast(msg: string, sub?: string): void;
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
    return __FIREBASE__ ? ['google', 'apple', 'facebook'] : [];
  }

  /** Warm the Firebase chunk when Settings opens, so a sign-in tap opens its popup instantly
   * (browsers block popups opened too long after the tap). */
  prepareSocial(): void {
    if (__FIREBASE__) void import('./firebase');
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
    // Only returning social players pay for loading the Firebase SDK at boot.
    if (__FIREBASE__ && hasSocialSession()) {
      const fb = await import('./firebase');
      const restored = await fb.restoreSession();
      if (restored) await this.connect(restored.backend, { kind: 'social', provider: restored.provider, name: restored.name });
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
