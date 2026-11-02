// Phone test: builds the app, installs it on the Android phone plugged into this computer (USB debugging
// on), and the playtest bot plays the real game ON THE PHONE, natively: fishing trips, jars, the market.
// It reports what it reached, the frame rate and any error, and saves phone screenshots.
//
// Your own progress is safe: the test plays a fresh village in its own save slot (src/core/testmode.ts),
// sends no analytics and no cloud sync. Close and reopen the app afterwards to get your own game back.
//
//   npm run phone:test                       build + install + test (2 trips)
//   npm run phone:test -- --trips 4 --no-build
// Options: --trips N (2) · --no-build (test the app already on the phone) · --out DIR
// Needs: npm run phone:setup once (docs/PHONE_TESTING.md).
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const trips = Number(opt('trips', 2));
const out = opt('out', 'playtest-output/phone');
const run = (cmd, cwd = '.') => execSync(cmd, { stdio: 'inherit', cwd, env: { ...process.env, MAM_SIGN: 'tester' } });

try {
  execSync('adb get-state', { stdio: 'ignore' });
} catch {
  console.error('\n✗ No phone found. Plug it in, unlock it, allow USB debugging, then check: adb devices\n  Help: docs/PHONE_TESTING.md\n');
  process.exit(1);
}

let apk = '';
if (!args.includes('--no-build')) {
  console.log('📱 Building the app (first time: 10+ minutes)…');
  run('npm ci', 'mobile');
  run('npx expo prebuild --platform android --no-install', 'mobile');
  // one phone, one CPU type: much faster than the store build
  const abi = execSync('adb shell getprop ro.product.cpu.abi').toString().trim() || 'arm64-v8a';
  run(`./gradlew assembleRelease -PreactNativeArchitectures=${abi}`, 'mobile/android');
  apk = 'mobile/android/app/build/outputs/apk/release/app-release.apk';
}
try {
  run(`bash tools/android-autotest.sh "${apk}" "${out}" ${trips}`);
} catch {
  process.exit(1);
}
