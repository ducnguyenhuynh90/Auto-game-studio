// Expo config plugin: signs Android release builds with the Google Play upload key when CI provides it.
// The native project is generated on every build (expo prebuild), so the signing setup lives here, not in
// a committed build.gradle. Same environment variables as the Capacitor app's CI (docs/STORE_RELEASE.md):
//   ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
// Without them, release builds keep the debug key (installable on any phone, not accepted by Play).
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            // Google Play upload key, from CI secrets (plugins/withReleaseSigning.js)
            if (System.getenv("ANDROID_KEYSTORE_PATH")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }`;

function applySigning(gradle) {
  if (gradle.includes('withReleaseSigning')) return gradle;
  // 1) a release signing config next to the debug one
  const debugBlock = /signingConfigs \{\s*\n\s*debug \{[^}]*\}/;
  if (!debugBlock.test(gradle)) throw new Error('withReleaseSigning: signingConfigs.debug not found in app/build.gradle');
  gradle = gradle.replace(debugBlock, (m) => m + RELEASE_CONFIG);
  // 2) the release build type uses it when the key is there
  const releaseType = /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseType.test(gradle)) throw new Error('withReleaseSigning: release build type not found in app/build.gradle');
  return gradle.replace(releaseType, '$1signingConfig System.getenv("ANDROID_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug');
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applySigning(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.applySigning = applySigning;
