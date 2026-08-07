/**
 * Matemática da carteira de locação — pura, sem I/O.
 *
 * Existe porque os mesmos dois KPIs (patrimônio e receita mensal) eram
 * calculados em DOIS lugares — a aba Análise (`components/RentalsModule.tsx`) e
 * o painel Resultados (`services/rentalsDashboardService.ts`) — cada um com sua
 * cópia da conta, e as duas cópias carregavam o mesmo par de erros. Enquanto a
 * fórmula morar no ponto de uso, a próxima tela nasce divergente. Aqui ela é
 * única e testável (`__tests__/rentalPortfolio.test.ts`).
 */

export interface PortfolioNode {
    id: string;
    parent_id?: string | null;
}

export interface MonthlyDeal {
    value?: number | null;
    installment_value?: number | null;
}

/**
 * IDs que são PAI de alguém na lista — na prática, edifícios com unidades
 * cadastradas. Comparação em minúsculas porque o resto do módulo já trata
 * `parent_id` como potencialmente divergente no caixa (ver os `String(...)
 * .toLowerCase()` de RentalsModule).
 */
const parentIdSet = (nodes: PortfolioNode[]): Set<string> =>
    new Set(
        nodes
            .map(n => n.parent_id)
            .filter((id): id is string => !!id)
            .map(id => String(id).toLowerCase())
    );

/**
 * Um nó é folha quando ninguém o declara como pai.
 */
export const isLeafNode = (node: PortfolioNode, parents: Set<string>): boolean =>
    !parents.has(String(node.id).toLowerCase());

/**
 * As folhas da carteira — a unidade de conta do módulo.
 *
 * Um edifício vale (e é ocupado por) suas unidades: com as unidades
 * cadastradas, quem conta são elas e o edifício fica de fora — senão o
 * patrimônio conta em dobro. Edifício SEM unidade cadastrada é ele próprio uma
 * folha: um galpão locado inteiro é uma unidade locável (decisão do usuário em
 * 2026-08-06). Imóvel avulso idem.
 */
export const leafNodes = <T extends PortfolioNode>(nodes: T[]): T[] => {
    const parents = parentIdSet(nodes);
    return nodes.filter(node => isLeafNode(node, parents));
};

/**
 * Soma `valueOf` contando cada imóvel UMA vez (ver `leafNodes`).
 */
export const sumOverLeaves = <T extends PortfolioNode>(
    nodes: T[],
    valueOf: (node: T) => number
): number =>
    leafNodes(nodes).reduce((acc, node) => acc + (Number(valueOf(node)) || 0), 0);

/**
 * Parcela mensal efetivamente CONTRATADA do negócio.
 *
 * `value` é a soma das unidades — no aluguel ela é só o valor mensal SUGERIDO
 * pela Inteligência de Aluguéis (preço de tabela). Quem carrega o valor fechado
 * é `installment_value`. Trocar um pelo outro faz o KPI de receita mostrar
 * tabela em vez de receita, e contamina qualquer yield calculado em cima.
 * Contrato legado, anterior ao campo, cai no `value`.
 */
export const getDealInstallmentValue = (deal: MonthlyDeal): number =>
    deal.installment_value != null
        ? (Number(deal.installment_value) || 0)
        : (Number(deal.value) || 0);
