/**
 * Refresh full dos bancos do Brasil a partir da API pública do BACEN.
 * Atualiza/insere em public.master_banks.
 *
 * Fonte: lista PIX participantes do BACEN (mais completa que SPB).
 *   https://www.bcb.gov.br/pom/spb/estatistica/port/ParticipantesSTRport.csv
 *   Backup JSON-friendly: https://brasilapi.com.br/api/banks/v1
 *
 * Uso:
 *   $env:SUPABASE_SERVICE_ROLE_KEY = Read-Host "Cole a sb_secret_..."
 *   node scripts/loadBacenBanks.mjs
 *
 * Idempotente: usa ON CONFLICT em (code).
 * Rode mensalmente (ou via cron na Vercel/GitHub Actions) para manter atualizado.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function readEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) throw new Error('.env não encontrado em ' + envPath);
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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
  console.error('\n❌ SUPABASE_SERVICE_ROLE_KEY não definida.\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BRASIL_API = 'https://brasilapi.com.br/api/banks/v1';
const SOURCE_VERSION = `BACEN-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

function shortName(fullName) {
  if (!fullName) return null;
  // Pega o primeiro nome significativo (ignora "Banco", "S.A.", etc.)
  const cleaned = fullName
    .replace(/\bS\.?\s*A\.?\b/gi, '')
    .replace(/\bBanco\b/gi, '')
    .replace(/\bdo Brasil\b/gi, 'BB')
    .replace(/\bda\b|\bdo\b|\bde\b/gi, '')
    .trim();
  return cleaned.split(/\s+/).slice(0, 2).join(' ').slice(0, 30) || null;
}

async function main() {
  console.log('📥 Baixando bancos via BrasilAPI (proxy do BACEN)...');
  const res = await fetch(BRASIL_API);
  if (!res.ok) throw new Error(`BrasilAPI retornou ${res.status}`);
  const banks = await res.json();
  console.log(`   ${banks.length} bancos recebidos.`);

  // Monta linhas filtrando: precisa ter code (COMPE) E nome
  const rows = banks
    .filter(b => b.code != null && b.fullName)
    .map(b => ({
      code: String(b.code).padStart(3, '0'),
      ispb: b.ispb && /^\d{8}$/.test(String(b.ispb).padStart(8, '0'))
        ? String(b.ispb).padStart(8, '0')
        : null,
      name: b.fullName.trim(),
      short_name: shortName(b.name || b.fullName),
      pix_enabled: true,
      is_active: true,
      system_default: true,
      source_version: SOURCE_VERSION,
    }));

  console.log(`   ${rows.length} bancos com código COMPE válido.`);

  // Upsert
  const BATCH = 200;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('master_banks')
      .upsert(slice, { onConflict: 'code', ignoreDuplicates: false });
    if (error) {
      // ISPB pode colidir entre bancos do mesmo conglomerado — tenta de novo só com code
      if (error.message?.includes('ispb')) {
        const fallback = slice.map(r => ({ ...r, ispb: null }));
        const retry = await supabase.from('master_banks').upsert(fallback, { onConflict: 'code' });
        if (retry.error) throw retry.error;
      } else {
        throw error;
      }
    }
    upserted += slice.length;
    process.stdout.write(`\r📤 Upserted ${upserted}/${rows.length}`);
  }
  console.log('');
  console.log(`✅ Concluído: ${upserted} bancos sincronizados com BACEN.`);
}

main().catch(err => {
  console.error('❌ Falha:', err.message || err);
  process.exit(1);
});
