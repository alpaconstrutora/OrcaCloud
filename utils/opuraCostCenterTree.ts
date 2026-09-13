// utils/opuraCostCenterTree.ts
//
// ÒPURA · Relatórios › dimensão "Centro de Custo": organiza as linhas planas
// da fn_opura_pivot (uma por cost_center_id) na MESMA hierarquia da tela
// Organização › Centro de Custo (cost_centers_v2.parent_id): linha do grupo
// com os totais somados e os centros filhos embaixo, ordenados por código.
// Puro — sem Supabase — para ser testável.

export interface CostCenterCatalogItem {
    id: string;
    parent_id?: string | null;
    code?: string | null;
    name: string;
}

/** Subconjunto de OpuraPivotRow que a árvore precisa. */
export interface CostCenterPivotRow {
    dimension_key: string | null;
    dimension_label: string;
    qtd: number;
    realizado: number;
    previsto: number;
    vencido: number;
}

export interface CostCenterTotals {
    qtd: number;
    realizado: number;
    previsto: number;
    vencido: number;
}

export interface CostCenterTreeNode {
    /** cost_center_id, ou null para "— Sem centro de custo". */
    key: string | null;
    code: string | null;
    name: string;
    /** 0 = raiz (grupo ou centro solto), 1 = filho, ... */
    depth: number;
    /** Totais do próprio centro + de todos os descendentes. */
    totals: CostCenterTotals;
    /** Lançamentos gravados diretamente neste centro (null quando não há). */
    own: CostCenterTotals | null;
    children: CostCenterTreeNode[];
    /**
     * Nó sintético "lançado no grupo": aparece como filho quando um grupo
     * tem filhos com dados E lançamentos diretos — para o total do grupo
     * bater com a soma do que está listado embaixo dele.
     */
    synthetic?: boolean;
}

const ZERO: CostCenterTotals = { qtd: 0, realizado: 0, previsto: 0, vencido: 0 };

function add(a: CostCenterTotals, b: CostCenterTotals): CostCenterTotals {
    return {
        qtd: a.qtd + b.qtd,
        realizado: a.realizado + b.realizado,
        previsto: a.previsto + b.previsto,
        vencido: a.vencido + b.vencido,
    };
}

function totalsOf(r: CostCenterPivotRow): CostCenterTotals {
    return { qtd: r.qtd, realizado: r.realizado, previsto: r.previsto, vencido: r.vencido };
}

function byCode(a: CostCenterTreeNode, b: CostCenterTreeNode): number {
    // "— Sem centro de custo" (key null) sempre por último.
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    // Sem código (fora do catálogo / sintético) vai depois dos cadastrados.
    if ((a.code === null) !== (b.code === null)) return a.code === null ? 1 : -1;
    const ca = a.code ?? '', cb = b.code ?? '';
    if (ca !== cb) return ca.localeCompare(cb, 'pt-BR', { numeric: true });
    return a.name.localeCompare(b.name, 'pt-BR');
}

export const SEM_CENTRO_LABEL = '— Sem centro de custo';
export const LANCADO_NO_GRUPO_LABEL = '(lançado no grupo)';

/**
 * Monta a árvore. Grupos sem nenhum lançamento (nem próprio nem nos filhos)
 * ficam de fora — é relatório do período, não o cadastro. Centro cujo id não
 * está no catálogo (excluído, ou de outra org quando o seletor está em uma
 * org só) vira raiz solta com o rótulo que a RPC devolveu.
 */
export function buildCostCenterTree(
    rows: CostCenterPivotRow[],
    catalog: CostCenterCatalogItem[],
): CostCenterTreeNode[] {
    const byId = new Map(catalog.map(c => [c.id, c]));
    const ownById = new Map<string, CostCenterTotals>();
    let semCentro: CostCenterTotals | null = null;
    const soltos: CostCenterTreeNode[] = [];

    for (const r of rows) {
        if (!r.dimension_key) {
            semCentro = add(semCentro ?? ZERO, totalsOf(r));
            continue;
        }
        if (!byId.has(r.dimension_key)) {
            soltos.push({
                key: r.dimension_key, code: null, name: r.dimension_label, depth: 0,
                totals: totalsOf(r), own: totalsOf(r), children: [],
            });
            continue;
        }
        ownById.set(r.dimension_key, add(ownById.get(r.dimension_key) ?? ZERO, totalsOf(r)));
    }

    const childrenOf = new Map<string | null, CostCenterCatalogItem[]>();
    for (const c of catalog) {
        const parent = c.parent_id && byId.has(c.parent_id) ? c.parent_id : null;
        const list = childrenOf.get(parent) ?? [];
        list.push(c);
        childrenOf.set(parent, list);
    }

    const visit = (c: CostCenterCatalogItem, depth: number, seen: Set<string>): CostCenterTreeNode | null => {
        if (seen.has(c.id)) return null; // ciclo defensivo
        seen.add(c.id);
        const own = ownById.get(c.id) ?? null;
        const children: CostCenterTreeNode[] = [];
        for (const child of childrenOf.get(c.id) ?? []) {
            const node = visit(child, depth + 1, seen);
            if (node) children.push(node);
        }
        if (!own && children.length === 0) return null;
        children.sort(byCode);
        if (own && children.length > 0) {
            children.unshift({
                key: c.id, code: null, name: LANCADO_NO_GRUPO_LABEL, depth: depth + 1,
                totals: own, own, children: [], synthetic: true,
            });
        }
        const totals = children.reduce((acc, n) => add(acc, n.totals), own && children.length === 0 ? own : ZERO);
        return { key: c.id, code: c.code ?? null, name: c.name, depth, totals, own, children };
    };

    const roots: CostCenterTreeNode[] = [];
    const seen = new Set<string>();
    for (const c of childrenOf.get(null) ?? []) {
        const node = visit(c, 0, seen);
        if (node) roots.push(node);
    }
    roots.push(...soltos);
    if (semCentro) {
        roots.push({ key: null, code: null, name: SEM_CENTRO_LABEL, depth: 0, totals: semCentro, own: semCentro, children: [] });
    }
    roots.sort(byCode);
    return roots;
}

/** Achata a árvore respeitando o conjunto de grupos expandidos. */
export function flattenCostCenterTree(
    nodes: CostCenterTreeNode[],
    expanded: ReadonlySet<string>,
): CostCenterTreeNode[] {
    const out: CostCenterTreeNode[] = [];
    const walk = (list: CostCenterTreeNode[]) => {
        for (const n of list) {
            out.push(n);
            if (n.children.length > 0 && n.key !== null && expanded.has(n.key)) walk(n.children);
        }
    };
    walk(nodes);
    return out;
}
