// Phone test: builds the app, installs it on the Android phone plugged into this computer (USB debugging on),
// then the playtest bot plays the real game ON THE PHONE: fishing trips, jars, the market. It measures the
// frame rate, collects errors and saves phone screenshots + a report.
//
// Your own progress is safe: the test plays a fresh village in its own save slot (src/core/testmode.ts),
// sends no analytics and no cloud sync, and puts the phone back to your normal game when it finishes.
//
//   npm run phone:test                       build + install + test (3 trips)
//   npm run phone:test -- --trips 6 --speed 2 --no-build --shots
// Options: --trips N (3) · --skill 0..1 (0.7) · --speed N game speed (2) · --no-build (test the installed app)
//          --shots (a screenshot at each key moment) · --device SERIAL (when several phones are plugged in)
// Needs: tools/mac-android-setup.sh done once, a DEBUG build (release builds can't be inspected), adb.
// See docs/PHONE_TESTING.md.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { installBot, runBot } from './bot.mjs';

const { _android } = createRequire(import.meta.url)('playwright');
const PKG = 'com.mamvillage.app';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const trips = Number(args.trips ?? 3);
const skill = Number(args.skill ?? 0.7);
const speed = Number(args.speed ?? 2);
const outDir = args.out ?? 'playtest-output/phone';
mkdirSync(outDir, { recursive: true });
const say = (...m) => console.log('📱', ...m);
const fail = (msg) => {
  console.error(`\n✗ ${msg}\n  Help: docs/PHONE_TESTING.md\n`);
  process.exit(1);
};

// 1. the phone
let devices;
try {
  devices = await _android.devices();
} catch (e) {
  fail(`Couldn't talk to adb (${e.message.split('\n')[0]}). Run: npm run phone:setup`);
}
if (!devices.length) fail('No phone found. Plug it in with USB, unlock it and tap "Allow USB debugging", then run: adb devices');
const device = args.device ? devices.find((d) => d.serial() === args.device) : devices[0];
if (!device) fail(`Phone ${args.device} not found. Connected: ${devices.map((d) => d.serial()).join(', ')}`);
const serial = device.serial();
const model = device.model();
say(`Phone: ${model} (${serial})`);

// 2. build + install the debug app (debug builds can be inspected; store builds can't)
if (args['no-build'] !== 'true') {
  say('Building the game and the Android app (first time: a few minutes)…');
  try {
    execSync('npm run cap:sync', { stdio: 'inherit' });
    execSync('./gradlew installDebug', { cwd: 'mobile/android', stdio: 'inherit', env: { ...process.env, ANDROID_SERIAL: serial } });
  } catch {
    for (const d of devices) d.close();
    fail('The build or install failed (see above). If it says "INSTALL_FAILED_UPDATE_INCOMPATIBLE", uninstall the store/test copy of Mắm Village from the phone first.');
  }
}

// 3. open the app and connect to its game view
const sh = async (cmd) => (await device.shell(cmd)).toString();
await sh(`am force-stop ${PKG}`);
await sh(`input keyevent KEYCODE_WAKEUP`);
await sh(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);
say('Opening Mắm Village on the phone…');
let page;
try {
  const webview = await device.webView({ pkg: PKG }, { timeout: 30000 });
  page = await webview.page();
} catch {
  for (const d of devices) d.close();
  fail('Could not inspect the app. Is it a debug build? (npm run phone:test builds one; the Play Store copy can\'t be tested.)');
}
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const waitGame = () => page.waitForFunction(() => window.__mam?.game?.scene, null, { timeout: 60000 });

// 4. switch to test mode: fresh village in its own save slot (your save isn't touched)
await waitGame();
// (the reload can end the evaluate before it returns: that's expected)
await page.evaluate(() => {
  sessionStorage.setItem('mam_phone_test', '1');
  setTimeout(() => location.reload(), 50);
});
await page.waitForTimeout(1500);
await waitGame();

const restore = async () => {
  try {
    await page.evaluate(() => {
      sessionStorage.removeItem('mam_phone_test');
      localStorage.removeItem('mam_save_phone_test');
      setTimeout(() => location.reload(), 50);
    });
    say('Phone is back on your own game.');
  } catch {
    say('Close and reopen the app to get back to your own game.');
  }
};

let report;
const shot = (name) => device.screenshot({ path: `${outDir}/${name}.png` });
try {
  // frame rate on the village hub, before the bot starts
  const measureFps = (ms) =>
    page.evaluate(
      (ms) =>
        new Promise((resolve) => {
          const times = [];
          const t0 = performance.now();
          const tick = (t) => {
            times.push(t);
            if (t - t0 < ms) requestAnimationFrame(tick);
            else {
              const gaps = times.slice(1).map((x, i) => x - times[i]).sort((a, b) => a - b);
              const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
              resolve({ fps: Math.round(1000 / avg), worstFrameMs: Math.round(gaps[gaps.length - 1]), p95FrameMs: Math.round(gaps[Math.floor(gaps.length * 0.95)]) });
            }
          };
          requestAnimationFrame(tick);
        }),
      ms,
    );
  await page.waitForTimeout(2000);
  const fpsVillage = await measureFps(4000);
  say(`Village: ${fpsVillage.fps} fps`);
  await shot('00_village');

  // the bot plays
  await page.evaluate((s) => (window.__mam.game.timeScale = s), speed);
  await installBot(page, skill);
  say(`The bot is playing ${trips} fishing trips at ${speed}× speed. Watch the phone!`);
  let fpsFishing = null;
  report = await runBot(page, {
    trips,
    onShot: async (name, i) => {
      if (name === 'fish_aim' && !fpsFishing) fpsFishing = await measureFps(3000);
      if (args.shots === 'true') await shot(`${String(i).padStart(2, '0')}_${name}`);
    },
  });
  if (fpsFishing) say(`Fishing: ${fpsFishing.fps} fps`);
  const quality = await page.evaluate(() => window.__mam.game.world?.quality ?? null);
  const mem = (await sh(`dumpsys meminfo ${PKG}`)).match(/TOTAL PSS:\s*(\d+)|TOTAL\s+(\d+)/);
  report = {
    device: { model, serial, android: (await sh('getprop ro.build.version.release')).trim() },
    fps: { village: fpsVillage, fishing: fpsFishing },
    quality,
    memoryMB: mem ? Math.round(Number(mem[1] ?? mem[2]) / 1024) : null,
    ...report,
    errors: [...errors, ...report.errors],
  };
  await shot('99_end');
} finally {
  await restore();
  for (const d of devices) d.close();
}

writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
const c = report.counts;
console.log(`
━━━━━━━━ Phone test: ${report.device.model}, Android ${report.device.android} ━━━━━━━━
Frame rate   village ${report.fps.village.fps} fps · fishing ${report.fps.fishing?.fps ?? '?'} fps (graphics: ${report.quality})
Memory       ${report.memoryMB ?? '?'} MB
Played       ${c.cast} casts · ${c.catch} catches · ${c.lost} lost · ${c.jar_open} jars opened · ${c.upgrade} upgrades
Coins        ${report.state.coins}
Errors       ${report.errors.length ? report.errors.length + '\n  - ' + report.errors.slice(0, 8).join('\n  - ') : 'none'}
Report       ${outDir}/report.json · screenshots in ${outDir}/
`);
process.exit(report.errors.length ? 1 : 0);
