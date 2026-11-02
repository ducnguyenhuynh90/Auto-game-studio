// The app runs the web game's own code (../src: rules, scenes, 3D world) natively. Metro reads it from
// the repository root through the '@core/...' and '@web/...' aliases and plain relative imports.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const web = path.resolve(__dirname, '../src');
// tools/bot.mjs: the playtest bot, bundled for the autotest (src/autotest.ts)
config.watchFolders = [...(config.watchFolders ?? []), web, path.resolve(__dirname, '../tools')];
config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), '@core': path.join(web, 'core'), '@web': web };
// files outside this folder still resolve their packages from this folder's node_modules
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
// Browser-only packages the shared code loads behind build flags the app never sets (Firebase login,
// the old Capacitor glue): Metro still sees the import, so it gets an empty module.
const browserOnly = /^(firebase(\/|$)|@capacitor\/)/;
// Packages both the app and the shared code use (three.js, Supabase) come from this folder only: two
// copies of three.js would break the 3D layer.
const shared = /^(three|@supabase\/supabase-js)(\/|$)/;
const here = path.join(__dirname, 'index.ts');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (browserOnly.test(moduleName)) return { type: 'empty' };
  if (shared.test(moduleName)) return context.resolveRequest({ ...context, originModulePath: here }, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
