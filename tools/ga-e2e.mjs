// Google Analytics in a real browser, with Google's script faked (no account needed):
// nothing is sent before the player answers; "yes" sends the held first-session events (funnel,
// session_start), screens as page_view, level-ups and player properties, with no cookies.
//   VITE_GA_MEASUREMENT_ID=G-TEST123 npx vite build --outDir /tmp/ga-build
//   npx vite preview --outDir /tmp/ga-build --port 4175 &   then:   node tools/ga-e2e.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4175/';
const fail = [];
const b = await chromium.launch();
const run = async (answer) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  let scriptLoads = 0;
  await ctx.route('https://www.googletagmanager.com/**', (r) => {
    scriptLoads++;
    return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* gtag stub */' });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fail.push(`${answer}: ${e.message}`));
  await p.goto(`${base}?reset=1`);
  await p.waitForTimeout(3000);
  const dl = () => p.evaluate(() => (window.dataLayer ?? []).map((a) => Array.from(a)));
  if ((await dl()).length) fail.push(`${answer}: data sent before consent`);
  // play: one catch, then the village asks
  await p.evaluate(async () => {
    const g = window.__mam.game;
    g.state.stats.catches = 1;
    g.overlays = [];
    g.goVillage();
  });
  // the opening story plays first; then, after the first catch, the village asks
  for (let i = 0; i < 16; i++) {
    await p.waitForTimeout(400);
    const top = await p.evaluate(() => window.__mam.game.overlays.map((o) => o.name).at(-1));
    if (top === 'consent') break;
    if (top === 'story') await p.evaluate(() => window.__mam.game.hits.find((h) => h.id === 'story_skip')?.fn());
  }
  const asked = await p.evaluate(() => window.__mam.game.overlays.map((o) => o.name).includes('consent'));
  if (!asked) fail.push(`${answer}: consent card not shown after the first catch`);
  await p.evaluate((id) => window.__mam.game.hits.find((h) => h.id === id)?.fn(), answer === 'yes' ? 'consent_yes' : 'consent_no');
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    window.__mam.analytics.track('level_up', { level: 2 });
    window.__mam.game.push({ name: 'probe', update() {}, draw() {} });
  });
  await p.waitForTimeout(300);
  const calls = await dl();
  const events = calls.filter((c) => c[0] === 'event').map((c) => c[1]);
  const config = calls.find((c) => c[0] === 'config');
  const props = calls.find((c) => c[0] === 'set' && c[1] === 'user_properties');
  const cookies = (await ctx.cookies()).filter((c) => c.name.startsWith('_ga'));
  if (answer === 'yes') {
    for (const want of ['session_start', 'first_launch', 'page_view', 'level_up', 'screen']) if (!events.includes(want)) fail.push(`yes: missing event ${want}`);
    if (!config || config[1] !== 'G-TEST123' || config[2].client_storage !== 'none' || !config[2].client_id) fail.push(`yes: bad config ${JSON.stringify(config)}`);
    if (!props || typeof props[2].captain_level !== 'number' || props[2].career_title === undefined) fail.push(`yes: player properties missing ${JSON.stringify(props)}`);
    if (scriptLoads !== 1) fail.push(`yes: gtag.js loaded ${scriptLoads} times`);
  } else {
    if (calls.length) fail.push(`no: ${calls.length} calls sent after "No thanks"`);
    if (scriptLoads) fail.push('no: gtag.js loaded anyway');
  }
  if (cookies.length) fail.push(`${answer}: GA cookies set`);
  console.log(answer, JSON.stringify({ events: [...new Set(events)].slice(0, 14), props: props?.[2] ?? null }));
  await ctx.close();
};
await run('yes');
await run('no');
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'ga e2e passed');
await b.close();
process.exit(fail.length ? 1 : 0);
