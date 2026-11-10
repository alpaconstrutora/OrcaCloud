/**
 * NOI (Receita Operacional Líquida) por imóvel — puro, sem I/O.
 *
 * É o indicador que separa "quanto FATURA" de "quanto RENDE". Só passou a ser
 * calculável com a Fase 2 do plano docs/planos/2026-08-06-kpis-locacao-primitivas.md,
 * que criou a dimensão imóvel na despesa — antes dela, todo o bloco de
 * rentabilidade do catálogo (NOI, margem, cap rate, yield líquido) era
 * inalcançável, e só dava para mostrar rental yield BRUTO.
 */

import { allocateProrated } from './rentalAllocation';

export interface NoiNode {
    id: string;
    parent_id?: string | null;
}

export interface NoiResult {
    propertyId: string;
    /** Receita do próprio nó (aluguel contratado das unidades dele). */
    ownRevenue: number;
    /** Despesa apropriada ao próprio nó (direta ou parcela do rateio). */
    ownExpense: number;
    /** Receita do nó + de toda a subárvore. */
    revenue: number;
    expense: number;
    noi: number;
    /** NOI ÷ receita. `null` quando não há receita — não é zero, é indefinido. */
    margin: number | null;
}

const key = (id: string | null | undefined): string => String(id ?? '').toLowerCase();

/**
 * NOI de cada imóvel, com rollup da subárvore.
 *
 *     noi(nó) = receita(nó) − despesa(nó) + Σ noi(filhos)
 *
 * O nó contribui com o que é dele MAIS o resultado dos filhos. Assim o edifício
 * soma o NOI das unidades e ainda carrega a despesa que ficou nele (a que o
 * usuário escolheu NÃO ratear) — sem dupla contagem, porque a despesa rateada
 * já desceu para as unidades como parcela própria de cada uma.
 *
 * Nó cujo `parent_id` aponta para fora da lista carregada é tratado como raiz,
 * pela mesma razão do `sumPortfolioValue`: consulta filtrada por edifício traz
 * só as filhas, e elas não podem sumir da conta.
 */
export const computeNoi = (
    nodes: NoiNode[],
    revenueByProperty: Map<string, number>,
    expenseByProperty: Map<string, number>
): Map<string, NoiResult> => {
    const present = new Set(nodes.map(n => key(n.id)));
    const childrenOf = new Map<string, NoiNode[]>();

    for (const node of nodes) {
        const parent = key(node.parent_id);
        if (parent && present.has(parent) && parent !== key(node.id)) {
            const list = childrenOf.get(parent);
            if (list) list.push(node);
            else childrenOf.set(parent, [node]);
        }
    }

    const results = new Map<string, NoiResult>();
    const visiting = new Set<string>();   // trava contra `parent_id` circular

    const visit = (node: NoiNode): NoiResult => {
        const id = key(node.id);
        const cached = results.get(node.id);
        if (cached) return cached;
        if (visiting.has(id)) {
            return { propertyId: node.id, ownRevenue: 0, ownExpense: 0, revenue: 0, expense: 0, noi: 0, margin: null };
        }
        visiting.add(id);

        const ownRevenue = Number(revenueByProperty.get(node.id) ?? 0) || 0;
        const ownExpense = Number(expenseByProperty.get(node.id) ?? 0) || 0;

        let revenue = ownRevenue;
        let expense = ownExpense;
        for (const child of childrenOf.get(id) ?? []) {
            const childResult = visit(child);
            revenue += childResult.revenue;
            expense += childResult.expense;
        }

        const noi = revenue - expense;
        const result: NoiResult = {
            propertyId: node.id,
            ownRevenue,
            ownExpense,
            revenue,
            expense,
            noi,
            // Margem sobre receita zero é indefinida, não 0% nem 100%. Devolver
            // um número aqui faria a tela afirmar algo que a conta não sustenta.
            margin: revenue > 0 ? noi / revenue : null,
        };

        visiting.delete(id);
        results.set(node.id, result);
        return result;
    };

    for (const node of nodes) visit(node);
    return results;
};

/**
 * NOI consolidado da carteira: soma só as RAÍZES, senão o resultado das
 * unidades entraria de novo pelo edifício.
 */
export const portfolioNoi = (
    nodes: NoiNode[],
    results: Map<string, NoiResult>
): { revenue: number; expense: number; noi: number; margin: number | null } => {
    const present = new Set(nodes.map(n => key(n.id)));
    const roots = nodes.filter(n => {
        const parent = key(n.parent_id);
        return !parent || !present.has(parent) || parent === key(n.id);
    });

    let revenue = 0;
    let expense = 0;
    for (const root of roots) {
        const result = results.get(root.id);
        if (!result) continue;
        revenue += result.revenue;
        expense += result.expense;
    }

    const noi = revenue - expense;
    return { revenue, expense, noi, margin: revenue > 0 ? noi / revenue : null };
};

/**
 * Cap rate anualizado: NOI de 12 meses ÷ valor de mercado.
 * `null` sem patrimônio — dividir por zero aqui devolveria Infinity e a tela
 * mostraria um cap rate absurdo em vez de admitir que falta o dado.
 */
export const capRate = (annualNoi: number, marketValue: number): number | null =>
    marketValue > 0 ? annualNoi / marketValue : null;

/** Imóvel da carteira com o vínculo ao empreendimento e a área (base do rateio). */
export interface ImovelDoEmpreendimento {
    id: string;
    empreendimentoId: string;
    /** true = edifício-pai do empreendimento, não uma unidade. */
    isBuilding?: boolean;
    private_area?: number | null;
    area?: number | null;
}

/**
 * Despesa por imóvel a partir da despesa por EMPREENDIMENTO (a que vem do
 * Centro de Custo do lançamento — plano docs/planos/2026-11-10-noi-despesa-pelo-centro-de-custo.md).
 *
 * - Edifício do empreendimento na carteira: a despesa vai inteira para ele, e o
 *   rollup de `computeNoi` a leva junto com as unidades.
 * - Sem edifício: rateio entre os imóveis do empreendimento pela área
 *   privativa (igual, sem área) — o mesmo `allocateProrated` da apropriação.
 * - Empreendimento sem imóvel na carteira: fica fora (não há NOI para ela).
 */
export const expenseByPropertyFromEmpreendimentos = (
    expenseByEmpreendimento: Map<string, number>,
    imoveis: ImovelDoEmpreendimento[],
): Map<string, number> => {
    const porEmp = new Map<string, ImovelDoEmpreendimento[]>();
    for (const imovel of imoveis) {
        const lista = porEmp.get(imovel.empreendimentoId);
        if (lista) lista.push(imovel); else porEmp.set(imovel.empreendimentoId, [imovel]);
    }

    const out = new Map<string, number>();
    const somar = (id: string, valor: number) => out.set(id, (out.get(id) ?? 0) + valor);

    for (const [empId, total] of expenseByEmpreendimento) {
        const doEmp = porEmp.get(empId) ?? [];
        if (doEmp.length === 0 || !total) continue;
        const edificio = doEmp.find(i => i.isBuilding);
        if (edificio) { somar(edificio.id, total); continue; }
        for (const a of allocateProrated(doEmp, total).allocations) somar(a.property_id, a.amount);
    }
    return out;
};
