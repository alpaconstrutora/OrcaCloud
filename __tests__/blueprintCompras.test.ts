// __tests__/blueprintCompras.test.ts
//
// PLANTA → COMPRAS (E10.3): das linhas `bp:` do orçamento aos itens do Plano de
// Aquisições. O que se protege aqui: a explosão (só material, agrupado por
// insumo, memória por linha), a data (cronograma vence a padrão), o prazo
// (específico > genérico), o estoque (abate) e a linha do plano (prefixo
// `bp:<estudo>:compras:` como origem — é o que permite regerar sem empilhar).
import { describe, expect, it } from 'vitest';
import { SinapiCategory, SinapiType, type BudgetEntry, type CompositionComponent } from '../types/budget';
import {
  dataDeNecessidade,
  datarInsumos,
  explodirEmInsumos,
  indexarTarefas,
  linhasDoPlano,
  memoriaDoInsumo,
  prazoDoInsumo,
  precificarInsumos,
  prefixoDeCompras,
  resumirCompras,
  somarDias,
  type ContextoDeCompras,
} from '../utils/blueprintCompras';

const comp = (code: string, description: string, unit: string, quantity: number, price: number, category: string = SinapiCategory.MATERIAL, type = SinapiType.INPUT): CompositionComponent => ({
  code, description, unit, quantity, price, category, type,
});

const BLOCO = comp('37595', 'Bloco cerâmico 14x19x39', 'UN', 13, 2.5);
const ARGAMASSA = comp('87292', 'Argamassa industrializada', 'KG', 8.5, 0.9);
const PEDREIRO = comp('88309', 'Pedreiro com encargos', 'H', 0.8, 25, SinapiCategory.MAO_DE_OBRA);
const SUB = comp('90000', 'Subcomposição qualquer', 'M2', 1, 10, SinapiCategory.MATERIAL, SinapiType.COMPOSITION);

const linha = (id: string, quantity: number, composition: CompositionComponent[] | undefined, type = SinapiType.COMPOSITION, code = '87519'): BudgetEntry => ({
  id,
  quantity,
  phase: 'Alvenaria',
  group: 'Planta Inteligente',
  sinapiItem: { code, description: `Item ${code}`, unit: 'M2', price: 60, type, category: 'Material', composition },
});

const ESTUDO = 'estudo-1';
const P1 = `bp:${ESTUDO}:AREA_PAREDE:w1`;
const P2 = `bp:${ESTUDO}:AREA_PAREDE:w2`;
const PORTA = `bp:${ESTUDO}:esquadria:porta-80`;

describe('explodirEmInsumos', () => {
  it('só material e equipamento; agrupa por insumo somando as linhas; memória por linha', () => {
    const r = explodirEmInsumos([
      linha(P1, 10, [BLOCO, ARGAMASSA, PEDREIRO, SUB]),
      linha(P2, 4, [BLOCO, PEDREIRO]),
    ]);
    expect(r.insumos.map((i) => i.codigo)).toEqual(['87292', '37595']); // ordem por descrição
    const bloco = r.insumos.find((i) => i.codigo === '37595')!;
    expect(bloco.quantidade).toBe(13 * 10 + 13 * 4);
    expect(bloco.origens.map((o) => [o.linhaId, o.quantidade])).toEqual([[P1, 130], [P2, 52]]);
    expect(bloco.custoUnitario).toBe(2.5);
    expect(bloco.direto).toBe(false);
    expect(r.soMaoDeObra).toBe(0);
    expect(r.semComposicao).toEqual([]);
    expect(memoriaDoInsumo(bloco)).toContain(`${P1} · Item 87519 → 130 UN`);
  });

  it('linha sem composição: INSUMO vira compra direta; composição sem componentes fica de fora e é dita; só mão de obra conta', () => {
    const r = explodirEmInsumos([
      linha(PORTA, 3, undefined, SinapiType.INPUT, 'INT-PORTA-80'),
      linha(`bp:${ESTUDO}:AREA_PISO:total`, 50, undefined),
      linha(P1, 10, [PEDREIRO]),
      linha(P2, 0, [BLOCO]),
    ]);
    expect(r.insumos).toHaveLength(1);
    expect(r.insumos[0]).toMatchObject({ codigo: 'INT-PORTA-80', direto: true, quantidade: 3, custoUnitario: 60 });
    expect(r.semComposicao).toEqual([{ linhaId: `bp:${ESTUDO}:AREA_PISO:total`, descricao: 'Item 87519', quantidade: 50, unidade: 'M2' }]);
    expect(r.soMaoDeObra).toBe(1);
  });

  it('componente sem código agrupa pela descrição normalizada', () => {
    const semCodigo = comp('', 'Areia  média', 'M3', 0.05, 120);
    const r = explodirEmInsumos([linha(P1, 10, [semCodigo]), linha(P2, 10, [{ ...semCodigo, description: 'areia média' }])]);
    expect(r.insumos).toHaveLength(1);
    expect(r.insumos[0].chave).toBe('desc:areia média');
    expect(r.insumos[0].codigo).toBeNull();
    expect(r.insumos[0].quantidade).toBe(1);
  });
});

describe('datas, prazo e estoque', () => {
  it('somarDias não passa por fuso', () => {
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('a data é a MENOR entre as tarefas das linhas; sem tarefa datada vale a padrão, e diz que é padrão', () => {
    const tarefas = indexarTarefas([{ id: P1, startDate: '2026-11-10T00:00:00.000Z' }, { id: P2, startDate: '2026-10-05' }, { id: PORTA }]);
    const insumo = { origens: [{ linhaId: P1, descricao: '', quantidade: 1 }, { linhaId: P2, descricao: '', quantidade: 1 }] };
    expect(dataDeNecessidade(insumo, tarefas, '2026-12-01')).toEqual({ data: '2026-10-05', doCronograma: true });
    expect(dataDeNecessidade({ origens: [{ linhaId: PORTA, descricao: '', quantidade: 1 }] }, tarefas, '2026-12-01')).toEqual({ data: '2026-12-01', doCronograma: false });
  });

  it('prazo específico do insumo vence o genérico; sem nada é 0', () => {
    const prazos = [{ inputCode: null, supplierId: 'f-geral', leadTimeDays: 7 }, { inputCode: '37595', supplierId: 'f-bloco', leadTimeDays: 21 }];
    expect(prazoDoInsumo('37595', prazos)).toEqual({ dias: 21, supplierId: 'f-bloco' });
    expect(prazoDoInsumo('87292', prazos)).toEqual({ dias: 7, supplierId: 'f-geral' });
    expect(prazoDoInsumo(null, [])).toEqual({ dias: 0, supplierId: undefined });
  });

  it('datarInsumos: comprar até = necessário − prazo; estoque abate e nunca fica negativo', () => {
    const ctx: ContextoDeCompras = {
      studyId: ESTUDO, studyName: 'Planta', revision: 2, projectId: 'obra-1', organizationId: 'org-1',
      dataPadrao: '2026-12-01',
      tarefas: indexarTarefas([{ id: P1, startDate: '2026-11-10' }]),
      prazos: [{ inputCode: '37595', leadTimeDays: 10 }],
      posicaoLiquida: new Map([['37595', 1000], ['87292', 10]]),
    };
    const r = datarInsumos(explodirEmInsumos([linha(P1, 10, [BLOCO, ARGAMASSA])]), ctx);
    const bloco = r.find((i) => i.codigo === '37595')!;
    expect(bloco).toMatchObject({ necessarioEm: '2026-11-10', doCronograma: true, prazoDias: 10, comprarAte: '2026-10-31', emEstoque: 1000, aComprar: 0 });
    const arg = r.find((i) => i.codigo === '87292')!;
    expect(arg).toMatchObject({ quantidade: 85, emEstoque: 10, aComprar: 75, prazoDias: 0, comprarAte: '2026-11-10' });
    const resumo = resumirCompras(r);
    expect(resumo).toEqual({ insumos: 2, linhasDaPlanta: 1, datadosPeloCronograma: 2, totalEstimado: 75 * 0.9 });
  });
});

describe('linhasDoPlano — a linha de procurement_plan_items', () => {
  it('origem = bp:<estudo>:compras:<chave>, colunas do motor, memória nas observações', () => {
    const ctx: ContextoDeCompras = {
      studyId: ESTUDO, studyName: 'Planta X', revision: 3, projectId: 'obra-1', organizationId: 'org-1',
      dataPadrao: '2026-12-01', tarefas: new Map(), prazos: [{ inputCode: null, supplierId: 'f-geral', leadTimeDays: 5 }],
    };
    const linhas = linhasDoPlano(explodirEmInsumos([linha(P1, 10, [BLOCO]), linha(PORTA, 2, undefined, SinapiType.INPUT, 'INT-PORTA-80')]), ctx);
    expect(linhas).toHaveLength(2);
    const bloco = linhas.find((l) => l.input_code === '37595')!;
    expect(bloco.source_budget_item_id).toBe(`${prefixoDeCompras(ESTUDO)}37595`);
    expect(bloco.source_budget_item_id.startsWith(`bp:${ESTUDO}:`)).toBe(true);
    expect(bloco).toMatchObject({
      organization_id: 'org-1', project_id: 'obra-1', status: 'pending', is_stale: false,
      input_description: 'Bloco cerâmico 14x19x39', input_unit: 'UN',
      required_qty: 130, net_required_qty: 130, estimated_unit_cost: 2.5,
      need_date: '2026-12-01', period_date: '2026-12-01', lead_time_days: 5, suggested_buy_date: '2026-11-26', suggested_supplier_id: 'f-geral',
      period_id: `planta:${ESTUDO}`,
    });
    expect(bloco.source_budget_item_desc).toBe('Planta "Planta X" rev. 3 · 1 linha(s)');
    expect(bloco.notes).toContain('Data padrão');
    expect(bloco.notes).toContain(`${P1} · Item 87519 → 130 UN`);
    const porta = linhas.find((l) => l.input_code === 'INT-PORTA-80')!;
    expect(porta.source_budget_item_desc).toContain('compra direta');
    expect(porta.required_qty).toBe(2);
  });
});

describe('precificarInsumos', () => {
  it('preenche só quem veio sem preço e tem código; composição em string não explode', () => {
    const r = explodirEmInsumos([linha(P1, 10, [{ ...BLOCO, price: 0 }, ARGAMASSA])]);
    const p = precificarInsumos(r, new Map([['37595', 3.1], ['87292', 99]]));
    expect(p.insumos.find((i) => i.codigo === '37595')!.custoUnitario).toBe(3.1);
    expect(p.insumos.find((i) => i.codigo === '87292')!.custoUnitario).toBe(0.9);
    const emString = explodirEmInsumos([{ ...linha(P1, 10, undefined), sinapiItem: { ...linha(P1, 10, undefined).sinapiItem, composition: '[{"code":"1"}]' as unknown as CompositionComponent[] } }]);
    expect(emString.insumos).toEqual([]);
    expect(emString.semComposicao).toHaveLength(1);
  });
});
