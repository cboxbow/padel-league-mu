-- Vraie authentification joueur (lien magique par email) — MPL.
--
-- 1) Colonne de lien entre un compte Supabase Auth reel (auth.users) et une
--    fiche players. Nullable : le lien se cree progressivement, au premier
--    clic sur le lien de connexion de chaque joueur.
alter table public.players
  add column if not exists user_id uuid references auth.users(id);

create unique index if not exists players_user_id_key
  on public.players(user_id)
  where user_id is not null;

-- 2) RPC appelee cote client juste apres l'etablissement d'une session
--    (evenement SIGNED_IN suite au clic sur le lien magique), et a chaque
--    restauration de session au chargement de la page.
--
--    - Si le compte auth est deja lie a une fiche : la renvoie telle quelle.
--    - Sinon, sans p_license : tente un lien automatique si UN SEUL profil
--      non deja lie partage l'email du compte auth.
--    - Sinon, avec p_license : associe manuellement ce compte a la fiche
--      portant cette licence (si elle n'est pas deja liee) — couvre les cas
--      d'email absent/errone en base ou partage entre plusieurs profils.
--
--    SECURITY DEFINER : necessaire pour permettre a un simple utilisateur
--    authentifie (RLS ne l'autorise pas a modifier players directement) de
--    lier SON PROPRE compte, sans lui donner d'acces plus large.
create or replace function public.link_player_account(p_license text default null)
returns setof players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_uid is null then
    raise exception 'Non authentifie';
  end if;

  if exists (select 1 from players where user_id = v_uid) then
    return query select * from players where user_id = v_uid;
    return;
  end if;

  if p_license is not null and btrim(p_license) <> '' then
    update players
      set user_id = v_uid
      where license_no = btrim(p_license)
        and user_id is null;
    if found then
      return query select * from players where user_id = v_uid;
    end if;
    return;
  end if;

  if v_email <> '' and (
    select count(*) from players where lower(coalesce(email, '')) = v_email and user_id is null
  ) = 1 then
    update players
      set user_id = v_uid
      where lower(coalesce(email, '')) = v_email and user_id is null;
    return query select * from players where user_id = v_uid;
    return;
  end if;

  return;
end;
$$;

grant execute on function public.link_player_account(text) to authenticated;
