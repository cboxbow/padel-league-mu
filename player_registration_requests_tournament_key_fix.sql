-- MPL player registration requests: tournament matching fix
-- Run once in Supabase SQL Editor if player_registration_requests already exists.

alter table public.player_registration_requests
  add column if not exists tournament_key text;

drop index if exists player_registration_requests_unique_pair;

create unique index if not exists player_registration_requests_unique_pair
  on public.player_registration_requests (
    coalesce(tournament_id::text, nullif(tournament_key, ''), tournament_name),
    pair_key
  );

create index if not exists player_registration_requests_tournament_key_idx
  on public.player_registration_requests (tournament_key, status, created_at desc);
