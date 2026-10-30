// Sharing an invite: the phone's share sheet (Facebook, Messenger, Zalo, WhatsApp… whatever is installed)
// in the apps, the browser's share sheet where there is one, otherwise the clipboard.
const isNative = () => !!(window as unknown as { Capacitor?: { isNativePlatform?(): boolean } }).Capacitor?.isNativePlatform?.();

export type ShareResult = 'shared' | 'copied' | 'failed';

export async function shareInvite(text: string, url: string): Promise<ShareResult> {
  try {
    if (isNative()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: 'Mắm Village', text, url, dialogTitle: 'Invite a friend' });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title: 'Mắm Village', text, url });
      return 'shared';
    }
  } catch (e) {
    // closing the share sheet is not an error worth reporting
    if (String((e as Error)?.message ?? e).match(/cancel|abort/i)) return 'failed';
  }
  return (await copyText(`${text}\n${url}`)) ? 'copied' : 'failed';
}

/** Shares a picture (a brag card) with its message: the share sheet, or a download where there is none. */
export async function shareImage(blob: Blob, text: string, url: string): Promise<ShareResult> {
  try {
    if (isNative()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
      const file = await Filesystem.writeFile({ path: `mam-village-${Date.now()}.jpg`, data, directory: Directory.Cache });
      await Share.share({ title: 'Mắm Village', text: `${text} ${url}`, files: [file.uri], dialogTitle: 'Share' });
      return 'shared';
    }
    const file = new File([blob], 'mam-village.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Mắm Village', text: `${text} ${url}` });
      return 'shared';
    }
    // desktop browsers: save the picture, copy the message
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mam-village.jpg';
    document.body.append(a); // some browsers ignore clicks on links outside the page
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return (await copyText(`${text} ${url}`)) ? 'copied' : 'shared';
  } catch (e) {
    if (String((e as Error)?.message ?? e).match(/cancel|abort/i)) return 'failed';
    return shareInvite(text, url);
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (isNative()) {
      const { Clipboard } = await import('@capacitor/clipboard');
      await Clipboard.write({ string: text });
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Opens a sharing page (e.g. Facebook's) outside the game. */
export async function openShareUrl(url: string): Promise<void> {
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else window.open(url, '_blank', 'noopener');
}

export const facebookShareUrl = (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
export const whatsappShareUrl = (text: string, url: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
export const xShareUrl = (text: string, url: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
