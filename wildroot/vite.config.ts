import { defineConfig } from 'vite';

// WILDROOT prototype: its own Vite root, separate from the Mắm Village game.
export default defineConfig({
  root: __dirname,
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { output: { inlineDynamicImports: true } } },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
