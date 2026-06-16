/**
 * Importa uma competência SINAPI a partir da planilha consolidada (Modelo_SINAPI.xlsx).
 * Insere/atualiza em public.sinapi_items e registra a versão em public.sinapi_references.
 *
 * Pré-requisito: migration 20261203000000_sinapi_versioning.sql aplicada
 * (PK composta code+reference_date e tabela sinapi_references).
 *
 * Uso (PowerShell):
 *   $env:SUPABASE_SERVICE_ROLE_KEY = Read-Host "Cole a sb_secret_..."
 *   node scripts/loadSinapi.mjs <arquivo.xlsx> <reference_date AAAA-MM-DD> "<label MM/AAAA>"
 *
 * Exemplo:
 *   node scripts/loadSinapi.mjs ./SINAPI_03_2026.xlsx 2026-03-01 "03/2026"
 *
 * Idempotente: re-rodar a mesma competência sobrescreve (ON CONFLICT code,reference_date).
 */

import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];
const DEFAULT_PRICE_UF = 'SP'; // coluna `price` denormalizada = SP/sem (convenção do 12/2025)

// ── env / args ────────────────────────────────────────────────────────────────
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

const [, , filePath, referenceDate, labelArg] = process.argv;
if (!filePath || !referenceDate) {
  console.error('Uso: node scripts/loadSinapi.mjs <arquivo.xlsx> <reference_date AAAA-MM-DD> "<label MM/AAAA>"');
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
  console.error('reference_date inválido. Use o formato AAAA-MM-DD (ex: 2026-03-01).');
  process.exit(1);
}
const label = labelArg || (() => {
  const [y, m] = referenceDate.split('-');
  return `${m}/${y}`;
})();

const env = readEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL ausente no .env');
if (!SERVICE_KEY) {
  console.error('\n❌ SUPABASE_SERVICE_ROLE_KEY não definida. Defina antes de rodar.\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── helpers de leitura ──────────────────────────────────────────────────────────
function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'object' && 'result' in v) v = v.result; // célula de fórmula
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v) {
  if (v == null) return '';
  if (typeof v === 'object' && 'result' in v) v = v.result;
  if (typeof v === 'object' && 'text' in v) v = v.text; // rich text
  return String(v).trim();
}

/** Lê uma worksheet como array de objetos { header: value } usando a 1ª linha como cabeçalho. */
function sheetToObjects(ws) {
  if (!ws) return [];
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col] = str(cell.value).toLowerCase();
  });
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj = {};
    let hasData = false;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = headers[col];
      if (!key) return;
      obj[key] = cell.value;
      hasData = true;
    });
    if (hasData) rows.push(obj);
  }
  return rows;
}

async function main() {
  console.log(`📖 Lendo planilha: ${filePath}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const itensWs = wb.getWorksheet('Itens');
  const compWs = wb.getWorksheet('Composicoes');
  if (!itensWs) throw new Error('Aba "Itens" não encontrada na planilha.');

  // ── 1. Composições: agrupa filhos por código pai ──────────────────────────────
  const compByParent = new Map();
  for (const row of sheetToObjects(compWs)) {
    const parent = str(row['codigo_pai']);
    const childCode = str(row['codigo_item']);
    if (!parent || !childCode) continue;
    if (!compByParent.has(parent)) compByParent.set(parent, []);
    compByParent.get(parent).push({
      code: childCode,
      description: str(row['descricao_item']),
      unit: str(row['unidade_item']),
      type: str(row['tipo_item']).toUpperCase() || 'INPUT',
      quantity: num(row['coeficiente']),
    });
  }
  console.log(`   ${compByParent.size} composições com componentes na aba Composicoes.`);

  // ── 2. Itens: monta prices JSONB + composition ────────────────────────────────
  const itemRows = sheetToObjects(itensWs);
  const rows = [];
  for (const row of itemRows) {
    const code = str(row['codigo']);
    if (!code) continue;

    const prices = {};
    for (const uf of UFS) {
      const sem = num(row[`${uf}_sem`.toLowerCase()]);
      const com = num(row[`${uf}_com`.toLowerCase()]);
      prices[uf] = { com, sem };
    }
    // price denormalizado (fallback): UF padrão/sem → senão primeiro valor não-zero
    let price = prices[DEFAULT_PRICE_UF]?.sem || prices[DEFAULT_PRICE_UF]?.com || 0;
    if (!price) {
      const firstNonZero = UFS.map(uf => prices[uf].sem || prices[uf].com).find(v => v > 0);
      price = firstNonZero || 0;
    }

    const composition = compByParent.get(code);

    rows.push({
      code,
      reference_date: referenceDate,
      description: str(row['descricao']),
      unit: str(row['unidade']),
      type: str(row['tipo']).toUpperCase() || 'INPUT',
      nature: str(row['natureza']) || null,
      category: str(row['grupo']) || null,
      price,
      prices,
      composition: composition ? JSON.stringify(composition) : null,
      source: 'SINAPI',
      origin: 'SINAPI',
      // search_tsv NÃO é enviado (coluna gerada/populada pelo banco).
    });
  }
  console.log(`   ${rows.length} itens prontos para upsert (competência ${label}).`);
  if (rows.length === 0) throw new Error('Nenhum item válido encontrado na aba Itens.');

  // ── 3. Upsert em lotes ────────────────────────────────────────────────────────
  const BATCH = 200;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('sinapi_items')
      .upsert(slice, { onConflict: 'code,reference_date', ignoreDuplicates: false });
    if (error) throw error;
    upserted += slice.length;
    process.stdout.write(`\r📤 Upserted ${upserted}/${rows.length}`);
  }
  console.log('');

  // ── 4. Registra/atualiza a competência ────────────────────────────────────────
  const { count } = await supabase
    .from('sinapi_items')
    .select('code', { count: 'exact', head: true })
    .eq('reference_date', referenceDate);

  const { error: refError } = await supabase
    .from('sinapi_references')
    .upsert({
      reference_date: referenceDate,
      label,
      status: 'published',
      item_count: count ?? upserted,
      imported_at: new Date().toISOString(),
      notes: `Importado via loadSinapi.mjs de ${path.basename(filePath)}.`,
    }, { onConflict: 'reference_date' });
  if (refError) throw refError;

  console.log(`✅ Competência ${label} importada: ${count ?? upserted} itens em sinapi_items + registro em sinapi_references.`);
}

main().catch(err => {
  console.error('\n❌ Falha:', err.message || err);
  process.exit(1);
});
