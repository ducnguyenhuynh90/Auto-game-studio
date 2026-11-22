// Visual QA: node wildroot/tools/shots.mjs (serves wildroot/dist on :4180, plays one round, saves screenshots).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = 'wildroot/shots';
mkdirSync(out, { recursive: true });
const srv = spawn('npx', ['vite', 'preview', '--config', 'wildroot/vite.config.ts', '--port', '4180', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
const errors = [];
for (const [name, vp, scheme] of [['desktop', { width: 1100, height: 1300 }, 'light'], ['phone', { width: 390, height: 1500 }, 'dark']]) {
  const page = await browser.newPage({ viewport: vp, colorScheme: scheme });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  await page.goto('http://localhost:4180/');
  await page.waitForTimeout(500);
  await page.click('.world[data-w="0"] [data-act="reeds"]');
  await page.click('.world[data-w="0"] [data-act="logs"]');
  await page.click('.world[data-w="1"] [data-act="removeFish"]');
  await page.click('.world[data-w="1"] [data-act="addFrogs"]');
  await page.click('.world[data-w="1"] [data-act="logs"]');
  await page.click('#run');
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${out}/${name}-end.png`, fullPage: true });
  await page.fill('#scrub', '6');
  await page.dispatchEvent('#scrub', 'input');
  await page.click('.world[data-w="1"] [data-why="mosquito"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-why.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) errors.push(`${name}: horizontal overflow`);
  await page.close();
}
await browser.close();
srv.kill();
console.log(errors.length ? errors.join('\n') : 'no errors');
