/**
 * O bundle da Edge Function `topografia-copernicus` está FRESCO (11/10/2026).
 *
 * O deploy da function usa o `cog.bundle.mjs` COMMITADO. Mexer em
 * `utils/geo/cog.ts` ou `tiff.ts` sem rodar
 * `node scripts/build-topografia-copernicus.mjs` publicaria o leitor antigo —
 * calado. Este teste gera o bundle em memória e compara com o arquivo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gerarBundle, SAIDA } from '../scripts/build-topografia-copernicus.mjs';

describe('bundle da topografia-copernicus', () => {
  it('é o que o esbuild gera hoje de utils/geo/cog.ts', async () => {
    const commitado = readFileSync(SAIDA, 'utf8').replace(/\r\n/g, '\n');
    const atual: string = await gerarBundle();
    expect(commitado === atual, 'bundle desatualizado: rode `node scripts/build-topografia-copernicus.mjs`').toBe(true);
  });
});
