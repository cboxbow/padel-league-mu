-- Tables officielles pour import Excel / CSV des classements MPL.
-- A executer dans Supabase SQL Editor avant d'utiliser la page Admin > Import officiel.

alter table if exists public.rankings
  alter column points type numeric using points::numeric,
  add column if not exists tournaments_played integer not null default 0,
  add column if not exists trend text not null default 'same',
  add column if not exists season integer not null default 2026,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists rankings_division_idx
  on public.rankings (division);

create index if not exists rankings_division_rank_idx
  on public.rankings (division, rank);

create table if not exists public.official_ranking_imports (
  id uuid primary key,
  file_name text not null,
  row_count integer not null default 0,
  divisions text[] not null default '{}',
  status text not null default 'validated',
  created_at timestamptz not null default now()
);

alter table public.official_ranking_imports
  add column if not exists file_name text,
  add column if not exists source_file text,
  add column if not exists ranking_month date,
  add column if not exists row_count integer not null default 0,
  add column if not exists divisions text[] not null default '{}',
  add column if not exists status text not null default 'validated',
  add column if not exists created_at timestamptz not null default now();

update public.official_ranking_imports
set source_file = coalesce(source_file, file_name, 'import_officiel')
where source_file is null;

alter table public.official_ranking_imports
  alter column source_file set default 'import_officiel';

update public.official_ranking_imports
set ranking_month = coalesce(ranking_month, date '2026-01-01')
where ranking_month is null;

alter table public.official_ranking_imports
  alter column ranking_month set default date '2026-01-01';

create table if not exists public.official_rankings (
  id uuid primary key,
  import_id uuid not null references public.official_ranking_imports(id) on delete cascade,
  player_name text not null,
  rank integer not null,
  rank_before integer,
  points numeric not null default 0,
  division text not null check (division in ('men', 'women', 'junior', 'mixed')),
  tournaments_played integer not null default 0,
  trend text not null default 'same' check (trend in ('up', 'down', 'same')),
  season integer not null default 2026,
  is_current boolean not null default true,
  batch_id uuid,
  created_at timestamptz not null default now()
);

alter table public.official_rankings
  add column if not exists import_id uuid references public.official_ranking_imports(id) on delete cascade,
  add column if not exists player_name text,
  add column if not exists rank integer,
  add column if not exists rank_before integer,
  add column if not exists points numeric not null default 0,
  add column if not exists division text,
  add column if not exists tournaments_played integer not null default 0,
  add column if not exists trend text not null default 'same',
  add column if not exists season integer not null default 2026,
  add column if not exists is_current boolean not null default true,
  add column if not exists batch_id uuid,
  add column if not exists created_at timestamptz not null default now();

alter table public.official_rankings
  alter column import_id drop not null,
  alter column points type numeric using points::numeric;

create table if not exists public.official_ranking_details (
  id uuid primary key,
  import_id uuid references public.official_ranking_imports(id) on delete cascade,
  player_name text not null,
  division text not null check (division in ('men', 'women', 'junior', 'mixed')),
  event_name text not null,
  points numeric not null default 0,
  season integer not null default 2026,
  batch_id uuid,
  created_at timestamptz not null default now()
);

alter table public.official_ranking_details
  add column if not exists import_id uuid references public.official_ranking_imports(id) on delete cascade,
  add column if not exists player_name text,
  add column if not exists division text,
  add column if not exists event_name text,
  add column if not exists points numeric not null default 0,
  add column if not exists season integer not null default 2026,
  add column if not exists batch_id uuid,
  add column if not exists created_at timestamptz not null default now();

alter table public.official_ranking_details
  alter column import_id drop not null;

create index if not exists official_rankings_current_idx
  on public.official_rankings (division, is_current, rank);

create index if not exists official_rankings_batch_idx
  on public.official_rankings (batch_id, division, rank);

create index if not exists official_rankings_import_idx
  on public.official_rankings (import_id);

create index if not exists official_ranking_details_player_idx
  on public.official_ranking_details (division, player_name, points desc);

create index if not exists official_ranking_details_batch_idx
  on public.official_ranking_details (batch_id, division, player_name);

alter table public.official_ranking_imports enable row level security;
alter table public.official_rankings enable row level security;
alter table public.official_ranking_details enable row level security;

drop policy if exists "official ranking imports read" on public.official_ranking_imports;
drop policy if exists "official ranking imports write authenticated" on public.official_ranking_imports;
drop policy if exists "official ranking imports write admin client" on public.official_ranking_imports;
drop policy if exists "official rankings read" on public.official_rankings;
drop policy if exists "official rankings write authenticated" on public.official_rankings;
drop policy if exists "official rankings write admin client" on public.official_rankings;
drop policy if exists "official ranking details read" on public.official_ranking_details;
drop policy if exists "official ranking details write authenticated" on public.official_ranking_details;
drop policy if exists "official ranking details write admin client" on public.official_ranking_details;

create policy "official ranking imports read"
  on public.official_ranking_imports
  for select
  using (true);

create policy "official ranking imports write admin client"
  on public.official_ranking_imports
  for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "official rankings read"
  on public.official_rankings
  for select
  using (true);

create policy "official rankings write admin client"
  on public.official_rankings
  for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "official ranking details read"
  on public.official_ranking_details
  for select
  using (true);

create policy "official ranking details write admin client"
  on public.official_ranking_details
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.official_ranking_imports to anon, authenticated;
grant select, insert, update, delete on public.official_rankings to anon, authenticated;
grant select, insert, update, delete on public.official_ranking_details to anon, authenticated;
grant select, insert, update, delete on public.rankings to anon, authenticated;
