// The React Native app shares the game rules with the web game: src/core (pure TypeScript) is read from
// the repo root through the '@core/...' alias. Nothing in the web game changes.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const core = path.resolve(__dirname, '../../src/core');
// the web game's sound engine (src/render/audio.ts + ambience.ts) runs on react-native-audio-api
const web = path.resolve(__dirname, '../../src');
config.watchFolders = [...(config.watchFolders ?? []), web];
config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), '@core': core, '@web': web };
// files outside this folder still resolve their packages from this folder's node_modules
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
module.exports = config;
