-- MPL player registration requests: scoped existence check for anon players.
--
-- Context: player_registration_requests_schema.sql deliberately revokes SELECT
-- from anon (players must not browse the pending-request queue of other
-- players, for privacy). But the "Espace Joueur" flow needs to know whether
-- THIS player already has an active request for a given tournament, to avoid
-- creating duplicates and to show a friendly "deja envoyee" message instead
-- of a raw 401. Direct SELECT from the browser (anon key) currently fails
-- with "permission denied for table player_registration_requests" (42501).
--
-- Fix: a SECURITY DEFINER function that returns only the rows matching the
-- caller-supplied identity (email, player key or pair key) for one
-- tournament -- never the full queue.

create or replace function public.check_existing_registration_request(
  p_tournament_key text,
  p_player_email text default null,
  p_player_key text default null,
  p_pair_key text default null
)
returns table (
  id uuid,
  status text,
  pair_key text,
  player1_email text,
  player1_key text,
  tournament_key text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(p_tournament_key, '')), '') is null then
    return;
  end if;

  return query
  select
    r.id,
    r.status,
    r.pair_key,
    r.player1_email,
    r.player1_key,
    r.tournament_key
  from public.player_registration_requests r
  where r.tournament_key = p_tournament_key
    and (
      (p_player_email is not null and lower(trim(r.player1_email)) = lower(trim(p_player_email)))
      or (p_player_key is not null and r.player1_key = p_player_key)
      or (p_pair_key is not null and r.pair_key = p_pair_key)
    )
  limit 20;
end;
$$;

revoke all on function public.check_existing_registration_request(text, text, text, text) from public;
grant execute on function public.check_existing_registration_request(text, text, text, text) to anon, authenticated;
