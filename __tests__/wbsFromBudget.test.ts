import { describe, it, expect } from 'vitest';
import {
  reconstruirWbsAPartirDoOrcamento,
  garantirCaminhosNaWbs,
  caminhoDoItem,
  caminhosDaWbs,
} from '../utils/wbsFromBudget';
import { BudgetEntry, WBSGroup } from '../types';

const item = (
  id: string,
  group: string,
  phase: string,
  subPhase: string,
): BudgetEntry =>
  ({
    id,
    group,
    phase,
    subPhase,
    quantity: 1,
    sinapiItem: { code: id, description: id, unit: 'M', price: 10 },
  } as unknown as BudgetEntry);

/**
 * Caso real que originou o utilitário: projeto "Igreja Divino Espirito Santo",
 * 37 itens com a estrutura própria (01. SERVIÇOS INICIAIS … 04. FUNDAÇÕES) e
 * `settings.wbs` valendo o template de demonstração (01. Execução da Obra).
 */
const ORCAMENTO_REAL: BudgetEntry[] = [
  item('a', '04. FUNDAÇÕES', '04.02. Estaca Hélice Contínua', '04.02.01. Estaca Hélice Contínua - 6 x C25 - 10m'),
  item('b', '04. FUNDAÇÕES', '04.02. Estaca Hélice Contínua', '04.02.02. Estaca Hélice Contínua - 69 x C30 - 10m'),
  item('c', '04. FUNDAÇÕES', '04.01. LOCAÇÃO', '04.01.01. Locação da Obra (Gabarito)'),
  item('d', '01. SERVIÇOS INICIAIS', '01.01. Serviços Técnicos', '01.01.01. Fiscalização - ART'),
];

const TEMPLATE_PADRAO: WBSGroup[] = [
  {
    id: '01',
    name: '01. Execução da Obra',
    phases: [
      { id: '01.01', name: '01.01. Serviços Preliminares', subPhases: ['01.01.01. Instalação de Canteiro'] },
    ],
  },
];

describe('reconstruirWbsAPartirDoOrcamento', () => {
  it('devolve uma EAP que cobre 100% dos caminhos dos itens', () => {
    const { wbs, budget } = reconstruirWbsAPartirDoOrcamento(ORCAMENTO_REAL);

    const validos = caminhosDaWbs(wbs);
    expect(budget.filter(i => !validos.has(caminhoDoItem(i)))).toEqual([]);
  });

  it('preserva os nomes caractere por caractere (a árvore casa por igualdade exata)', () => {
    const { wbs } = reconstruirWbsAPartirDoOrcamento(ORCAMENTO_REAL);

    const fundacoes = wbs.find(g => g.name === '04. FUNDAÇÕES');
    expect(fundacoes).toBeDefined();
    expect(fundacoes!.phases.map(p => p.name)).toContain('04.02. Estaca Hélice Contínua');
    expect(fundacoes!.phases.find(p => p.name === '04.02. Estaca Hélice Contínua')!.subPhases).toEqual([
      '04.02.01. Estaca Hélice Contínua - 6 x C25 - 10m',
      '04.02.02. Estaca Hélice Contínua - 69 x C30 - 10m',
    ]);
  });

  it('ordena pelo prefixo numérico, não alfabeticamente', () => {
    const entradas = [
      item('x', '10. PINTURA', 'a', 'a'),
      item('y', '09. INSTALAÇÕES', 'a', 'a'),
      item('z', '01. SERVIÇOS INICIAIS', 'a', 'a'),
    ];
    const { wbs } = reconstruirWbsAPartirDoOrcamento(entradas);
    expect(wbs.map(g => g.name)).toEqual(['01. SERVIÇOS INICIAIS', '09. INSTALAÇÕES', '10. PINTURA']);
  });

  it('gera ids únicos e hierárquicos para expandir/recolher', () => {
    const { wbs } = reconstruirWbsAPartirDoOrcamento(ORCAMENTO_REAL);
    const ids = wbs.flatMap(g => [g.id, ...g.phases.map(p => p.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    wbs.forEach(g => g.phases.forEach(p => expect(p.id.startsWith(`${g.id}.`)).toBe(true)));
  });

  it('preenche nível em branco com "Geral" no nó E no item, para continuarem casando', () => {
    const semSubetapa = [item('p', 'Planta Inteligente', '', '')];
    const { wbs, budget, itensNormalizados } = reconstruirWbsAPartirDoOrcamento(semSubetapa);

    expect(itensNormalizados).toBe(1);
    expect(budget[0].phase).toBe('Geral');
    expect(budget[0].subPhase).toBe('Geral');
    expect(caminhosDaWbs(wbs).has(caminhoDoItem(budget[0]))).toBe(true);
  });

  it('não toca em item que já está normalizado', () => {
    const { budget, itensNormalizados } = reconstruirWbsAPartirDoOrcamento(ORCAMENTO_REAL);
    expect(itensNormalizados).toBe(0);
    expect(budget[0]).toBe(ORCAMENTO_REAL[0]);
  });

  it('orçamento vazio devolve EAP vazia sem quebrar', () => {
    expect(reconstruirWbsAPartirDoOrcamento([]).wbs).toEqual([]);
    expect(reconstruirWbsAPartirDoOrcamento(undefined).wbs).toEqual([]);
  });
});

describe('garantirCaminhosNaWbs', () => {
  it('acrescenta só o que falta e mantém a EAP existente intacta', () => {
    const novos = [item('p', 'Planta Inteligente', 'Alvenaria', '')];
    const { wbs, caminhosAdicionados } = garantirCaminhosNaWbs(TEMPLATE_PADRAO, novos);

    expect(caminhosAdicionados).toBe(1);
    expect(wbs[0]).toEqual(TEMPLATE_PADRAO[0]);
    expect(wbs[1].name).toBe('Planta Inteligente');
    expect(wbs[1].phases[0].subPhases).toEqual(['Geral']);
  });

  it('não duplica caminho que já existe', () => {
    const jaExiste = [item('q', '01. Execução da Obra', '01.01. Serviços Preliminares', '01.01.01. Instalação de Canteiro')];
    const { wbs, caminhosAdicionados } = garantirCaminhosNaWbs(TEMPLATE_PADRAO, jaExiste);

    expect(caminhosAdicionados).toBe(0);
    expect(wbs).toEqual(TEMPLATE_PADRAO);
  });

  it('parte de EAP inexistente sem quebrar', () => {
    const { wbs, budget } = garantirCaminhosNaWbs(undefined, ORCAMENTO_REAL);
    const validos = caminhosDaWbs(wbs);
    expect(budget.filter(i => !validos.has(caminhoDoItem(i)))).toEqual([]);
  });
});

describe('caminhosDaWbs / caminhoDoItem', () => {
  it('casam ignorando caixa e espaço nas pontas (mesma normalização dos dois lados)', () => {
    const wbs: WBSGroup[] = [
      { id: '01', name: '  FUNDAÇÕES ', phases: [{ id: '01.01', name: 'Estacas', subPhases: ['Hélice'] }] },
    ];
    expect(caminhosDaWbs(wbs).has(caminhoDoItem(item('r', 'fundações', 'ESTACAS', ' hélice ')))).toBe(true);
  });
});
