import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { makeBackend, progressRow, type DbLike } from '../src/auth/supabase';
import { addCatch, newState } from '../src/core/state';

/** A tiny in-memory stand-in for the Supabase query builder. */
function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const upserts: Record<string, unknown>[] = [];
  const db: DbLike = {
    from: () => ({
      select: () => ({ eq: (_c, v) => ({ maybeSingle: async () => ({ data: rows.get(v) ?? null, error: null }) }) }),
      upsert: async (row) => {
        upserts.push(row);
        rows.set(String(row.user_id), { ...row });
        return { error: null };
      },
    }),
  };
  return { db, rows, upserts };
}

describe('Supabase cloud save', () => {
  it('saves the whole state plus a progress summary, and loads it back', async () => {
    const { db, upserts } = fakeDb();
    const s = newState();
    addCatch(s, 'anchovy', 10, 0.9);
    s.coins = 123;
    s.saveId = 'abc';
    s.rev = 7;
    const b = makeBackend(db, 'user-1');
    expect(await b.load()).toBeNull();
    await b.save({ state: s, savedAt: 1_700_000_000_000 });
    expect(upserts[0]).toMatchObject({ user_id: 'user-1', save_id: 'abc', rev: 7, coins: 123, catches: 1, sea: 'lagoon', captain_level: 1 });
    const back = await b.load();
    expect(back?.state.coins).toBe(123);
    expect(back?.savedAt).toBe(1_700_000_000_000);
  });

  it('progress summary never throws on old saves', () => {
    const s = newState() as unknown as Record<string, unknown>;
    delete s.brand;
    expect(progressRow(s as never).brand_level).toBe(0);
  });
});

describe('Supabase schema and row-level security (migration run in PGlite)', () => {
  it('each player can only read and write their own profile and save', async () => {
    const db = new PGlite();
    // the parts of Supabase the migration relies on
    await db.exec(`
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create role authenticated;
      create role anon;
      grant usage on schema public to authenticated;
      alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
    `);
    for (const f of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
    const a = '11111111-1111-1111-1111-111111111111';
    const b = '22222222-2222-2222-2222-222222222222';
    await db.exec(`insert into auth.users values ('${a}'), ('${b}');`);
    const as = async (uid: string, sql: string) => {
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
      try {
        return await db.query(sql);
      } finally {
        await db.exec('reset role;');
      }
    };
    // A writes their own rows
    await as(a, `insert into public.profiles (id, display_name) values ('${a}', 'Lan')`);
    await as(a, `insert into public.saves (user_id, state, rev) values ('${a}', '{"coins": 5}', 1)`);
    // A can't write B's rows
    await expect(as(a, `insert into public.saves (user_id, state) values ('${b}', '{}')`)).rejects.toThrow(/row-level security/);
    // B sees nothing of A
    expect((await as(b, 'select * from public.saves')).rows.length).toBe(0);
    expect((await as(b, 'select * from public.profiles')).rows.length).toBe(0);
    // B can't change A's save either (silently zero rows)
    await as(b, `update public.saves set rev = 99 where user_id = '${a}'`);
    expect(((await as(a, 'select rev from public.saves')).rows[0] as { rev: number }).rev).toBe(1);
    // A updates their save: updated_at moves, upsert works
    await as(a, `insert into public.saves (user_id, state, rev) values ('${a}', '{"coins": 9}', 2) on conflict (user_id) do update set state = excluded.state, rev = excluded.rev`);
    const row = (await as(a, 'select state, rev from public.saves')).rows[0] as { state: { coins: number }; rev: number };
    expect(row.rev).toBe(2);
    expect(row.state.coins).toBe(9);
    await as(b, `insert into public.saves (user_id, state) values ('${b}', '{}')`);
    // a player deletes their own account from the app: their rows go, nobody else's
    await as(a, 'select public.delete_my_account()');
    expect((await db.query(`select * from auth.users where id = '${a}'`)).rows.length).toBe(0);
    expect((await db.query('select user_id from public.saves')).rows).toEqual([{ user_id: b }]);
    expect((await db.query('select * from public.profiles')).rows.length).toBe(0);
    // signed-out callers can't run it (and it never deletes anyone else)
    await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
    await expect(db.query('select public.delete_my_account()')).rejects.toThrow(/not signed in/);
    await db.exec('set role anon;');
    await expect(db.query('select public.delete_my_account()')).rejects.toThrow(/permission denied/);
    await db.exec('reset role;');
    expect((await db.query('select user_id from public.saves')).rows).toEqual([{ user_id: b }]);
    await db.close();
  }, 30_000);
});

describe('account helpers shared by the web game and the app (auth/cloudsave.ts)', () => {
  it('finds the linked social provider; anonymous users have none', async () => {
    const { providerOf } = await import('../src/auth/cloudsave');
    expect(providerOf({ identities: [] })).toBeNull();
    expect(providerOf({ identities: [{ provider: 'email' }, { provider: 'apple' }] })).toBe('apple');
    expect(providerOf({ identities: null })).toBeNull();
  });

  it('greets by first name, or Captain', async () => {
    const { nameOf } = await import('../src/auth/cloudsave');
    expect(nameOf({ user_metadata: { full_name: 'Lan Nguyen' } })).toBe('Lan');
    expect(nameOf({ user_metadata: { name: 'Hạnh' } })).toBe('Hạnh');
    expect(nameOf({ user_metadata: {} })).toBe('Captain');
  });
});
