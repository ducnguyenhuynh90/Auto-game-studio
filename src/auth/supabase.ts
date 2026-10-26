// Supabase: player accounts and cloud saves for self-hosted builds (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY).
// Every player gets a user on first launch (anonymous sign-in), so progress is backed up from minute one.
// Linking Google / Apple / Facebook keeps the same user id: the save then follows them to any device.
// Tables and row-level security: supabase/migrations/*.sql. Lazy-loaded (only builds with config fetch it).
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { SocialProvider } from './account';
import { makeBackend, nameOf, providerOf, type CloudBackend, type DbLike } from './cloudsave';

export { makeBackend, progressRow, type DbLike } from './cloudsave';

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
