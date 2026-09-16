/**
 * LANÇAMENTO AUTOMÁTICO DE VIGAS E LAJES (16/09/2026) — ver
 * `utils/blueprintVigasLajesAutomaticas.ts`.
 *
 * O que se prova: uma viga por parede (cadeia colinear) com largura da parede
 * e altura pelo maior vão entre apoios (L/10, mín. 30, passo 5 cm), topo no
 * pé-direito; pilar existente divide o vão; viga já existente na parede é
 * respeitada; uma laje por ambiente fechado com o anel do ambiente, apoiada
 * no pé-direito; ids previstos batem; lote atômico; idempotente; relançar
 * apaga só o próprio tipo.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  snapshotHash,
  type BlueprintModel,
  type Command,
  type ObjectId,
} from '../utils/blueprintKernel';
import { pegadaDaPecaPrevista, planejarPilares, HIPOTESES_PILARES_PADRAO } from '../utils/blueprintPilaresAutomaticos';
import {
  HIPOTESES_LAJES_PADRAO,
  HIPOTESES_VIGAS_PADRAO,
  alturaDaViga,
  conferirPlanoDeLajes,
  conferirPlanoDeVigas,
  planejarLajes,
  planejarVigas,
  relancarLajes,
  relancarVigas,
  type HipotesesDeLajes,
  type HipotesesDeVigas,
} from '../utils/blueprintVigasLajesAutomaticas';

function parede(levelId: ObjectId, x1: number, y1: number, x2: number, y2: number, thicknessMm = 150): Command {
  return { type: 'AddWall', levelId, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, thicknessMm, heightMm: 2800 };
}

/** A casa dos pilares: 6×4 com interna a meia altura; pilar manual P3 em (0,0) e um em (3000,0). */
function casa(opts: { interna?: boolean; pilares?: boolean; peDireito?: number } = {}) {
  const { interna = true, pilares = true, peDireito = 2800 } = opts;
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: peDireito });
  const t = nivel.model.levels[0].id;
  let m = applyBatch(nivel.model, [
    parede(t, 0, 0, 6000, 0),
    parede(t, 6000, 0, 6000, 4000),
    parede(t, 6000, 4000, 0, 4000),
    parede(t, 0, 4000, 0, 0),
    ...(interna ? [parede(t, 0, 2000, 6000, 2000)] : []),
  ]).model;
  const [w1, w2, w3, w4, w5] = m.walls.map((w) => w.id);
  if (pilares) {
    m = applyBatch(m, [
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 0, y: 0 }], larguraMm: 190, profundidadeMm: 190, alturaMm: 2800, rotulo: 'P3' },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 3000, y: 20 }], larguraMm: 190, profundidadeMm: 190, alturaMm: 2800, rotulo: 'P4' },
    ]).model;
  }
  return { m, t, w1, w2, w3, w4, w5 };
}

const vigas = (m: BlueprintModel, t: ObjectId, hip: Partial<HipotesesDeVigas> = {}) =>
  planejarVigas(m, t, { ...HIPOTESES_VIGAS_PADRAO, ...hip });
const lajes = (m: BlueprintModel, t: ObjectId, hip: Partial<HipotesesDeLajes> = {}) =>
  planejarLajes(m, t, { ...HIPOTESES_LAJES_PADRAO, ...hip });
const eixo = (v: { a: { x: number; y: number }; b: { x: number; y: number } }) => `${v.a.x},${v.a.y}→${v.b.x},${v.b.y}`;

describe('planejarVigas — uma viga por parede, de pilar a pilar', () => {
  it('cinco paredes, cinco vigas: eixo da parede, largura 15, topo no pé-direito', () => {
    const { m, t } = casa();
    const plano = vigas(m, t);
    expect(plano.motivo).toBeNull();
    expect(plano.vigas).toHaveLength(5);
    expect(plano.vigas.map(eixo)).toEqual([
      '0,0→6000,0',
      '0,2000→6000,2000',
      '0,4000→0,0',
      '6000,0→6000,4000',
      '6000,4000→0,4000',
    ]);
    expect(plano.vigas.every((v) => v.larguraMm === 150 && v.baseMm === 2800 - v.alturaMm)).toBe(true);
    expect(plano.vigas.map((v) => v.rotulo)).toEqual(['V1', 'V2', 'V3', 'V4', 'V5']);
  });

  it('altura pelo maior vão entre apoios: pilar existente no meio de w1 baixa a viga para o mínimo; w3 sem apoio no meio dá 6 m ÷ 10 = 60', () => {
    const { m, t } = casa();
    const plano = vigas(m, t);
    const w1 = plano.vigas.find((v) => v.a.y === 0 && v.b.y === 0)!;
    const w3 = plano.vigas.find((v) => v.a.y === 4000 && v.b.y === 4000)!;
    // w1: apoios em 0 (canto), 3000 (P4 existente) e 6000 → maior vão 3 m → 300 (mínimo).
    expect([w1.maiorVaoMm, w1.alturaMm, w1.apoios]).toEqual([3000, 300, 3]);
    // w3: só os cantos → 6 m → 600.
    expect([w3.maiorVaoMm, w3.alturaMm, w3.apoios]).toEqual([6000, 600, 2]);
    // w4 (vertical, 4 m) tem o T em (0,2000): 2 m → mínimo 300.
    const w4 = plano.vigas.find((v) => v.a.x === 0 && v.b.x === 0)!;
    expect([w4.maiorVaoMm, w4.alturaMm]).toEqual([2000, 300]);
    // Divisor 12: 6 m → 500. Mínimo 400: onde L/10 < 400, fica 400.
    expect(vigas(m, t, { divisorDaAltura: 12 }).vigas.find((v) => v.a.y === 4000 && v.b.y === 4000)!.alturaMm).toBe(500);
    expect(vigas(m, t, { alturaMinimaMm: 400 }).vigas.find((v) => v.a.y === 0 && v.b.y === 0)!.alturaMm).toBe(400);
    // O arredondamento é para cima, a 5 cm: 4,3 m ÷ 10 = 43 → 45.
    expect(alturaDaViga(4300, HIPOTESES_VIGAS_PADRAO)).toBe(450);
  });

  it('emenda em linha reta vira UMA viga de 6 m', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = applyBatch(nivel.model, [
      parede(t, 0, 0, 3000, 0),
      parede(t, 3000, 0, 6000, 0),
      parede(t, 6000, 0, 6000, 4000),
      parede(t, 6000, 4000, 0, 4000),
      parede(t, 0, 4000, 0, 0),
    ]).model;
    const plano = vigas(m, t);
    expect(plano.vigas).toHaveLength(4);
    const emendada = plano.vigas.find((v) => v.a.y === 0 && v.b.y === 0)!;
    expect([eixo(emendada), emendada.comprimentoMm, emendada.wallIds.length, emendada.alturaMm]).toEqual(['0,0→6000,0', 6000, 2, 600]);
  });

  it('parede que já tem viga colinear é respeitada; viga só na extensão não conta', () => {
    const { m, t } = casa();
    const comViga = applyCommand(m, {
      type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [{ x: 1000, y: 0 }, { x: 5000, y: 0 }], larguraMm: 150, alturaMm: 400, baseMm: 2400,
    }).model;
    const plano = vigas(comViga, t);
    expect(plano.cadeiasComViga).toBe(1);
    expect(plano.vigas.find((v) => v.a.y === 0 && v.b.y === 0)).toBeUndefined();
    expect(plano.vigas).toHaveLength(4);
    // Rótulo continua do maior V<n>: a existente não tem rótulo → V1…
    const comV7 = applyCommand(m, {
      type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [{ x: 7000, y: 0 }, { x: 9000, y: 0 }], larguraMm: 150, alturaMm: 400, baseMm: 2400, rotulo: 'V7',
    }).model;
    expect(vigas(comV7, t).vigas[0].rotulo).toBe('V8');
    expect(vigas(comV7, t).cadeiasComViga).toBe(0); // fora do segmento: não conta como viga da cadeia
  });

  it('só externas: quatro vigas, sem a interna', () => {
    const { m, t } = casa();
    expect(vigas(m, t, { incluirInternas: false }).vigas.map(eixo)).not.toContain('0,2000→6000,2000');
    expect(vigas(m, t, { incluirInternas: false }).vigas).toHaveLength(4);
  });

  it('largura mínima de 12 cm e aviso quando a viga é mais larga que a parede', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = applyBatch(nivel.model, [parede(t, 0, 0, 4000, 0, 70), parede(t, 4000, 0, 4000, 3000, 70)]).model;
    const plano = vigas(m, t);
    expect(plano.vigas[0].larguraMm).toBe(120);
    expect(plano.vigas[0].aviso).toMatch(/50 mm mais larga que a parede de 70 mm/);
    // 2 cm por lado (15 numa parede de 12) não avisa.
    const m2 = applyBatch(nivel.model, [parede(t, 0, 0, 4000, 0, 120), parede(t, 4000, 0, 4000, 3000, 150)]).model;
    expect(vigas(m2, t).vigas.every((v) => v.aviso == null)).toBe(true);
  });

  it('o lote: ids previstos batem, AddStructural antes, paredes cedem uma vez, prova ok; atômico', () => {
    const { m, t } = casa();
    const plano = vigas(m, t);
    const tipos = plano.comandos.map((c) => c.type);
    expect(tipos.lastIndexOf('AddStructural')).toBeLessThan(tipos.indexOf('SetCedeSobreposicao'));
    expect(plano.paredesQueCedem).toHaveLength(5);
    const r = applyBatch(m, plano.comandos);
    expect(r.diff.created.filter((id) => id.startsWith('str_'))).toEqual(plano.vigas.map((v) => v.idPrevisto));
    expect(r.model.walls.every((w) => w.cedeSobreposicao === true)).toBe(true);
    expect(conferirPlanoDeVigas(m, plano)).toEqual({ ok: true });
    const v1 = r.model.structures.find((s) => s.rotulo === 'V1')!;
    expect(v1).toMatchObject({ kind: 'VIGA', pontos: [{ x: 0, y: 0 }, { x: 6000, y: 0 }], larguraMm: 150, alturaMm: 300, baseMm: 2500 });
    const antes = snapshotHash(m);
    expect(() => applyBatch(m, [...plano.comandos, { type: 'SetCedeSobreposicao', id: 'wall_nope', cede: true }])).toThrow();
    expect(snapshotHash(m)).toBe(antes);
  });

  it('idempotente e determinístico; relançar apaga só as vigas (pilares ficam)', () => {
    const { m, t } = casa();
    const plano = vigas(m, t);
    expect(JSON.stringify(plano)).toBe(JSON.stringify(vigas(m, t)));
    const depois = applyBatch(m, plano.comandos).model;
    expect(vigas(depois, t)).toMatchObject({ vigas: [], comandos: [], motivo: 'todas as paredes já têm viga', cadeiasComViga: 5 });
    const re = relancarVigas(depois, t, { ...HIPOTESES_VIGAS_PADRAO, divisorDaAltura: 12 });
    expect(re.apagados).toHaveLength(5);
    expect(re.comandos.slice(0, 5).every((c) => c.type === 'DeleteStructural')).toBe(true);
    const final = applyBatch(depois, re.comandos).model;
    expect(final.structures.filter((s) => s.kind === 'PILAR')).toHaveLength(2);
    expect(final.structures.filter((s) => s.kind === 'VIGA')).toHaveLength(5);
    expect(final.structures.find((s) => s.kind === 'VIGA' && s.pontos[0].y === 4000 && s.pontos[1].y === 4000)!.alturaMm).toBe(500);
    expect(conferirPlanoDeVigas(depois, re)).toEqual({ ok: true });
  });

  it('sem parede: motivo', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    expect(vigas(nivel.model, nivel.model.levels[0].id)).toMatchObject({ motivo: 'sem parede no pavimento', comandos: [] });
  });
});

describe('planejarLajes — uma laje por ambiente fechado', () => {
  it('dois ambientes, duas lajes com o anel do ambiente, 12 m² cada, 10 cm, apoiadas no pé-direito', () => {
    const { m, t } = casa({ pilares: false });
    expect(m.spaces).toHaveLength(2);
    const plano = lajes(m, t);
    expect(plano.motivo).toBeNull();
    expect(plano.lajes).toHaveLength(2);
    for (const l of plano.lajes) {
      expect(l.areaMm2).toBe(12_000_000);
      expect(l.pontos.length).toBeGreaterThanOrEqual(4);
      expect([l.espessuraMm, l.baseMm]).toEqual([100, 2800]);
    }
    expect(plano.lajes.map((l) => l.rotulo)).toEqual(['L1', 'L2']);
    const r = applyBatch(m, plano.comandos);
    expect(r.diff.created.filter((id) => id.startsWith('str_'))).toEqual(plano.lajes.map((l) => l.idPrevisto));
    expect(conferirPlanoDeLajes(m, plano)).toEqual({ ok: true });
    expect(r.model.structures.find((s) => s.rotulo === 'L1')).toMatchObject({ kind: 'LAJE', alturaMm: 100, baseMm: 2800 });
    // Espessura é hipótese: 12 → 120.
    expect(lajes(m, t, { espessuraMm: 120 }).lajes[0].espessuraMm).toBe(120);
  });

  it('ambiente que já tem laje (contendo o interior) é respeitado; depois de lançar, replanejar não cria nada; relançar apaga só lajes', () => {
    const { m, t } = casa();
    const plano = lajes(m, t);
    const depois = applyBatch(m, plano.comandos).model;
    expect(lajes(depois, t)).toMatchObject({ lajes: [], comandos: [], motivo: 'todos os ambientes já têm laje', ambientesComLaje: 2 });
    const re = relancarLajes(depois, t, { espessuraMm: 150 });
    expect(re.apagados).toHaveLength(2);
    const final = applyBatch(depois, re.comandos).model;
    expect(final.structures.filter((s) => s.kind === 'LAJE').every((s) => s.alturaMm === 150)).toBe(true);
    expect(final.structures.filter((s) => s.kind === 'PILAR')).toHaveLength(2);
  });

  it('sem ambiente fechado: motivo; ambiente minúsculo fica fora do plano', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const aberto = applyBatch(nivel.model, [parede(t, 0, 0, 4000, 0), parede(t, 4000, 0, 4000, 3000)]).model;
    expect(lajes(aberto, t)).toMatchObject({ motivo: 'nenhum ambiente fechado no pavimento' });
    const minusculo = applyBatch(nivel.model, [
      parede(t, 0, 0, 600, 0), parede(t, 600, 0, 600, 600), parede(t, 600, 600, 0, 600), parede(t, 0, 600, 0, 0),
    ]).model;
    const plano = lajes(minusculo, t);
    expect(plano.lajes).toHaveLength(0);
    expect(plano.foraDoPlano[0]?.motivo).toMatch(/menos de 0,5 m²/);
  });

  it('as prévias desenham a pegada certa: viga = retângulo da largura no eixo; laje = o anel', () => {
    const viga = pegadaDaPecaPrevista({ kind: 'VIGA', pontos: [{ x: 0, y: 0 }, { x: 4000, y: 0 }], larguraMm: 150, profundidadeMm: 0, rotacaoDeg: 0 });
    expect(viga).toHaveLength(4);
    expect(Math.min(...viga.map((p) => p.y))).toBe(-75);
    expect(Math.max(...viga.map((p) => p.y))).toBe(75);
    const anel = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }];
    expect(pegadaDaPecaPrevista({ kind: 'LAJE', pontos: anel, larguraMm: 0, profundidadeMm: 0, rotacaoDeg: 0 })).toEqual(anel);
  });

  it('a sequência completa — pilares, vigas, lajes — fecha num modelo coerente e os ambientes não mudam', () => {
    const { m, t } = casa({ pilares: false });
    const p = planejarPilares(m, t, HIPOTESES_PILARES_PADRAO);
    const comPilares = applyBatch(m, p.comandos).model;
    const v = vigas(comPilares, t);
    // Com os pilares intermediários lançados, as três paredes de 6 m ficam com vão de 3 m → 300.
    expect(v.vigas.every((x) => x.alturaMm === 300)).toBe(true);
    const comVigas = applyBatch(comPilares, v.comandos).model;
    const l = lajes(comVigas, t);
    const final = applyBatch(comVigas, l.comandos).model;
    expect(final.structures.filter((s) => s.kind === 'PILAR')).toHaveLength(9);
    expect(final.structures.filter((s) => s.kind === 'VIGA')).toHaveLength(5);
    expect(final.structures.filter((s) => s.kind === 'LAJE')).toHaveLength(2);
    expect(final.spaces.map((s) => s.areaMm2).sort()).toEqual(m.spaces.map((s) => s.areaMm2).sort());
  });
});
