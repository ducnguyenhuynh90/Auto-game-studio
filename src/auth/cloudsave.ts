// The cloud save in Supabase's public.saves table, without the Supabase client itself, so the web game
// (auth/supabase.ts) and the React Native app (mobile/src/cloud.ts) share it, and tests can pass a fake.
import { levelForXp } from '../core/progression';
import type { GameState } from '../core/state';
import type { SaveBlob } from './merge';

/** Where a player's save lives in the cloud (Supabase here, Firebase in auth/firebase.ts). */
export interface CloudBackend {
  load(): Promise<SaveBlob | null>;
  save(blob: SaveBlob): Promise<void>;
  signOut?(): Promise<void>;
}

/** The small part of the Supabase client this module uses (lets tests pass a fake). */
export interface DbLike {
  from(table: string): {
    select(cols: string): { eq(col: string, v: string): { maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }> } };
    upsert(row: Record<string, unknown>, opts?: { onConflict?: string }): PromiseLike<{ error: { message: string } | null }>;
  };
}

/** Progress summary written next to the save, so support and dashboards don't need to parse it. */
export function progressRow(s: GameState): Record<string, unknown> {
  const islandLevel = 1 + Math.floor(Math.max(0, (s.island?.owned.length ?? 6) - 6) / 3) + Math.floor((s.island?.buildings ?? []).reduce((a, b) => a + b.level, 0) / 3);
  return {
    captain_level: levelForXp(s.xp),
    coins: Math.round(s.coins),
    catches: s.stats.catches,
    sea: s.sea,
    relics: s.relics.length,
    island_level: islandLevel,
    brand_level: s.brand?.level ?? 0,
  };
}

/** Cloud save in public.saves (one row per player). */
export function makeBackend(db: DbLike, userId: string, signOut?: () => Promise<void>): CloudBackend {
  return {
    async load() {
      const { data, error } = await db.from('saves').select('state, saved_at').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data || typeof data.state !== 'object' || !data.state) return null;
      return { state: data.state as GameState, savedAt: Date.parse(String(data.saved_at)) || 0 };
    },
    async save(b) {
      const { error } = await db.from('saves').upsert(
        {
          user_id: userId,
          state: b.state,
          save_id: b.state.saveId ?? null,
          rev: b.state.rev ?? 0,
          saved_at: new Date(b.savedAt || Date.now()).toISOString(),
          ...progressRow(b.state),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw new Error(error.message);
    },
    signOut,
  };
}
