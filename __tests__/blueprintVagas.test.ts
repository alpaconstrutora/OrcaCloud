/**
 * Vagas de garagem (19/09/2026, E2.5): entidade, lançamento automático em
 * fileiras com circulação, obstáculos, tipos mínimos, exigência, idempotência,
 * aceite e canônico.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  contornoDaVaga,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  pointInPolygon,
  snapshotHash,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { comandosDeAceite, comandosDeLimpeza, exigenciaDeVagas, HIPOTESES_VAGAS_PADRAO, planejarVagas, regiaoDeVagas } from '../utils/blueprintVagasAutomaticas';

/** Garagem 20 × 15 m (eixo), paredes de 200, etiquetada. */
function garagem(): { m: BlueprintModel; t: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Subsolo', elevationMm: -2800, defaultHeightMm: 2600 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 200, heightMm: 2600 });
  m = applyBatch(m, [w(0, 0, 20000, 0), w(20000, 0, 20000, 15000), w(20000, 15000, 0, 15000), w(0, 15000, 0, 0)]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Garagem' }).model;
  return { m, t };
}

describe('kernel: vaga', () => {
  it('AddVaga com medidas do tipo; trocar o tipo troca as medidas; mover confirma a sugerida; canônico ida e volta', () => {
    const { m, t } = garagem();
    let x = applyCommand(m, { type: 'AddVaga', levelId: t, at: point(3000, 3000), sugerida: true }).model;
    expect(x.vagas[0]).toMatchObject({ tipo: 'COMUM', larguraMm: 2500, comprimentoMm: 5000, rotacaoGraus: 0, sugerida: true });
    expect(contornoDaVaga(x.vagas[0])).toEqual([point(1750, 500), point(4250, 500), point(4250, 5500), point(1750, 5500)]);
    x = applyCommand(x, { type: 'SetVagaProps', vagaId: x.vagas[0].id, tipo: 'PCD', numero: 'PCD 1' }).model;
    expect(x.vagas[0]).toMatchObject({ tipo: 'PCD', larguraMm: 3700, numero: 'PCD 1' });
    x = applyCommand(x, { type: 'MoveVaga', vagaId: x.vagas[0].id, to: point(4000, 4000) }).model;
    expect(x.vagas[0].sugerida).toBeUndefined();
    expect(() => applyCommand(x, { type: 'SetVagaProps', vagaId: x.vagas[0].id, rotacaoGraus: 45.6 })).not.toThrow();
    expect(() => applyCommand(x, { type: 'AddVaga', levelId: 'nao', at: point(0, 0) })).toThrow();
    const y = applyCommand(x, { type: 'AddVaga', levelId: t, at: point(9000, 3000), tipo: 'MOTO', rotacaoGraus: 90 }).model;
    const json = canonicalPayload(y);
    const payload = parseCanonicalPayload(json);
    expect(payload.vagas).toHaveLength(2);
    expect(payload.vagas![0]).toMatchObject({ level: 0, tipo: 'PCD', larguraMm: 3700, numero: 'PCD 1' });
    expect(payload.vagas![0].sugerida).toBeUndefined();
    expect(parseCanonicalPayload(canonicalPayload(m)).vagas).toBeUndefined();
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(json);
    expect(snapshotHash(volta)).toBe(snapshotHash(y));
    // Remover o pavimento leva as vagas.
    const comOutro = applyCommand(y, { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    expect(applyCommand(comOutro, { type: 'RemoveLevel', levelId: t }).model.vagas).toHaveLength(0);
  });
});

describe('vagas automáticas', () => {
  it('garagem 20 × 15: uma fileira de 7 (1 PCD de 3,70 + 1 idoso + 5 comuns), todas dentro do ambiente e fora das paredes; idempotente; aceitar', () => {
    const { m, t } = garagem();
    expect(regiaoDeVagas(m, t, null)?.nome).toBe('Garagem');
    const plano = planejarVagas(m, t);
    expect(plano.motivo).toBeNull();
    expect(plano.vagas).toHaveLength(7);
    expect(plano.vagas.map((v) => v.tipo)).toEqual(['PCD', 'IDOSO', 'COMUM', 'COMUM', 'COMUM', 'COMUM', 'COMUM']);
    expect(plano.vagas[0].larguraMm).toBe(3700);
    expect(plano.vagas.map((v) => v.numero)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    // Todas de pé (giro 0), encostadas na circulação (fileira de cima: centro em y = 200 + 2500), dentro do anel.
    const anel = m.spaces[0].ring;
    for (const v of plano.vagas) {
      expect(v.rotacaoGraus).toBe(0);
      expect(v.at.y).toBe(2700);
      expect(contornoDaVaga(v).every((p) => pointInPolygon(anel, p))).toBe(true);
    }
    expect(plano.resumo).toMatchObject({ total: 7, porTipo: { COMUM: 5, PCD: 1, IDOSO: 1, MOTO: 0 }, pcdMinimo: 1, idosoMinimo: 1, exigencia: null, faltam: null });
    // Aplica: 7 sugeridas. Relançar substitui as 7 (não duplica). Aceitar limpa `sugerida`.
    const x = applyBatch(m, plano.comandos).model;
    expect(x.vagas.filter((v) => v.sugerida)).toHaveLength(7);
    const deNovo = planejarVagas(x, t);
    expect(deNovo.substituidas).toHaveLength(7);
    expect(applyBatch(x, deNovo.comandos).model.vagas).toHaveLength(7);
    const aceitas = applyBatch(x, comandosDeAceite(x, t)).model;
    expect(aceitas.vagas.every((v) => !v.sugerida)).toBe(true);
    // Com as 7 confirmadas, relançar não cabe mais nenhuma (elas são obstáculo) e o resumo conta as 7.
    const depois = planejarVagas(aceitas, t);
    expect(depois.vagas).toHaveLength(0);
    expect(depois.resumo.total).toBe(7);
    expect(applyBatch(x, comandosDeLimpeza(x, t)).model.vagas).toHaveLength(0);
  });

  it('pilar no meio da fileira: a vaga que o toca não nasce e a seguinte se acomoda depois dele; garagem funda ganha fileira, circulação, par de fileiras', () => {
    const { m, t } = garagem();
    const comPilar = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(6000, 2700)], larguraMm: 400, profundidadeMm: 400, alturaMm: 2600, rotulo: 'P1' }).model;
    const plano = planejarVagas(comPilar, t);
    const pegada = [point(5800, 2500), point(6200, 2500), point(6200, 2900), point(5800, 2900)];
    for (const v of plano.vagas) {
      const c = contornoDaVaga(v);
      expect(pegada.some((p) => pointInPolygon(c, p))).toBe(false);
    }
    expect(plano.vagas.length).toBeGreaterThanOrEqual(6);
    // 20 × 25 m sem etiqueta: região = contorno externo (face externa, 20,2 × 25,2 − recuo). Fileiras
    // forçadas em X: fileira + circulação + fileira = 15 m cabe; a 3ª fileira exigiria outra
    // circulação (25 m > 24,8 m) e não nasce — fileira sem acesso não é vaga.
    let g = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Subsolo', elevationMm: -2800, defaultHeightMm: 2600 }).model;
    const t2 = g.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t2, a: point(ax, ay), b: point(bx, by), thicknessMm: 200, heightMm: 2600 });
    g = applyBatch(g, [w(0, 0, 20000, 0), w(20000, 0, 20000, 25000), w(20000, 25000, 0, 25000), w(0, 25000, 0, 0)]).model;
    const fundo = planejarVagas(g, t2, { ...HIPOTESES_VAGAS_PADRAO, pcdPct: 0, idosoPct: 0, orientacao: 'FILEIRAS_EM_X' });
    expect(fundo.regiao?.nome).toBe('Contorno de Subsolo');
    const ys = [...new Set(fundo.vagas.map((v) => v.at.y))].sort((a, b) => a - b);
    expect(ys).toHaveLength(2);
    expect(fundo.vagas).toHaveLength(14); // 7 por fileira, 2 fileiras
    expect(fundo.resumo.porTipo.COMUM).toBe(14);
    // Com 30 m de fundo cabem 3 fileiras (5 + 5 + 5 + 5 + 5 = 25 ≤ 29,8).
    let g3 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Subsolo', elevationMm: -2800, defaultHeightMm: 2600 }).model;
    const t3 = g3.levels[0].id;
    const w3 = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t3, a: point(ax, ay), b: point(bx, by), thicknessMm: 200, heightMm: 2600 });
    g3 = applyBatch(g3, [w3(0, 0, 20000, 0), w3(20000, 0, 20000, 30000), w3(20000, 30000, 0, 30000), w3(0, 30000, 0, 0)]).model;
    const tres = planejarVagas(g3, t3, { ...HIPOTESES_VAGAS_PADRAO, pcdPct: 0, idosoPct: 0, orientacao: 'FILEIRAS_EM_X' });
    expect([...new Set(tres.vagas.map((v) => v.at.y))]).toHaveLength(3);
    expect(tres.vagas).toHaveLength(21);
  });

  it('exigência: manual ou vagas por unidade; região estreita explica', () => {
    const { m, t } = garagem();
    expect(exigenciaDeVagas(m, HIPOTESES_VAGAS_PADRAO)).toBeNull();
    const comUnidades = applyBatch(m, [{ type: 'AddUnidade', numero: '101' }, { type: 'AddUnidade', numero: '102' }, { type: 'AddUnidade', numero: '103' }]).model;
    expect(exigenciaDeVagas(comUnidades, { ...HIPOTESES_VAGAS_PADRAO, vagasPorUnidade: 1.5 })).toBe(5);
    expect(exigenciaDeVagas(comUnidades, { ...HIPOTESES_VAGAS_PADRAO, exigenciaManual: 12 })).toBe(12);
    const plano = planejarVagas(comUnidades, t, { ...HIPOTESES_VAGAS_PADRAO, exigenciaManual: 12 });
    expect(plano.resumo).toMatchObject({ total: 7, exigencia: 12, faltam: 5 });
    const estreita = planejarVagas(m, t, { ...HIPOTESES_VAGAS_PADRAO, circulacaoMm: 12000 });
    expect(estreita.vagas).toHaveLength(0);
    expect(estreita.motivo).toMatch(/não cabe uma fileira/);
  });
});
