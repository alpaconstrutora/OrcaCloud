import { supabase } from '../lib/supabase';
import { computeNoi, portfolioNoi, capRate, expenseByPropertyFromEmpreendimentos, type NoiNode, type NoiResult } from '../lib/rentalNoi';
import { sumPortfolioValue } from '../lib/rentalPortfolio';
import { fetchAllPages, type RangeableQuery } from '../lib/supabasePaginate';
import { empreendimentoService } from './empreendimentoService';

/**
 * NOI, margem e cap rate da carteira de locação (Fase 2 do plano
 * docs/planos/2026-08-06-kpis-locacao-primitivas.md).
 *
 * Despesa = títulos de Contas a Pagar cujo Centro de Custo pertence a um
 * empreendimento, levados aos imóveis dele (plano
 * docs/planos/2026-11-10-noi-despesa-pelo-centro-de-custo.md). Antes vinha de
 * `property_expense_allocations`, a apropriação manual por imóvel — que nunca
 * foi usada (0 linhas) e saiu de Contas a Pagar no PR #289.
 *
 * `null` = falha ao calcular (com `throwOnError`, lança). `null` ≠ zero.
 */

/** Imóvel como o cálculo de NOI o enxerga. Compatível de propósito com
 *  `Property` da tela — é ela quem passa a lista quando já a tem em mãos. */
export interface NoiPropertyRow {
    id: string;
    parent_id?: string | null;
    price?: number | null;
    initial_price?: number | null;
    purpose?: string | null;
    /** Base do rateio da despesa do empreendimento entre os imóveis dele. */
    private_area?: number | null;
    area?: number | null;
}

export interface RentalNoiMetrics {
    revenue: number;
    expense: number;
    noi: number;
    /** NOI ÷ receita. `null` sem receita — indefinido, não zero. */
    margin: number | null;
    /** NOI anualizado ÷ patrimônio. `null` sem patrimônio. */
    capRate: number | null;
    /** Por imóvel, para a tabela de detalhe. */
    byProperty: Map<string, NoiResult>;
    /** Meses cobertos pela janela — a anualização do cap rate depende disso. */
    monthsInWindow: number;
}

export const rentalNoiService = {
    /**
     * `from`/`to` em YYYY-MM-DD. A despesa é somada no período; a receita é
     * mensal contratada, multiplicada pelos meses da janela — aproximação
     * deliberada, porque o realizado por competência vive em Contas a Receber
     * e trazê-lo aqui duplicaria a régua de reconhecimento do financeiro.
     */
    async getNoiMetrics(
        organizationId?: string | null,
        from?: string,
        to?: string,
        /**
         * Carteira a considerar, quando quem chama já a tem em mãos.
         *
         * Não é só economia de uma consulta: a aba Análise soma o NOI **por
         * empreendimento** a partir de `byProperty`, e as linhas só fecham com o
         * total se as duas contas partirem da MESMA lista de imóveis. A
         * listagem da tela aplica `visible_in_sales is not false`, que a
         * consulta daqui não aplicava — bastava um imóvel oculto para a soma
         * das linhas divergir do KPI do topo sem nenhum sinal na tela.
         */
        carteira?: NoiPropertyRow[],
    /** Falha de verdade (rede, erro inesperado) LANÇA em vez de virar `null`.
     *  Sem isto, "falhou" e "não medido" chegam iguais à tela. Só a aba Análise
     *  pede — os demais consumidores seguem com o contrato antigo. */
        opts?: { throwOnError?: boolean },
    ): Promise<RentalNoiMetrics | null> {
        try {
            let propertiesData: NoiPropertyRow[] = carteira ?? [];
            if (!carteira) {
                let propertiesQuery = supabase
                    .from('commercial_properties')
                    .select('id, parent_id, price, initial_price, purpose, private_area, area');
                if (organizationId) propertiesQuery = propertiesQuery.eq('organization_id', organizationId);

                const { data, error: propertiesError } = await propertiesQuery;
                if (propertiesError) throw propertiesError;
                propertiesData = (data || []) as unknown as NoiPropertyRow[];
            }

            const properties = propertiesData.filter(
                p => !p.purpose || p.purpose === 'RENTAL' || p.purpose === 'BOTH'
            );

            let dealsQuery = supabase
                .from('commercial_deals')
                .select('id, value, installment_value, status, type, property_id')
                .eq('type', 'RENTAL');
            if (organizationId) dealsQuery = dealsQuery.eq('organization_id', organizationId);

            const { data: dealsData, error: dealsError } = await dealsQuery;
            if (dealsError) throw dealsError;

            const activeDeals = (dealsData || []).filter(d => {
                const status = String(d.status).toUpperCase();
                return status === 'COMPLETED' || status === 'CLOSED';
            });

            const months = monthsBetween(from, to);

            // Receita do período = parcela mensal contratada × meses da janela.
            const revenueByProperty = new Map<string, number>();
            for (const deal of activeDeals) {
                if (!deal.property_id) continue;
                const monthly = deal.installment_value != null
                    ? Number(deal.installment_value) || 0
                    : Number(deal.value) || 0;
                revenueByProperty.set(
                    deal.property_id,
                    (revenueByProperty.get(deal.property_id) ?? 0) + monthly * months
                );
            }

            const nodes = properties as NoiNode[];
            const expenseByProperty = await despesaPorImovel(organizationId, from, to, properties);
            const byProperty = computeNoi(nodes, revenueByProperty, expenseByProperty);
            const total = portfolioNoi(nodes, byProperty);

            // Cap rate é anual por definição de mercado: anualiza o NOI da
            // janela antes de dividir pelo patrimônio, senão uma janela de 3
            // meses devolveria um quarto do cap rate real.
            const annualNoi = months > 0 ? (total.noi / months) * 12 : 0;
            const marketValue = sumPortfolioValue(
                properties as { id: string; parent_id?: string | null }[],
                (p: any) => Number(p.price) || Number(p.initial_price) || 0
            );

            return {
                revenue: total.revenue,
                expense: total.expense,
                noi: total.noi,
                margin: total.margin,
                capRate: capRate(annualNoi, marketValue),
                byProperty,
                monthsInWindow: months,
            };
        } catch (err) {
            console.error('[RentalNoi] Erro ao calcular NOI:', err);
            if (opts?.throwOnError) throw err;
            return null;
        }
    },
};

const CHUNK = 150;   // ids por `.in(...)` — mesma folga de URL do propertyExpenseService

const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

/**
 * Despesa da janela por imóvel da carteira, a partir do Centro de Custo.
 *
 * Empreendimento do Centro de Custo = o vínculo direto; sem ele, o da obra do
 * Centro de Custo — a mesma regra da coluna Empreendimento em Centro de Custo
 * (CostCenterModule.empreendimentoOf). Título cancelado não é despesa.
 */
const despesaPorImovel = async (
    organizationId: string | null | undefined,
    from: string | undefined,
    to: string | undefined,
    carteira: NoiPropertyRow[],
): Promise<Map<string, number>> => {
    if (carteira.length === 0) return new Map();

    let ccQuery = supabase.from('cost_centers_v2').select('id, empreendimento_id, project_id');
    if (organizationId) ccQuery = ccQuery.eq('organization_id', organizationId);
    const { data: ccs, error: ccError } = await ccQuery;
    if (ccError) throw ccError;

    const ccRows = (ccs || []) as { id: string; empreendimento_id: string | null; project_id: string | null }[];
    const precisaDaObra = ccRows.some(c => !c.empreendimento_id && c.project_id);
    const empPorObra = precisaDaObra ? await empreendimentoService.mapObrasToEmpreendimentos(organizationId) : {};
    const empPorCc = new Map<string, string>();
    for (const c of ccRows) {
        const emp = c.empreendimento_id ?? (c.project_id ? empPorObra[c.project_id]?.id : undefined);
        if (emp) empPorCc.set(c.id, emp);
    }
    if (empPorCc.size === 0) return new Map();

    const despesaPorEmp = new Map<string, number>();
    for (const ids of chunk([...empPorCc.keys()], CHUNK)) {
        const { data, error } = await fetchAllPages<{ cost_center_id: string; amount: number }>(() => {
            let q = supabase
                .from('vw_payables')
                .select('cost_center_id, amount')
                .in('cost_center_id', ids)
                .neq('effective_status', 'CANCELADO')
                .order('id');
            if (organizationId) q = q.eq('organization_id', organizationId);
            if (from) q = q.gte('due_date', from);
            if (to) q = q.lte('due_date', to);
            return q as unknown as RangeableQuery<{ cost_center_id: string; amount: number }>;
        });
        if (error) throw error;
        for (const row of data) {
            const emp = empPorCc.get(row.cost_center_id);
            if (emp) despesaPorEmp.set(emp, (despesaPorEmp.get(emp) ?? 0) + (Number(row.amount) || 0));
        }
    }
    if (despesaPorEmp.size === 0) return new Map();

    const vinculo = await empreendimentoService.mapPropertiesToEmpreendimentos(organizationId);
    const imoveis = carteira.flatMap(p => {
        const v = vinculo[p.id];
        return v ? [{ id: p.id, empreendimentoId: v.id, isBuilding: v.isBuilding, private_area: p.private_area, area: p.area }] : [];
    });
    return expenseByPropertyFromEmpreendimentos(despesaPorEmp, imoveis);
};

/**
 * Meses cobertos pela janela, mínimo 1.
 *
 * Constrói as datas por componente (`Date.UTC`) em vez de `new Date(string)`:
 * `new Date('2026-08-01')` é interpretado como UTC e, exibido/comparado em
 * fuso negativo, escorrega para o dia anterior — a armadilha de fuso já
 * registrada no projeto.
 */
const monthsBetween = (from?: string, to?: string): number => {
    if (!from || !to) return 1;
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    if (!fy || !fm || !ty || !tm) return 1;
    return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
};
