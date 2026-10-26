// Build-time settings on top of app.json. CI sets the store version numbers from the run number
// (each store upload needs a higher one) and may override the app id when the founder picks the
// store listing (docs/STORE_RELEASE.md). Local builds get version 0.1.0 (1).
module.exports = ({ config }) => {
  const code = Number(process.env.MAM_VERSION_CODE || 1);
  const version = process.env.MAM_VERSION_NAME || config.version;
  const id = process.env.MAM_APP_ID || config.ios.bundleIdentifier;
  return {
    ...config,
    version,
    ios: { ...config.ios, bundleIdentifier: id, buildNumber: String(code) },
    android: { ...config.android, package: id, versionCode: code },
    plugins: [...config.plugins, './plugins/withReleaseSigning'],
  };
};
