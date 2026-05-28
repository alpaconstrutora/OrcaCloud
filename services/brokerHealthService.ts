import { supabase } from '../lib/supabase';
import type { BrokerHealthKPI } from '../types';

export const brokerHealthService = {
    async getHealthData(organizationId: string): Promise<BrokerHealthKPI | null> {
        // 1. Units por status
        const { data: props, error: propsErr } = await supabase
            .from('commercial_properties')
            .select('id, initial_price, price, status, purpose, typology')
            .eq('organization_id', organizationId);
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
            .select('id, value, status, type, date, origin')
            .eq('organization_id', organizationId);
        if (dealsErr) throw dealsErr;

        const closedDeals = (deals || []).filter(d => ['FECHADO','VENDIDO','CLOSED'].includes(String(d.status).toUpperCase()));
        const vgvSold = closedDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);

        // Canal dominante
        const channelCounts: Record<string, number> = {};
        closedDeals.forEach(d => {
            const ch = d.origin || d.type || 'Direto';
            channelCounts[ch] = (channelCounts[ch] || 0) + 1;
        });
        const topChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '–';

        // Curva de absorção (últimos 12 meses)
        const now = new Date();
        const absorption: BrokerHealthKPI['absorption_curve'] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
            const monthDeals = closedDeals.filter(deal => {
                const dd = new Date(deal.date || '');
                return dd.getFullYear() === d.getFullYear() && dd.getMonth() === d.getMonth();
            }).length;
            const prev = absorption[absorption.length - 1]?.sold_cumulative || 0;
            absorption.push({ month: label, sold_cumulative: prev + monthDeals, projected: 0 });
        }

        // IVV (últimos 30 dias)
        const last30 = new Date(Date.now() - 30 * 86400000).toISOString();
        const recentSales = closedDeals.filter(d => (d.date || '') >= last30).length;
        const ivv = total > 0 ? Math.round((recentSales / total) * 100 * 10) / 10 : 0;

        // Meses para esgotar estoque
        const avgMonthly = closedDeals.length / 12;
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

        return {
            id: organizationId,
            project_name: 'Consolidado — todos os empreendimentos',
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
    },
};
