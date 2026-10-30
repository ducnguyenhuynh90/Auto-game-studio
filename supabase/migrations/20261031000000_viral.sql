-- Mắm Village: the viral loop on top of friends (20261030000000_friends.sql).
--  * invite_preview: an invite link greets the new player by the inviter's name and best sauce.
--  * daily gifts: each player can send every friend one gift a day; opening gifts pays coins in game.
--    It gives friends a reason to come back every day, and to have more friends.
--  * invite milestones: my_social also reports how many invited friends really played (made a sale).
-- Game coins only. The server decides what is due and pays each gift once.

/** Who sent this invite: name, best sauce, captain level (any signed-in player holding the code). */
create or replace function public.invite_preview(code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
  s public.saves;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into p from public.profiles where friend_code = upper(trim(code));
  if p.id is null then return null; end if;
  select * into s from public.saves where user_id = p.id;
  return jsonb_build_object('name', p.display_name, 'best_degrees', public.best_degrees(s.state), 'captain_level', coalesce(s.captain_level, 1));
end;
$$;

-- ---------- daily gifts ----------
create table if not exists public.gifts (
  id bigint generated always as identity primary key,
  sender uuid not null references auth.users (id) on delete cascade,
  receiver uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  opened_at timestamptz,
  unique (sender, receiver, day)
);
create index if not exists gifts_receiver on public.gifts (receiver) where opened_at is null;
alter table public.gifts enable row level security;
drop policy if exists "gifts: read own" on public.gifts;
create policy "gifts: read own" on public.gifts for select to authenticated using (sender = auth.uid() or receiver = auth.uid());

/** Sends today's gift to every friend who hasn't had one from me today. Returns how many were sent. */
create or replace function public.send_gifts() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  n integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into public.gifts (sender, receiver)
  select me, f.friend_id from public.friends f where f.user_id = me
  on conflict (sender, receiver, day) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

/** Opens waiting gifts (at most 10 a day, oldest first) and returns who sent them. */
create or replace function public.open_gifts() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  room integer;
  names jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  select greatest(0, 10 - count(*))::int into room from public.gifts where receiver = me and opened_at >= date_trunc('day', now());
  with opened as (
    update public.gifts g set opened_at = now()
    where g.id in (select id from public.gifts where receiver = me and opened_at is null order by id limit room)
    returning g.sender
  )
  select coalesce(jsonb_agg(coalesce(p.display_name, 'A friend')), '[]'::jsonb) into names
  from opened o left join public.profiles p on p.id = o.sender;
  return names;
end;
$$;

/** Today's gift state: did I send yet, how many wait for me (beyond today's limit they wait for tomorrow). */
create or replace function public.gift_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  return jsonb_build_object(
    'friends', (select count(*) from public.friends where user_id = me),
    'unsent', (select count(*) from public.friends f where f.user_id = me
               and not exists (select 1 from public.gifts g where g.sender = me and g.receiver = f.friend_id and g.day = current_date)),
    'waiting', (select count(*) from public.gifts where receiver = me and opened_at is null)
  );
end;
$$;

-- ---------- my_social, now with invite milestones ----------
create or replace function public.my_social() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  p public.profiles;
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into public.profiles (id) values (me) on conflict (id) do nothing;
  select * into p from public.profiles where id = me;
  return jsonb_build_object(
    'code', p.friend_code,
    'name', p.display_name,
    'invited', p.invited_by is not null,
    'can_redeem', p.invited_by is null and p.created_at > now() - interval '14 days',
    'friends', (select count(*) from public.friends where user_id = me),
    'invites', (select count(*) from public.referrals where inviter = me),
    -- invited friends who really played (made a first sale): what invite milestones count
    'played', (select count(*) from public.referrals where inviter = me and sale_paid)
  );
end;
$$;

revoke all on function public.invite_preview(text) from public, anon;
revoke all on function public.send_gifts() from public, anon;
revoke all on function public.open_gifts() from public, anon;
revoke all on function public.gift_status() from public, anon;
grant execute on function public.invite_preview(text) to authenticated;
grant execute on function public.send_gifts() to authenticated;
grant execute on function public.open_gifts() to authenticated;
grant execute on function public.gift_status() to authenticated;
