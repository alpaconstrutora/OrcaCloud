// services/salesDashboardService.ts
//
// Métricas da aba "Resultados" de Venda de Ativos. O recorte de negociações
// tem de ser o MESMO da aba "Negociações" (SalesModule.buildingDeals) — foi a
// divergência entre os dois que fez a tela parecer desconectada: lá o negócio
// entra pelas unidades de `commercial_deal_units`, aqui só entrava por
// `property_id`; lá qualquer status aparece, aqui só COMPLETED contava.
import { supabase } from '../lib/supabase';
import { WORKFLOW_STEPS, STATUS_LABELS, normalizeStatus, type DealWorkflowStatus } from '../lib/dealWorkflow';

export interface DashboardMetrics {
  vgvTotal: number;
  vgvVendido: number;
  /** Valor das negociações abertas (tudo que não é Concluído nem Cancelado). */
  vgvEmNegociacao: number;
  negociacoesAbertas: number;
  sellThrough: number;
  vsoMensal: number;
  vsoTarget: number;
  unidadesDisponiveis: number;
  unidadesReservadas: number;
  unidadesVendidas: number;
  unidadesTotal: number;
  /** Pipeline real das negociações, na ordem das etapas de lib/dealWorkflow. */
  funil: { name: string; value: number; valor: number }[];
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
  async getDashboardMetrics(organizationId: string | null, projectId?: string | null, periodMonths: number = 12, startDate?: string): Promise<DashboardMetrics> {
    try {

      // 1. Fetch properties for VGV Total and Estoque
      //    Com um edifício aberto, o `.or` traz também o PRÓPRIO edifício: a aba
      //    Negociações aceita negócio lançado no master (buildingDeals.isSelf), e
      //    sem ele esse negócio sumiria daqui. Ele fica fora do estoque/VGV logo
      //    abaixo — só serve para casar negociação.
      let propertiesQuery = supabase
        .from('commercial_properties')
        .select('id, parent_id, initial_price, price, status, purpose');
      if (organizationId) propertiesQuery = propertiesQuery.eq('organization_id', organizationId);

      if (projectId) {
        propertiesQuery = propertiesQuery.or(`parent_id.eq.${projectId},id.eq.${projectId}`);
      }

      const { data: properties, error: propertiesError } = await propertiesQuery;
      if (propertiesError) throw propertiesError;

      const isSalePurpose = (p: { purpose?: string | null }) => !p.purpose || p.purpose === 'SALE' || p.purpose === 'BOTH';
      const statusOf = (p: { status?: string | null }) => String(p.status).toUpperCase();

      // Unidades do edifício (o master, quando veio junto, não é estoque).
      const rawSalesProps = (properties || [])
        .filter(isSalePurpose)
        .filter(p => !projectId || p.id !== projectId);

      // Excluir unidades permutadas da base de cálculo (não são estoque para venda)
      const salesProps = rawSalesProps.filter(p => {
        const s = statusOf(p);
        return s !== 'EXCHANGED' && s !== 'PERMUTADO';
      });
      const vgvTotal = salesProps.reduce((sum, p) => sum + (Number(p.initial_price) || Number(p.price) || 0), 0);
      const unidadesTotal = salesProps.length;
      const unidadesDisponiveis = salesProps.filter(p => {
        const s = statusOf(p);
        return s === 'AVAILABLE' || s === 'DISPONÍVEL' || s === 'DISPONIVEL';
      }).length;
      const unidadesReservadas = salesProps.filter(p => ['RESERVED', 'RESERVADO'].includes(statusOf(p))).length;
      const unidadesVendidas = salesProps.filter(p => ['SOLD', 'VENDIDO'].includes(statusOf(p))).length;

      // Escopo de negociação: TODAS as properties do edifício (inclusive o master e
      // as permutadas, que saem só do estoque). É o que a aba Negociações usa.
      const dealScopeIds = new Set((properties || []).map(p => p.id as string));

      // 2. Fetch deals for VGV Vendido
      let dealsQuery = supabase
        .from('commercial_deals')
        .select('id, value, status, type, date, property_id, origin_channel')
        .eq('type', 'SALE');
      if (organizationId) dealsQuery = dealsQuery.eq('organization_id', organizationId);

      const { data: deals, error: dealsError } = await dealsQuery;
      if (dealsError) throw dealsError;

      // Unidades de cada negociação (contrato multi-unidade). Sem isso, um negócio
      // cuja unidade principal é de outro prédio — ou que não tem property_id — não
      // casaria com o edifício, embora a aba Negociações o mostre. Best-effort: se a
      // tabela não existir/estiver bloqueada, cai no property_id, como era antes.
      const dealIds = (deals || []).map(d => d.id as string);
      const unitPropertyIdsByDeal = new Map<string, string[]>();
      if (projectId && dealIds.length > 0) {
        try {
          const { data: dealUnits, error: unitsError } = await supabase
            .from('commercial_deal_units')
            .select('deal_id, property_id')
            .in('deal_id', dealIds);
          if (unitsError) throw unitsError;
          for (const u of (dealUnits || []) as { deal_id: string; property_id: string }[]) {
            const list = unitPropertyIdsByDeal.get(u.deal_id) || [];
            list.push(u.property_id);
            unitPropertyIdsByDeal.set(u.deal_id, list);
          }
        } catch (e) {
          console.warn('[Dashboard] commercial_deal_units indisponível, casando só por property_id:', e);
        }
      }

      // Filter deals by project if needed — mesmo critério de SalesModule.buildingDeals
      const filteredDeals = projectId
        ? (deals || []).filter(d => {
            const ids = unitPropertyIdsByDeal.get(d.id as string) || [];
            if (d.property_id) ids.push(d.property_id as string);
            return ids.some(id => dealScopeIds.has(id));
          })
        : deals || [];

      // VGV = apenas vendas (type='SALE') concluídas — locação/permuta excluída
      const completedDeals = filteredDeals.filter(d => d.status === 'COMPLETED' && d.type === 'SALE');
      const vgvVendido = completedDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

      // Negociações abertas: tudo que não concluiu nem foi cancelado. É o número que
      // faltava — sem ele a tela mostrava R$ 0 tendo milhões em pipeline.
      const openDeals = filteredDeals.filter(d => d.status !== 'COMPLETED' && d.status !== 'CANCELLED');
      const vgvEmNegociacao = openDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

      // 3. Fetch Proposals for the broker ranking (Graceful error handling)
      let filteredProposals: any[] = [];
      try {
        let proposalsQuery = supabase
          .from('broker_portal_proposals')
          .select('id, broker_email, total_value, status, created_at');
        if (organizationId) proposalsQuery = proposalsQuery.eq('organization_id', organizationId);
        const { data: proposals, error: proposalsError } = await proposalsQuery;

        if (!proposalsError) filteredProposals = proposals || [];
      } catch (e) {
        // Silently fail
      }

      // 4. Funil = o pipeline REAL das negociações, etapa por etapa.
      //    Antes daqui saía "Leads / Propostas / Vendas", onde Leads era a contagem
      //    de TODOS os clientes da organização e Propostas vinha de
      //    `broker_portal_proposals` (Portal do Corretor) — nenhuma das duas olhava
      //    para as negociações desta tela, nem para o edifício aberto. Uma
      //    negociação em "Proposta" não aparecia em etapa nenhuma.
      const funil = WORKFLOW_STEPS.map(step => {
        const doStep = filteredDeals.filter(d => normalizeStatus(d.status as DealWorkflowStatus) === step.status);
        return {
          name: STATUS_LABELS[step.status],
          value: doStep.length,
          valor: doStep.reduce((sum, d) => sum + (Number(d.value) || 0), 0),
        };
      });

      // 5. Calculate VSO (Venda Sobre Oferta) - Last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const salesLast30Days = completedDeals.filter(d => new Date(d.date) >= thirtyDaysAgo).length;
      const vsoMensal = unidadesTotal > 0 ? (salesLast30Days / unidadesTotal) * 100 : 0;
      const vsoTarget = 6.0;

      // 6. S-Curve Data (Real VGV over months)
      const monthsLabel = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      
      // Ano/mês do início como NÚMEROS, não como Date.
      //   `new Date('2026-01-01')` é parseado como UTC; em UTC-3 vira 31/12/2025
      //   local — a curva começava em "Dez 25" com o campo marcando janeiro/26.
      //   E `setMonth(+i)` sobre um dia 31 transborda (31/jan +1 mês = 03/mar),
      //   o que fazia o eixo repetir "Mar 26", "Mai 26", "Jul 26", "Out 26".
      //   Com dia 1 fixo e aritmética no construtor, nada disso acontece.
      const hoje = new Date();
      const [anoBase, mesBase] = startDate && /^\d{4}-\d{2}$/.test(startDate)
        ? [Number(startDate.slice(0, 4)), Number(startDate.slice(5, 7)) - 1]
        : [hoje.getFullYear(), 0];

      const salesCurve = Array.from({ length: periodMonths }).map((_, i) => {
        const dDate = new Date(anoBase, mesBase + i, 1);
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
        vgvEmNegociacao,
        negociacoesAbertas: openDeals.length,
        sellThrough: vgvTotal > 0 ? (vgvVendido / vgvTotal) * 100 : 0,
        vsoMensal: Number(vsoMensal.toFixed(1)),
        vsoTarget,
        unidadesDisponiveis,
        unidadesReservadas,
        unidadesVendidas,
        unidadesTotal,
        funil,
        salesCurve,
        canais: (() => {
          const map = new Map<string, number>();
          filteredDeals.forEach(d => {
            const canal = d.origin_channel || 'Não informado';
            map.set(canal, (map.get(canal) || 0) + 1);
          });
          return Array.from(map.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
        })(),
        corretores: corretores.length > 0 ? corretores : [
            { id: '1', name: 'Nenhum dado', leads: 0, sales: 0, vgv: 0, responseTime: '---' }
        ],
        distratos: filteredDeals.filter(d => d.status === 'CANCELLED' && d.type === 'SALE').length,
        reprovacaoCredito: completedDeals.length + filteredDeals.filter(d => d.status === 'CANCELLED' && d.type === 'SALE').length > 0
          ? (filteredDeals.filter(d => d.status === 'CANCELLED' && d.type === 'SALE').length
             / (completedDeals.length + filteredDeals.filter(d => d.status === 'CANCELLED' && d.type === 'SALE').length)) * 100
          : 0
      };
    } catch (error) {
      console.error('Error fetching sales dashboard metrics:', error);
      throw error;
    }
  }
};
