create or replace function public.verify_player_profile(
  p_email text,
  p_license text
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
  if nullif(trim(coalesce(p_email, '')), '') is null
     or nullif(trim(coalesce(p_license, '')), '') is null then
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
  where lower(trim(p.email::text)) = lower(trim(p_email))
    and upper(regexp_replace(coalesce(p.license_no::text, ''), '\s+', '', 'g'))
      = upper(regexp_replace(trim(p_license), '\s+', '', 'g'))
  limit 1;
end;
$$;

revoke all on function public.verify_player_profile(text, text) from public;
grant execute on function public.verify_player_profile(text, text) to anon, authenticated;
