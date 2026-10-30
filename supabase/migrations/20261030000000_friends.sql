-- Mắm Village: friends, invites and leaderboards.
-- Every player gets a short friend code. Friends add each other by code (or an invite link), compare
-- sauce on a friends board, visit each other's village, and see a world top list.
-- Invites pay game coins only (never money): the new player gets a welcome gift when they join
-- with a code, and the inviter gets a reward once the friend has made their first sale. Each reward
-- is claimed once, here on the server.
-- Privacy: friends see each other's display name. Everyone else sees "Captain " + the last 4
-- characters of the friend code. Visits show village facts, never the whole save.

-- ---------- friend codes ----------
create or replace function public.new_friend_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = c);
  end loop;
  return c;
end;
$$;

alter table public.profiles add column if not exists friend_code text;
alter table public.profiles add column if not exists invited_by uuid references auth.users (id) on delete set null;
update public.profiles set friend_code = public.new_friend_code() where friend_code is null;
alter table public.profiles alter column friend_code set default public.new_friend_code();
alter table public.profiles alter column friend_code set not null;
create unique index if not exists profiles_friend_code on public.profiles (friend_code);

-- players may update their own profile, but never their code or who invited them
create or replace function public.guard_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.friend_code := public.new_friend_code();
      new.invited_by := null;
    else
      new.friend_code := old.friend_code;
      new.invited_by := old.invited_by;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
for each row execute function public.guard_profile();

-- ---------- friends and referrals (written only through the functions below) ----------
create table if not exists public.friends (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists public.referrals (
  invitee uuid primary key references auth.users (id) on delete cascade,
  inviter uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  sale_paid boolean not null default false
);
create index if not exists referrals_inviter on public.referrals (inviter);

alter table public.friends enable row level security;
alter table public.referrals enable row level security;
drop policy if exists "friends: read own" on public.friends;
drop policy if exists "referrals: read own" on public.referrals;
create policy "friends: read own" on public.friends for select to authenticated using (user_id = auth.uid());
create policy "referrals: read own" on public.referrals for select to authenticated using (inviter = auth.uid() or invitee = auth.uid());

-- ---------- what other players may see of a save ----------
create or replace function public.best_degrees(state jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select coalesce(max(case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end), 0)
  from jsonb_each(coalesce(state -> 'cellar', '{}'::jsonb)) as e(k, v)
$$;

create or replace function public.dex_count(state jsonb) returns integer
language sql immutable set search_path = '' as $$
  select count(*)::int from jsonb_object_keys(case when jsonb_typeof(state -> 'dex') = 'object' then state -> 'dex' else '{}'::jsonb end)
$$;

create or replace function public.public_name(p public.profiles, viewer uuid) returns text
language sql stable set search_path = '' as $$
  select case
    when p.id = viewer or exists (select 1 from public.friends f where f.user_id = viewer and f.friend_id = p.id) then p.display_name
    else 'Captain ' || right(p.friend_code, 4)
  end
$$;

-- ---------- functions the game calls ----------
/** Called at every launch: creates the profile, records the sign-in method, keeps a chosen name. */
create or replace function public.touch_profile(provider_name text, social_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  prov text := case when provider_name in ('google', 'apple', 'facebook') then provider_name else 'anonymous' end;
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into public.profiles (id, provider) values (me, prov) on conflict (id) do nothing;
  update public.profiles set provider = prov, last_seen = now(),
    -- a first name from Google / Apple replaces the default, never a name the player chose
    display_name = case when display_name in ('Captain', 'Guest') and coalesce(trim(social_name), '') <> ''
                        then left(trim(social_name), 20) else display_name end
  where id = me;
end;
$$;

/** The captain name friends see (1-20 characters). */
create or replace function public.set_display_name(new_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  n text := regexp_replace(trim(coalesce(new_name, '')), '\s+', ' ', 'g');
begin
  if me is null then raise exception 'not signed in'; end if;
  if char_length(n) < 1 or char_length(n) > 20 then raise exception 'names are 1 to 20 characters'; end if;
  if n ~ '[<>{}\\]' or n ~* '(https?:|www\.)' then raise exception 'letters, numbers and spaces only'; end if;
  insert into public.profiles (id) values (me) on conflict (id) do nothing;
  update public.profiles set display_name = n where id = me;
  return n;
end;
$$;

/** The caller's code and invite status (creates the profile on first use). */
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
    -- a new village can join with a friend's invite during its first two weeks
    'can_redeem', p.invited_by is null and p.created_at > now() - interval '14 days',
    'friends', (select count(*) from public.friends where user_id = me),
    'invites', (select count(*) from public.referrals where inviter = me)
  );
end;
$$;

/** Makes two players friends (both ways). Returns the friend's display name. */
create or replace function public.add_friend(code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  other public.profiles;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into other from public.profiles where friend_code = upper(trim(code));
  if other.id is null then raise exception 'no player has that code'; end if;
  if other.id = me then raise exception 'that is your own code'; end if;
  if (select count(*) from public.friends where user_id = me) >= 100 then raise exception 'friend list is full (100)'; end if;
  insert into public.friends (user_id, friend_id) values (me, other.id), (other.id, me) on conflict do nothing;
  return other.display_name;
end;
$$;

create or replace function public.remove_friend(friend uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  delete from public.friends where (user_id = me and friend_id = friend) or (user_id = friend and friend_id = me);
end;
$$;

/** A new village joins with a friend's invite: once per player, in its first two weeks. */
create or replace function public.redeem_invite(code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  mine public.profiles;
  other public.profiles;
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into public.profiles (id) values (me) on conflict (id) do nothing;
  select * into mine from public.profiles where id = me for update;
  if mine.invited_by is not null then raise exception 'you already joined with an invite'; end if;
  if mine.created_at < now() - interval '14 days' then raise exception 'invites are for new villages (first 2 weeks)'; end if;
  select * into other from public.profiles where friend_code = upper(trim(code));
  if other.id is null then raise exception 'no player has that code'; end if;
  if other.id = me then raise exception 'that is your own code'; end if;
  update public.profiles set invited_by = other.id where id = me;
  insert into public.referrals (invitee, inviter) values (me, other.id);
  insert into public.friends (user_id, friend_id) values (me, other.id), (other.id, me) on conflict do nothing;
  return other.display_name;
end;
$$;

/** Invite rewards the caller hasn't collected yet: friends who joined with their code and made a first sale. */
create or replace function public.claim_invite_rewards() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  n integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  with due as (
    select r.invitee from public.referrals r
    join public.saves s on s.user_id = r.invitee
    where r.inviter = me and not r.sale_paid
      and coalesce((s.state -> 'stats' ->> 'sold')::numeric, 0) >= 1
    -- at most 50 paid invites per player
    limit greatest(0, 50 - (select count(*) from public.referrals where inviter = me and sale_paid))::int
  )
  update public.referrals r set sale_paid = true from due where r.invitee = due.invitee;
  get diagnostics n = row_count;
  return n;
end;
$$;

/** The caller and their friends, best sauce first. */
create or replace function public.friends_board() returns table (
  id uuid, name text, me boolean, best_degrees numeric, captain_level integer, brand_level integer,
  island_level integer, career_stage integer, dex integer, catches integer, last_seen timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.id = auth.uid(), public.best_degrees(s.state), coalesce(s.captain_level, 1),
    coalesce(s.brand_level, 0), coalesce(s.island_level, 1), coalesce((s.state -> 'career' ->> 'stage')::int, 0),
    public.dex_count(s.state), coalesce(s.catches, 0), p.last_seen
  from public.profiles p
  left join public.saves s on s.user_id = p.id
  where auth.uid() is not null
    and (p.id = auth.uid() or p.id in (select friend_id from public.friends where user_id = auth.uid()))
  order by 4 desc nulls last, 5 desc
$$;

/** The world's best sauces (top 20) plus the caller's own rank. Strangers are shown by code only. */
create or replace function public.top_board() returns table (rank bigint, name text, me boolean, best_degrees numeric, captain_level integer, brand_level integer)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select rank() over (order by public.best_degrees(s.state) desc, s.captain_level desc) as rk, p, s
    from public.saves s join public.profiles p on p.id = s.user_id
    where public.best_degrees(s.state) > 0
  )
  select rk, public.public_name(p, auth.uid()), (p).id = auth.uid(), public.best_degrees((s).state), (s).captain_level, (s).brand_level
  from ranked
  where auth.uid() is not null and (rk <= 20 or (p).id = auth.uid())
  order by rk
  limit 21
$$;

/** A friend's village for a visit: what anyone walking by could see, not the whole save. */
create or replace function public.visit_friend(friend uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r record;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.friends where user_id = me and friend_id = friend) then raise exception 'not your friend'; end if;
  select p.display_name, s.state, s.captain_level, s.brand_level, s.island_level into r
  from public.profiles p left join public.saves s on s.user_id = p.id where p.id = friend;
  return jsonb_build_object(
    'name', r.display_name,
    'captain_level', coalesce(r.captain_level, 1),
    'brand_level', coalesce(r.brand_level, 0),
    'island_level', coalesce(r.island_level, 1),
    'best_degrees', public.best_degrees(r.state),
    'cellar', coalesce(r.state -> 'cellar', '{}'::jsonb),
    'dex', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(case when jsonb_typeof(r.state -> 'dex') = 'object' then r.state -> 'dex' else '{}'::jsonb end) k),
    'buildings', (select coalesce(jsonb_agg(jsonb_build_object('id', b -> 'id', 'level', b -> 'level')), '[]'::jsonb)
                  from jsonb_array_elements(case when jsonb_typeof(r.state -> 'island' -> 'buildings') = 'array' then r.state -> 'island' -> 'buildings' else '[]'::jsonb end) b),
    'staff', jsonb_array_length(case when jsonb_typeof(r.state -> 'island' -> 'staff') = 'array' then r.state -> 'island' -> 'staff' else '[]'::jsonb end),
    'dog', coalesce((r.state -> 'dog' ->> 'house')::boolean, false),
    'sea', r.state ->> 'sea',
    'career_stage', coalesce((r.state -> 'career' ->> 'stage')::int, 0)
  );
end;
$$;

revoke all on function public.touch_profile(text, text) from public, anon;
revoke all on function public.set_display_name(text) from public, anon;
revoke all on function public.my_social() from public, anon;
revoke all on function public.add_friend(text) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.redeem_invite(text) from public, anon;
revoke all on function public.claim_invite_rewards() from public, anon;
revoke all on function public.friends_board() from public, anon;
revoke all on function public.top_board() from public, anon;
revoke all on function public.visit_friend(uuid) from public, anon;
grant execute on function public.touch_profile(text, text) to authenticated;
grant execute on function public.set_display_name(text) to authenticated;
grant execute on function public.my_social() to authenticated;
grant execute on function public.add_friend(text) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.claim_invite_rewards() to authenticated;
grant execute on function public.friends_board() to authenticated;
grant execute on function public.top_board() to authenticated;
grant execute on function public.visit_friend(uuid) to authenticated;
