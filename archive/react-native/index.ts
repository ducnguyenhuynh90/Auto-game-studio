// Synchronous localStorage (SQLite-backed) for the shared rules' save and analytics (src/core/save.ts),
// installed before anything else loads. On the web build the browser's own localStorage is used.
import 'expo-sqlite/localStorage/install';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
