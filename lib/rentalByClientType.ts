/**
 * Análise de Locações recortada por TIPO DE CLIENTE (`clients.category`) —
 * pura, sem I/O. Segundo eixo de partição da aba Análise, ao lado de
 * `rentalByEmpreendimento.ts` — cliente não pertence a um único
 * empreendimento, então este agrupamento vive em arquivo/tabela próprios,
 * não como coluna da tabela "Por empreendimento".
 *
 * Mesmo princípio do arquivo irmão: **uma consulta, muitos baldes** — os
 * negócios de locação já carregados pela aba Análise são reparticionados
 * aqui por categoria do cliente, sem chamada extra ao banco.
 *
 * `null` é "não medido", nunca zero — mesma regra transversal do módulo.
 */

import { getDealInstallmentValue } from './rentalPortfolio';
import { type AnalysisDeal, type AnalysisProperty, dealArea } from './rentalByEmpreendimento';

/** Id do balde de cliente sem categoria — existe pela mesma razão de
 *  `SEM_EMPREENDIMENTO`: sem ele, a soma das linhas não fecha com o total. */
export const SEM_CATEGORIA = '__sem_categoria__';

export const SEM_CATEGORIA_LABEL = 'Sem categoria';

export interface AnalysisClient {
    id: string;
    category?: string | null;
}

export interface RentalClientTypeScope {
    categoryId: string;
    label: string;
    /** Clientes distintos com ao menos um contrato fechado no grupo. */
    clientCount: number;
    /** Média de `getDealInstallmentValue()` dos contratos do grupo. */
    avgRentalValue: number;
    /** Média de (parcela ÷ área privativa) dos contratos do grupo que tinham
     *  área válida. `null` = nenhum contrato do grupo tinha área — não é 0. */
    avgValuePerSqm: number | null;
}

export interface GroupRentalByClientTypeInput {
    deals: AnalysisDeal[];
    properties: AnalysisProperty[];
    clients: AnalysisClient[];
}

const key = (id: string | null | undefined): string => String(id ?? '').toLowerCase();

interface Bucket {
    categoryId: string;
    label: string;
    clientIds: Set<string>;
    deals: AnalysisDeal[];
}

/**
 * Agrupa os negócios de locação FECHADOS por categoria do cliente.
 *
 * Mesma população de `groupRentalAnalysis`: `type === 'RENTAL' && status ===
 * 'COMPLETED'` — a base de "Receita mensal"/"Valor médio de locação" tem que
 * ser a mesma em toda a aba, senão duas tabelas vizinhas medem coisas
 * diferentes com o mesmo nome.
 */
export const groupRentalByClientType = (
    input: GroupRentalByClientTypeInput,
): { rows: RentalClientTypeScope[]; total: RentalClientTypeScope } => {
    const { deals, properties, clients } = input;

    const propsById = new Map(properties.map(p => [key(p.id), p]));
    const clientsById = new Map(clients.map(c => [key(c.id), c]));

    const baldes = new Map<string, Bucket>();
    const balde = (categoryId: string, label: string): Bucket => {
        const existente = baldes.get(categoryId);
        if (existente) return existente;
        const novo: Bucket = { categoryId, label, clientIds: new Set(), deals: [] };
        baldes.set(categoryId, novo);
        return novo;
    };

    for (const d of deals) {
        if (d.type !== 'RENTAL' || d.status !== 'COMPLETED') continue;
        const cliente = d.client_id ? clientsById.get(key(d.client_id)) : undefined;
        const categoria = cliente?.category?.trim();
        const b = categoria
            ? balde(categoria, categoria)
            : balde(SEM_CATEGORIA, SEM_CATEGORIA_LABEL);
        b.deals.push(d);
        if (d.client_id) b.clientIds.add(key(d.client_id));
    }

    const escopoDe = (b: Bucket): RentalClientTypeScope => {
        const valores = b.deals.map(d => getDealInstallmentValue(d));
        const avgRentalValue = valores.length > 0
            ? valores.reduce((a, v) => a + v, 0) / valores.length
            : 0;

        const valoresM2 = b.deals
            .map(d => ({ area: dealArea(d, propsById), valor: getDealInstallmentValue(d) }))
            .filter(x => x.area > 0)
            .map(x => x.valor / x.area);
        const avgValuePerSqm = valoresM2.length > 0
            ? valoresM2.reduce((a, v) => a + v, 0) / valoresM2.length
            : null;

        return {
            categoryId: b.categoryId,
            label: b.label,
            clientCount: b.clientIds.size,
            avgRentalValue,
            avgValuePerSqm,
        };
    };

    const totalBucket: Bucket = { categoryId: 'ALL', label: 'Todos os tipos', clientIds: new Set(), deals: [] };
    for (const b of baldes.values()) {
        b.deals.forEach(d => totalBucket.deals.push(d));
        b.clientIds.forEach(id => totalBucket.clientIds.add(id));
    }

    const rows = [...baldes.values()]
        .map(escopoDe)
        // "Sem categoria" por último — é resíduo de cadastro, não um tipo
        // concorrendo com os demais na leitura (mesmo critério de
        // SEM_EMPREENDIMENTO em rentalByEmpreendimento.ts).
        .sort((a, b) => {
            if (a.categoryId === SEM_CATEGORIA) return 1;
            if (b.categoryId === SEM_CATEGORIA) return -1;
            return b.clientCount - a.clientCount;
        });

    return { rows, total: escopoDe(totalBucket) };
};
