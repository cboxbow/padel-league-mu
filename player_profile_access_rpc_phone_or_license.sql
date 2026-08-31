-- MPL player profile verification: allow phone number as an alternative to
-- email + licence.
-- Run once in Supabase SQL Editor.
--
-- Players can verify either with:
--   1) email + licence number
--   2) phone number only
--
-- Postgres won't let CREATE OR REPLACE add a new parameter in place of the
-- old 2-arg signature without ambiguity, so the old function is dropped
-- first.

drop function if exists public.verify_player_profile(text, text);
drop function if exists public.verify_player_profile(text, text, text);

create function public.verify_player_profile(
  p_email text default null,
  p_license text default null,
  p_phone text default null
)
returns table (
  first_name text,
  last_name text,
  email text,
  license_no text,
  active boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    nullif(trim(coalesce(p_phone, '')), '') is null
    and (
      nullif(trim(coalesce(p_email, '')), '') is null
      or nullif(trim(coalesce(p_license, '')), '') is null
    )
  ) then
    return;
  end if;

  return query
  select
    p.first_name::text,
    p.last_name::text,
    p.email::text,
    p.license_no::text,
    p.active::boolean
  from public.players p
  where (
      nullif(trim(coalesce(p_email, '')), '') is not null
      and nullif(trim(coalesce(p_license, '')), '') is not null
      and lower(trim(p.email::text)) = lower(trim(p_email))
      and upper(regexp_replace(coalesce(p.license_no::text, ''), '\s+', '', 'g'))
        = upper(regexp_replace(trim(p_license), '\s+', '', 'g'))
    )
    or (
      nullif(trim(coalesce(p_phone, '')), '') is not null
      and length(regexp_replace(coalesce(p.phone::text, ''), '\D', '', 'g')) >= 7
      and right(regexp_replace(coalesce(p.phone::text, ''), '\D', '', 'g'), 7)
        = right(regexp_replace(trim(p_phone), '\D', '', 'g'), 7)
    )
  limit 1;
end;
$$;

revoke all on function public.verify_player_profile(text, text, text) from public;
grant execute on function public.verify_player_profile(text, text, text) to anon, authenticated;
