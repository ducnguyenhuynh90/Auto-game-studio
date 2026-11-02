// Sharing an invite: the phone's share sheet (Facebook, Messenger, Zalo, WhatsApp… whatever is installed)
// in the app (src/platform.ts hooks), the browser's share sheet where there is one, otherwise the clipboard.
import { platform } from '../platform';
import { cardBlob } from '../render/bragcard';

export type ShareResult = 'shared' | 'copied' | 'failed';

const cancelled = (e: unknown) => /cancel|abort|dismiss/i.test(String((e as Error)?.message ?? e));

export async function shareInvite(text: string, url: string): Promise<ShareResult> {
  try {
    if (platform.share) {
      if (await platform.share({ title: 'Mắm Village', text, url })) return 'shared';
    } else if (navigator.share) {
      await navigator.share({ title: 'Mắm Village', text, url });
      return 'shared';
    }
  } catch (e) {
    // closing the share sheet is not an error worth reporting
    if (cancelled(e)) return 'failed';
  }
  return (await copyText(`${text}\n${url}`)) ? 'copied' : 'failed';
}

/** Shares a picture (a brag card) with its message: the share sheet, or a download where there is none. */
export async function shareImage(card: HTMLCanvasElement, text: string, url: string): Promise<ShareResult> {
  try {
    if (platform.share) {
      const base64 = card.toDataURL('image/jpeg', 0.9).split(',')[1] ?? '';
      const ok = await platform.share({ title: 'Mắm Village', text: `${text} ${url}`, url, file: { base64, name: `mam-village-${Date.now()}.jpg` } });
      return ok ? 'shared' : 'failed';
    }
    const blob = await cardBlob(card);
    if (!blob) return shareInvite(text, url);
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
    if (cancelled(e)) return 'failed';
    return shareInvite(text, url);
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (platform.copy) return await platform.copy(text);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Opens a sharing page (e.g. Facebook's) outside the game. */
export async function openShareUrl(url: string): Promise<void> {
  if (platform.openUrl) platform.openUrl(url);
  else window.open(url, '_blank', 'noopener');
}

export const facebookShareUrl = (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
export const whatsappShareUrl = (text: string, url: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
export const xShareUrl = (text: string, url: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
