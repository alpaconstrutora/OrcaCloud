/**
 * QUANTITATIVO ELÉTRICO (29/09/2026, E0.3 do roadmap elétrico, quant-1.19.0).
 *
 * Até aqui o orçamento comprava eletroduto e contava pontos; nenhum FIO,
 * quadro, disjuntor ou DR era quantificado. O metro de condutor sai da
 * contagem DECLARADA em cada eletroduto × comprimento real, repartida entre os
 * circuitos pela ligação (a mesma conta da ocupação) — sem retorno até a E2, e
 * isso fica dito.
 */
import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO, applyBatch, applyCommand, computeQuantities, emptyModel, point, repartirCondutores, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { MEDIDAS, gerarLancamentos, gerarLancamentosDeInstalacoes, type MapeamentoOrcamento, type MapeamentoResolvido } from '../utils/blueprintBudget';
import { quantitativosPorPavimento, redeDoPavimento } from '../utils/blueprintQuantitativosPorPavimento';
import { SinapiType, type SinapiItem } from '../types/budget';

const CTX = { studyId: 'estudo-1', studyName: 'Casa', snapshotId: 'snap-1', snapshotHash: 'abcdef0123456789', revision: 1 };
const item = (code: string, unit: string): SinapiItem => ({ code, description: `Item ${code}`, unit, price: 10, type: SinapiType.COMPOSITION, category: 'Material' });
const mapa = (over: Partial<MapeamentoOrcamento>): MapeamentoOrcamento => ({
  id: 'm1', organization_id: 'org', medida: 'AREA_PISO', item_code: '1', phase: 'Instalações', budget_group: 'Elétrica',
  agrupamento: 'POR_ELEMENTO', filtro_ambiente: [], active: true, ...over,
});
const resolvido = (m: MapeamentoOrcamento, it: SinapiItem): MapeamentoResolvido[] => [{ mapeamento: m, item: it }];
const nome = (e: { location?: { room?: string }; description: string }) => e.location?.room ?? e.description;

/**
 * QDC com C1 (TUG, 2,5 mm², 16 A, DR) e C2 (luz, 1,5 mm², 10 A). Três pontos.
 * Eletrodutos: 4 m compartilhado com 6 condutores; prumada de 2,5 m do C1 com 3;
 * 2 m do C2 SEM contagem declarada (assume a base: 3).
 */
function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  let m = applyCommand(base, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(0, 0), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
  const q = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C1 — TUG', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16, protecaoDR: true }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C2 — luz', tensaoV: 127, secaoMm2: 1.5, disjuntorA: 10 }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  const ponto = (x: number, y: number, tipoEletrico: 'TUG' | 'ILUMINACAO_TETO', circuitoId: string, itemCode?: string): Command[] => [
    { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm: tipoEletrico === 'TUG' ? 300 : 2800, tipoEletrico, potenciaW: tipoEletrico === 'TUG' ? 600 : 100, itemCode: itemCode ?? null },
  ];
  m = applyBatch(m, [...ponto(1000, 0, 'TUG', c1, 'SIN-TUG'), ...ponto(2000, 0, 'TUG', c1, 'SIN-TUG'), ...ponto(2000, 2000, 'ILUMINACAO_TETO', c2)]).model;
  const [p1, p2, p3] = m.terminais.map((x) => x.id);
  m = applyBatch(m, [
    { type: 'SetTerminalProps', terminalId: p1, circuitoId: c1 },
    { type: 'SetTerminalProps', terminalId: p2, circuitoId: c1 },
    { type: 'SetTerminalProps', terminalId: p3, circuitoId: c2 },
    { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(0, 0), b: point(4000, 0), cotaAMm: 2800, cotaBMm: 2800, bitolaMm: 25, condutores: 6, circuitoIds: [c1, c2] },
    { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(4000, 0), b: point(4000, 0), cotaAMm: 2800, cotaBMm: 300, bitolaMm: 25, condutores: 3, circuitoIds: [c1] },
    { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(4000, 0), b: point(4000, 2000), cotaAMm: 2800, cotaBMm: 2800, bitolaMm: 20, circuitoIds: [c2] },
  ]).model;
  return m;
}

describe('quantitativo elétrico · quant-1.19.0', () => {
  it('a política subiu de versão — fio, quadro, disjuntor e DR entraram no payload', () => {
    expect(POLITICA_PADRAO.version).toBe('quant-1.24.0');
  });

  it('repartirCondutores: base por ligação, excedente no primeiro, falta nos últimos — com o índice do circuito', () => {
    expect(repartirCondutores(6, [{ ligacao: 'FN' }, { ligacao: 'FN' }], [2.5, 1.5])).toEqual([
      { indice: 0, secaoMm2: 2.5, quantidade: 3 },
      { indice: 1, secaoMm2: 1.5, quantidade: 3 },
    ]);
    expect(repartirCondutores(7, [{ ligacao: 'FN' }, { ligacao: 'FFF' }], [2.5, null])).toEqual([
      { indice: 0, secaoMm2: 2.5, quantidade: 3 },
      { indice: 1, secaoMm2: null, quantidade: 4 },
    ]);
    // 7 com dois F-N: sobra 1, que é retorno e fica no primeiro.
    expect(repartirCondutores(7, [{ ligacao: 'FN' }, { ligacao: 'FN' }], [2.5, 1.5])[0].quantidade).toBe(4);
    // 4 para dois F-N: o segundo fica com 1.
    expect(repartirCondutores(4, [{}, {}], [2.5, 1.5])).toEqual([
      { indice: 0, secaoMm2: 2.5, quantidade: 3 },
      { indice: 1, secaoMm2: 1.5, quantidade: 1 },
    ]);
  });

  it('⚠️ metro de FIO por TIPO e seção (E2.3): os pontos desta casa não têm caminho até o quadro → base da ligação em todos (F N T por circuito); 2,5 mm² = 19,5 m, 1,5 mm² = 18 m', () => {
    const q = computeQuantities(casa(), POLITICA_PADRAO);
    const soma = (secao: number) => q.totais.porCondutor.filter((c) => c.secaoMm2 === secao).reduce((s, c) => s + c.comprimentoM, 0);
    expect(soma(2.5)).toBeCloseTo(19.5, 6);
    expect(soma(1.5)).toBeCloseTo(18, 6);
    // Por TIPO: em 2,5 mm² a fase, o neutro (= fase, 6.2.6.2) e o PE (Tab. 58: ≤16 → igual) têm 6,5 m cada.
    const tipos25 = new Map(q.totais.porCondutor.filter((c) => c.secaoMm2 === 2.5).map((c) => [c.tipo, c.comprimentoM]));
    expect(tipos25.get('FASE')).toBeCloseTo(6.5, 6);
    expect(tipos25.get('NEUTRO')).toBeCloseTo(6.5, 6);
    expect(tipos25.get('TERRA')).toBeCloseTo(6.5, 6);
    expect(tipos25.has('RETORNO')).toBe(false);
    expect(q.totais.comprimentoCondutorM).toBeCloseTo(37.5, 6);
    // Todos os trechos caíram na BASE (nenhum ponto está na ponta de um eletroduto) — e dizem isso.
    for (const t of q.trechos) {
      expect(t.origemDaFiacao).toBe('BASE');
      expect(t.condutoresAssumidos).toBe(true);
    }
    const semDeclarar = q.trechos.find((t) => t.bitolaMm === 20)!;
    expect(semDeclarar.condutores).toBe(3);
    expect(semDeclarar.condutorM).toBeCloseTo(6, 6);
    const compartilhado = q.trechos.find((t) => t.condutores === 6)!;
    expect(compartilhado.condutoresPorSecao.map((c) => `${c.tipo}:${c.secaoMm2}`).sort()).toEqual(['FASE:1.5', 'FASE:2.5', 'NEUTRO:1.5', 'NEUTRO:2.5', 'TERRA:1.5', 'TERRA:2.5']);
  });

  it('o QUADRO: 2 circuitos, 3 pontos, disjuntores por In, 1 DR, 8,5 m de eletroduto e 37,5 m de fio', () => {
    const q = computeQuantities(casa(), POLITICA_PADRAO);
    expect(q.totais.quadros).toBe(1);
    const qdc = q.totais.porQuadro[0];
    expect(qdc.nome).toBe('QDC');
    expect(qdc.circuitos).toBe(2);
    expect(qdc.pontos).toBe(3);
    // E3.3: o disjuntor se compra por In, curva e Icn — sem declaração, `null`.
    expect(qdc.porDisjuntor).toEqual([{ inA: 10, curva: null, icnKa: null, quantidade: 1 }, { inA: 16, curva: null, icnKa: null, quantidade: 1 }]);
    expect(qdc.drs).toBe(1);
    expect(qdc.eletrodutoM).toBeCloseTo(8.5, 6);
    expect(qdc.condutorM).toBeCloseTo(37.5, 6);
    expect(q.totais.porDisjuntor).toEqual([{ inA: 10, curva: null, icnKa: null, quantidade: 1 }, { inA: 16, curva: null, icnKa: null, quantidade: 1 }]);
    expect(q.totais.drs).toBe(1);
  });

  it('as cinco medidas novas existem no catálogo, com a dimensão certa', () => {
    const dim = (id: string) => MEDIDAS.find((m) => m.id === id)?.dimensao;
    expect(dim('COMPRIMENTO_CONDUTOR')).toBe('M');
    expect(dim('CONTAGEM_PONTOS_ELETRICOS')).toBe('UN');
    expect(dim('CONTAGEM_QUADROS')).toBe('UN');
    expect(dim('CONTAGEM_DISJUNTORES')).toBe('UN');
    expect(dim('CONTAGEM_DR')).toBe('UN');
    expect(MEDIDAS.filter((m) => m.id === 'COMPRIMENTO_CONDUTOR')[0].escopo).toBe('INSTALACAO');
  });

  it('de-para: fio por seção (2 linhas), disjuntores por In, DR, quadro e pontos por tipo — e o filtro por texto recorta', () => {
    const q = computeQuantities(casa(), POLITICA_PADRAO);
    const fio = gerarLancamentos(q, resolvido(mapa({ medida: 'COMPRIMENTO_CONDUTOR' }), item('F', 'M')), CTX);
    expect(fio.divergencias).toHaveLength(0);
    // E2.3: uma linha por TIPO e seção — fase, neutro e terra em 1,5 e em 2,5.
    expect(fio.entries).toHaveLength(6);
    expect(fio.entries.map(nome).join(' ')).toMatch(/Condutor fase 2,5 mm²/);
    expect(fio.entries.filter((e) => /2,5/.test(nome(e))).reduce((s, e) => s + e.quantity, 0)).toBeCloseTo(19.5, 6);
    const so15 = gerarLancamentos(q, resolvido(mapa({ medida: 'COMPRIMENTO_CONDUTOR', filtro_ambiente: ['1,5 mm²'] }), item('F', 'M')), CTX);
    expect(so15.entries).toHaveLength(3);
    expect(so15.entries.reduce((s, e) => s + e.quantity, 0)).toBeCloseTo(18, 6);
    const soTerra = gerarLancamentos(q, resolvido(mapa({ medida: 'COMPRIMENTO_CONDUTOR', filtro_ambiente: ['terra'] }), item('F', 'M')), CTX);
    expect(soTerra.entries).toHaveLength(2);

    const disj = gerarLancamentos(q, resolvido(mapa({ medida: 'CONTAGEM_DISJUNTORES' }), item('D', 'UN')), CTX);
    expect(disj.entries.map(nome).sort()).toEqual(['Disjuntor 10 A', 'Disjuntor 16 A']);
    const dr = gerarLancamentos(q, resolvido(mapa({ medida: 'CONTAGEM_DR' }), item('R', 'UN')), CTX);
    expect(dr.entries).toHaveLength(1);
    expect(dr.entries[0].quantity).toBe(1);
    const quadros = gerarLancamentos(q, resolvido(mapa({ medida: 'CONTAGEM_QUADROS' }), item('Q', 'UN')), CTX);
    expect(quadros.entries).toHaveLength(1);
    expect(nome(quadros.entries[0])).toBe('Quadro QDC');
    const pontos = gerarLancamentos(q, resolvido(mapa({ medida: 'CONTAGEM_PONTOS_ELETRICOS' }), item('P', 'UN')), CTX);
    expect(pontos.entries).toHaveLength(2);
    expect(pontos.entries.reduce((s, e) => s + e.quantity, 0)).toBe(3);
    // Unidade errada é divergência, não linha — a mesma trava das outras medidas.
    const errado = gerarLancamentos(q, resolvido(mapa({ medida: 'COMPRIMENTO_CONDUTOR' }), item('F', 'UN')), CTX);
    expect(errado.entries).toHaveLength(0);
    expect(errado.divergencias.length).toBeGreaterThan(0);
  });

  it('lançamento por PEÇA: a tomada com código vira linha UN no grupo elétrico; o eletroduto sem código fica no de-para', () => {
    const q = computeQuantities(casa(), POLITICA_PADRAO);
    const r = gerarLancamentosDeInstalacoes(q, new Map([['SIN-TUG', item('SIN-TUG', 'UN')]]), CTX);
    expect(r.divergencias).toHaveLength(0);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].quantity).toBe(2);
    expect(r.entries[0].group).toMatch(/Instalações elétricas — peças/);
  });

  it('por PAVIMENTO: eletroduto, fio e pontos elétricos do Térreo fecham com o total; a rede do pavimento traz o fio por seção', () => {
    const m = casa();
    const q = computeQuantities(m, POLITICA_PADRAO);
    const [terreo] = quantitativosPorPavimento(m, q);
    expect(terreo.eletrodutoM).toBeCloseTo(8.5, 6);
    expect(terreo.condutorM).toBeCloseTo(37.5, 6);
    expect(terreo.pontosEletricos).toBe(3);
    const rede = redeDoPavimento(m, q, m.levels[0].id);
    expect(rede.porCondutor.reduce((s, c) => s + c.comprimentoM, 0)).toBeCloseTo(q.totais.comprimentoCondutorM, 6);
  });

  it('desenho sem elétrica: listas vazias, zero fio, zero quadro — nada inventado', () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const q = computeQuantities(base, POLITICA_PADRAO);
    expect(q.totais.porCondutor).toEqual([]);
    expect(q.totais.comprimentoCondutorM).toBe(0);
    expect(q.totais.porQuadro).toEqual([]);
    expect(q.totais.quadros).toBe(0);
    expect(q.totais.porDisjuntor).toEqual([]);
    expect(q.totais.drs).toBe(0);
  });
});
