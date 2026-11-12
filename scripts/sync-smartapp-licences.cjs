/* eslint-disable no-console */
// One-off (12/11/2026): refresh player fiches and app licences from the SmartApp
// dashboard (https://www.smartapp.mu/dash/padelleague/home, table "Application Users").
// Follows docs/LICENCES_APP_2026-10-26 (player_app_licences, source smartapp_dashboard).
//
//   1. licences already stored (matched by PDL number) whose type / start / end / status
//      changed in the dashboard -> updated (dashboard = reference, values loaded as-is)
//   2. people with no fiche (no match by email, then normalised name) -> new fiche in
//      players (next MPL number, email kept unless it is the club front-desk address) + licence row
//   Not touched: accounts still "pending" in the app (listed in the report), second
//   accounts of André Jordan / Miotisoa Rasendra, any fiche already matched.
//
// Input: JSON exported from the dashboard page (SMARTAPP_JSON, SMARTAPP_TEL_JSON).
// node scripts/sync-smartapp-licences.cjs          -> dry run
// node scripts/sync-smartapp-licences.cjs --apply  -> writes (BACKUP_FILE = old licence values)
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co', KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes('--apply');
const rows = JSON.parse(fs.readFileSync(process.env.SMARTAPP_JSON, 'utf8'));
const tels = process.env.SMARTAPP_TEL_JSON ? JSON.parse(fs.readFileSync(process.env.SMARTAPP_TEL_JSON, 'utf8').trim()) : [];

const GENERIC_EMAILS = new Set(['info@urbansport.mu']);
// Peachman plays (and is ranked) in the men's draws; the app lists him as Female.
const GENDER_OVERRIDE = { 'DMITRII PEACHMAN': 'M' };

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const nameKey = (a, b) => norm(`${a} ${b}`).split(' ').sort().join(' ');
const title = s => String(s || '').trim().toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
const licType = s => /year|annu/i.test(s || '') ? 'annuelle' : /one|ponct/i.test(s || '') ? 'ponctuelle' : null;
const isoDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null;
const toUtc = s => new Date(Date.parse(String(s).replace(' ', 'T') + '+04:00')).toISOString();
const telOf = r => (tels.find(t => t.lic && t.lic === r.lic && t.regdate === r.regdate) || tels.find(t => t.name === r.name && t.surname === r.surname && t.regdate === r.regdate) || {}).tel || null;
const cleanTel = t => { const v = String(t || '').replace(/\s+/g, ''); return v && v.length >= 7 ? v : null; };

async function all(t, c) { const o = []; for (let i = 0; ; i += 1000) { const { data, error } = await sb.from(t).select(c).range(i, i + 999); if (error) throw new Error(`${t}: ${error.message}`); o.push(...data); if (data.length < 1000) break; } return o; }

(async () => {
  const players = await all('players', 'id,first_name,last_name,email,license_no');
  const lic = await all('player_app_licences', '*');
  const licByNo = new Map(lic.filter(l => l.app_license_no).map(l => [l.app_license_no, l]));
  const byEmail = new Map(); players.forEach(p => { if (p.email) { const k = p.email.toLowerCase(); (byEmail.get(k) || byEmail.set(k, []).get(k)).push(p); } });
  const byName = new Map(); players.forEach(p => { const k = nameKey(p.first_name, p.last_name); (byName.get(k) || byName.set(k, []).get(k)).push(p); });

  const updates = [], creates = [], pending = [], skipped = [];
  for (const r of rows) {
    const no = (r.lic || '').trim();
    if (no && licByNo.has(no)) {
      const l = licByNo.get(no); const patch = {};
      const nt = licType(r.ltype), ns = isoDate(r.start), ne = isoDate(r.end);
      if ((l.license_type || null) !== nt) patch.license_type = nt;
      if ((l.license_start || null) !== ns) patch.license_start = ns;
      if ((l.license_end || null) !== ne) patch.license_end = ne;
      if ((l.app_status || null) !== r.status) patch.app_status = r.status;
      if (Object.keys(patch).length) updates.push({ l, r, patch });
      continue;
    }
    const mail = (r.email || '').trim().toLowerCase();
    let cands = !GENERIC_EMAILS.has(mail) ? (byEmail.get(mail) || []) : []; let by = 'email';
    if (!cands.length) { cands = byName.get(nameKey(r.name, r.surname)) || []; by = 'nom'; }
    if (cands.length) { if (no) skipped.push(`${r.name} ${r.surname} ${no}: fiche deja rattachee a une autre licence ou en attente - non touche`); continue; }
    if (r.status !== 'active') { pending.push(`${r.name} ${r.surname} ${no} (${r.status}, inscrit le ${r.regdate.slice(0, 10)})`); continue; }
    creates.push({ r, by: GENERIC_EMAILS.has(mail) || !mail ? 'nom' : 'email' });
  }

  console.log(`Licences a mettre a jour: ${updates.length}`);
  updates.forEach(u => console.log(`  ${u.l.app_license_no} ${u.r.name} ${u.r.surname}: ${Object.entries(u.patch).map(([k, v]) => `${k} ${u.l[k] ?? 'vide'} -> ${v ?? 'vide'}`).join(' ; ')}`));

  const nums = players.map(p => Number(String(p.license_no).replace(/\D/g, ''))).filter(Number.isFinite);
  let next = Math.max(...nums) + 1;
  const newPlayers = [], newLicences = [];
  console.log(`\nFiches a creer: ${creates.length} (premiere licence MPL${String(next).padStart(7, '0')})`);
  for (const { r, by } of creates) {
    const mail = (r.email || '').trim().toLowerCase();
    const first = title(r.name), last = title(r.surname);
    const gKey = norm(`${first} ${last}`);
    const gender = GENDER_OVERRIDE[gKey] || (r.cat === 'Male' ? 'M' : r.cat === 'Female' ? 'F' : null);
    const id = crypto.randomUUID();
    newPlayers.push({
      id, first_name: first, last_name: last,
      email: GENERIC_EMAILS.has(mail) || !mail ? null : mail,
      phone: cleanTel(telOf(r)),
      license_no: `MPL${String(next++).padStart(7, '0')}`,
      gender, division: gender === 'F' ? 'women' : gender === 'M' ? 'men' : null, active: true,
    });
    newLicences.push({
      player_id: id, app_license_no: r.lic || null, app_registered_at: toUtc(r.regdate),
      license_type: licType(r.ltype), license_start: isoDate(r.start), license_end: isoDate(r.end),
      app_status: r.status, matched_by: by, source: 'smartapp_dashboard',
    });
    console.log(`  ${newPlayers[newPlayers.length - 1].license_no} ${first} ${last} | ${gender || '?'} | ${r.lic || 'sans PDL'} | ${licType(r.ltype) || '-'} ${r.start}->${r.end}`);
  }
  console.log(`\nComptes en attente dans l'app, non charges (${pending.length}):`); pending.forEach(x => console.log('  ' + x));
  if (skipped.length) { console.log(`\nIgnores (${skipped.length}):`); skipped.forEach(x => console.log('  ' + x)); }

  if (!APPLY) { console.log('\nESSAI A BLANC: rien ecrit.'); process.exit(0); }

  const backup = updates.map(u => ({ ...u.l }));
  for (const u of updates) {
    const { error } = await sb.from('player_app_licences').update({ ...u.patch, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('player_id', u.l.player_id);
    if (error) throw new Error(`update ${u.l.app_license_no}: ${error.message}`);
  }
  for (let i = 0; i < newPlayers.length; i += 100) {
    const { error } = await sb.from('players').insert(newPlayers.slice(i, i + 100));
    if (error) throw new Error(`players: ${error.message}`);
  }
  for (let i = 0; i < newLicences.length; i += 100) {
    const { error } = await sb.from('player_app_licences').insert(newLicences.slice(i, i + 100));
    if (error) throw new Error(`player_app_licences: ${error.message}`);
  }
  fs.writeFileSync(process.env.BACKUP_FILE || 'licences-backup.json', JSON.stringify({ updatedBefore: backup, createdPlayerIds: newPlayers.map(p => p.id) }, null, 2));
  console.log(`\nOK: ${updates.length} licences mises a jour, ${newPlayers.length} fiches creees. Sauvegarde: ${process.env.BACKUP_FILE || 'licences-backup.json'}`);
  process.exit(0);
})().catch(e => { console.error('ECHEC:', e.message); process.exit(1); });
