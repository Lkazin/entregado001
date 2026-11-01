// One-time additive migration. Does not delete or overwrite the Storage source.
// Run manually only after the database schema has been reviewed and applied.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseEnv } = require('node:util');
const { createClient } = require('@supabase/supabase-js');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }

async function migrate() {
  const envPath = path.join(__dirname, '../.env.local');
  const fileEnv = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, 'utf8')) : {};
  const env = { ...fileEnv, ...process.env };
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Configuração privada do Supabase ausente.');
  const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: source, error: readError } = await db.storage.from('novaesweb_store').download('logistics.json');
  if (readError || !source) throw new Error('Não foi possível ler o estado original; nenhuma alteração realizada.');
  let state;
  try { state = JSON.parse(await source.text()); }
  catch { throw new Error('O estado original não é JSON válido; nenhuma alteração realizada.'); }
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Formato inválido do estado original.');
  for (const key of ['drivers', 'offers', 'assignments']) {
    if (!Array.isArray(state[key])) throw new Error(`Campo obrigatório inválido no estado original: ${key}.`);
  }
  const { error: insertError } = await db.from('driver_logistics_state').insert({ id: 'primary', revision: 1, state });
  if (insertError?.code === '23505') {
    console.log('O estado protegido já existe. Nenhum dado foi substituído.');
    return { initialized: false };
  }
  if (insertError) throw new Error('Não foi possível inicializar o estado protegido. O original permanece intacto.');
  const { data: saved, error: verifyError } = await db.from('driver_logistics_state').select('state,revision').eq('id', 'primary').single();
  if (verifyError || !saved || digest(saved.state) !== digest(state)) {
    throw new Error('A conferência do estado protegido falhou. Preserve o original e revise antes da publicação.');
  }
  console.log('Estado protegido inicializado e integridade confirmada. O arquivo original foi preservado.');
  return { initialized: true };
}

if (require.main === module) {
  migrate().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { canonical, digest, migrate };
