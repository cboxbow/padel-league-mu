const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

function readEnv(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    values[key] = value;
  }
  return values;
}

function text(row, key) {
  return String(row?.[key] ?? '').trim();
}

function hasAny(row, keys) {
  return keys.some(key => text(row, key));
}

async function main() {
  const env = { ...readEnv('.env.local'), ...readEnv('.env.public') };
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.log(JSON.stringify({ error: 'VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquant.' }, null, 2));
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key);
  const first = await supabase.from('players').select('*').limit(1);
  if (first.error) {
    console.log(JSON.stringify({ error: first.error.message }, null, 2));
    process.exitCode = 1;
    return;
  }

  const columns = first.data?.[0] ? Object.keys(first.data[0]) : [];
  const total = await supabase.from('players').select('*', { count: 'exact', head: true });

  const rows = [];
  for (let from = 0; from < 5000; from += 1000) {
    const page = await supabase.from('players').select('*').range(from, from + 999);
    if (page.error) {
      console.log(JSON.stringify({ error: page.error.message, pageFrom: from }, null, 2));
      process.exitCode = 1;
      return;
    }
    rows.push(...(page.data ?? []));
    if (!page.data || page.data.length < 1000) break;
  }

  const emailColumns = columns.filter(col => /mail/i.test(col));
  const phoneColumns = columns.filter(col => /phone|mobile|tel/i.test(col));
  const licenseColumns = columns.filter(col => /licen|licence|license/i.test(col));
  const genderColumns = columns.filter(col => /gender|sex/i.test(col));
  const statusColumns = columns.filter(col => /active|status|statut/i.test(col));

  const emailMap = new Map();
  const phoneMap = new Map();
  const licenseMap = new Map();
  for (const row of rows) {
    for (const col of emailColumns) {
      const email = text(row, col).toLowerCase();
      if (email) emailMap.set(email, (emailMap.get(email) ?? 0) + 1);
    }
    for (const col of phoneColumns) {
      const phone = text(row, col).replace(/\D/g, '');
      if (phone) phoneMap.set(phone, (phoneMap.get(phone) ?? 0) + 1);
    }
    for (const col of licenseColumns) {
      const license = text(row, col).toUpperCase();
      if (license) licenseMap.set(license, (licenseMap.get(license) ?? 0) + 1);
    }
  }

  const missingEmailExamples = rows
    .filter(row => !hasAny(row, emailColumns))
    .slice(0, 10)
    .map(row => `${text(row, 'first_name')} ${text(row, 'last_name')}`.trim() || text(row, 'name') || text(row, 'id'));

  const missingPhoneExamples = rows
    .filter(row => !hasAny(row, phoneColumns))
    .slice(0, 10)
    .map(row => `${text(row, 'first_name')} ${text(row, 'last_name')}`.trim() || text(row, 'name') || text(row, 'id'));

  const result = {
    totalRowsReported: total.count,
    totalRowsFetched: rows.length,
    columns,
    emailColumns,
    phoneColumns,
    licenseColumns,
    genderColumns,
    statusColumns,
    withEmail: rows.filter(row => hasAny(row, emailColumns)).length,
    withoutEmail: rows.filter(row => !hasAny(row, emailColumns)).length,
    withPhone: rows.filter(row => hasAny(row, phoneColumns)).length,
    withoutPhone: rows.filter(row => !hasAny(row, phoneColumns)).length,
    withLicense: rows.filter(row => hasAny(row, licenseColumns)).length,
    withoutLicense: rows.filter(row => !hasAny(row, licenseColumns)).length,
    duplicateEmailValues: Array.from(emailMap.values()).filter(count => count > 1).length,
    duplicatePhoneValues: Array.from(phoneMap.values()).filter(count => count > 1).length,
    duplicateLicenseValues: Array.from(licenseMap.values()).filter(count => count > 1).length,
    missingEmailExamples,
    missingPhoneExamples,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.log(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
