/* eslint-disable no-console */
// One-off script: publish the 5 tournaments (t150h, t150f, t152h, t149, t153h)
// that are missing from BOTH tournament_results and historical_tournament_results
// (dated 2026-08-22/23, after the "17 august" official workbook cutoff).
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- Tournament metadata ----
const TOURNAMENTS = {
  t150h: { name: 'Isla Padel Grand Baie M100 (Hommes)', date: '2026-08-22', category: 'M100', division: 'men', region: 'Nord', regionUpper: 'NORD', club: 'Isla Padel Grand Baie', clubSlug: 'isla-padel-grand-baie', sheet: 'M100 ISLA - AUG 26 - MEN', sourceFile: 'M100 ISLA   - AUG 26 - MEN RESULTS.pdf' },
  t150f: { name: 'Isla Padel Grand Baie M100 (Dames)', date: '2026-08-22', category: 'M100', division: 'women', region: 'Nord', regionUpper: 'NORD', club: 'Isla Padel Grand Baie', clubSlug: 'isla-padel-grand-baie', sheet: 'M100 ISLA - AUG 26 - WOMEN', sourceFile: 'M100 ISLA   - AUG 26 - WOMEN RESULTS.pdf' },
  t152h: { name: 'RM Club Grand Baie M25 (Hommes)', date: '2026-08-22', category: 'M25', division: 'men', region: 'Nord', regionUpper: 'NORD', club: 'RM Club Grand Baie', clubSlug: 'rm-club-grand-baie', sheet: 'M25 RM GB - AUG 26 - MEN', sourceFile: 'M25 RM GB   - AUG 26 - MEN RESULTS.pdf' },
  t149: { name: 'Club House Black River M250 (Hommes)', date: '2026-08-22', category: 'M250', division: 'men', region: 'Ouest', regionUpper: 'OUEST', club: 'Club House Black River', clubSlug: 'club-house-black-river', sheet: 'M250 CH - AUG 26 - MEN', sourceFile: 'M250 CH   - AUG 26 - MEN RESULTS.pdf' },
  t153h: { name: 'RM Club Tamarin M50 (Hommes)', date: '2026-08-23', category: 'M50', division: 'men', region: 'Ouest', regionUpper: 'OUEST', club: 'RM Club Tamarin', clubSlug: 'rm-club-tamarin', sheet: 'M50 RM T - AUG 26 - MEN', sourceFile: 'M50 RM T   - AUG 26 - MEN RESULTS.pdf' },
};

// ---- Results: [rankMin, rankMax, player1, player2, points] ----
const RESULTS = {
  t150h: [
    [1,1,'ANTHONY CLARENC','NOAH LAGESSE',100],[2,2,'ANDY TSE','HUGO CURT',70],[3,3,'AXEL DEMONTOUX','KEVIN BOYER',60],
    [4,4,'MAX SCHAFFO','NOA BEE',55],[5,5,'THOMAS MAUJEAN','FABIEN BOULLE',45],[6,6,'KUNAL SEWNAUTH','MARTINA HOLA',40],
    [7,7,'THEO FANCHETTE','RAPHAEL BAYA',35],[8,8,'CAMERON DE ROBILLARD','ANDRY AH CHOON',30],[9,9,'GARY LAN','AMRIT DINDOYAL',25],
    [10,10,'TOM SCHAFFO','DARREN LI',21],[11,11,'WILLIAM GARCIA','ENZO GARCIA',18],[12,12,'SIMON LAGESSE','DAVID MAUREL',15],
    [13,13,'JEAN-EDERN ROUGAGNOU','XAVIER LASSUS',10],[14,14,'JULES BELLEC','VALENTIN PETTON',5],
    [15,15,'JEAN PIERRE RUNGHEN','REMOR LAGESSE',3],[16,16,'AVNEESH GOODAR','DAVID COOMBES',1],
  ],
  t150f: [
    [1,1,'CARLA ALLISON','KRISTEL KOO',100],[2,2,'AURELIE PARK','LIA GIRAUD',65],[3,3,'STEPHANIE ANGOH','ANNE LUCAS',55],
    [4,4,'LAISA AH CHOON','CLARA KOENIG',50],[5,5,'DESIRE DE WAAL','DANILA LACOSTE',35],[6,6,'YARONI WILKEN','ELIZABETH LOTTER',25],
    [7,7,'SANDRA ROGERS','ANNE CLARENC',20],[8,8,'ELOISE BOYER','MELANIE NOEL',15],[9,9,'ANNA ZHIVILO','SHAMIRA KAUMAYA',10],
    [10,10,'AKI GOMAND','JOELLE HIRIGOYEN',5],
  ],
  t152h: [
    [1,1,'JORDAN LEUNG','DENY CORNETTE',25],[2,2,'DIDIER COQUET','JOSHUA COQUET',20],[3,3,'JEAN DAVID MARTINET','PHILIP ROHNACHER',18],
    [4,4,'HANS PERMALLOO','CEDRIC FLEUROT',17],[5,5,'LAURENT SAY','LOIC DUFLOT',16],[6,6,'LUIGI PAUMERO MAURY','SELWYN MOOTHY',15],
    [7,7,'YAZ RUJBALLY','JAYTEEN ADNATH',14],[8,8,'KAI SCHRODER','RAYDON LANGE',13],[9,9,'JEREMY NOEL','THOMAS BRUNET',12],
    [10,10,'JEAN-VINCENT DACRUZ','OLIVIER CHAVAGNAN',11],[11,11,'HUGUES TRIJASSE','NASSIM SHEIKH ALI',10],
    [12,12,'LAURENT IP WAI','LORENZO DE MARTIN',9],[13,13,'YSEN RICHARD','ALEXANDRE JEAN-PIERRE',8],
    [14,14,'ANUJ PARMAR','LUCAS CHANTREAU',7],[15,15,'DAMIEN PUTTEEA','SHEHRIAD LUNGUT',6],
    [16,16,'MAXIME CABURET','RAPHAEL KOURDIAN',5],
    [17,19,'GUSTAVE MORAND','DAVID LEGALANT',3],[17,19,'LOUIS NOEL','BERNARD LOPEZ',3],[17,19,'ALEXANDER VOLKHOV','NOAH BOYER',3],
  ],
  t149: [
    [1,1,'IAN KOENIG','PIERRE GADAIT',250],[2,2,'EMMANUEL PERRAULT','PIERRE CHARPENTIER',150],[3,3,'CLEMENT BESTEL','JADON ROSSLER',125],
    [4,4,'WILLIAM DE ROBILLARD','PRZEMEK PALCZYNSKI',100],[5,5,'ROGER DUPONT','XAVIER MAMET',63],[6,6,'KIRILL LYZHNIKOV','ANDREY SHEVCHENKO',25],
    [7,7,'ALEXIS LAVIE','PHILIPPE CAVAIGNAC',13],[8,8,'LAURENT DARUTY','SAMUEL GALLET',3],
  ],
  t153h: [
    [1,1,'KEVIN BLANC','CALVIN HOWARTH',50],[2,2,'BRIAN LAM','KHIM LEE BAW',34],[3,3,'ANDRY AH CHOON','DARREN LI',30],
    [4,4,'IBRAHIM DALA','MOHAMMAD PEERSAIB',26],[5,5,'LOIC BONCOEUR','MATTEO MOTTA',22],[6,6,'SYLVAIN LIOTARD','SERGEI VASILEV',18],
    [7,7,'ALAIN GUSTIN','THIERRY BINDINI',14],[8,8,'ALEKSEI GRIGOREV','ADAM TARASOV',10],[9,9,'LUDOVIC POILLY','ADRIAN HUGGETT',8],
    [10,10,'GIANNI BERGANDI','ALEXANDRE TSANG MANG KIN',6],[11,11,'VADIM KAMPEL','GUILLAUME DORZA',4],[12,12,'THOMAS ROUSSET','FRANC DUPONT',2],
  ],
};

function buildTournamentResultsRows() {
  const rows = [];
  for (const [tid, meta] of Object.entries(TOURNAMENTS)) {
    for (const [rankMin, , p1, p2, points] of RESULTS[tid]) {
      rows.push({
        id: crypto.randomUUID(),
        tournament_id: tid,
        tournament_name: meta.name,
        tournament_date: meta.date,
        category: meta.category,
        division: meta.division,
        region: meta.region,
        club_name: meta.club,
        rank: rankMin,
        team_name: `${p1} / ${p2}`,
        player1_name: p1,
        player2_name: p2,
        points,
      });
    }
  }
  return rows;
}

function buildHistoricalRows() {
  const rows = [];
  for (const [tid, meta] of Object.entries(TOURNAMENTS)) {
    const eventKey = `${meta.date}-${meta.division}-${meta.category.toLowerCase()}-${meta.clubSlug}`;
    for (const [rankMin, rankMax, p1, p2, points] of RESULTS[tid]) {
      rows.push({
        id: crypto.randomUUID(),
        source_file: meta.sourceFile,
        sheet_name: meta.sheet,
        event_key: eventKey,
        event_name: meta.sheet,
        event_year: 2026,
        season: 2026,
        category: meta.category,
        division: meta.division,
        junior_category: null,
        club_name: meta.club,
        event_date: meta.date,
        region: meta.regionUpper,
        rank_label: String(rankMin),
        rank_min: rankMin,
        rank_max: rankMax,
        team_name: `${p1} / ${p2}`,
        player1_name: p1,
        player2_name: p2,
        points,
      });
    }
  }
  return rows;
}

async function main() {
  const tournamentIds = Object.keys(TOURNAMENTS);
  const sourceFiles = Object.values(TOURNAMENTS).map((m) => m.sourceFile);

  console.log('1/4 Nettoyage des lignes existantes (idempotent)...');
  const { error: delTrErr } = await supabase.from('tournament_results').delete().in('tournament_id', tournamentIds);
  if (delTrErr) throw new Error(`delete tournament_results: ${delTrErr.message}`);
  const { error: delHistErr } = await supabase.from('historical_tournament_results').delete().in('source_file', sourceFiles);
  if (delHistErr) throw new Error(`delete historical_tournament_results: ${delHistErr.message}`);

  console.log('2/4 Insertion tournament_results...');
  const trRows = buildTournamentResultsRows();
  const { error: insTrErr } = await supabase.from('tournament_results').insert(trRows);
  if (insTrErr) throw new Error(`insert tournament_results: ${insTrErr.message}`);
  console.log(`   ${trRows.length} lignes inserees.`);

  console.log('3/4 Insertion historical_tournament_results...');
  const histRows = buildHistoricalRows();
  const { error: insHistErr } = await supabase.from('historical_tournament_results').insert(histRows);
  if (insHistErr) throw new Error(`insert historical_tournament_results: ${insHistErr.message}`);
  console.log(`   ${histRows.length} lignes inserees.`);

  console.log('4/4 Verification...');
  const { data: check, error: checkErr } = await supabase
    .from('historical_tournament_results')
    .select('event_date,club_name,category,division')
    .in('source_file', sourceFiles);
  if (checkErr) throw new Error(`verify: ${checkErr.message}`);
  console.log(`   ${check.length} lignes historiques confirmees pour les 5 tournois.`);

  console.log('OK.');
}

main().catch((error) => {
  console.error('ECHEC:', error.message);
  process.exit(1);
});
