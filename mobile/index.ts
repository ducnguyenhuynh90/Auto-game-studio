// The app's entry. Order matters: the browser APIs the shared game code expects come first.
// URL / URLSearchParams with every method (invite links, sign-in return links)
import 'react-native-url-polyfill/auto';
// a synchronous localStorage (SQLite-backed) for saves, settings and analytics (src/core/save.ts)
import 'expo-sqlite/localStorage/install';
import { registerRootComponent } from 'expo';

console.log('MAM_STEP polyfills');

import App from './App';

registerRootComponent(App);
