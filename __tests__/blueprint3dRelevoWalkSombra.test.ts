/**
 * Walk no relevo e câmera de sombra (fase 2 da topografia, 10/09/2026).
 */
import { describe, expect, it } from 'vitest';
import { ALTURA_DO_OLHO_M, alturaDoOlho } from '../utils/blueprint3dWalk';
import { sombraDaCena } from '../utils/blueprint3dEnquadramento';

describe('alturaDoOlho', () => {
  it('sem relevo, o olho fica a 1,6 m do zero — como sempre', () => {
    expect(alturaDoOlho(null)).toBe(ALTURA_DO_OLHO_M);
  });
  it('com relevo, acompanha o chão: subir 3 m sobe o olho 3 m', () => {
    expect(alturaDoOlho(3)).toBeCloseTo(3 + ALTURA_DO_OLHO_M, 9);
    expect(alturaDoOlho(-2)).toBeCloseTo(-2 + ALTURA_DO_OLHO_M, 9);
  });
});

describe('sombraDaCena', () => {
  it('cresce com a cena e nunca fica menor que uma casa', () => {
    expect(sombraDaCena(6).meia).toBe(8);
    expect(sombraDaCena(60).meia).toBeCloseTo(45, 9);
    expect(sombraDaCena(60).far).toBeGreaterThan(60);
  });
  it('mapa maior só na cena grande', () => {
    expect(sombraDaCena(12).mapa).toBe(2048);
    expect(sombraDaCena(80).mapa).toBe(4096);
  });
});
