// Visual QA: open a dev scene, optionally tap/hold at points, screenshot at given times.
// node tools/flow.mjs "<query>" out_prefix "action;action..."  actions: wait:ms | tap:x,y | down:x,y | up:x,y | shot:name
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [q, prefix = 'playtest-output/flow', script = 'wait:1200;shot:a'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:5173/${q}`);
for (const step of script.split(';')) {
  const [cmd, arg = ''] = step.split(':');
  const [x, y] = arg.split(',').map(Number);
  if (cmd === 'wait') await p.waitForTimeout(Number(arg));
  else if (cmd === 'tap') await p.mouse.click(x, y);
  else if (cmd === 'down') { await p.mouse.move(x, y); await p.mouse.down(); }
  else if (cmd === 'up') await p.mouse.up();
  else if (cmd === 'shot') await p.screenshot({ path: `${prefix}_${arg}.png` });
}
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
await b.close();
