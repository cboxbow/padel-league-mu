// Copie de test locale facon Supabase (PGlite) : roles anon / authenticated /
// service_role, auth.uid(), droits par defaut du schema public, et tables
// existantes utiles aux classements remplies avec des donnees reelles (JSON).
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_PATH || '@electric-sql/pglite');

const ADMIN = 'a19ee76e-30da-43df-b8b7-d1a15a0e0268';
const ADMIN2 = 'b65abbe5-bbcf-424f-880a-831f64cda205';
const USER = '00000000-0000-0000-0000-00000000b001';

async function createTestCopy(snapshotDir) {
  const load = (n) => JSON.parse(fs.readFileSync(path.join(snapshotDir, `${n}.json`), 'utf8'));
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    -- Meme lecture que Supabase : claim.sub, sinon claims->>'sub'.
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create table public.profiles (id uuid primary key, email text, full_name text, role text);
    create table public.players (id uuid primary key, first_name text, last_name text, gender text, division text, license_no text, active boolean, user_id uuid, created_at timestamptz);
    create table public.tournaments (id text primary key, name text, club_name text, tournament_date date, date date, region text, category text, division text, tournament_type text, status text, max_teams int);
    create table public.registrations (id uuid primary key, tournament_id text, team_id uuid, seed int, confirmed boolean, registered_at timestamptz, player1_name text, player2_name text, division text, club_name text, checked_in boolean, withdrawn boolean, withdrawal_reason text);
    create table public.player_registration_requests (id uuid primary key default gen_random_uuid(), tournament_id text, player1_name text, player2_name text, player1_rank int, player2_rank int, status text default 'pending');
    grant all on all tables in schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  await db.query(`insert into public.profiles values ($1,'cbezandry@gmail.com','Admin MPL','admin'), ($2,'pascal@padelleague.mu',null,'admin'), ($3,'joueur@mpl','Joueur',null)`, [ADMIN, ADMIN2, USER]);
  const players = load('players');
  for (let i = 0; i < players.length; i += 500) {
    await db.query(`insert into public.players select * from json_populate_recordset(null::public.players, $1)`, [JSON.stringify(players.slice(i, i + 500))]);
  }
  await db.query(`insert into public.tournaments select * from json_populate_recordset(null::public.tournaments, $1)`, [JSON.stringify(load('tournaments'))]);
  await db.query(`insert into public.registrations select * from json_populate_recordset(null::public.registrations, $1)`, [JSON.stringify(load('registrations'))]);
  return { db, players, ADMIN, ADMIN2, USER };
}

// Execute une requete sous un role donne (anon / authenticated / service_role).
async function asRole(db, role, uid, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}

module.exports = { createTestCopy, asRole, ADMIN, ADMIN2, USER };
