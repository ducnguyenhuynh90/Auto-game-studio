// Expo config plugin: how Android release builds are signed. The native project is generated on every
// build (expo prebuild), so the signing setup lives here, not in a committed build.gradle.
//  - Google Play: the upload key from CI secrets / .env.local (docs/BUILD_FOR_STORES.md):
//      ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
//  - Test APKs (what testers sideload): the committed test key plugins/tester.keystore, so each new APK
//    installs over the last one and keeps the save. It is not the Play key and is not a secret.
//    Used when there's no upload key, or when MAM_SIGN=tester (CI builds the tester APK that way).
const { withAppBuildGradle } = require('expo/config-plugins');

const CONFIGS = `
        tester {
            // the test key (plugins/withReleaseSigning.js)
            storeFile file("\${rootDir}/../plugins/tester.keystore")
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            // Google Play upload key (plugins/withReleaseSigning.js)
            if (System.getenv("ANDROID_KEYSTORE_PATH")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }`;

// wrapped in parentheses: Groovy would otherwise pass only the condition to signingConfig
const CHOICE = '((System.getenv("ANDROID_KEYSTORE_PATH") && System.getenv("MAM_SIGN") != "tester") ? signingConfigs.release : signingConfigs.tester)';

function applySigning(gradle) {
  if (gradle.includes('plugins/withReleaseSigning.js')) return gradle;
  const debugBlock = /signingConfigs \{\s*\n\s*debug \{[^}]*\}/;
  if (!debugBlock.test(gradle)) throw new Error('withReleaseSigning: signingConfigs.debug not found in app/build.gradle');
  gradle = gradle.replace(debugBlock, (m) => m + CONFIGS);
  const releaseType = /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseType.test(gradle)) throw new Error('withReleaseSigning: release build type not found in app/build.gradle');
  return gradle.replace(releaseType, `$1signingConfig ${CHOICE}`);
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applySigning(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.applySigning = applySigning;
