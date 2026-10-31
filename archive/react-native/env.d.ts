// The shared rules (../../src/core) read one optional build setting through import.meta.env (Vite on the web).
// In the app it is always unset; babel-preset-expo rewrites import.meta for Hermes.
interface ImportMetaEnv {
  readonly VITE_ANALYTICS_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
