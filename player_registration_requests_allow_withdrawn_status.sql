-- Adds "withdrawn" as an allowed value for player_registration_requests.status,
-- for the new "Se désiste" button in admin/Inscriptions (marks an already
-- approved pair as withdrawn after the fact, distinct from an initial refusal).
-- Existing values confirmed in production before this change: pending, approved, rejected.
ALTER TABLE public.player_registration_requests
  DROP CONSTRAINT IF EXISTS player_registration_requests_status_check;

ALTER TABLE public.player_registration_requests
  ADD CONSTRAINT player_registration_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn'));
