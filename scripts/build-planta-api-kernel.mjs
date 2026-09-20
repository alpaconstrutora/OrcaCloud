// Empacota o KERNEL da Planta Inteligente para a Edge Function `planta-api`
// (20/09/2026, E9.2).
//
// A function roda em Deno e só enxerga o que está em `supabase/functions/`;
// o kernel (quantitativos, IFC, planilha) é TypeScript do app. Em vez de
// duplicar, este script gera `supabase/functions/planta-api/kernel.bundle.mjs`
// com esbuild (ESM, sem dependências externas) — e o bundle é COMMITADO, para
// o deploy não depender de build local.
//
// Rodar depois de qualquer mudança no kernel, em `blueprintIfc.ts` ou em
// `blueprintPlanilha.ts`:
//
//     node scripts/build-planta-api-kernel.mjs
//
// O teste `__tests__/plantaApiKernelBundle.test.ts` acusa bundle desatualizado
// comparando a KERNEL_VERSION do bundle com a do código.
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'planta-api-'));
const entrada = join(dir, 'entry.ts');
const u = (p) => resolve(raiz, p).replace(/\\/g, '/');
writeFileSync(
  entrada,
  [
    `export { KERNEL_VERSION, POLITICA_PADRAO, computeQuantities, modelFromCanonicalPayload, parseCanonicalPayload, snapshotHash, unidadeDaEtiqueta, acabamentosDoAmbiente } from '${u('utils/blueprintKernel/index.ts')}';`,
    `export { gerarIfc } from '${u('utils/blueprintIfc.ts')}';`,
    `export { abasDoQuantitativo } from '${u('utils/blueprintPlanilha.ts')}';`,
    '',
  ].join('\n'),
);
const saida = resolve(raiz, 'supabase/functions/planta-api/kernel.bundle.mjs');
const r = await build({
  entryPoints: [entrada],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  mainFields: ['module', 'main'],
  outfile: saida,
  legalComments: 'none',
  banner: { js: '// GERADO por scripts/build-planta-api-kernel.mjs — não editar. Reexporta o kernel da Planta Inteligente para a Edge Function planta-api.' },
  logLevel: 'warning',
});
rmSync(dir, { recursive: true, force: true });
if (r.errors.length) process.exit(1);
console.log('kernel.bundle.mjs gerado em', saida);
