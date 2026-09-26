/**
 * ETAPAS DE OBRA — fases personalizadas (21/09/2026, backlog P2, kernel 0.57.0):
 * comandos e invariantes; canônico só quando há etapa (índices, ida e volta);
 * status derivado por etapa em vista; quadro por etapa; DeleteEtapa solta as
 * peças.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, computeQuantities, emptyModel, KERNEL_VERSION, modelFromCanonicalPayload, parseCanonicalPayload, point, POLITICA_PADRAO, type Command } from '../utils/blueprintKernel';
import { etapasOrdenadas, pecasSemEtapa, quadroDeEtapas, statusNaEtapa, vistaDaEtapa } from '../utils/blueprintEtapas';

function casa() {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(nivel.model, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0), w(3000, 0, 3000, 4000)]).model;
  m = applyCommand(m, { type: 'AddOpening', wallId: m.walls[0].id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command).model;
  return { m, t };
}

describe('etapas de obra', () => {
  it('Add/Set/Delete, invariantes e canônico só quando há etapa (índices, ida e volta)', () => {
    const { m } = casa();
    // Sem etapa: payload sem a chave.
    expect(parseCanonicalPayload(canonicalPayload(m)).etapas).toBeUndefined();
    let m1 = applyBatch(m, [
      { type: 'AddEtapa', nome: 'Existente' },
      { type: 'AddEtapa', nome: 'Fase 1' },
      { type: 'AddEtapa', nome: 'Fase 2' },
    ]).model;
    expect(etapasOrdenadas(m1).map((e) => [e.nome, e.ordem])).toEqual([['Existente', 1], ['Fase 1', 2], ['Fase 2', 3]]);
    const [ex, f1, f2] = etapasOrdenadas(m1);
    expect(() => applyCommand(m1, { type: 'AddEtapa', nome: '   ' })).toThrow(/BAD_STAGE|Nome de etapa inválido/);
    expect(() => applyCommand(m1, { type: 'SetEtapaProps', etapaId: f1.id, ordem: 1.5 })).toThrow(/inteira/);
    m1 = applyCommand(m1, { type: 'SetEtapaProps', etapaId: f2.id, nome: 'Fase 2 — acabamentos' }).model;
    // Peças: 4 externas existentes; a interna nasce em Fase 1 e sai em Fase 2; a porta nasce em Fase 2.
    const externas = m1.walls.slice(0, 4).map((x) => x.id);
    const interna = m1.walls[4].id;
    const porta = m1.openings[0].id;
    m1 = applyBatch(m1, [
      { type: 'SetEtapaDasPecas', ids: externas, etapaId: ex.id },
      { type: 'SetEtapaDasPecas', ids: [interna], etapaId: f1.id, demolidaEmEtapaId: f2.id },
      { type: 'SetEtapaDasPecas', ids: [porta], etapaId: f2.id },
    ]).model;
    expect(() => applyCommand(m1, { type: 'SetEtapaDasPecas', ids: [interna], etapaId: f2.id, demolidaEmEtapaId: f1.id })).toThrow(/depois da etapa/);
    expect(() => applyCommand(m1, { type: 'SetEtapaDasPecas', ids: ['w_9999'], etapaId: ex.id })).toThrow(/não existe/);
    expect(() => applyCommand(m1, { type: 'SetEtapaDasPecas', ids: [interna], etapaId: 'etp_9999' })).toThrow(/Etapa inexistente/);
    // Canônico: etapas por ordem, peças com índices; ida e volta preserva.
    const payload = parseCanonicalPayload(canonicalPayload(m1));
    expect(payload.etapas).toEqual([{ nome: 'Existente', ordem: 1 }, { nome: 'Fase 1', ordem: 2 }, { nome: 'Fase 2 — acabamentos', ordem: 3 }]);
    expect(payload.walls.filter((x) => x.etapa === 0)).toHaveLength(4);
    expect(payload.walls.find((x) => x.etapa === 1)?.demolidaEm).toBe(2);
    expect(payload.openings[0].etapa).toBe(2);
    const volta = modelFromCanonicalPayload(JSON.parse(JSON.stringify(payload)));
    expect(volta.etapas.map((e) => e.nome)).toEqual(['Existente', 'Fase 1', 'Fase 2 — acabamentos']);
    const internaVolta = volta.walls.find((x) => x.etapaId && x.demolidaEmEtapaId)!;
    expect(volta.etapas.find((e) => e.id === internaVolta.etapaId)?.nome).toBe('Fase 1');
    expect(volta.etapas.find((e) => e.id === internaVolta.demolidaEmEtapaId)?.nome).toBe('Fase 2 — acabamentos');
    expect(volta.openings[0].etapaId).toBe(volta.etapas[2].id);
    // Apagar a Fase 2 solta a demolição da interna e o nascimento da porta.
    const m2 = applyCommand(m1, { type: 'DeleteEtapa', etapaId: f2.id }).model;
    expect(m2.etapas).toHaveLength(2);
    expect(m2.walls[4].demolidaEmEtapaId).toBeUndefined();
    expect(m2.openings[0].etapaId).toBeUndefined();
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.60.0');
  });

  it('status derivado por etapa em vista; quadro por etapa; peças sem etapa', () => {
    const { m } = casa();
    let m1 = applyBatch(m, [{ type: 'AddEtapa', nome: 'Existente' }, { type: 'AddEtapa', nome: 'Fase 1' }, { type: 'AddEtapa', nome: 'Fase 2' }]).model;
    const [ex, f1, f2] = etapasOrdenadas(m1);
    const externas = m1.walls.slice(0, 4).map((x) => x.id);
    const interna = m1.walls[4].id;
    const porta = m1.openings[0].id;
    expect(pecasSemEtapa(m1)).toBe(6);
    m1 = applyBatch(m1, [
      { type: 'SetEtapaDasPecas', ids: externas, etapaId: ex.id },
      { type: 'SetEtapaDasPecas', ids: [interna], etapaId: f1.id, demolidaEmEtapaId: f2.id },
      { type: 'SetEtapaDasPecas', ids: [porta], etapaId: f2.id },
    ]).model;
    expect(pecasSemEtapa(m1)).toBe(0);
    // Em vista: Existente → externas novas, interna e porta não aparecem.
    const vEx = vistaDaEtapa(m1, ex.id)!;
    expect(vEx.contagem).toEqual({ EXISTENTE: 0, DEMOLIR: 0, NOVO: 4 });
    expect([...vEx.ocultos].sort()).toEqual([interna, porta].sort());
    // Fase 1 → externas existentes (cinza), interna nova, porta ainda não.
    const v1 = vistaDaEtapa(m1, f1.id)!;
    expect(v1.contagem).toEqual({ EXISTENTE: 4, DEMOLIR: 0, NOVO: 1 });
    expect(v1.fases.get(externas[0])).toBe('EXISTENTE');
    expect(v1.fases.has(interna)).toBe(false);
    expect(v1.ocultos.has(porta)).toBe(true);
    // Fase 2 → interna a demolir, porta nova, externas existentes.
    const v2 = vistaDaEtapa(m1, f2.id)!;
    expect(v2.contagem).toEqual({ EXISTENTE: 4, DEMOLIR: 1, NOVO: 1 });
    expect(v2.fases.get(interna)).toBe('DEMOLIR');
    expect(v2.ocultos.size).toBe(0);
    // Sem etapa a peça segue o status `fase`.
    const ordem = new Map(m1.etapas.map((e) => [e.id, e.ordem]));
    expect(statusNaEtapa({ etapaId: null, demolidaEmEtapaId: null, fase: 'DEMOLIR' }, 2, ordem)).toBe('DEMOLIR');
    expect(vistaDaEtapa(m1, 'etp_9999')).toBeNull();
    // Quadro: o que nasce e o que sai em cada etapa, com metros de parede.
    const q = quadroDeEtapas(m1, computeQuantities(m1, POLITICA_PADRAO, KERNEL_VERSION));
    expect(q.map((l) => [l.etapa.nome, l.nascem.paredes, l.nascem.comprimentoParedeM, l.saem.paredes, l.nascem.aberturas])).toEqual([
      ['Existente', 4, 20, 0, 0],
      ['Fase 1', 1, 4, 0, 0],
      ['Fase 2', 0, 0, 1, 1],
    ]);
    expect(q[2].saem.comprimentoParedeM).toBe(4);
  });
});
