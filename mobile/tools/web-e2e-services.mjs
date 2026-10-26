// The optional services in a build that has them: cloud backup (Supabase) and Google Analytics
// (Measurement Protocol). Both servers are faked in the browser, so this needs no accounts or keys.
// Checks: anonymous sign-in and a save upload on first launch, the consent card after the first catch,
// no GA traffic before "yes" and the right events after it, and account deletion from Settings.
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
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => fail.push(`page error: ${e.message}`));

// ---- fake Supabase ----
const userId = '00000000-0000-4000-8000-000000000001';
const sb = { signups: 0, saves: [], profiles: 0, deleted: 0 };
const session = () => ({
  access_token: 'header.' + Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', is_anonymous: true })).toString('base64url') + '.sig',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'refresh',
  user: { id: userId, aud: 'authenticated', role: 'authenticated', is_anonymous: true, identities: [], app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
await p.route('https://fake.supabase.test/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: body === undefined ? '' : JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (url.pathname === '/auth/v1/signup') return (sb.signups++, json(200, session()));
  if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
  if (url.pathname === '/rest/v1/saves' && req.method() === 'GET') return json(200, []);
  if (url.pathname === '/rest/v1/saves') return (sb.saves.push(JSON.parse(req.postData() ?? '{}')), json(201));
  if (url.pathname === '/rest/v1/profiles') return (sb.profiles++, json(201));
  if (url.pathname === '/rest/v1/rpc/delete_my_account') return (sb.deleted++, json(200, null));
  return json(404, { message: `unexpected ${req.method()} ${url.pathname}` });
});
// ---- fake Google Analytics ----
const gaEvents = [];
let gaBodies = 0;
await p.route('https://www.google-analytics.com/**', async (route) => {
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

// Settings: backup status and account deletion
await id('settings').click();
await p.waitForTimeout(300);
await p.screenshot({ path: `${shots}/rns_settings.png` });
await id('delete_account').click();
await p.waitForTimeout(200);
await p.screenshot({ path: `${shots}/rns_delete_confirm.png` });
await id('delete_yes').click();
await p.waitForTimeout(1500);
if (sb.deleted !== 1) fail.push('delete_my_account was not called');
const after = await p.evaluate(() => globalThis.__mamApp.state.stats.catches);
if (after !== 0) fail.push('local progress kept after deleting the account');
if (sb.signups !== 2) fail.push('no fresh anonymous account after deletion');
await p.screenshot({ path: `${shots}/rns_deleted.png` });

console.log(JSON.stringify({ signups: sb.signups, saves: sb.saves.length, deleted: sb.deleted, gaBodies, gaEvents: gaEvents.length, names: [...names].slice(0, 20) }));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'react native services e2e passed');
await b.close();
process.exit(fail.length ? 1 : 0);
