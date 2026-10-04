/**
 * CAMADAS DA COBERTURA E DA LAJE (04/10/2026, kernel 0.91.0 — E1.2 do roadmap
 * de climatização): a composição de cima para baixo que dá o U para a carga
 * térmica. Declara, relê, remove; só a LAJE tem camadas; lista vazia é recusada;
 * o canônico omite quando ausente.
 */
import { describe, expect, it } from 'vitest';
import {
  KernelError,
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  snapshotHash,
  type BlueprintModel,
  type CamadaParede,
} from '../utils/blueprintKernel';
import { desempenhoTermico, type Material } from '../utils/blueprintMateriais';

const COBERTURA: CamadaParede[] = [
  { espessuraMm: 20, itemCode: 'telha', descricao: 'Telha cerâmica', funcao: 'ACABAMENTO' },
  { espessuraMm: 50, itemCode: 'la', descricao: 'Lã de rocha', funcao: 'ISOLAMENTO' },
  { espessuraMm: 100, itemCode: 'conc', descricao: 'Laje de concreto', funcao: 'ESTRUTURAL' },
];

function cena(): { m: BlueprintModel; aguaId: string; lajeId: string; pilarId: string } {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const m = applyBatch(a, [
    { type: 'AddAgua', levelId: t, pontos: [point(0, 0), point(6000, 0), point(6000, 4000), point(0, 4000)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 150 },
    { type: 'AddStructural', levelId: t, kind: 'LAJE', pontos: [point(0, 0), point(6000, 0), point(6000, 4000), point(0, 4000)], larguraMm: 0, profundidadeMm: 0, alturaMm: 120, baseMm: 2800 },
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(0, 0)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, baseMm: 0 },
  ] as never).model;
  return { m, aguaId: m.roofs![0].id, lajeId: m.structures!.find((s) => s.kind === 'LAJE')!.id, pilarId: m.structures!.find((s) => s.kind === 'PILAR')!.id };
}

describe('camadas da cobertura e da laje', () => {
  it('declara, relê pelo canônico (omitido quando ausente), remove; a cópia não é o array do chamador', () => {
    const { m, aguaId, lajeId } = cena();
    expect(canonicalPayload(m)).not.toContain('"camadas"');
    const com = applyBatch(m, [
      { type: 'SetAguaProps', aguaId, camadas: COBERTURA },
      { type: 'SetStructuralProps', structuralId: lajeId, camadas: COBERTURA.slice(1) },
    ]).model;
    expect(com.roofs![0].camadas).toEqual(COBERTURA);
    expect(com.roofs![0].camadas).not.toBe(COBERTURA);
    expect(com.structures!.find((s) => s.id === lajeId)!.camadas).toHaveLength(2);
    const payload = canonicalPayload(com);
    expect((payload.match(/"camadas"/g) ?? []).length).toBe(2);
    const relido = modelFromCanonicalPayload(parseCanonicalPayload(payload));
    expect(relido.roofs![0].camadas).toEqual(COBERTURA);
    expect(snapshotHash(relido)).toBe(snapshotHash(com));
    expect(snapshotHash(com)).not.toBe(snapshotHash(m));
    const sem = applyBatch(com, [
      { type: 'SetAguaProps', aguaId, camadas: null },
      { type: 'SetStructuralProps', structuralId: lajeId, camadas: null },
    ]).model;
    expect(sem.roofs![0].camadas).toBeUndefined();
    expect(snapshotHash(sem)).toBe(snapshotHash(m));
  });

  it('só a laje tem camadas; lista vazia, espessura não positiva e função estranha são recusadas', () => {
    const { m, aguaId, lajeId, pilarId } = cena();
    expect(() => applyCommand(m, { type: 'SetStructuralProps', structuralId: pilarId, camadas: COBERTURA })).toThrow(/só a laje/);
    expect(() => applyCommand(m, { type: 'SetAguaProps', aguaId, camadas: [] })).toThrow(KernelError);
    expect(() => applyCommand(m, { type: 'SetStructuralProps', structuralId: lajeId, camadas: [{ ...COBERTURA[0], espessuraMm: 0 }] })).toThrow(/não positiva/);
    expect(() => applyCommand(m, { type: 'SetAguaProps', aguaId, camadas: [{ ...COBERTURA[0], funcao: 'TELHA' as never }] })).toThrow(/Função de camada inválida/);
  });

  it('o U da cobertura sai das camadas pela NBR 15220 (fluxo descendente 0,17 / 0,04) — e falta de λ é dita, não zerada', () => {
    const material = (codigo: string, condutividadeWmK: number | null) => ({ id: codigo, organizationId: 'o', codigo, nome: codigo, fonte: 'SINAPI', unidade: 'm3', custo: 0, fabricante: null, densidadeKgM3: null, condutividadeWmK, cor: null }) as unknown as Material;
    const por = new Map([material('telha', 1.05), material('la', 0.045), material('conc', 1.75)].map((x) => [x.codigo, x]));
    const d = desempenhoTermico(COBERTURA, por, 0.17, 0.04);
    // 0,02/1,05 + 0,05/0,045 + 0,10/1,75 = 0,019 + 1,111 + 0,057 = 1,187 → U = 1/(0,17 + 1,187 + 0,04) ≈ 0,716
    expect(d.resistenciaM2KW).toBeCloseTo(1.187, 2);
    expect(d.transmitanciaWm2K!).toBeCloseTo(0.716, 2);
    const semLa = desempenhoTermico(COBERTURA, new Map([...por].filter(([k]) => k !== 'la')), 0.17, 0.04);
    expect(semLa.transmitanciaWm2K).toBeNull();
    expect(semLa.camadasSemLambda).toEqual(['Lã de rocha']);
  });
});
