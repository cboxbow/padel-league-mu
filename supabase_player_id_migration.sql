-- MPL player_id migration
-- Additive and idempotent: keeps existing name columns and adds stable player references.

alter table public.tournament_results
  add column if not exists player1_id uuid null,
  add column if not exists player2_id uuid null;

alter table public.historical_tournament_results
  add column if not exists player1_id uuid null,
  add column if not exists player2_id uuid null;

alter table public.rankings
  add column if not exists player_id uuid null;

alter table public.official_rankings
  add column if not exists player_id uuid null;

alter table public.official_ranking_details
  add column if not exists player_id uuid null;

alter table public.player_registration_requests
  add column if not exists player1_id uuid null,
  add column if not exists player2_id uuid null,
  add column if not exists pair_points numeric null;

create index if not exists idx_tournament_results_player1_id
  on public.tournament_results (player1_id);
create index if not exists idx_tournament_results_player2_id
  on public.tournament_results (player2_id);
create index if not exists idx_historical_tournament_results_player1_id
  on public.historical_tournament_results (player1_id);
create index if not exists idx_historical_tournament_results_player2_id
  on public.historical_tournament_results (player2_id);
create index if not exists idx_rankings_player_id_division
  on public.rankings (player_id, division);
create index if not exists idx_official_rankings_player_id_division_current
  on public.official_rankings (player_id, division, is_current);
create index if not exists idx_official_ranking_details_player_id_division
  on public.official_ranking_details (player_id, division);
create index if not exists idx_player_registration_requests_player_ids
  on public.player_registration_requests (player1_id, player2_id);

alter table public.tournament_results
  drop constraint if exists tournament_results_player1_id_fkey,
  drop constraint if exists tournament_results_player2_id_fkey;

alter table public.historical_tournament_results
  drop constraint if exists historical_tournament_results_player1_id_fkey,
  drop constraint if exists historical_tournament_results_player2_id_fkey;

alter table public.rankings
  drop constraint if exists rankings_player_id_fkey;

alter table public.official_rankings
  drop constraint if exists official_rankings_player_id_fkey;

alter table public.official_ranking_details
  drop constraint if exists official_ranking_details_player_id_fkey;

alter table public.player_registration_requests
  drop constraint if exists player_registration_requests_player1_id_fkey,
  drop constraint if exists player_registration_requests_player2_id_fkey;

alter table public.tournament_results
  add constraint tournament_results_player1_id_fkey
    foreign key (player1_id) references public.players(id) not valid,
  add constraint tournament_results_player2_id_fkey
    foreign key (player2_id) references public.players(id) not valid;

alter table public.historical_tournament_results
  add constraint historical_tournament_results_player1_id_fkey
    foreign key (player1_id) references public.players(id) not valid,
  add constraint historical_tournament_results_player2_id_fkey
    foreign key (player2_id) references public.players(id) not valid;

alter table public.rankings
  add constraint rankings_player_id_fkey
    foreign key (player_id) references public.players(id) not valid;

alter table public.official_rankings
  add constraint official_rankings_player_id_fkey
    foreign key (player_id) references public.players(id) not valid;

alter table public.official_ranking_details
  add constraint official_ranking_details_player_id_fkey
    foreign key (player_id) references public.players(id) not valid;

alter table public.player_registration_requests
  add constraint player_registration_requests_player1_id_fkey
    foreign key (player1_id) references public.players(id) not valid,
  add constraint player_registration_requests_player2_id_fkey
    foreign key (player2_id) references public.players(id) not valid;
