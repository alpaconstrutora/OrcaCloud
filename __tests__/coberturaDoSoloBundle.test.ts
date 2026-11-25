/**
 * O bundle da Edge Function `cobertura-do-solo` está FRESCO (25/11/2026) — o mesmo portão de
 * `topografiaCopernicusBundle.test.ts`: o deploy usa o `cobertura.bundle.mjs` COMMITADO, e mexer no
 * leitor sem rodar `node scripts/build-cobertura-do-solo.mjs` publicaria o antigo, calado.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gerarBundle, SAIDA } from '../scripts/build-cobertura-do-solo.mjs';

describe('bundle da cobertura-do-solo', () => {
  it('é o que o esbuild gera hoje de utils/geo/coberturaDoSolo.ts', async () => {
    const commitado = readFileSync(SAIDA, 'utf8').replace(/\r\n/g, '\n');
    const atual: string = await gerarBundle();
    expect(commitado === atual, 'bundle desatualizado: rode `node scripts/build-cobertura-do-solo.mjs`').toBe(true);
  });
});
