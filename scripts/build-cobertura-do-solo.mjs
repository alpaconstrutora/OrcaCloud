// Empacota o leitor do WorldCover (`utils/geo/coberturaDoSolo.ts` + `cog.ts` + `tiff.ts`) para a
// Edge Function `cobertura-do-solo` (25/11/2026) — o mesmo padrão de
// `scripts/build-topografia-copernicus.mjs`: a function roda em Deno e só enxerga
// `supabase/functions/`, então o bundle é COMMITADO e o deploy não depende de build local.
//
// Rodar depois de mexer em `utils/geo/coberturaDoSolo.ts`, `cog.ts` ou `tiff.ts`:
//
//     node scripts/build-cobertura-do-solo.mjs
//
// `__tests__/coberturaDoSoloBundle.test.ts` gera de novo em memória e acusa bundle desatualizado.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const SAIDA = resolve(raiz, 'supabase/functions/cobertura-do-solo/cobertura.bundle.mjs');

/** O texto do bundle, sem gravar. */
export async function gerarBundle() {
  const r = await build({
    entryPoints: [resolve(raiz, 'utils/geo/coberturaDoSolo.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    legalComments: 'none',
    banner: { js: '// GERADO por scripts/build-cobertura-do-solo.mjs — não editar. Leitor do WorldCover (utils/geo/coberturaDoSolo.ts) para a Edge Function cobertura-do-solo.' },
    logLevel: 'warning',
  });
  if (r.errors.length) throw new Error('esbuild falhou');
  // Fim de linha fixo: o teste compara texto, e o Windows não pode mudar o resultado.
  return r.outputFiles[0].text.replace(/\r\n/g, '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeFileSync(SAIDA, await gerarBundle());
  console.log('cobertura.bundle.mjs gerado em', SAIDA);
}
