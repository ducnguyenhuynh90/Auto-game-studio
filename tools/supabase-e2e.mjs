// End-to-end check of the Supabase account flow in a real browser, with Supabase faked at the network
// level (no project needed): anonymous sign-in → profile + save uploaded → reload with a wiped local
// save → the cloud save comes back. Build first with fake config, then serve it:
//   VITE_SUPABASE_URL=https://demo-project.supabase.co VITE_SUPABASE_ANON_KEY=demo npx vite build --outDir /tmp/sb-build
//   npx vite preview --outDir /tmp/sb-build --port 4174 &   then:   node tools/supabase-e2e.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4174/';
const userId = '6a1d5e2c-1111-4c3b-9f00-000000000001';
const jwt = (payload) => ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.');
const now = Math.floor(Date.now() / 1000);
const session = {
  access_token: jwt({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: now + 3600, is_anonymous: true }),
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: now + 3600,
  refresh_token: 'refresh-1',
  user: { id: userId, aud: 'authenticated', role: 'authenticated', is_anonymous: true, identities: [], app_metadata: { provider: 'anonymous' }, user_metadata: {}, created_at: new Date().toISOString() },
};
const db = { profiles: new Map(), saves: new Map() };
const calls = [];
const fail = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('https://demo-project.supabase.co/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  calls.push(`${req.method()} ${url.pathname}`);
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (url.pathname === '/auth/v1/signup') return json(session);
  if (url.pathname === '/auth/v1/user') return json(session.user);
  if (url.pathname === '/auth/v1/token') return json(session);
  const table = url.pathname.replace('/rest/v1/', '');
  if (!(table in db)) return json({ message: 'unknown table' }, 404);
  if (req.method() === 'GET') {
    const id = (url.searchParams.get('user_id') ?? url.searchParams.get('id') ?? '').replace('eq.', '');
    const row = db[table].get(id);
    return json(row ? [row] : []);
  }
  if (req.method() === 'POST') {
    const body = req.postDataJSON();
    const rows = Array.isArray(body) ? body : [body];
    for (const r of rows) {
      if ((r.user_id ?? r.id) !== userId) return json({ message: 'new row violates row-level security policy' }, 403);
      db[table].set(r.user_id ?? r.id, r);
    }
    return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' });
  }
  return json({}, 200);
});
const p = await ctx.newPage();
p.on('pageerror', (e) => fail.push(e.message));
await p.goto(`${base}?reset=1`);
await p.waitForTimeout(5000);
const info1 = await p.evaluate(() => ({ kind: window.__mam.game.account?.info.kind, status: window.__mam.game.account?.status }));
if (info1.kind !== 'cloud') fail.push(`expected a backed-up guest, got ${JSON.stringify(info1)}`);
// play a little: change the save and push it
const want = await p.evaluate(async () => {
  const g = window.__mam.game;
  g.state.coins = 777;
  g.state.stats.catches = 3;
  g.state.xp = 40;
  g.commit(); // may also pay goal rewards: compare with whatever the game holds now
  await g.account.flush();
  return g.state.coins;
});
await p.waitForTimeout(500);
const saved = db.saves.get(userId);
if (!saved || saved.state.coins !== want) fail.push(`save not uploaded: ${JSON.stringify(saved)?.slice(0, 120)}`);
if (!db.profiles.get(userId)) fail.push('profile not written');
if (saved && (saved.coins !== want || saved.catches !== 3)) fail.push('progress summary columns missing');
// same device, local save wiped: the cloud save must come back
await p.goto(`${base}?reset=1`);
await p.waitForTimeout(5000);
const coins = await p.evaluate(() => window.__mam.game.state.coins);
if (coins !== want) fail.push(`cloud save not restored (coins ${coins})`);
// Supabase down: the game must still start and play, saving on the device
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx2.route('https://demo-project.supabase.co/**', (r) => r.abort('connectionrefused'));
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => fail.push(`offline: ${e.message}`));
await p2.goto(`${base}?reset=1`);
await p2.waitForTimeout(5000);
const offline = await p2.evaluate(() => ({ scene: window.__mam.game.scene.name, kind: window.__mam.game.account?.info.kind, status: window.__mam.game.account?.status }));
if (offline.scene !== 'village' || offline.kind !== 'guest') fail.push(`offline start broken: ${JSON.stringify(offline)}`);
console.log(JSON.stringify({ calls: [...new Set(calls)], kind: info1.kind, restoredCoins: coins, offline }, null, 1));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'supabase e2e passed');
await b.close();
process.exit(fail.length ? 1 : 0);
