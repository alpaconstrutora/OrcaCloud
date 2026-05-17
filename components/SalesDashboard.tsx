import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Target, TrendingUp, AlertTriangle, Users, DollarSign, Activity, Percent, Clock } from 'lucide-react';
import type { Property } from '../types';
import { useStore } from '../store/useStore';
import { salesDashboardService, DashboardMetrics } from '../services/salesDashboardService';

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
  const { activeOrganizationId, organizations } = useStore();
  const organizationId = propsOrganizationId || activeOrganizationId || organizations[0]?.id;
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
    if (!organizationId) return;
    
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
  const sellThrough = metrics?.sellThrough || 0;
  const vsoMensal = metrics?.vsoMensal || 0;
  const vsoTarget = metrics?.vsoTarget || 6.0;
  const unidadesDisponiveis = metrics?.unidadesDisponiveis || 0;
  const unidadesTotal = metrics?.unidadesTotal || 0;
  const funilData = metrics?.funil || [];
  const vendasCurva = metrics?.salesCurve || [];
  const canaisData = metrics?.canais || [];
  const corretoresData = metrics?.corretores || [];

  // Cálculos de Simulação
  const projectedVGVTotal = mode === 'simulation' && simulationParams 
    ? vgvTotal * (1 + simulationParams.priceAdjust / 100) 
    : vgvTotal;

  const simulationData = mode === 'simulation' && simulationParams ? (() => {
    let cumulative = vgvVendido;
    const avgPricePerUnit = unidadesTotal > 0 ? vgvTotal / unidadesTotal : 0;
    const monthlyVGV = simulationParams.monthlySales * avgPricePerUnit;
    const currentMonthIndex = new Date().getMonth();

    return vendasCurva.map((d, i) => {
      if (i < currentMonthIndex) {
        return { ...d, simulado: d.real };
      }
      cumulative = Math.min(cumulative + monthlyVGV, projectedVGVTotal);
      return { ...d, simulado: cumulative };
    });
  })() : vendasCurva;

  // Renderiza status do Semáforo VSO
  const renderVSOStatus = (value: number) => {
    if (value >= vsoTarget + 2) return <span className="flex items-center gap-1 text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded text-xs font-bold"><TrendingUp className="w-3 h-3"/> Excelente</span>;
    if (value >= vsoTarget) return <span className="flex items-center gap-1 text-blue-500 bg-blue-50 px-2 py-0.5 rounded text-xs font-bold"><Activity className="w-3 h-3"/> Na Meta</span>;
    if (value >= vsoTarget - 2) return <span className="flex items-center gap-1 text-amber-500 bg-amber-50 px-2 py-0.5 rounded text-xs font-bold"><AlertTriangle className="w-3 h-3"/> Atenção</span>;
    return <span className="flex items-center gap-1 text-red-500 bg-red-50 px-2 py-0.5 rounded text-xs font-bold"><AlertTriangle className="w-3 h-3"/> Alerta Crítico</span>;
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
      
      {/* 1. PAINEL EXECUTIVO (TOPO) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <Target className="w-6 h-6 text-blue-600" /> 
          {mode === 'simulation' ? 'Projeção (Simulação)' : 'Painel Executivo'}
        </h2>
        
        <div className="flex flex-wrap items-center gap-4 bg-white px-5 py-2.5 rounded-[1.5rem] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Início:</span>
            <input 
              type="month"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm font-black text-blue-600 bg-transparent border-none focus:ring-0 cursor-pointer p-0"
            />
          </div>

          <div className="w-px h-6 bg-gray-100 mx-2 hidden md:block" />

          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ciclo:</span>
            <select 
              value={periodMonths}
              onChange={(e) => setPeriodMonths(Number(e.target.value))}
              className="text-sm font-black text-blue-600 bg-transparent border-none focus:ring-0 cursor-pointer p-0"
            >
              <option value={6}>6 Meses</option>
              <option value={12}>12 Meses</option>
              <option value={18}>18 Meses</option>
              <option value={24}>24 Meses</option>
              <option value={36}>36 Meses</option>
              <option value={48}>48 Meses</option>
            </select>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                {mode === 'simulation' ? 'VGV Projetado' : 'VGV Total (Lançamento)'}
              </span>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><DollarSign className="w-5 h-5" /></div>
            </div>
            <div className={`text-3xl font-black font-mono tracking-tighter ${mode === 'simulation' ? 'text-blue-600' : 'text-gray-900'}`}>
              {formatCurrency(projectedVGVTotal)}
            </div>
            {mode === 'simulation' && simulationParams?.priceAdjust !== 0 && (
                <p className="text-[10px] font-bold text-blue-500 mt-1 uppercase tracking-widest">
                  {simulationParams?.priceAdjust && simulationParams.priceAdjust > 0 ? '+' : ''}{simulationParams?.priceAdjust}% de ajuste
                </p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">VGV Vendido</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><DollarSign className="w-5 h-5" /></div>
            </div>
            <div className="text-3xl font-black text-emerald-600 font-mono tracking-tighter">{formatCurrency(vgvVendido)}</div>
            <p className="text-xs font-bold text-gray-400 mt-2">{sellThrough.toFixed(1)}% Realizado</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                {mode === 'simulation' ? 'Velocidade Simulada' : 'Velocidade (VSO Mês)'}
              </span>
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><Activity className="w-5 h-5" /></div>
            </div>
            <div className="flex items-end gap-3">
              <div className="text-3xl font-black text-gray-900 font-mono tracking-tighter">
                {currentVSO.toFixed(1)}%
              </div>
              <div className="mb-1">{renderVSOStatus(currentVSO)}</div>
            </div>
            <p className="text-xs font-bold text-gray-400 mt-2">
              {mode === 'simulation' ? `${simulationParams?.monthlySales} und. p/ mês` : `Meta: ${vsoTarget}% ao mês`}
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Estoque Físico</span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Percent className="w-5 h-5" /></div>
            </div>
             <div className="flex items-end gap-3">
               <div className="text-3xl font-black text-gray-900 font-mono tracking-tighter">
                  {unidadesTotal - unidadesDisponiveis} <span className="text-lg text-gray-400">/ {unidadesTotal}</span>
               </div>
            </div>
            <p className="text-xs font-bold text-gray-400 mt-2">Unidades vendidas</p>
          </div>
        </div>
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
          <h3 className="text-lg font-black text-gray-900 mb-6">Funil Comercial Completo</h3>
          <div className="flex-1 flex flex-col justify-center gap-3">
             {funilData.map((step, index) => {
               const maxVal = funilData[0]?.value || 1;
               const pct = (step.value / maxVal) * 100;
               const conversaoAnterior = index > 0 && funilData[index - 1].value ? ((step.value / funilData[index - 1].value) * 100).toFixed(1) + '%' : null;
               
               return (
                  <div key={step.name} className="relative group">
                     {conversaoAnterior && (
                        <div className="absolute -top-3 right-4 z-20 bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded shadow-sm border border-blue-100">
                           {conversaoAnterior}
                        </div>
                     )}
                     <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">{step.name}</span>
                        <span className="text-sm font-black text-gray-900">{step.value}</span>
                     </div>
                     <div className="w-full h-8 bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
                        <div 
                           className="h-full rounded-lg transition-all duration-1000 ease-out flex items-center justify-end pr-3"
                           style={{ width: `${Math.max(pct, 10)}%`, backgroundColor: COLORS[index % COLORS.length] }}
                        >
                           {index === funilData.length - 1 && <span className="text-white text-[10px] font-black">{((step.value/maxVal)*100).toFixed(1)}% Fim</span>}
                        </div>
                     </div>
                  </div>
               )
             })}
          </div>
          <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-2 gap-4">
             <div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">CAC Médio</span>
                <p className="text-lg font-black text-gray-900">R$ 3.450</p>
             </div>
             <div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tempo Resposta</span>
                <p className="text-lg font-black text-gray-900">18 min</p>
             </div>
          </div>
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
                        <span className="flex items-center justify-end gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1"><Clock className="w-3 h-3"/> SLA {broker.responseTime}</span>
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
                     <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Distratos Mês</span>
                     <span className="block text-xl font-black text-red-600">{metrics?.distratos || 0}</span>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-xl text-center shadow-sm">
                     <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Reprovação Créd.</span>
                     <span className="block text-xl font-black text-amber-600">{metrics?.reprovacaoCredito?.toFixed(1) || 0}%</span>
                  </div>
               </div>
            </div>
         </div>
         
      </div>

    </div>
  );
}
