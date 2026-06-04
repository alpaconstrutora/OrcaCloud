/**
 * Carga full das ~5570 cidades brasileiras a partir da API oficial do IBGE.
 * Atualiza/insere em public.master_cities.
 *
 * Uso:
 *   1. Pegue a SERVICE_ROLE_KEY em https://supabase.com/dashboard/project/<ref>/settings/api
 *   2. Rode:
 *      SUPABASE_SERVICE_ROLE_KEY=ey... node scripts/loadIbgeCities.mjs
 *
 * Idempotente: usa ON CONFLICT em ibge_code. Pode rodar quantas vezes quiser.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Lê VITE_SUPABASE_URL do .env
function readEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) throw new Error('.env não encontrado em ' + envPath);
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = readEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL ausente no .env');
if (!SERVICE_KEY) {
  console.error('\n❌ SUPABASE_SERVICE_ROLE_KEY não definida.');
  console.error('   Defina com: $env:SUPABASE_SERVICE_ROLE_KEY="ey..." (PowerShell)');
  console.error('              export SUPABASE_SERVICE_ROLE_KEY=ey... (bash)\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const IBGE_API = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const SOURCE_VERSION = `IBGE-${new Date().getFullYear()}`;

async function main() {
  console.log('📥 Baixando municípios do IBGE...');
  const res = await fetch(IBGE_API);
  if (!res.ok) throw new Error(`IBGE API retornou ${res.status}`);
  const municipios = await res.json();
  console.log(`   ${municipios.length} municípios recebidos.`);

  console.log('🔍 Carregando estados do banco...');
  const { data: states, error: stErr } = await supabase
    .from('master_states')
    .select('id, code, ibge_code');
  if (stErr) throw stErr;
  const stateByIbge = new Map(states.filter(s => s.ibge_code).map(s => [s.ibge_code, s.id]));
  console.log(`   ${stateByIbge.size} estados disponíveis.`);

  // Monta linhas de cidade
  const rows = [];
  let skipped = 0;
  for (const m of municipios) {
    const stateIbge = m.microrregiao?.mesorregiao?.UF?.id;
    const stateId = stateByIbge.get(stateIbge);
    if (!stateId) { skipped++; continue; }
    rows.push({
      state_id: stateId,
      name: m.nome,
      ibge_code: m.id,
      is_capital: false,
      is_active: true,
      system_default: true,
      source_version: SOURCE_VERSION,
    });
  }
  if (skipped) console.warn(`⚠️  ${skipped} municípios sem estado mapeado — ignorados.`);

  // Upsert em lotes (limite prático)
  const BATCH = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('master_cities')
      .upsert(slice, { onConflict: 'ibge_code', ignoreDuplicates: false });
    if (error) {
      console.error(`❌ Erro no lote ${i}-${i + BATCH}:`, error.message);
      throw error;
    }
    upserted += slice.length;
    process.stdout.write(`\r📤 Upserted ${upserted}/${rows.length}`);
  }
  console.log('');

  // Marca capitais (lista IBGE oficial)
  const CAPITAIS_IBGE = [
    1200401, 2704302, 1600303, 1302603, 2927408, 2304400, 5300108, 3205309,
    5208707, 2111300, 5103403, 5002704, 3106200, 1501402, 2507507, 4106902,
    2611606, 2211001, 3304557, 2408102, 4314902, 1100205, 1400100, 4205407,
    3550308, 2800308, 1721000,
  ];
  const { error: capErr } = await supabase
    .from('master_cities')
    .update({ is_capital: true })
    .in('ibge_code', CAPITAIS_IBGE);
  if (capErr) console.warn('⚠️  Falha ao marcar capitais:', capErr.message);

  console.log(`✅ Concluído: ${upserted} cidades upserted, ${CAPITAIS_IBGE.length} capitais marcadas.`);
}

main().catch(err => {
  console.error('❌ Falha:', err);
  process.exit(1);
});
