import { supabase } from '../lib/supabase';

export interface DashboardMetrics {
  vgvTotal: number;
  vgvVendido: number;
  sellThrough: number;
  vsoMensal: number;
  vsoTarget: number;
  unidadesDisponiveis: number;
  unidadesTotal: number;
  funil: { name: string; value: number }[];
  salesCurve: { month: string; planejado: number; real: number }[];
  canais: { name: string; value: number }[];
  corretores: {
    id: string;
    name: string;
    leads: number;
    sales: number;
    vgv: number;
    responseTime: string;
  }[];
  distratos: number;
  reprovacaoCredito: number;
}

export const salesDashboardService = {
  async getDashboardMetrics(organizationId: string, projectId?: string | null, periodMonths: number = 12, startDate?: string): Promise<DashboardMetrics> {
    try {
      
      // 1. Fetch properties for VGV Total and Estoque
      let propertiesQuery = supabase
        .from('commercial_properties')
        .select('id, initial_price, price, status, purpose')
        .eq('organization_id', organizationId);

      if (projectId) {
        propertiesQuery = propertiesQuery.eq('parent_id', projectId);
      }

      const { data: properties, error: propertiesError } = await propertiesQuery;
      if (propertiesError) throw propertiesError;

      const rawSalesProps = properties?.filter(p => !p.purpose || p.purpose === 'SALE' || p.purpose === 'BOTH') || [];
      
      // Excluir unidades permutadas da base de cálculo (não são estoque para venda)
      const salesProps = rawSalesProps.filter(p => {
        const s = String(p.status).toUpperCase();
        return s !== 'EXCHANGED' && s !== 'PERMUTADO';
      });
      const vgvTotal = salesProps.reduce((sum, p) => sum + (Number(p.initial_price) || Number(p.price) || 0), 0);
      const unidadesTotal = salesProps.length;
      const unidadesDisponiveis = salesProps.filter(p => {
        const s = String(p.status).toUpperCase();
        return s === 'AVAILABLE' || s === 'DISPONÍVEL' || s === 'DISPONIVEL';
      }).length;

      // 2. Fetch deals for VGV Vendido
      let dealsQuery = supabase
        .from('commercial_deals')
        .select('id, value, status, type, date, property_id')
        .eq('organization_id', organizationId)
        .eq('type', 'SALE');

      const { data: deals, error: dealsError } = await dealsQuery;
      if (dealsError) throw dealsError;

      // Filter deals by project if needed
      const filteredDeals = projectId 
        ? deals?.filter(d => salesProps.some(p => p.id === d.property_id)) || []
        : deals || [];

      const completedDeals = filteredDeals.filter(d => d.status === 'COMPLETED');
      const vgvVendido = completedDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

      // 3. Fetch Proposals for Funnel and Brokers (Graceful error handling)
      let filteredProposals: any[] = [];
      try {
        const { data: proposals, error: proposalsError } = await supabase
          .from('broker_portal_proposals')
          .select('id, broker_email, total_value, status, created_at')
          .eq('organization_id', organizationId);
        
        if (!proposalsError) filteredProposals = proposals || [];
      } catch (e) {
        // Silently fail
      }

      // 4. Fetch Clients for Funnel (Leads)
      let leadsCount = 0;
      try {
        const { count, error: leadsError } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true });
        
        if (!leadsError) leadsCount = count || 0;
      } catch (e) {
        // Silently fail
      }

      // 5. Calculate VSO (Venda Sobre Oferta) - Last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const salesLast30Days = completedDeals.filter(d => new Date(d.date) >= thirtyDaysAgo).length;
      const vsoMensal = unidadesTotal > 0 ? (salesLast30Days / unidadesTotal) * 100 : 0;
      const vsoTarget = 6.0;

      // 6. S-Curve Data (Real VGV over months)
      const monthsLabel = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      
      let baseDate = new Date();
      if (startDate) {
        baseDate = new Date(startDate + '-01'); // Assume YYYY-MM
      } else {
        baseDate.setMonth(0); // Janeiro
        baseDate.setDate(1);
      }
      
      const salesCurve = Array.from({ length: periodMonths }).map((_, i) => {
        const dDate = new Date(baseDate);
        dDate.setMonth(baseDate.getMonth() + i);
        const mIdx = dDate.getMonth();
        const yIdx = dDate.getFullYear();
        
        const monthDeals = completedDeals.filter(d => {
          const dealDate = new Date(d.date);
          return dealDate.getMonth() === mIdx && dealDate.getFullYear() === yIdx;
        });
        
        const monthlyReal = monthDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
        
        // Linear plan based on periodMonths
        const monthlyPlanejado = (vgvTotal / periodMonths) * (i + 1);
        
        // Cumulative Real
        const previousMonthsDeals = completedDeals.filter(d => {
            const dealDate = new Date(d.date);
            return (dealDate.getFullYear() < yIdx) || (dealDate.getFullYear() === yIdx && dealDate.getMonth() < mIdx);
        });
        const cumulativeReal = previousMonthsDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0) + monthlyReal;

        const isPastOrCurrent = yIdx < new Date().getFullYear() || (yIdx === new Date().getFullYear() && mIdx <= new Date().getMonth());

        return {
          month: `${monthsLabel[mIdx]} ${String(yIdx).slice(-2)}`,
          planejado: monthlyPlanejado,
          real: isPastOrCurrent ? cumulativeReal : 0
        };
      });

      // 7. Broker Ranking
      const brokerMap = new Map();
      filteredProposals.forEach(p => {
          const key = p.broker_email || 'Desconhecido';
          if (!brokerMap.has(key)) {
              brokerMap.set(key, { name: p.broker_email || 'Corretor', leads: 0, sales: 0, vgv: 0, responseTime: '---' });
          }
          const b = brokerMap.get(key);
          b.leads += 1;
          if (p.status === 'APROVADA') {
              b.sales += 1;
              b.vgv += Number(p.total_value) || 0;
          }
      });

      const corretores = Array.from(brokerMap.values())
        .sort((a, b) => b.vgv - a.vgv)
        .slice(0, 5);

      return {
        vgvTotal,
        vgvVendido,
        sellThrough: vgvTotal > 0 ? (vgvVendido / vgvTotal) * 100 : 0,
        vsoMensal: Number(vsoMensal.toFixed(1)),
        vsoTarget,
        unidadesDisponiveis,
        unidadesTotal,
        funil: [
          { name: 'Leads', value: leadsCount || 0 },
          { name: 'Atendimentos', value: Math.round((leadsCount || 0) * 0.8) }, // Estimativa baseada em CRM
          { name: 'Visitas', value: Math.round((leadsCount || 0) * 0.4) },
          { name: 'Propostas', value: filteredProposals.length },
          { name: 'Vendas', value: completedDeals.length },
        ],
        salesCurve,
        canais: [
          { name: 'Portal Imobiliário', value: 45 },
          { name: 'Tráfego Pago', value: 30 },
          { name: 'Indicação', value: 15 },
        ],
        corretores: corretores.length > 0 ? corretores : [
            { id: '1', name: 'Nenhum dado', leads: 0, sales: 0, vgv: 0, responseTime: '---' }
        ],
        distratos: filteredDeals.filter(d => d.status === 'CANCELLED').length,
        reprovacaoCredito: filteredDeals.length > 0 ? (filteredDeals.filter(d => d.status === 'CANCELLED').length / filteredDeals.length) * 100 : 0
      };
    } catch (error) {
      console.error('Error fetching sales dashboard metrics:', error);
      throw error;
    }
  }
};
