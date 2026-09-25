-- 3rd World (astra) — cloud saves + private admin.
-- Run this once in the Supabase SQL editor (or `supabase db push`).
-- Then: Authentication → Providers → enable "Anonymous sign-ins",
--       Authentication → Users → "Add user" with your admin email + a password.

-- ---------------------------------------------------------------- admins
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
-- nobody can read or change the admin list through the API; manage it in the SQL editor.

-- The only admin. Change or add rows here to grant access.
insert into public.admins (email) values ('aswiniishu33@gmail.com')
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------- players
create table if not exists public.players (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname_key text not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  admin_edited_at timestamptz,
  primary key (owner, nickname_key)
);
alter table public.players enable row level security;

-- each (anonymous) player sees and writes only their own saves
drop policy if exists "players own rows select" on public.players;
create policy "players own rows select" on public.players
  for select using (owner = auth.uid() or public.is_admin());

drop policy if exists "players own rows insert" on public.players;
create policy "players own rows insert" on public.players
  for insert with check (owner = auth.uid() or public.is_admin());

drop policy if exists "players own rows update" on public.players;
create policy "players own rows update" on public.players
  for update using (owner = auth.uid() or public.is_admin())
  with check (owner = auth.uid() or public.is_admin());

drop policy if exists "admin delete players" on public.players;
create policy "admin delete players" on public.players
  for delete using (public.is_admin());

-- ---------------------------------------------------------------- game content (admin overrides)
create table if not exists public.game_config (
  id int primary key default 1 check (id = 1),
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.game_config enable row level security;
insert into public.game_config (id) values (1) on conflict do nothing;

drop policy if exists "config readable by everyone" on public.game_config;
create policy "config readable by everyone" on public.game_config
  for select using (true);

drop policy if exists "config admin write" on public.game_config;
create policy "config admin write" on public.game_config
  for update using (public.is_admin()) with check (public.is_admin());
