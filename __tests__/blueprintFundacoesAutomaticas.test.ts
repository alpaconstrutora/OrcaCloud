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
import { sobreposicoesDoModelo } from '../utils/blueprintKernel/sobreposicao';
import { HIPOTESES_PILARES_PADRAO, planejarPilares } from '../utils/blueprintPilaresAutomaticos';
import {
  HIPOTESES_FUNDACOES_PADRAO,
  conferirPlanoDeFundacoes,
  ladoDoBloco,
  planejarFundacoes,
  relancarFundacoes,
  type HipotesesDeFundacoes,
} from '../utils/blueprintFundacoesAutomaticas';
import { arranjoDeEstacas, dimensoesDoBloco } from '../utils/blueprintGrupoDeFundacao';

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
    // O bloco de duas estacas (4Ø + 30) sai do arranjo — ver blueprintGrupoDeFundacao.
    expect(dimensoesDoBloco(arranjoDeEstacas(2, 300).offsets, 300, null).larguraMm).toBe(1500);
    expect(dimensoesDoBloco(arranjoDeEstacas(2, 400).offsets, 400, null).larguraMm).toBe(1900);
  });

  it('TRÊS estacas por bloco (16/09/2026): triângulo com centro de carga no pilar, 3Ø entre eixos, bloco envolvente 150 × 140', () => {
    const { m, t } = casa();
    const plano = fundar(m, t, { estacasPorBloco: 3 });
    expect(plano.estacas).toHaveLength(27);
    for (const b of plano.blocos) {
      expect(b.estacas).toHaveLength(3);
      expect(b).toMatchObject({ larguraMm: 1500, profundidadeMm: 1400 });
      const cx = b.estacas.reduce((s, e) => s + e.at.x, 0) / 3;
      const cy = b.estacas.reduce((s, e) => s + e.at.y, 0) / 3;
      expect(Math.abs(cx - b.at.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(cy - b.at.y)).toBeLessThanOrEqual(1);
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        expect(Math.hypot(b.estacas[i].at.x - b.estacas[j].at.x, b.estacas[i].at.y - b.estacas[j].at.y)).toBeGreaterThanOrEqual(898);
      }
    }
    expect(conferirPlanoDeFundacoes(m, plano)).toEqual({ ok: true });
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
    expect(tipos.slice(9, 18).every((k) => k === 'ESTACA')).toBe(true);
    // Depois as baldrames (5 cadeias: 4 externas + a interna), cada uma marcada para ceder.
    expect(tipos.slice(18, 23)).toEqual(Array(5).fill('VIGA_FUNDACAO'));
    expect(tipos.slice(23, 28)).toEqual(Array(5).fill('SetCedeSobreposicao'));
    // Depois, os pilares DESCEM até o topo do bloco (−0,50): um SetStructuralProps por pilar.
    expect(tipos.slice(28)).toEqual(Array(9).fill('SetStructuralProps'));
    expect(plano.pilaresQueDescem).toHaveLength(9);
    const r = applyBatch(m, plano.comandos);
    const pilares = r.model.structures.filter((s) => s.kind === 'PILAR');
    expect(pilares.every((p) => p.baseMm === -500 && p.baseMm + p.alturaMm === 2800)).toBe(true);
    // Continua cruzando o piso: os ambientes não mudam.
    expect(r.model.spaces.map((s) => s.areaMm2).sort()).toEqual(m.spaces.map((s) => s.areaMm2).sort());
    // Segunda rodada: nada a fazer — nem pilar para descer.
    expect(planejarFundacoes(r.model, t).pilaresQueDescem).toEqual([]);
    expect(r.diff.created.filter((id) => id.startsWith('str_'))).toEqual([
      ...plano.blocos.map((b) => b.idPrevisto),
      ...plano.estacas.map((e) => e.idPrevisto),
      ...plano.baldrames.map((v) => v.idPrevisto),
    ]);
    expect(conferirPlanoDeFundacoes(m, plano)).toEqual({ ok: true });
    const e1 = r.model.structures.find((s) => s.rotulo === 'E1')!;
    expect(e1).toMatchObject({ kind: 'ESTACA', circular: true, larguraMm: 300, alturaMm: 8000, baseMm: -9100 });
    const antes = snapshotHash(m);
    expect(() => applyBatch(m, [...plano.comandos, { type: 'DeleteStructural', structuralId: 'str_nope' }])).toThrow();
    expect(snapshotHash(m)).toBe(antes);
  });

  it('relançar apaga só blocos, estacas e baldrames (pilares ficam) e regrava com a hipótese nova; ambientes não mudam', () => {
    const { m, t } = casa();
    const depois = applyBatch(m, fundar(m, t).comandos).model;
    const re = relancarFundacoes(depois, t, { ...HIPOTESES_FUNDACOES_PADRAO, estacasPorBloco: 2 });
    expect(re.apagados).toHaveLength(23);
    const final = applyBatch(depois, re.comandos).model;
    expect(final.structures.filter((s) => s.kind === 'PILAR')).toHaveLength(9);
    expect(final.structures.filter((s) => s.kind === 'BLOCO_COROAMENTO')).toHaveLength(9);
    expect(final.structures.filter((s) => s.kind === 'ESTACA')).toHaveLength(18);
    expect(final.structures.filter((s) => s.kind === 'VIGA_FUNDACAO')).toHaveLength(5);
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

/**
 * VIGA BALDRAME (16/09/2026): *"faltou a viga baldrame"*. Uma por cadeia de
 * paredes, apoiada no topo dos blocos e subindo até o piso, de face a face de
 * pilar, cedendo ao pilar intermediário. Não cruza o piso: parede não cede.
 */
describe('planejarFundacoes — a viga baldrame', () => {
  it('uma por cadeia (5 na casa), 15 × 50 do topo do bloco (−0,50) ao piso (0), recuada até a face dos pilares', () => {
    const { m, t } = casa();
    const plano = fundar(m, t);
    expect(plano.baldrames).toHaveLength(5);
    for (const v of plano.baldrames) {
      expect(v).toMatchObject({ larguraMm: 150, alturaMm: 500, baseMm: -500 });
      expect(v.rotulo).toMatch(/^VB\d+$/);
    }
    // A externa de baixo (0,0 → 6000,0): pilares 19 × 19 de canto empurrados para dentro ocupam
    // [−75, 115] em x; a baldrame começa na face interna do pilar e termina na do outro.
    const baixo = plano.baldrames.find((v) => v.a.y === 0 && v.b.y === 0)!;
    expect(Math.min(baixo.a.x, baixo.b.x)).toBeGreaterThan(0);
    expect(Math.max(baixo.a.x, baixo.b.x)).toBeLessThan(6000);
    expect(baixo.comprimentoMm).toBeLessThan(6000);
    // A interna (0,2000 → 6000,2000) também.
    expect(plano.baldrames.filter((v) => v.a.y === 2000 && v.b.y === 2000)).toHaveLength(1);
  });

  it('não cruza o piso: nenhuma parede cede e a sobreposição parede × baldrame é zero; a baldrame nasce cedendo', () => {
    const { m, t } = casa();
    const plano = fundar(m, t);
    expect(plano.comandos.some((c) => c.type === 'SetCedeSobreposicao' && c.id.startsWith('wal_'))).toBe(false);
    const r = applyBatch(m, plano.comandos).model;
    const baldrames = r.structures.filter((s) => s.kind === 'VIGA_FUNDACAO');
    expect(baldrames.every((v) => v.cedeSobreposicao === true)).toBe(true);
    const ids = new Set(baldrames.map((v) => v.id));
    const comParede = sobreposicoesDoModelo(r).filter((s) => (ids.has(s.bId) && s.aId.startsWith('wal_')) || (ids.has(s.aId) && s.bId.startsWith('wal_')));
    expect(comParede).toEqual([]);
    // Ambientes intactos.
    expect(r.spaces.map((s) => s.areaMm2).sort()).toEqual(m.spaces.map((s) => s.areaMm2).sort());
  });

  it('NO NÍVEL DO BLOCO: a casa assenta na face superior da viga — topo da baldrame e do bloco no piso, arrasamento ignorado; vai até o eixo (entra no bloco) e cede', () => {
    const { m, t } = casa();
    const plano = fundar(m, t, { posicaoDaBaldrame: 'NO_NIVEL_DO_BLOCO', alturaDaBaldrameMm: 400 });
    expect(plano.baldrames).toHaveLength(5);
    for (const v of plano.baldrames) expect(v).toMatchObject({ larguraMm: 150, alturaMm: 400, baseMm: -400 });
    // Bloco com o topo no piso (base = −h do bloco), estaca a partir da base dele; pilar fica no piso.
    for (const b of plano.blocos) expect(b).toMatchObject({ baseMm: -600, alturaMm: 600 });
    expect(plano.estacas.every((e) => e.baseMm === -600 - 8000)).toBe(true);
    expect(plano.pilaresQueDescem).toEqual([]);
    // Sem recuo: a de baixo vai de (0,0) a (6000,0), morrendo dentro dos blocos de canto.
    const baixo = plano.baldrames.find((v) => v.a.y === 0 && v.b.y === 0)!;
    expect([Math.min(baixo.a.x, baixo.b.x), Math.max(baixo.a.x, baixo.b.x)]).toEqual([0, 6000]);
    const r = applyBatch(m, plano.comandos).model;
    const ids = new Set(plano.baldrames.map((b) => b.idPrevisto));
    const blocos = new Set(r.structures.filter((s) => s.kind === 'BLOCO_COROAMENTO').map((s) => s.id));
    const pilares = new Set(r.structures.filter((s) => s.kind === 'PILAR').map((s) => s.id));
    const sob = sobreposicoesDoModelo(r).filter((s) => ids.has(s.aId) || ids.has(s.bId));
    // Divide volume com os blocos (e cede), não com os pilares (que começam acima) nem com as paredes.
    expect(sob.some((s) => blocos.has(s.aId) || blocos.has(s.bId))).toBe(true);
    expect(sob.some((s) => pilares.has(s.aId) || pilares.has(s.bId))).toBe(false);
    expect(sob.some((s) => s.aId.startsWith('wal_') || s.bId.startsWith('wal_'))).toBe(false);
    expect(r.structures.filter((s) => ids.has(s.id)).every((v) => v.cedeSobreposicao === true)).toBe(true);
    // Sobre o bloco (padrão): h = arrasamento, base −500, recuada.
    const sobre = fundar(m, t, { posicaoDaBaldrame: 'SOBRE_O_BLOCO', alturaDaBaldrameMm: 400 }).baldrames[0];
    expect(sobre).toMatchObject({ alturaMm: 500, baseMm: -500 });
    // Relançar de "sobre" (pilares desceram a −0,50) para "no nível": os pilares VOLTAM ao piso.
    const comSobre = applyBatch(m, fundar(m, t).comandos).model;
    expect(comSobre.structures.filter((s) => s.kind === 'PILAR').every((p) => p.baseMm === -500)).toBe(true);
    const re = relancarFundacoes(comSobre, t, { ...HIPOTESES_FUNDACOES_PADRAO, posicaoDaBaldrame: 'NO_NIVEL_DO_BLOCO' });
    const final = applyBatch(comSobre, re.comandos).model;
    expect(final.structures.filter((s) => s.kind === 'PILAR').every((p) => p.baseMm === 0 && p.baseMm + p.alturaMm === 2800)).toBe(true);
  });

  it('desligada na hipótese: nenhuma baldrame; cadeia que já tem baldrame é mantida (idempotente)', () => {
    const { m, t } = casa();
    expect(fundar(m, t, { vigaBaldrame: false }).baldrames).toEqual([]);
    const depois = applyBatch(m, fundar(m, t).comandos).model;
    const de_novo = fundar(depois, t);
    expect(de_novo.baldrames).toEqual([]);
    expect(de_novo.cadeiasComBaldrame).toBe(5);
    expect(de_novo.motivo).toBe('todos os pilares já têm bloco');
    // Blocos já lançados, baldrame desligada na hora: ligar depois lança SÓ as baldrames.
    const soBlocos = applyBatch(m, fundar(m, t, { vigaBaldrame: false }).comandos).model;
    const soBaldrames = fundar(soBlocos, t);
    expect(soBaldrames.blocos).toEqual([]);
    expect(soBaldrames.baldrames).toHaveLength(5);
    expect(conferirPlanoDeFundacoes(soBlocos, soBaldrames)).toEqual({ ok: true });
  });
});
