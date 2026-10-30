// Friends and invites: the rules, with no network. The server (supabase/migrations/*_friends.sql) decides
// who is friends with whom and which invite rewards are due; this module turns that into coins and text.
// Rewards are game coins only, never money and never random.
import { analytics } from './analytics';
import { RECIPES_BY_ID, tierFor } from './data';
import type { GadgetId } from './items';
import type { GameState } from './state';

/** Coins for a new player who joins with a friend's invite. */
export const WELCOME_GIFT = 300;
/** Coins for the inviter, per invited friend who has made their first sale (the server counts them). */
export const INVITE_REWARD = 500;

/** Where shared invite links point (the web build; the apps show the code to type in). */
export const GAME_URL = 'https://ducnguyenhuynh90.github.io/Auto-game-studio/';

export function inviteUrl(code: string, base = GAME_URL): string {
  return `${base}?invite=${encodeURIComponent(code)}`;
}

/** A friend code from a link or typed text: 6 letters/digits, upper case. */
export function parseInvite(text: string | null | undefined): string | null {
  if (!text) return null;
  const fromUrl = /[?&]invite=([A-Za-z0-9]{6})\b/.exec(text)?.[1];
  const raw = (fromUrl ?? text).trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6}$/.test(raw) ? raw : null;
}

/** Best sauce ever brewed (°N) and its recipe. */
export function bestSauce(s: Pick<GameState, 'cellar'>): { degrees: number; recipe: string | null } {
  let degrees = 0;
  let recipe: string | null = null;
  for (const [id, d] of Object.entries(s.cellar ?? {})) {
    if (d > degrees) [degrees, recipe] = [d, id];
  }
  return { degrees, recipe };
}

/** The message people share to Facebook, Messenger, Zalo… in the phone's language (Vietnamese or English). */
export function shareText(code: string, best: number, lang = 'en'): string {
  if (lang.startsWith('vi')) {
    const brag = best > 0 ? `Nước mắm của mình đạt ${best.toFixed(1)}°N. Bạn ủ ngon hơn được không? ` : '';
    return `${brag}Vào Mắm Village câu cá với mình nhé! Nhập mã ${code} để cả hai cùng nhận xu 🐟`;
  }
  const brag = best > 0 ? `My fish sauce is ${best.toFixed(1)}°N (${tierFor(best).name}). Can you brew better? ` : '';
  return `${brag}Come fish with me in Mắm Village! Join with my code ${code} and we both get coins 🐟`;
}

/** The words posted with a brag card. */
export function bragMessage(headline: string, code: string | null, lang = 'en'): string {
  if (lang.startsWith('vi')) return `${headline} Bạn có vượt được không? ${code ? `Nhập mã ${code} để cả hai cùng nhận xu 🐟` : 'Chơi miễn phí 🐟'}`;
  return `${headline} Can you beat it? ${code ? `Join with my code ${code} and we both get coins 🐟` : 'Play free 🐟'}`;
}

/** Who brewed the better sauce. */
export function tasteOff(mine: number, theirs: number): 'win' | 'lose' | 'tie' {
  if (Math.abs(mine - theirs) < 0.05) return 'tie';
  return mine > theirs ? 'win' : 'lose';
}

export function recipeName(id: string | null): string {
  return (id && RECIPES_BY_ID[id]?.name) || 'Fish sauce';
}

/** The new player's gift for joining with an invite (the server allows it once per player). */
export function grantWelcome(s: GameState, inviter: string): number {
  s.coins += WELCOME_GIFT;
  s.stats.earned += WELCOME_GIFT;
  analytics.track('invite_joined', { inviter_named: inviter !== 'Captain' });
  return WELCOME_GIFT;
}

/** The inviter's rewards for friends who made their first sale (n comes from the server, paid once). */
export function grantInviteRewards(s: GameState, n: number): number {
  if (n <= 0) return 0;
  const coins = n * INVITE_REWARD;
  s.coins += coins;
  s.stats.earned += coins;
  analytics.track('invite_reward', { friends: n, coins });
  return coins;
}

/** Coins in each daily gift from a friend (the server opens at most 10 a day). */
export const GIFT_COINS = 60;

/** Rewards for inviting friends who really play (made a first sale), on top of the per-friend reward. */
export const INVITE_MILESTONES: { friends: number; coins: number; gadgets: Partial<Record<GadgetId, number>>; title: string }[] = [
  { friends: 1, coins: 300, gadgets: { pearl: 2 }, title: 'First crewmate' },
  { friends: 3, coins: 1000, gadgets: { sonar: 3 }, title: 'Crew of three' },
  { friends: 5, coins: 2000, gadgets: { rocket: 3, octo: 2 }, title: 'Harbour host' },
  { friends: 10, coins: 5000, gadgets: { pearl: 5, octo: 5 }, title: 'Village legend' },
];

/** The next milestone to aim for, or null when all are reached. */
export function nextMilestone(played: number): (typeof INVITE_MILESTONES)[number] | null {
  return INVITE_MILESTONES.find((m) => m.friends > played) ?? null;
}

/** Pays every milestone reached and not yet paid (kept in the save). Returns what was paid. */
export function payMilestones(s: GameState, played: number): (typeof INVITE_MILESTONES)[number][] {
  const paid = s.social?.milestone ?? 0;
  const due = INVITE_MILESTONES.filter((m) => m.friends > paid && m.friends <= played);
  for (const m of due) {
    s.coins += m.coins;
    s.stats.earned += m.coins;
    for (const [g, n] of Object.entries(m.gadgets)) s.gadgets[g as GadgetId] = (s.gadgets[g as GadgetId] ?? 0) + (n ?? 0);
    analytics.track('invite_milestone', { friends: m.friends });
  }
  if (due.length) s.social = { ...(s.social ?? { milestone: 0 }), milestone: due[due.length - 1].friends };
  return due;
}

/** Gifts opened from friends (names come from the server, which pays each gift once). */
export function grantGifts(s: GameState, from: string[]): number {
  if (!from.length) return 0;
  const coins = from.length * GIFT_COINS;
  s.coins += coins;
  s.stats.earned += coins;
  analytics.track('gifts_opened', { n: from.length });
  return coins;
}

/** The headline on a brag card. */
export function bragHeadline(kind: 'sauce' | 'fish', degrees: number, what: string): string {
  if (kind === 'sauce') return `${degrees.toFixed(1)}°N ${tierFor(degrees).name} fish sauce!`;
  return `I caught a ${what}!`;
}
