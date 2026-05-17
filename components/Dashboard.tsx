import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Legend
} from 'recharts';
import { BudgetEntry, ProjectSettings } from '../types';
import { DollarSign, TrendingUp, AlertTriangle, Layers, ArrowLeft } from 'lucide-react';

interface DashboardProps {
  budget: BudgetEntry[];
  settings: ProjectSettings;
  onNavigate?: (view: string) => void;
}

type GroupingLevel = 'category' | 'group' | 'phase' | 'subPhase' | 'item';

const splitWBSLabel = (label: string | null | undefined) => {
  if (!label) return { id: '', description: '' };
  const match = label.match(/^([\d\.]+)\s+(.*)$/);
  return match ? { id: match[1], description: match[2] } : { id: '', description: label };
};

const Dashboard: React.FC<DashboardProps> = ({ budget, settings, onNavigate }) => {
  const [groupingLevel, setGroupingLevel] = useState<GroupingLevel>('category');

  // Basic Calculations
  const directCost = useMemo(() => budget.reduce((acc, item) => acc + (item.quantity * (item.sinapiItem?.price || 0)), 0), [budget]);
  const totalCost = useMemo(() => budget.reduce((acc, item) => acc + (item.quantity * (item.sinapiItem?.price || 0) * (1 + (item.bdi ?? (settings.bdi || 0)) / 100)), 0), [budget, settings.bdi]);
  const costPerSqm = (settings.area && settings.area > 0) ? totalCost / settings.area : 0;

  // Dynamic Grouping Data
  const chartData = useMemo(() => {
    const dataMap = new Map<string, number>();

    budget.forEach(item => {
      let key = '';
      switch (groupingLevel) {
        case 'category': key = item.sinapiItem?.category || 'Outros'; break;
        case 'group': key = item.group || 'Geral'; break;
        case 'phase': key = item.phase || 'Geral'; break;
        case 'subPhase': key = item.subPhase || 'Geral'; break;
        case 'item': key = `${item.sinapiItem?.code || 'N/A'} ${item.sinapiItem?.description || 'Sem Descrição'}`; break;
      }

      const cost = item.quantity * (item.sinapiItem?.price || 0) * (1 + (item.bdi ?? (settings.bdi || 0)) / 100);
      dataMap.set(key, (dataMap.get(key) || 0) + cost);
    });

    const sortedData = Array.from(dataMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const total = sortedData.reduce((acc, item) => acc + item.value, 0);
    let accumulated = 0;

    return sortedData.map((item, index) => {
      accumulated += item.value;
      const accumPct = total > 0 ? (accumulated / total) * 100 : 0;

      return {
        id: index + 1,
        fullName: item.name,
        name: groupingLevel === 'category' ? item.name : splitWBSLabel(item.name).description,
        shortId: groupingLevel === 'category' ? '' : splitWBSLabel(item.name).id,
        custo: item.value,
        percentual: total > 0 ? (item.value / total) * 100 : 0,
        acumulado: Math.round(accumPct),
        classe: accumPct <= 80 ? 'A' : accumPct <= 95 ? 'B' : 'C'
      };
    });
  }, [budget, groupingLevel, settings.bdi]);

  const StatCard = ({ title, value, subtext, icon: Icon, color }: any) => (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
        {subtext && <p className={`text-xs mt-1 ${color === 'red' ? 'text-red-600' : 'text-emerald-600'}`}>{subtext}</p>}
      </div>
      <div className={`p-3 rounded-lg ${color === 'blue' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
  );

  const levelLabels: Record<GroupingLevel, string> = {
    category: 'Categorias',
    group: 'Grupos (WBS)',
    phase: 'Etapas',
    subPhase: 'Subetapas',
    item: 'Itens'
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="flex items-center gap-4">
          {onNavigate && (
            <button
              onClick={() => onNavigate('eng-orcamentos')}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all group/back shadow-sm bg-white border border-gray-100"
              title="Voltar para Gestão de Orçamentos"
            >
              <ArrowLeft className="w-5 h-5 group-hover/back:-translate-x-1 transition-transform" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">Curva ABC Executiva</h1>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-full border border-blue-100">
                {settings.name || 'Projeto sem nome'}
              </span>
            </div>
            <p className="text-gray-500">Acompanhamento de custos e indicadores através da curva de Pareto.</p>
          </div>
        </div>
        <div className="hidden md:block text-right">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Última atualização SINAPI</span>
          <p className="text-sm font-bold text-gray-700">JAN/2025 - COM DESONERAÇÃO</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Custo Total (Estimado)"
          value={`R$ ${totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subtext={`BDI Aplicado: ${settings.bdi}%`}
          icon={DollarSign}
          color="blue"
        />
        <StatCard
          title="Custo Unitário (R$/m²)"
          value={`R$ ${costPerSqm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subtext={`Ref CUB: R$ ${settings.cubRate.toFixed(2)} (${((costPerSqm / settings.cubRate - 1) * 100).toFixed(1)}% var)`}
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          title="Itens Críticos (Curva A)"
          value={chartData.filter(i => i.acumulado <= 80).length.toString()}
          subtext="Representam 80% do custo"
          icon={AlertTriangle}
          color="blue"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold text-gray-800">Curva ABC de Insumos</h3>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-xl">
            {(['group', 'phase', 'subPhase', 'item', 'category'] as GroupingLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setGroupingLevel(level)}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${groupingLevel === level
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                {levelLabels[level]}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-2 w-2 rounded-full bg-blue-500"></div>
            <p className="text-sm text-gray-500 font-medium">Analizando por: <span className="text-gray-900 font-bold">{levelLabels[groupingLevel]}</span></p>
          </div>

          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  scale="band"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
                  interval={0}
                  angle={chartData.length > 5 ? -25 : 0}
                  textAnchor={chartData.length > 5 ? "end" : "middle"}
                  height={60}
                />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(val) => `R$ ${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  unit="%"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#10b981', fontSize: 11, fontWeight: 'bold' }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any, name: any) => [
                    name === 'acumulado' ? `${value}%` : `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                    name === 'acumulado' ? '% Acumulado' : 'Custo Total'
                  ]}
                  labelFormatter={(value) => {
                    const item = chartData.find(i => i.name === value);
                    return item ? item.fullName : value;
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Bar yAxisId="left" dataKey="custo" name="Custo (R$)" fill="#3b82f6" barSize={40} radius={[6, 6, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="acumulado" name="% Acumulado" stroke="#10b981" strokeWidth={3} dot={{ stroke: '#10b981', strokeWidth: 2, r: 4, fill: '#fff' }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Rankings Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <Layers className="w-4 h-4 text-blue-600" />
            </div>
            <h3 className="text-sm font-bold text-gray-800">Ranking ABC - {levelLabels[groupingLevel]}</h3>
          </div>
          <span className="text-xs text-gray-500 font-medium">{chartData.length} itens no total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white">
                <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center w-16">Pos</th>
                <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Descrição</th>
                <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Custo Total</th>
                <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">% Part.</th>
                <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">% Acum.</th>
                <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">Classe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {chartData.map((item) => (
                <tr key={item.fullName} className="hover:bg-blue-50/20 transition-colors group">
                  <td className="px-6 py-3 text-center">
                    <span className="text-xs font-bold text-gray-500">{item.id}º</span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {item.name}
                      </span>
                      {item.shortId && (
                        <span className="text-[10px] text-gray-400 font-medium leading-none">ID: {item.shortId}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-sm font-bold text-gray-900">
                      R$ {item.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span className="text-xs font-medium text-gray-600">{item.percentual.toFixed(1)}%</span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                        <div
                          className={`h-full rounded-full ${item.classe === 'A' ? 'bg-blue-500' : item.classe === 'B' ? 'bg-emerald-500' : 'bg-gray-400'}`}
                          style={{ width: `${item.acumulado}%` }}
                        ></div>
                      </div>
                      <span className="text-xs font-bold text-gray-700">{item.acumulado}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${item.classe === 'A' ? 'bg-blue-100 text-blue-700' :
                      item.classe === 'B' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                      Classe {item.classe}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;