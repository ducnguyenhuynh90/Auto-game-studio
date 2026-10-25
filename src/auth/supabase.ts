// Supabase: player accounts and cloud saves for self-hosted builds (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY).
// Every player gets a user on first launch (anonymous sign-in), so progress is backed up from minute one.
// Linking Google / Apple / Facebook keeps the same user id: the save then follows them to any device.
// Tables and row-level security: supabase/migrations/*.sql. Lazy-loaded (only builds with config fetch it).
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { levelForXp } from '../core/progression';
import type { GameState } from '../core/state';
import type { CloudBackend, SocialProvider } from './account';

/** The small part of the Supabase client this module uses (lets tests pass a fake). */
export interface DbLike {
  from(table: string): {
    select(cols: string): { eq(col: string, v: string): { maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }> } };
    upsert(row: Record<string, unknown>, opts?: { onConflict?: string }): PromiseLike<{ error: { message: string } | null }>;
  };
}

/** Progress summary written next to the save, so support and dashboards don't need to parse it. */
export function progressRow(s: GameState): Record<string, unknown> {
  const islandLevel = 1 + Math.floor(Math.max(0, (s.island?.owned.length ?? 6) - 6) / 3) + Math.floor((s.island?.buildings ?? []).reduce((a, b) => a + b.level, 0) / 3);
  return {
    captain_level: levelForXp(s.xp),
    coins: Math.round(s.coins),
    catches: s.stats.catches,
    sea: s.sea,
    relics: s.relics.length,
    island_level: islandLevel,
    brand_level: s.brand?.level ?? 0,
  };
}

/** Cloud save in public.saves (one row per player). */
export function makeBackend(db: DbLike, userId: string, signOut?: () => Promise<void>): CloudBackend {
  return {
    async load() {
      const { data, error } = await db.from('saves').select('state, saved_at').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data || typeof data.state !== 'object' || !data.state) return null;
      return { state: data.state as GameState, savedAt: Date.parse(String(data.saved_at)) || 0 };
    },
    async save(b) {
      const { error } = await db.from('saves').upsert(
        {
          user_id: userId,
          state: b.state,
          save_id: b.state.saveId ?? null,
          rev: b.state.rev ?? 0,
          saved_at: new Date(b.savedAt || Date.now()).toISOString(),
          ...progressRow(b.state),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw new Error(error.message);
    },
    signOut,
  };
}

/** Inside the iOS / Android app (Capacitor): sign-in runs in the system browser and returns by deep link. */
const isNative = () => !!(window as unknown as { Capacitor?: { isNativePlatform?(): boolean } }).Capacitor?.isNativePlatform?.();
/** Must be listed under Auth → URL Configuration → Redirect URLs (docs/NATIVE.md). */
export const NATIVE_REDIRECT = 'com.mamvillage.app://auth/callback';

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    // the app gets a one-time code back (PKCE); the web page gets the session in its URL
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !isNative(), flowType: isNative() ? 'pkce' : 'implicit' },
  });
  return client;
}

const PROVIDERS: SocialProvider[] = ['google', 'apple', 'facebook'];

function providerOf(u: User): SocialProvider | null {
  const linked = (u.identities ?? []).map((i) => i.provider);
  return PROVIDERS.find((p) => linked.includes(p)) ?? null;
}

function nameOf(u: User): string {
  const m = (u.user_metadata ?? {}) as Record<string, unknown>;
  const full = String(m.full_name ?? m.name ?? '');
  return full.split(' ')[0] || 'Captain';
}

export interface Session {
  backend: CloudBackend;
  provider: SocialProvider | null;
  name: string;
}

async function touchProfile(u: User): Promise<void> {
  // display name and sign-in method only; failures here never block play
  await sb()
    .from('profiles')
    .upsert({ id: u.id, display_name: nameOf(u).slice(0, 40), provider: providerOf(u) ?? 'anonymous', last_seen: new Date().toISOString() }, { onConflict: 'id' })
    .then(
      () => undefined,
      () => undefined,
    );
}

/**
 * Restores the session (also finishing a Google / Apple / Facebook redirect), or signs the player in
 * anonymously. Returns null if Supabase can't be reached: the game keeps playing on this device.
 */
export async function startSession(): Promise<Session | null> {
  const auth = sb().auth;
  let { data } = await auth.getSession();
  if (!data.session) {
    const res = await auth.signInAnonymously();
    if (res.error || !res.data.session) return null;
    data = { session: res.data.session };
  }
  const u = data.session!.user;
  void touchProfile(u);
  return { backend: makeBackend(sb() as unknown as DbLike, u.id, signOut), provider: providerOf(u), name: providerOf(u) ? nameOf(u) : 'Guest' };
}

/**
 * Connects Google / Apple / Facebook. From an anonymous account this *links* the identity, so the
 * same user (and save) gets a real login; the browser leaves for the provider and comes back.
 * If that identity already has its own account, we sign in to it instead (the merge rules then decide).
 */
export async function signIn(p: SocialProvider): Promise<void> {
  const auth = sb().auth;
  const native = isNative();
  const redirectTo = native ? NATIVE_REDIRECT : location.href.split('#')[0];
  // the app opens the provider in the system browser (Google refuses embedded web views)
  const options = { redirectTo, skipBrowserRedirect: native };
  let url: string | undefined;
  const { data } = await auth.getSession();
  if (data.session?.user.is_anonymous) {
    const linked = await auth.linkIdentity({ provider: p, options });
    if (!linked.error) url = linked.data.url;
  }
  if (!url) {
    const res = await auth.signInWithOAuth({ provider: p, options });
    if (res.error) throw res.error;
    url = res.data.url ?? undefined;
  }
  if (native && url) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover' });
  }
}

/** The app was reopened by the sign-in deep link: trade its one-time code for a session. */
export async function finishNativeSignIn(link: string): Promise<boolean> {
  const u = new URL(link);
  const code = u.searchParams.get('code');
  const { Browser } = await import('@capacitor/browser');
  void Browser.close().catch(() => undefined);
  if (!code) return false;
  const { error } = await sb().auth.exchangeCodeForSession(code);
  return !error;
}

/** Deletes this player's account, profile and cloud save (supabase/migrations/*_delete_account.sql). */
export async function deleteAccount(): Promise<void> {
  const { error } = await sb().rpc('delete_my_account');
  if (error) throw new Error(error.message);
  await sb().auth.signOut().catch(() => undefined);
}

export async function signOut(): Promise<void> {
  await sb().auth.signOut();
}
