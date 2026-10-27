// services/salesDashboardService.ts
//
// Métricas da aba "Resultados" de Venda de Ativos. O recorte de negociações
// tem de ser o MESMO da aba "Negociações" (SalesModule.buildingDeals) — foi a
// divergência entre os dois que fez a tela parecer desconectada: lá o negócio
// entra pelas unidades de `commercial_deal_units`, aqui só entrava por
// `property_id`; lá qualquer status aparece, aqui só COMPLETED contava.
import { supabase } from '../lib/supabase';
import { WORKFLOW_STEPS, STATUS_LABELS, normalizeStatus, type DealWorkflowStatus } from '../lib/dealWorkflow';
import { saleUnitClassifier, saleDealStage } from '../lib/salesAnalysis';
import { leafNodes } from '../lib/rentalPortfolio';

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
        .select('id, parent_id, initial_price, price, status, purpose')
        // Unidade ocultada pelo "Publicar" do Espelho de Vendas não é oferta —
        // o mesmo corte de `commercialService.listProperties`. Sem ele, esta aba
        // dizia "7 / 9" onde a Análise e os cards de Imóveis dizem "7 / 8".
        .not('visible_in_sales', 'is', false);
      if (organizationId) propertiesQuery = propertiesQuery.eq('organization_id', organizationId);

      if (projectId) {
        propertiesQuery = propertiesQuery.or(`parent_id.eq.${projectId},id.eq.${projectId}`);
      }

      const { data: properties, error: propertiesError } = await propertiesQuery;
      if (propertiesError) throw propertiesError;

      const isSalePurpose = (p: { purpose?: string | null }) => !p.purpose || p.purpose === 'SALE' || p.purpose === 'BOTH';

      // Unidades do edifício (o master, quando veio junto, não é estoque).
      const rawSalesProps = (properties || [])
        .filter(isSalePurpose)
        .filter(p => !projectId || p.id !== projectId);

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

      // Unidades de cada negociação (contrato multi-unidade). Servem a duas
      // coisas: casar o negócio com o edifício (a unidade principal pode ser de
      // outro prédio, ou faltar) e saber QUAL unidade a negociação ocupa — sem
      // isso o status de venda da unidade não sai (27/10/2026). Por isso carrega
      // sempre, não só com edifício aberto. Best-effort: sem a tabela, cai no
      // property_id, como era antes.
      const dealIds = (deals || []).map(d => d.id as string);
      const unitPropertyIdsByDeal = new Map<string, string[]>();
      try {
        for (let i = 0; i < dealIds.length; i += 150) {
          const { data: dealUnits, error: unitsError } = await supabase
            .from('commercial_deal_units')
            .select('deal_id, property_id')
            .in('deal_id', dealIds.slice(i, i + 150));
          if (unitsError) throw unitsError;
          for (const u of (dealUnits || []) as { deal_id: string; property_id: string }[]) {
            const list = unitPropertyIdsByDeal.get(u.deal_id) || [];
            list.push(u.property_id);
            unitPropertyIdsByDeal.set(u.deal_id, list);
          }
        }
      } catch (e) {
        console.warn('[Dashboard] commercial_deal_units indisponível, casando só por property_id:', e);
      }
      const unitsOf = (d: { id: unknown; property_id?: unknown }): string[] => {
        const ids = [...(unitPropertyIdsByDeal.get(d.id as string) || [])];
        if (d.property_id && !ids.includes(d.property_id as string)) ids.push(d.property_id as string);
        return ids;
      };

      // Filter deals by project if needed — mesmo critério de SalesModule.buildingDeals
      const filteredDeals = projectId
        ? (deals || []).filter(d => unitsOf(d).some(id => dealScopeIds.has(id)))
        : deals || [];

      // ⚠️ "Vendida" = negociação em Contrato, Assinatura ou Concluído, ou
      // unidade SOLD — a regra da aba Análise e dos cards de Imóveis
      // (`saleUnitClassifier`, lib/salesAnalysis.ts; decisão do usuário,
      // 27/10/2026). Até aqui só Concluído contava: com nenhuma negociação lá,
      // esta aba dizia VGV vendido R$ 0 com 7 contratos assinados ou em assinatura.
      const classificador = saleUnitClassifier(filteredDeals.map(d => ({
        id: d.id as string,
        status: d.status as string,
        units: unitsOf(d).map(property_id => ({ property_id })),
      })));

      // Unidades = FOLHAS da carteira (o edifício com unidades não é unidade),
      // a mesma base da aba Análise. Permutadas saem da base vendável.
      const salesProps = leafNodes(rawSalesProps as { id: string; parent_id?: string | null }[])
        .filter(p => classificador.statusOf(p as { id: string; status?: string | null }) !== 'exchanged') as typeof rawSalesProps;
      const vgvTotal = salesProps.reduce((sum, p) => sum + (Number(p.initial_price) || Number(p.price) || 0), 0);
      const unidadesTotal = salesProps.length;
      const contarStatus = (alvo: string) =>
        salesProps.filter(p => classificador.statusOf(p as { id: string; status?: string | null }) === alvo).length;
      const unidadesDisponiveis = contarStatus('available');
      const unidadesReservadas = contarStatus('reserved');
      const unidadesVendidas = contarStatus('sold');

      // VGV vendido = negociações de venda com contrato (vendidas).
      const soldDeals = filteredDeals.filter(d => saleDealStage(d.status as string) === 'sold');
      const vgvVendido = soldDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

      // Negociações abertas: Proposta, Aprovação e Reserva. Sem elas a tela
      // mostrava R$ 0 tendo milhões em pipeline.
      const openDeals = filteredDeals.filter(d => saleDealStage(d.status as string) === 'open');
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
      
      const salesLast30Days = soldDeals.filter(d => new Date(d.date) >= thirtyDaysAgo).length;
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
        
        const monthDeals = soldDeals.filter(d => {
          const dealDate = new Date(d.date);
          return dealDate.getMonth() === mIdx && dealDate.getFullYear() === yIdx;
        });
        
        const monthlyReal = monthDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
        
        // Linear plan based on periodMonths
        const monthlyPlanejado = (vgvTotal / periodMonths) * (i + 1);
        
        // Cumulative Real
        const previousMonthsDeals = soldDeals.filter(d => {
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
        reprovacaoCredito: soldDeals.length + filteredDeals.filter(d => d.status === 'CANCELLED' && d.type === 'SALE').length > 0
          ? (filteredDeals.filter(d => d.status === 'CANCELLED' && d.type === 'SALE').length
             / (soldDeals.length + filteredDeals.filter(d => d.status === 'CANCELLED' && d.type === 'SALE').length)) * 100
          : 0
      };
    } catch (error) {
      console.error('Error fetching sales dashboard metrics:', error);
      throw error;
    }
  }
};
