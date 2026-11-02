// babel-preset-expo, plus the shared game code's Vite build settings (plugins/babel-vite-env.js).
const viteEnv = require('./plugins/babel-vite-env');

module.exports = function (api) {
  api.cache.using(viteEnv.cacheKey);
  return { presets: ['babel-preset-expo'], plugins: [viteEnv] };
};
