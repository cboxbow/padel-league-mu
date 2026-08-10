-- MPL player registration requests: permission fix
-- Run this in Supabase SQL Editor if public player requests show:
-- "permission denied for table player_registration_requests".

grant usage on schema public to anon, authenticated;

-- Public/player space can submit a request. RLS policy still checks pending status and required fields.
grant insert on table public.player_registration_requests to anon, authenticated;

-- Admin panel can read/moderate only if RLS confirms role admin/superadmin.
grant select, update, delete on table public.player_registration_requests to authenticated;

-- Anonymous visitors must not see or edit the request queue.
revoke select, update, delete on table public.player_registration_requests from anon;
