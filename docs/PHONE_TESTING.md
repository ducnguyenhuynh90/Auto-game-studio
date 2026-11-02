# Test the game on your Android phone from a Mac

Plug the phone into the Mac with USB. One command builds the app, installs it on the phone and opens it,
or has a bot play it there and report back.

## Once: set up the Mac and the phone (about 15 minutes)
```bash
git clone https://github.com/ducnguyenhuynh90/Auto-game-studio.git   # skip if you have it
cd Auto-game-studio
npm run phone:setup          # first time without Node: bash tools/mac-android-setup.sh
```
The script installs only what's missing: Homebrew, Node 22, Java 21, the Android SDK tools (adb) and
Android 16 (API 36). If Android Studio is already installed, the script uses its SDK. It saves the paths
in `~/.zshrc` and runs `npm ci`. Running it again is safe.

On the phone (once):
1. **Settings → About phone → tap "Build number" 7 times.** You'll see "You are now a developer". On
   Samsung it's under About phone → Software information.
2. **Settings → System → Developer options → USB debugging: on.** On Xiaomi, also turn on "Install via
   USB" and "USB debugging (Security settings)".
3. Plug the phone into the Mac with a cable that carries data. Unlock the phone and tap **Allow** on
   "Allow USB debugging?" (tick "Always allow from this computer").
4. Check: `adb devices` lists your phone as `device`. If it says `unauthorized`, look at the phone and tap
   Allow.

## Every day
| Command | What it does |
|---|---|
| `npm run phone` | Builds the game, installs the app on the phone and opens it (about 1 minute after the first build). |
| `npm run phone:live` | **Live mode.** The app on the phone loads the game from your Mac, so every saved code change shows on the phone within seconds. Ctrl+C to stop. Run `npm run phone` afterwards to put the normal built-in game back. |
| `npm run phone:test` | **Automatic test.** Builds and installs the app, then a bot plays the real game on the phone (3 fishing trips, jars, the market). It measures the frame rate and memory, collects errors and saves screenshots. |
| `npm run phone:logs` | The game's console and crash logs from the phone, live. |

`phone:test` options (put them after `--`):
```bash
npm run phone:test -- --trips 6 --shots        # longer run, a phone screenshot at each key moment
npm run phone:test -- --no-build               # test the app already on the phone (faster)
npm run phone:test -- --speed 1 --skill 0.4    # real speed, a clumsier player
npm run phone:test -- --device R58N123ABC      # pick a phone when several are plugged in (adb devices)
```
It prints a summary and writes `playtest-output/phone/report.json` plus screenshots. If there were
errors, the command exits with status 1, so you can use it in a script or as a check before a release.

```
━━━━━━━━ Phone test: Pixel 7, Android 15 ━━━━━━━━
Frame rate   village 58 fps · fishing 55 fps (graphics: high)
Memory       310 MB
Played       9 casts · 7 catches · 2 lost · 1 jars opened · 2 upgrades
Errors       none
```
(Example output. The numbers depend on the phone.)

## Your own progress is safe
The test plays a **fresh village in a separate save slot**. It doesn't read or change your real save,
it sends no analytics, it doesn't sync to the cloud, and the phone goes back to your own game when the
test ends. If a test is cut off halfway (cable pulled, Ctrl+C), close and reopen the app: test mode
lasts only until the app restarts.

## Which app gets tested
`npm run phone` and `phone:test` install a **debug build**. Only debug builds can be driven by the test;
store builds can't be inspected, by design. The debug build is signed with the same test key as the
GitHub test APK (`android-latest`), so it installs over that APK and keeps your progress.
If the **Play Store** version is on the phone, Android refuses the install
(`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). Uninstall it first, or test on another phone.

## When something goes wrong
- **`adb: command not found`:** open a new Terminal window (the setup saved the path in `~/.zshrc`), or
  run `npm run phone:setup` again.
- **No phone found / `unauthorized`:** unlock the phone and tap Allow. Try another cable; many charging
  cables carry no data. Then run `adb kill-server && adb devices`.
- **"Unable to locate a Java Runtime" / wrong Java:** run `npm run phone:setup` again, then open a new
  Terminal window.
- **"SDK location not found":** `npm run phone:setup` writes `mobile/android/local.properties` for you.
- **Live mode shows a blank screen:** the dev server must still be running (keep that Terminal open), and
  the phone must stay plugged in, because live mode uses the USB cable (`adb reverse`).
- **The test says "Could not inspect the app":** it's not a debug build. Run without `--no-build`.

## For the studio (agents)
- `tools/phone-test.mjs` uses Playwright's Android support (`_android`, already installed; no extra
  packages). It connects to the app's WebView over adb and reuses the same bot as `tools/playtest.mjs`
  (`tools/bot.mjs`).
- Test mode is `sessionStorage.mam_phone_test = '1'` (`src/core/testmode.ts`). It uses the save key
  `mam_save_phone_test`, keeps analytics in memory, and skips cloud sync and GA.
- Debug builds are inspectable because `capacitor.config.ts` leaves `webContentsDebuggingEnabled` unset.
  Release builds aren't inspectable.
- A cloud session can't reach a phone plugged into your Mac. To let Claude run these commands for you,
  connect the repository folder on the Mac with Remote Control (Claude desktop app → Settings → Claude
  Code → Remote Control, or `claude remote-control` in the folder).
