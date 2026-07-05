import React, { useEffect, useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { DataTable } from '../ui/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { fpaService, FPABudgetVsActualRow } from '../../services/fpaService';

interface BudgetActualPageProps {
  organizationId?: string;
  projectId?: string;
}

export const BudgetActualPage: React.FC<BudgetActualPageProps> = ({ organizationId, projectId }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FPABudgetVsActualRow[]>([]);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, organizationId, projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Aqui usamos organizationId como proxy para empresaId para MVP
      const rows = await fpaService.getBudgetVsActual(year, organizationId, projectId);
      setData(rows);
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar dados do orçamento');
    } finally {
      setLoading(false);
    }
  };

  const totalPlanned = data.reduce((acc, row) => acc + Number(row.planned_amount || 0), 0);
  const totalActual = data.reduce((acc, row) => acc + Number(row.actual_amount || 0), 0);
  const totalVariance = totalActual - totalPlanned;


  const columns = React.useMemo<ColumnDef<FPABudgetVsActualRow>[]>(() => [
    {
      accessorKey: 'month',
      header: 'Mês',
      cell: ({ row }) => <span className="font-bold text-slate-700">Mês {row.original.month}</span>
    },
    {
      id: 'dre_group',
      header: 'Grupo DRE',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-bold text-slate-800">{row.original.category_name}</p>
          <p className="text-xs font-medium text-slate-500">{row.original.dre_group}</p>
        </div>
      )
    },
    {
      accessorKey: 'planned_amount',
      header: 'Orçado',
      cell: ({ row }) => (
        <div className="text-right font-bold text-slate-600">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.original.planned_amount || 0)}
        </div>
      )
    },
    {
      accessorKey: 'actual_amount',
      header: 'Realizado',
      cell: ({ row }) => (
        <div className="text-right font-bold text-slate-800">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.original.actual_amount || 0)}
        </div>
      )
    },
    {
      accessorKey: 'variance_amount',
      header: 'Variação',
      cell: ({ row }) => (
        <div className={`text-right font-bold ${row.original.variance_amount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.original.variance_amount)}
        </div>
      )
    },
    {
      accessorKey: 'variance_percent',
      header: '%',
      cell: ({ row }) => (
        <div className="text-right font-bold text-slate-500">
          <span className={`px-2 py-1 rounded-md ${row.original.variance_amount > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {row.original.variance_percent > 0 ? '+' : ''}{row.original.variance_percent}%
          </span>
        </div>
      )
    }
  ], []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Orçado vs Realizado (FP&A)</h1>
          <p className="text-sm text-slate-500 font-medium">Análise de variação orçamentária</p>
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold text-slate-700">Ano Fiscal:</label>
          <select 
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:border-indigo-500 outline-none"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border-2 border-slate-100 shadow-sm">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Total Orçado</p>
          <p className="text-2xl font-black text-slate-800">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPlanned)}
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border-2 border-slate-100 shadow-sm">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Total Realizado</p>
          <p className="text-2xl font-black text-slate-800">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalActual)}
          </p>
        </div>
        <div className={`p-5 rounded-2xl border-2 shadow-sm ${totalVariance > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
          <div className="flex items-center gap-2 mb-1">
            <p className={`text-sm font-bold uppercase tracking-wider ${totalVariance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              Variação
            </p>
            {totalVariance > 0 ? <TrendingUp className="w-4 h-4 text-red-600" /> : <TrendingDown className="w-4 h-4 text-emerald-600" />}
          </div>
          <p className={`text-2xl font-black ${totalVariance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(totalVariance))}
            <span className="text-sm ml-2 opacity-75">
              ({totalPlanned ? ((totalVariance / totalPlanned) * 100).toFixed(1) : 0}%)
            </span>
          </p>
        </div>
      </div>

      <div className="bg-white border-2 border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-sm font-bold text-slate-500">Calculando variações...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-500 font-bold">{error}</p>
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <DollarSign className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-lg font-black text-slate-800">Nenhum dado orçamentário encontrado</p>
            <p className="text-slate-500 mt-1">Crie um orçamento para o ano {year} para ver a comparação com o realizado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DataTable columns={columns} data={data} />
          </div>
        )}
      </div>
    </div>
  );
};

export default BudgetActualPage;
