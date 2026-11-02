# Test the game on your Android phone from a Mac

Plug the phone into the Mac with USB. One command builds the app, installs it on the phone and opens it,
or has a bot play it there and report back.

## Once: set up the Mac and the phone (about 15 minutes)
```bash
git clone https://github.com/ducnguyenhuynh90/Auto-game-studio.git   # skip if you have it
cd Auto-game-studio
npm run phone:setup          # first time without Node: bash tools/mac-android-setup.sh
```
The script installs only what's missing: Homebrew, Node 22, Java 17, the Android SDK tools (adb) and
Android 16 (API 36). If Android Studio is already installed, the script uses its SDK. It saves the paths
in `~/.zshrc` and installs the game's and the app's packages. Running it again is safe.

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
| `npm run phone` | Builds the app (release), installs it on the phone and opens it. |
| `npm run phone:live` | **Live mode.** A debug build that loads the game's code from your Mac: every saved change in `src/` shows on the phone within seconds. Keep the Terminal open. |
| `npm run phone:test` | **Automatic test.** Builds and installs the app, then the playtest bot plays the real game natively on the phone (2 fishing trips, jars, the market). It reports the frame rate and any errors, and saves screenshots. |
| `npm run phone:logs` | The game's log and crash messages from the phone, live. |

`phone:test` options (put them after `--`):
```bash
npm run phone:test -- --trips 4          # a longer run
npm run phone:test -- --no-build         # test the app already on the phone (faster)
```
It prints a summary and writes `playtest-output/phone/report.json` plus screenshots. If there were
errors, the command exits with status 1, so you can use it in a script or as a check before a release.

```
Played: 6 casts, 5 catches, 1 jars opened · village 58 fps, playing 55 fps
```
(Example output. The numbers depend on the phone.)

## Your own progress is safe
The test opens the app with a test link (`com.mamvillage.app://play?autotest=2`). The game then plays a
**fresh village in a separate save slot**: it doesn't read or change your real save, sends no analytics
and doesn't sync to the cloud. Close and reopen the app afterwards to get your own game back.

## Which app gets tested
`phone:test` builds a release APK signed with the project's test key, the same key as the GitHub test
APK (`android-latest`), so the two install over each other. If the **Play Store** version is on the phone,
Android refuses the install (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`): uninstall it first, or use another phone.
The same test runs on every push in GitHub Actions, on an Android emulator (`native.yml`, job
`android-test`); its screenshots are in the `android-test-latest` release.

## When something goes wrong
- **`adb: command not found`:** open a new Terminal window (the setup saved the path in `~/.zshrc`), or
  run `npm run phone:setup` again.
- **No phone found / `unauthorized`:** unlock the phone and tap Allow. Try another cable; many charging
  cables carry no data. Then run `adb kill-server && adb devices`.
- **"Unable to locate a Java Runtime" / wrong Java / "SDK location not found":** run `npm run phone:setup`
  again, then open a new Terminal window.
- **Live mode shows a red error screen:** the Metro server must still be running (keep that Terminal
  open) and the phone plugged in.
- **The first build is slow:** 10 minutes or more is normal; later builds reuse most of the work.

## For the studio (agents)
- `mobile/src/autotest.ts` runs the shared bot (`tools/bot.mjs`) inside the app; `tools/android-autotest.sh`
  launches it over adb, takes screenshots and reads the report from the log (`MAM_AUTOTEST {json}`).
- Test mode: `globalThis.__MAM_PHONE_TEST__` (the app) or `sessionStorage.mam_phone_test` (the browser),
  read by `src/core/testmode.ts`: save key `mam_save_phone_test`, analytics kept in memory, no cloud sync, no GA.
- A cloud session can't reach a phone plugged into your Mac. To let Claude run these commands for you,
  connect the repository folder on the Mac with Remote Control (Claude desktop app → Settings → Claude
  Code → Remote Control, or `claude remote-control` in the folder).
