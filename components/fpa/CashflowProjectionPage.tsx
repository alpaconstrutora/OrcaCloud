import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';
import { fpaService } from '../../services/fpaService';
import dayjs from 'dayjs';

interface CashflowProjectionPageProps {
  organizationId?: string;
}

export const CashflowProjectionPage: React.FC<CashflowProjectionPageProps> = ({ organizationId }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const rows = await fpaService.getCashflowProjection(organizationId);
      setData(rows);
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar projeção de fluxo de caixa');
    } finally {
      setLoading(false);
    }
  };

  // Group by Date and calculate accumulated balance
  const dailyProjection = useMemo(() => {
    if (!data.length) return [];

    const grouped: Record<string, { date: string; inflow: number; outflow: number; balance: number }> = {};
    let runningBalance = 0;

    // Filter to only consider events from today onwards (and past events just for opening balance)
    const today = dayjs().startOf('day');
    
    // Sort by date just to be safe
    const sortedData = [...data].sort((a, b) => dayjs(a.event_date).diff(dayjs(b.event_date)));

    sortedData.forEach(row => {
      const isPast = dayjs(row.event_date).isBefore(today);
      const dateStr = isPast ? today.format('YYYY-MM-DD') : row.event_date;

      if (!grouped[dateStr]) {
        grouped[dateStr] = { date: dateStr, inflow: 0, outflow: 0, balance: 0 };
      }

      if (isPast) {
        // Just add to opening balance, don't show as today's inflow/outflow
        runningBalance += Number(row.inflow_amount || 0) - Number(row.outflow_amount || 0);
      } else {
        grouped[dateStr].inflow += Number(row.inflow_amount || 0);
        grouped[dateStr].outflow += Number(row.outflow_amount || 0);
        runningBalance += Number(row.inflow_amount || 0) - Number(row.outflow_amount || 0);
      }
      
      grouped[dateStr].balance = runningBalance;
    });

    return Object.values(grouped).sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));
  }, [data]);

  const totalInflow = dailyProjection.reduce((acc, d) => acc + d.inflow, 0);
  const totalOutflow = dailyProjection.reduce((acc, d) => acc + d.outflow, 0);
  const currentBalance = dailyProjection[0]?.balance || 0; // Balance at 'today'

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Fluxo de Caixa Projetado</h1>
          <p className="text-sm text-slate-500 font-medium">Previsibilidade de saldos, entradas e saídas</p>
        </div>
        <div className="flex items-center gap-2">
           <button onClick={fetchData} className="px-4 py-2 bg-indigo-50 text-indigo-700 font-bold text-sm rounded-lg hover:bg-indigo-100 transition-colors">
              Atualizar
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border-2 border-slate-100 shadow-sm">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Saldo Atual Projetado</p>
          <p className="text-2xl font-black text-slate-800">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentBalance)}
          </p>
        </div>
        <div className="bg-emerald-50 border-emerald-100 p-5 rounded-2xl border-2 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-bold uppercase tracking-wider text-emerald-600">Entradas Futuras</p>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalInflow)}
          </p>
        </div>
        <div className="bg-red-50 border-red-100 p-5 rounded-2xl border-2 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-bold uppercase tracking-wider text-red-600">Saídas Futuras</p>
            <TrendingDown className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-black text-red-700">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalOutflow)}
          </p>
        </div>
      </div>

      <div className="bg-white border-2 border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-sm font-bold text-slate-500">Projetando fluxo de caixa...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-500 font-bold">{error}</p>
          </div>
        ) : dailyProjection.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Calendar className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-lg font-black text-slate-800">Nenhuma projeção encontrada</p>
            <p className="text-slate-500 mt-1">Gere contas a pagar ou receber para compor a projeção.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-100">
                  <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider">Data</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Entradas</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Saídas</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Saldo do Dia</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-50">
                {dailyProjection.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 text-sm font-bold text-slate-700">
                      {dayjs(row.date).format('DD/MM/YYYY')}
                      {idx === 0 && <span className="ml-2 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded">Hoje</span>}
                    </td>
                    <td className="p-4 text-sm font-bold text-emerald-600 text-right">
                      {row.inflow > 0 ? `+ ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.inflow)}` : '-'}
                    </td>
                    <td className="p-4 text-sm font-bold text-red-600 text-right">
                      {row.outflow > 0 ? `- ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.outflow)}` : '-'}
                    </td>
                    <td className={`p-4 text-sm font-black text-right ${row.balance < 0 ? 'text-red-700' : 'text-slate-800'}`}>
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.balance)}
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

export default CashflowProjectionPage;
