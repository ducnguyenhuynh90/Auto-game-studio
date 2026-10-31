# Mắm Village: React Native app (ARCHIVED)

> Not shipped (D-030). The mobile app is [`../../mobile/`](../../mobile/README.md). This version is kept for
> reference; paths below that say `mobile` mean this folder, and the shared rules are `../../src/core`.

Expo SDK 58 · React Native 0.88 · React 19.3 · Skia 2.14. The rules are shared with the web game
(`../../src/core`), so both play exactly the same. Full guide: [../../docs/REACT_NATIVE.md](../../docs/REACT_NATIVE.md).

**Building for Google Play / the App Store:** [../../docs/BUILD_FOR_STORES.md](../../docs/BUILD_FOR_STORES.md)
(`cp .env.example .env.local`, then `npm run release:android`, or `npm run native:ios` and archive in Xcode).

```bash
cd mobile
npm ci
npx expo start            # scan the QR code with a development build, or press a / i for an emulator
npm run typecheck
npm run bundle:check      # Hermes bundles for Android + iOS
npm run web:setup && npx expo export --platform web --output-dir /tmp/rn-web   # browser preview / tests
```
