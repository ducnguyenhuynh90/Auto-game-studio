import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/** Emits sw.js with the exact list of built files to precache, versioned by their hashes. */
function serviceWorker(): Plugin {
  return {
    name: 'mam-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      files.push('manifest.webmanifest', 'icon-192.png', 'icon-512.png');
      const version = createHash('sha1').update(files.sort().join('|')).digest('hex').slice(0, 10);
      const src = readFileSync('src/sw/sw-template.js', 'utf8')
        .replace('self.__PRECACHE__', JSON.stringify(files.map((f) => `./${f}`)))
        .replace('self.__VERSION__', JSON.stringify(version));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

// ARTIFACT=1: one self-contained JS file for the claude.ai playtest page (no service worker there).
const artifact = process.env.ARTIFACT === '1';

// Social login ships only in self-hosted builds that have Firebase config (never in the artifact).
const firebase = !artifact && !!process.env.VITE_FIREBASE_API_KEY;

export default defineConfig({
  base: './',
  define: { __FIREBASE__: JSON.stringify(firebase) },
  plugins: artifact ? [] : [serviceWorker()],
  build: {
    outDir: artifact ? 'dist-artifact/build' : 'dist',
    rollupOptions: {
      // three.js changes far less often than game code: its own file stays cached across updates
      output: artifact ? { inlineDynamicImports: true } : { manualChunks: { three: ['three'] } },
    },
    chunkSizeWarningLimit: 700,
  },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
