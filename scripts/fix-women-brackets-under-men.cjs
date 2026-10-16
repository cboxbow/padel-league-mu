/* eslint-disable no-console */
// One-off: the Dames bracket of 3 events was entered in tournament_results under
// the Hommes tournament id, so those women were ranked in the Hommes division.
//   2026-03-21 RM Club Grand Baie M250 : t050h holds 9 women pairs that ALREADY exist in t050f -> delete the strays
//   2026-05-24 RM Club Grand Baie M50  : t092h holds 8 women pairs, t092f empty -> move them to t092f
//   2026-03-07 SPARC Cascavelle M25    : t039h holds 8 women pairs, t039f empty -> move them to t039f
// A stray row is identified by matching its pair against the WOMEN rows of the
// official workbook (historical_tournament_results, "RANKINGS" source) for the
// same date + club - not by fiche gender, which is unreliable. Points of moved
// rows are aligned to the workbook scale (workbook = reference).
//
// node scripts/fix-women-brackets-under-men.cjs          -> dry run
// node scripts/fix-women-brackets-under-men.cjs --apply  -> writes
const { createClient } = require('@supabase/supabase-js');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co', KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes('--apply');

const EVENTS = [
  { date: '2026-03-21', menId: 't050h', womenId: 't050f', club: 'RM Club Grand Baie' },
  { date: '2026-05-24', menId: 't092h', womenId: 't092f', club: 'RM Club Grand Baie' },
  { date: '2026-03-07', menId: 't039h', womenId: 't039f', club: 'SPARC Cascavelle' },
];
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const pair = (a, b) => [norm(a), norm(b)].sort().join('&');

async function all(t, c, f) { const o = []; for (let i = 0; ; i += 1000) { let q = sb.from(t).select(c).range(i, i + 999); if (f) q = f(q); const { data, error } = await q; if (error) throw new Error(`${t}: ${error.message}`); o.push(...data); if (data.length < 1000) break; } return o; }

(async () => {
  const backup = [];
  for (const ev of EVENTS) {
    console.log(`\n=== ${ev.date} ${ev.club} (${ev.menId} -> ${ev.womenId}) ===`);
    const wbWomen = await all('historical_tournament_results', 'player1_name,player2_name,points,rank_min,rank_max', q => q.eq('event_date', ev.date).eq('division', 'women').ilike('source_file', '%RANKINGS%').ilike('club_name', `%${ev.club.split(' ').slice(-2).join(' ')}%`));
    const wbIdx = new Map(wbWomen.map(r => [pair(r.player1_name, r.player2_name), r]));
    const menRows = await all('tournament_results', '*', q => q.eq('tournament_id', ev.menId));
    const womenRows = await all('tournament_results', '*', q => q.eq('tournament_id', ev.womenId));
    const womenHere = new Set(womenRows.map(r => pair(r.player1_name, r.player2_name)));
    const { data: tinfo } = await sb.from('tournaments').select('id,name,division,status').eq('id', ev.womenId).single();
    console.log(`Excel (Dames): ${wbWomen.length} paires | ${ev.womenId} contient deja ${womenRows.length} ligne(s) | tournoi cible: ${tinfo.name} (${tinfo.status})`);

    const strays = menRows.filter(r => wbIdx.has(pair(r.player1_name, r.player2_name)));
    const stays = menRows.length - strays.length;
    console.log(`${ev.menId}: ${menRows.length} lignes dont ${strays.length} paires Dames a retirer, ${stays} restent`);
    for (const r of strays) {
      const w = wbIdx.get(pair(r.player1_name, r.player2_name));
      const alreadyThere = womenHere.has(pair(r.player1_name, r.player2_name));
      const action = alreadyThere ? 'SUPPRIMER (deja dans ' + ev.womenId + ')' : `DEPLACER -> ${ev.womenId}`;
      const ptsNote = Number(r.points) !== Number(w.points) ? ` | points ${r.points} -> ${w.points} (Excel)` : '';
      console.log(`  #${r.rank} ${r.player1_name} / ${r.player2_name} | ${r.points} pts | ${action}${ptsNote}`);
      backup.push({ ...r });
      if (!APPLY) continue;
      if (alreadyThere) {
        const d = await sb.from('tournament_results').delete().eq('id', r.id);
        if (d.error) throw new Error(d.error.message);
      } else {
        const u = await sb.from('tournament_results').update({ tournament_id: ev.womenId, tournament_name: tinfo.name, division: 'women', points: Number(w.points), rank: Number(w.rank_min) }).eq('id', r.id);
        if (u.error) throw new Error(u.error.message);
      }
    }
    if (APPLY && tinfo.status !== 'completed') await sb.from('tournaments').update({ status: 'completed' }).eq('id', ev.womenId);
  }
  if (APPLY) { require('fs').writeFileSync(process.env.BACKUP_FILE || 'women-brackets-backup.json', JSON.stringify(backup, null, 2)); console.log(`\nOK: ${backup.length} lignes traitees. Sauvegarde: ${process.env.BACKUP_FILE || 'women-brackets-backup.json'}`); }
  else console.log(`\nESSAI A BLANC: ${backup.length} lignes concernees.`);
  process.exit(0);
})().catch(e => { console.error('ECHEC:', e.message); process.exit(1); });
