// utils/opuraCostCenterTree.ts
//
// ÒPURA · Relatórios › dimensão "Centro de Custo": põe ao lado de cada linha
// plana da fn_opura_pivot (uma por cost_center_id) o GRUPO a que o centro
// pertence na hierarquia de Organização › Centro de Custo
// (cost_centers_v2.parent_id; grupo = raiz, parent_id nulo). A tela mostra
// Grupo e Centro de custo em colunas separadas e agrupa pelo grupo (§6.12).
// Até 13/11/2026 isto montava uma árvore numa coluna só — ver
// docs/planos/2026-11-13-relatorios-centro-de-custo-colunas-agrupar.md.
// Puro — sem Supabase — para ser testável.

export interface CostCenterCatalogItem {
    id: string;
    parent_id?: string | null;
    code?: string | null;
    name: string;
}

/** Subconjunto de OpuraPivotRow que a lista precisa. */
export interface CostCenterPivotRow {
    dimension_key: string | null;
    dimension_label: string;
    qtd: number;
    realizado: number;
    previsto: number;
    vencido: number;
}

export interface CostCenterRow {
    /** cost_center_id, ou null para "— Sem centro de custo". */
    key: string | null;
    code: string | null;
    name: string;
    /** Grupo (raiz da hierarquia) — null quando o centro está fora do catálogo ou não há centro. */
    groupId: string | null;
    groupCode: string | null;
    groupName: string | null;
    /**
     * Lançamento gravado direto no grupo (legado: desde 09/11/2026 o banco
     * barra — trg_cc_bloquear_lancamento_em_grupo). A linha mostra o grupo e
     * "(lançado no grupo)" no lugar do centro.
     */
    synthetic: boolean;
    qtd: number;
    realizado: number;
    previsto: number;
    vencido: number;
}

export const SEM_CENTRO_LABEL = '— Sem centro de custo';
export const LANCADO_NO_GRUPO_LABEL = '(lançado no grupo)';
export const SEM_GRUPO_LABEL = 'Sem grupo';

/** Texto do grupo como a célula e o cabeçalho do "Agrupar" mostram: "006 Condomínios". */
export function rotuloDoGrupo(r: Pick<CostCenterRow, 'groupCode' | 'groupName'>): string | null {
    if (!r.groupName) return null;
    return r.groupCode ? `${r.groupCode} ${r.groupName}` : r.groupName;
}

function porCodigo(a: string | null, b: string | null): number {
    if ((a === null) !== (b === null)) return a === null ? 1 : -1;
    return (a ?? '').localeCompare(b ?? '', 'pt-BR', { numeric: true });
}

/**
 * Linhas planas na ordem do cadastro: grupo por código, e dentro dele o
 * "(lançado no grupo)" primeiro e os centros por código. Sem grupo (fora do
 * catálogo) depois; "— Sem centro de custo" sempre por último. Centros sem
 * lançamento no período não aparecem — é relatório do período, não o cadastro.
 */
export function buildCostCenterRows(
    rows: CostCenterPivotRow[],
    catalog: CostCenterCatalogItem[],
): CostCenterRow[] {
    const byId = new Map(catalog.map(c => [c.id, c]));

    /** Raiz da hierarquia (defensivo contra ciclo e pai fora do catálogo). */
    const raizDe = (c: CostCenterCatalogItem): CostCenterCatalogItem => {
        const vistos = new Set<string>([c.id]);
        let atual = c;
        while (atual.parent_id && byId.has(atual.parent_id) && !vistos.has(atual.parent_id)) {
            vistos.add(atual.parent_id);
            atual = byId.get(atual.parent_id)!;
        }
        return atual;
    };

    // Uma linha por centro (a RPC já devolve uma; somar protege de repetição).
    const porChave = new Map<string, CostCenterRow>();
    for (const r of rows) {
        const id = r.dimension_key;
        const mapKey = id ?? '__sem__';
        const existente = porChave.get(mapKey);
        if (existente) {
            existente.qtd += r.qtd;
            existente.realizado += r.realizado;
            existente.previsto += r.previsto;
            existente.vencido += r.vencido;
            continue;
        }
        const totais = { qtd: r.qtd, realizado: r.realizado, previsto: r.previsto, vencido: r.vencido };
        const c = id ? byId.get(id) : undefined;
        if (!id || !c) {
            porChave.set(mapKey, {
                key: id, code: null, name: id ? r.dimension_label : SEM_CENTRO_LABEL,
                groupId: null, groupCode: null, groupName: null, synthetic: false, ...totais,
            });
            continue;
        }
        const raiz = raizDe(c);
        const ehGrupo = raiz.id === c.id;
        porChave.set(mapKey, {
            key: id,
            code: ehGrupo ? null : c.code ?? null,
            name: ehGrupo ? LANCADO_NO_GRUPO_LABEL : c.name,
            groupId: raiz.id,
            groupCode: raiz.code ?? null,
            groupName: raiz.name,
            synthetic: ehGrupo,
            ...totais,
        });
    }

    return [...porChave.values()].sort((a, b) => {
        // "— Sem centro de custo" sempre por último; sem grupo logo antes.
        if ((a.key === null) !== (b.key === null)) return a.key === null ? 1 : -1;
        if ((a.groupId === null) !== (b.groupId === null)) return a.groupId === null ? 1 : -1;
        const g = porCodigo(a.groupCode, b.groupCode) || (a.groupName ?? '').localeCompare(b.groupName ?? '', 'pt-BR');
        if (g !== 0) return g;
        if (a.synthetic !== b.synthetic) return a.synthetic ? -1 : 1;
        return porCodigo(a.code, b.code) || a.name.localeCompare(b.name, 'pt-BR');
    });
}
