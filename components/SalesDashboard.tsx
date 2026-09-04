import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Target, AlertTriangle, Users, DollarSign, Activity, Percent, Clock } from 'lucide-react';
import type { Property } from '../types';
import { useStore } from '../store/useStore';
import { KpiCard } from './ui/KpiCard';
import { salesDashboardService, DashboardMetrics } from '../services/salesDashboardService';
import { pricingService } from '../services/pricingService';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

interface SalesDashboardProps {
  buildings?: Property[];
  selectedBuildingId?: string | null;
  mode?: 'results' | 'simulation';
  simulationParams?: {
    monthlySales: number;
    priceAdjust: number;
  };
  organizationId?: string;
}

export function SalesDashboard({ selectedBuildingId, mode = 'results', simulationParams, organizationId: propsOrganizationId }: SalesDashboardProps) {
  const { activeOrganizationId } = useStore();
  const organizationId = propsOrganizationId || activeOrganizationId || null;
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodMonths, setPeriodMonths] = useState(() => {
    const saved = localStorage.getItem('sales_dashboard_period');
    return saved ? Number(saved) : 12;
  });
  const [startDate, setStartDate] = useState(() => {
    const saved = localStorage.getItem('sales_dashboard_start_date');
    if (saved) return saved;
    const d = new Date();
    return `${d.getFullYear()}-01`;
  });

  // Persistência
  useEffect(() => {
    localStorage.setItem('sales_dashboard_period', String(periodMonths));
  }, [periodMonths]);

  useEffect(() => {
    localStorage.setItem('sales_dashboard_start_date', startDate);
  }, [startDate]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    salesDashboardService.getDashboardMetrics(organizationId, selectedBuildingId, periodMonths, startDate)
      .then(data => {
        if (isMounted) setMetrics(data);
      })
      .catch(error => {
        console.error('[Dashboard] Error fetching:', error);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [organizationId, selectedBuildingId, periodMonths, startDate]);


  // Simulando cálculos globais se nulo, ou recebendo do back
  const vgvTotal = metrics?.vgvTotal || 0;
  const vgvVendido = metrics?.vgvVendido || 0;
  const vgvEmNegociacao = metrics?.vgvEmNegociacao || 0;
  const negociacoesAbertas = metrics?.negociacoesAbertas || 0;
  const sellThrough = metrics?.sellThrough || 0;
  const vsoMensal = metrics?.vsoMensal || 0;
  const vsoTarget = metrics?.vsoTarget || 6.0;
  const unidadesDisponiveis = metrics?.unidadesDisponiveis || 0;
  const unidadesReservadas = metrics?.unidadesReservadas || 0;
  const unidadesVendidas = metrics?.unidadesVendidas || 0;
  const unidadesTotal = metrics?.unidadesTotal || 0;
  const funilData = metrics?.funil || [];
  const vendasCurva = metrics?.salesCurve || [];
  const canaisData = metrics?.canais || [];
  const corretoresData = metrics?.corretores || [];

  // Cálculos de Simulação
  const projectedVGVTotal = mode === 'simulation' && simulationParams 
    ? vgvTotal * (1 + simulationParams.priceAdjust / 100) 
    : vgvTotal;

  // Curva de absorção logística real (pricingService.simulateAbsorption), não mais uma
  // reta ingênua. O horizonte (meses até esgotar) respeita a velocidade que o usuário
  // pediu no slider — só a FORMA da curva (lenta no início/fim, rápida no meio) muda.
  const simulationData = mode === 'simulation' && simulationParams ? (() => {
    const avgPricePerUnit = unidadesTotal > 0 ? vgvTotal / unidadesTotal : 0;
    const currentMonthIndex = new Date().getMonth();
    const monthsToSellOut = Math.max(1, Math.ceil(unidadesDisponiveis / Math.max(1, simulationParams.monthlySales)));
    const remainingMonths = Math.max(1, vendasCurva.length - currentMonthIndex);
    const absorption = pricingService.simulateAbsorption(
      unidadesDisponiveis,
      Math.max(monthsToSellOut, remainingMonths),
      0.5,
    );

    let absIdx = 0;
    return vendasCurva.map((d, i) => {
      if (i < currentMonthIndex) {
        return { ...d, simulado: d.real };
      }
      const unitsSold = absorption[absIdx]?.total ?? absorption[absorption.length - 1]?.total ?? 0;
      absIdx++;
      const simulado = Math.min(vgvVendido + unitsSold * avgPricePerUnit, projectedVGVTotal);
      return { ...d, simulado };
    });
  })() : vendasCurva;

  // Semáforo VSO — §8: status é texto simples colorido, nunca pílula. Aqui ele
  // vive dentro do KpiCard, então vira rótulo + a cor semântica do próprio card.
  const vsoStatus = (value: number): { label: string; color: 'emerald' | 'blue' | 'amber' | 'red' } => {
    if (value >= vsoTarget + 2) return { label: 'Excelente', color: 'emerald' };
    if (value >= vsoTarget) return { label: 'Na meta', color: 'blue' };
    if (value >= vsoTarget - 2) return { label: 'Atenção', color: 'amber' };
    return { label: 'Alerta crítico', color: 'red' };
  };

  const currentVSO = mode === 'simulation' 
    ? (unidadesTotal > 0 ? ((simulationParams?.monthlySales || 0) / unidadesTotal * 100) : 0)
    : vsoMensal;

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-gray-500 space-y-4">
        <div className="w-8 h-8 rounded-full border-4 border-t-blue-500 border-blue-200 animate-spin"></div>
        <p className="font-medium animate-pulse">Carregando indicadores financeiros e funil...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* 1. PAINEL EXECUTIVO (TOPO) — título solto (§20) */}
      <div>
        <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <Target className="w-6 h-6 text-blue-600" />
          {mode === 'simulation' ? 'Projeção (Simulação)' : 'Painel Executivo'}
        </h2>
      </div>

      {/* Toolbar de botões (§5.3) — início e ciclo decidem QUAL recorte de tempo a
          tela olha, então são controles de escopo: barra própria, separada do
          título, com todo controle em h-9 + rounded-[6px]. Antes viviam fundidos na
          linha do <h2>, num container rounded-[1.5rem] com input/select sem borda. */}
      <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-500">
            <Clock className="w-4 h-4 text-gray-400" />
            Início
          </label>
          <input
            type="month"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
          />

          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-500 ml-2">Ciclo</label>
          <select
            value={periodMonths}
            onChange={(e) => setPeriodMonths(Number(e.target.value))}
            className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
          >
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
            <option value={18}>18 meses</option>
            <option value={24}>24 meses</option>
            <option value={36}>36 meses</option>
            <option value={48}>48 meses</option>
          </select>
        </div>
      </div>

      {/* KPI cards (§4) — componente canônico ui/KpiCard, não JSX à mão. Cinco cards
          em `size="sm"`, a mesma régua da aba "Unidades do edifício" deste módulo:
          no tamanho `md` os `sub` deste painel não cabiam e saíam truncados
          ("+ R$ 400…", "Alerta …") — o `sub` do KpiCard é `truncate`. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard
          shadow={false} size="sm"
          label={mode === 'simulation' ? 'VGV Projetado' : 'VGV Total (Lançamento)'}
          value={formatCurrency(projectedVGVTotal)}
          sub={mode === 'simulation' && simulationParams?.priceAdjust
            ? `${simulationParams.priceAdjust > 0 ? '+' : ''}${simulationParams.priceAdjust}% de ajuste`
            : undefined}
          icon={<DollarSign className="w-4 h-4" />}
          color="blue"
        />

        <KpiCard
          shadow={false} size="sm"
          label="VGV Vendido"
          value={formatCurrency(vgvVendido)}
          sub={`${sellThrough.toFixed(1)}% realizado`}
          icon={<DollarSign className="w-4 h-4" />}
          color="emerald"
        />

        {/* O pipeline ao lado do realizado: sem este card, um empreendimento com
            milhões em negociação aberta mostrava só "R$ 0" — foi o que fez a aba
            parecer desligada da de Negociações. */}
        <KpiCard
          shadow={false} size="sm"
          label="VGV em Negociação"
          value={formatCurrency(vgvEmNegociacao)}
          sub={`${negociacoesAbertas} ${negociacoesAbertas === 1 ? 'negociação aberta' : 'negociações abertas'}`}
          icon={<Target className="w-4 h-4" />}
          color="indigo"
        />

        <KpiCard
          shadow={false} size="sm"
          label={mode === 'simulation' ? 'Velocidade Simulada' : 'Velocidade (VSO Mês)'}
          value={`${currentVSO.toFixed(1)}%`}
          sub={mode === 'simulation'
            ? `${simulationParams?.monthlySales} und. p/ mês`
            : `${vsoStatus(currentVSO).label} · meta ${vsoTarget}%`}
          icon={<Activity className="w-4 h-4" />}
          color={vsoStatus(currentVSO).color}
        />

        {/* Antes o número era `total − disponíveis` sob o rótulo "Unidades
            vendidas" — o que contava reservada como vendida e contradizia o VGV
            Vendido do card ao lado. Vendida é status SOLD; reservada tem linha
            própria. */}
        <KpiCard
          shadow={false} size="sm"
          label="Estoque Físico"
          value={`${unidadesVendidas} / ${unidadesTotal}`}
          sub={`${unidadesReservadas} reservadas · ${unidadesDisponiveis} disponíveis`}
          icon={<Percent className="w-4 h-4" />}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 2. CURVA DE VENDAS (CENTRO/ESQUERDA) */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-900">
                {mode === 'simulation' ? 'Simulação de Cronograma Financeiro' : 'Curva de Vendas vs Planejado (S-Curve)'}
              </h3>
              <p className="text-sm font-medium text-gray-500">
                {mode === 'simulation' ? 'Projeção logística baseada nos parâmetros ajustados' : 'Acompanhamento do cronograma financeiro de absorção'}
              </p>
            </div>
            <div className="flex gap-4">
               <div className="flex items-center gap-2 text-xs font-bold text-gray-500"><div className="w-3 h-3 rounded-full bg-blue-100 border-2 border-blue-400" />Planejado</div>
               {mode === 'simulation' ? (
                 <div className="flex items-center gap-2 text-xs font-bold text-gray-500"><div className="w-3 h-3 rounded-full bg-purple-500" />Simulado</div>
               ) : (
                 <div className="flex items-center gap-2 text-xs font-bold text-gray-500"><div className="w-3 h-3 rounded-full bg-emerald-500" />Realizado</div>
               )}
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={simulationData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPlanejado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSimulado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 600 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 600 }} dx={-10} tickFormatter={(val) => `R$ ${(val/1000000).toFixed(1)}M`} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <RechartsTooltip 
                  formatter={(value: any, name: any) => [formatCurrency(Number(value)), name]}
                  contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
                />
                <Area type="monotone" dataKey="planejado" name="VGV Planejado" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorPlanejado)" />
                {mode === 'simulation' ? (
                  <Area type="monotone" dataKey="simulado" name="VGV Simulado" stroke="#8b5cf6" strokeWidth={4} fillOpacity={1} fill="url(#colorSimulado)" />
                ) : (
                  <Area type="monotone" dataKey="real" name="VGV Realizado" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorReal)" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. FUNIL DE VENDAS (ESQUERDA/DIREITA) */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
          <h3 className="text-lg font-black text-gray-900">Funil Comercial Completo</h3>
          <p className="text-sm font-medium text-gray-500 mb-6">Negociações por etapa, na ordem do fluxo — as mesmas da aba Negociações.</p>
          <div className="flex-1 flex flex-col justify-center gap-3">
             {(() => {
               // Escala relativa à etapa mais cheia (não à primeira): o pipeline não é
               // monotônico — pode haver 5 em Aprovação e 1 em Proposta, e uma barra
               // maior que 100% da primeira ficaria estourada.
               const maxVal = Math.max(...funilData.map(s => s.value), 1);
               return funilData.map((step, index) => {
                 const pct = (step.value / maxVal) * 100;
                 return (
                    <div key={step.name} className="relative group">
                       <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">{step.name}</span>
                          <span className="text-sm font-black text-gray-900">
                             {step.value}
                             {step.valor > 0 && (
                               <span className="ml-2 text-xs font-bold text-gray-400">{formatCurrency(step.valor)}</span>
                             )}
                          </span>
                       </div>
                       <div className="w-full h-8 bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
                          <div
                             className="h-full rounded-lg transition-all duration-1000 ease-out"
                             style={{ width: `${step.value === 0 ? 0 : Math.max(pct, 8)}%`, backgroundColor: COLORS[index % COLORS.length] }}
                          />
                       </div>
                    </div>
                 );
               });
             })()}
             {funilData.every(s => s.value === 0) && (
               <p className="text-sm font-medium text-gray-400 text-center py-6">Nenhuma negociação registrada neste empreendimento.</p>
             )}
          </div>
          {/* Saíram daqui "CAC Médio R$ 3.450" e "Tempo Resposta 18 min": eram
              literais no código, não vinham de dado nenhum. Número plausível no
              lugar de número real é pior que campo ausente — quem lê acredita. */}
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* 4. PERFORMANCE CORRETORES */}
         <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h3 className="text-lg font-black text-gray-900 mb-6">Ranking de Corretores</h3>
            <div className="space-y-4">
               {corretoresData.map((broker, idx) => (
                  <div key={broker.id} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-colors">
                     <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${idx === 0 ? 'bg-amber-100 text-amber-600' : idx === 1 ? 'bg-gray-100 text-gray-600' : idx === 2 ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-600'}`}>
                        {idx + 1}º
                     </div>
                     <div className="flex-1">
                        <p className="font-bold text-gray-900">{broker.name}</p>
                        <div className="flex gap-4 text-xs font-semibold text-gray-500 mt-1">
                           <span className="flex items-center gap-1"><Users className="w-3 h-3"/> {broker.leads} leads</span>
                           <span className="flex items-center gap-1"><Target className="w-3 h-3"/> {broker.sales} vendas</span>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="font-black text-emerald-600">{formatCurrency(broker.vgv)}</p>
                        <span className="flex items-center justify-end gap-1 text-xs font-bold text-gray-400 uppercase tracking-widest mt-1"><Clock className="w-3 h-3"/> SLA {broker.responseTime}</span>
                     </div>
                  </div>
               ))}
            </div>
         </div>

         {/* 5. MARKETING & RISCO */}
         <div className="flex flex-col gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex-1">
               <h3 className="text-lg font-black text-gray-900 mb-6">Origem de Vendas (Marketing)</h3>
               <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                        <Pie data={canaisData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                           {canaisData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} />
                        <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#4b5563' }} />
                     </PieChart>
                  </ResponsiveContainer>
               </div>
            </div>

            <div className="bg-red-50 p-6 rounded-[2rem] border border-red-100 flex items-center justify-between">
               <div>
                  <h3 className="text-sm font-black text-red-900 uppercase tracking-widest flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4" /> Alertas de Risco</h3>
                  <p className="text-xs font-bold text-red-700">Acompanhamento da esteira financeira</p>
               </div>
               <div className="flex gap-4">
                  <div className="bg-white px-4 py-2 rounded-xl text-center shadow-sm">
                     <span className="block text-xs font-black text-gray-400 uppercase tracking-widest">Distratos Mês</span>
                     <span className="block text-xl font-black text-red-600">{metrics?.distratos || 0}</span>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-xl text-center shadow-sm">
                     <span className="block text-xs font-black text-gray-400 uppercase tracking-widest">Reprovação Créd.</span>
                     <span className="block text-xl font-black text-amber-600">{metrics?.reprovacaoCredito?.toFixed(1) || 0}%</span>
                  </div>
               </div>
            </div>
         </div>
         
      </div>

    </div>
  );
}
