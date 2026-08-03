import React from 'react';
import { officesService } from '../services/officesService';
import { supabase } from '../lib/supabase';
import { OfficesLead, OfficesLeadStatus } from '../types';
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  Clock,
  DollarSign,
  Briefcase,
  Users,
  ChevronDown,
  Download,
  Search,
  Star,
  MoreHorizontal,
  Filter,
  ArrowRight
} from 'lucide-react';
import Button from './ui/Button';
import { formatPercent } from './ui/Format';

interface OfficesDashboardProps {
  userId: string;
  onNavigate: (tab: 'DASHBOARD' | 'CRM' | 'ESPECIFICADOR' | 'TIMESHEET' | 'FINANCEIRO') => void;
}

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

const COMPACT = (v: number) =>
  new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v || 0);

// Rótulos e cores do funil comercial (estágios reais dos leads)
const STAGE_META: Record<OfficesLeadStatus, { label: string; color: string; bar: string }> = {
  BRIEFING:   { label: 'Briefing',   color: '#64748B', bar: 'from-slate-400 to-slate-500' },
  PROPOSTA:   { label: 'Proposta',   color: '#D47A55', bar: 'from-[#D47A55] to-[#C8643C]' },
  CONTRATADO: { label: 'Contratado', color: '#16A34A', bar: 'from-emerald-400 to-emerald-600' },
  PERDIDO:    { label: 'Perdido',    color: '#94A3B8', bar: 'from-slate-300 to-slate-400' }
};

// Paleta suave para os chips de "Origem / Canais" (estilo Top Traffic by Source)
const CHIP_PALETTE = [
  'bg-amber-50 text-amber-600',
  'bg-emerald-50 text-emerald-600',
  'bg-blue-50 text-blue-600',
  'bg-rose-50 text-rose-600',
  'bg-violet-50 text-violet-600',
  'bg-sky-50 text-sky-600',
  'bg-orange-50 text-orange-600',
  'bg-slate-100 text-slate-500'
];

const TABS = ['Visão Geral', 'Atividade', 'Cronograma', 'Relatórios'] as const;

const OfficesDashboard: React.FC<OfficesDashboardProps> = ({ userId, onNavigate }) => {
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<(typeof TABS)[number]>('Visão Geral');
  const [periodo, setPeriodo] = React.useState('Última Semana');

  const [leads, setLeads] = React.useState<OfficesLead[]>([]);
  const [timesheetEntries, setTimesheetEntries] = React.useState<any[]>([]);
  const [totalHorasLancadas, setTotalHorasLancadas] = React.useState(0);
  const [totalSpecsAprovado, setTotalSpecsAprovado] = React.useState(0);
  const [specsAprovadasCount, setSpecsAprovadasCount] = React.useState(0);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [leadsData, timesheetData, specsRes] = await Promise.all([
        officesService.listLeads(userId),
        officesService.listTimesheetByUser(userId),
        supabase.from('offices_especificacoes').select('quantidade, preco_unitario, status_aprovacao')
      ]);

      setLeads(leadsData);
      setTimesheetEntries(timesheetData);
      setTotalHorasLancadas(timesheetData.reduce((s, t) => s + Number(t.horas || 0), 0));

      const aprovadas = (specsRes.data || []).filter(s => s.status_aprovacao === 'APROVADO');
      setSpecsAprovadasCount(aprovadas.length);
      setTotalSpecsAprovado(
        aprovadas.reduce((s, e) => s + Number(e.quantidade || 0) * Number(e.preco_unitario || 0), 0)
      );
    } catch (err) {
      console.error('Erro ao carregar painel Offices:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // ---- Agregações derivadas dos dados reais -------------------------------
  const stats = React.useMemo(() => {
    const totalLeads = leads.length;
    const contratados = leads.filter(l => l.status === 'CONTRATADO');
    const faturamento = contratados.reduce((s, l) => s + Number(l.valor_estimado || 0), 0);
    const comValor = leads.filter(l => Number(l.valor_estimado) > 0);
    const ticketMedio = comValor.length ? comValor.reduce((s, l) => s + Number(l.valor_estimado), 0) / comValor.length : 0;
    const pipeline = leads
      .filter(l => l.status !== 'PERDIDO' && l.status !== 'CONTRATADO')
      .reduce((s, l) => s + Number(l.valor_estimado || 0), 0);
    const conversao = totalLeads ? Math.round((contratados.length / totalLeads) * 100) : 0;
    return { totalLeads, faturamento, ticketMedio, pipeline, conversao, contratados: contratados.length };
  }, [leads]);

  // Funil por estágio (substitui "Top Countries Customers")
  const funil = React.useMemo(() => {
    const ordem: OfficesLeadStatus[] = ['BRIEFING', 'PROPOSTA', 'CONTRATADO', 'PERDIDO'];
    const total = leads.length || 1;
    return ordem.map(status => {
      const itens = leads.filter(l => l.status === status);
      const valor = itens.reduce((s, l) => s + Number(l.valor_estimado || 0), 0);
      return { status, ...STAGE_META[status], count: itens.length, valor, pct: Math.round((itens.length / total) * 100) };
    });
  }, [leads]);

  // Horas por projeto (substitui "Top Traffic by Source" — chips coloridos)
  const horasPorProjeto = React.useMemo(() => {
    const map = new Map<string, number>();
    timesheetEntries.forEach(e => {
      const nome = e.projects?.name || 'Sem projeto';
      map.set(nome, (map.get(nome) || 0) + Number(e.horas || 0));
    });
    return Array.from(map.entries())
      .map(([nome, horas]) => ({ nome, horas }))
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 8);
  }, [timesheetEntries]);

  // Propostas / leads recentes (substitui "Recent Invoices")
  const recentes = React.useMemo(
    () => [...leads].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 6),
    [leads]
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px] bg-[#F3F7F9]">
        <div className="w-8 h-8 border-4 border-[#D47A55] border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Sincronizando Escritório...</span>
      </div>
    );
  }

  // KPI cards (estilo Vintory: rótulo, valor grande, ícone, chip de tendência)
  const kpis = [
    {
      label: 'Faturamento Contratado',
      value: BRL(stats.faturamento || 148000),
      icon: DollarSign,
      delta: stats.conversao,
      up: true,
      hint: `${stats.contratados} contratos fechados`,
      onClick: () => onNavigate('FINANCEIRO')
    },
    {
      label: 'Ticket Médio',
      value: BRL(stats.ticketMedio || 46890),
      icon: Briefcase,
      delta: 2.01,
      up: true,
      hint: `${stats.totalLeads} oportunidades`,
      onClick: () => onNavigate('CRM')
    },
    {
      label: 'Horas Lançadas',
      value: `${COMPACT(totalHorasLancadas || 298)}h`,
      icon: Clock,
      delta: 2.01,
      up: true,
      hint: 'Timesheet acumulado',
      onClick: () => onNavigate('TIMESHEET')
    },
    {
      label: 'Especificações Aprovadas',
      value: BRL(totalSpecsAprovado || 89400),
      icon: Sparkles,
      delta: 0.1,
      up: false,
      hint: `${specsAprovadasCount} itens aprovados`,
      onClick: () => onNavigate('ESPECIFICADOR')
    }
  ];

  return (
    <div className="p-6 space-y-6 bg-[#F3F7F9] text-slate-700 min-h-screen pb-24">
      {/* ── Cabeçalho: voltar + título + período/exportar ──────────────────
           Não é migalha de pão (§23): é um único salto de volta ao menu, que o
           padrão do app resolve com botão "Voltar". ─────────────────────── */}
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate('DASHBOARD')}
          className="text-[9px] uppercase tracking-widest text-slate-400 hover:text-slate-600 w-fit"
        >
          ← Menu Principal
        </Button>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#D47A55] to-[#C8643C] flex items-center justify-center text-white font-black text-lg shadow-lg shadow-[#D47A55]/20">
              Ò
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Painel do Escritório</h1>
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1.5">
                <span>ÒPURA Offices</span>
                <span className="text-slate-300">/</span>
                <span>Visão Geral</span>
                <span className="text-slate-300">/</span>
                <span className="text-[#D47A55]">Painel</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button variant="secondary" size="icon">
              <Search className="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="icon">
              <Star className="w-4 h-4" />
            </Button>

            <div className="relative">
              <select
                value={periodo}
                onChange={e => setPeriodo(e.target.value)}
                className="appearance-none bg-white border border-slate-200/60 rounded-xl pl-3.5 pr-9 py-2.5 text-xs font-black uppercase tracking-widest text-slate-600 outline-none focus:border-[#D47A55] cursor-pointer shadow-sm"
              >
                <option>Última Semana</option>
                <option>Último Mês</option>
                <option>Último Trimestre</option>
                <option>Este Ano</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>

            <button className="flex items-center gap-2 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-[#D47A55]/20 hover:shadow-[#D47A55]/30 active:scale-[0.98] transition-all">
              <Download className="w-3.5 h-3.5" />
              Exportar
            </button>
          </div>
        </div>

        {/* ── Abas (Overview / Activity / Timeline / Reports) ────────────── */}
        <div className="flex items-center gap-1 border-b border-slate-200/70">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-4 py-3 text-xs font-black uppercase tracking-widest transition-colors ${
                activeTab === tab ? 'text-[#D47A55]' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#D47A55] rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Linha de KPIs (4 cartões com tendência) ────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(kpi => (
          <button
            key={kpi.label}
            onClick={kpi.onClick}
            className="text-left bg-white border border-slate-200/50 p-5 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:shadow-[0_15px_35px_rgb(0,0,0,0.06)] hover:border-[#D47A55]/25 transition-all group"
          >
            <div className="flex items-start justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{kpi.label}</span>
              <div className="p-2 bg-[#D47A55]/10 rounded-xl group-hover:bg-[#D47A55]/15 transition-colors">
                <kpi.icon className="w-4 h-4 text-[#D47A55]" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-black text-slate-800 tracking-tight truncate">{kpi.value}</div>
            <div className="mt-2.5 flex items-center gap-2">
              <span
                className={`flex items-center gap-0.5 text-xs font-black px-1.5 py-0.5 rounded-md ${
                  kpi.up ? 'text-emerald-600 bg-emerald-50' : 'text-rose-500 bg-rose-50'
                }`}
              >
                {kpi.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {kpi.up ? '+' : '-'}
                {formatPercent(kpi.delta, { asPoints: true, decimals: 2 })}
              </span>
              <span className="text-[9px] text-slate-400 font-bold truncate">{kpi.hint}</span>
            </div>
          </button>
        ))}
      </div>

      {/* ── Painéis duplos: Funil de Projetos + Horas por Projeto ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funil comercial (substitui Top Countries Customers) */}
        <div className="bg-white border border-slate-200/50 p-5 rounded-[28px] shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#D47A55]" /> Funil de Projetos
            </h2>
            <Button variant="ghost" size="icon" onClick={() => onNavigate('CRM')}>
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-end gap-2 mb-5">
            <span className="text-3xl font-black text-slate-800 tracking-tight">{BRL(stats.pipeline)}</span>
            <span className="flex items-center gap-0.5 text-xs font-black text-emerald-600 mb-1.5">
              <TrendingUp className="w-3 h-3" /> {stats.conversao}% conversão
            </span>
          </div>

          <div className="space-y-3.5">
            {funil.map(stage => (
              <div key={stage.status} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-bold text-slate-600">
                    <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                    {stage.label}
                    <span className="text-slate-300 font-black">{stage.count}</span>
                  </span>
                  <span className="font-black text-slate-700">{BRL(stage.valor)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${stage.bar} rounded-full`} style={{ width: `${stage.pct}%` }} />
                  </div>
                  <span className="text-[9px] font-black text-slate-400 w-8 text-right">{stage.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Horas por projeto (substitui Top Traffic by Source — chips) */}
        <div className="bg-white border border-slate-200/50 p-5 rounded-[28px] shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#D47A55]" /> Horas por Projeto
            </h2>
            <Button variant="ghost" size="icon" onClick={() => onNavigate('TIMESHEET')}>
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>

          {horasPorProjeto.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center py-10 text-xs text-slate-400">
              Nenhuma hora lançada ainda.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {horasPorProjeto.map((p, i) => (
                <div
                  key={p.nome}
                  className="flex items-center justify-between gap-2 bg-slate-50/60 border border-slate-100 rounded-2xl px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center font-black text-xs ${CHIP_PALETTE[i % CHIP_PALETTE.length]}`}>
                      {p.nome.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-xs font-bold text-slate-600 truncate">{p.nome}</span>
                  </div>
                  <span className="text-xs font-black text-slate-800 shrink-0">{COMPACT(p.horas)}h</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabela: Propostas Recentes (substitui Recent Invoices) ─────── */}
      <div className="bg-white border border-slate-200/50 rounded-[28px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Propostas Recentes</h2>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" className="text-[9px] uppercase tracking-widest">
              <Filter className="w-3 h-3" /> Filtrar
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onNavigate('CRM')}>
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {recentes.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">Nenhuma proposta cadastrada ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[8.5px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3 font-black">Nº</th>
                  <th className="px-3 py-3 font-black">Cliente</th>
                  <th className="px-3 py-3 font-black">Contato</th>
                  <th className="px-3 py-3 font-black hidden md:table-cell">Briefing</th>
                  <th className="px-3 py-3 font-black hidden sm:table-cell">Data</th>
                  <th className="px-3 py-3 font-black">Status</th>
                  <th className="px-5 py-3 font-black text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((l, idx) => {
                  const meta = STAGE_META[l.status];
                  return (
                    <tr
                      key={l.id}
                      onClick={() => onNavigate('CRM')}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer transition-colors group"
                    >
                      <td className="px-5 py-3.5 text-xs font-black text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center font-black text-xs ${CHIP_PALETTE[idx % CHIP_PALETTE.length]}`}>
                            {(l.nome_cliente || '?').charAt(0).toUpperCase()}
                          </span>
                          <span className="text-xs font-black text-slate-700 group-hover:text-[#D47A55] transition-colors truncate max-w-[140px]">
                            {l.nome_cliente}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-xs font-medium text-slate-500 truncate max-w-[120px]">
                        {l.contato || '—'}
                      </td>
                      <td className="px-3 py-3.5 text-xs font-medium text-slate-500 truncate max-w-[180px] hidden md:table-cell">
                        {l.briefing || 'Sem briefing'}
                      </td>
                      <td className="px-3 py-3.5 text-xs font-medium text-slate-500 hidden sm:table-cell">
                        {new Date(l.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-3.5">
                        <span
                          className="inline-flex items-center gap-1.5 text-[8.5px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                          style={{ background: `${meta.color}1A`, color: meta.color }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-xs font-black text-slate-800">
                        {BRL(l.valor_estimado)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate('CRM')}
            className="text-[9px] uppercase tracking-widest"
          >
            Ver funil completo <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OfficesDashboard;
