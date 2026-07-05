import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Copy, TrendingUp, TrendingDown, RefreshCcw } from 'lucide-react';
import { fpaService, FPABudget } from '../../services/fpaService';
import { useToast } from '../../hooks/useToast';

interface BudgetScenarioPageProps {
  organizationId?: string;
  projectId?: string;
}

export const BudgetScenarioPage: React.FC<BudgetScenarioPageProps> = ({ organizationId, projectId }) => {
  const [loading, setLoading] = useState(true);
  const [budgets, setBudgets] = useState<FPABudget[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState<string>('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [scenarioType, setScenarioType] = useState<'OPTIMISTIC' | 'PESSIMISTIC' | 'CUSTOM'>('OPTIMISTIC');
  const [adjustmentPercent, setAdjustmentPercent] = useState<number>(10);
  const [isCloning, setIsCloning] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    fetchBudgets();
  }, []);

  const fetchBudgets = async () => {
    try {
      setLoading(true);
      const data = await fpaService.getBudgets();
      // Em produção, filtraríamos pelo organizationId
      setBudgets(data);
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar orçamentos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClone = async () => {
    if (!selectedBaseId || !newScenarioName) {
      showToast('Preencha os campos obrigatórios', 'error');
      return;
    }

    try {
      setIsCloning(true);
      await fpaService.duplicateBudget(selectedBaseId, newScenarioName, scenarioType, adjustmentPercent);
      showToast('Cenário gerado com sucesso!', 'success');
      setIsModalOpen(false);
      fetchBudgets(); // Refresh list
    } catch (err) {
      console.error(err);
      showToast('Erro ao clonar orçamento', 'error');
    } finally {
      setIsCloning(false);
    }
  };

  // Separa os budgets originais dos cenários
  const originalBudgets = budgets.filter(b => b.type !== 'SCENARIO');
  const scenarios = budgets.filter(b => b.type === 'SCENARIO');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Simulação de Cenários (What-if)</h1>
          <p className="text-sm text-slate-500 font-medium">Crie cenários otimistas e pessimistas a partir da base.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold text-sm rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Cenário
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {loading ? (
           <div className="h-64 flex flex-col items-center justify-center gap-3">
             <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
           </div>
        ) : (
          <div className="bg-white border-2 border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-100">
                  <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider">Nome do Orçamento</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider">Tipo</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider">Ano</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-50">
                {originalBudgets.map(ob => (
                  <React.Fragment key={ob.id}>
                    {/* Linha Pai */}
                    <tr className="bg-white hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-sm font-bold text-slate-800 flex items-center gap-2">
                        {ob.name}
                      </td>
                      <td className="p-4 text-sm font-bold text-slate-500">{ob.type}</td>
                      <td className="p-4 text-sm font-bold text-slate-500">{ob.year}</td>
                      <td className="p-4 text-sm font-bold text-slate-500">
                        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs">{ob.status}</span>
                      </td>
                      <td className="p-4 text-right">
                        <button 
                           onClick={() => { setSelectedBaseId(ob.id); setIsModalOpen(true); }}
                           className="text-indigo-600 hover:text-indigo-800 text-sm font-bold"
                        >
                          Simular
                        </button>
                      </td>
                    </tr>
                    
                    {/* Linhas Filhas (Cenários) */}
                    {scenarios.filter(s => s.parent_budget_id === ob.id).map(scenario => (
                      <tr key={scenario.id} className="bg-slate-50 hover:bg-slate-100 transition-colors">
                        <td className="p-4 pl-12 text-sm font-bold text-slate-700 flex items-center gap-2 border-l-4 border-indigo-200">
                          <div className="w-4 h-4 border-l-2 border-b-2 border-slate-300 rounded-bl-lg -ml-4 mr-2" />
                          {scenario.name}
                          {scenario.scenario_type === 'OPTIMISTIC' && <span title="Custos Reduzidos"><TrendingDown className="w-4 h-4 text-emerald-500" /></span>}
                          {scenario.scenario_type === 'PESSIMISTIC' && <span title="Custos Elevados"><TrendingUp className="w-4 h-4 text-red-500" /></span>}
                        </td>
                        <td className="p-4 text-sm font-bold text-slate-500">CENÁRIO</td>
                        <td className="p-4 text-sm font-bold text-slate-500">{scenario.year}</td>
                        <td className="p-4 text-sm font-bold text-slate-500">
                           <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded-md text-xs">SIMULAÇÃO</span>
                        </td>
                        <td className="p-4 text-right">
                          <button className="text-slate-400 hover:text-slate-600 text-sm font-bold">Ver DRE</button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b-2 border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                <Copy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">Criar Cenário</h3>
                <p className="text-xs font-bold text-slate-500">Ajuste percentual em massa</p>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Orçamento Base</label>
                <select 
                  value={selectedBaseId} 
                  onChange={(e) => setSelectedBaseId(e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm font-bold focus:border-indigo-500 outline-none"
                >
                  <option value="">Selecione a base...</option>
                  {originalBudgets.map(ob => (
                    <option key={ob.id} value={ob.id}>{ob.name} ({ob.year})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Nome do Cenário</label>
                <input 
                  type="text" 
                  value={newScenarioName}
                  onChange={(e) => setNewScenarioName(e.target.value)}
                  placeholder="Ex: Cenário Otimista 2027"
                  className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm font-bold focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Tipo de Cenário</label>
                  <select 
                    value={scenarioType} 
                    onChange={(e) => setScenarioType(e.target.value as any)}
                    className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm font-bold focus:border-indigo-500 outline-none"
                  >
                    <option value="OPTIMISTIC">Otimista</option>
                    <option value="PESSIMISTIC">Pessimista</option>
                    <option value="CUSTOM">Personalizado</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Ajuste Despesas (%)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={adjustmentPercent}
                      onChange={(e) => setAdjustmentPercent(Number(e.target.value))}
                      className="w-full border-2 border-slate-200 rounded-lg p-2.5 pl-8 text-sm font-bold focus:border-indigo-500 outline-none"
                    />
                    <span className="absolute left-3 top-2.5 text-slate-400 font-bold">%</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 font-medium bg-slate-50 p-3 rounded-lg border-2 border-slate-100">
                Dica: Valores positivos (Ex: 10%) aumentam as despesas (Pessimista). Valores negativos (Ex: -15%) reduzem as despesas (Otimista).
              </p>
            </div>

            <div className="p-4 border-t-2 border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 font-bold text-slate-600 hover:text-slate-800"
              >
                Cancelar
              </button>
              <button 
                onClick={handleClone}
                disabled={isCloning}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {isCloning ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                {isCloning ? 'Gerando...' : 'Gerar Cenário'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetScenarioPage;
