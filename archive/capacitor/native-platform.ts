// The Capacitor app's platform hooks. Only dynamic imports here, so the web build stays light.
import { setPlatform } from '../platform';

/** The Capacitor app's share sheet, clipboard and system browser (src/platform.ts). */
export function capacitorPlatform(): void {
  const name = (window as unknown as { Capacitor: { getPlatform(): string } }).Capacitor.getPlatform();
  setPlatform({
    name: name === 'ios' ? 'ios' : 'android',
    native: true,
    appScheme: 'com.mamvillage.app',
    async openAuthBrowser(url) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url, presentationStyle: 'popover' });
      return null; // the deep link brings the result back (initNative)
    },
    async share({ title, text, url, file }) {
      const { Share } = await import('@capacitor/share');
      if (file) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const saved = await Filesystem.writeFile({ path: file.name, data: file.base64, directory: Directory.Cache });
        await Share.share({ title, text, files: [saved.uri], dialogTitle: 'Share' });
      } else await Share.share({ title, text, url, dialogTitle: 'Invite a friend' });
      return true;
    },
    async copy(text) {
      const { Clipboard } = await import('@capacitor/clipboard');
      await Clipboard.write({ string: text });
      return true;
    },
    openUrl(url) {
      void import('@capacitor/browser').then(({ Browser }) => Browser.open({ url }));
    },
  });
}
