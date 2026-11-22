// Visual QA: node wildroot/tools/shots.mjs (after a build). Serves wildroot/dist on :4180,
// plays one round on desktop and phone, saves screenshots to wildroot/shots/, prints any errors.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const out = 'wildroot/shots';
mkdirSync(out, { recursive: true });
const srv = spawn('npx', ['vite', 'preview', '--config', 'wildroot/vite.config.ts', '--port', '4180', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const configs = [
  ['desktop', { viewport: { width: 1280, height: 800 } }],
  ['phone', { ...devices['iPhone 13'] }],
];
for (const [name, opts] of configs) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  await page.goto('http://localhost:4180/');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}-0-title.png` });
  await page.click('#start');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-1-plan.png` });
  const center = (wi) => page.evaluate((w) => window.__wrTest.center(w), wi);
  const place = async (card, wi) => {
    await page.click(`[data-card="${card}"]`);
    const c = await center(wi);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(150);
  };
  await place('reeds', 0);
  await place('logs', 0);
  await place('removeFish', 1);
  await place('addFrogs', 1);
  await place('logs', 1);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}-2-placed.png` });
  await page.click('#go', { force: true });
  await page.waitForTimeout(4200);
  await page.screenshot({ path: `${out}/${name}-3-running.png` });
  await page.click('#fast');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/${name}-4-result.png` });
  await page.click('[data-do="review"]');
  await page.waitForTimeout(300);
  await page.click('.chips[data-w="1"] [data-chip="frogs"]', { force: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}-5-why.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) errors.push(`${name}: horizontal overflow`);
  await ctx.close();
}
await browser.close();
srv.kill();
console.log(errors.length ? errors.join('\n') : 'no errors');
