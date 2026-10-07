/**
 * VIDRO E PROTEÇÃO SOLAR DA ABERTURA (04/10/2026, kernel 0.91.0 — E1.1 do
 * roadmap de climatização): declaração na abertura, faixas, canônico ida e
 * volta, omissão quando ausente, e a versão.
 */
import { describe, expect, it } from 'vitest';
import {
  FATOR_DE_SOMBREAMENTO_DA_PROTECAO,
  KERNEL_VERSION,
  KernelError,
  PROTECOES_SOLARES,
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  fatorDeSombreamento,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  snapshotHash,
  type BlueprintModel,
  type VidroDaAbertura,
} from '../utils/blueprintKernel';

const VIDRO: VidroDaAbertura = { fatorSolar: 0.87, uWm2K: 5.7, protecao: 'PELICULA_CORTINA', fatorSombreamento: null };

function paredeComJanela(): { m: BlueprintModel; openingId: string; vaoId: string } {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const b = applyCommand(a, { type: 'AddWall', levelId: t, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 }).model;
  const w = b.walls[0].id;
  const m = applyBatch(b, [
    { type: 'AddOpening', wallId: w, kind: 'window', offsetMm: 1000, widthMm: 1200, heightMm: 1100, sillMm: 1000 },
    { type: 'AddOpening', wallId: w, kind: 'passage', offsetMm: 3500, widthMm: 900, heightMm: 2100, sillMm: 0 },
  ] as never).model;
  return { m, openingId: m.openings[0].id, vaoId: m.openings[1].id };
}

describe('vidro da abertura', () => {
  it('a versão subiu para 0.91.0 e a tabela de proteções tem um número por proteção (menos a personalizada)', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.93.0');
    for (const p of PROTECOES_SOLARES) {
      if (p === 'PERSONALIZADA') continue;
      const f = FATOR_DE_SOMBREAMENTO_DA_PROTECAO[p];
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThanOrEqual(1);
    }
    expect(fatorDeSombreamento({ fatorSolar: null, uWm2K: null, protecao: 'PELICULA', fatorSombreamento: null })).toBe(0.75);
    expect(fatorDeSombreamento({ fatorSolar: null, uWm2K: null, protecao: 'PELICULA', fatorSombreamento: 0.6 })).toBe(0.6);
  });

  it('declara, lê de volta, remove; o canônico só emite `vidro` quando há', () => {
    const { m, openingId } = paredeComJanela();
    expect(canonicalPayload(m)).not.toContain('"vidro"');
    const com = applyCommand(m, { type: 'SetOpeningVidro', openingId, vidro: VIDRO }).model;
    expect(com.openings[0].vidro).toEqual(VIDRO);
    expect(com.openings[0].vidro).not.toBe(VIDRO); // cópia, não o objeto do chamador
    const payload = canonicalPayload(com);
    expect(payload).toContain('"vidro":{"fatorSolar":0.87');
    const relido = modelFromCanonicalPayload(parseCanonicalPayload(payload));
    expect(relido.openings[0].vidro).toEqual(VIDRO);
    expect(snapshotHash(relido)).toBe(snapshotHash(com));
    expect(snapshotHash(com)).not.toBe(snapshotHash(m)); // vidro é desenho: muda o hash
    const sem = applyCommand(com, { type: 'SetOpeningVidro', openingId, vidro: null }).model;
    expect(sem.openings[0].vidro).toBeUndefined();
    expect(snapshotHash(sem)).toBe(snapshotHash(m));
  });

  it('faixas: fator solar e sombreamento em (0, 1], U em (0, 10]; personalizada exige o fator; vão livre não tem vidro', () => {
    const { m, openingId, vaoId } = paredeComJanela();
    const tenta = (vidro: VidroDaAbertura, id = openingId) => () => applyCommand(m, { type: 'SetOpeningVidro', openingId: id, vidro });
    expect(tenta({ ...VIDRO, fatorSolar: 1.2 })).toThrow(KernelError);
    expect(tenta({ ...VIDRO, fatorSolar: 0 })).toThrow(/Fator solar/);
    expect(tenta({ ...VIDRO, uWm2K: 11 })).toThrow(/U fora/);
    expect(tenta({ ...VIDRO, protecao: 'PERSONALIZADA', fatorSombreamento: null })).toThrow(/sem fator de sombreamento/);
    expect(tenta({ ...VIDRO, protecao: 'PERSONALIZADA', fatorSombreamento: 0.5 })).not.toThrow();
    expect(tenta({ ...VIDRO, protecao: 'ESPELHO' as never })).toThrow(/Proteção solar inválida/);
    expect(tenta(VIDRO, vaoId)).toThrow(/Vão livre/);
    // Trocar a janela por vão livre com vidro declarado: a invariante pega.
    const com = applyCommand(m, { type: 'SetOpeningVidro', openingId, vidro: VIDRO }).model;
    expect(() => applyCommand(com, { type: 'SetOpeningKind', openingId, kind: 'passage' } as never)).toThrow(/Vão livre/);
  });
});
