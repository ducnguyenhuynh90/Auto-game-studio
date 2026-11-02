#!/usr/bin/env bash
# One-time setup of a Mac to build Mắm Village for Android and run it / test it on a phone over USB.
#   npm run phone:setup        (or: bash tools/mac-android-setup.sh)
# Installs (only what's missing): Homebrew, Node 22, Java 21, the Android SDK command-line tools,
# platform-tools (adb), Android 16 (API 36) platform + build tools. Re-running it is safe.
# See docs/PHONE_TESTING.md.
set -euo pipefail

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script is for macOS. On Linux/Windows install Android Studio, then see docs/PHONE_TESTING.md."
  exit 1
fi
cd "$(dirname "$0")/.."

# --- Homebrew -------------------------------------------------------------------------------------------
if ! command -v brew >/dev/null 2>&1; then
  say "Installing Homebrew (it may ask for your Mac password)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -x /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)"; else eval "$(/usr/local/bin/brew shellenv)"; fi
fi
ok "Homebrew"
BREW_PREFIX="$(brew --prefix)"

# --- Node 22 --------------------------------------------------------------------------------------------
NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/v([0-9]+).*/\1/' || echo 0)"
if [[ "${NODE_MAJOR:-0}" -lt 20 ]]; then
  say "Installing Node 22"
  brew install node@22
  brew link --overwrite --force node@22 || true
fi
ok "Node $(node -v)"

# --- Java 21 (the Android build needs it) --------------------------------------------------------------
if ! /usr/libexec/java_home -v 21 >/dev/null 2>&1 && [[ ! -d "$BREW_PREFIX/opt/openjdk@21" ]]; then
  say "Installing Java 21"
  brew install openjdk@21
fi
if /usr/libexec/java_home -v 21 >/dev/null 2>&1; then
  JAVA_HOME_VALUE="$(/usr/libexec/java_home -v 21)"
else
  JAVA_HOME_VALUE="$BREW_PREFIX/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
fi
export JAVA_HOME="$JAVA_HOME_VALUE"
ok "Java 21 ($JAVA_HOME)"

# --- Android SDK ----------------------------------------------------------------------------------------
# Reuse Android Studio's SDK when it's installed, else install the command-line tools only.
if [[ -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME" ]]; then
  SDK="$ANDROID_HOME"
elif [[ -d "$HOME/Library/Android/sdk" ]]; then
  SDK="$HOME/Library/Android/sdk"
else
  SDK="$HOME/Library/Android/sdk"
  mkdir -p "$SDK"
fi
SDKMANAGER=""
for c in "$SDK/cmdline-tools/latest/bin/sdkmanager" "$BREW_PREFIX/share/android-commandlinetools/cmdline-tools/latest/bin/sdkmanager" "$(command -v sdkmanager 2>/dev/null || true)"; do
  [[ -n "$c" && -x "$c" ]] && SDKMANAGER="$c" && break
done
if [[ -z "$SDKMANAGER" ]]; then
  say "Installing the Android SDK command-line tools"
  brew install --cask android-commandlinetools
  SDKMANAGER="$BREW_PREFIX/share/android-commandlinetools/cmdline-tools/latest/bin/sdkmanager"
fi
export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
say "Installing Android platform-tools (adb), Android 16 (API 36) and build tools into $SDK"
yes | "$SDKMANAGER" --sdk_root="$SDK" --licenses >/dev/null || true
"$SDKMANAGER" --sdk_root="$SDK" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
export PATH="$SDK/platform-tools:$PATH"
ok "Android SDK ($SDK)"

# --- remember the settings in ~/.zshrc ------------------------------------------------------------------
RC="$HOME/.zshrc"
touch "$RC"
if ! grep -q '# >>> mam-village android >>>' "$RC"; then
  cat >>"$RC" <<EOF

# >>> mam-village android >>>
export JAVA_HOME="$JAVA_HOME_VALUE"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export PATH="\$ANDROID_HOME/platform-tools:\$PATH"
# <<< mam-village android <<<
EOF
  ok "Saved JAVA_HOME / ANDROID_HOME to ~/.zshrc (open a new Terminal window to pick them up)"
fi
# Gradle reads the SDK location from here too
echo "sdk.dir=$SDK" > mobile/android/local.properties

# --- the game's packages --------------------------------------------------------------------------------
say "Installing the game's packages (npm ci)"
npm ci
ok "Packages"

# --- the phone ------------------------------------------------------------------------------------------
say "Your phone"
cat <<'EOF'
  On the Android phone (once):
   1. Settings → About phone → tap "Build number" 7 times (you'll see "You are now a developer").
      (Samsung: Settings → About phone → Software information → Build number.)
   2. Settings → System → Developer options → turn on "USB debugging".
      (Xiaomi: also turn on "Install via USB" and "USB debugging (Security settings)".)
   3. Plug the phone into the Mac with a USB cable that carries data. Unlock it and tap
      "Allow" on "Allow USB debugging?" (tick "Always allow from this computer").
EOF
adb start-server >/dev/null 2>&1 || true
echo
adb devices -l
if adb devices | awk 'NR>1 && $2=="device"' | grep -q .; then
  ok "Phone connected. Next: npm run phone   (or npm run phone:test)"
elif adb devices | grep -q unauthorized; then
  echo "  ⚠ The phone is plugged in but not allowed yet: unlock it and tap Allow, then run: adb devices"
else
  echo "  ⚠ No phone yet. Do the steps above, then run: adb devices"
fi
