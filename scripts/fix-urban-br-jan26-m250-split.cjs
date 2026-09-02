/* eslint-disable no-console */
const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=');
        return [
          line.slice(0, index).trim(),
          line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ''),
        ];
      })
  );
}

const env = { ...readEnvFile('.env.local'), ...readEnvFile('.env.admin'), ...process.env };
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const WOMEN_IDS = [
  'c45baa84-c191-4032-b01b-cc01460b12d6',
  'a869c654-6b0a-46cf-b63e-a23400d4c0a9',
  '7eae2b57-e6f0-4f13-9608-6afd1fc60f34',
  'c3df898f-8f72-49bb-97a8-8ac8ad53f0df',
  'a8663d5d-cd1c-4d5a-901f-db8a6e655e11',
  'a338b819-83d8-4a58-8fea-28972dd757c8',
  '78277a35-c5cc-455e-92ad-2842e47f2064',
  '3feb7bb9-e2ab-4292-b873-9ea70e53048f',
  '36497504-dce9-4bd9-9376-3f884d51bd94',
];

const WOMEN_PLAYER1_NAMES = [
  'PAMELA JUGDARREE',
  'CELINE DESVAUX DE MARIGNY',
  'MARTINA HOLA',
  'PASCALE FERRAT',
  'ELIZABETH RECTER',
  'VALENTINA CRUCIANI',
  'OLGA KLIMENKO',
  'MELODY DE ROBILLARD',
  'DESIRE DE WAAL',
];

async function main() {
  console.log('1/4 Deplacement des resultats Women vers t013f...');
  const { error: moveWomenError } = await supabase
    .from('tournament_results')
    .update({
      tournament_id: 't013f',
      tournament_name: 'Urban Sport Black River M250 (Dames)',
      division: 'women',
      category: 'M250',
      tournament_date: '2026-01-24',
      region: 'Ouest',
      club_name: 'Urban Sport Black River',
    })
    .in('id', WOMEN_IDS);
  if (moveWomenError) throw new Error(`move women rows: ${moveWomenError.message}`);

  console.log('2/4 Normalisation des resultats Men restants...');
  const { error: normalizeMenError } = await supabase
    .from('tournament_results')
    .update({
      tournament_id: 't013h',
      tournament_name: 'Urban Sport Black River M250 (Hommes)',
      division: 'men',
      category: 'M250',
      tournament_date: '2026-01-24',
      region: 'Ouest',
      club_name: 'Urban Sport Black River',
    })
    .eq('tournament_id', 't013h')
    .eq('tournament_date', '2026-01-24')
    .eq('club_name', 'Urban Sport Black River')
    .eq('category', 'M250');
  if (normalizeMenError) throw new Error(`normalize men rows: ${normalizeMenError.message}`);

  console.log('3/4 Correction historique WOME en Women...');
  const { error: historyWomenError } = await supabase
    .from('historical_tournament_results')
    .update({
      event_name: 'M250 - URBAN BR - JAN 26 - WOMEN',
      sheet_name: 'M250 - URBAN BR - JAN 26 - WOMEN',
      division: 'women',
      category: 'M250',
      event_date: '2026-01-24',
      club_name: 'Urban Sport Black River',
    })
    .eq('event_date', '2026-01-24')
    .eq('club_name', 'Urban Sport Black River')
    .eq('category', 'M250')
    .ilike('sheet_name', '%WOME%');
  if (historyWomenError) throw new Error(`history women rows: ${historyWomenError.message}`);

  const { error: historyWomenNamesError } = await supabase
    .from('historical_tournament_results')
    .update({
      event_name: 'M250 - URBAN BR - JAN 26 - WOMEN',
      sheet_name: 'M250 - URBAN BR - JAN 26 - WOMEN',
      division: 'women',
      category: 'M250',
      event_date: '2026-01-24',
      club_name: 'Urban Sport Black River',
    })
    .eq('event_date', '2026-01-24')
    .eq('club_name', 'Urban Sport Black River')
    .eq('category', 'M250')
    .in('player1_name', WOMEN_PLAYER1_NAMES);
  if (historyWomenNamesError) throw new Error(`history women rows by names: ${historyWomenNamesError.message}`);

  const { error: historyMenError } = await supabase
    .from('historical_tournament_results')
    .update({
      event_name: 'M250 - URBAN BR - JAN 26 - MEN',
      sheet_name: 'M250 - URBAN BR - JAN 26 - MEN',
      division: 'men',
      category: 'M250',
      event_date: '2026-01-24',
      club_name: 'Urban Sport Black River',
    })
    .eq('event_date', '2026-01-24')
    .eq('club_name', 'Urban Sport Black River')
    .eq('category', 'M250')
    .ilike('sheet_name', '%MEN%')
    .not('sheet_name', 'ilike', '%WOM%');
  if (historyMenError) throw new Error(`history men rows: ${historyMenError.message}`);

  console.log('4/4 Verification...');
  const { data: currentRows, error: currentError } = await supabase
    .from('tournament_results')
    .select('tournament_id,division,rank,player1_name,player2_name,points')
    .in('tournament_id', ['t013h', 't013f'])
    .order('division', { ascending: true })
    .order('rank', { ascending: true });
  if (currentError) throw new Error(`verify tournament_results: ${currentError.message}`);

  const counts = currentRows.reduce((acc, row) => {
    const key = `${row.tournament_id}:${row.division}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({ counts, rows: currentRows }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
