// The iOS / Android apps: the same game build wrapped by Capacitor (docs/NATIVE.md). Their native
// projects live in mobile/android and mobile/ios; `npm run cap:sync` copies the game into both.
// appId is the store identity: it can't change after the first store upload.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mamvillage.app',
  appName: 'Mắm Village',
  webDir: 'dist',
  backgroundColor: '#0e3d4f',
  android: {
    path: 'mobile/android',
    // the game draws everything itself; no text selection or overscroll glow
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    path: 'mobile/ios',
    contentInset: 'never',
    scrollEnabled: false,
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, launchAutoHide: true, backgroundColor: '#0e3d4f', showSpinner: false },
    StatusBar: { overlaysWebView: true, style: 'DARK' },
  },
};

export default config;
