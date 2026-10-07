/**
 * CLIMATIZAÇÃO E9.1/E9.2 (07/10/2026, quant-1.25.0): a linha frigorígena se
 * compra pelos dois diâmetros e o isolamento, o equipamento pela capacidade, o
 * terminal de ar pela vazão e medida; as três redes viram linhas do orçamento
 * (por peça, por tubo/duto e pelas medidas do de-para) sem mudar a identidade
 * das linhas que já existiam.
 */
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, POLITICA_PADRAO, applyBatch, applyCommand, computeQuantities, emptyModel, medidaDaBitola, point, type Command } from '../utils/blueprintKernel';
import { MEDIDAS, gerarLancamentos, gerarLancamentosDeInstalacoes, type MapeamentoOrcamento, type MapeamentoResolvido } from '../utils/blueprintBudget';
import { SinapiType, type SinapiItem } from '../types/budget';

const CTX = { studyId: 'std', studyName: 'Casa', snapshotId: 'snap-1', snapshotHash: 'abcdef0123456789', revision: 1 };
const item = (code: string, unit: string): SinapiItem => ({ code, description: `Item ${code}`, unit, price: 10, type: SinapiType.COMPOSITION, category: 'Material' });
const mapa = (over: Partial<MapeamentoOrcamento>): MapeamentoOrcamento => ({ id: 'm1', organization_id: 'org', medida: 'AREA_PISO', item_code: '1', phase: 'Instalações', budget_group: 'Climatização', agrupamento: 'POR_ELEMENTO', filtro_ambiente: [], active: true, ...over });
const resolvido = (m: MapeamentoOrcamento, it: SinapiItem): MapeamentoResolvido[] => [{ mapeamento: m, item: it }];
const rotulos = (r: ReturnType<typeof gerarLancamentos>) => r.entries.map((e) => e.location?.room ?? e.description);

/**
 * Um pavimento com: duas evaporadoras de 9.000 e uma de 12.000 BTU/h; uma
 * condensadora; linha Ø6/10 isol. 9 (4 m) e Ø6/13 isol. 13 (2 m); dreno DN 25
 * (3 m); dutos 600×300 (4 m) e 600×400 (2 m), os dois com o mesmo código;
 * dois difusores de 300 m³/h 600×600 e um de 400 m³/h; uma evaporadora dutada;
 * e um tubo de água fria DN 25 com código (a linha antiga que não pode mudar).
 */
function cena() {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m0.levels[0].id;
  const peca = (disciplina: string, tipo: string, x: number, extra: Record<string, unknown> = {}): Command =>
    ({ type: 'AddTerminal', levelId: t, disciplina, tipo, tipoHidraulico: tipo, at: point(x, 5000), cotaMm: 2200, ...extra }) as Command;
  const tr = (disciplina: string, ax: number, bx: number, bitola: number, extra: Record<string, unknown> = {}): Command =>
    ({ type: 'AddTrecho', levelId: t, disciplina, a: point(ax, 0), b: point(bx, 0), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: bitola, ...extra }) as Command;
  const m = applyBatch(m0, [
    peca('FRIGORIGENA', 'EVAPORADORA_HI_WALL', 0, { capacidadeBtuH: 9000 }),
    peca('FRIGORIGENA', 'EVAPORADORA_HI_WALL', 1000, { capacidadeBtuH: 9000 }),
    peca('FRIGORIGENA', 'EVAPORADORA_HI_WALL', 2000, { capacidadeBtuH: 12000, itemCode: 'EVAP12' }),
    peca('FRIGORIGENA', 'CONDENSADORA_SPLIT', 3000),
    peca('MECANICA', 'EVAPORADORA_DUTADA', 4000, { capacidadeBtuH: 36000 }),
    peca('MECANICA', 'DIFUSOR', 5000, { vazaoM3h: 300, larguraMm: 600, profundidadeMm: 600 }),
    peca('MECANICA', 'DIFUSOR', 6000, { vazaoM3h: 300, larguraMm: 600, profundidadeMm: 600 }),
    peca('MECANICA', 'DIFUSOR', 7000, { vazaoM3h: 400 }),
    tr('FRIGORIGENA', 0, 4000, 6, { bitolaSuccaoMm: 10, isolamentoMm: 9, itemCode: 'COBRE' }),
    tr('FRIGORIGENA', 10000, 12000, 6, { bitolaSuccaoMm: 13, isolamentoMm: 13, itemCode: 'COBRE' }),
    tr('DRENO_AC', 20000, 23000, 25, { itemCode: 'DRENO25' }),
    tr('MECANICA', 30000, 34000, 600, { alturaDutoMm: 300, material: 'CHAPA_GALVANIZADA', itemCode: 'DUTO' }),
    tr('MECANICA', 40000, 42000, 600, { alturaDutoMm: 400, material: 'CHAPA_GALVANIZADA', itemCode: 'DUTO' }),
    tr('AGUA_FRIA', 50000, 51000, 25, { itemCode: 'PVC25' }),
  ]).model;
  return { m, q: computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION) };
}

describe('climatização E9.1 · o quantitativo (quant-1.25.0)', () => {
  it('⚠️ PRONTO QUANDO: a versão é a 1.25.0 e a linha se separa pelo par de diâmetros e o isolamento', () => {
    const { q } = cena();
    expect(q.policy.version).toBe('quant-1.25.0');
    const linha = q.totais.porBitola.filter((b) => b.disciplina === 'FRIGORIGENA');
    expect(linha.map((b) => [b.bitolaMm, b.bitolaSuccaoMm, b.isolamentoMm, Math.round(b.comprimentoM * 100) / 100])).toEqual([
      [6, 10, 9, 4],
      [6, 13, 13, 2],
    ]);
    // O tubo de água não ganha campo nenhum (a saída dos desenhos de sempre não muda).
    const agua = q.totais.porBitola.find((b) => b.disciplina === 'AGUA_FRIA')!;
    expect('bitolaSuccaoMm' in agua || 'isolamentoMm' in agua || 'alturaDutoMm' in agua).toBe(false);
    expect(q.trechos.find((x) => x.disciplina === 'AGUA_FRIA')).not.toHaveProperty('isolamentoMm');
  });

  it('a medida de compra: Ø líquido/sucção com o isolamento, L×A no duto, DN no resto', () => {
    expect(medidaDaBitola({ bitolaMm: 6, bitolaSuccaoMm: 10, isolamentoMm: 9 })).toBe('Ø6/10 · isol. 9 mm');
    expect(medidaDaBitola({ bitolaMm: 600, alturaDutoMm: 300 })).toBe('600×300');
    expect(medidaDaBitola({ bitolaMm: 25 })).toBe('DN 25');
  });

  it('o equipamento pela capacidade e o terminal de ar pela vazão e medida — o extintor continua com a especificação dele', () => {
    const { m, q } = cena();
    const evap = q.totais.porTerminal.filter((x) => x.classificacao === 'EVAPORADORA_HI_WALL').map((x) => [x.especificacao, x.quantidade, x.itemCode]);
    expect(evap).toEqual([
      ['12.000 BTU/h', 1, 'EVAP12'],
      ['9.000 BTU/h', 2, null],
    ]);
    const dif = q.totais.porTerminal.filter((x) => x.classificacao === 'DIFUSOR').map((x) => [x.especificacao, x.quantidade]);
    expect(dif).toEqual([
      ['300 m³/h · 600×600 mm', 2],
      ['400 m³/h', 1],
    ]);
    const comExtintor = applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'INCENDIO', tipo: 'EXTINTOR', tipoHidraulico: 'EXTINTOR', at: point(0, 9000), cotaMm: 1600, agenteExtintor: 'PQS_ABC', cargaExtintorKg: 4 } as Command).model;
    expect(computeQuantities(comExtintor, POLITICA_PADRAO).totais.porTerminal.find((x) => x.classificacao === 'EXTINTOR')!.especificacao).toBe('PQS_ABC · 4 kg');
  });
});

describe('climatização E9.2 · o orçamento', () => {
  it('⚠️ PRONTO QUANDO: equipamento, linha, dreno e duto com código viram linhas "de climatização" — e o tubo de sempre não muda de id', () => {
    const { q } = cena();
    const itens = new Map([['EVAP12', item('EVAP12', 'UN')], ['COBRE', item('COBRE', 'M')], ['DRENO25', item('DRENO25', 'M')], ['DUTO', item('DUTO', 'M')], ['PVC25', item('PVC25', 'M')]]);
    const r = gerarLancamentosDeInstalacoes(q, itens, CTX);
    expect(r.divergencias).toEqual([]);
    const por = (code: string) => r.entries.filter((e) => e.sinapiItem.code === code);
    expect(por('PVC25').map((e) => e.id)).toEqual(['bp:std:instalacao:tubo:AGUA_FRIA:PVC_SOLDAVEL::25:PVC25']);
    expect(por('EVAP12').map((e) => [e.group, e.quantity])).toEqual([['Instalações de climatização — peças · Linha frigorígena', 1]]);
    const cobre = por('COBRE');
    expect(cobre.map((e) => e.id).sort()).toEqual(['bp:std:instalacao:tubo:FRIGORIGENA:COBRE::6s10i9:COBRE', 'bp:std:instalacao:tubo:FRIGORIGENA:COBRE::6s13i13:COBRE']);
    expect(cobre.every((e) => e.group === 'Instalações de climatização — tubos · Linha frigorígena')).toBe(true);
    // Os dois dutos com o MESMO código: dois ids (antes da E9 colidiam).
    const dutos = por('DUTO');
    expect(new Set(dutos.map((e) => e.id)).size).toBe(2);
    expect(dutos.map((e) => Math.round(e.quantity * 100) / 100).sort()).toEqual([2, 4]);
    expect(dutos.every((e) => e.group === 'Instalações de climatização — dutos · Mecânica')).toBe(true);
    expect(por('DRENO25').map((e) => e.quantity)).toEqual([3]);
  });

  it('as medidas novas existem e medem: linha pelo par, dreno, chapa em m² (perímetro × comprimento) e equipamento pela capacidade', () => {
    const { q } = cena();
    for (const id of ['COMPRIMENTO_TUBO_FRIGORIGENA', 'COMPRIMENTO_TUBO_DRENO_AC', 'AREA_CHAPA_DUTO', 'CONTAGEM_EQUIPAMENTOS_CLIMATIZACAO']) expect(MEDIDAS.some((x) => x.id === id)).toBe(true);
    const linha = gerarLancamentos(q, resolvido(mapa({ medida: 'COMPRIMENTO_TUBO_FRIGORIGENA' }), item('L', 'M')), CTX);
    expect(rotulos(linha)).toEqual(expect.arrayContaining([expect.stringMatching(/Linha frigorígena Ø6\/10 · isol\. 9 mm/), expect.stringMatching(/Ø6\/13 · isol\. 13 mm/)]));
    expect(gerarLancamentos(q, resolvido(mapa({ medida: 'COMPRIMENTO_TUBO_DRENO_AC' }), item('D', 'M')), CTX).entries.map((e) => e.quantity)).toEqual([3]);
    const chapa = gerarLancamentos(q, resolvido(mapa({ medida: 'AREA_CHAPA_DUTO' }), item('C', 'M2')), CTX);
    // 2 × (0,6 + 0,3) × 4 = 7,2 m² e 2 × (0,6 + 0,4) × 2 = 4 m².
    expect(chapa.entries.map((e) => Math.round(e.quantity * 1000) / 1000).sort((a, b) => a - b)).toEqual([4, 7.2]);
    const eq = gerarLancamentos(q, resolvido(mapa({ medida: 'CONTAGEM_EQUIPAMENTOS_CLIMATIZACAO' }), item('E', 'UN')), CTX);
    expect(rotulos(eq)).toEqual(expect.arrayContaining([expect.stringMatching(/Evaporadora hi-wall · 9\.000 BTU\/h/), expect.stringMatching(/Evaporadora hi-wall · 12\.000 BTU\/h/), expect.stringMatching(/Condensadora/), expect.stringMatching(/dutada · 36\.000 BTU\/h/)]));
    expect(eq.entries.find((e) => /9\.000/.test(e.location?.room ?? ''))!.quantity).toBe(2);
  });

  it('a evaporadora não é "ponto hidráulico"; a dutada não é "terminal de ar"; o difusor diz a vazão', () => {
    const { q } = cena();
    const hidro = rotulos(gerarLancamentos(q, resolvido(mapa({ medida: 'CONTAGEM_PONTOS_HIDRAULICOS' }), item('H', 'UN')), CTX)).join(' | ');
    expect(hidro).not.toMatch(/Evaporadora|Condensadora/);
    const ar = rotulos(gerarLancamentos(q, resolvido(mapa({ medida: 'CONTAGEM_TERMINAIS_DE_AR' }), item('A', 'UN')), CTX)).join(' | ');
    expect(ar).not.toMatch(/EVAPORADORA_DUTADA|dutada/i);
    expect(ar).toMatch(/DIFUSOR · 300 m³\/h · 600×600 mm/);
  });
});
