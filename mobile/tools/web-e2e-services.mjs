// The optional services in a build that has them: cloud backup (Supabase) and Google Analytics
// (Measurement Protocol). Both servers are faked in the browser, so this needs no accounts or keys.
// Checks: anonymous sign-in and a save upload on first launch, the consent card after the first catch,
// no GA traffic before "yes" and the right events after it, Google sign-in (linking the anonymous
// account; sign out; signing in to an account that already has another save, which asks which to keep),
// and account deletion from Settings.
//   EXPO_PUBLIC_SUPABASE_URL=https://fake.supabase.test EXPO_PUBLIC_SUPABASE_ANON_KEY=anon \
//   EXPO_PUBLIC_GA_MEASUREMENT_ID=G-TEST EXPO_PUBLIC_GA_API_SECRET=secret \
//     npx expo export --platform web --output-dir /tmp/rn-web-svc
//   (serve it)   node tools/web-e2e-services.mjs [url] [shots-dir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4182/';
const shots = process.argv[3] ?? 'playtest-output';
mkdirSync(shots, { recursive: true });
const fail = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => fail.push(`page error: ${e.message}`));

// ---- fake Supabase (auth + the saves / profiles tables) ----
// one player record per user id; the first one is the anonymous account that later links Google
const userId = '00000000-0000-4000-8000-000000000001';
const sb = { signups: 0, saves: [], rows: new Map(), profiles: [], deleted: 0, linkAsked: 0, oauthAsked: 0, exchanged: 0 };
let nextAnon = 1;
let googleOwner = null; // which user id the fake Google account belongs to
const userFor = (id, google) => ({
  id,
  aud: 'authenticated',
  role: 'authenticated',
  is_anonymous: !google,
  identities: google ? [{ provider: 'google', id: 'g1', user_id: id, identity_data: {} }] : [],
  app_metadata: {},
  user_metadata: google ? { full_name: 'Lan Nguyen' } : {},
  created_at: new Date().toISOString(),
});
const session = (user) => ({
  access_token: 'header.' + Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', is_anonymous: user.is_anonymous })).toString('base64url') + '.sig',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'refresh',
  user,
});
const bearerUser = (req) => {
  const tok = (req.headers()['authorization'] ?? '').split('.')[1];
  try {
    return JSON.parse(Buffer.from(tok, 'base64url').toString()).sub;
  } catch {
    return null;
  }
};
let pendingCode = null; // code → the user it signs in as
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
await ctx.route('https://fake.supabase.test/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: body === undefined ? '' : JSON.stringify(body) });
  // like a real provider page, "Google" shows for a moment before sending the player back
  const back = (to, params) =>
    route.fulfill({ status: 200, headers: { 'content-type': 'text/html' }, body: `<p>Google</p><script>setTimeout(() => location.replace(${JSON.stringify(`${to}?${new URLSearchParams(params)}`)}), 600)</script>` });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (url.pathname === '/auth/v1/signup') {
    sb.signups++;
    const id = `00000000-0000-4000-8000-00000000000${nextAnon++}`;
    return json(200, session(userFor(id, false)));
  }
  if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
  // linkIdentity: the API answers with the provider page's address
  if (url.pathname === '/auth/v1/user/identities/authorize') {
    sb.linkAsked++;
    const me = bearerUser(req);
    return json(200, { url: `https://fake.supabase.test/fake-google?mode=link&me=${me}&redirect_to=${encodeURIComponent(url.searchParams.get('redirect_to'))}` });
  }
  // signInWithOAuth: the browser goes straight to the authorize page ("Google" itself, here: a redirect
  // from a faked response would leave the fake host, which Playwright doesn't route)
  if (url.pathname === '/auth/v1/authorize') {
    sb.oauthAsked++;
    pendingCode = { code: `code${Date.now()}`, user: googleOwner };
    return back(url.searchParams.get('redirect_to'), { code: pendingCode.code });
  }
  // "Google": links to the caller unless this Google account already belongs to someone else
  if (url.pathname === '/fake-google') {
    const to = url.searchParams.get('redirect_to');
    if (url.searchParams.get('mode') === 'link') {
      if (googleOwner && googleOwner !== url.searchParams.get('me')) return back(to, { error: 'server_error', error_code: 'identity_already_exists', error_description: 'Identity is already linked to another user' });
      googleOwner = url.searchParams.get('me');
    }
    pendingCode = { code: `code${Date.now()}`, user: googleOwner };
    return back(to, { code: pendingCode.code });
  }
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
    const body = JSON.parse(req.postData() ?? '{}');
    if (!pendingCode || body.auth_code !== pendingCode.code || !body.code_verifier) return json(400, { error: 'invalid_grant', error_description: 'bad code or missing PKCE verifier' });
    sb.exchanged++;
    return json(200, session(userFor(pendingCode.user, true)));
  }
  if (url.pathname === '/rest/v1/saves' && req.method() === 'GET') {
    const who = (url.searchParams.get('user_id') ?? '').replace(/^eq\./, '');
    return json(200, sb.rows.has(who) ? [sb.rows.get(who)] : []);
  }
  if (url.pathname === '/rest/v1/saves') {
    const row = JSON.parse(req.postData() ?? '{}');
    sb.saves.push(row);
    sb.rows.set(row.user_id, row);
    return json(201);
  }
  if (url.pathname === '/rest/v1/profiles') return (sb.profiles.push(JSON.parse(req.postData() ?? '{}')), json(201));
  if (url.pathname === '/rest/v1/rpc/delete_my_account') return (sb.deleted++, json(200, null));
  return json(404, { message: `unexpected ${req.method()} ${url.pathname}` });
});
// ---- fake Google Analytics ----
const gaEvents = [];
let gaBodies = 0;
await ctx.route('https://www.google-analytics.com/**', async (route) => {
  const body = JSON.parse(route.request().postData() ?? '{}');
  gaBodies++;
  if (body.client_id && Array.isArray(body.events)) gaEvents.push(...body.events.map((e) => ({ ...e, props: body.user_properties })));
  else fail.push('GA body without client_id/events');
  await route.fulfill({ status: 204, headers: cors });
});

await p.goto(base);
await p.waitForFunction(() => !!globalThis.__mamApp, null, { timeout: 30000 });
const id = (x) => p.locator(`[data-testid="${x}"]`).first();
const skipStory = async () => {
  while (await p.evaluate(() => globalThis.__mamApp.story.length > 0)) {
    await id('story_skip').click();
    await p.waitForTimeout(150);
  }
};
await p.waitForTimeout(1500);
await skipStory();
if (sb.signups !== 1) fail.push(`anonymous sign-ups on first launch: ${sb.signups}`);
if (!sb.saves.length) fail.push('the new game was not backed up');
else if (sb.saves[0].user_id !== userId || typeof sb.saves[0].state !== 'object') fail.push('save row is missing user_id/state');

// one catch, then the consent card asks (nothing goes to GA before the answer)
await p.evaluate(() => {
  const g = globalThis.__mamApp;
  g.state.stats.catches = 1;
  g.commit();
});
await p.waitForTimeout(400);
if (!(await id('consent_yes').count())) fail.push('consent card not shown after the first catch');
await p.screenshot({ path: `${shots}/rns_consent.png` });
await p.waitForTimeout(11000); // longer than one send interval
if (gaBodies) fail.push(`GA got ${gaBodies} requests before consent`);
await id('consent_yes').click();
await p.waitForTimeout(2500);
const names = new Set(gaEvents.map((e) => e.name));
for (const need of ['session_start', 'funnel', 'first_launch', 'stats_consent']) if (!names.has(need)) fail.push(`GA missing ${need} (got ${[...names].join(', ')})`);
const ev = gaEvents.find((e) => e.name === 'session_start');
if (ev && !(ev.params.session_id > 0 && ev.params.engagement_time_msec > 0 && ev.timestamp_micros > 0)) fail.push('GA event lacks session_id / engagement / timestamp');
if (ev && !(ev.props?.captain_level?.value >= 1 && ev.props?.platform?.value === 'web')) fail.push(`GA user properties: ${JSON.stringify(ev?.props)}`);

// Settings: sign in with Google from the anonymous account: the same player record gets the identity
await id('settings').click();
await p.waitForTimeout(300);
await p.screenshot({ path: `${shots}/rns_settings.png` });
await id('sign_in_google').click();
await p.waitForSelector('[data-testid="sign_out"]', { timeout: 15000 }).catch(() => fail.push('Google sign-in did not finish'));
await p.waitForTimeout(500);
await p.screenshot({ path: `${shots}/rns_signed_in.png` });
if (googleOwner !== userId) fail.push(`Google was not linked to the anonymous account (owner ${googleOwner})`);
if (!sb.profiles.some((r) => r.id === userId && r.provider === 'google' && r.display_name === 'Lan')) fail.push('profile not updated with the Google name');
if (sb.rows.get(userId)?.catches !== 1) fail.push('progress not saved to the linked account');
// sign out: a fresh anonymous backup, the progress stays on the phone
await id('sign_out').click();
await p.waitForSelector('[data-testid="sign_in_google"]', { timeout: 10000 }).catch(() => fail.push('sign out did not finish'));
if ((await p.evaluate(() => globalThis.__mamApp.state.stats.catches)) !== 1) fail.push('progress lost on sign out');
// meanwhile the Google account's save moved on elsewhere (another phone): signing in must ask
const row = sb.rows.get(userId);
sb.rows.set(userId, { ...row, save_id: 'otherphone', state: { ...row.state, saveId: 'otherphone', rev: 99, stats: { ...row.state.stats, catches: 42 } } });
await p.waitForTimeout(400);
await id('sign_in_google').click();
await p.waitForSelector('[data-testid="keep_cloud"]', { timeout: 15000 }).catch(async () => fail.push(`no save choice after signing in to an account with another save (status: ${await p.evaluate(() => globalThis.__mamCloud.status)}; link ${sb.linkAsked}, oauth ${sb.oauthAsked}, exchanged ${sb.exchanged})`));
await p.screenshot({ path: `${shots}/rns_two_saves.png` });
if (sb.oauthAsked < 1) fail.push('no fallback to plain sign-in after "identity already linked"');
if (await id('keep_cloud').count()) await id('keep_cloud').click();
await p.waitForTimeout(600);
if ((await p.evaluate(() => globalThis.__mamApp.state.stats.catches)) !== 42) fail.push('the cloud save was not loaded');
if (!(await id('sign_out').count())) fail.push('not shown as signed in after switching accounts');
await id('delete_account').click();
await p.waitForTimeout(200);
await p.screenshot({ path: `${shots}/rns_delete_confirm.png` });
await id('delete_yes').click();
await p.waitForTimeout(1500);
if (sb.deleted !== 1) fail.push('delete_my_account was not called');
const after = await p.evaluate(() => globalThis.__mamApp.state.stats.catches);
if (after !== 0) fail.push('local progress kept after deleting the account');
if (sb.signups !== 3) fail.push(`expected a fresh anonymous account after deletion (sign-ups ${sb.signups})`);
await p.screenshot({ path: `${shots}/rns_deleted.png` });

console.log(JSON.stringify({ signups: sb.signups, saves: sb.saves.length, linkAsked: sb.linkAsked, oauthAsked: sb.oauthAsked, exchanged: sb.exchanged, deleted: sb.deleted, gaBodies, gaEvents: gaEvents.length, names: [...names].slice(0, 20) }));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'react native services e2e passed');
await b.close();
process.exit(fail.length ? 1 : 0);
