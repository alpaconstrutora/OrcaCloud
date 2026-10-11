// Empacota o leitor de COG (`utils/geo/cog.ts` + `tiff.ts`) para a Edge
// Function `topografia-copernicus` (11/10/2026).
//
// A function roda em Deno e só enxerga o que está em `supabase/functions/`.
// Mesmo padrão do `planta-api`: em vez de duplicar o leitor, o esbuild gera
// `supabase/functions/topografia-copernicus/cog.bundle.mjs`, e o bundle é
// COMMITADO — o deploy não depende de build local.
//
// Rodar depois de mexer em `utils/geo/cog.ts` ou `utils/geo/tiff.ts`:
//
//     node scripts/build-topografia-copernicus.mjs
//
// `__tests__/topografiaCopernicusBundle.test.ts` gera de novo em memória e
// acusa bundle desatualizado.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const SAIDA = resolve(raiz, 'supabase/functions/topografia-copernicus/cog.bundle.mjs');

/** O texto do bundle, sem gravar. */
export async function gerarBundle() {
  const r = await build({
    entryPoints: [resolve(raiz, 'utils/geo/cog.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    legalComments: 'none',
    banner: { js: '// GERADO por scripts/build-topografia-copernicus.mjs — não editar. Leitor de COG (utils/geo/cog.ts) para a Edge Function topografia-copernicus.' },
    logLevel: 'warning',
  });
  if (r.errors.length) throw new Error('esbuild falhou');
  // Fim de linha fixo: o teste compara texto, e o Windows não pode mudar o resultado.
  return r.outputFiles[0].text.replace(/\r\n/g, '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeFileSync(SAIDA, await gerarBundle());
  console.log('cog.bundle.mjs gerado em', SAIDA);
}
