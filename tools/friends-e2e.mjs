// End-to-end check of Friends in a real browser, with Supabase faked at the network level (the database
// rules themselves are tested in Postgres by tests/friends.test.ts). Covers: an invite link pays the
// welcome gift, invite rewards are collected, the friends board, a visit (taste-off), the invite tab,
// copying the code, adding a friend by typing a code, renaming, and the world top list.
//   VITE_SUPABASE_URL=https://demo-project.supabase.co VITE_SUPABASE_ANON_KEY=demo npx vite build --outDir /tmp/sb-build
//   npx vite preview --outDir /tmp/sb-build --port 4174 &   then:   node tools/friends-e2e.mjs [url] [shotsDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4174/';
const shots = process.argv[3] ?? 'playtest-output/friends';
mkdirSync(shots, { recursive: true });
const userId = '6a1d5e2c-1111-4c3b-9f00-000000000001';
const lanId = '6a1d5e2c-2222-4c3b-9f00-000000000002';
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
// the fake server's view of the world
const server = { name: 'Captain', invitedBy: null, friends: [], rewardsDue: 1, calls: [], giftsWaiting: ['Lan', 'Chú Tư'], sentToday: false };
const lan = { id: lanId, name: 'Lan', code: 'K7M2QX', best: 31.2 };
const tu = { id: '6a1d5e2c-3333-4c3b-9f00-000000000003', name: 'Chú Tư', code: 'TU4P9R', best: 18.4 };
const players = [lan, tu];
const fail = [];
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
await ctx.route('https://demo-project.supabase.co/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (url.pathname === '/auth/v1/signup' || url.pathname === '/auth/v1/token') return json(session);
  if (url.pathname === '/auth/v1/user') return json(session.user);
  if (!url.pathname.startsWith('/rest/v1/rpc/')) return req.method() === 'GET' ? json([]) : route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' });
  const fn = url.pathname.replace('/rest/v1/rpc/', '');
  const args = req.method() === 'POST' ? (req.postDataJSON() ?? {}) : {};
  server.calls.push(fn);
  const err = (message) => json({ message, code: 'P0001' }, 400);
  const byCode = (c) => players.find((p) => p.code === String(c).trim().toUpperCase());
  const me = () => ({ id: userId, name: server.name, me: true, best_degrees: 0, captain_level: 1, brand_level: 0, island_level: 1, career_stage: 0, dex: 1, catches: 3, last_seen: new Date().toISOString() });
  switch (fn) {
    case 'touch_profile':
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
    case 'my_social':
      return json({ code: 'MY55AA', name: server.name, invited: !!server.invitedBy, can_redeem: !server.invitedBy, friends: server.friends.length, invites: 1, played: 1 });
    case 'invite_preview': {
      const o = byCode(args.code);
      return json(o ? { name: o.name, best_degrees: o.best, captain_level: 9 } : null);
    }
    case 'open_gifts': {
      const g = server.giftsWaiting;
      server.giftsWaiting = [];
      return json(g);
    }
    case 'gift_status':
      return json({ friends: server.friends.length, unsent: server.sentToday ? 0 : server.friends.length, waiting: server.giftsWaiting.length });
    case 'send_gifts':
      server.sentToday = true;
      return json(server.friends.length);
    case 'redeem_invite': {
      const o = byCode(args.code);
      if (!o) return err('no player has that code');
      if (server.invitedBy) return err('you already joined with an invite');
      server.invitedBy = o.id;
      if (!server.friends.includes(o)) server.friends.push(o);
      return json(o.name);
    }
    case 'add_friend': {
      const o = byCode(args.code);
      if (!o) return err('no player has that code');
      if (!server.friends.includes(o)) server.friends.push(o);
      return json(o.name);
    }
    case 'claim_invite_rewards': {
      const n = server.rewardsDue;
      server.rewardsDue = 0;
      return json(n);
    }
    case 'set_display_name':
      server.name = String(args.new_name).trim();
      return json(server.name);
    case 'friends_board':
      return json([...server.friends.map((f) => ({ id: f.id, name: f.name, me: false, best_degrees: f.best, captain_level: 9, brand_level: 2, island_level: 3, career_stage: 2, dex: 9, catches: 80, last_seen: new Date().toISOString() })), me()].sort((a, c) => c.best_degrees - a.best_degrees));
    case 'top_board':
      return json([
        { rank: 1, name: 'Captain 9QXZ', me: false, best_degrees: 44.1, captain_level: 30, brand_level: 5 },
        { rank: 2, name: 'Lan', me: false, best_degrees: 31.2, captain_level: 9, brand_level: 2 },
        { rank: 7, name: server.name, me: true, best_degrees: 12.5, captain_level: 1, brand_level: 0 },
      ]);
    case 'visit_friend': {
      const o = players.find((p) => p.id === args.friend);
      if (!o || !server.friends.includes(o)) return err('not your friend');
      return json({ name: o.name, captain_level: 9, brand_level: 2, island_level: 3, best_degrees: o.best, cellar: { classic: 24, premium: o.best }, dex: ['anchovy', 'sardine', 'mackerel', 'golden', 'snapper'], buildings: [{ id: 'dock', level: 2 }, { id: 'brewhouse', level: 1 }, { id: 'shop', level: 1 }], staff: 3, dog: true, sea: 'reef', career_stage: 2 });
    }
  }
  return err(`unknown function ${fn}`);
});
const p = await ctx.newPage();
p.on('pageerror', (e) => fail.push(e.message));
p.on('console', (m) => m.text().startsWith('B') && console.log('page:', m.text()));
const shot = (n) => p.screenshot({ path: `${shots}/${n}.png`, timeout: 120000 });
const g = (fn, arg) => p.evaluate(fn, arg);
/** Taps a game button by id, waiting (up to 8 s) for the screen that has it to be drawn. */
const tapHit = async (id) => {
  for (let t = 0; t < 8000; t += 200) {
    const ok = await g((id) => {
      const game = window.__mam.game;
      const h = game.hits.find((x) => x.id === id);
      if (!h) return false;
      game.pointerDown(h.x + h.w / 2, h.y + h.h / 2);
      game.pointerUp(h.x + h.w / 2, h.y + h.h / 2);
      return true;
    }, id);
    if (ok) return true;
    await p.waitForTimeout(200);
  }
  return false;
};
/** Types into the game's text box and submits it. */
const answer = (v) =>
  g((v) => {
    const i = document.querySelector('input');
    i.value = v;
    i.form.requestSubmit();
  }, v);
const until = async (fn, ms = 8000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await g(fn)) return true;
    await p.waitForTimeout(200);
  }
  return false;
};

// 1) a new player opens a friend's invite link
await p.goto(`${base}?reset=1&quality=low&invite=k7m2qx`);
await until(() => window.__mam?.game?.account?.social === true);
const coins0 = await g(() => window.__mam.game.state.coins);
await until(() => window.__mam.game.state.stats.earned >= 800);
const st = await g(() => ({ coins: window.__mam.game.state.coins, earned: window.__mam.game.state.stats.earned }));
if (server.invitedBy !== lanId) fail.push('invite link was not redeemed');
if (st.earned < 800) fail.push(`welcome gift + invite reward not paid: ${JSON.stringify(st)} (start ${coins0})`);
if (await g(() => localStorage.getItem('mam_invite'))) fail.push('pending invite not cleared');
// the invited player is greeted by name, and the milestone (1 friend playing) and 2 gifts are paid
if (!(await until(() => window.__mam.game.overlays.some((o) => o.name === 'invite_welcome')))) fail.push('no invite welcome');
await until(() => window.__mam.game.state.stats.earned >= 800 + 300 + 120);
await p.waitForTimeout(500);
await shot('00_welcome');
const st2 = await g(() => ({ earned: window.__mam.game.state.stats.earned, pearl: window.__mam.game.state.gadgets.pearl ?? 0, milestone: window.__mam.game.state.social?.milestone }));
if (st2.earned !== 800 + 300 + 120 || st2.pearl < 2 || st2.milestone !== 1) fail.push(`milestone/gifts not paid right: ${JSON.stringify(st2)}`);
await tapHit('welcome_go');

// 2) Friends opens from the village once there has been a trip
await g(() => {
  const game = window.__mam.game;
  while (game.overlays.length) game.pop();
  game.state.stats.trips = 1;
  game.state.stats.casts = 1; // past the intro story, which a fresh game would show on top
  game.state.cellar = { classic: 12.5 };
});
await p.waitForTimeout(600);
if (!(await tapHit('friends'))) fail.push('no Friends button in the village');
await until(() => window.__mam.game.top.name === 'friends' && !!window.__mam.game.top.board);
await p.waitForTimeout(400);
await shot('01_board');
// 3) visit Lan (rank 1)
if (!(await tapHit('visit_1'))) fail.push('no Visit button on the board');
await until(() => window.__mam.game.top.name === 'friend_visit' && !!window.__mam.game.top.v);
await p.waitForTimeout(900);
await shot('02_visit');
// a taste-off win can be bragged about: the picture is made and shared (a download + copied text here)
console.log('snapshot test', await g(async () => {
  const t0 = performance.now();
  const shot = await Promise.race([window.__mam.game.snapshot(), new Promise((r) => setTimeout(() => r(null), 15000))]);
  return [shot ? `${shot.width}x${shot.height}` : 'timeout', Math.round(performance.now() - t0)];
}));
const dl = p.waitForEvent('download', { timeout: 120000 }).catch(() => null);
await g(() => {
  window.__mam.game.state.cellar = { premium: 35 };
});
if (!(await tapHit('brag_win'))) fail.push('no brag button after winning the taste-off');
const t0 = Date.now();
const file = await dl;
console.log('brag card took', Date.now() - t0, 'ms');
if (!file) fail.push(`brag card was not produced: ${JSON.stringify(await g(() => (window.__mam.analytics.events ?? window.__mam.analytics.log ?? []).slice?.(-5)))} share=${await g(() => typeof navigator.share)} canShare=${await g(() => typeof navigator.canShare)}`);
else await file.saveAs(`${shots}/06_brag_card.jpg`);
await tapHit('visit_back');
await p.waitForTimeout(300);
// 4) invite tab, copy the code
await tapHit('ftab_invite');
await p.waitForTimeout(400);
await shot('03_invite');
await tapHit('copy_code');
await p.waitForTimeout(300);
const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
if (clip !== 'MY55AA') fail.push(`code not copied: "${clip}"`);
// 5) rename through the text box
await tapHit('rename');
await until(() => !!document.querySelector('input'));
await answer('Captain Ba');
await until(() => window.__mam.game.top.me?.name === 'Captain Ba');
if (server.name !== 'Captain Ba') fail.push('rename not sent');
// 6) add a friend by code (lower case, with spaces)
await tapHit('ftab_friends');
await p.waitForTimeout(300);
await tapHit('friend_add');
await until(() => !!document.querySelector('input'));
await answer(' tu4p9r ');
await until(() => (window.__mam.game.top.board ?? []).length === 3);
if (!server.friends.includes(tu)) fail.push('friend not added by code');
await p.waitForTimeout(300);
await shot('04_board_after_add');
// daily gifts
if (!(await tapHit('send_gifts'))) fail.push('no send gifts button');
await until(() => window.__mam.game.top.gifts?.unsent === 0);
if (!server.sentToday) fail.push('gifts not sent');
// a wrong code is refused with a message, not an error
await tapHit('friend_add');
await until(() => !!document.querySelector('input'));
await answer('ZZZZZZ');
await p.waitForTimeout(800);
// 7) world top list
await tapHit('ftab_world');
await until(() => !!window.__mam.game.top.top);
await p.waitForTimeout(300);
await shot('05_world');

console.log(JSON.stringify({ calls: [...new Set(server.calls)], coins: st, fail }, null, 1));
await b.close();
process.exit(fail.length ? 1 : 0);
