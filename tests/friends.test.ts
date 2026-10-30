import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Friends, invites and leaderboards (supabase/migrations/*_friends.sql), run in real Postgres as three players.
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
const one = async <T = Record<string, unknown>>(uid: string, sql: string) => (await as<T>(uid, sql))[0];
const save = (uid: string, cellar: Record<string, number>, sold: number) =>
  as(uid, `insert into public.saves (user_id, state, captain_level) values ('${uid}', '${JSON.stringify({ cellar, stats: { sold }, dex: { anchovy: {}, sardine: {} }, island: { buildings: [{ id: 'dock', level: 2, x: 1 }], staff: [{}, {}] }, career: { stage: 2 } })}', 3)
    on conflict (user_id) do update set state = excluded.state`);

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
}, 30_000);
afterAll(() => db.close());

describe('friends, invites and boards (Postgres)', () => {
  it('every player gets a unique 6-letter code that they cannot change', async () => {
    await as(A, `select public.touch_profile('google', 'Lan')`);
    await as(B, `select public.touch_profile(null, null)`);
    const a = await one<{ my_social: { code: string; name: string } }>(A, 'select public.my_social()');
    const b = await one<{ my_social: { code: string; name: string } }>(B, 'select public.my_social()');
    expect(a.my_social.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(a.my_social.code).not.toBe(b.my_social.code);
    expect(a.my_social.name).toBe('Lan');
    expect(b.my_social.name).toBe('Captain');
    // a direct write to the profile can't change the code or claim an inviter
    await as(A, `update public.profiles set friend_code = 'AAAAAA', invited_by = '${B}' where id = '${A}'`);
    const row = await one<{ friend_code: string; invited_by: string | null }>(A, 'select friend_code, invited_by from public.profiles');
    expect(row).toEqual({ friend_code: a.my_social.code, invited_by: null });
    // a chosen name sticks; the next launch's social first name doesn't overwrite it
    await as(B, `select public.set_display_name('  Captain   Tư ')`);
    await as(B, `select public.touch_profile('google', 'Someone')`);
    expect((await one<{ my_social: { name: string } }>(B, 'select public.my_social()')).my_social.name).toBe('Captain Tư');
    await expect(as(B, `select public.set_display_name('${'x'.repeat(21)}')`)).rejects.toThrow(/1 to 20/);
    await expect(as(B, `select public.set_display_name('visit www.spam.com')`)).rejects.toThrow(/letters/);
  });

  it('an invite makes both friends once; the inviter is paid once the friend has made a first sale', async () => {
    const code = (await one<{ my_social: { code: string } }>(A, 'select public.my_social()')).my_social.code;
    await expect(as(B, `select public.redeem_invite('NOPE22')`)).rejects.toThrow(/no player/);
    const bCode = (await one<{ my_social: { code: string } }>(B, 'select public.my_social()')).my_social.code;
    await expect(as(B, `select public.redeem_invite('${bCode}')`)).rejects.toThrow(/own code/);
    expect((await one<{ redeem_invite: string }>(B, `select public.redeem_invite(' ${code.toLowerCase()} ')`)).redeem_invite).toBe('Lan');
    await expect(as(B, `select public.redeem_invite('${code}')`)).rejects.toThrow(/already joined/);
    expect((await one<{ my_social: { friends: number; invited: boolean; can_redeem: boolean } }>(B, 'select public.my_social()')).my_social).toMatchObject({
      friends: 1,
      invited: true,
      can_redeem: false,
    });
    // nothing to claim until B has sold a bottle; then exactly once
    await save(B, { classic: 18 }, 0);
    expect((await one<{ claim_invite_rewards: number }>(A, 'select public.claim_invite_rewards()')).claim_invite_rewards).toBe(0);
    await save(B, { classic: 18 }, 1);
    expect((await one<{ claim_invite_rewards: number }>(A, 'select public.claim_invite_rewards()')).claim_invite_rewards).toBe(1);
    expect((await one<{ claim_invite_rewards: number }>(A, 'select public.claim_invite_rewards()')).claim_invite_rewards).toBe(0);
    // B can't pay themselves for inviting nobody
    expect((await one<{ claim_invite_rewards: number }>(B, 'select public.claim_invite_rewards()')).claim_invite_rewards).toBe(0);
  });

  it('old villages cannot join with an invite (new players only)', async () => {
    await as(C, `select public.my_social()`);
    await db.exec(`update public.profiles set created_at = now() - interval '30 days' where id = '${C}'`);
    const code = (await one<{ my_social: { code: string } }>(A, 'select public.my_social()')).my_social.code;
    expect((await one<{ my_social: { can_redeem: boolean } }>(C, 'select public.my_social()')).my_social.can_redeem).toBe(false);
    await expect(as(C, `select public.redeem_invite('${code}')`)).rejects.toThrow(/new villages/);
    // but anyone can add a friend by code
    expect((await one<{ add_friend: string }>(C, `select public.add_friend('${code}')`)).add_friend).toBe('Lan');
  });

  it('the friends board ranks me and my friends by best sauce; strangers are not on it', async () => {
    await save(A, { classic: 26.5, premium: 31.2 }, 4);
    const board = await as<{ name: string; me: boolean; best_degrees: string; dex: number; career_stage: number }>(A, 'select * from public.friends_board()');
    expect(board.map((r) => r.name)).toEqual(['Lan', 'Captain Tư', 'Captain']);
    expect(Number(board[0].best_degrees)).toBeCloseTo(31.2);
    expect(board[0]).toMatchObject({ me: true, dex: 2, career_stage: 2 });
    // B is friends with A only: C is a stranger to B
    expect((await as<{ name: string }>(B, 'select * from public.friends_board()')).map((r) => r.name)).toEqual(['Lan', 'Captain Tư']);
  });

  it('the world top list hides strangers behind their code; tables stay private', async () => {
    await save(C, { classic: 40 }, 2);
    const top = await as<{ rank: string; name: string; me: boolean }>(B, 'select * from public.top_board()');
    const cCode = (await one<{ my_social: { code: string } }>(C, 'select public.my_social()')).my_social.code;
    expect(top[0].name).toBe(`Captain ${cCode.slice(-4)}`); // C is not B's friend
    expect(top.find((r) => r.me)?.name).toBe('Captain Tư');
    expect(top.some((r) => r.name === 'Lan')).toBe(true); // A is B's friend
    // nobody reads other players' rows directly
    expect((await as(B, 'select * from public.saves')).length).toBe(1);
    expect((await as(B, 'select * from public.friends')).length).toBe(1);
    expect((await as(B, 'select * from public.profiles')).length).toBe(1);
    await expect(as(B, `insert into public.friends values ('${B}', '${C}')`)).rejects.toThrow(/row-level security/);
  });

  it('visiting shows a friend’s village facts, never the whole save; strangers can’t be visited', async () => {
    const v = (await one<{ visit_friend: Record<string, unknown> }>(B, `select public.visit_friend('${A}')`)).visit_friend;
    expect(v).toMatchObject({ name: 'Lan', captain_level: 3, staff: 2, career_stage: 2, buildings: [{ id: 'dock', level: 2 }] });
    expect(Number(v.best_degrees)).toBeCloseTo(31.2);
    expect(v).not.toHaveProperty('state');
    expect(JSON.stringify(v)).not.toContain('"x"');
    await expect(as(B, `select public.visit_friend('${C}')`)).rejects.toThrow(/not your friend/);
    await as(B, `select public.remove_friend('${A}')`);
    await expect(as(B, `select public.visit_friend('${A}')`)).rejects.toThrow(/not your friend/);
    expect((await as(A, 'select * from public.friends_board()')).map((r) => (r as { name: string }).name)).not.toContain('Captain Tư');
  });

  it('signed-out callers get nothing; deleting an account removes its friendships and invites', async () => {
    await db.exec(`set role anon;`);
    await expect(db.query('select public.my_social()')).rejects.toThrow(/permission denied/);
    await db.exec('reset role;');
    await as(B, 'select public.delete_my_account()');
    expect((await db.query(`select * from public.referrals where invitee = '${B}' or inviter = '${B}'`)).rows.length).toBe(0);
    expect((await db.query(`select * from public.friends where user_id = '${B}' or friend_id = '${B}'`)).rows.length).toBe(0);
  });
});
