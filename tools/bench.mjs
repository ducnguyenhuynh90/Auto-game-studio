// Frame-rate benchmark on a simulated weak phone: CPU throttled, DPR 2, software GL (headless).
// usage: node tools/bench.mjs [cpuSlowdown=6] [quality=auto] ; needs the dev server on :5173
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const slow = Number(process.argv[2] ?? 6);
const quality = process.argv[3] ?? '';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
const results = {};
for (const scene of ['', 'fishing', 'reef']) {
  const q = `?reset=1&seed=4${scene ? `&scene=${scene}` : ''}${quality ? `&quality=${quality}` : ''}`;
  const t0 = Date.now();
  await p.goto(`http://localhost:5173/${q}`);
  await p.waitForFunction(() => window.__mam, null, { timeout: 60000 });
  const loadMs = Date.now() - t0;
  await p.waitForTimeout(2500);
  const stats = await p.evaluate(
    () =>
      new Promise((res) => {
        const times = [];
        let last = performance.now();
        const end = last + 5000;
        const f = (now) => {
          times.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(f);
          else {
            times.sort((a, b) => a - b);
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            res({ fps: Math.round(1000 / avg), p95ms: Math.round(times[Math.floor(times.length * 0.95)]), q: window.__mam.game.world?.quality ?? 'n/a' });
          }
        };
        requestAnimationFrame(f);
      }),
  );
  results[scene || 'village'] = { ...stats, loadMs };
}
console.log(JSON.stringify({ cpuSlowdown: slow, quality: quality || 'auto', results }));
await b.close();
