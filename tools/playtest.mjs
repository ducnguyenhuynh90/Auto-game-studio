// Automated playtest: a bot plays the real game in Chromium through the game's input path,
// capturing screenshots at key moments and reporting errors, funnel and economy pacing.
// This is QA + pacing simulation, NOT evidence of player enjoyment.
//
// usage: node tools/playtest.mjs [--trips 8] [--skill 0.7] [--speed 3] [--shots] [--url http://localhost:5173/]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const trips = Number(args.trips ?? 8);
const skill = Number(args.skill ?? 0.7);
const speed = Number(args.speed ?? 3);
const shots = args.shots === 'true';
// Default: the production preview (npm run build && npx vite preview --port 4173), immune to HMR reloads.
const base = args.url ?? 'http://localhost:4173/';
const outDir = args.out ?? 'playtest-output';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}?reset=1&seed=${args.seed ?? 7}&speed=${speed}`);
await page.waitForFunction(() => window.__mam);

const { installBot, runBot } = await import('./bot.mjs');
await installBot(page, skill);
const report = await runBot(page, {
  trips,
  onShot: shots ? (name, i) => page.screenshot({ path: `${outDir}/${String(i).padStart(2, '0')}_${name}.png` }) : null,
});
report.errors = [...errors, ...report.errors];
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, log: report.log.filter((l) => l.ev !== 'trip').slice(0, 40), trips: report.log.filter((l) => l.ev === 'trip') }, null, 1));
await browser.close();
