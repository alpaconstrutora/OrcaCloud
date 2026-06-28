import React from 'react';
import { complianceService } from '../services/complianceService';
import { companyService } from '../services/companyService';
import { ComplianceChecklist, ComplianceRule, Company } from '../types';

interface ComplianceDashboardProps {
  organizationId: string;
  onNavigate: (view: string) => void;
}

const ComplianceDashboard: React.FC<ComplianceDashboardProps> = ({
  organizationId,
  onNavigate
}) => {
  const [loading, setLoading] = React.useState(true);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState<string>('');
  const [checklists, setChecklists] = React.useState<any[]>([]);
  const [rules, setRules] = React.useState<ComplianceRule[]>([]);
  const [interestadualPct, setInterestadualPct] = React.useState(32.4); // Simulado via ERP
  const [diasRestantes, setDiasRestantes] = React.useState(12);
  const [score, setScore] = React.useState(85);

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      // Listar empresas vinculadas à organização
      const comps = await companyService.list(organizationId);
      setCompanies(comps);

      if (comps.length > 0) {
        const defaultComp = comps[0].id;
        setSelectedCompanyId(defaultComp);
        
        const [checkData, rulesData] = await Promise.all([
          complianceService.listChecklists(organizationId, defaultComp),
          complianceService.listRules(organizationId)
        ]);
        setChecklists(checkData);
        setRules(rulesData);

        // Calcular score de compliance básico baseado em checklists conformes
        if (checkData.length > 0) {
          const conformes = checkData.filter(c => c.status === 'conforme').length;
          const pctConformes = Math.round((conformes / checkData.length) * 100);
          
          // Peso: 50% checklists, 30% métrica interestadual, 20% documentos em dia
          const interestadualScore = interestadualPct >= 30.0 ? 100 : (interestadualPct / 30.0) * 100;
          const finalScore = Math.round((pctConformes * 0.5) + (interestadualScore * 0.3) + (100 * 0.2));
          setScore(finalScore);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados do compliance:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId, interestadualPct]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCompanyChange = async (companyId: string) => {
    setSelectedCompanyId(companyId);
    try {
      setLoading(true);
      const checkData = await complianceService.listChecklists(organizationId, companyId);
      setChecklists(checkData);

      // Recalcular score
      if (checkData.length > 0) {
        const conformes = checkData.filter(c => c.status === 'conforme').length;
        const pctConformes = Math.round((conformes / checkData.length) * 100);
        const interestadualScore = interestadualPct >= 30.0 ? 100 : (interestadualPct / 30.0) * 100;
        const finalScore = Math.round((pctConformes * 0.5) + (interestadualScore * 0.3) + (100 * 0.2));
        setScore(finalScore);
      }
    } catch (error) {
      console.error('Erro ao atualizar empresa:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && companies.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F8FAFC]">
        <div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Carregando Governança...</span>
      </div>
    );
  }

  // Estatísticas de checklists
  const totalChecks = checklists.length;
  const conformeChecks = checklists.filter(c => c.status === 'conforme').length;
  const pendenteChecks = checklists.filter(c => c.status === 'pendente').length;
  const riscoChecks = checklists.filter(c => c.status === 'inconforme').length;

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            🛡️ ÒPURA Compliance
          </h1>
          <p className="text-xs font-semibold text-slate-500">
            Painel de controle regulatório e governança fiscal (TTS-MG)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedCompanyId}
            onChange={(e) => handleCompanyChange(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-form-input font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.razao_social} ({c.cnpj ? c.cnpj.substring(0, 5) + '...' : 'Filial'})</option>
            ))}
          </select>

          <button
            onClick={fetchData}
            className="w-9 h-9 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-button active:scale-95 transition-transform hover:bg-slate-50"
            title="Sincronizar"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Grid Principal - Score & Indicador TTS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Score Card */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Score de Compliance</span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
              score >= 90 ? 'bg-emerald-50 text-emerald-600' :
              score >= 70 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
            }`}>
              {score >= 90 ? 'Excelente' : score >= 70 ? 'Atenção' : 'Risco'}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black text-slate-800 tracking-tight">{score}</span>
            <span className="text-sm font-bold text-slate-400">/ 100</span>
          </div>

          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${
                score >= 90 ? 'bg-emerald-500' :
                score >= 70 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500">Mapeamento atualizado em tempo real.</span>
        </div>

        {/* TTS-MG Interestadual KPI Card */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Saídas Interestaduais (TTS)</span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">
              Meta Mínima 30%
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className={`text-5xl font-black tracking-tight ${
              interestadualPct >= 30.0 ? 'text-slate-800' : 'text-rose-600'
            }`}>{interestadualPct}%</span>
            <span className="text-xs font-bold text-slate-400">acumulado</span>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>Ciclo: Restam <b>{diasRestantes} dias</b></span>
            <span className={interestadualPct >= 30.0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
              {interestadualPct >= 30.0 ? '✓ Elegível' : '⚠ Risco de perda'}
            </span>
          </div>
          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
            <div 
              className={`h-full ${interestadualPct >= 30.0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
              style={{ width: `${Math.min((interestadualPct / 40) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Resumo de Checklists */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Status de Obrigações</span>
            <span className="text-[10px] font-bold text-slate-500">Total: {totalChecks}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-50/50 border border-emerald-100 p-2.5 rounded-xl text-center">
              <span className="block text-lg font-black text-emerald-700">{conformeChecks}</span>
              <span className="text-[9px] font-bold text-emerald-600 uppercase">Conformes</span>
            </div>
            <div className="bg-amber-50/50 border border-amber-100 p-2.5 rounded-xl text-center">
              <span className="block text-lg font-black text-amber-700">{pendenteChecks}</span>
              <span className="text-[9px] font-bold text-amber-600 uppercase">Pendentes</span>
            </div>
            <div className="bg-rose-50/50 border border-rose-100 p-2.5 rounded-xl text-center">
              <span className="block text-lg font-black text-rose-700">{riscoChecks}</span>
              <span className="text-[9px] font-bold text-rose-600 uppercase">Atenção</span>
            </div>
          </div>

          <button
            onClick={() => onNavigate('compliance-checklists')}
            className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-button font-bold uppercase tracking-wider transition-all active:scale-95"
          >
            Ver Obrigações
          </button>
        </div>
      </div>

      {/* Alertas Urgentes */}
      {interestadualPct < 35.0 && (
        <div className="bg-amber-50 border border-amber-200/80 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
          <span className="text-xl">⚠️</span>
          <div>
            <h4 className="text-xs font-black uppercase text-amber-800 tracking-wider">Aviso de Risco Regulatória (TTS)</h4>
            <p className="text-xs font-medium text-amber-700 mt-0.5">
              O percentual interestadual de vendas da filial ({interestadualPct}%) está próximo da margem mínima permitida (30%). É altamente recomendado direcionar as próximas expedições para fora de Minas Gerais nos próximos {diasRestantes} dias para blindar o benefício.
            </p>
          </div>
        </div>
      )}

      {/* Atalhos Rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Painel de Segregação Física */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">🗺️ Segregação Física de Estoque</h3>
              <p className="text-[10px] text-slate-400">Verifique a demarcação das áreas exclusivas das filiais</p>
            </div>
            <button
              onClick={() => onNavigate('compliance-physical-map')}
              className="text-[10px] font-black uppercase tracking-wider text-slate-900 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-100"
            >
              Abrir Mapa
            </button>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>Status dos Lockers & Posições:</span>
              <span className="text-slate-800 font-bold">14/20 Ocupados</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex">
              <div className="bg-emerald-500 h-full" style={{ width: '40%' }} title="Livre" />
              <div className="bg-sky-500 h-full" style={{ width: '50%' }} title="Ocupado Filial 1" />
              <div className="bg-rose-500 h-full" style={{ width: '10%' }} title="Manutenção/Bloqueado" />
            </div>
            <div className="flex gap-4 text-[9px] font-bold text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Disponível</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500" /> Segregado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Bloqueado</span>
            </div>
          </div>
        </div>

        {/* Trilha de Evidências */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">📸 Trilha de Evidências</h3>
              <p className="text-[10px] text-slate-400">Auditoria operacional e registro fotográfico de notas fiscais</p>
            </div>
            <button
              onClick={() => onNavigate('compliance-checklists')}
              className="text-[10px] font-black uppercase tracking-wider text-slate-900 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-100"
            >
              Nova Evidência
            </button>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <div className="space-y-0.5">
                <span className="block text-[10px] font-black text-slate-700">Expedição - NF-e #4902</span>
                <span className="block text-[8px] text-slate-400">Canhoto assinado • Operador: carlos@opura.com</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                Auditado
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <div className="space-y-0.5">
                <span className="block text-[10px] font-black text-slate-700">Recebimento - NF-e #4889</span>
                <span className="block text-[8px] text-slate-400">Foto do palete • Operador: carlos@opura.com</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                Auditado
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ComplianceDashboard;
