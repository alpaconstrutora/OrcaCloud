import { supabase } from '../lib/supabase';
import { computeNoi, portfolioNoi, capRate, type NoiNode, type NoiResult } from '../lib/rentalNoi';
import { sumPortfolioValue } from '../lib/rentalPortfolio';
import { propertyExpenseService } from './propertyExpenseService';

/**
 * NOI, margem e cap rate da carteira de locação (Fase 2 do plano
 * docs/planos/2026-08-06-kpis-locacao-primitivas.md).
 *
 * Devolve `null` quando a apropriação de despesa por imóvel ainda não existe no
 * banco — sem ela o NOI seria só a receita disfarçada de resultado, que é pior
 * que não mostrar nada. Mesmo contrato da Fase 1: `null` ≠ zero.
 */

/** Imóvel como o cálculo de NOI o enxerga. Compatível de propósito com
 *  `Property` da tela — é ela quem passa a lista quando já a tem em mãos. */
export interface NoiPropertyRow {
    id: string;
    parent_id?: string | null;
    price?: number | null;
    initial_price?: number | null;
    purpose?: string | null;
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
    ): Promise<RentalNoiMetrics | null> {
        try {
            const expenseByProperty = await propertyExpenseService.expenseByProperty(
                organizationId, from, to
            );
            // null = migration não aplicada. Sem despesa apropriada não há NOI.
            if (expenseByProperty === null) return null;

            let propertiesData: NoiPropertyRow[] = carteira ?? [];
            if (!carteira) {
                let propertiesQuery = supabase
                    .from('commercial_properties')
                    .select('id, parent_id, price, initial_price, purpose');
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
            return null;
        }
    },
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
