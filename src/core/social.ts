// Friends and invites: the rules, with no network. The server (supabase/migrations/*_friends.sql) decides
// who is friends with whom and which invite rewards are due; this module turns that into coins and text.
// Rewards are game coins only, never money and never random.
import { analytics } from './analytics';
import { RECIPES_BY_ID, tierFor } from './data';
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

/** The message people share to Facebook, Messenger, Zalo… */
export function shareText(code: string, best: number): string {
  const brag = best > 0 ? `My fish sauce is ${best.toFixed(1)}°N (${tierFor(best).name}). Can you brew better? ` : '';
  return `${brag}Come fish with me in Mắm Village! Join with my code ${code} and we both get coins 🐟`;
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
