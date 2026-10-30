// Brag cards: a 1080×1350 picture (the shape Facebook, Instagram and Zalo show largest) of the moment
// itself, with the headline, "Can you beat it?", the player's friend code and the free link. Every share
// is an invitation that carries its sender's code.
import { H, W } from './draw';

export interface BragCard {
  headline: string;
  sub: string;
  /** Friend code, when the player has an online account. */
  code: string | null;
  url: string;
  /** Which part of the 390×844 screen to show (logical units): the bottle, or the fish and its card. */
  crop: { y0: number; y1: number };
  accent: string;
}

const CW = 1080;
const CH = 1350;
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export function drawBragCard(shot: HTMLCanvasElement, card: BragCard): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CW;
  c.height = CH;
  const x = c.getContext('2d')!;
  // the moment: a crop of the (tall, narrow) screen at its own shape, over a soft blur of itself
  const sx = shot.width / W;
  const sy = shot.height / H;
  const ch = card.crop.y1 - card.crop.y0;
  const photoH = 1000;
  // the backdrop: drawn tiny, then stretched back up (a cheap blur, quick even on slow phones)
  const tiny = document.createElement('canvas');
  tiny.width = 27;
  tiny.height = 25;
  tiny.getContext('2d')!.drawImage(shot, 0, card.crop.y0 * sy, W * sx, ch * sy, 0, 0, tiny.width, tiny.height);
  x.imageSmoothingQuality = 'high';
  x.drawImage(tiny, -40, -40, CW + 80, photoH + 80);
  x.fillStyle = 'rgba(10,8,4,0.28)';
  x.fillRect(0, 0, CW, photoH);
  const w = Math.min(CW, (W * photoH) / ch);
  x.drawImage(shot, 0, card.crop.y0 * sy, W * sx, ch * sy, (CW - w) / 2, 0, w, photoH);
  // brand ribbon
  x.fillStyle = 'rgba(20,14,8,0.55)';
  x.fillRect(0, 0, CW, 96);
  x.font = `900 52px ${FONT}`;
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  x.lineJoin = 'round';
  x.lineWidth = 10;
  x.strokeStyle = '#2b2118';
  x.strokeText('Mắm Village', 36, 50);
  x.fillStyle = '#ffd34d';
  x.fillText('Mắm Village', 36, 50);
  x.font = `800 30px ${FONT}`;
  x.textAlign = 'right';
  x.fillStyle = '#fff';
  x.fillText('Phú Quốc, Vietnam', CW - 36, 50);
  // the panel with the words
  const g = x.createLinearGradient(0, photoH - 60, 0, CH);
  g.addColorStop(0, '#fff8ec');
  g.addColorStop(1, '#f4e3c3');
  x.fillStyle = g;
  x.beginPath();
  x.roundRect(0, photoH - 40, CW, CH - photoH + 40, [44, 44, 0, 0]);
  x.fill();
  x.fillStyle = card.accent;
  x.fillRect(0, photoH - 40, CW, 12);
  x.textAlign = 'center';
  fitText(x, card.headline, CW / 2, photoH + 60, 900, 72, '#2b2118');
  x.font = `800 40px ${FONT}`;
  x.fillStyle = 'rgba(43,33,24,0.8)';
  x.fillText(card.sub, CW / 2, photoH + 140);
  // the invitation
  x.fillStyle = '#5cb85c';
  x.beginPath();
  x.roundRect(90, photoH + 186, CW - 180, 120, 30);
  x.fill();
  x.lineWidth = 6;
  x.strokeStyle = '#2b2118';
  x.stroke();
  x.fillStyle = '#fff';
  x.font = `900 44px ${FONT}`;
  x.fillText(card.code ? `Play free · my code ${card.code}` : 'Play free in your browser', CW / 2, photoH + 232);
  // the link without its ?invite= part: the code is printed just above, and the full link travels with the post
  fitText(x, card.url.replace(/^https?:\/\//, '').replace(/\/?\?.*$/, ''), CW / 2, photoH + 276, CW - 240, 30, '#fff');
  return c;
}

/** Shrinks the font until the line fits. */
function fitText(x: CanvasRenderingContext2D, s: string, cx: number, cy: number, maxW: number, size: number, color: string): void {
  let f = size;
  do {
    x.font = `900 ${f}px ${FONT}`;
    f -= 2;
  } while (x.measureText(s).width > maxW && f > 18);
  x.fillStyle = color;
  x.fillText(s, cx, cy);
}

export function cardBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
}
