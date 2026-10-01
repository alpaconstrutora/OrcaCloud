/**
 * INCÊNDIO E3.2 (30/09/2026, kernel 0.81.0): a reserva técnica de incêndio —
 * na caixa de água fria compartilhada (`volumeRtiL`) ou numa caixa só de
 * incêndio, que sem bomba é a fonte por GRAVIDADE.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, assertModelInvariants, canonicalPayload, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, payloadDoHash, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP, calculoDeIncendio, rtiDoDesenho } from '../utils/blueprintCalculoIncendio';
import { HIPOTESES_RESERVATORIO_PADRAO, dimensionarReservacao } from '../utils/blueprintReservacao';
import { conferirPlanoDaRede, planejarRedeDeHidrantes } from '../utils/blueprintRedeDeHidrantes';

const caixa = (l: string, disciplina: 'AGUA_FRIA' | 'INCENDIO', extra: Record<string, unknown> = {}): Command =>
  ({ type: 'AddTerminal', levelId: l, disciplina, tipo: 'CX', at: point(0, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO', volumeL: 10000, ...extra }) as Command;

function nivel(): { m: BlueprintModel; l: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, l: m.levels[0].id };
}

describe('E3.2 · RTI no kernel', () => {
  it('volumeRtiL só na caixa de água fria, ≤ volume; omitida do payload quando ausente; ida e volta', () => {
    const { m, l } = nivel();
    const sem = applyCommand(m, caixa(l, 'AGUA_FRIA')).model;
    expect(Object.keys(JSON.parse(payloadDoHash(sem)).terminais[0])).not.toContain('volumeRtiL');
    const com = applyCommand(m, caixa(l, 'AGUA_FRIA', { volumeRtiL: 4000 })).model;
    expect(modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(com))).terminais![0].volumeRtiL).toBe(4000);
    const quebrado = structuredClone(com);
    quebrado.terminais![0].volumeRtiL = 12000;
    expect(() => assertModelInvariants(quebrado)).toThrow(/Reserva de incêndio inválida/);
    // Na caixa SÓ de incêndio a RTI é o volume inteiro — o campo é recusado.
    const inc = applyCommand(m, caixa(l, 'INCENDIO')).model;
    const errado = structuredClone(inc);
    errado.terminais![0].volumeRtiL = 1000;
    expect(() => assertModelInvariants(errado)).toThrow(/não é caixa de água fria/);
  });

  it('a reservação da ÁGUA conta só o volume acima da RTI, e ignora a caixa só de incêndio', () => {
    const { m, l } = nivel();
    const r = (x: BlueprintModel) => dimensionarReservacao(x, { ...HIPOTESES_RESERVATORIO_PADRAO, populacaoDeclarada: 10 }).declaradoL;
    expect(r(applyCommand(m, caixa(l, 'AGUA_FRIA', { volumeRtiL: 4000 })).model)).toBe(6000);
    expect(r(applyBatch(m, [caixa(l, 'AGUA_FRIA'), { ...caixa(l, 'INCENDIO'), at: point(5000, 0) } as Command]).model)).toBe(10000);
  });

  it('a RTI desenhada soma a reserva compartilhada e a caixa de incêndio', () => {
    const { m, l } = nivel();
    const x = applyBatch(m, [caixa(l, 'AGUA_FRIA', { volumeRtiL: 4000 }), { ...caixa(l, 'INCENDIO'), at: point(5000, 0) } as Command]).model;
    expect(rtiDoDesenho(x).disponivelL).toBe(14000);
  });
});

/** 3 andares com a CAIXA DE INCÊNDIO no último (que sobe `alturaExtraMm`); hidrante nos dois de baixo. */
function porGravidade(alturaExtraMm = 0): BlueprintModel {
  let m = emptyModel();
  for (let i = 0; i < 3; i++) m = applyCommand(m, { type: 'AddLevel', name: `P${i}`, elevationMm: i * 2900 + (i === 2 ? alturaExtraMm : 0), defaultHeightMm: 2800 }).model;
  const [p0, p1, p2] = [...m.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const h = (l: string): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'H', at: point(8000, 4000), cotaMm: 1300, tipoHidraulico: 'HIDRANTE_SIMPLES' }) as Command;
  m = applyBatch(m, [caixa(p2.id, 'INCENDIO', { volumeL: 20000 }), h(p0.id), h(p1.id)]).model;
  return applyBatch(m, planejarRedeDeHidrantes(m).comandos).model;
}

describe('E3.2 · fonte por gravidade', () => {
  it('a rede automática DESCE da caixa de incêndio e liga todos', () => {
    let m = emptyModel();
    for (let i = 0; i < 3; i++) m = applyCommand(m, { type: 'AddLevel', name: `P${i}`, elevationMm: i * 2900, defaultHeightMm: 2800 }).model;
    const [p0, , p2] = [...m.levels].sort((a, b) => a.elevationMm - b.elevationMm);
    m = applyBatch(m, [caixa(p2.id, 'INCENDIO'), { type: 'AddTerminal', levelId: p0.id, disciplina: 'INCENDIO', tipo: 'H', at: point(8000, 4000), cotaMm: 1300, tipoHidraulico: 'HIDRANTE_SIMPLES' } as Command]).model;
    const plano = planejarRedeDeHidrantes(m);
    expect(plano.motivo).toBeNull();
    expect(conferirPlanoDaRede(m, plano)).toEqual({ ok: true });
  });

  it('⚠️ a caixa pouco acima dos hidrantes NÃO atende: diz quantos metros faltam, e a RTI é a vazão entregue × autonomia', () => {
    const c = calculoDeIncendio(porGravidade(), HIP);
    expect(c.porGravidade).toBe(true);
    expect(c.cenario!.terminais.some((t) => !t.atende)).toBe(true);
    expect(c.cargaNecessariaM!).toBeGreaterThan(10);
    expect(c.rti.exigidaL!).toBeCloseTo(c.cenario!.vazaoNaFonteLmin * HIP.autonomiaMin, 6);
    expect(c.rti.disponivelL).toBe(20000);
  });

  it('a caixa 60 m acima atende por gravidade (a carga é a cota, não se escolhe)', () => {
    const c = calculoDeIncendio(porGravidade(60000), HIP);
    expect(c.porGravidade).toBe(true);
    expect(c.cenario!.terminais.every((t) => t.atende)).toBe(true);
  });
});
