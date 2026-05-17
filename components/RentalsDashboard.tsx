import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, Legend } from 'recharts';
import { Target, TrendingUp, AlertTriangle, Users, DollarSign, Activity, Percent, Clock, Key, Building2 } from 'lucide-react';
import type { Property } from '../types';
import { useStore } from '../store/useStore';
import { rentalsDashboardService, RentalsDashboardMetrics } from '../services/rentalsDashboardService';

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

interface RentalsDashboardProps {
  buildings?: Property[];
  selectedBuildingId?: string | null;
  organizationId?: string;
}

export function RentalsDashboard({ selectedBuildingId, organizationId: propOrganizationId }: RentalsDashboardProps) {
  const { organizations } = useStore();
  const organizationId = propOrganizationId || organizations[0]?.id;
  const [metrics, setMetrics] = useState<RentalsDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodMonths, setPeriodMonths] = useState(() => {
    const saved = localStorage.getItem('rentals_dashboard_period');
    return saved ? Number(saved) : 12;
  });
  const [startDate, setStartDate] = useState(() => {
    const saved = localStorage.getItem('rentals_dashboard_start_date');
    if (saved) return saved;
    const d = new Date();
    return `${d.getFullYear()}-01`;
  });

  // Persistência
  useEffect(() => {
    localStorage.setItem('rentals_dashboard_period', String(periodMonths));
  }, [periodMonths]);

  useEffect(() => {
    localStorage.setItem('rentals_dashboard_start_date', startDate);
  }, [startDate]);

  useEffect(() => {
    if (!organizationId) return;
    
    let isMounted = true;
    setLoading(true);

    rentalsDashboardService.getDashboardMetrics(organizationId, selectedBuildingId, periodMonths, startDate)
      .then(data => {
        if (isMounted) setMetrics(data);
      })
      .catch(error => {
        console.error('[RentalsDashboard] Error fetching:', error);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [organizationId, selectedBuildingId, periodMonths, startDate]);

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-gray-500 space-y-4">
        <div className="w-8 h-8 rounded-full border-4 border-t-purple-500 border-purple-200 animate-spin"></div>
        <p className="font-medium animate-pulse">Carregando indicadores de locação...</p>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* 1. PAINEL EXECUTIVO (TOPO) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-purple-600" /> 
          Painel de Performance (Locações)
        </h2>
        
        <div className="flex flex-wrap items-center gap-4 bg-white px-5 py-2.5 rounded-[1.5rem] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Início:</span>
            <input 
              type="month"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm font-black text-purple-600 bg-transparent border-none focus:ring-0 cursor-pointer p-0"
            />
          </div>

          <div className="w-px h-6 bg-gray-100 mx-2 hidden md:block" />

          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ciclo:</span>
            <select 
              value={periodMonths}
              onChange={(e) => setPeriodMonths(Number(e.target.value))}
              className="text-sm font-black text-purple-600 bg-transparent border-none focus:ring-0 cursor-pointer p-0"
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
        {/* Receita Mensal */}
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-100/50 rounded-2xl text-purple-600 group-hover:scale-110 transition-transform"><DollarSign className="w-6 h-6" /></div>
              <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-lg">+8.2%</span>
            </div>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Receita Mensal</h3>
            <div className="text-2xl font-black text-gray-900 tracking-tight">{formatCurrency(metrics.receitaMensal)}</div>
            <p className="text-[10px] text-gray-400 font-bold mt-1">VGV em contratos ativos</p>
          </div>
        </div>

        {/* Yield Médio */}
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-100/50 rounded-2xl text-emerald-600"><Percent className="w-6 h-6" /></div>
              <div className="flex items-center gap-1 text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-black uppercase"><Activity className="w-3 h-3"/> Alinhado</div>
            </div>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Yield Mensal Médio</h3>
            <div className="text-2xl font-black text-gray-900 tracking-tight">{metrics.yieldMensal.toFixed(2)}%</div>
            <p className="text-[10px] text-gray-400 font-bold mt-1">Retorno sobre o patrimônio</p>
          </div>
        </div>

        {/* Taxa de Ocupação */}
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700" />
            <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-blue-100/50 rounded-2xl text-blue-600"><Key className="w-6 h-6" /></div>
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{metrics.unidadesDisponiveis} un. livres</span>
                </div>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Taxa de Ocupação</h3>
                <div className="text-2xl font-black text-gray-900 tracking-tight">{metrics.taxaOcupacao.toFixed(1)}%</div>
                <div className="w-full bg-gray-100 h-1 rounded-full mt-3 overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full transition-all duration-1000" style={{ width: `${metrics.taxaOcupacao}%` }} />
                </div>
            </div>
        </div>

        {/* Valor Total do Patrimônio */}
        <div className="bg-[#0B1727] p-6 rounded-[2rem] relative overflow-hidden group shadow-2xl shadow-blue-900/20">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl -mr-10 -mt-10 animate-pulse" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/10 rounded-2xl text-blue-400"><Building2 className="w-6 h-6" /></div>
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Ativo Rentável</span>
            </div>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">VGV Patrimonial</h3>
            <div className="text-2xl font-black text-white tracking-tight">{formatCurrency(metrics.valorTotalPatrimonio)}</div>
            <p className="text-[10px] text-gray-500 font-bold mt-1">{metrics.unidadesTotal} unidades totais</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Curva de Rendimentos (S-Curve) */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">Curva de Receita (Real vs Planejado)</h3>
              <p className="text-xs text-gray-400 font-medium mt-1">Projeção de crescimento da carteira de locação</p>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.rentCurve}>
                <defs>
                  <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} tickFormatter={(val) => `R$ ${(val/1000000).toFixed(1)}M`} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 900 }}
                  formatter={(val: any) => [formatCurrency(val), '']}
                />
                <Area type="monotone" dataKey="real" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorReal)" animationDuration={1500} />
                <Area type="monotone" dataKey="planejado" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full border-2 border-blue-500 border-dashed" /><span className="text-[10px] font-black text-gray-400 uppercase">Planejado</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-[10px] font-black text-gray-400 uppercase">Realizado</span></div>
          </div>
        </div>

        {/* Tipologia e Canais */}
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h3 className="text-sm font-black text-gray-900 tracking-widest uppercase mb-6 leading-none flex items-center gap-2">
              <div className="w-1.5 h-4 bg-purple-600 rounded-full" />
              Mix de Tipologia
            </h3>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.tipologia}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {metrics.tipologia.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={36} content={(props) => (
                    <div className="flex flex-wrap justify-center gap-4 mt-4">
                        {props.payload?.map((entry: any, index: number) => (
                            <div key={index} className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span className="text-[9px] font-black text-gray-500 uppercase tracking-tighter">{entry.value}</span>
                            </div>
                        ))}
                    </div>
                  )}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-between">
            <h3 className="text-sm font-black text-gray-900 tracking-widest uppercase mb-4 leading-none flex items-center gap-2">
              <div className="w-1.5 h-4 bg-emerald-600 rounded-full" />
              Fontes de Locação
            </h3>
            <div className="space-y-3">
              {metrics.canais.map((c, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                    <span>{c.name}</span>
                    <span className="text-gray-900">{c.value}%</span>
                  </div>
                  <div className="w-full bg-gray-50 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${c.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
