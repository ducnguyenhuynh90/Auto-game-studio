// Quick screenshot helper: node tools/shot.mjs <url-query> <out.png> [waitMs]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [q = '', out = 'playtest-output/shot.png', wait = '800'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:5173/${q}`);
await p.waitForTimeout(Number(wait));
await p.screenshot({ path: out });
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
await b.close();
