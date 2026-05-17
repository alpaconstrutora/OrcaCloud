import React from 'react';
import { ProjectSettings, BudgetEntry } from '../types';
import { parametricService } from '../services/parametricService';
import { exportService } from '../services/exportService';
import { CUB_STANDARDS_DATA } from '../constants';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
  LineChart,
  Line,
  AreaChart,
  Area,
  ComposedChart
} from 'recharts';
import {
  Calculator,
  TrendingUp,
  Layers,
  Info,
  Ruler,
  ArrowRightLeft,
  PieChart as PieChartIcon,
  Loader2,
  Download,
  Map,
  Activity,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Calendar,
  Zap,
  Split,
  Copy,
  Trash2,
  RefreshCw,
  TrendingDown,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';
import { useStore } from '../store/useStore';

interface ParametricEstimatorProps {
  settings: ProjectSettings;
  onUpdateBudget: (budget: BudgetEntry[]) => void;
  onUpdateSettings: (settings: ProjectSettings) => void;
  onNavigate: (view: string) => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-gray-100 shadow-xl rounded-xl">
        <p className="text-xs font-bold text-gray-500 mb-1">{label}</p>
        <p className="text-sm font-black text-blue-600">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
};

const ParametricEstimator: React.FC<ParametricEstimatorProps> = ({
  settings,
  onUpdateBudget,
  onUpdateSettings,
  onNavigate
}) => {
  const [activeTab, setActiveTab] = React.useState<'financial' | 'quantitative' | 'intelligence'>('financial');
  const [intelTab, setIntelTab] = React.useState<'trends' | 'regional' | 'sensitivity' | 'scurve' | 'mix' | 'scenarios' | 'milestones'>('trends');
  const [loading, setLoading] = React.useState(true);
  const [bdiComposition, setBdiComposition] = React.useState(settings.bdiComposition || {
    taxes: 8.5,
    profit: 12,
    risk: 2,
    insurance: 1,
    admin: 5,
    guarantee: 0,
    finance: 0
  });
  const [kFactor, setKFactor] = React.useState(settings.kFactor || 1.0);
  const [sensMaterials, setSensMaterials] = React.useState(0);
  const [sensLabor, setSensLabor] = React.useState(0);
  const [simulationDuration, setSimulationDuration] = React.useState(18);
  const [compareStandard, setCompareStandard] = React.useState<string>('');
  const [comparisonData, setComparisonData] = React.useState<{ standard: string; total: number; m2: number } | null>(null);
  const [snapshots, setSnapshots] = React.useState<any[]>([]);
  const [showExportMenu, setShowExportMenu] = React.useState(false);
  const organizations = useStore(state => state.organizations);
  const organization = organizations[0];

  const [financialData, setFinancialData] = React.useState<{
    totalValue: number;
    baseCub: number;
    items: BudgetEntry[];
  }>({ totalValue: 0, baseCub: 0, items: [] });

  const [historicalData, setHistoricalData] = React.useState<{ date: string; rate: number }[]>([]);
  const [regionalData, setRegionalData] = React.useState<{ state: string; rate: number }[]>([]);

  const quantitativeItems = parametricService.generateQuantitativeBudget(settings);

  React.useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const total = await parametricService.calculateTotalEstimatedValueAsync(settings);
        const items = await parametricService.generateParametricBudgetAsync(settings);
        const history = await parametricService.getHistoricalCubDataAsync(settings);
        const regional = await parametricService.getRegionalComparisonDataAsync(settings);

        // Extract base CUB (Total nature)
        const base = items.length > 0 ? (total / (settings.area || 1) / (1 + (settings.bdi || 0) / 100)) : 0;

        setFinancialData({ totalValue: total, baseCub: base, items });
        setHistoricalData(history);
        setRegionalData(regional);
      } catch (error) {
        console.error("Failed to load parametric data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [settings]);

  const { items: financialItems } = financialData;

  // Real-time Simulation with Sensitivity
  const simulatedItems = parametricService.calculateSensitivity(financialItems, { materials: sensMaterials, labor: sensLabor });
  const simulatedBaseTotal = simulatedItems.reduce((acc, item) => acc + item.sinapiItem.price, 0);

  const calculateScientificBdi = (comp: typeof bdiComposition) => {
    const ac = (comp.admin || 0) / 100;
    const s = (comp.insurance || 0) / 100;
    const g = (comp.guarantee || 0) / 100;
    const r = (comp.risk || 0) / 100;
    const df = (comp.finance || 0) / 100;
    const l = (comp.profit || 0) / 100;
    const i = (comp.taxes || 0) / 100;
    if (i >= 1) return 0;
    const n = (1 + (ac + s + g + r)) * (1 + df) * (1 + l);
    const d = 1 - i;
    return ((n / d) - 1) * 100;
  };

  const totalBdiPerc = calculateScientificBdi(bdiComposition);
  const simulatedTotalM2 = (simulatedBaseTotal / (settings.area || 1)) * (1 + totalBdiPerc / 100) * kFactor;

  const totalValue = simulatedTotalM2 * (settings.area || 1);
  const costPerM2 = simulatedTotalM2;

  // Prepare data for charts with simulated values
  const chartData = simulatedItems.map(item => ({
    name: (item.subPhase || '').split('.').slice(2).join('.').trim(),
    fullName: item.subPhase || '',
    value: item.sinapiItem.price * (1 + totalBdiPerc / 100) * kFactor
  })).sort((a, b) => b.value - a.value); // Sort desc for better visualization

  // Aggregate for Pie Chart (by main phase if needed, currently using subphases for detail)
  // Aggregate for Pie Chart (by main phase if needed, currently using subphases for detail)
  const pieData = chartData;

  const handleConvertToAddDetailed = () => {
    const isFinancial = activeTab === 'financial';
    const message = isFinancial
      ? 'Deseja converter a estimativa FINANCEIRA (Verbas por etapa) em um orçamento analítico detalhado?'
      : 'Deseja converter a lista de QUANTITATIVOS (Insumos NBR 12.721) em um orçamento analítico detalhado?';

    if (window.confirm(`${message}\n\nIsso permitirá a edição item por item e substituirá qualquer orçamento existente.`)) {
      const items = isFinancial ? financialItems : quantitativeItems;

      onUpdateBudget(items);
      onUpdateSettings({
        ...settings,
        budgetType: 'ANALYTIC',
        status: 'Em Andamento'
      });
      onNavigate('analytic');
    }
  };

  const dashboardCards = [
    {
      label: 'Valor Total Estimado',
      value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue),
      subValue: 'Baseado no CUB Estadual + BDI',
      icon: TrendingUp,
      color: 'blue'
    },
    {
      label: 'Custo por m²',
      value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costPerM2),
      subValue: `Para padrão ${settings.standard}`,
      icon: Calculator,
      color: 'indigo'
    },
    {
      label: 'Área do Projeto',
      value: `${settings.area} m²`,
      subValue: settings.name,
      icon: Ruler,
      color: 'emerald'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard Paramétrico</h1>
          <p className="text-gray-500 flex items-center gap-2 mt-2 font-medium">
            <Info className="w-4 h-4" />
            Estudo preliminar de viabilidade (NBR 12.721)
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => {
              const snapshot = {
                id: Date.now(),
                name: `Cenário ${snapshots.length + 1} (${settings.standard})`,
                totalValue,
                costPerM2,
                bdi: totalBdiPerc,
                kFactor,
                area: settings.area,
                standard: settings.standard,
                timestamp: new Date().toLocaleTimeString()
              };
              setSnapshots([snapshot, ...snapshots]);
            }}
            className="flex items-center gap-2 px-6 py-4 bg-orange-50 text-orange-700 border border-orange-100 rounded-2xl hover:bg-orange-100 transition-all shadow-lg shadow-orange-100/50 font-bold"
          >
            <Activity className="w-5 h-5" />
            <span>Salvar Cenário</span>
          </button>
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 px-6 py-4 bg-white text-gray-700 border border-gray-100 rounded-2xl hover:bg-gray-50 transition-all shadow-xl shadow-gray-100/50 font-bold"
            >
              <Download className="w-5 h-5 text-blue-600" />
              <span>Exportar</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>

            {showExportMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowExportMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-20 animate-in fade-in slide-in-from-top-2">
                  <button
                    onClick={() => {
                      exportService.generateCompleteParametricPDF(
                        settings,
                        financialData,
                        {
                          bdi: totalBdiPerc,
                          profit: bdiComposition.profit,
                          costPerM2,
                          kFactor,
                          bdiComposition
                        },
                        quantitativeItems,
                        parametricService.generateSCurveData(totalValue, simulationDuration),
                        parametricService.calculateMilestones(totalValue, simulationDuration),
                        {
                          historicalData,
                          regionalData,
                          sensitivity: { materials: sensMaterials, labor: sensLabor },
                          comparison: comparisonData
                        }
                      );
                      setShowExportMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors"
                  >
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Relatório Completo</p>
                      <p className="text-[10px] text-gray-500 font-medium">Dados técnicos e NBR 12.721</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      exportService.generateParametricProposalPDF(
                        settings,
                        totalValue,
                        costPerM2,
                        parametricService.calculateMilestones(totalValue, simulationDuration),
                        organization
                      );
                      setShowExportMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors border-t border-gray-50"
                  >
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Proposta Comercial</p>
                      <p className="text-[10px] text-gray-500 font-medium">Formato para apresentação cliente</p>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleConvertToAddDetailed}
            className="group flex items-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 hover:shadow-2xl hover:scale-105 active:scale-95 font-bold"
          >
            <div className="p-1.5 bg-white/20 rounded-lg group-hover:rotate-180 transition-transform duration-500">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <span>Converter para Analítico</span>
          </button>
        </div>
      </div>

      {/* Real-time Simulators */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 rounded-3xl shadow-2xl shadow-blue-200 text-white">
        <div className="flex flex-col xl:flex-row gap-12 items-start">
          <div className="flex-1 space-y-6 w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-blue-200" />
                <h2 className="text-xl font-black tracking-tight uppercase">BI: Composição de BDI & Fator K</h2>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-white/20 rounded-lg text-[10px] font-bold">
                BDI CALCULADO: {totalBdiPerc.toFixed(2)}%
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
              {[
                { label: 'Lucro (%)', key: 'profit', color: 'emerald' },
                { label: 'Impostos (%)', key: 'taxes', color: 'orange' },
                { label: 'Adm Central (%)', key: 'admin', color: 'blue' },
                { label: 'Risco (%)', key: 'risk', color: 'red' },
                { label: 'Seguros (%)', key: 'insurance', color: 'indigo' },
                { label: 'Garantias (%)', key: 'guarantee', color: 'cyan' },
                { label: 'Desp Fin (%)', key: 'finance', color: 'purple' }
              ].map(item => (
                <div key={item.key} className="space-y-2">
                  <label className="text-[10px] font-bold text-blue-100 uppercase tracking-widest">{item.label}</label>
                  <input
                    type="number"
                    value={bdiComposition[item.key as keyof typeof bdiComposition]}
                    onChange={(e) => setBdiComposition({ ...bdiComposition, [item.key]: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/10 flex flex-col md:flex-row gap-8 items-center">
              <div className="flex-1 space-y-4 w-full">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-100 uppercase tracking-widest">Fator K (Complexidade/Logística)</span>
                    <Info className="w-3 h-3 text-blue-300 cursor-help" />
                  </div>
                  <span className="text-2xl font-black">x{kFactor.toFixed(2)}</span>
                </div>
                <input
                  type="range" min="0.5" max="2.0" step="0.01"
                  value={kFactor}
                  onChange={(e) => setKFactor(parseFloat(e.target.value))}
                  className="w-full h-2 bg-blue-400 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>

              <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 min-w-[280px] text-center lg:text-left">
                <p className="text-xs font-bold text-blue-100 uppercase tracking-widest mb-1">Preço Sugerido / m²</p>
                <h3 className="text-4xl font-black tracking-tighter">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costPerM2)}
                </h3>
                <p className="text-[10px] text-blue-200 font-medium underline mt-1 italic">Incluindo BDI e Fator de Correção</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100 shadow-xl">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Consultando Dados CUB...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {dashboardCards.map((card, idx) => (
              <div key={idx} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-lg shadow-gray-100/50 flex items-center gap-5 hover:border-gray-200 transition-colors">
                <div className={`p-4 rounded-2xl bg-${card.color}-50 text-${card.color}-600 shadow-inner`}>
                  <card.icon className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{card.label}</p>
                  <h3 className="text-2xl font-black text-gray-900 mt-1 tracking-tight">{card.value}</h3>
                  <p className="text-xs font-medium text-gray-500 mt-1">{card.subValue}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Main Content Area */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50 overflow-hidden">
            {/* Custom Tabs */}
            <div className="flex border-b border-gray-100 bg-gray-50/50 p-2 gap-2">
              <button
                onClick={() => setActiveTab('financial')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'financial'
                  ? 'bg-white text-blue-600 shadow-md ring-1 ring-black/5'
                  : 'text-gray-500 hover:bg-gray-100/80 hover:text-gray-700'
                  }`}
              >
                <PieChartIcon className="w-4 h-4" />
                Análise Financeira (CUB)
              </button>
              <button
                onClick={() => setActiveTab('intelligence')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'intelligence'
                  ? 'bg-white text-orange-600 shadow-md ring-1 ring-black/5'
                  : 'text-gray-500 hover:bg-gray-100/80 hover:text-gray-700'
                  }`}
              >
                <TrendingUp className="w-4 h-4" />
                Inteligência de Mercado
              </button>
              <button
                onClick={() => setActiveTab('quantitative')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'quantitative'
                  ? 'bg-white text-indigo-600 shadow-md ring-1 ring-black/5'
                  : 'text-gray-500 hover:bg-gray-100/80 hover:text-gray-700'
                  }`}
              >
                <Layers className="w-4 h-4" />
                Quantitativos (Insumos NBR)
              </button>
            </div>

            <div className="p-8">
              {activeTab === 'financial' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                  {/* Bar Chart Section */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold text-gray-900">Distribuição de Custos por Etapa</h3>
                      <div className="text-xs font-medium px-3 py-1 bg-gray-100 rounded-full text-gray-600">
                        Ordenado por valor
                      </div>
                    </div>
                    <div className="h-[400px] w-full bg-gray-50/50 rounded-2xl border border-gray-100 p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E5E7EB" />
                          <XAxis type="number" hide />
                          <YAxis
                            dataKey="name"
                            type="category"
                            width={150}
                            tick={{ fontSize: 11, fontWeight: 600, fill: '#6B7280' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F3F4F6' }} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                            <LabelList
                              dataKey="value"
                              position="right"
                              formatter={(value: any) => typeof value === 'number' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value) : ''}
                              style={{ fontSize: '10px', fontWeight: 'bold', fill: '#4B5563' }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Pie Chart Section */}
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-gray-900 text-center lg:text-left">Composição Global</h3>
                    <div className="h-[300px] w-full relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {pieData.map((_entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                            formatter={(value) => <span className="text-xs font-medium text-gray-600 ml-1">{value}</span>}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Center Text for Donut */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                        <span className="text-xs font-bold text-gray-400 uppercase">Total</span>
                        <span className="text-lg font-black text-gray-800">100%</span>
                      </div>
                    </div>

                    {snapshots.length > 0 && (
                      <div className="pt-6 border-t border-gray-100 space-y-4">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cenários Salvos ({snapshots.length})</h4>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                          {snapshots.map((snap) => (
                            <div key={snap.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl hover:border-orange-200 transition-all group">
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-gray-800">{snap.name}</span>
                                <span className="text-[10px] text-gray-400 font-mono">{snap.timestamp}</span>
                              </div>
                              <div className="flex justify-between items-end">
                                <div>
                                  <p className="text-[10px] font-bold text-blue-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(snap.totalValue)}</p>
                                  <p className="text-[9px] text-gray-500">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(snap.costPerM2)}/m²</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[9px] font-bold text-gray-400">BDI: {snap.bdi}%</p>
                                  <p className="text-[9px] font-bold text-gray-400">K: x{snap.kFactor.toFixed(2)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeTab === 'intelligence' ? (
                <div className="space-y-12">
                  <div className="flex flex-wrap bg-gray-100/50 p-1 rounded-xl w-fit gap-1">
                    {[
                      { id: 'trends', label: 'TENDÊNCIA', icon: TrendingUp },
                      { id: 'regional', label: 'BENCHMARKING', icon: Map },
                      { id: 'sensitivity', label: 'SENSIBILIDADE', icon: Zap },
                      { id: 'scurve', label: 'CURVA S', icon: Calendar },
                      { id: 'mix', label: 'ESTUDO DE MIX', icon: Split },
                      { id: 'milestones', label: 'MILESTONES', icon: CheckCircle2 }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setIntelTab(tab.id as any)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black transition-all ${intelTab === tab.id ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        <tab.icon className="w-3 h-3" />
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {intelTab === 'trends' ? (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                          <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-gray-900">Evolução Histórica do CUB</h3>
                          <p className="text-sm text-gray-500 font-medium">Variação do custo por m² para o padrão {settings.standard} em {settings.location}</p>
                        </div>
                      </div>
                      <div className="h-[350px] w-full bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={historicalData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 10, fontWeight: 700, fill: '#9CA3AF' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              hide
                              domain={['dataMin - 100', 'dataMax + 100']}
                            />
                            <Tooltip
                              content={({ active, payload }: any) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-white p-3 border border-gray-100 shadow-xl rounded-xl">
                                      <p className="text-xs font-bold text-gray-500 mb-1">{payload[0].payload.date}</p>
                                      <p className="text-sm font-black text-orange-600">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payload[0].value)}
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="rate"
                              stroke="#F97316"
                              strokeWidth={4}
                              dot={{ r: 6, fill: '#F97316', strokeWidth: 2, stroke: '#fff' }}
                              activeDot={{ r: 8 }}
                            >
                              <LabelList
                                dataKey="rate"
                                position="top"
                                offset={15}
                                formatter={(value: any) => typeof value === 'number' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value) : ''}
                                style={{ fontSize: '10px', fontWeight: 'bold', fill: '#D97706' }}
                              />
                            </Line>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : intelTab === 'regional' ? (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                          <Map className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-gray-900">Benchmarking por Estado</h3>
                          <p className="text-sm text-gray-500 font-medium">Comparativo de custo para o mesmo padrão em diferentes estados ({settings.referenceMonth})</p>
                        </div>
                      </div>
                      <div className="h-[350px] w-full bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={regionalData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                            <XAxis
                              dataKey="state"
                              tick={{ fontSize: 12, fontWeight: 800, fill: '#4B5563' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis hide />
                            <Tooltip
                              content={({ active, payload }: any) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-white p-2 border border-blue-50 shadow-lg rounded-lg">
                                      <p className="text-sm font-black text-blue-600">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payload[0].value)}
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar
                              dataKey="rate"
                              radius={[8, 8, 0, 0]}
                              barSize={40}
                            >
                              {regionalData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.state === settings.location ? '#2563EB' : '#DBEAFE'} />
                              ))}
                              <LabelList
                                dataKey="rate"
                                position="top"
                                formatter={(v: any) => `R$ ${v.toFixed(0)}`}
                                style={{ fontSize: '10px', fontWeight: 'bold', fill: '#6B7280' }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : intelTab === 'sensitivity' ? (
                    <div className="space-y-8 animate-in slide-in-from-bottom-4">
                      <div className="flex items-center gap-4 bg-orange-50/50 p-6 rounded-2xl border border-orange-100">
                        <div className="p-3 bg-white rounded-xl shadow-sm text-orange-600">
                          <Zap className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-gray-900">Análise de Sensibilidade</h3>
                          <p className="text-sm text-gray-600 font-medium">Simule o impacto da inflação de materiais e mão de obra no custo total.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div className="space-y-8">
                          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                              <span className="text-sm font-bold text-gray-700">Variação em Materiais (Aço, Cimento, etc)</span>
                              <span className={`px-3 py-1 rounded-full text-xs font-black ${sensMaterials >= 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                {sensMaterials > 0 ? '+' : ''}{sensMaterials}%
                              </span>
                            </div>
                            <input
                              type="range" min="-30" max="30" step="1"
                              value={sensMaterials}
                              onChange={(e) => setSensMaterials(Number(e.target.value))}
                              className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-orange-600"
                            />
                            <div className="flex justify-between mt-2 text-[10px] items-center font-bold text-gray-400">
                              <span>DEFLAÇÃO (-30%)</span>
                              <span>MERCADO ESTÁVEL</span>
                              <span>INFLAÇÃO (+30%)</span>
                            </div>
                          </div>

                          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                              <span className="text-sm font-bold text-gray-700">Variação em Mão de Obra (Dissídios)</span>
                              <span className={`px-3 py-1 rounded-full text-xs font-black ${sensLabor >= 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                {sensLabor > 0 ? '+' : ''}{sensLabor}%
                              </span>
                            </div>
                            <input
                              type="range" min="-10" max="20" step="1"
                              value={sensLabor}
                              onChange={(e) => setSensLabor(Number(e.target.value))}
                              className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-orange-600"
                            />
                            <div className="flex justify-between mt-2 text-[10px] items-center font-bold text-gray-400">
                              <span>-10%</span>
                              <span>BASE</span>
                              <span>+20%</span>
                            </div>
                          </div>

                          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                              <span className="text-sm font-bold text-gray-700">Encargos Sociais (Trabalhista)</span>
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-orange-100 text-orange-600">
                                {sensLabor > 10 ? 'Alto' : 'Normal'}
                              </span>
                            </div>
                            <input
                              type="range" min="0" max="150" step="5"
                              value={80 + (sensLabor * 2)}
                              onChange={(e) => setSensLabor((Number(e.target.value) - 80) / 2)}
                              className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-orange-600"
                            />
                            <div className="flex justify-between mt-2 text-[10px] items-center font-bold text-gray-400">
                              <span>DESONERADO (80%)</span>
                              <span>MÉDIA (115%)</span>
                              <span>CARGA MÁX (150%)</span>
                            </div>
                          </div>

                          <div className="bg-white p-6 rounded-2xl border border-blue-50 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                              <span className="text-sm font-bold text-gray-700">Impostos e Taxas (BDI)</span>
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-600">
                                {bdiComposition.taxes}%
                              </span>
                            </div>
                            <input
                              type="range" min="0" max="30" step="0.5"
                              value={bdiComposition.taxes}
                              onChange={(e) => setBdiComposition({ ...bdiComposition, taxes: Number(e.target.value) })}
                              className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <p className="text-[9px] text-gray-400 font-bold mt-2 uppercase">Impacto direto no BDI Total</p>
                          </div>

                          <div className="bg-white p-6 rounded-2xl border border-emerald-50 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                              <span className="text-sm font-bold text-gray-700">Margem de Lucro Alvo</span>
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-600">
                                {bdiComposition.profit}%
                              </span>
                            </div>
                            <input
                              type="range" min="0" max="40" step="1"
                              value={bdiComposition.profit}
                              onChange={(e) => setBdiComposition({ ...bdiComposition, profit: Number(e.target.value) })}
                              className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                            />
                            <p className="text-[9px] text-gray-400 font-bold mt-2 uppercase">Ajuste de Rentabilidade Desejada</p>
                          </div>
                        </div>

                        <div className="p-8 bg-gray-900 rounded-3xl text-white flex flex-col justify-center relative overflow-hidden shadow-2xl">
                          <div className="absolute top-0 right-0 p-8 opacity-10">
                            <Activity className="w-32 h-32" />
                          </div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Impacto Final Projetado</p>
                          <div className="flex items-baseline gap-3 mb-6">
                            <h2 className="text-4xl font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}</h2>
                            <span className={`text-sm font-bold flex items-center gap-1 ${totalValue > (financialData.baseCub * (settings.area || 1) * (1 + totalBdiPerc / 100) * (1 + bdiComposition.profit / 100)) ? 'text-red-400' : 'text-emerald-400'}`}>
                              {((totalValue / (financialData.baseCub * (settings.area || 1) * (1 + totalBdiPerc / 100) * (1 + bdiComposition.profit / 100)) - 1) * 100).toFixed(1)}%
                              {totalValue > (financialData.baseCub * (settings.area || 1) * (1 + totalBdiPerc / 100) * (1 + bdiComposition.profit / 100)) ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            </span>
                          </div>
                          <div className="space-y-3 pt-6 border-t border-white/10">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Preço de Venda / m²</span>
                              <span className="font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costPerM2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Variação Nominal</span>
                              <span className="font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue - (financialData.baseCub * (settings.area || 1) * (1 + totalBdiPerc / 100) * (1 + bdiComposition.profit / 100)))}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : intelTab === 'scurve' ? (
                    <div className="space-y-8 animate-in slide-in-from-bottom-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                            <Calendar className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-xl font-black text-gray-900">Curva S de Desembolso Estimada</h3>
                            <p className="text-sm text-gray-500 font-medium">Projeção estatística de fluxo de caixa para {simulationDuration} meses.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                          <span className="text-xs font-bold text-gray-500 whitespace-nowrap">DURAÇÃO DA OBRA:</span>
                          <div className="flex items-center gap-3">
                            <input
                              type="range" min="6" max="60" step="1"
                              value={simulationDuration}
                              onChange={(e) => setSimulationDuration(Number(e.target.value))}
                              className="w-32 h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <span className="text-sm font-black text-blue-600 w-12">{simulationDuration}M</span>
                          </div>
                        </div>
                      </div>

                      <div className="h-[400px] w-full bg-white rounded-3xl border border-gray-100 p-8 shadow-xl relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={parametricService.generateSCurveData(totalValue, simulationDuration)} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                            <defs>
                              <linearGradient id="colorCum" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                              dataKey="month"
                              label={{ value: 'Mês da Obra', position: 'insideBottom', offset: -10, fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }}
                              tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis hide />
                            <Tooltip
                              content={({ active, payload }: any) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-white p-4 border border-gray-100 shadow-2xl rounded-2xl">
                                      <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">MÊS {payload[0].payload.month}</p>
                                      <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-gray-500">Desembolso Mensal:</p>
                                        <p className="text-sm font-black text-blue-600">
                                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payload[0].payload.periodic)}
                                        </p>
                                        <p className="text-[10px] font-bold text-gray-500 mt-2">Acumulado:</p>
                                        <p className="text-lg font-black text-gray-900">
                                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payload[0].value)}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="cumulative"
                              stroke="#2563EB"
                              strokeWidth={4}
                              fillOpacity={1}
                              fill="url(#colorCum)"
                              animationDuration={1500}
                            />
                            <Bar
                              dataKey="periodic"
                              fill="#CBD5E1"
                              opacity={0.3}
                              radius={[4, 4, 0, 0]}
                              barSize={10}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                        <div className="absolute top-8 right-12 flex gap-6">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-blue-600"></div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">Acumulado</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-gray-300"></div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">Periódico (Mês)</span>
                          </div>
                        </div>
                      </div>

                      {/* Milestones Table */}
                      <div className="mt-8 bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                        <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                          <h4 className="text-sm font-black text-gray-900 tracking-tight uppercase">Cronograma de Desembolso Mensal (Projetado)</h4>
                          <div className="px-3 py-1 bg-white border border-gray-100 rounded-full text-[10px] font-bold text-gray-500 italic">
                            Beta Distribution Mode
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead className="bg-white border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              <tr>
                                <th className="px-6 py-4">Mês</th>
                                <th className="px-6 py-4 text-right">Desembolso no Mês</th>
                                <th className="px-6 py-4 text-right">Acumulado</th>
                                <th className="px-6 py-4 text-right">% Exec.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {parametricService.generateSCurveData(totalValue, simulationDuration).map((row) => (
                                <tr key={row.month} className="hover:bg-gray-50/50 transition-colors">
                                  <td className="px-6 py-3 font-bold text-gray-700">Mês {row.month}</td>
                                  <td className="px-6 py-3 text-right font-mono text-xs text-blue-600 font-bold">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.periodic)}
                                  </td>
                                  <td className="px-6 py-3 text-right font-mono text-xs text-gray-900 font-bold">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.cumulative)}
                                  </td>
                                  <td className="px-6 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <span className="text-[10px] font-black text-gray-400">{((row.cumulative / totalValue) * 100).toFixed(1)}%</span>
                                      <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-600" style={{ width: `${(row.cumulative / totalValue) * 100}%` }}></div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : intelTab === 'mix' ? (
                    <div className="space-y-8 animate-in slide-in-from-bottom-4">
                      <div className="flex items-center gap-4 bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100">
                        <div className="p-3 bg-white rounded-xl shadow-sm text-emerald-600">
                          <Split className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-gray-900">Estudo de Mix de Produto</h3>
                          <p className="text-sm text-gray-600 font-medium">Compare os custos side-by-side de diferentes padrões construtivos.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="p-8 bg-blue-50/30 rounded-3xl border border-blue-100 relative">
                          <span className="absolute -top-3 left-8 px-3 py-1 bg-blue-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest leading-none">Produto Atual</span>
                          <h4 className="text-lg font-black text-gray-900 mb-1">{settings.standard}</h4>
                          <p className="text-xs font-bold text-blue-600 uppercase mb-6 tracking-tight">{CUB_STANDARDS_DATA[settings.standard]?.label}</p>

                          <div className="space-y-4">
                            <div className="flex justify-between items-center py-3 border-b border-blue-100">
                              <span className="text-sm font-medium text-gray-600">Custo Total Est.</span>
                              <span className="text-lg font-black text-gray-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}</span>
                            </div>
                            <div className="flex justify-between items-center py-3">
                              <span className="text-sm font-medium text-gray-600">Venda por m²</span>
                              <span className="text-lg font-black text-blue-700">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costPerM2)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-8 bg-white rounded-3xl border border-gray-100 shadow-xl relative">
                          <span className="absolute -top-3 left-8 px-3 py-1 bg-emerald-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest leading-none">Estudo Comparativo</span>
                          <div className="mb-6">
                            <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">Selecionar Padrão Alternativo</label>
                            <select
                              value={compareStandard}
                              onChange={async (e) => {
                                const std = e.target.value;
                                setCompareStandard(std);
                                if (std) {
                                  const comp = await parametricService.getMixComparisonAsync(settings, std);
                                  setComparisonData(comp);
                                } else {
                                  setComparisonData(null);
                                }
                              }}
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-black text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            >
                              <option value="">Escolha um padrão...</option>
                              {Object.keys(CUB_STANDARDS_DATA).filter(k => k !== settings.standard).map(key => (
                                <option key={key} value={key}>{key} - {CUB_STANDARDS_DATA[key].label}</option>
                              ))}
                            </select>
                          </div>

                          {comparisonData ? (
                            <div className="space-y-4 animate-in fade-in duration-500">
                              <div className="flex justify-between items-center py-3 border-b border-emerald-100">
                                <span className="text-sm font-medium text-gray-600">Diferença de Custo</span>
                                <div className="text-right">
                                  <span className={`text-sm font-black block ${(comparisonData.total - (totalValue / (1 + bdiComposition.profit / 100))) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {((comparisonData.total / (totalValue / (1 + bdiComposition.profit / 100)) - 1) * 100).toFixed(1)}%
                                  </span>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', signDisplay: 'always' }).format(comparisonData.total - (totalValue / (1 + bdiComposition.profit / 100)))}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center py-3">
                                <span className="text-sm font-medium text-gray-600">Venda por m² Estimado</span>
                                <span className="text-lg font-black text-emerald-700">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(comparisonData.m2 * (1 + totalBdiPerc / 100) * kFactor)}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="h-24 flex items-center justify-center border-2 border-dashed border-gray-100 rounded-2xl">
                              <p className="text-xs font-bold text-gray-300">Selecione um produto para comparar</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : intelTab === 'scenarios' ? (
                    <div className="space-y-8 animate-in slide-in-from-bottom-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-orange-100 text-orange-600 rounded-xl shadow-sm">
                            <Copy className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-xl font-black text-gray-900">Gerenciador de Cenários</h3>
                            <p className="text-sm text-gray-500 font-medium">Histórico de simulações e comparativos de viabilidade.</p>
                          </div>
                        </div>
                        {snapshots.length > 0 && (
                          <button
                            onClick={() => setSnapshots([])}
                            className="text-[10px] font-black text-red-400 hover:text-red-500 uppercase tracking-widest flex items-center gap-1 p-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Limpar Tudo
                          </button>
                        )}
                      </div>

                      {snapshots.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-20 bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-100">
                          <div className="p-6 bg-white rounded-full shadow-sm mb-4">
                            <Activity className="w-10 h-10 text-gray-200" />
                          </div>
                          <p className="text-sm font-bold text-gray-400">Nenhum cenário salvo ainda.</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-2">Use o botão "Salvar Cenário" no topo da página para começar.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4">
                          {snapshots.map((snap) => {
                            const diff = ((totalValue / snap.totalValue) - 1) * 100;
                            return (
                              <div key={snap.id} className="group bg-white p-6 rounded-3xl border border-gray-100 shadow-xl hover:border-orange-200 transition-all flex flex-col lg:flex-row lg:items-center gap-8 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500/20 group-hover:bg-orange-500 transition-colors"></div>

                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-black text-gray-900 group-hover:text-orange-700 transition-colors">{snap.name}</h4>
                                    <span className="text-[10px] font-bold text-gray-400">{snap.timestamp}</span>
                                  </div>
                                  <div className="flex gap-4">
                                    <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-tighter">Padrão {snap.standard}</span>
                                    <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-tighter">BDI {snap.bdi.toFixed(2)}%</span>
                                    <span className="text-[10px] font-black text-purple-500 bg-purple-50 px-2 py-0.5 rounded uppercase tracking-tighter">Fator K {snap.kFactor.toFixed(2)}</span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 lg:gap-12 text-right">
                                  <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Custo Total</p>
                                    <p className="text-lg font-black text-gray-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(snap.totalValue)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Variação VGV</p>
                                    <div className="flex items-center justify-end gap-1">
                                      {diff > 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                                      <span className={`text-lg font-black ${diff > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 lg:border-l lg:pl-8 lg:ml-4 border-gray-100">
                                  <button
                                    onClick={() => {
                                      if (window.confirm("Deseja aplicar as taxas deste cenário na simulação atual?")) {
                                        setKFactor(snap.kFactor);
                                      }
                                    }}
                                    className="p-3 bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all shadow-sm"
                                    title="Restaurar Parâmetros"
                                  >
                                    <RefreshCw className="w-5 h-5" />
                                  </button>
                                  <button
                                    onClick={() => setSnapshots(snapshots.filter(s => s.id !== snap.id))}
                                    className="p-3 bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all shadow-sm"
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : intelTab === 'milestones' ? (
                    <div className="space-y-8 animate-in slide-in-from-bottom-4">
                      <div className="flex items-center gap-4 bg-purple-50/50 p-6 rounded-2xl border border-purple-100">
                        <div className="p-3 bg-white rounded-xl shadow-sm text-purple-600">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-gray-900">Marcos de Pagamento (Milestones)</h3>
                          <p className="text-sm text-gray-600 font-medium">Cronograma financeiro baseado em entregas e evolução percentual.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {parametricService.calculateMilestones(totalValue, simulationDuration).map((ms, i) => (
                          <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl relative overflow-hidden group hover:border-purple-200 transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                              <CheckCircle2 className="w-16 h-16 text-purple-600" />
                            </div>
                            <div className="flex items-center gap-3 mb-4">
                              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-600 text-white text-xs font-black">
                                {ms.percentage}%
                              </span>
                              <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">{ms.label}</h4>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Valor do Marco</p>
                              <p className="text-xl font-black text-gray-900">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ms.value)}
                              </p>
                            </div>
                            <div className="mt-6 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-bold text-gray-600">Previsão: Mês {ms.month}</span>
                              </div>
                              <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-2 py-1 rounded">ESTIMADO</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 italic text-xs text-gray-500">
                        * Os meses são calculados com base na Curva S estatística. Datas reais podem variar conforme o ritmo da obra.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Essa era a tab 'trends' ou similar que ficou perdida */}
                      <p className="text-sm text-gray-500">Selecione uma aba de inteligência acima.</p>
                    </div>
                  )}

                  {/* Critical Inputs Section (NBR 12.721) */}
                  <div className="pt-8 border-t border-gray-100">
                    <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6">Insumos de Maior Volatilidade (NBR 12.721)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                        { title: 'Cimento & Concreto', impact: 'Alto', trend: 'up', icon: '🏗️' },
                        { title: 'Mão de Obra Qualificada', impact: 'Crítico', trend: 'up', icon: '👷' },
                        { title: 'Aço CA-50', impact: 'Estável', trend: 'down', icon: '⛓️' }
                      ].map((alert, i) => (
                        <div key={i} className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-start gap-4">
                          <div className="text-2xl">{alert.icon}</div>
                          <div className="flex-1">
                            <p className="text-xs font-bold text-gray-500 uppercase">{alert.title}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${alert.impact === 'Crítico' ? 'bg-red-100 text-red-600' : alert.impact === 'Alto' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                IMPACTO {alert.impact.toUpperCase()}
                              </span>
                              {alert.trend === 'up' ? <ArrowUpRight className="w-4 h-4 text-red-500" /> : <ArrowDownRight className="w-4 h-4 text-emerald-500" />}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Lista Base de Insumos da Norma</h2>
                      <p className="text-sm text-gray-500 mt-1">Materiais e mão de obra estimados conforme NBR 12.721</p>
                    </div>
                    <div className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black uppercase tracking-tight shadow-sm border border-indigo-100">
                      Padrão {settings.standard}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/80 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-4">Insumo / Especialidade</th>
                          <th className="px-6 py-4 text-center">Unidade</th>
                          <th className="px-6 py-4 text-right">Quantidade Total</th>
                          <th className="px-6 py-4 text-right">Consumo Unit. (m²)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-sm">
                        {quantitativeItems.map((item, idx) => {
                          const coef = (item.quantity / (settings.area || 1));
                          return (
                            <tr key={idx} className="hover:bg-indigo-50/30 transition-colors group">
                              <td className="px-6 py-4 font-bold text-gray-700 group-hover:text-indigo-700 transition-colors">
                                {item.sinapiItem.description.replace('NBR 12721 - ', '')}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="px-2 py-1 bg-gray-100 rounded text-xs font-bold text-gray-500 uppercase">{item.sinapiItem.unit}</span>
                              </td>
                              <td className="px-6 py-4 text-right font-black text-gray-900 bg-gray-50/30">
                                {item.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-6 py-4 text-right text-gray-500 font-mono text-xs">
                                {coef.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Footer / Context */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-6 rounded-2xl border border-amber-100/50 flex gap-5 shadow-sm">
        <div className="p-3 bg-white rounded-xl shadow-sm text-amber-500 h-fit">
          <Info className="w-6 h-6" />
        </div>
        <div className="text-sm text-amber-900/80 leading-relaxed">
          <p className="font-bold text-amber-900 mb-1">Nota Técnica Legal</p>
          <p>
            Este modelo paramétrico utiliza os pesos estatísticos da NBR 12.721 (Lote Básico de Insumos) combinados com os valores do CUB estadual atualizado.
            Os resultados apresentados são <span className="font-bold">estimativas preliminares de viabilidade</span> e não substituem o orçamento executivo detalhado,
            que deve ser elaborado com base nos projetos definitivos de engenharia e arquitetura.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ParametricEstimator;