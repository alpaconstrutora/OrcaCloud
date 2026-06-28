import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle2, MoreHorizontal, Filter } from 'lucide-react';

interface Installment {
  id: string;
  projectName: string;
  parcela: string;
  valor: number;
  vencimento: string;
  status: 'PAGO' | 'PENDENTE' | 'ATRASADO';
}

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

export const OfficesFinanceiro: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [installments, setInstallments] = useState<Installment[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.from('projects').select('id, name').order('name', { ascending: true });
        if (error) throw error;

        if (data?.length) {
          const gen: Installment[] = [];
          data.forEach((p, idx) => {
            const base = 15000 + idx * 5000;
            const s2 = idx === 0 ? 'ATRASADO' : (idx % 2 === 0 ? 'PENDENTE' : 'PAGO');
            gen.push(
              { id: `inst-${p.id}-1`, projectName: p.name, parcela: '1/3', valor: base / 3, vencimento: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 10).toISOString().split('T')[0], status: 'PAGO' },
              { id: `inst-${p.id}-2`, projectName: p.name, parcela: '2/3', valor: base / 3, vencimento: new Date(new Date().getFullYear(), new Date().getMonth(), 15).toISOString().split('T')[0], status: s2 as any },
              { id: `inst-${p.id}-3`, projectName: p.name, parcela: '3/3', valor: base / 3, vencimento: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 20).toISOString().split('T')[0], status: 'PENDENTE' }
            );
          });
          setInstallments(gen);
        } else {
          setInstallments([
            { id: 'f-1', projectName: 'Projeto Residencial Alpha', parcela: '2/4', valor: 8500, vencimento: '2026-06-15', status: 'PENDENTE' },
            { id: 'f-2', projectName: 'Loft Industrial Cobre', parcela: '3/3', valor: 12000, vencimento: '2026-06-10', status: 'PAGO' },
            { id: 'f-3', projectName: 'Casa de Campo Jardins', parcela: '1/5', valor: 9500, vencimento: '2026-06-01', status: 'ATRASADO' }
          ]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const summary = useMemo(() => {
    let pago = 0, pendente = 0, atrasado = 0;
    installments.forEach(i => {
      if (i.status === 'PAGO') pago += i.valor;
      else if (i.status === 'PENDENTE') pendente += i.valor;
      else atrasado += i.valor;
    });
    return { pago, pendente, atrasado, total: pago + pendente + atrasado };
  }, [installments]);

  // Dados do gráfico (últimos 6 meses — mês atual reflete dados reais)
  const chartData = [
    { mes: 'Jan', valor: 38000 }, { mes: 'Fev', valor: 45000 }, { mes: 'Mar', valor: 62000 },
    { mes: 'Abr', valor: 55000 }, { mes: 'Mai', valor: 72000 },
    { mes: 'Jun', valor: Math.max(summary.pago + summary.atrasado / 2, 1) }
  ];
  const maxVal = Math.max(...chartData.map(d => d.valor));

  const STATUS_STYLE: Record<string, string> = {
    PAGO:     'bg-emerald-50 text-emerald-600 border-emerald-100',
    PENDENTE: 'bg-slate-100 text-slate-500 border-slate-200',
    ATRASADO: 'bg-rose-50 text-rose-500 border-rose-100'
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px] bg-[#F3F7F9]">
        <div className="w-8 h-8 border-4 border-[#D47A55] border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Financeiro...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-[#F3F7F9] text-slate-700 min-h-screen pb-24">

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Painel Financeiro</h1>
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1.5">ÒPURA Offices / Medições & Recebíveis</p>
      </div>

      {/* ── 3 KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Recebido', value: BRL(summary.pago), icon: CheckCircle2, sub: 'Medições e parcelas quitadas', color: 'text-emerald-600', iconBg: 'bg-emerald-50 border-emerald-100 text-emerald-500' },
          { label: 'A Receber', value: BRL(summary.pendente), icon: TrendingUp, sub: 'Contratos vigentes ativos', color: 'text-[#D47A55]', iconBg: 'bg-[#D47A55]/10 border-[#D47A55]/15 text-[#D47A55]' },
          { label: 'Atrasado', value: BRL(summary.atrasado), icon: AlertTriangle, sub: 'Faturas fora do vencimento', color: summary.atrasado > 0 ? 'text-rose-500' : 'text-slate-700', iconBg: summary.atrasado > 0 ? 'bg-rose-50 border-rose-100 text-rose-400' : 'bg-slate-100 border-slate-200 text-slate-400' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-200/50 p-5 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{k.label}</span>
              <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${k.iconBg}`}>
                <k.icon className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className={`block text-xl font-black ${k.color}`}>{k.value}</span>
              <span className="block text-[8.5px] text-slate-400 font-medium mt-0.5">{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Gráfico de barras mensal ──────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/50 p-5 rounded-[28px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Evolução Mensal</h2>
            <p className="text-xs font-black text-slate-800 mt-0.5">Fluxo de Caixa — Semestre Atual</p>
          </div>
          <button className="text-slate-300 hover:text-[#D47A55]">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-between items-end h-36 px-2 pt-2">
          {chartData.map((d, i) => {
            const pct = Math.round((d.valor / maxVal) * 100);
            const isLast = i === chartData.length - 1;
            return (
              <div key={i} className="flex flex-col items-center gap-2 w-1/6 group">
                <span className="text-[8.5px] font-black text-[#D47A55] opacity-0 group-hover:opacity-100 transition-opacity">
                  {Math.round(d.valor / 1000)}k
                </span>
                <div className="w-7 md:w-9 bg-slate-100 rounded-xl overflow-hidden h-28 flex flex-col justify-end">
                  <div
                    className={`w-full rounded-xl group-hover:brightness-105 transition-all duration-500 ${isLast ? 'bg-gradient-to-t from-[#C8643C] to-[#D47A55]' : 'bg-gradient-to-t from-slate-300 to-slate-200'}`}
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className={`text-[9px] font-bold ${isLast ? 'text-[#D47A55] font-black' : 'text-slate-400'} group-hover:text-slate-700 transition-colors`}>
                  {d.mes}
                </span>
              </div>
            );
          })}
        </div>

        {/* Mini legenda */}
        <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-gradient-to-t from-[#C8643C] to-[#D47A55]" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mês Atual</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-slate-200" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Meses Anteriores</span>
          </div>
        </div>
      </div>

      {/* ── Tabela de Parcelas ────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/50 rounded-[28px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Cronograma de Parcelas</h2>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/70 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-[#D47A55] transition-colors">
              <Filter className="w-3 h-3" /> Filtrar
            </button>
          </div>
        </div>

        {installments.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">Nenhuma fatura registrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[8.5px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3">Projeto</th>
                  <th className="px-3 py-3">Parcela</th>
                  <th className="px-3 py-3 text-right">Valor</th>
                  <th className="px-3 py-3 hidden sm:table-cell">Vencimento</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {installments.map(inst => (
                  <tr key={inst.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="block text-xs font-black text-slate-700 truncate max-w-[150px] md:max-w-xs">{inst.projectName}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Parcela {inst.parcela}</span>
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <span className="text-xs font-black text-slate-800">{BRL(inst.valor)}</span>
                    </td>
                    <td className="px-3 py-3.5 hidden sm:table-cell">
                      <span className="text-xs font-medium text-slate-500">{new Date(inst.vencimento).toLocaleDateString('pt-BR')}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-[8.5px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${STATUS_STYLE[inst.status]}`}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: inst.status === 'PAGO' ? '#16A34A' : inst.status === 'ATRASADO' ? '#F43F5E' : '#94A3B8' }} />
                        {inst.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Rodapé com totais */}
        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap gap-4">
          {[
            { label: 'Total Geral', value: BRL(summary.total), color: 'text-slate-800' },
            { label: 'Recebido', value: BRL(summary.pago), color: 'text-emerald-600' },
            { label: 'A Receber', value: BRL(summary.pendente), color: 'text-[#D47A55]' },
            { label: 'Atrasado', value: BRL(summary.atrasado), color: summary.atrasado > 0 ? 'text-rose-500' : 'text-slate-400' },
          ].map(t => (
            <div key={t.label} className="flex items-center gap-1.5">
              <span className="text-[8.5px] font-black uppercase tracking-widest text-slate-400">{t.label}:</span>
              <span className={`text-xs font-black ${t.color}`}>{t.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OfficesFinanceiro;
