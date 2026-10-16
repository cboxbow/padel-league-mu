/* eslint-disable no-console */
// One-off: 5 players were split in two because bulk-created player records of
// 2026-09-23 (MPL0002107..2115, no email) duplicate pre-existing records, and
// result rows were linked to the new ones - so the ranking counted each as two
// players with the points divided. For each pair: re-point every reference
// (player ids + name spelling) in tournament_results and
// historical_tournament_results to the ORIGINAL record, then delete the duplicate.
//
// Not merged (needs a human decision): Stephane Payet / Payet Stephane - they
// play the same tournament (2026-05-30 M100 RM PC) so they may be two people.
//
// node scripts/merge-duplicate-players.cjs          -> dry run
// node scripts/merge-duplicate-players.cjs --apply  -> writes
const { createClient } = require('@supabase/supabase-js');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co', KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes('--apply');

const MERGES = [
  { dup: 'MPL0002108', keep: 'MPL0000289', display: 'Megane Rasamimanana', variants: ['MEGANE RASAMIIMANANA'] },
  { dup: 'MPL0002109', keep: 'MPL0001096', display: 'Nicole Monique Vermaak', variants: ['NICOLE VERMAAK'] },
  { dup: 'MPL0002110', keep: 'MPL0001563', display: 'Aaron Sanchez Romero', variants: ['AARON SANCHEZ'] },
  { dup: 'MPL0002111', keep: 'MPL0000764', display: 'Jonathan E Mathieu', variants: ['JONATHAN MATHIEU', 'JONATHAN. E MATHIEU'] },
  { dup: 'MPL0002114', keep: 'MPL0001404', display: 'Shane Fong Yong', variants: ['SHANE FONG'] },
];
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
async function all(t, c, f) { const o = []; for (let i = 0; ; i += 1000) { let q = sb.from(t).select(c).range(i, i + 999); if (f) q = f(q); const { data, error } = await q; if (error) throw new Error(`${t}: ${error.message}`); o.push(...data); if (data.length < 1000) break; } return o; }

(async () => {
  const players = await all('players', 'id,license_no,first_name,last_name,email');
  const byLic = new Map(players.map(p => [p.license_no, p]));
  const tables = [
    ['tournament_results', 'id,player1_name,player2_name,player1_id,player2_id'],
    ['historical_tournament_results', 'id,player1_name,player2_name,player1_id,player2_id'],
  ];
  const data = {};
  for (const [t, c] of tables) data[t] = await all(t, c);
  const backup = [];
  let total = 0;

  for (const m of MERGES) {
    const dup = byLic.get(m.dup), keep = byLic.get(m.keep);
    if (!dup || !keep) throw new Error(`Fiche introuvable: ${m.dup} ou ${m.keep}`);
    const nameSet = new Set([...m.variants, m.display].map(norm));
    console.log(`\n=== ${dup.first_name} ${dup.last_name} (${m.dup}) -> ${keep.first_name} ${keep.last_name} (${m.keep}) ===`);
    for (const [t] of tables) {
      let n = 0;
      for (const row of data[t]) {
        const patch = {};
        for (const slot of ['player1', 'player2']) {
          const id = row[`${slot}_id`], nm = row[`${slot}_name`];
          const isDupId = id === dup.id;
          const isOrphanVariant = !id && nameSet.has(norm(nm));
          if (isDupId || isOrphanVariant) { patch[`${slot}_id`] = keep.id; patch[`${slot}_name`] = m.display; }
        }
        if (!Object.keys(patch).length) continue;
        n++; backup.push({ table: t, id: row.id, before: { player1_name: row.player1_name, player2_name: row.player2_name, player1_id: row.player1_id, player2_id: row.player2_id } });
        if (APPLY) { const u = await sb.from(t).update(patch).eq('id', row.id); if (u.error) throw new Error(`${t} ${row.id}: ${u.error.message}`); }
      }
      console.log(`  ${t}: ${n} ligne(s) a rattacher`);
      total += n;
    }
    if (APPLY) {
      const d = await sb.from('players').delete().eq('id', dup.id);
      if (d.error) console.log(`  !! fiche ${m.dup} NON supprimee: ${d.error.message}`); else console.log(`  fiche ${m.dup} supprimee`);
    } else console.log(`  fiche ${m.dup} serait supprimee`);
  }
  if (APPLY) require('fs').writeFileSync(process.env.BACKUP_FILE || 'merge-players-backup.json', JSON.stringify(backup, null, 2));
  console.log(`\n${APPLY ? 'OK' : 'ESSAI A BLANC'}: ${total} lignes de resultats rattachees.`);
  process.exit(0);
})().catch(e => { console.error('ECHEC:', e.message); process.exit(1); });
