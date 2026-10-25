-- Mắm Village: player profiles and cloud saves.
-- Every player gets a Supabase auth user on first launch (anonymous sign-in); linking Google, Apple or
-- Facebook later keeps the same user id, so progress follows them to any device.
-- Privacy: we keep a display name and the sign-in method here. No email, no contacts, no location.
-- Row level security: each player can read and write only their own rows.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Captain' check (char_length(display_name) between 1 and 40),
  provider text not null default 'anonymous' check (provider in ('anonymous', 'google', 'apple', 'facebook')),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- the whole game save (src/core/state.ts GameState); the game only ever reads this column
  state jsonb not null,
  save_id text,
  rev integer not null default 0 check (rev >= 0),
  saved_at timestamptz not null default now(),
  -- a progress summary, for support and dashboards (written by the game alongside the state)
  captain_level integer not null default 1,
  coins bigint not null default 0,
  catches integer not null default 0,
  sea text,
  relics integer not null default 0,
  island_level integer not null default 1,
  brand_level integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint saves_state_size check (pg_column_size(state) < 512000)
);

create index if not exists saves_updated_at on public.saves (updated_at desc);

alter table public.profiles enable row level security;
alter table public.saves enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles: insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles: update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "saves: read own" on public.saves;
drop policy if exists "saves: insert own" on public.saves;
drop policy if exists "saves: update own" on public.saves;
create policy "saves: read own" on public.saves for select to authenticated using (user_id = auth.uid());
create policy "saves: insert own" on public.saves for insert to authenticated with check (user_id = auth.uid());
create policy "saves: update own" on public.saves for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- no delete policies: deleting the auth user (account deletion) cascades to both tables

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before update on public.saves
for each row execute function public.touch_updated_at();
