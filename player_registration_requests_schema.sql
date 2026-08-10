-- MPL player registration requests
-- Run once in Supabase SQL Editor before using public player registration requests.

create extension if not exists pgcrypto;

create table if not exists public.player_registration_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  tournament_id uuid,
  tournament_key text,
  tournament_name text not null,
  tournament_date date,
  category text,
  division text,
  region text,
  club_name text,

  player1_name text not null,
  player1_key text,
  player1_email text,
  player1_license text,
  player1_rank integer,
  player1_points integer,

  player2_name text not null,
  player2_key text,
  player2_rank integer,
  player2_points integer,

  pair_rank_sum integer,
  pair_key text not null,
  eligibility_label text,
  eligibility_detail text,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text
);

alter table public.player_registration_requests
  add column if not exists tournament_key text;

drop index if exists player_registration_requests_unique_pair;
create unique index if not exists player_registration_requests_unique_pair
  on public.player_registration_requests (
    coalesce(tournament_id::text, nullif(tournament_key, ''), tournament_name),
    pair_key
  );

create index if not exists player_registration_requests_tournament_idx
  on public.player_registration_requests (tournament_id, status, created_at desc);

create index if not exists player_registration_requests_tournament_key_idx
  on public.player_registration_requests (tournament_key, status, created_at desc);

create or replace function public.touch_player_registration_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_player_registration_requests_updated_at
  on public.player_registration_requests;

create trigger trg_player_registration_requests_updated_at
before update on public.player_registration_requests
for each row
execute function public.touch_player_registration_requests_updated_at();

alter table public.player_registration_requests enable row level security;

-- Remove current and older policy names before installing the secure set.
drop policy if exists player_registration_requests_insert_public on public.player_registration_requests;
drop policy if exists player_registration_requests_select_admin on public.player_registration_requests;
drop policy if exists player_registration_requests_update_admin on public.player_registration_requests;
drop policy if exists player_registration_requests_delete_admin on public.player_registration_requests;
drop policy if exists player_registration_requests_select_public on public.player_registration_requests;
drop policy if exists player_registration_requests_update_public on public.player_registration_requests;
drop policy if exists select_public on public.player_registration_requests;
drop policy if exists update_public on public.player_registration_requests;
drop policy if exists insert_public on public.player_registration_requests;
drop policy if exists anon_select on public.player_registration_requests;
drop policy if exists anon_update on public.player_registration_requests;
drop policy if exists public_read on public.player_registration_requests;
drop policy if exists public_update on public.player_registration_requests;

-- Public site can submit a pending request, but cannot read or edit the queue.
create policy player_registration_requests_insert_public
on public.player_registration_requests
for insert
to anon, authenticated
with check (
  status = 'pending'
  and length(trim(player1_name)) > 1
  and length(trim(player2_name)) > 1
  and length(trim(pair_key)) > 3
);

-- Admin panel reads/moderates requests only when the logged Supabase user has an admin role.
create policy player_registration_requests_select_admin
on public.player_registration_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'superadmin')
  )
);

create policy player_registration_requests_update_admin
on public.player_registration_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'superadmin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'superadmin')
  )
);

create policy player_registration_requests_delete_admin
on public.player_registration_requests
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'superadmin')
  )
);

-- Table privileges are still required in addition to RLS policies.
-- Public players can only submit pending requests. They cannot read or edit the queue.
grant usage on schema public to anon, authenticated;
grant insert on table public.player_registration_requests to anon, authenticated;

-- Authenticated users need table privileges; RLS keeps the actual access limited to admin/superadmin.
grant select, update, delete on table public.player_registration_requests to authenticated;

-- Keep anonymous visitors write-only for this queue.
revoke select, update, delete on table public.player_registration_requests from anon;
