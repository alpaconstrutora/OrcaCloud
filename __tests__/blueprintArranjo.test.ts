/**
 * E10.4 do roadmap de climatização (08/10/2026): ALINHAR e ARRANJO para a
 * instalação. Distribuir com espaçamento igual (novo), alinhar trechos e
 * componentes (antes ficavam de fora) com o trecho podendo ser a referência, e a
 * matriz copiando pontos e trechos. Tudo pelo `TranslateEntities` /
 * `DuplicateEntities` que o kernel já tinha — sem bump.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { comandosDeAlinhamento, comandosDeDistribuicao, comandosDeMatriz } from '../utils/blueprintSelecao';

function nivel() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const evap = (t: string, x: number, y: number): Command =>
  ({ type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(x, y), cotaMm: 2200 }) as Command;
const duto = (t: string, a: [number, number], b: [number, number]): Command =>
  ({ type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(...a), b: point(...b), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 400, alturaDutoMm: 250 }) as Command;
const xs = (m: BlueprintModel) => (m.terminais ?? []).map((x) => x.at.x).sort((a, b) => a - b);

describe('E10.4 · distribuir', () => {
  it('as do meio vão a passos iguais SÓ no eixo de maior espalhamento; a primeira e a última ficam', () => {
    const { m, t } = nivel();
    const base = applyBatch(m, [evap(t, 0, 0), evap(t, 1000, 120), evap(t, 4500, -80), evap(t, 6000, 0)]).model;
    const ids = base.terminais!.map((x) => x.id);
    const r = comandosDeDistribuicao(base, ids);
    if (!r.ok) throw new Error(r.aviso);
    const depois = applyBatch(base, r.comandos).model;
    expect(xs(depois)).toEqual([0, 2000, 4000, 6000]);
    // O y de cada uma não mudou: distribuir em X não arrasta para a linha.
    expect(depois.terminais!.map((x) => x.at.y)).toEqual([0, 120, -80, 0]);
  });

  it('componente e trecho entram pelo centro; com eixo Y dado, o X não mexe', () => {
    const { m, t } = nivel();
    const base = applyBatch(m, [
      evap(t, 500, 0),
      { type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(900, 1000) } as Command,
      duto(t, [0, 5000], [2000, 5000]),
      evap(t, 300, 9000),
    ]).model;
    const ids = [...base.terminais!.map((x) => x.id), base.componentes![0].id, base.trechos![0].id];
    const r = comandosDeDistribuicao(base, ids, 'Y');
    if (!r.ok) throw new Error(r.aviso);
    const depois = applyBatch(base, r.comandos).model;
    expect(depois.componentes![0].at).toEqual({ x: 900, y: 3000 });
    expect(depois.trechos![0].a).toEqual({ x: 0, y: 6000 });
    expect(depois.trechos![0].b).toEqual({ x: 2000, y: 6000 });
    expect(depois.terminais!.map((x) => x.at)).toEqual([{ x: 500, y: 0 }, { x: 300, y: 9000 }]);
  });

  it('já igualmente espaçadas, menos de 3, ou todas na mesma coluna: nenhum comando, com o motivo', () => {
    const { m, t } = nivel();
    const iguais = applyBatch(m, [evap(t, 0, 0), evap(t, 2000, 0), evap(t, 4000, 0)]).model;
    expect(comandosDeDistribuicao(iguais, iguais.terminais!.map((x) => x.id))).toMatchObject({ ok: false, aviso: /já estão igualmente espaçadas/ });
    expect(comandosDeDistribuicao(iguais, iguais.terminais!.slice(0, 2).map((x) => x.id))).toMatchObject({ ok: false, aviso: /3 peças ou mais/ });
    expect(comandosDeDistribuicao(iguais, iguais.terminais!.map((x) => x.id), 'Y')).toMatchObject({ ok: false, aviso: /mesma linha/ });
  });
});

describe('E10.4 · alinhar a instalação', () => {
  it('ao DUTO como referência: evaporadoras, condensadora e o trecho paralelo vão para a reta dele; o perpendicular fica, com aviso', () => {
    const { m, t } = nivel();
    const base = applyBatch(m, [
      duto(t, [0, 3000], [8000, 3000]),
      evap(t, 1000, 2500),
      evap(t, 5000, 2800),
      { type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(7000, 3600) } as Command,
      duto(t, [1000, 2000], [3000, 2000]),
      duto(t, [6000, 0], [6000, 1500]),
    ]).model;
    const [ref, paralelo, perpendicular] = base.trechos!.map((x) => x.id);
    const sel = [...base.terminais!.map((x) => x.id), base.componentes![0].id, paralelo, perpendicular, ref];
    const r = comandosDeAlinhamento(base, sel, ref);
    if (!r.ok) throw new Error(r.aviso);
    expect(r.aviso).toMatch(/1 peça\(s\) não paralela/);
    const depois = applyBatch(base, r.comandos).model;
    expect(depois.terminais!.map((x) => x.at.y)).toEqual([3000, 3000]);
    expect(depois.terminais!.map((x) => x.at.x)).toEqual([1000, 5000]);
    expect(depois.componentes![0].at).toEqual({ x: 7000, y: 3000 });
    const tr = (id: string) => depois.trechos!.find((x) => x.id === id)!;
    expect([tr(paralelo).a.y, tr(paralelo).b.y]).toEqual([3000, 3000]);
    expect(tr(perpendicular).a).toEqual({ x: 6000, y: 0 });
    expect(tr(ref).a).toEqual({ x: 0, y: 3000 });
  });
});

describe('E10.4 · matriz da instalação', () => {
  it('a evaporadora e o trecho viram N exemplares a k·passo, num lote', () => {
    const { m, t } = nivel();
    const base = applyBatch(m, [evap(t, 1000, 1000), duto(t, [0, 2000], [2000, 2000])]).model;
    const r = comandosDeMatriz(base, [base.terminais![0].id, base.trechos![0].id], t, { quantidade: 3, passoXMm: 4000, passoYMm: 0 });
    if (!r.ok) throw new Error(r.aviso);
    expect(r.aviso).toBeNull();
    const depois = applyBatch(base, r.comandos).model;
    expect(xs(depois)).toEqual([1000, 5000, 9000]);
    expect(depois.trechos!.map((x) => x.a.x).sort((a, b) => a - b)).toEqual([0, 4000, 8000]);
  });

  it('o COMPONENTE também se copia (10/10/2026): uid novo, deslocado, sem a marca de sugerido', () => {
    const { m, t } = nivel();
    const base = applyBatch(m, [{ type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(3000, 0) } as Command]).model;
    const original = base.componentes![0];
    const r = comandosDeMatriz(base, [original.id], t, { quantidade: 3, passoXMm: 0, passoYMm: 2500 });
    if (!r.ok) throw new Error(r.aviso);
    expect(r.aviso).toBeNull();
    const depois = applyBatch(base, r.comandos).model;
    expect(depois.componentes!.map((c) => c.at.y)).toEqual([0, 2500, 5000]);
    expect(depois.componentes!.every((c) => c.tipoId === 'CONDENSADORA' && !c.sugerido)).toBe(true);
    expect(new Set(depois.componentes!.map((c) => c.uid)).size).toBe(3);
  });

  it('⚠️ split copiado inteiro: a evaporadora da cópia liga na condensadora da CÓPIA; copiada sozinha, fica no sistema de origem (VRF)', () => {
    const { m, t } = nivel();
    let base = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'CD', tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(5000, 0), cotaMm: 300 } as Command).model;
    const cd = base.terminais![0].id;
    base = applyCommand(base, { ...(evap(t, 1000, 1000) as object), condensadoraId: cd } as Command).model;
    const ev = base.terminais![1].id;
    const inteiro = comandosDeMatriz(base, [cd, ev], t, { quantidade: 2, passoXMm: 0, passoYMm: 4000 });
    if (!inteiro.ok) throw new Error(inteiro.aviso);
    const d1 = applyBatch(base, inteiro.comandos).model;
    const cdCopia = d1.terminais!.find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT' && x.id !== cd)!;
    const evCopia = d1.terminais!.find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL' && x.id !== ev)!;
    expect(evCopia.condensadoraId).toBe(cdCopia.id);
    expect(d1.terminais!.find((x) => x.id === ev)!.condensadoraId).toBe(cd);

    const soEvap = comandosDeMatriz(base, [ev], t, { quantidade: 2, passoXMm: 0, passoYMm: 4000 });
    if (!soEvap.ok) throw new Error(soEvap.aviso);
    const d2 = applyBatch(base, soEvap.comandos).model;
    expect(d2.terminais!.filter((x) => x.condensadoraId === cd)).toHaveLength(2);
  });

  it('o conjunto copiado inteiro leva os filhos para a cópia do pai; o filho copiado sozinho fica solto', async () => {
    const { m, t } = nivel();
    const base = applyCommand(m, { type: 'AddConjunto', levelId: t, tipoId: 'CONJUNTO_JANTAR', at: point(5000, 4000) } as Command).model;
    const pai = base.componentes!.find((c) => c.tipoId === 'CONJUNTO_JANTAR')!;
    const todos = base.componentes!.map((c) => c.id);
    const r = comandosDeMatriz(base, todos, t, { quantidade: 2, passoXMm: 6000, passoYMm: 0 });
    if (!r.ok) throw new Error(r.aviso);
    const depois = applyBatch(base, r.comandos).model;
    const paiCopia = depois.componentes!.find((c) => c.tipoId === 'CONJUNTO_JANTAR' && c.id !== pai.id)!;
    expect(depois.componentes!.filter((c) => c.paiUid === paiCopia.uid)).toHaveLength(5);
    expect(depois.componentes!.filter((c) => c.paiUid === pai.uid)).toHaveLength(5);

    const mesa = base.componentes!.find((c) => c.tipoId === 'MESA_JANTAR')!;
    const so = comandosDeMatriz(base, [mesa.id], t, { quantidade: 2, passoXMm: 6000, passoYMm: 0 });
    if (!so.ok) throw new Error(so.aviso);
    const d2 = applyBatch(base, so.comandos).model;
    const mesaCopia = d2.componentes!.find((c) => c.tipoId === 'MESA_JANTAR' && c.id !== mesa.id)!;
    expect(mesaCopia.paiUid).toBeUndefined();
  });
});
