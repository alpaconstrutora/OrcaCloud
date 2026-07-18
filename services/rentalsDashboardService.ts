import { supabase } from '../lib/supabase';
import { PropertyStatus } from '../types';

export interface RentalsDashboardMetrics {
  valorTotalPatrimonio: number; // Valor Total Sugerido de todas as un. de aluguel
  receitaMensal: number; // VGV Consolidado de contratos ativos
  yieldMensal: number; // receitaMensal / valorTotalPatrimonio
  taxaOcupacao: number; // r_un / t_un
  unidadesDisponiveis: number;
  unidadesTotal: number;
  unidadesInadimplentes: number; // Placeholder ou baseado em status de parcelas (futuro)
  rentCurve: { month: string; planejado: number; real: number }[];
  canais: { name: string; value: number }[];
  tipologia: { name: string; value: number }[];
  proximasVencimentos: { id: string; client: string; property: string; value: number; dueDate: string }[];
}

export const rentalsDashboardService = {
  async getDashboardMetrics(organizationId: string | null, projectId?: string | null, periodMonths: number = 12, startDate?: string): Promise<RentalsDashboardMetrics> {
    try {
      console.log('[RentalsService] Fetching metrics for:', { organizationId, projectId });

      // 1. Fetch properties (purpose RENTAL or BOTH)
      let propertiesQuery = supabase
        .from('commercial_properties')
        .select('id, initial_price, price, status, purpose, type');

      if (organizationId) propertiesQuery = propertiesQuery.eq('organization_id', organizationId);
      if (projectId) {
        propertiesQuery = propertiesQuery.eq('parent_id', projectId);
      }

      const { data: properties, error: propertiesError } = await propertiesQuery;
      if (propertiesError) throw propertiesError;

      const rentalProps = properties?.filter(p => !p.purpose || p.purpose === 'RENTAL' || p.purpose === 'BOTH') || [];
      const valorTotalPatrimonio = rentalProps.reduce((sum, p) => sum + (Number(p.initial_price) || Number(p.price) || 0), 0);
      const unidadesTotal = rentalProps.length;
      const unidadesDisponiveis = rentalProps.filter(p => {
        const s = String(p.status).toUpperCase();
        return s === 'AVAILABLE' || s === 'DISPONÍVEL' || s === 'DISPONIVEL';
      }).length;
      const unidadesOcupadas = rentalProps.filter(p => {
        const s = String(p.status).toUpperCase();
        return s === 'RENTED' || s === 'ALUGADO';
      }).length;

      // 2. Fetch deals (type RENTAL)
      let dealsQuery = supabase
        .from('commercial_deals')
        .select('id, value, status, type, date, property_id, origin_channel')
        .eq('type', 'RENTAL');
      if (organizationId) dealsQuery = dealsQuery.eq('organization_id', organizationId);

      const { data: deals, error: dealsError } = await dealsQuery;
      if (dealsError) throw dealsError;

      const filteredDeals = projectId 
        ? deals?.filter(d => rentalProps.some(p => p.id === d.property_id)) || []
        : deals || [];

      console.log(`[RentalsService] Found ${filteredDeals.length} total rental deals`);

      const completedDeals = filteredDeals.filter(d => {
        const s = String(d.status).toUpperCase();
        return s === 'COMPLETED' || s === 'CLOSED' || s === 'APROVADA';
      });

      console.log(`[RentalsService] Found ${completedDeals.length} completed/active deals`);
      const receitaMensal = completedDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

      // 3. Rent Curve (S-Curve for Rentals)
      const monthsLabel = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      let baseDate = new Date();
      if (startDate) {
        baseDate = new Date(startDate + '-01');
      } else {
        baseDate.setMonth(0);
        baseDate.setDate(1);
      }
      
      const rentCurve = Array.from({ length: periodMonths }).map((_, i) => {
        const dDate = new Date(baseDate);
        dDate.setMonth(baseDate.getMonth() + i);
        const mIdx = dDate.getMonth();
        const yIdx = dDate.getFullYear();
        
        // No caso de aluguel, o real acumulado é a soma de todos os contratos ativos naquele mês
        // Simplificação: Consideramos deals completados até aquele mês
        const monthDeals = completedDeals.filter(d => {
          const dealDate = new Date(d.date);
          return dealDate.getFullYear() < yIdx || (dealDate.getFullYear() === yIdx && dealDate.getMonth() <= mIdx);
        });
        
        const cumulativeReal = monthDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
        const planejado = (receitaMensal * 1.2 / periodMonths) * (i + 1); // Exemplo de meta 20% acima do atual

        const isPastOrCurrent = yIdx < new Date().getFullYear() || (yIdx === new Date().getFullYear() && mIdx <= new Date().getMonth());

        return {
          month: `${monthsLabel[mIdx]} ${String(yIdx).slice(-2)}`,
          planejado: planejado || 0,
          real: isPastOrCurrent ? cumulativeReal : 0
        };
      });

      // 4. Tipologia (baseada nas unidades) e Canais (origin_channel real dos deals)
      const tipologiaMap = new Map();
      rentalProps.forEach(p => {
          const key = p.type || 'OUTROS';
          tipologiaMap.set(key, (tipologiaMap.get(key) || 0) + 1);
      });

      // Canais: agrupa os deals de locação por origem real (origin_channel);
      // value = participação percentual (para a barra do dashboard). Sem array fixo.
      const canaisMap = new Map<string, number>();
      filteredDeals.forEach(d => {
          const canal = ((d as any).origin_channel || '').toString().trim() || 'Não informado';
          canaisMap.set(canal, (canaisMap.get(canal) || 0) + 1);
      });
      const totalCanais = Array.from(canaisMap.values()).reduce((s, v) => s + v, 0);
      const canais = Array.from(canaisMap.entries())
          .map(([name, count]) => ({ name, value: totalCanais > 0 ? Math.round((count / totalCanais) * 100) : 0 }))
          .sort((a, b) => b.value - a.value);

      // 5. Inadimplência e próximos vencimentos — via contratos de LOCAÇÃO + vw_receivables
      let unidadesInadimplentes = 0;
      let proximasVencimentos: RentalsDashboardMetrics['proximasVencimentos'] = [];
      if (organizationId) {
          // Contratos de locação da org (e da obra, quando filtrada)
          let contractsQuery = supabase
              .from('contracts')
              .select('id, title, client_id')
              .eq('organization_id', organizationId)
              .eq('domain', 'LOCACAO');
          if (projectId) contractsQuery = contractsQuery.eq('project_id', projectId);
          const { data: rentalContracts } = await contractsQuery;

          const contractIds = (rentalContracts || []).map(c => c.id as string);
          const contractTitleById = new Map<string, string>(
              (rentalContracts || []).map(c => [c.id as string, (c.title as string) || ''])
          );

          if (contractIds.length > 0) {
              // vw_receivables já calcula effective_status='VENCIDO' dinamicamente
              const { data: receivables } = await supabase
                  .from('vw_receivables')
                  .select('id, reference_id, due_date, amount, party_name, description, effective_status')
                  .eq('organization_id', organizationId)
                  .in('reference_id', contractIds)
                  .order('due_date', { ascending: true, nullsFirst: false });

              const rows = receivables || [];

              // Contratos distintos com ao menos 1 parcela vencida
              const overdue = new Set(
                  rows.filter(r => r.effective_status === 'VENCIDO').map(r => r.reference_id)
              );
              unidadesInadimplentes = overdue.size;

              // Próximos vencimentos: em aberto, com vencimento a partir de hoje
              const hoje = new Date().toISOString().split('T')[0];
              const emAberto = ['PREVISTO', 'EMITIDO', 'ENVIADO', 'VENCIDO'];
              proximasVencimentos = rows
                  .filter(r => r.due_date && r.due_date >= hoje && emAberto.includes(String(r.effective_status)))
                  .slice(0, 10)
                  .map(r => ({
                      id: r.id as string,
                      client: (r.party_name as string) || '—',
                      property: contractTitleById.get(r.reference_id as string) || (r.description as string) || '—',
                      value: Number(r.amount) || 0,
                      dueDate: r.due_date as string,
                  }));
          }
      }

      return {
        valorTotalPatrimonio,
        receitaMensal,
        yieldMensal: valorTotalPatrimonio > 0 ? (receitaMensal / valorTotalPatrimonio) * 100 : 0,
        taxaOcupacao: unidadesTotal > 0 ? (unidadesOcupadas / unidadesTotal) * 100 : 0,
        unidadesDisponiveis,
        unidadesTotal,
        unidadesInadimplentes,
        rentCurve,
        canais,
        tipologia: Array.from(tipologiaMap.entries()).map(([name, value]) => ({ name, value })),
        proximasVencimentos
      };
    } catch (error) {
      console.error('Error fetching rentals dashboard metrics:', error);
      throw error;
    }
  }
};
