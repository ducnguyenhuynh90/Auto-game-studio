// The React Native app shares the game rules with the web game: src/core (pure TypeScript) is read from
// the repo root through the '@core/...' alias. Nothing in the web game changes.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const core = path.resolve(__dirname, '../src/core');
config.watchFolders = [...(config.watchFolders ?? []), core];
config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), '@core': core };
// files outside mobile/ still resolve their packages from mobile/node_modules
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
module.exports = config;
