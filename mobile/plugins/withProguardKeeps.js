// Expo config plugin: R8 keep rules for release builds (android.enableMinifyInReleaseBuilds is on). The native
// project is generated on every build (expo prebuild), so the rules live here, not in a committed
// proguard-rules.pro.
//  - expo-gl: its C++ calls GLContext.flush() by name over JNI and ships no keep rules, so R8 renamed it
//    and the app aborted on start ("JNI DETECTED ERROR: mid == null" in EXGLContextPrepare).
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const RULES = `
# expo-gl: methods called from C++ by name (plugins/withProguardKeeps.js)
-keep class expo.modules.gl.** { *; }
`;

function applyKeeps(rules) {
  if (rules.includes('plugins/withProguardKeeps.js')) return rules;
  return rules + RULES;
}

module.exports = function withProguardKeeps(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      fs.writeFileSync(file, applyKeeps(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''));
      return cfg;
    },
  ]);
};
module.exports.applyKeeps = applyKeeps;
