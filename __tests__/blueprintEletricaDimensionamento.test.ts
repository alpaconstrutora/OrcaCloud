/**
 * PRÉ-DIMENSIONAMENTO ELÉTRICO — as tabelas e as fórmulas (13/09/2026).
 *
 * *"corrente por circuito (VA ÷ V), seção mínima pela tabela da 5410,
 * disjuntor coerente com a seção, queda de tensão estimada"* — item 6.
 *
 * ─── ⚠️ AS TABELAS SÃO CONFERIDAS CONTRA O PDF ──────────────────────────────
 *
 * Os pontos abaixo foram lidos da ABNT NBR 5410:2004 enviada pelo usuário
 * (p. 101, 106, 108, 113). Se um valor transcrito estiver errado, é AQUI que
 * ele cai — antes de sair "plausível" numa prancha.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import {
  HIPOTESES_PADRAO,
  SECOES_NOMINAIS_MM2,
  TABELA_36_COBRE_PVC,
  capacidadeCorrigidaA,
  comprimentoDoCircuito,
  correnteDeProjetoA,
  disjuntorSugeridoA,
  fatorDeAgrupamento,
  fatorDeTemperatura,
  izDeTabelaA,
  preDimensionarCircuito,
  quedaDeTensaoPct,
  secaoMinima,
  usoDoCircuito,
} from '../utils/blueprintEletricaDimensionamento';

describe('Tabela 36 · pontos conferidos contra o PDF (p. 101)', () => {
  it('as 24 seções nominais de cobre, na ordem', () => {
    expect(SECOES_NOMINAIS_MM2).toEqual([
      0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630, 800, 1000,
    ]);
    expect(TABELA_36_COBRE_PVC.every((l) => l.length === 13)).toBe(true);
  });

  it('B1, 2 condutores: 1,5 → 17,5 · 2,5 → 24 · 4 → 32 · 6 → 41 · 10 → 57 · 16 → 76 · 25 → 101 · 35 → 125', () => {
    const b1 = (s: number) => izDeTabelaA(s, 'B1', 2);
    expect([1.5, 2.5, 4, 6, 10, 16, 25, 35].map(b1)).toEqual([17.5, 24, 32, 41, 57, 76, 101, 125]);
  });

  it('B1, 3 condutores: 2,5 → 21 · 6 → 36 · 16 → 68; A1/2: 2,5 → 19,5; C/2: 2,5 → 27; D/3: 10 → 52', () => {
    expect(izDeTabelaA(2.5, 'B1', 3)).toBe(21);
    expect(izDeTabelaA(6, 'B1', 3)).toBe(36);
    expect(izDeTabelaA(16, 'B1', 3)).toBe(68);
    expect(izDeTabelaA(2.5, 'A1', 2)).toBe(19.5);
    expect(izDeTabelaA(2.5, 'C', 2)).toBe(27);
    expect(izDeTabelaA(10, 'D', 3)).toBe(52);
    // Extremos da tabela.
    expect(izDeTabelaA(0.5, 'A1', 2)).toBe(7);
    expect(izDeTabelaA(1000, 'D', 3)).toBe(652);
    expect(izDeTabelaA(1000, 'C', 2)).toBe(1125);
  });

  it('seção fora da tabela → null, não aproximação', () => {
    expect(izDeTabelaA(3, 'B1', 2)).toBeNull();
  });
});

describe('Tabelas 40 e 42 (p. 106 e 108)', () => {
  it('temperatura PVC ambiente: 30 → 1,00 · 40 → 0,87 · 50 → 0,71 · 60 → 0,50 · 65 → sem fator', () => {
    expect(fatorDeTemperatura(30, 'B1')).toBe(1);
    expect(fatorDeTemperatura(40, 'B1')).toBe(0.87);
    expect(fatorDeTemperatura(50, 'B1')).toBe(0.71);
    expect(fatorDeTemperatura(60, 'B1')).toBe(0.5);
    expect(fatorDeTemperatura(65, 'B1')).toBeNull();
    // Fora do degrau: cai no degrau mais QUENTE (a favor da segurança).
    expect(fatorDeTemperatura(37, 'B1')).toBe(0.87);
    // Solo (método D): 20 → 1,00 · 30 → 0,89.
    expect(fatorDeTemperatura(20, 'D')).toBe(1);
    expect(fatorDeTemperatura(30, 'D')).toBe(0.89);
  });

  it('agrupamento linha 1: 1 → 1,00 · 2 → 0,80 · 3 → 0,70 · 8 → 0,52 · 10 → 0,50 · 13 → 0,45 · 17 → 0,41 · 20 → 0,38', () => {
    expect([1, 2, 3, 8, 10, 13, 17, 20, 30].map(fatorDeAgrupamento)).toEqual([1, 0.8, 0.7, 0.52, 0.5, 0.45, 0.41, 0.38, 0.38]);
  });
});

describe('corrente de projeto', () => {
  it('1.270 VA em 127 V FN = 10,0 A; 7.620 VA em 220 V FFF = 20,0 A', () => {
    expect(correnteDeProjetoA(1270, 127, 'FN')).toBeCloseTo(10, 6);
    expect(correnteDeProjetoA(7620, 220, 'FFF')).toBeCloseTo(7620 / (Math.sqrt(3) * 220), 6);
    expect(correnteDeProjetoA(7620, 220, 'FFF')).toBeCloseTo(20.0, 1);
    expect(correnteDeProjetoA(4400, 220, 'FF')).toBeCloseTo(20, 6);
  });
});

describe('seção mínima (Tab. 36 corrigida + Tab. 47)', () => {
  it('⚠️ iluminação de 8 A pede 1,5 (uso); tomadas de 8 A pedem 2,5 — o uso vence a corrente', () => {
    const luz = secaoMinima(8, HIPOTESES_PADRAO, 'FN', 'ILUMINACAO')!;
    expect(luz).toMatchObject({ secaoMm2: 1.5, izA: 17.5 });
    const tom = secaoMinima(8, HIPOTESES_PADRAO, 'FN', 'FORCA')!;
    expect(tom).toMatchObject({ secaoMm2: 2.5, izA: 24, criterio: 'USO' });
  });

  it('TUE de 8 A pede 4 mm² pela HIPÓTESE (14/09/2026); com a hipótese em 2,5 volta à Tab. 47; abaixo de 2,5 a norma segura', () => {
    expect(secaoMinima(8, HIPOTESES_PADRAO, 'FN', 'TUE')).toMatchObject({ secaoMm2: 4, criterio: 'USO' });
    expect(secaoMinima(8, { ...HIPOTESES_PADRAO, secaoMinimaTueMm2: 2.5 }, 'FN', 'TUE')).toMatchObject({ secaoMm2: 2.5 });
    expect(secaoMinima(8, { ...HIPOTESES_PADRAO, secaoMinimaTueMm2: 1.5 }, 'FN', 'TUE')).toMatchObject({ secaoMm2: 2.5 });
    // O padrão de TUE é 4 e o de força continua 2,5 — a hipótese não vaza para a TUG.
    expect(HIPOTESES_PADRAO.secaoMinimaTueMm2).toBe(4);
    expect(secaoMinima(8, HIPOTESES_PADRAO, 'FN', 'FORCA')).toMatchObject({ secaoMm2: 2.5 });
  });

  it('30 A pede 4 mm² (Iz 32); 30 A em FFF pede 6 mm² (Iz 36 com 3 condutores)', () => {
    expect(secaoMinima(30, HIPOTESES_PADRAO, 'FN', 'FORCA')).toMatchObject({ secaoMm2: 4, izA: 32, criterio: 'CORRENTE' });
    expect(secaoMinima(30, HIPOTESES_PADRAO, 'FFF', 'FORCA')).toMatchObject({ secaoMm2: 6, izA: 36 });
  });

  it('⚠️ agrupamento 2 (f 0,80) sobe um degrau: 20 A passa de 2,5 (24 → 19,2) para 4', () => {
    const hip = { ...HIPOTESES_PADRAO, circuitosAgrupados: 2 };
    expect(capacidadeCorrigidaA(2.5, hip, 'FN')).toBeCloseTo(19.2, 6);
    expect(secaoMinima(20, hip, 'FN', 'FORCA')).toMatchObject({ secaoMm2: 4 });
    expect(secaoMinima(20, HIPOTESES_PADRAO, 'FN', 'FORCA')).toMatchObject({ secaoMm2: 2.5 });
  });

  it('temperatura sem fator → null; IB acima da tabela → null', () => {
    expect(secaoMinima(10, { ...HIPOTESES_PADRAO, temperaturaAmbienteC: 70 }, 'FN', 'FORCA')).toBeNull();
    expect(secaoMinima(5000, HIPOTESES_PADRAO, 'FN', 'FORCA')).toBeNull();
  });
});

describe('disjuntor (5.3.4.1): IB ≤ In ≤ Iz', () => {
  it('IB 18 A, Iz 24 A → 20 A; IB 23,5 A, Iz 24 A → nenhum cabe (a resposta é a seção)', () => {
    expect(disjuntorSugeridoA(18, 24, HIPOTESES_PADRAO.catalogoDeDisjuntoresA)).toBe(20);
    expect(disjuntorSugeridoA(23.5, 24, HIPOTESES_PADRAO.catalogoDeDisjuntoresA)).toBeNull();
    expect(disjuntorSugeridoA(10, 17.5, HIPOTESES_PADRAO.catalogoDeDisjuntoresA)).toBe(10);
    // A série COMERCIAL (15/09/2026): começa em 10 A — IB 1,3 A não recebe "6 A" —
    // e vai até 200 A para o geral de quadros grandes.
    expect(HIPOTESES_PADRAO.catalogoDeDisjuntoresA).toEqual([10, 16, 20, 25, 32, 40, 50, 63, 73, 80, 100, 125, 160, 200]);
    expect(disjuntorSugeridoA(1.3, 17.5, HIPOTESES_PADRAO.catalogoDeDisjuntoresA)).toBe(10);
    expect(disjuntorSugeridoA(150, 250, HIPOTESES_PADRAO.catalogoDeDisjuntoresA)).toBe(160);
  });

  it('a seção mínima admite o MENOR disjuntor comercial: 1,5 mm² muito agrupado (Iz < 10 A) sobe para 2,5 pelo critério DISJUNTOR', () => {
    // 7 circuitos no mesmo eletroduto: fator 0,54 → 1,5 mm² B1 = 17,5 × 0,54 = 9,45 A.
    // Conduz IB 1,3 A, mas nenhum disjuntor da série (≥ 10 A) cabe nela.
    const hip = { ...HIPOTESES_PADRAO, circuitosAgrupados: 7 };
    const luz = secaoMinima(1.3, hip, 'FN', 'ILUMINACAO')!;
    expect(luz.secaoMm2).toBe(2.5);
    expect(luz.criterio).toBe('DISJUNTOR');
    expect(luz.izA).toBeGreaterThanOrEqual(10);
    expect(disjuntorSugeridoA(1.3, luz.izA, hip.catalogoDeDisjuntoresA)).toBe(10);
    // Sem agrupamento, 1,5 mm² conduz 17,5 A ≥ 10 A: continua 1,5 (Tab. 47 manda).
    expect(secaoMinima(1.3, HIPOTESES_PADRAO, 'FN', 'ILUMINACAO')).toMatchObject({ secaoMm2: 1.5 });
  });

  it('com 1,5 mm² DECLARADO e Iz < 10 A, a sugestão é o par completo: 2,5 mm² e 10 A', async () => {
    const k = await import('../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    let m = k.applyCommand(nivel.model, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: k.point(0, 0), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
    m = k.applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros![0].id, nome: 'C1', tensaoV: 127, ligacao: 'FN', secaoMm2: 1.5 }).model;
    m = k.applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', at: k.point(2000, 2000), cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO', potenciaW: 160 }).model;
    m = k.applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais![0].id, circuitoId: m.circuitos![0].id }).model;
    const r = preDimensionarCircuito(m, m.circuitos![0], { ...HIPOTESES_PADRAO, circuitosAgrupados: 7 });
    expect(r.secaoDeclaradaMm2).toBe(1.5);
    expect(r.izDeclaradaA!).toBeLessThan(10);
    expect(r.secaoCalculada).toMatchObject({ secaoMm2: 2.5, criterio: 'DISJUNTOR' });
    expect(r.disjuntorSugeridoA).toBe(10);
  });
});

describe('queda de tensão (6.2.7)', () => {
  it('20 m, 2,5 mm², 10 A, 127 V, FN: ΔV = 2·0,0206·20·10 ÷ (2,5·127) = 2,6 %', () => {
    const q = quedaDeTensaoPct(10, 20, 2.5, 127, 'FN', 0.0206);
    expect(q).toBeCloseTo((2 * 0.0206 * 20 * 10) / (2.5 * 127) * 100, 9);
    expect(q).toBeCloseTo(2.6, 1);
  });

  it('FFF usa √3 em vez de 2', () => {
    const fn = quedaDeTensaoPct(10, 20, 2.5, 220, 'FN', 0.0206);
    const fff = quedaDeTensaoPct(10, 20, 2.5, 220, 'FFF', 0.0206);
    expect(fff / fn).toBeCloseTo(Math.sqrt(3) / 2, 9);
  });
});

// ─── O circuito inteiro, num desenho ───────────────────────────────────────

function cena(): { m: BlueprintModel; levelId: string } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;
  const m = applyCommand(base, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(0, 0), cotaMm: 1600 }).model;
  return { m, levelId };
}

const circuito = (m: BlueprintModel, extras: Partial<Extract<Command, { type: 'AddCircuito' }>> = {}) => {
  const c = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', tensaoV: 127, ...extras }).model;
  return { m: c, id: c.circuitos[c.circuitos.length - 1].id };
};

const tomada = (m: BlueprintModel, levelId: string, x: number, y: number, potenciaW: number | null, circuitoId: string) => {
  const criado = applyCommand(m, {
    type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', at: point(x, y), cotaMm: 300,
    tipoEletrico: 'TUG', potenciaW: potenciaW ?? undefined,
  }).model;
  const id = criado.terminais[criado.terminais.length - 1].id;
  return applyCommand(criado, { type: 'SetTerminalProps', terminalId: id, circuitoId }).model;
};

describe('preDimensionarCircuito · o circuito no desenho', () => {
  it('3 tomadas de 600 VA em 127 V: IB 14,2 A → 2,5 mm² (Iz 24) e disjuntor 16 A', () => {
    const { m: m0, levelId } = cena();
    const { m: m1, id } = circuito(m0);
    let m = m1;
    for (const x of [2000, 4000, 6000]) m = tomada(m, levelId, x, 75, 600, id);
    const r = preDimensionarCircuito(m, m.circuitos[0]);
    expect(r.sVA).toBe(1800);
    expect(r.ibA).toBeCloseTo(1800 / 127, 6);
    expect(r.uso).toBe('FORCA');
    expect(r.secaoCalculada).toMatchObject({ secaoMm2: 2.5, izA: 24 });
    expect(r.disjuntorSugeridoA).toBe(16);
    expect(r.achados).toEqual([]);
    // Sem eletroduto: comprimento ESTIMADO até a tomada mais distante
    // (reta em planta do quadro a (6000, 75) + 1,3 m de desnível de cota).
    expect(r.comprimento).toMatchObject({ origem: 'ESTIMADO' });
    expect(r.comprimento!.metros).toBeCloseTo(Math.hypot(6000, 75) / 1000 + 1.3, 6);
  });

  it('⚠️ declarado 1,5 mm² e 25 A num circuito de tomadas de 14 A: TRÊS faltas, cada uma com a referência', () => {
    const { m: m0, levelId } = cena();
    const { m: m1, id } = circuito(m0, { secaoMm2: 1.5, disjuntorA: 25 });
    let m = m1;
    for (const x of [2000, 4000, 6000]) m = tomada(m, levelId, x, 75, 600, id);
    const r = preDimensionarCircuito(m, m.circuitos[0]);
    const refs = r.achados.map((a) => a.referencia);
    expect(refs).toContain('6.2.6.1.1 / Tab. 47'); // força pede 2,5
    expect(refs).toContain('5.3.4.1'); // 25 A > Iz 17,5
    // 1,5 mm² conduz 17,5 A ≥ 14,2 A: a CORRENTE passa; o que falha é o uso e o disjuntor.
    expect(refs).not.toContain('6.2.6.1.2 a) / Tab. 36');
    expect(r.achados.every((a) => a.nivel === 'FALTA')).toBe(true);
  });

  it('TUE declarada 2,5 mm²: AVISO da hipótese (não barra); 1,5: FALTA da Tab. 47; 4: nada', () => {
    const tue = (secaoMm2: number) => {
      const { m: m0, levelId } = cena();
      const { m: m1, id } = circuito(m0, { secaoMm2 });
      const criado = applyCommand(m1, {
        type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUE', at: point(2000, 75), cotaMm: 300,
        tipoEletrico: 'TUE', potenciaW: 600,
      }).model;
      const tid = criado.terminais[criado.terminais.length - 1].id;
      const m = applyCommand(criado, { type: 'SetTerminalProps', terminalId: tid, circuitoId: id }).model;
      return preDimensionarCircuito(m, m.circuitos[0]);
    };
    const r25 = tue(2.5);
    expect(r25.uso).toBe('TUE');
    const aviso = r25.achados.find((a) => a.referencia === 'hipótese · TUE')!;
    expect(aviso).toMatchObject({ nivel: 'AVISO' });
    expect(aviso.mensagem).toMatch(/TUE \/ ligação direta pede no mínimo 4 mm² \(hipótese\); declarado 2,5/);
    expect(r25.achados.filter((a) => a.nivel === 'FALTA')).toEqual([]);

    const r15 = tue(1.5);
    const falta = r15.achados.find((a) => a.referencia === '6.2.6.1.1 / Tab. 47')!;
    expect(falta).toMatchObject({ nivel: 'FALTA' });
    expect(r15.achados.find((a) => a.referencia === 'hipótese · TUE')).toBeUndefined();

    expect(tue(4).achados.filter((a) => /Tab\. 47|hipótese/.test(a.referencia))).toEqual([]);
  });

  it('⚠️ sem tensão nada se calcula — e é DITO, não zero', () => {
    const { m: m0, levelId } = cena();
    const { m: m1, id } = circuito(m0, { tensaoV: null });
    const m = tomada(m1, levelId, 2000, 75, 600, id);
    const r = preDimensionarCircuito(m, m.circuitos[0]);
    expect(r.ibA).toBeNull();
    expect(r.naoAvaliado.join(' ')).toMatch(/sem tensão/);
  });

  it('ponto sem potência: IB é piso, e o "não avaliado" diz', () => {
    const { m: m0, levelId } = cena();
    const { m: m1, id } = circuito(m0);
    let m = tomada(m1, levelId, 2000, 75, 600, id);
    m = tomada(m, levelId, 4000, 75, null, id);
    const r = preDimensionarCircuito(m, m.circuitos[0]);
    expect(r.pontosSemPotencia).toBe(1);
    expect(r.naoAvaliado.join(' ')).toMatch(/piso/);
  });

  it('queda acima do limite: falta com a seção que atenderia (circuito longo estimado)', () => {
    const { m: m0, levelId } = cena();
    const { m: m1, id } = circuito(m0, { secaoMm2: 2.5 });
    // 2.400 VA a 60 m: IB 18,9 A; ΔV com 2,5 mm² ≈ 14,7 % → precisa de bem mais seção.
    const m = tomada(m1, levelId, 60000, 0, 2400, id);
    const r = preDimensionarCircuito(m, m.circuitos[0]);
    const queda = r.achados.find((a) => a.referencia === '6.2.7')!;
    expect(queda).toBeDefined();
    expect(r.quedaPct!).toBeGreaterThan(4);
    expect(r.secaoParaQuedaMm2).not.toBeNull();
    expect(r.secaoParaQuedaMm2!).toBeGreaterThan(2.5);
  });
});

describe('comprimentoDoCircuito · pelos eletrodutos', () => {
  it('⚠️ com eletroduto ligado ao quadro, o comprimento é o CAMINHO (com prumada), não a reta', () => {
    const { m: m0, levelId } = cena();
    const { m: m1, id } = circuito(m0);
    let m = tomada(m1, levelId, 4000, 0, 600, id);
    // Quadro (0,0) a 1.600 → tomada (4000,0) a 300: L = 4 m + 1,3 m = 5,3 m.
    m = applyCommand(m, {
      type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(0, 0), b: point(4000, 0),
      cotaAMm: 1600, cotaBMm: 300, bitolaMm: 25,
    }).model;
    m = applyCommand(m, { type: 'SetTrechoProps', trechoId: m.trechos[0].id, circuitoId: id }).model;
    const c = comprimentoDoCircuito(m, m.circuitos[0])!;
    expect(c.origem).toBe('ELETRODUTOS');
    expect(c.metros).toBeCloseTo(5.3, 6);
  });

  it('dois ramos a partir do quadro: vale o MAIS LONGO', () => {
    const { m: m0, levelId } = cena();
    const { m: m1, id } = circuito(m0);
    let m = m1;
    const add = (ax: number, ay: number, bx: number, by: number) => {
      m = applyCommand(m, {
        type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(ax, ay), b: point(bx, by),
        cotaAMm: 300, cotaBMm: 300, bitolaMm: 25,
      }).model;
      m = applyCommand(m, { type: 'SetTrechoProps', trechoId: m.trechos[m.trechos.length - 1].id, circuitoId: id }).model;
    };
    add(0, 0, 3000, 0);
    add(0, 0, 0, 8000);
    add(3000, 0, 3000, 2000);
    expect(comprimentoDoCircuito(m, m.circuitos[0])!.metros).toBeCloseTo(8, 6);
  });
});

describe('uso do circuito pelos pontos', () => {
  it('luz + interruptor = iluminação; qualquer tomada/força = força; vazio = null', () => {
    expect(usoDoCircuito([{ tipoEletrico: 'ILUMINACAO_TETO' }, { tipoEletrico: 'INTERRUPTOR' }])).toBe('ILUMINACAO');
    expect(usoDoCircuito([{ tipoEletrico: 'ILUMINACAO_TETO' }, { tipoEletrico: 'TUG' }])).toBe('FORCA');
    // TUE e ligação direta são uso próprio (14/09/2026); misturado, vale o mais exigente.
    expect(usoDoCircuito([{ tipoEletrico: 'LIGACAO_DIRETA' }])).toBe('TUE');
    expect(usoDoCircuito([{ tipoEletrico: 'TUG' }, { tipoEletrico: 'TUE' }])).toBe('TUE');
    expect(usoDoCircuito([{ tipoEletrico: 'ILUMINACAO_TETO' }, { tipoEletrico: 'TUE' }])).toBe('TUE');
    expect(usoDoCircuito([])).toBeNull();
  });
});

// Garante que o helper de teste realmente ligou os pontos ao circuito.
describe('sanidade do cenário', () => {
  it('a tomada nasce ligada ao circuito', () => {
    const { m: m0, levelId } = cena();
    const { m: m1, id } = circuito(m0);
    const m = tomada(m1, levelId, 2000, 75, 600, id);
    expect(m.terminais[0].circuitoId).toBe(id);
    expect(applyBatch(m, []).model.terminais).toHaveLength(1);
  });
});

describe('hipóteses gravadas × catálogo de disjuntores', () => {
  it('a coluna gravada com o catálogo antigo (6 A) NÃO prevalece: o catálogo é sempre a série comercial', async () => {
    // 15/09/2026: estudos que já tinham salvo hipóteses congelavam a lista com
    // 6 A e continuavam sugerindo "In 6 A" mesmo depois da troca do padrão.
    const { hipotesesDaColuna } = await import('../hooks/useBlueprintEletrica');
    const h = hipotesesDaColuna({ catalogoDeDisjuntoresA: [6, 10, 16], temperaturaAmbienteC: 35 });
    expect(h.catalogoDeDisjuntoresA).toEqual(HIPOTESES_PADRAO.catalogoDeDisjuntoresA);
    expect(h.temperaturaAmbienteC).toBe(35);
  });
});
