// Live mode: the app on your USB-connected Android phone loads the game from the dev server on this
// computer, so every code change shows on the phone within seconds (no rebuild). Ctrl+C to stop.
//   npm run phone:live
// The phone reaches the Mac over the USB cable (adb reverse), so no Wi-Fi setup is needed.
// When you're done, run `npm run phone` once to put the normal (built-in) game back on the phone.
import { execSync, spawn } from 'node:child_process';

const PORT = 5173;
let serial;
try {
  serial = execSync('adb devices').toString().split('\n').slice(1).map((l) => l.split('\t')).find((p) => p[1]?.trim() === 'device')?.[0];
} catch {
  console.error('✗ adb not found. Run: npm run phone:setup (docs/PHONE_TESTING.md)');
  process.exit(1);
}
if (!serial) {
  console.error('✗ No phone found. Plug it in, unlock it, allow USB debugging, then check: adb devices');
  process.exit(1);
}

const dev = spawn('npx', ['vite', '--host', '--port', String(PORT), '--strictPort'], { stdio: 'inherit' });
const stop = () => {
  dev.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// cap run needs a built web folder to sync; build once if it's missing
try {
  execSync('test -f dist/index.html || npm run build', { stdio: 'inherit' });
  execSync(
    `npx cap run android --live-reload --host localhost --port ${PORT} --forwardPorts ${PORT}:${PORT} --target ${serial}`,
    { stdio: 'inherit' },
  );
  console.log(`\n📱 Live on the phone. Edit code in src/ and the phone reloads. Ctrl+C to stop.\n`);
} catch {
  console.error('✗ Installing on the phone failed (see above). docs/PHONE_TESTING.md → "When something goes wrong".');
  stop();
}
