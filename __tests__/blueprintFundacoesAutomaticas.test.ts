/**
 * LANÇAMENTO AUTOMÁTICO DE FUNDAÇÕES (16/09/2026) — ver
 * `utils/blueprintFundacoesAutomaticas.ts`.
 *
 * O que se prova: um bloco por pilar, centrado e girado com ele, com o lado
 * pelo Ø da estaca ou pelo pilar; uma ou duas estacas por bloco, a 3Ø; cotas
 * de arrasamento; pilar já com bloco é respeitado; ids previstos batem
 * (blocos, depois estacas); lote atômico; relançar apaga só a fundação; os
 * ambientes não mudam.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, snapshotHash, type BlueprintModel, type Command, type ObjectId } from '../utils/blueprintKernel';
import { HIPOTESES_PILARES_PADRAO, planejarPilares } from '../utils/blueprintPilaresAutomaticos';
import {
  HIPOTESES_FUNDACOES_PADRAO,
  comprimentoDoBlocoDeDuas,
  conferirPlanoDeFundacoes,
  ladoDoBloco,
  planejarFundacoes,
  relancarFundacoes,
  type HipotesesDeFundacoes,
} from '../utils/blueprintFundacoesAutomaticas';

function parede(levelId: ObjectId, x1: number, y1: number, x2: number, y2: number, thicknessMm = 150): Command {
  return { type: 'AddWall', levelId, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, thicknessMm, heightMm: 2800 };
}

/** Casa 6×4 com interna; pilares lançados pelo planejador (9) — mais um manual girado a 90° fora da casa. */
function casa(opts: { pilares?: boolean; girado?: boolean } = {}) {
  const { pilares = true, girado = false } = opts;
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  let m = applyBatch(nivel.model, [
    parede(t, 0, 0, 6000, 0),
    parede(t, 6000, 0, 6000, 4000),
    parede(t, 6000, 4000, 0, 4000),
    parede(t, 0, 4000, 0, 0),
    parede(t, 0, 2000, 6000, 2000),
  ]).model;
  if (pilares) m = applyBatch(m, planejarPilares(m, t, HIPOTESES_PILARES_PADRAO).comandos).model;
  if (girado) {
    m = applyCommand(m, {
      type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 10000, y: 10000 }],
      larguraMm: 400, profundidadeMm: 190, alturaMm: 2800, rotacaoDeg: 90, rotulo: 'P50',
    }).model;
  }
  return { m, t };
}

const fundar = (m: BlueprintModel, t: ObjectId, hip: Partial<HipotesesDeFundacoes> = {}) =>
  planejarFundacoes(m, t, { ...HIPOTESES_FUNDACOES_PADRAO, ...hip });

describe('planejarFundacoes — um bloco por pilar, estacas embaixo', () => {
  it('nove pilares, nove blocos 60×60×60 (topo a −0,50 m) e nove estacas Ø30 de 8 m a partir da base do bloco', () => {
    const { m, t } = casa();
    const plano = fundar(m, t);
    expect(plano.motivo).toBeNull();
    expect(plano.blocos).toHaveLength(9);
    expect(plano.estacas).toHaveLength(9);
    for (const b of plano.blocos) {
      // Ø30 + 30 = 60 > 19 + 20 = 39 → 60 × 60.
      expect([b.larguraMm, b.profundidadeMm, b.alturaMm, b.baseMm]).toEqual([600, 600, 600, -1100]);
      expect(b.estacas).toHaveLength(1);
      expect(b.estacas[0].at).toEqual(b.at);
      expect([b.estacas[0].diametroMm, b.estacas[0].comprimentoMm, b.estacas[0].baseMm]).toEqual([300, 8000, -9100]);
    }
    expect(plano.blocos.map((b) => b.rotulo)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9']);
    expect(plano.estacas.map((e) => e.rotulo)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9']);
    // O bloco vai centrado no pilar e leva o rótulo dele.
    const p1 = m.structures.find((s) => s.rotulo === 'P1')!;
    const b1 = plano.blocos.find((b) => b.pilarId === p1.id)!;
    expect([b1.at, b1.pilarRotulo, b1.rotacaoDeg]).toEqual([p1.pontos[0], 'P1', p1.rotacaoDeg]);
  });

  it('lado do bloco: o maior entre Ø + 30 e pilar + 20, a cada 5 cm; bloco de duas estacas tem 4Ø + 30 de comprimento', () => {
    expect(ladoDoBloco(300, 190)).toBe(600);
    expect(ladoDoBloco(300, 400)).toBe(600);
    expect(ladoDoBloco(400, 190)).toBe(700);
    expect(ladoDoBloco(250, 500)).toBe(700);
    expect(ladoDoBloco(300, 420)).toBe(650); // 620 → 650
    expect(comprimentoDoBlocoDeDuas(300)).toBe(1500);
    expect(comprimentoDoBlocoDeDuas(400)).toBe(1900);
  });

  it('duas estacas: bloco 150 × 60 ao longo do eixo do pilar, estacas a ±45 cm — pilar a 90° alonga em y', () => {
    const { m, t } = casa({ pilares: false, girado: true });
    const plano = fundar(m, t, { estacasPorBloco: 2 });
    expect(plano.blocos).toHaveLength(1);
    const b = plano.blocos[0];
    // Pilar 40 × 19 girado 90°: lado do bloco = max(60, 40 + 20 = 60) = 60; comprimento 150.
    expect([b.larguraMm, b.profundidadeMm, b.rotacaoDeg]).toEqual([1500, 600, 90]);
    expect(b.estacas.map((e) => e.at)).toEqual([{ x: 10000, y: 9550 }, { x: 10000, y: 10450 }]);
    expect(plano.estacas.map((e) => e.rotulo)).toEqual(['E1', 'E2']);
  });

  it('as hipóteses mandam nas cotas: Ø40, 10 m, bloco 80, arrasamento 80 cm', () => {
    const { m, t } = casa();
    const plano = fundar(m, t, { diametroDaEstacaMm: 400, comprimentoDaEstacaMm: 10000, alturaDoBlocoMm: 800, arrasamentoMm: 800 });
    const b = plano.blocos[0];
    expect([b.larguraMm, b.alturaMm, b.baseMm]).toEqual([700, 800, -1600]);
    expect([b.estacas[0].diametroMm, b.estacas[0].comprimentoMm, b.estacas[0].baseMm]).toEqual([400, 10000, -11600]);
  });

  it('pilar já com bloco é respeitado; depois de lançar, replanejar não cria nada; sem pilar, pede os pilares', () => {
    const { m, t } = casa();
    const plano = fundar(m, t);
    const depois = applyBatch(m, plano.comandos).model;
    expect(fundar(depois, t)).toMatchObject({ blocos: [], estacas: [], comandos: [], motivo: 'todos os pilares já têm bloco', pilaresComBloco: 9 });
    const semPilar = casa({ pilares: false });
    expect(fundar(semPilar.m, semPilar.t)).toMatchObject({ motivo: 'lance os pilares antes', comandos: [] });
  });

  it('rótulos continuam do maior B<n> / E<n> do modelo', () => {
    const { m, t } = casa();
    const comB4 = applyBatch(m, [
      { type: 'AddStructural', levelId: t, kind: 'BLOCO_COROAMENTO', pontos: [{ x: 20000, y: 0 }], larguraMm: 800, profundidadeMm: 800, alturaMm: 600, baseMm: -1100, rotulo: 'B4' },
      { type: 'AddStructural', levelId: t, kind: 'ESTACA', pontos: [{ x: 20000, y: 0 }], larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100, circular: true, rotulo: 'E12' },
    ]).model;
    const plano = fundar(comB4, t);
    expect(plano.blocos[0].rotulo).toBe('B5');
    expect(plano.estacas[0].rotulo).toBe('E13');
  });

  it('o lote: blocos antes das estacas, ids previstos batem, prova ok; atômico', () => {
    const { m, t } = casa();
    const plano = fundar(m, t);
    const tipos = plano.comandos.map((c) => (c.type === 'AddStructural' ? c.kind : c.type));
    expect(tipos.slice(0, 9).every((k) => k === 'BLOCO_COROAMENTO')).toBe(true);
    expect(tipos.slice(9).every((k) => k === 'ESTACA')).toBe(true);
    const r = applyBatch(m, plano.comandos);
    expect(r.diff.created.filter((id) => id.startsWith('str_'))).toEqual([
      ...plano.blocos.map((b) => b.idPrevisto),
      ...plano.estacas.map((e) => e.idPrevisto),
    ]);
    expect(conferirPlanoDeFundacoes(m, plano)).toEqual({ ok: true });
    const e1 = r.model.structures.find((s) => s.rotulo === 'E1')!;
    expect(e1).toMatchObject({ kind: 'ESTACA', circular: true, larguraMm: 300, alturaMm: 8000, baseMm: -9100 });
    const antes = snapshotHash(m);
    expect(() => applyBatch(m, [...plano.comandos, { type: 'DeleteStructural', structuralId: 'str_nope' }])).toThrow();
    expect(snapshotHash(m)).toBe(antes);
  });

  it('relançar apaga só blocos e estacas (pilares ficam) e regrava com a hipótese nova; ambientes não mudam', () => {
    const { m, t } = casa();
    const depois = applyBatch(m, fundar(m, t).comandos).model;
    const re = relancarFundacoes(depois, t, { ...HIPOTESES_FUNDACOES_PADRAO, estacasPorBloco: 2 });
    expect(re.apagados).toHaveLength(18);
    const final = applyBatch(depois, re.comandos).model;
    expect(final.structures.filter((s) => s.kind === 'PILAR')).toHaveLength(9);
    expect(final.structures.filter((s) => s.kind === 'BLOCO_COROAMENTO')).toHaveLength(9);
    expect(final.structures.filter((s) => s.kind === 'ESTACA')).toHaveLength(18);
    expect(conferirPlanoDeFundacoes(depois, re)).toEqual({ ok: true });
    expect(final.spaces.map((s) => s.areaMm2).sort()).toEqual(m.spaces.map((s) => s.areaMm2).sort());
  });

  it('pavimento que não é o mais baixo: aviso; determinístico', () => {
    const { m, t } = casa();
    const comSuperior = applyCommand(m, { type: 'AddLevel', name: 'Subsolo', elevationMm: -2800, defaultHeightMm: 2800 }).model;
    expect(fundar(comSuperior, t).avisos).toContain('fundação sob pavimento que não é o mais baixo');
    expect(fundar(m, t).avisos).toEqual([]);
    expect(JSON.stringify(fundar(m, t))).toBe(JSON.stringify(fundar(m, t)));
  });
});
