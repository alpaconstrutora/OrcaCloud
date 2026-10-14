import { supabase } from '../lib/supabase';
import type { BrokerHealthKPI } from '../types';

export const brokerHealthService = {
    /**
     * Empreendimentos (project_id de commercial_properties) com estoque de venda
     * na organização — alimenta o seletor do painel de Saúde. Sem isso o painel
     * só sabia mostrar o consolidado de TODOS os empreendimentos misturados, o
     * que escondia qual projeto específico estava travado.
     */
    async listProjectsWithSales(organizationId: string): Promise<{ id: string; name: string }[]> {
        try {
            const { data, error } = await supabase
                .from('commercial_properties')
                .select('project_id, status, purpose, project:projects(name)')
                .eq('organization_id', organizationId)
                .not('project_id', 'is', null);
            if (error) throw error;

            const seen = new Map<string, string>();
            (data || []).forEach((p: any) => {
                const purpose = String(p.purpose || 'SALE').toUpperCase();
                const status = String(p.status).toUpperCase();
                if ((purpose !== 'SALE' && purpose !== 'BOTH') || status === 'EXCHANGED' || status === 'PERMUTADO') return;
                const name = p.project?.name;
                if (p.project_id && name && !seen.has(p.project_id)) seen.set(p.project_id, name);
            });
            return Array.from(seen.entries())
                .map(([id, name]) => ({ id, name }))
                .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        } catch (err) {
            console.error('[BrokerHealthService] listProjectsWithSales error:', err);
            return [];
        }
    },

    /** `projectId` ausente/null = consolidado de todos os empreendimentos da organização. */
    async getHealthData(organizationId: string, projectId?: string | null): Promise<BrokerHealthKPI | null> {
      try {
        // 1. Units por status
        let propsQuery = supabase
            .from('commercial_properties')
            .select('id, initial_price, price, status, purpose, typology')
            .eq('organization_id', organizationId);
        if (projectId) propsQuery = propsQuery.eq('project_id', projectId);
        const { data: props, error: propsErr } = await propsQuery;
        if (propsErr) throw propsErr;

        const salesProps = (props || []).filter(p => {
            const s = String(p.status).toUpperCase();
            const purpose = String(p.purpose || 'SALE').toUpperCase();
            return (purpose === 'SALE' || purpose === 'BOTH') && s !== 'EXCHANGED' && s !== 'PERMUTADO';
        });

        const total     = salesProps.length;
        const sold      = salesProps.filter(p => ['SOLD','VENDIDO','VENDIDA'].includes(String(p.status).toUpperCase())).length;
        const reserved  = salesProps.filter(p => ['RESERVED','RESERVADO','RESERVADA'].includes(String(p.status).toUpperCase())).length;
        const available = salesProps.filter(p => ['AVAILABLE','DISPONIVEL','DISPONÍVEL'].includes(String(p.status).toUpperCase())).length;

        const vgvTotal = salesProps.reduce((s, p) => s + (Number(p.initial_price) || Number(p.price) || 0), 0);

        // 2. Deals para VGV vendido, canal dominante e curva de absorção
        const { data: deals, error: dealsErr } = await supabase
            .from('commercial_deals')
            .select('id, value, status, type, date, broker_name, payment_method, property_id')
            .eq('organization_id', organizationId);
        if (dealsErr) throw dealsErr;

        // Com empreendimento selecionado, um negócio só conta se a unidade
        // principal (property_id) pertence a ele — mesmo critério que
        // commercialService usa para achar negócios de um imóvel (cesta reúne
        // apto+vaga+box do MESMO empreendimento, então a unidade principal basta).
        const propIds = projectId ? new Set(salesProps.map(p => p.id)) : null;
        const scopedDeals = propIds ? (deals || []).filter(d => d.property_id && propIds.has(d.property_id)) : (deals || []);

        const CLOSED_STATUSES = ['COMPLETED', 'FECHADO', 'VENDIDO', 'CLOSED', 'ASSINATURA'];
        const closedDeals = scopedDeals.filter(d => CLOSED_STATUSES.includes(String(d.status).toUpperCase()));
        const vgvSold = closedDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);

        // Canal dominante (usa type: SALE/RENTAL/SERVICE, ou payment_method como proxy)
        const channelCounts: Record<string, number> = {};
        closedDeals.forEach(d => {
            const ch = d.broker_name ? 'Corretor' : d.payment_method || d.type || 'Direto';
            channelCounts[ch] = (channelCounts[ch] || 0) + 1;
        });
        const topChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '–';

        // Curva de absorção (últimos 12 meses). `projected` não tem meta de vendas
        // cadastrada em lugar nenhum do sistema — a referência honesta possível,
        // sem inventar dado, é um ritmo linear que esgotaria todo o estoque em 12
        // meses (mês 1 = 1/12 do estoque, mês 12 = 100%). Serve de régua pra ver
        // se o ritmo real está acima ou abaixo de um ano de giro.
        const now = new Date();
        const absorption: BrokerHealthKPI['absorption_curve'] = [];
        let recentDealsTotal = 0;
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
            const monthDeals = closedDeals.filter(deal => {
                const dd = new Date(deal.date || '');
                return dd.getFullYear() === d.getFullYear() && dd.getMonth() === d.getMonth();
            }).length;
            recentDealsTotal += monthDeals;
            const prev = absorption[absorption.length - 1]?.sold_cumulative || 0;
            const projected = total > 0 ? Math.round((total * (absorption.length + 1)) / 12) : 0;
            absorption.push({ month: label, sold_cumulative: prev + monthDeals, projected });
        }

        // IVV (últimos 30 dias)
        const last30 = new Date(Date.now() - 30 * 86400000).toISOString();
        const recentSales = closedDeals.filter(d => (d.date || '') >= last30).length;
        const ivv = total > 0 ? Math.round((recentSales / total) * 100 * 10) / 10 : 0;

        // Meses para esgotar estoque — ritmo dos ÚLTIMOS 12 MESES (mesma janela da
        // curva de absorção acima), não a média de todo o histórico de negócios.
        // Antes dividia o total histórico por 12, o que inflava o ritmo médio em
        // organizações com anos de dados e subestimava quanto falta pra vender.
        const avgMonthly = recentDealsTotal / 12;
        const monthsToSell = avgMonthly > 0 ? Math.round(available / avgMonthly) : 0;

        // Ticket médio
        const avgTicket = sold > 0 ? vgvSold / sold : 0;

        // Mix por tipologia
        const typoMap: Record<string, { sold: number; total: number }> = {};
        salesProps.forEach(p => {
            const t = p.typology || 'Outros';
            if (!typoMap[t]) typoMap[t] = { sold: 0, total: 0 };
            typoMap[t].total++;
            if (['SOLD','VENDIDO','VENDIDA'].includes(String(p.status).toUpperCase())) typoMap[t].sold++;
        });
        const mixSales = Object.entries(typoMap)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 6)
            .map(([typology, { sold: s, total: t }]) => ({
                typology,
                sold: s,
                total: t,
                pct: t > 0 ? Math.round((s / t) * 100) : 0,
            }));

        let projectName = 'Consolidado — todos os empreendimentos';
        if (projectId) {
            const { data: proj } = await supabase.from('projects').select('name').eq('id', projectId).maybeSingle();
            if (proj?.name) projectName = proj.name;
        }

        return {
            id: projectId || organizationId,
            project_name: projectName,
            total_units: total,
            sold_units: sold,
            available_units: available,
            reserved_units: reserved,
            vgv_total: vgvTotal,
            vgv_sold: vgvSold,
            ivv,
            months_to_sell: monthsToSell,
            absorption_curve: absorption,
            mix_sales: mixSales,
            top_channel: topChannel,
            avg_ticket: avgTicket,
        };
      } catch (err) {
        console.error('[BrokerHealthService] getHealthData error:', err);
        return null;
      }
    },
};
