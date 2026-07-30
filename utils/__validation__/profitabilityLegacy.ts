/**
 * ⚠️ HARNESS TEMPORÁRIO — APAGAR APÓS O PORTÃO DA FASE 2.
 *
 * Cópia do pipeline de parcelas/rentabilidade como ele existia ANTES da
 * extração, tirada do commit `ba3df7d` (`ProjectFinancialManager.tsx`, blocos
 * `displayInstallments` e `profitabilityByProperty`). Serve só para o
 * `ProfitabilityDiffPanel` comparar o legado contra
 * `utils/commercialInstallments.ts` com dado real.
 *
 * Diferença deliberada em relação ao original: os três `console.log` de
 * depuração foram omitidos — eles imprimiam, não alteravam o resultado (um
 * deles vazava nome de cliente no DevTools).
 *
 * De propósito, esta função recebe as variáveis CRUAS do componente
 * (`settings`, `commercialProject`, `satelliteProjects`...) em vez de `mode` /
 * `matchVaultToScope`. É exatamente essa tradução — feita à mão na Fase 1 — que
 * o painel precisa provar correta. Comparar duas cópias da mesma lógica não
 * provaria nada.
 *
 * Por conter comparação literal com nome de projeto de sistema, este caminho
 * está na allowlist de `scripts/check-system-projects.sh` enquanto existir.
 * Ver PLANO_RENTABILIDADE_COMERCIAL.md, Fase 2.
 */
import type { PaymentInstallment, FinancialInfo } from '../../types/financial';
import type {
    CommercialInstallment,
    CommercialTransaction,
    DealTypeFilter,
    PropertyProfitability,
    SatelliteSource,
} from '../commercialInstallments';

export interface LegacyInput {
    financialInfo: { installments?: PaymentInstallment[] };
    linkedInstallments: PaymentInstallment[];
    settings: { id?: string; name?: string };
    satelliteProjects: SatelliteSource[];
    commercialProject: { id: string; settings?: { financialInfo?: FinancialInfo } } | null;
    projectId?: string;
    effectiveDealTypeFilter: DealTypeFilter;
}

export function legacyDisplayInstallments(input: LegacyInput): CommercialInstallment[] {
    const { financialInfo, linkedInstallments, settings, satelliteProjects, commercialProject, projectId, effectiveDealTypeFilter } = input;

    let list: CommercialInstallment[] = [
        ...(financialInfo.installments || []),
        ...linkedInstallments,
    ];

    if (settings.name === 'Gestão Comercial') {
        satelliteProjects.forEach((sat: SatelliteSource) => {
            const satInstallments = (sat.settings?.financialInfo?.installments || [])
                .map((i: PaymentInstallment) => ({ ...i, isCommercial: true, sourceProjectId: sat.id }));
            list.push(...satInstallments);
        });

        const seenIds = new Set<string>();
        list = list.filter(i => {
            const id = i.id || `${i.description}-${i.value}-${i.dueDate}`;
            if (seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
        });
    }

    if (commercialProject && settings.name !== 'Gestão Comercial' && settings.name !== 'Acompanhamento de Obras') {
        const comm = (commercialProject.settings?.financialInfo?.installments || []) as CommercialInstallment[];
        const sName = (settings.name || '').toLowerCase().trim();
        const workingId = projectId || settings.id;

        const linkedFromComm = comm.filter((i: CommercialInstallment) => {
            const isIdMatch = workingId && (i.linkedProjectId === workingId || i.propertyId === workingId);
            const pName = (i.propertyName || '').toLowerCase().trim();
            const isNameMatch = sName !== '' && (pName === sName || pName.includes(sName) || sName.includes(pName));
            return isIdMatch || isNameMatch;
        }).map((i: CommercialInstallment) => ({ ...i, isCommercial: true, sourceProjectId: commercialProject.id }));

        list.push(...linkedFromComm);
    }

    if (effectiveDealTypeFilter !== 'ALL') {
        list = list.filter(i => {
            if (i.dealType) return i.dealType === effectiveDealTypeFilter;
            const desc = (i.description || '').toLowerCase();
            if (effectiveDealTypeFilter === 'SALE') return desc.includes('venda') || desc.includes('entrada') || desc.includes('balão') || desc.includes('intermediária') || desc.includes('parcela');
            if (effectiveDealTypeFilter === 'RENTAL') return desc.includes('aluguel') || desc.includes('locação') || desc.includes('condomínio') || desc.includes('iptu');
            return true;
        });
    }

    return list;
}

export function legacyProfitabilityByProperty(
    displayInstallments: CommercialInstallment[],
    transactions: CommercialTransaction[],
): PropertyProfitability[] {
    const properties: Record<string, { id: string; name: string; revenue: number; expense: number }> = {};

    displayInstallments.forEach(i => {
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
        const netRevenue = displayInstallments
            .filter(i => (i.propertyId === p.id || i.propertyName === p.name) && i.status === 'PAID')
            .reduce((s, i) => {
                const comm = (i.value * (i.commissionRate || 0)) / 100;
                return s + (i.value - comm);
            }, 0);

        return {
            ...p,
            netRevenue,
            margin: netRevenue > 0 ? ((netRevenue - p.expense) / netRevenue) * 100 : 0,
        };
    }).sort((a, b) => b.revenue - a.revenue);
}
