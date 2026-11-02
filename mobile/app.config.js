// Build-time settings on top of app.json. CI sets the version numbers from the run number (each store
// upload needs a higher one). MAM_APP_ID can change the app id (it can't change after the first store
// upload: com.mamvillage.app). Local builds get version 1.0.0 (1).
module.exports = ({ config }) => {
  const code = Number(process.env.MAM_VERSION_CODE || 1);
  const version = process.env.MAM_VERSION_NAME || config.version;
  const id = process.env.MAM_APP_ID || config.android.package;
  return {
    ...config,
    version,
    scheme: id,
    ios: { ...config.ios, bundleIdentifier: id, buildNumber: String(code) },
    android: { ...config.android, package: id, versionCode: code },
    plugins: [...config.plugins, './plugins/withReleaseSigning'],
  };
};
