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

const key = (id: string | null | undefined): string => String(id ?? '').toLowerCase();

/**
 * Valor da carteira contando cada imóvel UMA vez — por ROLLUP, não por folha.
 *
 * Um nó vale **a soma dos filhos quando os filhos têm valor**; caso contrário
 * vale o próprio preço. É o que resolve os dois lados do problema:
 *
 * - edifício com unidades precificadas → somam as unidades, e o edifício fica
 *   de fora (senão contaria em dobro — era o defeito original);
 * - **edifício cujas unidades estão sem preço → vale o preço do próprio
 *   edifício.** Em carteira de locação isso é o caso comum: a unidade carrega
 *   `rental_price` (o aluguel) e deixa `price` vazio, porque quem tem valor
 *   patrimonial é o prédio. A coluna "Patrimônio" da lista mostra exatamente
 *   esse `price` do edifício.
 * - edifício sem unidade cadastrada, e imóvel avulso → o próprio preço.
 *
 * Uma versão anterior somava só as folhas e zerava a carteira inteira no
 * segundo caso. Nó cujo `parent_id` aponta para fora da lista carregada conta
 * como raiz — senão sumiria da conta quando a consulta traz só as unidades de
 * um edifício.
 */
export const sumPortfolioValue = <T extends PortfolioNode>(
    nodes: T[],
    valueOf: (node: T) => number
): number => {
    const present = new Set(nodes.map(n => key(n.id)));
    const childrenOf = new Map<string, T[]>();
    const roots: T[] = [];

    for (const node of nodes) {
        const parent = key(node.parent_id);
        if (parent && present.has(parent) && parent !== key(node.id)) {
            const siblings = childrenOf.get(parent);
            if (siblings) siblings.push(node);
            else childrenOf.set(parent, [node]);
        } else {
            roots.push(node);
        }
    }

    // `seen` protege contra ciclo em `parent_id` mal formado, que travaria a UI.
    const seen = new Set<string>();
    const valueOfNode = (node: T): number => {
        const id = key(node.id);
        if (seen.has(id)) return 0;
        seen.add(id);
        const children = childrenOf.get(id) ?? [];
        const fromChildren = children.reduce((acc, child) => acc + valueOfNode(child), 0);
        return fromChildren > 0 ? fromChildren : (Number(valueOf(node)) || 0);
    };

    return roots.reduce((acc, root) => acc + valueOfNode(root), 0);
};

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
