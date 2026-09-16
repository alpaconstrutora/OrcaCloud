/**
 * LANÇAMENTO AUTOMÁTICO DE PILARES (15/09/2026) — ver `utils/blueprintPilaresAutomaticos.ts`.
 *
 * Pedido: *"implememte Lançamento automático de pilares"*.
 *
 * O que se prova: um pilar por encontro de paredes (canto, T, cruzamento) e
 * nenhum em emenda reta ou ponta solta; intermediários dividem o vão em partes
 * iguais e desviam de abertura; pilar existente é respeitado e apoia; os ids
 * previstos batem com os que o kernel dá; o lote é um só e atômico; rodar de
 * novo não cria nada; a ordem de desenho das paredes não muda o plano.
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
import {
  HIPOTESES_PILARES_PADRAO,
  conferirPlanoDePilares,
  idsPrevistosDeEstrutura,
  nosDeParede,
  normalizarSecao,
  pegadaDoPilarPrevisto,
  planejarPilares,
  proximoNumeroDePilar,
  relancarPilares,
  type HipotesesDePilares,
} from '../utils/blueprintPilaresAutomaticos';

const HIP = HIPOTESES_PILARES_PADRAO;

function parede(levelId: ObjectId, x1: number, y1: number, x2: number, y2: number, thicknessMm = 150): Command {
  return { type: 'AddWall', levelId, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, thicknessMm, heightMm: 2800 };
}

/**
 * A casa de teste:
 *
 *   (0,0) ───── w1 6 m ───── (6000,0)
 *     │                          │
 *    w4        w5 (interna)     w2
 *     │   (0,2000)────(6000,2000)│
 *     │                          │
 *   (0,4000) ─── w3 6 m ──── (6000,4000)
 *
 * Porta em w1 (offset 2700, 800 de vão) e pilar existente P3 no canto (0,0).
 */
function casa(opts: { porta?: boolean; existente?: boolean; interna?: boolean; peDireito?: number } = {}) {
  const { porta = true, existente = true, interna = true, peDireito = 2800 } = opts;
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
  if (porta) {
    m = applyCommand(m, { type: 'AddOpening', wallId: w1, kind: 'door', offsetMm: 2700, widthMm: 800, heightMm: 2100, sillMm: 0 }).model;
  }
  if (existente) {
    m = applyCommand(m, {
      type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 0, y: 0 }],
      larguraMm: 190, profundidadeMm: 190, alturaMm: 2800, rotulo: 'P3',
    }).model;
  }
  return { m, t, w1, w2, w3, w4, w5 };
}

const planejar = (m: BlueprintModel, t: ObjectId, hip: Partial<HipotesesDePilares> = {}) =>
  planejarPilares(m, t, { ...HIP, ...hip });

const em = (plano: ReturnType<typeof planejarPilares>, x: number, y: number) =>
  plano.pilares.find((p) => p.at.x === x && p.at.y === y);

describe('nosDeParede — os encontros do grafo de eixos', () => {
  it('quatro cantos e dois Ts na casa; nenhuma ponta nem emenda', () => {
    const { m, t } = casa();
    const { nos } = nosDeParede(m, t);
    const tipos = nos.map((n) => `${n.at.x},${n.at.y}:${n.tipo}`);
    expect(tipos).toEqual([
      '0,0:CANTO', '0,2000:T', '0,4000:CANTO', '6000,0:CANTO', '6000,2000:T', '6000,4000:CANTO',
    ]);
    // O T tem a ponta da interna e o MEIO da externa.
    const te = nos.find((n) => n.at.x === 0 && n.at.y === 2000)!;
    expect(te.incidencias.map((i) => i.end).sort()).toEqual(['a', 'meio']);
    expect(te.bracos).toHaveLength(3);
  });

  it('emenda em linha reta é EMENDA (não canto); ponta solta é PONTA; cruzamento sem vértice é CRUZAMENTO', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = applyBatch(nivel.model, [
      parede(t, 0, 0, 3000, 0),
      parede(t, 3000, 0, 6000, 0), // emenda em (3000,0)
      parede(t, 1000, -2000, 1000, 2000), // cruza a primeira em (1000,0), sem vértice
    ]).model;
    const { nos } = nosDeParede(m, t);
    const por = (x: number, y: number) => nos.find((n) => n.at.x === x && n.at.y === y);
    expect(por(3000, 0)?.tipo).toBe('EMENDA');
    expect(por(1000, 0)?.tipo).toBe('CRUZAMENTO');
    expect(por(1000, 0)?.incidencias.map((i) => i.end).sort()).toEqual(['meio', 'meio']);
    expect(por(0, 0)?.tipo).toBe('PONTA');
    expect(por(6000, 0)?.tipo).toBe('PONTA');
    expect(por(1000, -2000)?.tipo).toBe('PONTA');
  });
});

describe('planejarPilares — onde nascem', () => {
  it('3 cantos (o que já tem pilar é pulado), 2 Ts e um intermediário em cada parede de 6 m', () => {
    const { m, t } = casa();
    const plano = planejar(m, t);
    expect(plano.motivo).toBeNull();
    expect(plano.nosComPilarExistente).toBe(1);
    expect(plano.pontasSoltas).toBe(0);
    const onde = plano.pilares.map((p) => `${p.at.x},${p.at.y}:${p.onde}`);
    expect(onde).toEqual([
      '0,2000:T',
      '0,4000:CANTO',
      // w1 tem porta em 2700..3500: o meio (3000) cai nela e desvia para a borda
      // esquerda 2700 − 95 − 50 = 2555.
      '2555,0:INTERMEDIARIO',
      '3000,2000:INTERMEDIARIO',
      '3000,4000:INTERMEDIARIO',
      '6000,0:CANTO',
      '6000,2000:T',
      '6000,4000:CANTO',
    ]);
  });

  it('sem desviar de aberturas, o intermediário cai no meio (3000,0)', () => {
    const { m, t } = casa();
    const plano = planejar(m, t, { evitarAberturas: false });
    expect(em(plano, 3000, 0)?.onde).toBe('INTERMEDIARIO');
    expect(em(plano, 2555, 0)).toBeUndefined();
  });

  it('rótulos continuam do maior P<n> do modelo; sem nenhum, começam em P1', () => {
    const { m, t } = casa();
    expect(proximoNumeroDePilar(m)).toBe(4);
    expect(planejar(m, t).pilares.map((p) => p.rotulo)).toEqual(['P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11']);
    const sem = casa({ existente: false });
    expect(planejar(sem.m, sem.t).pilares[0].rotulo).toBe('P1');
  });

  it('o lado maior vai ao longo da parede: horizontal 0°, vertical 90°; 14×40 vira 400 × 140', () => {
    const { m, t } = casa();
    const plano = planejar(m, t, { larguraMm: 140, profundidadeMm: 400 });
    expect(normalizarSecao({ larguraMm: 140, profundidadeMm: 400 })).toEqual({ larguraMm: 400, profundidadeMm: 140 });
    const emW3 = em(plano, 3000, 4000)!;
    expect([emW3.larguraMm, emW3.profundidadeMm, emW3.rotacaoDeg]).toEqual([400, 140, 0]);
    // O T em (6000,2000): a externa w2 (vertical) e a interna w5 (horizontal), mesma
    // espessura — desempata pela mais LONGA (w5 tem 6 m, w2 tem 4 m) → 0°.
    expect(em(plano, 6000, 2000)!.rotacaoDeg).toBe(0);
    // Canto (6000,4000): w2 vertical 4 m × w3 horizontal 6 m → a mais longa → 0°.
    expect(em(plano, 6000, 4000)!.rotacaoDeg).toBe(0);
  });

  it('no nó com espessuras diferentes, a parede mais grossa dá o giro', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = applyBatch(nivel.model, [parede(t, 0, 0, 6000, 0, 150), parede(t, 0, 0, 0, 3000, 250)]).model;
    const plano = planejar(m, t);
    expect(em(plano, 0, 0)!.rotacaoDeg).toBe(90);
  });

  it('a altura é o pé-direito do pavimento; base no piso', () => {
    const { m, t } = casa({ peDireito: 3000 });
    const plano = planejar(m, t);
    expect(plano.pilares.every((p) => p.alturaMm === 3000)).toBe(true);
    const adds = plano.comandos.filter((c) => c.type === 'AddStructural');
    expect(adds.every((c) => c.type === 'AddStructural' && c.baseMm === 0 && c.alturaMm === 3000)).toBe(true);
  });

  it('vão máximo de 10 m: só os nós, nenhum intermediário', () => {
    const { m, t } = casa();
    const plano = planejar(m, t, { vaoMaximoMm: 10000 });
    expect(plano.pilares.map((p) => p.onde)).not.toContain('INTERMEDIARIO');
    expect(plano.pilares).toHaveLength(5);
  });

  it('só externas: sem T e nada na interna', () => {
    const { m, t } = casa();
    const plano = planejar(m, t, { incluirInternas: false });
    const onde = plano.pilares.map((p) => `${p.at.x},${p.at.y}:${p.onde}`);
    expect(onde).toEqual(['0,4000:CANTO', '2555,0:INTERMEDIARIO', '3000,4000:INTERMEDIARIO', '6000,0:CANTO', '6000,4000:CANTO']);
  });

  it('pilar existente no meio da parede conta como apoio: w1 fica sem intermediário', () => {
    const base = casa({ porta: false });
    const m = applyCommand(base.m, {
      type: 'AddStructural', levelId: base.t, kind: 'PILAR', pontos: [{ x: 3000, y: 0 }],
      larguraMm: 190, profundidadeMm: 190, alturaMm: 2800,
    }).model;
    const plano = planejar(m, base.t);
    expect(plano.pilares.filter((p) => p.at.y === 0 && p.onde === 'INTERMEDIARIO')).toHaveLength(0);
    expect(em(plano, 3000, 4000)?.onde).toBe('INTERMEDIARIO');
  });

  it('emenda reta não ganha pilar, mas a cadeia de 6 m ganha o intermediário justamente ali', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = applyBatch(nivel.model, [
      parede(t, 0, 0, 3000, 0),
      parede(t, 3000, 0, 6000, 0),
      parede(t, 6000, 0, 6000, 4000),
      parede(t, 6000, 4000, 0, 4000),
      parede(t, 0, 4000, 0, 0),
    ]).model;
    const plano = planejar(m, t);
    const no3000 = em(plano, 3000, 0)!;
    expect(no3000.onde).toBe('INTERMEDIARIO');
    expect(plano.pilares.filter((p) => p.onde !== 'INTERMEDIARIO')).toHaveLength(4);
  });

  it('parede fina demais para a seção: aviso de sobressair na linha; 15 cm não avisa', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = applyBatch(nivel.model, [parede(t, 0, 0, 4000, 0, 100), parede(t, 4000, 0, 4000, 3000, 100)]).model;
    const plano = planejar(m, t, { larguraMm: 250, profundidadeMm: 250 });
    expect(em(plano, 4000, 0)!.aviso).toMatch(/sobressai 75 mm de cada lado \(parede de 100 mm\)/);
    const { m: m2, t: t2 } = casa();
    expect(planejar(m2, t2).pilares.every((p) => p.aviso == null)).toBe(true);
  });

  it('sem parede: motivo; sem encontro (parede solta): motivo e a ponta contada', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    expect(planejar(nivel.model, t)).toMatchObject({ motivo: 'sem parede no pavimento', comandos: [] });
    const solta = applyCommand(nivel.model, parede(t, 0, 0, 3000, 0)).model;
    expect(planejar(solta, t)).toMatchObject({ motivo: 'nenhum encontro de paredes no pavimento', pontasSoltas: 2 });
  });

  it('sem posição livre entre aberturas: fora do plano, com motivo', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    let m = applyBatch(nivel.model, [
      parede(t, 0, 0, 4200, 0),
      parede(t, 4200, 0, 4200, 3000),
      parede(t, 4200, 3000, 0, 3000),
      parede(t, 0, 3000, 0, 0),
    ]).model;
    // Janela de 300 a 3900: com folga e meia seção, não sobra lugar longe dos cantos.
    m = applyCommand(m, { type: 'AddOpening', wallId: m.walls[0].id, kind: 'window', offsetMm: 300, widthMm: 3600, heightMm: 1200, sillMm: 1000 }).model;
    const plano = planejar(m, t, { vaoMaximoMm: 2000 });
    expect(plano.foraDoPlano.some((f) => f.onde === 'INTERMEDIARIO' && /sem posição livre/.test(f.motivo))).toBe(true);
    expect(plano.pilares.filter((p) => p.at.y === 0 && p.onde === 'INTERMEDIARIO')).toHaveLength(0);
  });

  it('a pegada do pilar previsto é o mesmo retângulo do pilar de verdade', () => {
    const anel = pegadaDoPilarPrevisto({ at: { x: 1000, y: 1000 }, larguraMm: 190, profundidadeMm: 190, rotacaoDeg: 0 });
    expect(anel).toEqual([
      { x: 905, y: 905 }, { x: 1095, y: 905 }, { x: 1095, y: 1095 }, { x: 905, y: 1095 },
    ]);
  });
});

describe('planejarPilares — o lote', () => {
  it('ids previstos batem com os que o kernel dá; AddStructural antes; uma parede cede uma vez', () => {
    const { m, t } = casa();
    const plano = planejar(m, t);
    expect(idsPrevistosDeEstrutura(m, 2)).toEqual(['str_0002', 'str_0003']); // P3 consumiu str_0001
    const tipos = plano.comandos.map((c) => c.type);
    expect(tipos.lastIndexOf('AddStructural')).toBeLessThan(tipos.indexOf('SetCedeSobreposicao'));
    expect(plano.paredesQueCedem).toHaveLength(5);
    expect(new Set(plano.paredesQueCedem).size).toBe(5);

    const r = applyBatch(m, plano.comandos);
    expect(r.diff.created.filter((id) => id.startsWith('str_'))).toEqual(plano.pilares.map((p) => p.idPrevisto));
    expect(r.model.seq['str']).toBe((m.seq['str'] ?? 0) + plano.pilares.length);
    expect(r.model.walls.every((w) => w.cedeSobreposicao === true)).toBe(true);
    expect(conferirPlanoDePilares(m, plano)).toEqual({ ok: true });
    // Os pilares gravados têm o que a prévia disse.
    const p4 = r.model.structures.find((s) => s.rotulo === 'P4')!;
    expect(p4).toMatchObject({ kind: 'PILAR', pontos: [{ x: 0, y: 2000 }], larguraMm: 190, profundidadeMm: 190, alturaMm: 2800, baseMm: 0 });
  });

  it('atômico: um comando inválido no fim não deixa nada gravado; a prova recusa', () => {
    const { m, t } = casa();
    const plano = planejar(m, t);
    const antes = snapshotHash(m);
    const corrompido = [...plano.comandos, { type: 'SetCedeSobreposicao' as const, id: 'wall_nope', cede: true }];
    expect(() => applyBatch(m, corrompido)).toThrow();
    expect(snapshotHash(m)).toBe(antes);
    expect(conferirPlanoDePilares(m, { ...plano, comandos: corrompido })).toMatchObject({ ok: false });
  });

  it('idempotente: depois de lançar, replanejar não cria nada; ambientes e áreas ficam iguais', () => {
    const { m, t } = casa();
    const plano = planejar(m, t);
    const depois = applyBatch(m, plano.comandos).model;
    const denovo = planejar(depois, t);
    expect(denovo).toMatchObject({ pilares: [], comandos: [], motivo: 'todos os encontros já têm pilar' });
    // Os seis encontros (4 cantos + 2 Ts) — o P3 de antes e os cinco lançados.
    expect(denovo.nosComPilarExistente).toBe(6);
    expect(depois.spaces.length).toBe(m.spaces.length);
    expect(depois.spaces.map((s) => s.areaMm2).sort()).toEqual(m.spaces.map((s) => s.areaMm2).sort());
  });

  it('determinístico: duas vezes igual, e a ordem em que as paredes foram desenhadas não muda o plano', () => {
    const { m, t } = casa();
    expect(JSON.stringify(planejar(m, t))).toBe(JSON.stringify(planejar(m, t)));

    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t2 = nivel.model.levels[0].id;
    const embaralhado = applyBatch(nivel.model, [
      parede(t2, 0, 2000, 6000, 2000),
      parede(t2, 6000, 4000, 0, 4000),
      parede(t2, 0, 4000, 0, 0),
      parede(t2, 0, 0, 6000, 0),
      parede(t2, 6000, 0, 6000, 4000),
    ]).model;
    const semExistente = casa({ existente: false, porta: false });
    const a = planejar(semExistente.m, semExistente.t).pilares.map((p) => [p.at.x, p.at.y, p.onde, p.rotulo, p.rotacaoDeg]);
    const b = planejar(embaralhado, t2).pilares.map((p) => [p.at.x, p.at.y, p.onde, p.rotulo, p.rotacaoDeg]);
    expect(b).toEqual(a);
  });

  it('T a menos de uma seção de um canto: fora do plano na 1ª rodada e NÃO volta na 2ª (mesmo raio para existente e candidato)', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = applyBatch(nivel.model, [
      parede(t, 0, 0, 6000, 0),
      parede(t, 6000, 0, 6000, 4000),
      parede(t, 6000, 4000, 0, 4000),
      parede(t, 0, 4000, 0, 0),
      parede(t, 150, 0, 150, 4000), // interna a 15 cm da externa: dois Ts colados nos cantos
    ]).model;
    const plano = planejar(m, t);
    expect(plano.foraDoPlano.filter((f) => /uma seção/.test(f.motivo))).toHaveLength(2);
    const depois = applyBatch(m, plano.comandos).model;
    const denovo = planejar(depois, t);
    expect(denovo.pilares).toHaveLength(0);
    expect(denovo.motivo).toBe('todos os encontros já têm pilar');
  });

  it('relançar: apaga os pilares do pavimento (inclusive manuais) e lança de novo com a seção nova, num lote só', () => {
    const { m, t } = casa();
    const lancado = applyBatch(m, planejar(m, t).comandos).model;
    expect(lancado.structures).toHaveLength(9); // P3 manual + 8 lançados
    expect(planejar(lancado, t).pilares).toHaveLength(0); // "Lançar" não tem mais o que fazer…
    const re = relancarPilares(lancado, t, { ...HIP, larguraMm: 250, profundidadeMm: 250 });
    // …mas relançar sempre tem: apaga os 9 e propõe os encontros de novo, com 25×25.
    expect(re.apagados).toHaveLength(9);
    expect(re.pilares.length).toBeGreaterThan(0);
    expect(re.pilares.every((p) => p.larguraMm === 250 && p.profundidadeMm === 250)).toBe(true);
    const tipos = re.comandos.map((c) => c.type);
    expect(tipos.slice(0, 9).every((x) => x === 'DeleteStructural')).toBe(true);
    expect(tipos.lastIndexOf('AddStructural')).toBeLessThan(tipos.indexOf('SetCedeSobreposicao') === -1 ? Infinity : tipos.indexOf('SetCedeSobreposicao'));
    // Os ids previstos seguem valendo (apagar não recua o contador) e a prova passa.
    expect(conferirPlanoDePilares(lancado, re)).toEqual({ ok: true });
    const depois = applyBatch(lancado, re.comandos).model;
    expect(depois.structures.every((s) => s.larguraMm === 250)).toBe(true);
    // Sem o P3 manual em (0,0), o canto (0,0) também ganhou pilar: 9 posições.
    expect(depois.structures).toHaveLength(9);
    expect(depois.structures.map((s) => s.rotulo)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9']);
  });

  it('relançar sem pilar no pavimento é o mesmo que lançar', () => {
    const { m, t } = casa({ existente: false });
    const re = relancarPilares(m, t);
    expect(re.apagados).toEqual([]);
    expect(re.comandos).toEqual(planejar(m, t).comandos);
  });

  it('paredes que já cedem não entram de novo no lote', () => {
    const { m, t, w1 } = casa();
    const ja = applyCommand(m, { type: 'SetCedeSobreposicao', id: w1, cede: true }).model;
    const plano = planejar(ja, t);
    expect(plano.paredesQueCedem).not.toContain(w1);
    expect(plano.paredesQueCedem).toHaveLength(4);
  });
});
