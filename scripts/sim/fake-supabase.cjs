// Faux client Supabase en lecture seule sur des fichiers JSON (simulation hors ligne).
const fs = require('node:fs');
const path = require('node:path');
const DIR = process.env.SIM_DIR;
const cache = {};
const table = (t) => (cache[t] ||= JSON.parse(fs.readFileSync(path.join(DIR, `${t}.json`), 'utf8')));
function query(t) {
  let rows = table(t).slice(); let cols = null; let lim = null; let rng = null; const orders = [];
  const q = {
    select(c) { cols = c; return q; },
    gte(k, v) { rows = rows.filter(r => String(r[k] ?? '') >= v); return q; },
    lte(k, v) { rows = rows.filter(r => String(r[k] ?? '') <= v); return q; },
    eq(k, v) { rows = rows.filter(r => r[k] === v); return q; },
    in(k, v) { rows = rows.filter(r => v.includes(r[k])); return q; },
    order(k, o = {}) { orders.push([k, o.ascending !== false]); return q; },
    limit(n) { lim = n; return q; },
    range(a, b) { rng = [a, b]; return q; },
    delete() { throw new Error('SIMULATION : ecriture interdite'); },
    upsert() { throw new Error('SIMULATION : ecriture interdite'); },
    update() { throw new Error('SIMULATION : ecriture interdite'); },
    then(res, rej) {
      let out = rows;
      if (orders.length) out = out.slice().sort((x, y) => { for (const [k, asc] of orders) { const a = String(x[k] ?? ''), b = String(y[k] ?? ''); if (a !== b) return (a < b ? -1 : 1) * (asc ? 1 : -1); } return 0; });
      if (cols && cols !== '*' && cols.split(',').some(c => !(c.trim() in (table(t)[0] || {})))) return Promise.resolve({ data: null, error: { message: `column ${cols} does not exist` } }).then(res, rej);
      if (rng) out = out.slice(rng[0], rng[1] + 1);
      if (lim != null) out = out.slice(0, lim);
      return Promise.resolve({ data: out, error: null }).then(res, rej);
    },
  };
  return q;
}
module.exports = { createClient: () => ({ from: query }) };
