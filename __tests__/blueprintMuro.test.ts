/**
 * MURO (kernel 0.104.0, F26 da casa automática — decisão do usuário: "família nova no kernel"): o muro de divisa, a
 * grade e a mureta com grade, com os portões como vãos; fora do arranjo planar; a base no terreno. E a rampa de
 * veículos (`Escada.veicular`).
 *
 * ⚠️ Todo valor esperado está CALCULADO À MÃO no comentário.
 */
import { describe, expect, it } from 'vitest';
import { resumoDasMedidas } from '../utils/blueprintBudget';
import { gerarIfc } from '../utils/blueprintIfc';
import {
  applyBatch,
  applyCommand,
  areasDoMuro,
  canonicalPayload,
  computeQuantities,
  emptyModel,
  medirEscada,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  payloadDoHash,
  point,
  trechosDoMuro,
  vaosDosPortoes,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';

function terreo(elevationMm = 0): { model: BlueprintModel; t: string } {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm, defaultHeightMm: 2800 });
  return { model: a.model, t: a.model.levels[0].id };
}
const esperaCodigo = (fn: () => unknown, codigo: string) => {
  try {
    fn();
  } catch (e) {
    expect((e as { code?: string }).code).toBe(codigo);
    return;
  }
  throw new Error(`esperava ${codigo}, e nada foi lançado`);
};

describe('muro · os padrões e os tipos', () => {
  it('alvenaria de 1,80 m × 15 cm, sem portão, a base no piso', () => {
    const { model, t } = terreo();
    const r = applyCommand(model, { type: 'AddMuro', levelId: t, pontos: [point(0, 0), point(12000, 0)] });
    const m = r.model.muros![0];
    expect(m).toMatchObject({ tipo: 'ALVENARIA', alturaMm: 1800, espessuraMm: 150, portoes: [], rotulo: null });
    expect(m.alturaDaMuretaMm).toBeUndefined();
    expect(m.cotasDaBaseMm).toBeUndefined();
    expect(r.diff.created).toEqual([m.id]);
    // 12 m × 1,8 m = 21,6 m² de alvenaria.
    expect(areasDoMuro(r.model, m)).toEqual({ alvenariaM2: 21.6, gradeM2: 0, comprimentoCheioM: 12 });
  });

  it('mureta com grade: a mureta nasce com 60 cm; alvenaria embaixo, grade em cima', () => {
    const { model, t } = terreo();
    const m = applyCommand(model, { type: 'AddMuro', levelId: t, tipo: 'MURETA_COM_GRADE', pontos: [point(0, 0), point(10000, 0)] }).model.muros![0];
    expect(m.alturaDaMuretaMm).toBe(600);
    // 10 m × 0,6 = 6 m² de mureta; 10 m × (1,8 − 0,6) = 12 m² de grade.
    expect(areasDoMuro(applyBatch(model, []).model, m)).toEqual({ alvenariaM2: 6, gradeM2: 12, comprimentoCheioM: 10 });
  });

  it('trocar o tipo leva a mureta junto (sai do misto) e a devolve (volta ao misto)', () => {
    const { model, t } = terreo();
    const a = applyCommand(model, { type: 'AddMuro', levelId: t, tipo: 'MURETA_COM_GRADE', pontos: [point(0, 0), point(10000, 0)] }).model;
    const id = a.muros![0].id;
    const b = applyCommand(a, { type: 'SetMuroProps', muroId: id, tipo: 'GRADE' }).model;
    expect(b.muros![0].alturaDaMuretaMm).toBeUndefined();
    const c = applyCommand(b, { type: 'SetMuroProps', muroId: id, tipo: 'MURETA_COM_GRADE' }).model;
    expect(c.muros![0].alturaDaMuretaMm).toBe(600);
  });
});

describe('muro · os portões são vãos do percurso', () => {
  /** Frente de 12 m: portão de pedestre a 2 m (1 m), de garagem a 6 m (3 m). */
  const frente = () => {
    const { model, t } = terreo();
    return applyCommand(model, {
      type: 'AddMuro',
      levelId: t,
      pontos: [point(0, 0), point(12000, 0)],
      portoes: [
        { tipo: 'GARAGEM', offsetMm: 6000, larguraMm: 3000 },
        { tipo: 'PEDESTRE', offsetMm: 2000, larguraMm: 1000 },
      ],
    }).model;
  };

  it('ficam em ordem do percurso; os trechos cheios são o resto', () => {
    const m = frente();
    const muro = m.muros![0];
    expect(muro.portoes.map((g) => g.tipo)).toEqual(['PEDESTRE', 'GARAGEM']);
    // 0–2, 3–6, 9–12: 2 + 3 + 3 = 8 m cheios; 8 × 1,8 = 14,4 m².
    expect(trechosDoMuro(m, muro).map((x) => [x.a.x, x.b.x])).toEqual([[0, 2000], [3000, 6000], [9000, 12000]]);
    expect(areasDoMuro(m, muro)).toEqual({ alvenariaM2: 14.4, gradeM2: 0, comprimentoCheioM: 8 });
    expect(vaosDosPortoes(m, muro).map((v) => [v.portao.tipo, v.a.x, v.b.x])).toEqual([['PEDESTRE', 2000, 3000], ['GARAGEM', 6000, 9000]]);
  });

  it('portão que dobra a esquina: o percurso conta, não a reta', () => {
    // Muro em L: 0→5000 em x, depois 5000→5000+3000 em y. Portão a 4,5 m com 1 m: 0,5 m em cada lado da esquina.
    const { model, t } = terreo();
    const m = applyCommand(model, { type: 'AddMuro', levelId: t, pontos: [point(0, 0), point(5000, 0), point(5000, 3000)], portoes: [{ tipo: 'PEDESTRE', offsetMm: 4500, larguraMm: 1000 }] }).model;
    const tr = trechosDoMuro(m, m.muros![0]);
    expect(tr.map((x) => [x.a, x.b])).toEqual([[{ x: 0, y: 0 }, { x: 4500, y: 0 }], [{ x: 5000, y: 500 }, { x: 5000, y: 3000 }]]);
    expect(vaosDosPortoes(m, m.muros![0])[0]).toMatchObject({ a: { x: 4500, y: 0 }, b: { x: 5000, y: 500 } });
  });

  it('recusa portão sobre outro, passando do fim ou de tipo desconhecido', () => {
    const { model, t } = terreo();
    const muro = (portoes: { tipo: 'PEDESTRE' | 'GARAGEM'; offsetMm: number; larguraMm: number }[]): Command => ({ type: 'AddMuro', levelId: t, pontos: [point(0, 0), point(12000, 0)], portoes });
    esperaCodigo(() => applyCommand(model, muro([{ tipo: 'PEDESTRE', offsetMm: 2000, larguraMm: 1000 }, { tipo: 'GARAGEM', offsetMm: 2500, larguraMm: 3000 }])), 'BAD_MURO');
    esperaCodigo(() => applyCommand(model, muro([{ tipo: 'GARAGEM', offsetMm: 10000, larguraMm: 3000 }])), 'BAD_MURO');
    esperaCodigo(() => applyCommand(model, muro([{ tipo: 'PORTA' as 'PEDESTRE', offsetMm: 0, larguraMm: 1000 }])), 'BAD_MURO');
  });
});

describe('muro · a base acompanha o terreno', () => {
  it('cota por vértice, linear entre eles; a altura conta da base', () => {
    // Térreo no platô a 1300; o muro lateral de 0 a 30 m, o terreno de 0 a 3000 (10 %).
    const { model, t } = terreo(1300);
    const m = applyCommand(model, { type: 'AddMuro', levelId: t, pontos: [point(0, 0), point(0, 30000)], cotasDaBaseMm: [0, 3000] }).model;
    const [tr] = trechosDoMuro(m, m.muros![0]);
    expect([tr.baseAMm, tr.baseBMm]).toEqual([0, 3000]);
    // Sem as cotas, a base é o piso do pavimento (1300) nas duas pontas.
    const plano = applyCommand(m, { type: 'SetMuroProps', muroId: m.muros![0].id, cotasDaBaseMm: null }).model;
    const [tp] = trechosDoMuro(plano, plano.muros![0]);
    expect([tp.baseAMm, tp.baseBMm]).toEqual([1300, 1300]);
  });

  it('recusa uma cota a menos que os vértices', () => {
    const { model, t } = terreo();
    esperaCodigo(() => applyCommand(model, { type: 'AddMuro', levelId: t, pontos: [point(0, 0), point(5000, 0), point(5000, 5000)], cotasDaBaseMm: [0, 100] }), 'BAD_MURO');
  });
});

describe('muro · fora do arranjo planar', () => {
  it('o anel de muros do lote NÃO vira ambiente', () => {
    // Quatro muros fechando 12 × 30 m; um quarto fechado de paredes dentro. Só o quarto é ambiente.
    const { model, t } = terreo();
    const parede = (a: [number, number], b: [number, number]): Command => ({ type: 'AddWall', levelId: t, a: point(...a), b: point(...b), thicknessMm: 150, heightMm: 2800 });
    const m = applyBatch(model, [
      { type: 'AddMuro', levelId: t, pontos: [point(0, 0), point(12000, 0), point(12000, 30000), point(0, 30000), point(0, 0)] },
      parede([3000, 5000], [7000, 5000]),
      parede([7000, 5000], [7000, 9000]),
      parede([7000, 9000], [3000, 9000]),
      parede([3000, 9000], [3000, 5000]),
    ]).model;
    expect(m.spaces).toHaveLength(1);
  });
});

describe('muro · o canônico', () => {
  it('desenho sem muro não ganha a chave (o hash do acervo só muda pela versão)', () => {
    const { model, t } = terreo();
    const comParede = applyCommand(model, { type: 'AddWall', levelId: t, a: point(0, 0), b: point(3000, 0), thicknessMm: 150, heightMm: 2800 }).model;
    expect(payloadDoHash(comParede)).not.toContain('muros');
    expect(canonicalPayload(comParede)).not.toContain('"muros"');
  });

  it('com muro, ida e volta devolve o mesmo — portões, mureta, base, uid', () => {
    const { model, t } = terreo(1300);
    const m = applyCommand(model, {
      type: 'AddMuro',
      levelId: t,
      tipo: 'MURETA_COM_GRADE',
      alturaMm: 2000,
      alturaDaMuretaMm: 500,
      pontos: [point(0, 0), point(12000, 0)],
      cotasDaBaseMm: [0, 120],
      portoes: [{ tipo: 'PEDESTRE', offsetMm: 2000, larguraMm: 1000 }],
      rotulo: 'Frente',
    }).model;
    const devolta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(devolta.muros).toHaveLength(1);
    const { id: _a, ...semIdA } = devolta.muros![0];
    const { id: _b, ...semIdB } = m.muros![0];
    expect(semIdA).toEqual(semIdB);
    expect(payloadDoHash(devolta)).toBe(payloadDoHash(m));
  });
});

describe('muro · pavimento, mover, apagar', () => {
  it('apagar o pavimento leva o muro; TranslateEntities o leva junto; DeleteMuro apaga', () => {
    const { model, t } = terreo();
    const m = applyCommand(model, { type: 'AddMuro', levelId: t, pontos: [point(0, 0), point(12000, 0)] }).model;
    const id = m.muros![0].id;
    const movido = applyCommand(m, { type: 'TranslateEntities', wallIds: [], boundaryIds: [], muroIds: [id], delta: point(100, 200), manterJuncoes: false }).model;
    expect(movido.muros![0].pontos).toEqual([{ x: 100, y: 200 }, { x: 12100, y: 200 }]);
    const comOutro = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2920, defaultHeightMm: 2800 }).model;
    const semNivel = applyCommand(comOutro, { type: 'RemoveLevel', levelId: t });
    expect(semNivel.model.muros).toEqual([]);
    expect(semNivel.diff.deleted).toContain(id);
    expect(applyCommand(m, { type: 'DeleteMuro', muroId: id }).model.muros).toEqual([]);
  });

  it('os invariantes: um vértice só, altura zero, mureta acima do muro', () => {
    const { model, t } = terreo();
    esperaCodigo(() => applyCommand(model, { type: 'AddMuro', levelId: t, pontos: [point(0, 0)] }), 'BAD_MURO');
    esperaCodigo(() => applyCommand(model, { type: 'AddMuro', levelId: t, pontos: [point(0, 0), point(1000, 0)], alturaMm: 0 }), 'BAD_MURO');
    esperaCodigo(() => applyCommand(model, { type: 'AddMuro', levelId: t, tipo: 'MURETA_COM_GRADE', alturaDaMuretaMm: 1800, pontos: [point(0, 0), point(1000, 0)] }), 'BAD_MURO');
    esperaCodigo(() => applyCommand(model, { type: 'SetMuroProps', muroId: 'mur_9', alturaMm: 1000 }), 'MURO_NOT_FOUND');
  });
});

describe('rampa de veículos (Escada.veicular, 0.104.0)', () => {
  // Da calçada (0) à garagem (1300) em 6,5 m: 20 % — o código de obras, não a NBR 9050.
  const rampa = (veicular: boolean) => {
    const { model, t } = terreo(1300);
    return applyCommand(model, { type: 'AddEscada', levelId: t, tipo: 'RAMPA', pontos: [point(0, 0), point(0, 6500)], larguraMm: 3000, desdeCotaMm: 0, veicular }).model;
  };

  it('sem o aviso da NBR 9050; a de pedestre, com ele', () => {
    const v = rampa(true);
    expect(v.stairs[0].veicular).toBe(true);
    expect(medirEscada(v, v.stairs[0]).inclinacaoPct).toBeCloseTo(20, 6);
    expect(medirEscada(v, v.stairs[0]).avisos).toEqual([]);
    const p = rampa(false);
    expect(p.stairs[0].veicular).toBeUndefined();
    expect(medirEscada(p, p.stairs[0]).avisos.some((a) => /NBR 9050/.test(a))).toBe(true);
  });

  it('virou escada: a marca cai; o canônico a leva e devolve', () => {
    const v = rampa(true);
    expect(payloadDoHash(v)).toContain('"veicular":true');
    expect(modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(v))).stairs[0].veicular).toBe(true);
    const e = applyCommand(v, { type: 'SetEscadaProps', escadaId: v.stairs[0].id, tipo: 'ESCADA' }).model;
    expect(e.stairs[0].veicular).toBeUndefined();
    expect(payloadDoHash(rampa(false))).not.toContain('veicular');
  });
});

describe('muro · quantitativo e orçamento (quant-1.29.0)', () => {
  it('a frente em mureta com grade e a lateral em alvenaria: faces, metros e portões', () => {
    // Frente 12 m mureta com grade (1,8 m; mureta 0,6), portões de 1 m e 3 m → cheios 8 m: mureta 8 × 0,6 = 4,8 m²,
    // grade 8 × 1,2 = 9,6 m². Lateral 30 m de alvenaria 1,8 m → 54 m². Metros cheios: 8 + 30 = 38.
    const { model, t } = terreo();
    const m = applyBatch(model, [
      { type: 'AddMuro', levelId: t, tipo: 'MURETA_COM_GRADE', pontos: [point(0, 0), point(12000, 0)], portoes: [{ tipo: 'PEDESTRE', offsetMm: 2000, larguraMm: 1000 }, { tipo: 'GARAGEM', offsetMm: 6000, larguraMm: 3000 }] },
      { type: 'AddMuro', levelId: t, pontos: [point(12000, 0), point(12000, 30000)] },
    ]).model;
    const q = computeQuantities(m);
    expect(q.muros).toHaveLength(2);
    expect(q.totais).toMatchObject({ comprimentoMuroM: 42, areaMuroAlvenariaM2: 58.8, areaMuroGradeM2: 9.6, portoesDePedestre: 1, portoesDeGaragem: 1 });
    const r = resumoDasMedidas(q, {});
    const de = (id: string) => r.find((x) => x.medidaId === id)!;
    expect(de('AREA_MURO_ALVENARIA')).toMatchObject({ dimensao: 'M2', elementos: 2 });
    expect(de('AREA_MURO_ALVENARIA').quantidade).toBeCloseTo(58.8, 6);
    expect(de('AREA_MURO_GRADE')).toMatchObject({ quantidade: 9.6, elementos: 1 });
    expect(de('COMPRIMENTO_MURO').quantidade).toBeCloseTo(38, 6);
    expect(de('PORTAO_PEDESTRE')).toMatchObject({ dimensao: 'UN', quantidade: 1 });
    expect(de('PORTAO_GARAGEM')).toMatchObject({ dimensao: 'UN', quantidade: 1 });
  });

  it('sem muro: tudo zero', () => {
    const q = computeQuantities(terreo().model);
    expect(q.muros).toEqual([]);
    expect(q.totais).toMatchObject({ comprimentoMuroM: 0, areaMuroAlvenariaM2: 0, areaMuroGradeM2: 0, portoesDePedestre: 0, portoesDeGaragem: 0 });
  });
});

describe('muro · IFC', () => {
  it('alvenaria = IfcWall; grade = IfcRailing .BALUSTRADE.; o misto, os dois com GUIDs distintos', () => {
    const { model, t } = terreo();
    const m = applyBatch(model, [
      { type: 'AddMuro', levelId: t, pontos: [point(0, 0), point(0, 30000)], rotulo: 'Lateral' },
      { type: 'AddMuro', levelId: t, tipo: 'MURETA_COM_GRADE', pontos: [point(0, 0), point(12000, 0)], portoes: [{ tipo: 'PEDESTRE', offsetMm: 2000, larguraMm: 1000 }], rotulo: 'Frente' },
    ]).model;
    const ifc = gerarIfc(m, { titulo: 'T', revisao: 1, hash: 'h', data: new Date('2026-10-18T12:00:00Z') });
    expect(ifc).toMatch(/IFCWALL\('[^']+',#\d+,'Lateral',\$,'ALVENARIA',.*\.SOLIDWALL\.\);/);
    const mureta = /IFCWALL\('([^']+)',#\d+,'Frente - mureta'/.exec(ifc);
    const grade = /IFCRAILING\('([^']+)',#\d+,'Frente - grade',.*\.BALUSTRADE\.\);/.exec(ifc);
    expect(mureta).not.toBeNull();
    expect(grade).not.toBeNull();
    expect(mureta![1]).not.toBe(grade![1]);
    expect(ifc).toContain("'Pset_OpuraMuro'");
  });
});
