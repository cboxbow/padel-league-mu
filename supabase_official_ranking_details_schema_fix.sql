alter table public.official_ranking_details
  add column if not exists event_date date,
  add column if not exists category text,
  add column if not exists club_name text,
  add column if not exists partner_name text,
  add column if not exists rank_label text;

create index if not exists official_ranking_details_player_division_idx
  on public.official_ranking_details (division, player_name);

create index if not exists official_ranking_details_batch_idx
  on public.official_ranking_details (batch_id);
