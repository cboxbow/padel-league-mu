/* eslint-disable no-console */
// Audit "AllApplication 6 sept 2026).xlsx" against public.players, mirroring
// the exact matching logic in src/pages/AdminDashboard.tsx (importAuditRows)
// so the categorization matches what the admin UI would show.
const path = require('node:path');
const fs = require('node:fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_KEY) {
  console.error('Missing SUPABASE_KEY (anon key ok for read-only audit).');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const XLSX_PATH = path.resolve(__dirname, '..', '..', 'AllApplication 6 sept 2026).xlsx');

function normKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function normPhone(value) {
  return String(value ?? '').replace(/\D+/g, '');
}
const GENERIC_EMAILS = new Set(['info@urbansport.mu']);

function extractEmail(value) {
  const m = String(value ?? '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : '';
}

const CLUB_ALIASES = {
  'rm club grand baie': 'c08', 'rm club forbach': 'c08', 'rm forbach': 'c08',
  'urban sport grand baie': 'c03', 'urban sport riviere noire': 'c04', 'urban sport black river': 'c04',
  'sparc cascavelle': 'c05', 'rm club tamarin': 'c06',
  'i padel by rm henessy': 'c07', 'i padel by rm hennessy': 'c07', 'i padel by rm port chambly': 'c10',
  'studio by rm azuri': 'c11', 'isla padel beau plan': 'c12', 'isla padel grand baie': 'c12',
  'labourdonnais sport club': 'c09', 'labourdonnais mapou': 'c09',
  'cana beau plan': 'c01', 'oxygen moka': 'c15',
  'club house riviere noire': 'c16', 'club house black river': 'c16',
  'energia padel pte aux cannonniers': 'c17', 'energia pointe aux canonniers': 'c17',
  'mont choisy golf mont choisy': 'c14', 'mont choisy golf': 'c14',
  'terres brunes tamarin': 'c13', 'terres brunes sports leisure': 'c13',
  'club med albion': 'c02', 'moka rangers moka': 'c18', 'moka rangers': 'c18',
};

async function fetchAllPaged(table, select) {
  const pageSize = 1000;
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  console.log('1/4 Lecture du fichier Excel...');
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log(`   ${rawRows.length} lignes brutes.`);

  const importRows = rawRows.map(row => {
    const firstName = String(row['Name'] ?? '').trim();
    const lastName = String(row['Surname'] ?? '').trim();
    const email = String(row['Email'] ?? '').trim().toLowerCase();
    const phone = String(row['Mobile'] ?? '').trim();
    const clubKey = normKey(row['Club']);
    const clubId = CLUB_ALIASES[clubKey] || '';
    const genderKey = normKey(row['Gender']);
    const gender = ['female', 'femme', 'f', 'dame', 'dames'].includes(genderKey) ? 'F' : 'M';
    const levelRaw = String(row['Level'] ?? '').trim();
    const level = /^p\d+$/i.test(levelRaw) ? levelRaw.toUpperCase() : (/^\d+$/.test(levelRaw) ? `P${levelRaw}` : levelRaw);
    const statusKey = normKey(row['Status']);
    const active = statusKey ? statusKey !== 'pending' && statusKey !== 'inactive' && statusKey !== 'inactif' : true;
    return {
      first_name: firstName, last_name: lastName, email, phone,
      club_id: clubId, club_name: String(row['Club'] ?? '').trim(),
      gender, level, active,
    };
  }).filter(r => r.first_name || r.last_name || r.email);
  console.log(`   ${importRows.length} lignes exploitables (nom ou email present).`);

  console.log('2/4 Lecture de public.players...');
  const players = await fetchAllPaged('players', 'id,first_name,last_name,email,phone,license_no');
  console.log(`   ${players.length} joueurs en base.`);

  const existingByEmail = new Map();
  const existingByPhone = new Map();
  const existingByName = new Map();
  players.forEach(p => {
    const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    const email = String(p.email || '').trim().toLowerCase() || extractEmail(fullName);
    const phone = normPhone(p.phone);
    const name = normKey(fullName);
    if (email) existingByEmail.set(email, [...(existingByEmail.get(email) || []), p]);
    if (phone) existingByPhone.set(phone, [...(existingByPhone.get(phone) || []), p]);
    if (name) existingByName.set(name, [...(existingByName.get(name) || []), p]);
  });
  // 57 phone numbers are each shared by 2-11 UNRELATED players in prod data
  // (placeholder/front-desk numbers) -- phone is not a reliable match key.
  const USE_PHONE_MATCHING = false;

  const importKeyCounts = new Map();
  importRows.forEach(row => {
    const email = GENERIC_EMAILS.has(row.email) ? '' : row.email;
    const key = email || normKey(`${row.first_name} ${row.last_name}`);
    if (key) importKeyCounts.set(key, (importKeyCounts.get(key) || 0) + 1);
  });

  console.log('3/4 Categorisation (meme logique que l\'UI admin)...');
  const audited = importRows.map(row => {
    const email = GENERIC_EMAILS.has(row.email) ? '' : row.email;
    const phone = normPhone(row.phone);
    const name = normKey(`${row.first_name} ${row.last_name}`);
    const importKey = email || name;
    const fileDuplicate = importKey ? (importKeyCounts.get(importKey) || 0) > 1 : false;
    const emailMatches = email ? (existingByEmail.get(email) || []) : [];
    const phoneMatches = USE_PHONE_MATCHING && phone ? (existingByPhone.get(phone) || []) : [];
    const nameMatches = name ? (existingByName.get(name) || []) : [];
    const uniqueMatches = new Map();
    [...emailMatches, ...phoneMatches, ...nameMatches].forEach(m => { if (m.id) uniqueMatches.set(m.id, m); });
    const matches = Array.from(uniqueMatches.values());

    if (fileDuplicate) return { ...row, importStatus: 'review', importReason: 'Doublon dans le fichier import', matchedId: matches[0]?.id };
    if (matches.length > 1) return { ...row, importStatus: 'review', importReason: 'Plusieurs joueurs Supabase possibles', matchedId: matches[0]?.id, candidateIds: matches.map(m => m.id) };
    if (matches.length === 1) {
      const match = matches[0];
      const reason = emailMatches.length > 0 ? 'Existe deja: email identique' : phoneMatches.length > 0 ? 'Existe deja: mobile identique' : 'Existe deja: nom identique';
      return { ...row, importStatus: 'existing', importReason: reason, matchedId: match.id };
    }
    return { ...row, importStatus: 'new', importReason: row.club_id ? 'Nouveau joueur' : 'Nouveau joueur - club a completer' };
  });

  const existing = audited.filter(r => r.importStatus === 'existing');
  const fresh = audited.filter(r => r.importStatus === 'new');
  const review = audited.filter(r => r.importStatus === 'review');

  console.log('4/4 Resultats:');
  console.log(`   Deja en base: ${existing.length}`);
  console.log(`   Nouveaux:     ${fresh.length}`);
  console.log(`   A verifier:   ${review.length}`);

  fs.writeFileSync(path.resolve(__dirname, '..', '.scratch_review_rows.json'), JSON.stringify(review, null, 2));
  fs.writeFileSync(path.resolve(__dirname, '..', '.scratch_new_rows.json'), JSON.stringify(fresh, null, 2));
  console.log('Fichiers ecrits: .scratch_review_rows.json, .scratch_new_rows.json');
}

main().catch(err => { console.error('ECHEC:', err.message); process.exit(1); });
