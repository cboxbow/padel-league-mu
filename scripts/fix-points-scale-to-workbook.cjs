/* eslint-disable no-console */
// One-off: for tournaments entered live (tournament_results) AND present in the
// official workbook ("Padel League - RANKINGS ...xlsx" rows in
// historical_tournament_results), the two sources disagreed on points for some
// pairs. The workbook scale is the reference. This aligns the points of the
// live rows (tournament_results + their mirrored backfill rows in
// historical_tournament_results) to the workbook value, pair by pair.
//
// Usage: node scripts/fix-points-scale-to-workbook.cjs            -> dry run
//        node scripts/fix-points-scale-to-workbook.cjs --apply    -> writes
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes('--apply');

const TARGETS = ['t008h', 't025h', 't041h', 't046h', 't062h', 't070f', 't080', 't084h', 't084f', 't125h'];
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const ALIASES = { 'MICHELLE GROSS': 'MICHELE GROSS' };
const alias = n => ALIASES[n] || n;
const pair = (a, b) => [alias(norm(a)), alias(norm(b))].sort().join('&');

async function all(table, cols, filter) {
  const out = [];
  for (let f = 0; ; f += 1000) {
    let q = sb.from(table).select(cols).range(f, f + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

async function main() {
  const tr = await all('tournament_results', 'id,tournament_id,tournament_name,tournament_date,club_name,division,rank,points,player1_name,player2_name', q => q.in('tournament_id', TARGETS));
  const hist = await all('historical_tournament_results', 'id,event_key,event_date,club_name,division,points,player1_name,player2_name,source_file,rank_min,rank_max');
  const wb = hist.filter(r => /RANKINGS/i.test(r.source_file || ''));
  const wbIdx = new Map();
  wb.forEach(r => wbIdx.set([r.event_date, norm(r.club_name), r.division, pair(r.player1_name, r.player2_name)].join('|'), r));

  let planned = 0, applied = 0, unmatched = 0;
  const byEvent = new Map();
  for (const r of tr) {
    const k = [r.tournament_date, norm(r.club_name), r.division, pair(r.player1_name, r.player2_name)].join('|');
    const w = wbIdx.get(k);
    const ev = byEvent.get(r.tournament_id) || { name: r.tournament_name, date: r.tournament_date, lines: [], unmatched: [] };
    byEvent.set(r.tournament_id, ev);
    if (!w) { ev.unmatched.push(`${r.player1_name}/${r.player2_name} (${r.points})`); unmatched++; continue; }
    if (Number(w.points) === Number(r.points) && Number(r.rank) >= Number(w.rank_min) && Number(r.rank) <= Number(w.rank_max)) continue;
    ev.lines.push({ r, newPoints: Number(w.points), newRank: (Number(r.rank) >= Number(w.rank_min) && Number(r.rank) <= Number(w.rank_max)) ? Number(r.rank) : Number(w.rank_min) });
    planned++;
  }

  for (const [id, ev] of byEvent) {
    console.log(`\n${ev.date} | ${id} | ${ev.name} -> ${ev.lines.length} paire(s) a corriger`);
    ev.lines.sort((a, b) => a.r.rank - b.r.rank).forEach(({ r, newPoints, newRank }) => console.log(`   #${r.rank}${newRank !== Number(r.rank) ? '->#' + newRank : ''} ${r.player1_name} / ${r.player2_name}: ${r.points} -> ${newPoints}`));
    if (ev.unmatched.length) console.log(`   (non rapprochees avec l'Excel, laissees telles quelles: ${ev.unmatched.join(' ; ')})`);
  }

  if (!APPLY) { console.log(`\nESSAI A BLANC: ${planned} corrections prevues, ${unmatched} lignes non rapprochees.`); return; }

  const backup = [];
  for (const [id, ev] of byEvent) {
    for (const { r, newPoints, newRank } of ev.lines) {
      backup.push({ id: r.id, tournament_id: r.tournament_id, pair: r.player1_name + ' / ' + r.player2_name, old_points: r.points, old_rank: r.rank });
      const a = await sb.from('tournament_results').update({ points: newPoints, rank: newRank }).eq('id', r.id);
      if (a.error) throw new Error(`tournament_results ${r.id}: ${a.error.message}`);
      // mirrored backfill row(s) of the same live result in historical_tournament_results
      const mirrors = hist.filter(h => !/RANKINGS/i.test(h.source_file || '') && h.event_date === r.tournament_date && norm(h.club_name) === norm(r.club_name) && h.division === r.division && pair(h.player1_name, h.player2_name) === pair(r.player1_name, r.player2_name));
      for (const m of mirrors) {
        const b = await sb.from('historical_tournament_results').update({ points: newPoints, rank_min: newRank, rank_max: newRank, rank_label: '#' + newRank }).eq('id', m.id);
        if (b.error) throw new Error(`historical ${m.id}: ${b.error.message}`);
      }
      applied++;
    }
  }
  require('fs').writeFileSync(process.env.BACKUP_FILE || 'points-scale-backup.json', JSON.stringify(backup, null, 2));
  console.log(`\nOK: ${applied} paires alignees sur le bareme Excel. Sauvegarde des anciennes valeurs: ${process.env.BACKUP_FILE || 'points-scale-backup.json'}`);
}
main().catch(e => { console.error('ECHEC:', e.message); process.exit(1); });
