/**
 * Pipeline de parcelas comerciais e rentabilidade por imóvel.
 *
 * Extraído de `ProjectFinancialManager.tsx` (Fase 1 de
 * `PLANO_RENTABILIDADE_COMERCIAL.md`). São funções PURAS de propósito: recebem
 * as fontes por parâmetro, não conhecem React nem Supabase, e por isso podem
 * ser comparadas byte a byte com a versão legada antes de qualquer mudança de
 * comportamento.
 *
 * ⚠️ Esta fase é CÓPIA LITERAL da lógica que estava inline, heurísticas
 * discutíveis incluídas (casamento de imóvel por nome, inferência de dealType
 * pela descrição, chaves de fallback divergentes). Os defeitos conhecidos estão
 * catalogados na Fase 3 do plano e marcados com `DEFEITO 3.x` abaixo — NÃO
 * corrigir aqui: refactor e correção no mesmo commit tornam impossível saber
 * qual dos dois mudou o número.
 *
 * O modo (`COMERCIAL` × `OBRA`) vem por parâmetro porque quem compara nome de
 * projeto de sistema é o chamador — ver REGRA OBRIGATÓRIA #2 no CLAUDE.md e
 * `utils/systemProjects.ts`.
 */
import type {
    PaymentInstallment,
    FinancialTransaction,
    FinancialInfo,
} from '../types/financial';

export type DealTypeFilter = 'ALL' | 'SALE' | 'RENTAL';

export type CommercialInstallment = PaymentInstallment & {
    isCommercial?: boolean;
    sourceProjectId?: string;
};

export type CommercialTransaction = FinancialTransaction & {
    propertyId?: string;
    propertyName?: string;
};

export interface SatelliteSource {
    id: string;
    settings: { financialInfo?: FinancialInfo };
}

export interface MergeInstallmentsInput {
    /** `financialInfo.installments` do projeto aberto. */
    local: PaymentInstallment[];
    /** Parcelas do projeto vinculado (`linkedProjectId`). */
    linked: PaymentInstallment[];
    /** Projetos satélites — só entram no modo COMERCIAL. */
    satellites: SatelliteSource[];
    /** Vault comercial, quando existir. `null` quando não carregado. */
    commercialVault: { id: string; installments: CommercialInstallment[] } | null;
    /**
     * COMERCIAL = a tela é o vault consolidado (agrega satélites + dedup).
     * OBRA = a tela é um projeto; puxa do vault só o que casa com o escopo.
     */
    mode: 'COMERCIAL' | 'OBRA';
    /**
     * No modo OBRA, se deve casar parcelas do vault com este escopo. O chamador
     * decide (era `settings.name !== 'Acompanhamento de Obras'`).
     */
    matchVaultToScope: boolean;
    scope: { projectId?: string; projectName: string };
    dealTypeFilter: DealTypeFilter;
}

export interface PropertyProfitability {
    id: string;
    name: string;
    revenue: number;
    expense: number;
    netRevenue: number;
    margin: number;
}

/**
 * Funde as cinco fontes de parcela numa lista só, na ordem e com as regras que
 * a tela usava. Ordem importa: a deduplicação do modo COMERCIAL mantém a
 * PRIMEIRA ocorrência, então local > linked > satélites.
 */
export function mergeInstallments(input: MergeInstallmentsInput): CommercialInstallment[] {
    const { local, linked, satellites, commercialVault, mode, matchVaultToScope, scope, dealTypeFilter } = input;

    let list: CommercialInstallment[] = [...(local || []), ...(linked || [])];

    if (mode === 'COMERCIAL') {
        satellites.forEach(sat => {
            const satInstallments = (sat.settings?.financialInfo?.installments || [])
                .map((i: PaymentInstallment) => ({ ...i, isCommercial: true, sourceProjectId: sat.id }));
            list.push(...satInstallments);
        });

        // Deduplicação por ID para não mostrar a mesma parcela vinda de dois lugares.
        const seenIds = new Set<string>();
        list = list.filter(i => {
            const id = i.id || `${i.description}-${i.value}-${i.dueDate}`;
            if (seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
        });
    }

    // Projeto comum: inclui parcelas do vault comercial que referenciam este imóvel.
    if (commercialVault && mode === 'OBRA' && matchVaultToScope) {
        const comm = commercialVault.installments || [];
        const sName = (scope.projectName || '').toLowerCase().trim();
        const workingId = scope.projectId;

        const linkedFromComm = comm.filter(i => {
            const isIdMatch = !!workingId && (i.linkedProjectId === workingId || i.propertyId === workingId);
            const pName = (i.propertyName || '').toLowerCase().trim();
            /* RISCO conhecido (plano, Riscos): `includes` bidirecional une
               imóveis de nomes parecidos ("Torre A" × "Torre A2"). Preservado. */
            const isNameMatch = sName !== '' && (pName === sName || pName.includes(sName) || sName.includes(pName));
            return isIdMatch || isNameMatch;
        }).map(i => ({ ...i, isCommercial: true, sourceProjectId: commercialVault.id }));

        list.push(...linkedFromComm);
    }

    if (dealTypeFilter !== 'ALL') {
        list = list.filter(i => {
            if (i.dealType) return i.dealType === dealTypeFilter;
            /* RISCO conhecido: sem `dealType`, infere pela descrição. "parcela"
               cai em SALE, o que é chute. Preservado nesta fase. */
            const desc = (i.description || '').toLowerCase();
            if (dealTypeFilter === 'SALE') return desc.includes('venda') || desc.includes('entrada') || desc.includes('balão') || desc.includes('intermediária') || desc.includes('parcela');
            if (dealTypeFilter === 'RENTAL') return desc.includes('aluguel') || desc.includes('locação') || desc.includes('condomínio') || desc.includes('iptu');
            return true;
        });
    }

    return list;
}

/**
 * Rentabilidade agrupada por IMÓVEL (não por obra — é carteira comercial).
 * Receita conta só parcela `PAID`; custo conta despesa não cancelada.
 */
export function computeProfitabilityByProperty(
    installments: CommercialInstallment[],
    transactions: CommercialTransaction[],
): PropertyProfitability[] {
    const properties: Record<string, { id: string; name: string; revenue: number; expense: number }> = {};

    installments.forEach(i => {
        /* DEFEITO 3.1 (plano): fallback 'Indefinido' aqui × 'Geral' nas
           despesas — parcela sem imóvel e despesa sem imóvel caem em linhas
           DIFERENTES. Preservado nesta fase. */
        const key = i.propertyId || i.propertyName || 'Indefinido';
        if (!properties[key]) properties[key] = { id: i.propertyId || '', name: i.propertyName || 'Indefinido', revenue: 0, expense: 0 };
        if (i.status === 'PAID') properties[key].revenue += i.value;
    });

    transactions.forEach(t => {
        if (t.type !== 'EXPENSE' || t.status === 'CANCELLED') return;
        const key = t.propertyId || t.propertyName || 'Geral';
        if (!properties[key]) properties[key] = { id: t.propertyId || '', name: t.propertyName || 'Geral', revenue: 0, expense: 0 };
        properties[key].expense += t.value;
    });

    return Object.values(properties).map(p => {
        /* DEFEITO 3.2 (plano): com `p.id === ''`, a comparação `i.propertyId
           === p.id` casa TODAS as parcelas sem propertyId, de qualquer imóvel —
           a receita líquida de uma linha absorve comissão de outra. Preservado. */
        const netRevenue = installments
            .filter(i => (i.propertyId === p.id || i.propertyName === p.name) && i.status === 'PAID')
            .reduce((s, i) => {
                const comm = (i.value * (i.commissionRate || 0)) / 100;
                return s + (i.value - comm);
            }, 0);

        /* DEFEITO 3.3 (plano): denominador é a receita LÍQUIDA, enquanto o KPI
           "Rentabilidade" do Resumo usa a BRUTA. Dois números, mesmo rótulo. */
        return {
            ...p,
            netRevenue,
            margin: netRevenue > 0 ? ((netRevenue - p.expense) / netRevenue) * 100 : 0,
        };
    }).sort((a, b) => b.revenue - a.revenue);
}
