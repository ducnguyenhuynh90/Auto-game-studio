// Web build only (Expo web, used for browser tests and previews): Skia draws through CanvasKit, a
// WebAssembly file that must be loaded before any Skia code runs. `npm run web:setup` copies it to public/.
// The app is required inside the callback (a plain require stays lazy in Metro; import() may not).
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { registerRootComponent } from 'expo';
import { maybeCompleteAuthSession } from 'expo-web-browser';

// a Google / Apple sign-in popup that came back here hands the answer to the game window and closes
const signInPopup = maybeCompleteAuthSession().type === 'success';

if (!signInPopup) void LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const App = require('./App').default;
  registerRootComponent(App);
});
