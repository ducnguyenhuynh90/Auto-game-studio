import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The viral loop on the server (supabase/migrations/*_viral.sql): invite previews, daily gifts, milestones.
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
let db: PGlite;
async function as<T = Record<string, unknown>>(uid: string, sql: string): Promise<T[]> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return (await db.query(sql)).rows as T[];
  } finally {
    await db.exec('reset role;');
  }
}
const val = async <T>(uid: string, fn: string): Promise<T> => Object.values((await as(uid, `select public.${fn}`))[0])[0] as T;

beforeAll(async () => {
  db = new PGlite();
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
  await db.exec(`insert into auth.users values ('${A}'), ('${B}'), ('${C}');`);
  await as(A, `select public.set_display_name('Lan')`);
  await as(A, `insert into public.saves (user_id, state, captain_level) values ('${A}', '{"cellar": {"classic": 31.2}}', 9)`);
  await as(B, 'select public.my_social()');
  await as(C, 'select public.my_social()');
}, 30_000);
afterAll(() => db.close());

describe('viral loop (Postgres)', () => {
  it('an invite code greets the new player with the inviter’s name and best sauce', async () => {
    const code = (await val<{ code: string }>(A, 'my_social()')).code;
    const p = await val<{ name: string; best_degrees: number; captain_level: number }>(B, `invite_preview('${code.toLowerCase()}')`);
    expect(p).toMatchObject({ name: 'Lan', captain_level: 9 });
    expect(Number(p.best_degrees)).toBeCloseTo(31.2);
    expect(await val(B, `invite_preview('ZZZZZZ')`)).toBeNull();
  });

  it('gifts: one per friend per day, opened once, at most 10 a day; strangers get none', async () => {
    const aCode = (await val<{ code: string }>(A, 'my_social()')).code;
    await as(B, `select public.redeem_invite('${aCode}')`);
    await as(C, `select public.add_friend('${aCode}')`);
    expect(await val<number>(A, 'send_gifts()')).toBe(2);
    expect(await val<number>(A, 'send_gifts()')).toBe(0); // already sent today
    expect(await val<{ unsent: number; friends: number }>(A, 'gift_status()')).toMatchObject({ unsent: 0, friends: 2 });
    expect(await val<{ waiting: number }>(B, 'gift_status()')).toMatchObject({ waiting: 1 });
    expect(await val<string[]>(B, 'open_gifts()')).toEqual(['Lan']);
    expect(await val<string[]>(B, 'open_gifts()')).toEqual([]);
    // B and C are not friends: B's gifts only reach A
    expect(await val<number>(B, 'send_gifts()')).toBe(1);
    expect(await val<{ waiting: number }>(C, 'gift_status()')).toMatchObject({ waiting: 1 });
    // the daily limit: 12 waiting gifts open 10 today
    for (let d = 1; d <= 12; d++) await db.exec(`insert into public.gifts (sender, receiver, day) values ('${B}', '${A}', current_date - ${d})`);
    expect((await val<string[]>(A, 'open_gifts()')).length).toBe(10);
    expect((await val<string[]>(A, 'open_gifts()')).length).toBe(0);
    // nobody can write gifts directly or read other people's
    await expect(as(C, `insert into public.gifts (sender, receiver) values ('${C}', '${B}')`)).rejects.toThrow(/row-level security/);
    expect((await as(C, 'select * from public.gifts')).every((g) => (g as { receiver: string; sender: string }).receiver === C || (g as { sender: string }).sender === C)).toBe(true);
  });

  it('milestones count invited friends who really played', async () => {
    expect((await val<{ played: number; invites: number }>(A, 'my_social()'))).toMatchObject({ invites: 1, played: 0 });
    await as(B, `insert into public.saves (user_id, state) values ('${B}', '{"stats": {"sold": 1}}')`);
    expect(await val<number>(A, 'claim_invite_rewards()')).toBe(1);
    expect((await val<{ played: number }>(A, 'my_social()')).played).toBe(1);
  });
});
