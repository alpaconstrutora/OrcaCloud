import React from 'react';
import ActionIconButton from './ui/ActionIconButton';
import {
  Building2,
  ShieldAlert,
  Calculator,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Percent,
  DollarSign,
  Loader2,
  Download,
  FileText,
  Zap,
  Plus,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { cnoService } from '../services/cnoService';
import { useStore } from '../store/useStore';
import { useConfirm } from './ui/confirm';
import {
  OpuraCnoRegistration,
  OpuraCnoSimulation,
  OpuraCnoDeduction,
  OpuraCnoComplianceScore,
  OpuraCnoDctfweb
} from '../types';

interface OpuraCnoModuleProps {
  activeOrganizationId: string | null;
  projectId: string | null;
  onChangeView: (view: string) => void;
}

export const OpuraCnoModule: React.FC<OpuraCnoModuleProps> = ({
  activeOrganizationId,
  projectId: initialProjectId,
  onChangeView
}) => {
  const { projects } = useStore();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = React.useState<'dashboard' | 'cadastro' | 'simulador' | 'deducoes' | 'dctfweb' | 'dossie'>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(initialProjectId);
  const [loading, setLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  // Estados dos dados reais
  const [registration, setRegistration] = React.useState<OpuraCnoRegistration | null>(null);
  const [simulations, setSimulations] = React.useState<OpuraCnoSimulation[]>([]);
  const [deductions, setDeductions] = React.useState<OpuraCnoDeduction[]>([]);
  const [score, setScore] = React.useState<OpuraCnoComplianceScore | null>(null);
  const [dctfwebList, setDctfwebList] = React.useState<OpuraCnoDctfweb[]>([]);

  // Estado do formulário de DCTFWeb / DARF
  const [dctfForm, setDctfForm] = React.useState({
    declaration_number: '',
    transmission_date: '',
    principal_amount: '',
    fine_amount: '',
    interest_amount: ''
  });

  // Estados do formulário de cadastro
  const [cnoForm, setCnoForm] = React.useState({
    cno_number: '',
    status: 'rascunho' as OpuraCnoRegistration['status'],
    data_abertura: '',
    data_encerramento: '',
    matricula_imovel: '',
    alvara_numero: '',
    area_aprovada: 0,
    area_real: 0,
    padrao_construtivo: 'normal' as OpuraCnoRegistration['padrao_construtivo'],
    tipo_obra: '',
    responsavel_tipo: 'construtor' as OpuraCnoRegistration['responsavel_tipo'],
    art_rrt: ''
  });

  // Estados do formulário de simulação
  const [simForm, setSimForm] = React.useState({
    scenario_name: 'Simulação Inicial',
    state: 'SP',
    reference_date: '2026-02',
    social_charges: 'sem_desoneracao' as 'com_desoneracao' | 'sem_desoneracao',
    area_construida: 1000,
    padrao: 'normal' as 'baixo' | 'normal' | 'alto',
    metodo_construtivo: 'convencional' as OpuraCnoSimulation['metodo_construtivo'],
    regime_contratacao: 'equipe_propria' as OpuraCnoSimulation['regime_contratacao']
  });

  const [activeSimResult, setActiveSimResult] = React.useState<{
    custoEstimadoObra: number;
    baseCalculoMaoObra: number;
    inssPatronalEstimado: number;
    economiaMetodoConstrutivo: number;
    inssFinalEstimado: number;
    cubValor: number;
  } | null>(null);

  // Carregar dados
  const loadData = React.useCallback(async (projId: string) => {
    setLoading(true);
    try {
      const reg = await cnoService.getRegistrationByProject(projId);
      setRegistration(reg);
      if (reg) {
        setCnoForm({
          cno_number: reg.cno_number || '',
          status: reg.status,
          data_abertura: reg.data_abertura || '',
          data_encerramento: reg.data_encerramento || '',
          matricula_imovel: reg.matricula_imovel || '',
          alvara_numero: reg.alvara_numero || '',
          area_aprovada: reg.area_aprovada,
          area_real: reg.area_real,
          padrao_construtivo: reg.padrao_construtivo || 'normal',
          tipo_obra: reg.tipo_obra || '',
          responsavel_tipo: reg.responsavel_tipo || 'construtor',
          art_rrt: reg.art_rrt || ''
        });

        // Declarações DCTFWeb dependem de um CNO cadastrado
        const dctf = await cnoService.listDctfweb(reg.id);
        setDctfwebList(dctf);
      } else {
        setDctfwebList([]);
      }

      const sims = await cnoService.listSimulations(projId);
      setSimulations(sims);

      const deds = await cnoService.listDeductions(projId);
      setDeductions(deds);

      // Recalcular ou buscar o compliance score
      const compliance = await cnoService.getComplianceScore(projId);
      setScore(compliance);
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao carregar dados do projeto:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedProjectId) {
      loadData(selectedProjectId);
    }
  }, [selectedProjectId, loadData]);

  // Executar simulação de INSS (Calculadora)
  const handleRunSimulation = async () => {
    if (!selectedProjectId) return;
    setActionLoading(true);
    try {
      const result = await cnoService.calculateSimulation({
        projectId: selectedProjectId,
        state: simForm.state,
        referenceDate: simForm.reference_date,
        socialCharges: simForm.social_charges,
        areaConstruida: simForm.area_construida,
        padrao: simForm.padrao,
        metodoConstrutivo: simForm.metodo_construtivo as any,
        regimeContratacao: simForm.regime_contratacao as any
      });
      setActiveSimResult(result);
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao rodar simulação:', err);
      alert('Erro ao rodar simulação. Verifique as configurações do CUB.');
    } finally {
      setActionLoading(false);
    }
  };

  // Salvar Simulação
  const handleSaveSimulation = async () => {
    if (!selectedProjectId || !activeSimResult || !activeOrganizationId) return;
    setActionLoading(true);
    try {
      const newSim = await cnoService.createSimulation({
        organization_id: activeOrganizationId,
        project_id: selectedProjectId,
        scenario_name: simForm.scenario_name,
        area_construida: simForm.area_construida,
        custo_estimado: activeSimResult.custoEstimadoObra,
        metodo_construtivo: simForm.metodo_construtivo as any,
        regime_contratacao: simForm.regime_contratacao as any,
        mao_de_obra_estimada: activeSimResult.baseCalculoMaoObra,
        inss_estimado: activeSimResult.inssFinalEstimado,
        economia_potencial: activeSimResult.economiaMetodoConstrutivo,
        is_active: true,
        notes: `Simulado com CUB de ${simForm.state} (${simForm.reference_date})`
      });
      
      setSimulations(prev => [newSim, ...prev]);
      alert('Simulação salva com sucesso!');
      // Atualizar o score após salvar nova simulação ativa
      await cnoService.recalculateComplianceScore(selectedProjectId).then(setScore);
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao salvar simulação:', err);
      alert('Erro ao salvar simulação.');
    } finally {
      setActionLoading(false);
    }
  };

  // Salvar Cadastro CNO
  const handleSaveCnoRegistration = async () => {
    if (!selectedProjectId || !activeOrganizationId) return;
    setActionLoading(true);
    try {
      let result;
      if (registration?.id) {
        result = await cnoService.updateRegistration(registration.id, {
          cno_number: cnoForm.cno_number,
          status: cnoForm.status,
          data_abertura: cnoForm.data_abertura || null,
          data_encerramento: cnoForm.data_encerramento || null,
          matricula_imovel: cnoForm.matricula_imovel,
          alvara_numero: cnoForm.alvara_numero,
          area_aprovada: cnoForm.area_aprovada,
          area_real: cnoForm.area_real,
          padrao_construtivo: cnoForm.padrao_construtivo,
          tipo_obra: cnoForm.tipo_obra,
          responsavel_tipo: cnoForm.responsavel_tipo,
          art_rrt: cnoForm.art_rrt
        });
      } else {
        result = await cnoService.createRegistration({
          organization_id: activeOrganizationId,
          project_id: selectedProjectId,
          cno_number: cnoForm.cno_number || null,
          status: cnoForm.status,
          data_abertura: cnoForm.data_abertura || null,
          data_encerramento: cnoForm.data_encerramento || null,
          matricula_imovel: cnoForm.matricula_imovel || null,
          alvara_numero: cnoForm.alvara_numero || null,
          area_aprovada: cnoForm.area_aprovada,
          area_real: cnoForm.area_real,
          padrao_construtivo: cnoForm.padrao_construtivo,
          tipo_obra: cnoForm.tipo_obra || null,
          responsavel_tipo: cnoForm.responsavel_tipo,
          art_rrt: cnoForm.art_rrt || null
        });
      }
      setRegistration(result);
      alert('Cadastro de CNO salvo com sucesso!');
      await cnoService.recalculateComplianceScore(selectedProjectId).then(setScore);
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao salvar CNO:', err);
      alert('Erro ao salvar CNO.');
    } finally {
      setActionLoading(false);
    }
  };

  // Varredura Fiscal (Scanner de deduções de notas)
  const handleScanInvoices = async () => {
    if (!selectedProjectId || !registration?.id) {
      alert('É necessário cadastrar o CNO antes de rodar a varredura fiscal.');
      return;
    }
    setActionLoading(true);
    try {
      const added = await cnoService.scanAndAddMaterialDeductions(selectedProjectId, registration.id);
      alert(`${added.length} novos abatimentos fiscais identificados e adicionados.`);
      // Atualizar lista e recalcular score
      await cnoService.listDeductions(selectedProjectId).then(setDeductions);
      await cnoService.recalculateComplianceScore(selectedProjectId).then(setScore);
    } catch (err) {
      console.error('[OpuraCnoModule] Erro na varredura fiscal:', err);
      alert('Erro ao rodar varredura de NF-e.');
    } finally {
      setActionLoading(false);
    }
  };

  // Adicionar declaração DCTFWeb / DARF
  const handleAddDctfweb = async () => {
    if (!registration?.id || !activeOrganizationId) {
      alert('Cadastre o CNO antes de registrar uma DCTFWeb.');
      return;
    }
    if (!dctfForm.declaration_number || !dctfForm.principal_amount) {
      alert('Informe o número do recibo e o valor principal.');
      return;
    }
    setActionLoading(true);
    try {
      const principal = Number(dctfForm.principal_amount) || 0;
      const fine = Number(dctfForm.fine_amount) || 0;
      const interest = Number(dctfForm.interest_amount) || 0;

      const created = await cnoService.addDctfweb({
        organization_id: activeOrganizationId,
        cno_registration_id: registration.id,
        declaration_number: dctfForm.declaration_number,
        transmission_date: dctfForm.transmission_date || null,
        principal_amount: principal,
        fine_amount: fine,
        interest_amount: interest,
        total_amount: principal + fine + interest,
        status: 'transmitida'
      });

      setDctfwebList(prev => [created, ...prev]);
      setDctfForm({ declaration_number: '', transmission_date: '', principal_amount: '', fine_amount: '', interest_amount: '' });
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao adicionar DCTFWeb:', err);
      alert('Erro ao registrar DCTFWeb.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDctfweb = async (id: string) => {
    const ok = await confirm({
      title: 'Remover declaração?',
      message: 'Esta declaração DCTFWeb será removida permanentemente.',
      variant: 'danger',
      confirmLabel: 'Remover'
    });
    if (!ok) return;
    try {
      await cnoService.deleteDctfweb(id);
      setDctfwebList(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao remover DCTFWeb:', err);
      alert('Erro ao remover declaração.');
    }
  };

  // Seção de Seleção de Obras
  if (!selectedProjectId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">ÒPURA CNO & Previdência de Obras</h1>
          <p className="text-gray-400 text-sm mt-1.5 font-medium">Selecione uma obra ativa para gerenciar CNO, regularização fiscal e simular reduções de INSS.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(projects as any[])
            .filter(p => p.name)
            .map(proj => (
              <div 
                key={proj.id}
                onClick={() => setSelectedProjectId(proj.id || null)}
                className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all cursor-pointer group flex flex-col justify-between h-48"
              >
                <div>
                  <div className="bg-indigo-50 text-indigo-600 w-10 h-10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-gray-800 text-lg group-hover:text-indigo-600 transition-colors line-clamp-1">{proj.name}</h3>
                  <p className="text-gray-400 text-xs mt-1">Cód. Obra: {proj.code || 'N/D'}</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-black uppercase text-indigo-500 tracking-wider">
                  Gerenciar Previdência
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  }

  const activeProject = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="space-y-6">
      {/* Header com breadcrumbs e seletor de obra */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
            <span className="hover:text-indigo-600 cursor-pointer" onClick={() => setSelectedProjectId(null)}>Previdência</span>
            <span>/</span>
            <span className="text-gray-600 font-bold">{activeProject?.name || 'Obra Selecionada'}</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-1.5 flex items-center gap-2">
            ÒPURA CNO & Previdência
            {score && (
              <span className={`text-sm font-semibold
                ${score.status_color === 'verde' ? 'text-emerald-600' : score.status_color === 'amarelo' ? 'text-amber-600' : 'text-red-600'}`}>
                Score {score.score}
              </span>
            )}
          </h1>
        </div>

        <button 
          onClick={() => setSelectedProjectId(null)}
          className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl font-bold text-button uppercase tracking-wider transition-colors"
        >
          Trocar de Obra
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-6 overflow-x-auto">
        {(['dashboard', 'cadastro', 'simulador', 'deducoes', 'dctfweb', 'dossie'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 font-black text-button uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap
              ${activeTab === tab
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {tab === 'deducoes' ? 'Deduções (Scanner)' : tab === 'dctfweb' ? 'DCTFWeb / DARF' : tab === 'dossie' ? 'Dossiê Digital' : tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Carregando painel...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. ABA DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Painel Principal de Score */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between items-center text-center">
                <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider w-full text-left">Compliance Previdenciário</h3>
                
                <div className="my-8 relative flex items-center justify-center">
                  <div className={`w-36 h-36 rounded-full border-8 flex flex-col items-center justify-center shadow-lg
                    ${score?.status_color === 'verde' ? 'border-emerald-500 bg-emerald-50/20' : score?.status_color === 'amarelo' ? 'border-amber-500 bg-amber-50/20' : 'border-red-500 bg-red-50/20'}`}>
                    <span className="text-4xl font-black text-gray-800">{score?.score ?? 'N/D'}</span>
                    <span className="text-xs font-black uppercase text-gray-400 tracking-widest mt-1">Score</span>
                  </div>
                </div>

                <div className="w-full text-left">
                  <div className="flex justify-between text-xs py-1 border-b border-gray-50">
                    <span className="text-gray-500">CNO Regular</span>
                    <span className="font-bold">{score?.cno_regular ? '🟢 Regular' : '🔴 Pendente'}</span>
                  </div>
                  <div className="flex justify-between text-xs py-1 border-b border-gray-50">
                    <span className="text-gray-500">eSocial Atualizado</span>
                    <span className="font-bold">{score?.esocial_atualizado ? '🟢 Em Dia' : '🔴 Inconforme'}</span>
                  </div>
                  <div className="flex justify-between text-xs py-1 border-b border-gray-50">
                    <span className="text-gray-500">CNDs Terceiros</span>
                    <span className="font-bold">{score?.certidoes_validas ? '🟢 Válidas' : '🔴 Vencidas'}</span>
                  </div>
                  <div className="flex justify-between text-xs py-1">
                    <span className="text-gray-500">Retenções Medições</span>
                    <span className="font-bold">{score?.retencoes_corretas ? '🟢 Conformidade' : '🔴 Inconsistente'}</span>
                  </div>
                </div>
              </div>

              {/* Cards de Métricas e Gráficos Rápidos */}
              <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-shadow">
                    <div className="bg-blue-50 text-blue-600 w-8 h-8 rounded-xl flex items-center justify-center mb-3">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">INSS Previsto (CUB)</p>
                    <h4 className="text-xl font-bold text-gray-800 mt-2">
                      {simulations.find(s => s.is_active) 
                        ? `R$ ${simulations.find(s => s.is_active)?.inss_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                        : 'Simulação Pendente'}
                    </h4>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-shadow">
                    <div className="bg-emerald-50 text-emerald-600 w-8 h-8 rounded-xl flex items-center justify-center mb-3">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Crédito de Materiais</p>
                    <h4 className="text-xl font-bold text-gray-800 mt-2">
                      R$ {deductions
                        .filter(d => d.source_type === 'nfe')
                        .reduce((acc, d) => acc + Number(d.valor_abatimento), 0)
                        .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </h4>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-shadow">
                    <div className="bg-indigo-50 text-indigo-600 w-8 h-8 rounded-xl flex items-center justify-center mb-3">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Economia Estimada</p>
                    <h4 className="text-xl font-bold text-gray-800 mt-2">
                      R$ {simulations.find(s => s.is_active) 
                        ? `R$ ${simulations.find(s => s.is_active)?.economia_potencial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : '0,00'}
                    </h4>
                  </div>
                </div>

                {/* Bloco de Ações Rápidas */}
                <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 p-6 rounded-3xl text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-indigo-950/20">
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold">Identifique deduções ocultas na obra</h3>
                    <p className="text-indigo-200 text-xs max-w-md">O motor da ÒPURA analisa automaticamente as NF-es e compras de concreto e cimento para aplicar abatimentos previdenciários de forma instantânea.</p>
                  </div>
                  <button
                    onClick={handleScanInvoices}
                    disabled={actionLoading}
                    className="px-6 py-3 bg-white text-indigo-900 hover:bg-indigo-50 rounded-2xl font-black text-button uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-indigo-900" />}
                    Executar Varredura
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. ABA CADASTRO CNO */}
          {activeTab === 'cadastro' && (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Cadastro do CNO e Regularização</h3>
                <p className="text-gray-400 text-xs">Preencha as informações do alvará, matrícula e número do CNO.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Número do CNO</label>
                  <input
                    value={cnoForm.cno_number}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, cno_number: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    placeholder="Ex: 51.218.49079/78"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Status da Regularização</label>
                  <select
                    value={cnoForm.status}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                  >
                    <option value="rascunho">Rascunho</option>
                    <option value="documentacao_enviada">Documentação Enviada</option>
                    <option value="validacao">Validação (Aferição)</option>
                    <option value="aberto">Aberto / Em Andamento</option>
                    <option value="encerrado">Encerrado (CND Emitida)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Alvará de Construção</label>
                  <input
                    value={cnoForm.alvara_numero}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, alvara_numero: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    placeholder="Nº Alvará / Ano"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Matrícula do Imóvel</label>
                  <input
                    value={cnoForm.matricula_imovel}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, matricula_imovel: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    placeholder="Nº Matrícula e Cartório"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Área Aprovada (m²)</label>
                  <input
                    type="number"
                    value={cnoForm.area_aprovada}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, area_aprovada: Number(e.target.value) }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Área Real de Aferição (m²)</label>
                  <input
                    type="number"
                    value={cnoForm.area_real}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, area_real: Number(e.target.value) }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Padrão Construtivo</label>
                  <select
                    value={cnoForm.padrao_construtivo || 'normal'}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, padrao_construtivo: e.target.value as any }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                  >
                    <option value="baixo">Baixo</option>
                    <option value="normal">Normal</option>
                    <option value="alto">Alto</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Responsabilidade</label>
                  <select
                    value={cnoForm.responsavel_tipo || 'construtor'}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, responsavel_tipo: e.target.value as any }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                  >
                    <option value="proprietario">Proprietário</option>
                    <option value="incorporador">Incorporador</option>
                    <option value="construtor">Construtor (Solidário)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">ART / RRT Vinculada</label>
                  <input
                    value={cnoForm.art_rrt}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, art_rrt: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    placeholder="Código do Registro Técnico"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                <button
                  onClick={handleSaveCnoRegistration}
                  disabled={actionLoading}
                  className="px-6 py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-2xl font-black text-button uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar Cadastro CNO
                </button>
              </div>
            </div>
          )}

          {/* 3. ABA SIMULADOR DE INSS */}
          {activeTab === 'simulador' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form da Simulação */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Parâmetros de Aferição</h3>
                  <p className="text-gray-400 text-xs">Informe os parâmetros para cálculo do CUB correspondente.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Nome do Cenário</label>
                    <input
                      value={simForm.scenario_name}
                      onChange={(e) => setSimForm(prev => ({ ...prev, scenario_name: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Estado (UF)</label>
                      <input
                        value={simForm.state}
                        onChange={(e) => setSimForm(prev => ({ ...prev, state: e.target.value.toUpperCase() }))}
                        className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ref. Date</label>
                      <input
                        value={simForm.reference_date}
                        onChange={(e) => setSimForm(prev => ({ ...prev, reference_date: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                        placeholder="YYYY-MM"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Desoneração (CPRB)</label>
                    <select
                      value={simForm.social_charges}
                      onChange={(e) => setSimForm(prev => ({ ...prev, social_charges: e.target.value as any }))}
                      className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    >
                      <option value="sem_desoneracao">Sem Desoneração</option>
                      <option value="com_desoneracao">Com Desoneração (Desonerado)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Área (m²)</label>
                      <input
                        type="number"
                        value={simForm.area_construida}
                        onChange={(e) => setSimForm(prev => ({ ...prev, area_construida: Number(e.target.value) }))}
                        className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Padrão</label>
                      <select
                        value={simForm.padrao}
                        onChange={(e) => setSimForm(prev => ({ ...prev, padrao: e.target.value as any }))}
                        className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                      >
                        <option value="baixo">Baixo</option>
                        <option value="normal">Normal</option>
                        <option value="alto">Alto</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Método Construtivo</label>
                    <select
                      value={simForm.metodo_construtivo || 'convencional'}
                      onChange={(e) => setSimForm(prev => ({ ...prev, metodo_construtivo: e.target.value as any }))}
                      className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    >
                      <option value="convencional">Alvenaria Convencional</option>
                      <option value="pre_moldado">Pré-Moldado de Concreto (Redutor 50%)</option>
                      <option value="estrutura_metalica">Estrutura Metálica (Redutor 40%)</option>
                      <option value="steel_frame">Steel Frame (Redutor 40%)</option>
                      <option value="drywall">Drywall (Redutor 15%)</option>
                      <option value="modular">Modular / Industrializado (Redutor 50%)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Regime de Contratação</label>
                    <select
                      value={simForm.regime_contratacao || 'equipe_propria'}
                      onChange={(e) => setSimForm(prev => ({ ...prev, regime_contratacao: e.target.value as any }))}
                      className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    >
                      <option value="equipe_propria">Mão de Obra Própria</option>
                      <option value="empreitada_global">Empreitada Global</option>
                      <option value="empreitada_parcial">Empreitada Parcial</option>
                      <option value="bts">Build To Suit (BTS)</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 w-full">
                  <button
                    onClick={handleRunSimulation}
                    disabled={actionLoading}
                    className="flex-1 py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-2xl font-black text-button uppercase tracking-widest flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Simular
                  </button>
                  {activeSimResult && (
                    <button
                      onClick={handleSaveSimulation}
                      disabled={actionLoading}
                      className="px-4 py-3 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-2xl font-black text-button uppercase tracking-widest flex items-center justify-center transition-colors"
                      title="Salvar como simulação ativa"
                    >
                      Salvar
                    </button>
                  )}
                </div>
              </div>

              {/* Resultado da Simulação */}
              <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Cenário de Aferição SERO</h3>
                  <p className="text-gray-400 text-xs">Valores gerados com base nas fórmulas oficiais da Receita Federal.</p>
                </div>

                {activeSimResult ? (
                  <div className="my-6 space-y-6 flex-1 justify-center flex flex-col">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="p-4 bg-gray-50 rounded-2xl">
                        <span className="text-xs font-black uppercase tracking-wider text-gray-400">Valor CUB (m²)</span>
                        <h5 className="text-lg font-bold text-gray-800 mt-1">R$ {activeSimResult.cubValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h5>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-2xl">
                        <span className="text-xs font-black uppercase tracking-wider text-gray-400">Custo Global Estimado</span>
                        <h5 className="text-lg font-bold text-gray-800 mt-1">R$ {activeSimResult.custoEstimadoObra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h5>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-2xl">
                        <span className="text-xs font-black uppercase tracking-wider text-gray-400">Mão de Obra Aferida</span>
                        <h5 className="text-lg font-bold text-gray-800 mt-1">R$ {activeSimResult.baseCalculoMaoObra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h5>
                      </div>
                      <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/30">
                        <span className="text-xs font-black uppercase tracking-wider text-indigo-600">INSS Final Estimado</span>
                        <h5 className="text-lg font-bold text-indigo-900 mt-1">R$ {activeSimResult.inssFinalEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h5>
                      </div>
                    </div>

                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between text-emerald-800">
                      <div>
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-600">Redução e Economia Previdenciária</span>
                        <p className="text-xs font-semibold mt-0.5">Graças ao método construtivo industrializado ({simForm.metodo_construtivo})</p>
                      </div>
                      <h4 className="text-xl font-black">R$ {activeSimResult.economiaMetodoConstrutivo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 py-12 gap-3 text-center">
                    <Calculator className="w-12 h-12 text-gray-300" />
                    <p className="text-sm font-semibold text-gray-400">Preencha os dados e execute a simulação no menu lateral.</p>
                  </div>
                )}

                {/* Lista de Simulações Gravadas */}
                {simulations.length > 0 && (
                  <div className="mt-6 border-t border-gray-100 pt-6">
                    <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Simulações de Cenários</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {simulations.map(sim => (
                        <div key={sim.id} className="flex items-center justify-between p-3 border border-gray-50 hover:border-gray-100 rounded-xl text-xs">
                          <div>
                            <span className="font-bold text-gray-800">{sim.scenario_name}</span>
                            <span className="text-gray-400 ml-2">({sim.area_construida} m² · {sim.metodo_construtivo})</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-500">INSS: <strong className="text-gray-800">R$ {sim.inss_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                            {sim.is_active && <span className="bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase">Ativo</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. ABA DEDUÇÕES */}
          {activeTab === 'deducoes' && (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Scanner de Abatimentos & Créditos</h3>
                  <p className="text-gray-400 text-xs">Notas Fiscais de concreto usinado vinculadas a esta obra para abatimento do INSS no SERO.</p>
                </div>

                <button
                  onClick={handleScanInvoices}
                  disabled={actionLoading}
                  className="px-4 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-black text-button uppercase tracking-wider transition-colors flex items-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Scanner de NF-e
                </button>
              </div>

              {deductions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider">
                        <th className="py-3 px-4">Origem</th>
                        <th className="py-3 px-4">Descrição</th>
                        <th className="py-3 px-4">Valor Base</th>
                        <th className="py-3 px-4">Valor Abatimento (40%)</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Validação IA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deductions.map(ded => (
                        <tr key={ded.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-3.5 px-4 text-sm font-normal text-gray-800">
                            {ded.source_type === 'nfe' ? '🧾 NF-e de Compra' : '🛠️ Medição'}
                          </td>
                          <td className="py-3.5 px-4 text-sm font-normal text-gray-500">{ded.description}</td>
                          <td className="py-3.5 px-4 text-sm font-medium text-gray-700">R$ {ded.valor_base.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-3.5 px-4 text-sm font-medium text-indigo-600">R$ {ded.valor_abatimento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-3.5 px-4">
                            <span className={`text-sm font-normal ${
                              ded.status_validacao === 'aproveitado' ? 'text-emerald-600' : ded.status_validacao === 'rejeitado' ? 'text-red-600' : 'text-amber-600'
                            }`}>
                              {ded.status_validacao}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-sm font-normal text-gray-400">{ded.revisao_ia_feedback || 'Sem revisões.'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                  <FileText className="w-12 h-12 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-400">Nenhum abatimento localizado. Clique em "Scanner de NF-e" para iniciar a busca.</p>
                </div>
              )}
            </div>
          )}

          {/* 5. ABA DCTFWeb / DARF */}
          {activeTab === 'dctfweb' && (
            !registration?.id ? (
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-20 gap-3 text-center">
                <FileText className="w-12 h-12 text-gray-300" />
                <p className="text-sm font-semibold text-gray-400">Cadastre o CNO na aba "cadastro" antes de registrar as guias DCTFWeb / DARF.</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Formulário de Registro */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Controle de DCTFWeb & DARF</h3>
                  <p className="text-gray-400 text-xs">Registre as guias transmitidas e os DARFs pagos referentes à aferição da obra.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Nº do Recibo / Declaração</label>
                    <input
                      value={dctfForm.declaration_number}
                      onChange={(e) => setDctfForm(prev => ({ ...prev, declaration_number: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                      placeholder="Ex: 1234567890"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Data de Transmissão</label>
                    <input
                      type="date"
                      value={dctfForm.transmission_date}
                      onChange={(e) => setDctfForm(prev => ({ ...prev, transmission_date: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Valor Principal</label>
                      <input
                        type="number"
                        value={dctfForm.principal_amount}
                        onChange={(e) => setDctfForm(prev => ({ ...prev, principal_amount: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                        placeholder="0,00"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Multa (R$)</label>
                      <input
                        type="number"
                        value={dctfForm.fine_amount}
                        onChange={(e) => setDctfForm(prev => ({ ...prev, fine_amount: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Juros (R$)</label>
                    <input
                      type="number"
                      value={dctfForm.interest_amount}
                      onChange={(e) => setDctfForm(prev => ({ ...prev, interest_amount: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAddDctfweb}
                  disabled={actionLoading}
                  className="w-full py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-2xl font-black text-button uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Registrar DCTFWeb
                </button>
              </div>

              {/* Lista de Declarações */}
              <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Declarações Transmitidas</h3>
                  <p className="text-gray-400 text-xs">Guias DCTFWeb e DARFs vinculados a esta obra.</p>
                </div>

                {dctfwebList.length > 0 ? (
                  <div className="space-y-3">
                    {dctfwebList.map(dec => (
                      <div key={dec.id} className="p-4 border border-gray-100 rounded-2xl flex items-start justify-between gap-4 hover:border-indigo-100 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-gray-800">Recibo: {dec.declaration_number || '—'}</span>
                            <span className={`text-xs font-medium ${
                              dec.status === 'paga' ? 'text-emerald-600' : dec.status === 'cancelada' ? 'text-red-600' : dec.status === 'retificada' ? 'text-amber-600' : 'text-indigo-600'
                            }`}>
                              {dec.status}
                            </span>
                          </div>
                          {dec.transmission_date && (
                            <p className="text-gray-400 text-xs mb-3">Transmitida em: {dec.transmission_date.split('-').reverse().join('/')}</p>
                          )}
                          <div className="grid grid-cols-3 gap-4 text-xs">
                            <div>
                              <span className="block text-gray-400">Principal</span>
                              <span className="font-medium text-gray-700">R$ {dec.principal_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div>
                              <span className="block text-gray-400">Multa / Juros</span>
                              <span className="font-medium text-gray-700">R$ {(dec.fine_amount + dec.interest_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div>
                              <span className="block text-gray-400">Total DARF</span>
                              <span className="font-bold text-indigo-900">R$ {dec.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        </div>
                        <ActionIconButton kind="delete" className="opacity-0 group-hover:opacity-100" title="Remover declaração" onClick={() => handleDeleteDctfweb(dec.id)} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <FileText className="w-12 h-12 text-gray-300" />
                    <p className="text-sm font-semibold text-gray-400">Nenhuma declaração DCTFWeb registrada.</p>
                  </div>
                )}
              </div>
            </div>
            )
          )}

          {/* 6. ABA DOSSIÊ DIGITAL */}
          {activeTab === 'dossie' && (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Dossiê Digital de Aferição</h3>
                <p className="text-gray-400 text-xs">Pasta consolidada com todas as obrigações previdenciárias e fiscais para exportação e encerramento no SERO.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between hover:border-indigo-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-50 text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center">
                      <FolderOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-gray-800">Processo de CNO & Alvarás</h5>
                      <p className="text-gray-400 text-xs">Alvará de Construção, ART/RRT e Matrícula vinculadas.</p>
                    </div>
                  </div>
                  <button className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between hover:border-indigo-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-50 text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-gray-800">Eventos de eSocial (CLT próprio)</h5>
                      <p className="text-gray-400 text-xs">Arquivos XML do evento S-2200 e fechamento S-1299.</p>
                    </div>
                  </div>
                  <button className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between hover:border-indigo-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-50 text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center">
                      <Calculator className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-gray-800">Medições & Retenções (Empreiteiras)</h5>
                      <p className="text-gray-400 text-xs">Notas fiscais de serviço e comprovantes de retenções do INSS.</p>
                    </div>
                  </div>
                  <button className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between hover:border-indigo-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-50 text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-gray-800">Notas Fiscais de Concreto (Deduções)</h5>
                      <p className="text-gray-400 text-xs">XMLs das NF-es de concreto e massa usinadas abatidas.</p>
                    </div>
                  </div>
                  <button className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                <button
                  onClick={() => alert('Exportando dossiê ZIP compactado...')}
                  className="px-6 py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-2xl font-black text-button uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20"
                >
                  Baixar Dossiê Completo (.zip)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OpuraCnoModule;
