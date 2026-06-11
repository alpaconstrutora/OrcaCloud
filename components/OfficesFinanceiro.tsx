import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle2, Calendar, ArrowUpRight, ArrowLeft } from 'lucide-react';

interface Installment {
  id: string;
  projectName: string;
  parcela: string;
  valor: number;
  vencimento: string;
  status: 'PAGO' | 'PENDENTE' | 'ATRASADO';
}

export const OfficesFinanceiro: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);

  useEffect(() => {
    const fetchProjectsAndGenerateFinance = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('projects')
          .select('id, name')
          .order('name', { ascending: true });

        if (error) throw error;
        setProjects(data || []);

        // Gerar dados financeiros simulados vinculados a projetos reais
        if (data && data.length > 0) {
          const generatedInstallments: Installment[] = [];
          data.forEach((p, idx) => {
            // Geramos 2 a 3 parcelas para cada projeto real
            const valorProjeto = 15000 + (idx * 5000);
            
            // Parcela 1: Geralmente Paga
            generatedInstallments.push({
              id: `inst-${p.id}-1`,
              projectName: p.name,
              parcela: '1/3',
              valor: valorProjeto / 3,
              vencimento: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 10).toISOString().split('T')[0],
              status: 'PAGO'
            });

            // Parcela 2: Varia entre Pendente, Pago ou Atrasado
            const status2 = idx === 0 ? 'ATRASO' as any : (idx % 2 === 0 ? 'PENDENTE' : 'PAGO');
            generatedInstallments.push({
              id: `inst-${p.id}-2`,
              projectName: p.name,
              parcela: '2/3',
              valor: valorProjeto / 3,
              vencimento: new Date(new Date().getFullYear(), new Date().getMonth(), 15).toISOString().split('T')[0],
              status: status2 === 'ATRASO' ? 'ATRASADO' : status2
            });

            // Parcela 3: Pendente (no futuro)
            generatedInstallments.push({
              id: `inst-${p.id}-3`,
              projectName: p.name,
              parcela: '3/3',
              valor: valorProjeto / 3,
              vencimento: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 20).toISOString().split('T')[0],
              status: 'PENDENTE'
            });
          });
          setInstallments(generatedInstallments);
        } else {
          // Fallback se não houver projetos
          setInstallments([
            { id: 'f-1', projectName: 'Projeto Residencial Alpha', parcela: '2/4', valor: 8500, vencimento: '2026-06-15', status: 'PENDENTE' },
            { id: 'f-2', projectName: 'Loft Industrial Cobre', parcela: '3/3', valor: 12000, vencimento: '2026-06-10', status: 'PAGO' },
            { id: 'f-3', projectName: 'Casa de Campo Jardins', parcela: '1/5', valor: 9500, vencimento: '2026-06-01', status: 'ATRASADO' }
          ]);
        }
      } catch (err) {
        console.error('Erro ao buscar projetos para financeiro:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjectsAndGenerateFinance();
  }, []);

  // Consolidar totais
  const financeSummary = useMemo(() => {
    let totalPago = 0;
    let totalPendente = 0;
    let totalAtrasado = 0;

    installments.forEach(item => {
      if (item.status === 'PAGO') totalPago += item.valor;
      else if (item.status === 'PENDENTE') totalPendente += item.valor;
      else if (item.status === 'ATRASADO') totalAtrasado += item.valor;
    });

    return { totalPago, totalPendente, totalAtrasado };
  }, [installments]);

  // Dados do gráfico de barras simulado (Últimos 5 meses + Atual)
  const chartData = [
    { mes: 'Jan', valor: 38000 },
    { mes: 'Fev', valor: 45000 },
    { mes: 'Mar', valor: 62000 },
    { mes: 'Abr', valor: 55000 },
    { mes: 'Mai', valor: 72000 },
    { mes: 'Jun', valor: financeSummary.totalPago + financeSummary.totalAtrasado / 2 } // jun refletindo a soma real
  ];

  const maxVal = Math.max(...chartData.map(d => d.valor)) || 1;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px] bg-[#121315]">
        <div className="w-8 h-8 border-4 border-[#D47A55] border-t-transparent rounded-full animate-spin mb-3 text-[#D47A55]" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Carregando Fluxo Financeiro...</span>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6 bg-[#121315] text-slate-100 min-h-screen pb-24">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-white tracking-tight">Painel Financeiro</h1>
        <p className="text-xs font-semibold text-slate-400">Medições, recebíveis e faturamento do escritório</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Recebido */}
        <div className="bg-[#1E2022] border border-white/5 p-4 rounded-[24px] shadow-lg flex flex-col justify-between h-28 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Recebido</span>
            <div className="w-7 h-7 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="block text-lg font-black text-white">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(financeSummary.totalPago)}
            </span>
            <span className="block text-[8px] text-slate-400">Medições e parcelas quitadas</span>
          </div>
        </div>

        {/* A Receber */}
        <div className="bg-[#1E2022] border border-white/5 p-4 rounded-[24px] shadow-lg flex flex-col justify-between h-28 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">A Receber</span>
            <div className="w-7 h-7 bg-[#D47A55]/10 border border-[#D47A55]/20 rounded-lg flex items-center justify-center text-[#D47A55]">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="block text-lg font-black text-[#D47A55]">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(financeSummary.totalPendente)}
            </span>
            <span className="block text-[8px] text-slate-400">Contratos vigentes ativos</span>
          </div>
        </div>

        {/* Atrasado */}
        <div className="bg-[#1E2022] border border-white/5 p-4 rounded-[24px] shadow-lg flex flex-col justify-between h-28 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Atrasado</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
              financeSummary.totalAtrasado > 0 
                ? 'bg-red-500/10 border-red-500/20 text-red-400 animate-pulse' 
                : 'bg-slate-800 border-white/5 text-slate-500'
            }`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className={`block text-lg font-black ${financeSummary.totalAtrasado > 0 ? 'text-red-400' : 'text-white'}`}>
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(financeSummary.totalAtrasado)}
            </span>
            <span className="block text-[8px] text-slate-400">Faturas fora do vencimento</span>
          </div>
        </div>
      </div>

      {/* Gráfico de Faturamento Mensal */}
      <div className="bg-[#1E2022] border border-white/5 p-5 rounded-[28px] shadow-lg space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-[8px] font-black uppercase tracking-widest text-[#D47A55]">Fluxo de Caixa</span>
            <h2 className="text-sm font-black text-white mt-0.5">Evolução Mensal (R$)</h2>
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-900 px-2.5 py-1 rounded-full border border-white/5">
            Semestre Atual
          </span>
        </div>

        <div className="flex justify-between items-end h-32 pt-4 px-2">
          {chartData.map((d, index) => {
            const pct = Math.round((d.valor / maxVal) * 100);
            return (
              <div key={index} className="flex flex-col items-center gap-2 w-1/6 group">
                {/* Tooltip no Hover */}
                <span className="text-[8px] font-black text-[#D47A55] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {Math.round(d.valor / 1000)}k
                </span>
                
                {/* Barra */}
                <div className="w-6 md:w-8 bg-slate-900 rounded-lg overflow-hidden h-24 flex flex-col justify-end">
                  <div 
                    className="w-full bg-gradient-to-t from-[#C8643C] to-[#D47A55] rounded-lg group-hover:brightness-110 transition-all duration-500" 
                    style={{ height: `${pct}%` }}
                  />
                </div>
                
                {/* Nome do Mês */}
                <span className="text-[9px] font-bold text-slate-500 group-hover:text-white transition-colors">{d.mes}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabela de Faturas */}
      <div className="bg-[#1E2022] border border-white/5 p-5 rounded-[28px] shadow-lg space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-[#D47A55]">Cronograma de Parcelas</h2>
        
        {installments.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500">
            Nenhuma fatura registrada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="pb-3 text-[8px] font-black uppercase tracking-widest text-slate-500">Projeto / Parcela</th>
                  <th className="pb-3 text-[8px] font-black uppercase tracking-widest text-slate-500">Valor</th>
                  <th className="pb-3 text-[8px] font-black uppercase tracking-widest text-slate-500">Vencimento</th>
                  <th className="pb-3 text-[8px] font-black uppercase tracking-widest text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {installments.map((inst) => (
                  <tr key={inst.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3">
                      <span className="block text-xs font-black text-white truncate max-w-[150px] md:max-w-xs">{inst.projectName}</span>
                      <span className="block text-[8px] font-black text-slate-500 uppercase tracking-wider">Parcela {inst.parcela}</span>
                    </td>
                    <td className="py-3 text-xs font-black text-white">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.valor)}
                    </td>
                    <td className="py-3 text-xs text-slate-400 font-bold">
                      {new Date(inst.vencimento).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3">
                      <span className={`inline-block text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        inst.status === 'PAGO' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/10' :
                        inst.status === 'ATRASADO' ? 'bg-red-500/20 text-red-400 border border-red-500/10 animate-pulse' :
                        'bg-slate-800 text-slate-400 border border-white/5'
                      }`}>
                        {inst.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficesFinanceiro;
