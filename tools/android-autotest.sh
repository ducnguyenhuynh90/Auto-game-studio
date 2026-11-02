#!/usr/bin/env bash
# The playtest bot plays the Android app natively, on an emulator (CI) or a phone plugged in over USB.
#   bash tools/android-autotest.sh [app.apk] [out-dir] [trips]
# Installs the APK when one is given, opens the app with its autotest link (mobile/src/autotest.ts: test
# mode, its own save slot, no cloud sync, no analytics sent), takes a screenshot every few seconds and
# writes the bot's report (what it played, frame rate, errors) to <out-dir>/report.json.
# Exit code 1 when the app crashed, no report came, or the report lists errors.
set -u
APK="${1:-}"
OUT="${2:-playtest-output/android}"
TRIPS="${3:-2}"
PKG=com.mamvillage.app
mkdir -p "$OUT"
rm -f "$OUT"/*.png "$OUT"/report.json

if [ -n "$APK" ]; then
  echo "Installing $APK"
  adb install -r "$APK" || { adb uninstall "$PKG" >/dev/null 2>&1; adb install "$APK"; } || exit 1
fi
adb logcat -c
adb shell am force-stop "$PKG"
adb shell input keyevent KEYCODE_WAKEUP
adb shell am start -W -a android.intent.action.VIEW -d "$PKG://play?autotest=$TRIPS" "$PKG"

shot=0
for i in $(seq 1 180); do
  sleep 10
  shot=$((shot + 1))
  adb exec-out screencap -p > "$OUT/$(printf %03d $shot).png" 2>/dev/null
  adb logcat -d -s ReactNativeJS:V > "$OUT/js.log" 2>/dev/null
  grep -q "MAM_AUTOTEST_DONE" "$OUT/js.log" && break
  if [ -z "$(adb shell pidof "$PKG" | tr -d '\r')" ]; then
    echo "::error::The app is no longer running (crash?)"
    break
  fi
done
adb logcat -d > "$OUT/logcat.txt"
grep -o 'MAM_AUTOTEST {.*' "$OUT/js.log" | head -1 | sed 's/^MAM_AUTOTEST //' > "$OUT/report.json"

echo "---- moments the bot reached ----"
grep -o 'MAM_SHOT .*' "$OUT/js.log" | sed 's/MAM_SHOT //' | tr '\n' ' '
echo
echo "---- JavaScript errors and warnings ----"
grep -E " [EW] ReactNativeJS" "$OUT/logcat.txt" | grep -v MAM_ | head -40
echo "---- app start-up steps ----"
grep -o 'MAM_STEP .*' "$OUT/js.log" | head -30
echo "---- native crashes (with the crash backtrace) ----"
grep -E "FATAL EXCEPTION|AndroidRuntime: |libc +: Fatal|SIGSEGV|F DEBUG" "$OUT/logcat.txt" | head -80
echo "---- last app log lines ----"
grep -E "ReactNative|expo|Skia|EXGL|GLView|mamvillage" "$OUT/logcat.txt" | tail -40

if [ ! -s "$OUT/report.json" ]; then
  echo "::error::No autotest report (see $OUT/logcat.txt)"
  exit 1
fi
echo "---- report ----"
cat "$OUT/report.json"
echo
node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const c = r.counts || {};
console.log(`Played: ${c.cast} casts, ${c.catch} catches, ${c.jar_open} jars opened · village ${r.fps?.village?.fps ?? "?"} fps, playing ${r.fps?.play?.fps ?? "?"} fps`);
if ((r.errors || []).length) { console.log("Errors:\n- " + r.errors.join("\n- ")); process.exit(1); }
if (!c.catch) { console.log("The bot caught nothing"); process.exit(1); }
' "$OUT/report.json"
