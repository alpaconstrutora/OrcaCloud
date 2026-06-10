import React from 'react';
import { officesService } from '../services/officesService';
import { supabase } from '../lib/supabase';
import { OfficesLead } from '../types';

interface OfficesDashboardProps {
  userId: string;
  onNavigate: (tab: 'DASHBOARD' | 'CRM' | 'ESPECIFICADOR' | 'TIMESHEET') => void;
}

const OfficesDashboard: React.FC<OfficesDashboardProps> = ({
  userId,
  onNavigate
}) => {
  const [loading, setLoading] = React.useState(true);
  const [leads, setLeads] = React.useState<OfficesLead[]>([]);
  const [timesheetEntries, setTimesheetEntries] = React.useState<any[]>([]);

  // Estatísticas calculadas
  const [faturamentoEstimado, setFaturamentoEstimado] = React.useState(0);
  const [leadsQuentes, setLeadsQuentes] = React.useState(0);
  const [totalHorasLancadas, setTotalHorasLancadas] = React.useState(0);
  const [totalSpecsAprovado, setTotalSpecsAprovado] = React.useState(0);

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

      // Calcular faturamento contratado (soma do valor estimado dos leads contratados)
      const totalContratado = leadsData
        .filter(l => l.status === 'CONTRATADO')
        .reduce((sum, l) => sum + Number(l.valor_estimado || 0), 0);

      // Calcular leads quentes (Briefing ou Proposta)
      const quentes = leadsData.filter(l => l.status === 'BRIEFING' || l.status === 'PROPOSTA').length;

      // Calcular horas totais trabalhadas
      const totalHoras = timesheetData.reduce((sum, t) => sum + Number(t.horas || 0), 0);

      // Calcular custo total de especificações aprovadas
      const totalSpecs = (specsRes.data || [])
        .filter(s => s.status_aprovacao === 'APROVADO')
        .reduce((sum, s) => sum + (Number(s.quantidade || 0) * Number(s.preco_unitario || 0)), 0);

      setFaturamentoEstimado(totalContratado);
      setLeadsQuentes(quentes);
      setTotalHorasLancadas(totalHoras);
      setTotalSpecsAprovado(totalSpecs);
    } catch (err) {
      console.error('Erro ao carregar painel Offices:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Sincronizando Escritório...</span>
      </div>
    );
  }

  const budgetConsumptionRate = faturamentoEstimado > 0 ? Math.round((totalSpecsAprovado / faturamentoEstimado) * 100) : 0;

  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-white tracking-tight">ÒPURA Offices</h1>
        <p className="text-xs font-semibold text-slate-400">Controle inteligente de projetos e horas</p>
      </div>

      {/* Métricas Stripe-Style */}
      <div className="grid grid-cols-3 gap-4 bg-gradient-to-tr from-slate-950 to-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <span className="block text-[9px] font-black uppercase tracking-widest text-emerald-500">Contratado</span>
          <span className="text-base font-black text-white block">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(faturamentoEstimado)}
          </span>
          <span className="block text-[8px] text-slate-400">Total em projetos</span>
        </div>
        <div className="space-y-1 border-l border-slate-800 pl-4">
          <span className="block text-[9px] font-black uppercase tracking-widest text-orange-400">Leads Ativos</span>
          <span className="text-base font-black text-white block">{leadsQuentes}</span>
          <span className="block text-[8px] text-slate-400">Em prospecção</span>
        </div>
        <div className="space-y-1 border-l border-slate-800 pl-4">
          <span className="block text-[9px] font-black uppercase tracking-widest text-blue-500">Horas Lançadas</span>
          <span className="text-base font-black text-white block">{totalHorasLancadas}h</span>
          <span className="block text-[8px] text-slate-400">Acumulado total</span>
        </div>
      </div>

      {/* Controle de Orçamento Global (Orçado vs Real) */}
      {faturamentoEstimado > 0 && (
        <div className="bg-[#0D1224] border border-slate-850 p-5 rounded-2xl space-y-3 shadow-lg">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Orçamento dos Projetos</h3>
              <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Especificações Aprovadas vs Limite Estimado</p>
            </div>
            <span className="text-xs font-black text-orange-500">
              {budgetConsumptionRate}%
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden border-white/5">
            <div 
              className="h-full bg-gradient-to-r from-orange-600 to-amber-500 transition-all duration-500"
              style={{ width: `${Math.min(100, budgetConsumptionRate)}%` }}
            />
          </div>

          <div className="flex justify-between text-[10px] text-slate-400 font-bold">
            <span>Realizado (Aprovado): {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSpecsAprovado)}</span>
            <span>Orçado (Briefing): {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(faturamentoEstimado)}</span>
          </div>
        </div>
      )}

      {/* Ações Rápidas */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onNavigate('TIMESHEET')}
          className="p-3.5 bg-[#0D1224] border border-slate-800 hover:border-slate-700 rounded-2xl flex items-center justify-between text-left group active:scale-[0.98] transition-all"
        >
          <div>
            <span className="block text-xs font-bold text-white group-hover:text-orange-500 transition-colors">⏱️ Lançar Horas</span>
            <span className="text-[9px] text-slate-500 block mt-0.5">Timesheet de atividades</span>
          </div>
          <span className="text-slate-600 group-hover:translate-x-0.5 transition-transform">→</span>
        </button>
        <button
          onClick={() => onNavigate('CRM')}
          className="p-3.5 bg-[#0D1224] border border-slate-800 hover:border-slate-700 rounded-2xl flex items-center justify-between text-left group active:scale-[0.98] transition-all"
        >
          <div>
            <span className="block text-xs font-bold text-white group-hover:text-orange-500 transition-colors">🤝 Novo Lead</span>
            <span className="text-[9px] text-slate-500 block mt-0.5">Capturar briefing de cliente</span>
          </div>
          <span className="text-slate-600 group-hover:translate-x-0.5 transition-transform">→</span>
        </button>
      </div>

      {/* Kanban Simplificado - Leads Quentes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Últimos Leads Quentes</h2>
          <button
            onClick={() => onNavigate('CRM')}
            className="text-[9px] font-black uppercase tracking-widest text-orange-500 hover:text-orange-400"
          >
            Ver CRM
          </button>
        </div>
        {leads.filter(l => l.status === 'BRIEFING' || l.status === 'PROPOSTA').length === 0 ? (
          <div className="text-center py-6 px-4 border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
            Nenhum lead quente em prospecção.
          </div>
        ) : (
          <div className="space-y-3">
            {leads
              .filter(l => l.status === 'BRIEFING' || l.status === 'PROPOSTA')
              .slice(0, 3)
              .map(l => (
                <div
                  key={l.id}
                  onClick={() => onNavigate('CRM')}
                  className="bg-slate-950/40 hover:bg-slate-950/80 border border-slate-800 p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="space-y-1 max-w-[70%]">
                    <span className="block font-black text-sm text-white truncate">{l.nome_cliente}</span>
                    <span className="block text-xs text-slate-400 truncate">{l.briefing || 'Sem briefing cadastrado'}</span>
                    <span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">
                      Contato: {l.contato || 'Não informado'}
                    </span>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="block font-black text-white text-xs">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(l.valor_estimado)}
                    </span>
                    <span className={`inline-block text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                      l.status === 'PROPOSTA' ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-700/45 text-slate-400'
                    }`}>
                      {l.status}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Histórico Recente de Horas */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Lançamentos Recentes (Timesheet)</h2>
        {timesheetEntries.length === 0 ? (
          <div className="text-center py-6 px-4 border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
            Nenhuma hora lançada esta semana.
          </div>
        ) : (
          <div className="space-y-3">
            {timesheetEntries.slice(0, 3).map(entry => (
              <div
                key={entry.id}
                onClick={() => onNavigate('TIMESHEET')}
                className="bg-slate-950/40 hover:bg-slate-950/80 border border-slate-800 p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="space-y-1 max-w-[70%]">
                  <span className="block font-black text-sm text-white truncate">{entry.projects?.name}</span>
                  <span className="block text-xs text-slate-400 truncate">{entry.descricao_atividade}</span>
                  <span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">
                    Lançado em: {new Date(entry.data_lancamento).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block font-black text-orange-500 text-sm">{entry.horas}h</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficesDashboard;
