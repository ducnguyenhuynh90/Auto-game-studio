# Mắm Village: React Native app

Expo SDK 58 · React Native 0.88 · React 19.3 · Skia 2.14. The rules are shared with the web game
(`../src/core`), so both play exactly the same. Full guide: [../docs/REACT_NATIVE.md](../docs/REACT_NATIVE.md).

```bash
cd mobile
npm ci
npx expo start            # scan the QR code with a development build, or press a / i for an emulator
npm run typecheck
npm run bundle:check      # Hermes bundles for Android + iOS
npm run web:setup && npx expo export --platform web --output-dir /tmp/rn-web   # browser preview / tests
```
