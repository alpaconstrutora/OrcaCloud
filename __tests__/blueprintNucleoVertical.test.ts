/**
 * Núcleo vertical (19/09/2026, E2.4): shaft/elevador atravessando pavimentos,
 * furos na laje, escada multiandares, clash núcleo × estrutura, ficha do
 * elevador, shaft preferido pelas prumadas, canônico.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  computeQuantities,
  conflitosArquitetonicos,
  desnivelDaEscada,
  emptyModel,
  furosDoNucleo,
  medirNucleo,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  pavimentosDoNucleo,
  point,
  POLITICA_PADRAO,
  snapshotHash,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { fichaPorCapacidade, rotuloDoNucleo, shaftPreferido, nucleosDoNivel } from '../utils/blueprintNucleoVertical';

/** Três pavimentos (0 / 2800 / 5600), cada um com uma laje de teto 10 × 8 m. */
function predio(): { m: BlueprintModel; t: string; p1: string; p2: string } {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
    { type: 'AddLevel', name: '1º', elevationMm: 2800, defaultHeightMm: 2800 },
    { type: 'AddLevel', name: '2º', elevationMm: 5600, defaultHeightMm: 2800 },
  ]).model;
  const [t, p1, p2] = m.levels.map((l) => l.id);
  const laje = (levelId: string): Command => ({
    type: 'AddStructural',
    levelId,
    kind: 'LAJE',
    pontos: [point(0, 0), point(10000, 0), point(10000, 8000), point(0, 8000)],
    alturaMm: 120,
    baseMm: 2800,
    rotulo: 'L',
  });
  m = applyBatch(m, [laje(t), laje(p1), laje(p2)]).model;
  return { m, t, p1, p2 };
}

const caixa = [point(1000, 1000), point(2800, 1000), point(2800, 3100), point(1000, 3100)];

describe('núcleo vertical', () => {
  it('elevador do térreo ao topo atravessa 3 pavimentos e fura as 3 lajes de teto; a laje perde a área; medidas do elevador', () => {
    const { m } = predio();
    const x = applyCommand(m, { type: 'AddNucleo', levelId: m.levels[0].id, tipo: 'ELEVADOR', ring: caixa, rotulo: 'E1', capacidade: 8, pocoMm: 1500, casaDeMaquinasMm: 2600 }).model;
    const n = x.nucleos[0];
    expect(pavimentosDoNucleo(x, n).map((l) => l.name)).toEqual(['Térreo', '1º', '2º']);
    const furos = furosDoNucleo(x);
    expect(furos).toHaveLength(3);
    expect(furos.every((f) => f.areaMm2 === 1800 * 2100)).toBe(true);
    const q = computeQuantities(x, POLITICA_PADRAO);
    const lajes = q.estruturas.filter((e) => e.kind === 'LAJE');
    expect(lajes.every((l) => Math.abs(l.areaPlantaM2 - (80 - 3.78)) < 0.001)).toBe(true);
    const med = medirNucleo(x, n);
    expect(med).toMatchObject({ areaMm2: 1800 * 2100, pavimentos: 3, alturaMm: 8400, alturaTotalMm: 8400 + 1500 + 2600, lajesFuradas: 3 });
    expect(rotuloDoNucleo(n)).toBe('E1 · 8 pass.');
    expect(fichaPorCapacidade(8)?.caixaMm).toEqual([1800, 2100]);
    // Só até o 1º: 2 pavimentos, 2 furos (teto do térreo e do 1º).
    const y = applyCommand(x, { type: 'SetNucleoProps', nucleoId: n.id, ateLevelId: m.levels[1].id }).model;
    expect(pavimentosDoNucleo(y, y.nucleos[0])).toHaveLength(2);
    expect(furosDoNucleo(y)).toHaveLength(2);
    // Virar shaft apaga as medidas de elevador; poço num shaft é recusado; chegada abaixo da partida idem.
    const z = applyCommand(y, { type: 'SetNucleoProps', nucleoId: n.id, tipo: 'SHAFT' }).model;
    expect(z.nucleos[0].pocoMm).toBeUndefined();
    expect(z.nucleos[0].capacidade).toBeUndefined();
    expect(() => applyCommand(z, { type: 'SetNucleoProps', nucleoId: n.id, pocoMm: 1000 })).toThrow(/só existe no elevador/);
    const doPrimeiro = applyCommand(m, { type: 'AddNucleo', levelId: m.levels[1].id, tipo: 'SHAFT', ring: caixa });
    expect(() => applyCommand(doPrimeiro.model, { type: 'SetNucleoProps', nucleoId: doPrimeiro.model.nucleos[0].id, ateLevelId: m.levels[0].id })).toThrow(/acima da partida/);
    expect(() => applyCommand(m, { type: 'AddNucleo', levelId: m.levels[0].id, tipo: 'SHAFT', ring: [point(0, 0), point(1000, 0)] })).toThrow(/pelo menos 3/);
    // Remover o pavimento de partida leva o núcleo; remover a chegada declarada volta ao padrão.
    expect(applyCommand(y, { type: 'RemoveLevel', levelId: m.levels[0].id }).model.nucleos).toHaveLength(0);
    const semPrimeiro = applyCommand(y, { type: 'RemoveLevel', levelId: m.levels[1].id }).model;
    expect(semPrimeiro.nucleos[0].ateLevelId).toBeUndefined();
    expect(pavimentosDoNucleo(semPrimeiro, semPrimeiro.nucleos[0]).map((l) => l.name)).toEqual(['Térreo', '2º']);
  });

  it('escada multiandares: `ateLevelId` define o desnível; chegada abaixo é recusada; RemoveLevel da chegada volta ao próximo', () => {
    const { m, t, p2, p1 } = predio();
    let x = applyCommand(m, { type: 'AddEscada', levelId: t, pontos: [point(5000, 5000), point(5000, 8000)], larguraMm: 1200 }).model;
    const e = x.stairs[0];
    expect(desnivelDaEscada(x, e)).toBe(2800);
    x = applyCommand(x, { type: 'SetEscadaProps', escadaId: e.id, ateLevelId: p2 }).model;
    expect(desnivelDaEscada(x, x.stairs[0])).toBe(5600);
    expect(() => applyCommand(applyCommand(m, { type: 'AddEscada', levelId: p1, pontos: [point(0, 0), point(0, 3000)] }).model, { type: 'SetEscadaProps', escadaId: 'esc_0001', ateLevelId: t })).toThrow(/acima da partida/);
    const semTopo = applyCommand(x, { type: 'RemoveLevel', levelId: p2 }).model;
    expect(semTopo.stairs[0].ateLevelId).toBeUndefined();
    expect(desnivelDaEscada(semTopo, semTopo.stairs[0])).toBe(2800);
    // Volta ao padrão explícito com null.
    const padrao = applyCommand(x, { type: 'SetEscadaProps', escadaId: e.id, ateLevelId: null }).model;
    expect(padrao.stairs[0].ateLevelId).toBeUndefined();
  });

  it('clash NUCLEO_X_ESTRUTURA: pilar dentro do shaft num pavimento atravessado; laje não conta; pilar fora do alcance vertical não conta', () => {
    const { m, t, p1, p2 } = predio();
    let x = applyCommand(m, { type: 'AddNucleo', levelId: t, tipo: 'SHAFT', ring: caixa, ateLevelId: p1 }).model;
    x = applyBatch(x, [
      { type: 'AddStructural', levelId: p1, kind: 'PILAR', pontos: [point(1500, 1500)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800, rotulo: 'P1' },
      { type: 'AddStructural', levelId: p2, kind: 'PILAR', pontos: [point(1500, 1500)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800, rotulo: 'P2' },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(6000, 6000)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800, rotulo: 'P3' },
    ]).model;
    const c = conflitosArquitetonicos(x).filter((k) => k.classe === 'NUCLEO_X_ESTRUTURA');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ familia: 'nucleo', levelId: p1, medidaMm: 300 });
    expect(x.structures.find((s) => s.id === c[0].outroId)!.rotulo).toBe('P1');
  });

  it('shaft preferido: o mais próximo ao alcance no pavimento; nenhum fora do raio ou noutro pavimento; elevador não conta', () => {
    const { m, t, p1, p2 } = predio();
    const x = applyBatch(m, [
      { type: 'AddNucleo', levelId: t, tipo: 'SHAFT', ring: caixa, ateLevelId: p1, rotulo: 'S1' },
      { type: 'AddNucleo', levelId: t, tipo: 'ELEVADOR', ring: [point(5000, 5000), point(6800, 5000), point(6800, 7100), point(5000, 7100)] },
    ]).model;
    expect(shaftPreferido(x, point(3500, 2000), t, 3000)).toEqual({ x: 1900, y: 2050 });
    expect(shaftPreferido(x, point(3500, 2000), t, 1000)).toBeNull();
    expect(shaftPreferido(x, point(3500, 2000), p2, 3000)).toBeNull();
    expect(shaftPreferido(x, point(5500, 5500), t, 3000)).toBeNull(); // só o elevador por perto
    expect(nucleosDoNivel(x, p2).map((n) => n.tipo)).toEqual(['ELEVADOR']);
  });

  it('canônico: `nucleos` e `stairs[].ate` por índice; ida e volta byte a byte; sem núcleo a chave some', () => {
    const { m, t, p2 } = predio();
    const x = applyBatch(m, [
      { type: 'AddNucleo', levelId: t, tipo: 'ELEVADOR', ring: caixa, ateLevelId: p2, rotulo: 'E1', capacidade: 6, pocoMm: 1400, casaDeMaquinasMm: 2400 },
      { type: 'AddEscada', levelId: t, pontos: [point(5000, 5000), point(5000, 8000)] },
    ]).model;
    const y = applyCommand(x, { type: 'SetEscadaProps', escadaId: x.stairs[0].id, ateLevelId: p2 }).model;
    expect(parseCanonicalPayload(canonicalPayload(m)).nucleos).toBeUndefined();
    const json = canonicalPayload(y);
    const payload = parseCanonicalPayload(json);
    expect(payload.nucleos![0]).toMatchObject({ level: 0, ate: 2, tipo: 'ELEVADOR', rotulo: 'E1', capacidade: 6, pocoMm: 1400, casaDeMaquinasMm: 2400 });
    expect(payload.stairs![0].ate).toBe(2);
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(json);
    expect(volta.nucleos[0].ateLevelId).toBe(volta.levels[2].id);
    expect(volta.stairs[0].ateLevelId).toBe(volta.levels[2].id);
    expect(snapshotHash(volta)).toBe(snapshotHash(y));
  });
});
