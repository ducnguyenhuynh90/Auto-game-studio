// Friends, invites and leaderboards over Supabase (database functions in supabase/migrations/*_friends.sql).
// Only builds with Supabase config load this; every call needs the player's (anonymous or social) session.
import { rpc } from './supabase';

export interface MySocial {
  code: string;
  name: string;
  invited: boolean;
  /** A new village (first two weeks) that hasn't joined with an invite yet. */
  can_redeem: boolean;
  friends: number;
  invites: number;
}

export interface BoardRow {
  id: string;
  name: string;
  me: boolean;
  best_degrees: number;
  captain_level: number;
  brand_level: number;
  island_level: number;
  career_stage: number;
  dex: number;
  catches: number;
  last_seen: string;
}

export interface TopRow {
  rank: number;
  name: string;
  me: boolean;
  best_degrees: number;
  captain_level: number;
  brand_level: number;
}

export interface Visit {
  name: string;
  captain_level: number;
  brand_level: number;
  island_level: number;
  best_degrees: number;
  cellar: Record<string, number>;
  dex: string[];
  buildings: { id: string; level: number }[];
  staff: number;
  dog: boolean;
  sea: string | null;
  career_stage: number;
}

const num = <T extends object>(r: T): T => {
  const o = { ...r } as Record<string, unknown>;
  for (const k of ['best_degrees', 'rank']) if (k in o) o[k] = Number(o[k]);
  return o as T;
};

export const mySocial = () => rpc<MySocial>('my_social');
export const addFriend = (code: string) => rpc<string>('add_friend', { code });
export const removeFriend = (id: string) => rpc<void>('remove_friend', { friend: id });
export const redeemInvite = (code: string) => rpc<string>('redeem_invite', { code });
export const claimInviteRewards = () => rpc<number>('claim_invite_rewards');
export const setName = (name: string) => rpc<string>('set_display_name', { new_name: name });
export const friendsBoard = async () => (await rpc<BoardRow[]>('friends_board')).map(num);
export const topBoard = async () => (await rpc<TopRow[]>('top_board')).map(num);
export const visitFriend = async (id: string) => num(await rpc<Visit>('visit_friend', { friend: id }));
