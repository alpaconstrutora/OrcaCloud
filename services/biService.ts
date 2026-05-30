import { supabase } from '../lib/supabase';
import type {
    ExecutiveKPIs, BITrendPoint, KPIvsTarget, BIExecutiveSummary,
} from '../types/bi';

interface CompanyTarget {
    ano: number;
    faturamento_meta: number | null;
    ebitda_alvo: number | null;
    margem_alvo_pct: number | null;
    ticket_medio_alvo: number | null;
    qtd_obras_meta: number | null;
}

function getStatus(realizado: number | null, meta: number | null, higherIsBetter = true): KPIvsTarget['status'] {
    if (meta === null || realizado === null) return 'sem_meta';
    const ratio = realizado / meta;
    if (higherIsBetter) {
        return ratio >= 1 ? 'acima' : ratio >= 0.9 ? 'dentro' : 'abaixo';
    } else {
        return ratio <= 1 ? 'acima' : ratio <= 1.1 ? 'dentro' : 'abaixo';
    }
}

function variacao(realizado: number | null, meta: number | null): number | null {
    if (meta === null || meta === 0 || realizado === null) return null;
    return Math.round((realizado - meta) / meta * 100 * 10) / 10;
}

export const biService = {

    async getExecutiveKPIs(
        organizationId: string,
        dateFrom: string,
        dateTo: string,
    ): Promise<ExecutiveKPIs> {
        const { data, error } = await supabase.rpc('fn_bi_executive', {
            p_organization_id: organizationId,
            p_date_from:       dateFrom,
            p_date_to:         dateTo,
        });
        if (error) throw error;
        return data as ExecutiveKPIs;
    },

    async getTrend(
        organizationId: string,
        months = 12,
    ): Promise<BITrendPoint[]> {
        const { data, error } = await supabase.rpc('fn_bi_trend', {
            p_organization_id: organizationId,
            p_months:          months,
        });
        if (error) throw error;
        return (data || []) as BITrendPoint[];
    },

    async getCompanyTarget(organizationId: string): Promise<CompanyTarget | null> {
        const ano = new Date().getFullYear();
        const { data, error } = await supabase
            .from('company_targets')
            .select('ano, faturamento_meta, ebitda_alvo, margem_alvo_pct, ticket_medio_alvo, qtd_obras_meta')
            .eq('ano', ano)
            .limit(1)
            .maybeSingle();
        if (error) {
            console.warn('[biService] company_targets:', error.message);
            return null;
        }
        return data as CompanyTarget | null;
    },

    buildVsTargets(kpis: ExecutiveKPIs, target: CompanyTarget | null): KPIvsTarget[] {
        const dreVal = (linha: string) =>
            kpis.dre?.find(d => d.linha === linha)?.realizado ?? null;

        const receitaBruta   = dreVal('Receita Bruta');
        const ebitda         = dreVal('= EBITDA');
        const lucroLiquido   = dreVal('= Resultado Líquido');
        const margem         = receitaBruta && receitaBruta > 0 && lucroLiquido !== null
            ? Math.round(lucroLiquido / receitaBruta * 1000) / 10
            : null;

        return [
            {
                label:       'Faturamento (Receita Bruta)',
                realizado:   receitaBruta,
                meta:        target?.faturamento_meta ?? null,
                unidade:     'BRL',
                status:      getStatus(receitaBruta, target?.faturamento_meta ?? null),
                variacao_pct: variacao(receitaBruta, target?.faturamento_meta ?? null),
            },
            {
                label:       'EBITDA',
                realizado:   ebitda,
                meta:        target?.ebitda_alvo ?? null,
                unidade:     'BRL',
                status:      getStatus(ebitda, target?.ebitda_alvo ?? null),
                variacao_pct: variacao(ebitda, target?.ebitda_alvo ?? null),
            },
            {
                label:       'Margem Líquida',
                realizado:   margem,
                meta:        target?.margem_alvo_pct ?? null,
                unidade:     '%',
                status:      getStatus(margem, target?.margem_alvo_pct ?? null),
                variacao_pct: variacao(margem, target?.margem_alvo_pct ?? null),
            },
            {
                label:       'Ticket Médio',
                realizado:   kpis.comercial?.ticket_medio ?? null,
                meta:        target?.ticket_medio_alvo ?? null,
                unidade:     'BRL',
                status:      getStatus(kpis.comercial?.ticket_medio ?? null, target?.ticket_medio_alvo ?? null),
                variacao_pct: variacao(kpis.comercial?.ticket_medio ?? null, target?.ticket_medio_alvo ?? null),
            },
            {
                label:       'Obras Ativas',
                realizado:   kpis.operacional?.obras_ativas ?? null,
                meta:        target?.qtd_obras_meta ?? null,
                unidade:     'un',
                status:      getStatus(kpis.operacional?.obras_ativas ?? null, target?.qtd_obras_meta ?? null),
                variacao_pct: variacao(kpis.operacional?.obras_ativas ?? null, target?.qtd_obras_meta ?? null),
            },
            {
                label:       'Taxa de Conversão',
                realizado:   kpis.comercial?.taxa_conversao_pct ?? null,
                meta:        null,
                unidade:     '%',
                status:      'sem_meta',
                variacao_pct: null,
            },
            {
                label:       'Taxa de Divergência (Compras)',
                realizado:   kpis.supply?.taxa_divergencia_pct ?? null,
                meta:        null,
                unidade:     '%',
                status:      'sem_meta',
                variacao_pct: null,
            },
            {
                label:       'Turnover RH',
                realizado:   kpis.rh?.periodo?.turnover_pct ?? null,
                meta:        null,
                unidade:     '%',
                status:      'sem_meta',
                variacao_pct: null,
            },
        ];
    },

    async getSummary(
        organizationId: string,
        dateFrom: string,
        dateTo: string,
        trendMonths = 12,
    ): Promise<BIExecutiveSummary> {
        const [kpis, trend, target] = await Promise.all([
            biService.getExecutiveKPIs(organizationId, dateFrom, dateTo),
            biService.getTrend(organizationId, trendMonths),
            biService.getCompanyTarget(organizationId),
        ]);

        return {
            kpis,
            trend,
            vsTargets: biService.buildVsTargets(kpis, target),
        };
    },
};
