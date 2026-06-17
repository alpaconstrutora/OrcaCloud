import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  TrendingUp,
  FileCheck,
  Calendar,
  Layers,
  Copy,
  Plus,
  Trash2,
  AlertTriangle,
  Check,
  X,
  UserCheck,
  Coins,
  ChevronDown,
  ChevronRight,
  Briefcase,
  Building2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { orgGovernanceService } from '../services/orgGovernanceService';
import { laborService, Employee } from '../services/laborService';
import { useConfirm } from './ui/confirm';
import {
  OrgRole,
  OrgRelationship,
  OrgAuthorityLimit,
  OrgDelegation,
  OrgRaciMatrix,
  OrgCommittee,
  OrgCommitteeMember,
  OrgSuccessionPlan,
  OrgSandboxScenario,
  OrgRelationshipType,
  AuthorityFlowType,
  ReadinessLevel,
  RiskLevel,
  RaciRoleType
} from '../types';

interface OpuraGovernanceModuleProps {
  activeOrganizationId: string | null;
  projects?: any[];
  currentProfile?: any;
  onChangeView?: (view: string) => void;
}

interface CompanyOption {
  id: string;
  razao_social: string;
  tipo: string;
}

export default function OpuraGovernanceModule({
  activeOrganizationId,
  onChangeView
}: OpuraGovernanceModuleProps) {
  const confirm = useConfirm();
  const { organizations, setActiveOrganizationId } = useStore();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [loading, setLoading] = useState<boolean>(true);

  // Dados das tabelas
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [relationships, setRelationships] = useState<OrgRelationship[]>([]);
  const [authorityLimits, setAuthorityLimits] = useState<OrgAuthorityLimit[]>([]);
  const [delegations, setDelegations] = useState<OrgDelegation[]>([]);
  const [raciMatrix, setRaciMatrix] = useState<OrgRaciMatrix[]>([]);
  const [committees, setCommittees] = useState<OrgCommittee[]>([]);
  const [successionPlans, setSuccessionPlans] = useState<OrgSuccessionPlan[]>([]);
  const [sandboxScenarios, setSandboxScenarios] = useState<OrgSandboxScenario[]>([]);

  // Modais de Criação
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [newRole, setNewRole] = useState({ nome: '', codigo: '', descricao: '', nivel_hierarquico: 3, responsabilidades: '' });

  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [newLimit, setNewLimit] = useState({ flow_type: 'compras' as AuthorityFlowType, target_type: 'role', target_id: '', limite_minimo: 0, limite_maximo: 5000, requer_dupla_assinatura: false });

  const [isDelegationModalOpen, setIsDelegationModalOpen] = useState(false);
  const [newDelegation, setNewDelegation] = useState({ delegator_id: '', delegatee_id: '', flow_type: '' as any, limite_maximo: '', data_inicio: '', data_fim: '', motivo: '' });

  // ── Carregar Empresas ────────────────────────────────────────
  useEffect(() => {
    async function loadCompanies() {
      if (!activeOrganizationId) return;
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('id, org_id, razao_social, tipo')
          .eq('org_id', activeOrganizationId);
        if (error) throw error;
        setCompanies(data || []);
        if (data && data.length > 0) {
          setSelectedCompanyId(data[0].id);
        }
      } catch (err) {
        console.error('Erro ao carregar empresas do grupo:', err);
      }
    }
    loadCompanies();
  }, [activeOrganizationId]);

  const handleCreateDefaultCompany = async () => {
    if (!activeOrganizationId) return;
    setLoading(true);
    try {
      // Busca o nome da organização para usar como razão social
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', activeOrganizationId)
        .single();

      const orgName = orgData?.name || 'Empresa Principal';

      const { data, error } = await supabase
        .from('companies')
        .insert({
          org_id: activeOrganizationId,
          razao_social: orgName,
          nome_fantasia: orgName,
          tipo: 'construtora',
          is_headquarters: true,
          status: 'ativa',
          modulos_habilitados: {
            obras: true,
            compras: true,
            financeiro: true,
            fiscal: true,
            rh: true,
            incorporacao: true,
            crm: true,
            estoque: true,
            broker_portal: true
          }
        })
        .select()
        .single();

      if (error) throw error;

      // Recarrega as empresas
      const { data: newCompanies } = await supabase
        .from('companies')
        .select('id, razao_social, tipo')
        .eq('org_id', activeOrganizationId);

      setCompanies(newCompanies || []);
      if (data) {
        setSelectedCompanyId(data.id);
      }
    } catch (err) {
      alert('Erro ao criar empresa padrão: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ── Carregar Dados da Empresa Selecionada ───────────────────
  useEffect(() => {
    async function loadAllData() {
      if (!selectedCompanyId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [
          rolesData,
          employeesData,
          relationshipsData,
          limitsData,
          delegationsData,
          raciData,
          committeesData,
          successionData,
          sandboxData
        ] = await Promise.all([
          orgGovernanceService.listRoles(selectedCompanyId),
          laborService.listEmployees(activeOrganizationId || undefined, selectedCompanyId),
          orgGovernanceService.listRelationships(selectedCompanyId),
          orgGovernanceService.listAuthorityLimits(selectedCompanyId),
          orgGovernanceService.listDelegations(selectedCompanyId),
          orgGovernanceService.listRaciMatrix(selectedCompanyId),
          orgGovernanceService.listCommittees(selectedCompanyId),
          orgGovernanceService.listSuccessionPlans(selectedCompanyId),
          orgGovernanceService.listSandboxScenarios(selectedCompanyId)
        ]);

        setRoles(rolesData);
        setEmployees(employeesData);
        setRelationships(relationshipsData);
        setAuthorityLimits(limitsData);
        setDelegations(delegationsData);
        setRaciMatrix(raciData);
        setCommittees(committeesData);
        setSuccessionPlans(successionData);
        setSandboxScenarios(sandboxData);
      } catch (err) {
        console.error('Erro ao carregar dados de governança:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAllData();
  }, [selectedCompanyId, activeOrganizationId]);

  // ── Ações Rápidas ───────────────────────────────────────────
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRole.nome) return;
    try {
      await orgGovernanceService.saveRole({
        company_id: selectedCompanyId,
        nome: newRole.nome,
        codigo: newRole.codigo || null,
        descricao: newRole.descricao || null,
        nivel_hierarquico: newRole.nivel_hierarquico,
        responsabilidades: newRole.responsabilidades.split('\n').filter(Boolean)
      });
      setIsRoleModalOpen(false);
      setNewRole({ nome: '', codigo: '', descricao: '', nivel_hierarquico: 3, responsabilidades: '' });
      // Recarregar
      const data = await orgGovernanceService.listRoles(selectedCompanyId);
      setRoles(data);
    } catch (err) {
      alert('Erro ao criar cargo: ' + (err as Error).message);
    }
  };

  const handleCreateLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLimit.target_id) return;
    try {
      await orgGovernanceService.saveAuthorityLimit({
        company_id: selectedCompanyId,
        flow_type: newLimit.flow_type,
        role_id: newLimit.target_type === 'role' ? newLimit.target_id : null,
        department_id: newLimit.target_type === 'department' ? newLimit.target_id : null,
        employee_id: newLimit.target_type === 'employee' ? newLimit.target_id : null,
        limite_minimo: Number(newLimit.limite_minimo),
        limite_maximo: Number(newLimit.limite_maximo),
        requer_dupla_assinatura: newLimit.requer_dupla_assinatura
      });
      setIsLimitModalOpen(false);
      // Recarregar
      const data = await orgGovernanceService.listAuthorityLimits(selectedCompanyId);
      setAuthorityLimits(data);
    } catch (err) {
      alert('Erro ao cadastrar limite: ' + (err as Error).message);
    }
  };

  const handleCreateDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDelegation.delegator_id || !newDelegation.delegatee_id || !newDelegation.data_inicio || !newDelegation.data_fim) return;
    try {
      await orgGovernanceService.saveDelegation({
        company_id: selectedCompanyId,
        delegator_employee_id: newDelegation.delegator_id,
        delegatee_employee_id: newDelegation.delegatee_id,
        flow_type: newDelegation.flow_type || null,
        limite_maximo: newDelegation.limite_maximo ? Number(newDelegation.limite_maximo) : null,
        data_inicio: new Date(newDelegation.data_inicio).toISOString(),
        data_fim: new Date(newDelegation.data_fim).toISOString(),
        status: 'ativa',
        motivo: newDelegation.motivo || null
      });
      setIsDelegationModalOpen(false);
      setNewDelegation({ delegator_id: '', delegatee_id: '', flow_type: '' as any, limite_maximo: '', data_inicio: '', data_fim: '', motivo: '' });
      // Recarregar
      const data = await orgGovernanceService.listDelegations(selectedCompanyId);
      setDelegations(data);
    } catch (err) {
      alert('Erro ao criar delegação: ' + (err as Error).message);
    }
  };

  const handleRevokeDelegation = async (id: string) => {
    if (!await confirm({ title: 'Revogar esta delegação?', message: 'A delegação de autoridade será revogada.', variant: 'danger', confirmLabel: 'Revogar' })) return;
    try {
      await orgGovernanceService.revokeDelegation(id);
      const data = await orgGovernanceService.listDelegations(selectedCompanyId);
      setDelegations(data);
    } catch (err) {
      alert('Erro ao revogar delegação: ' + (err as Error).message);
    }
  };

  // ── Cálculo de Alertas / Riscos (Dashboard) ─────────────────
  const risks = React.useMemo(() => {
    const list: { title: string; desc: string; level: 'critical' | 'warning' }[] = [];
    
    // 1. Cargos sem responsáveis
    roles.forEach(r => {
      const hasResponsible = employees.some(e => e.role_id === r.id);
      if (!hasResponsible) {
        list.push({
          title: `Cargo sem responsável: ${r.nome}`,
          desc: `O cargo "${r.nome}" (Cód: ${r.codigo || 'S/C'}) não possui nenhum colaborador associado ativamente.`,
          level: r.nivel_hierarquico <= 2 ? 'critical' : 'warning'
        });
      }
    });

    // 2. Colaboradores sem superior hierárquico (exceto diretores/nível 1)
    employees.forEach(e => {
      if (e.status !== 'ATIVO') return;
      const role = roles.find(r => r.id === e.role_id);
      if (role && role.nivel_hierarquico > 1) {
        // busca relacionamento hierárquico onde o employee é a ponta de comando (source)
        const hasBoss = relationships.some(r => 
          r.relationship_type === 'hierarquico' && 
          (r.source_employee_id === e.id || (role && r.source_role_id === role.id))
        );
        if (!hasBoss) {
          list.push({
            title: `Colaborador sem superior hierárquico: ${e.name}`,
            desc: `O colaborador ocupa a função de "${e.role}" e não tem relação de subordinação direta desenhada.`,
            level: 'warning'
          });
        }
      }
    });

    // 3. Concentração excessiva de alçadas (ex: único aprovador acima de 500k)
    authorityLimits.forEach(lim => {
      if (lim.limite_maximo > 100000 && !lim.requer_dupla_assinatura) {
        const owner = lim.role_id ? roles.find(r => r.id === lim.role_id)?.nome : (lim.employee_id ? employees.find(e => e.id === lim.employee_id)?.name : 'Departamento');
        list.push({
          title: `Concentração excessiva de poder: ${owner}`,
          desc: `Limite de aprovação de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lim.limite_maximo)} em ${lim.flow_type.toUpperCase()} sem necessidade de assinatura dupla.`,
          level: 'critical'
        });
      }
    });

    return list;
  }, [roles, employees, relationships, authorityLimits]);

  if (!activeOrganizationId) {
    return (
      <div className="min-h-screen text-gray-200 font-sans p-6 space-y-6 flex flex-col justify-center items-center">
        <div className="bg-gray-900/40 border border-gray-800/80 rounded-[2rem] p-10 text-center shadow-2xl backdrop-blur-md space-y-6 max-w-xl w-full mx-auto animate-fadeIn">
          <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto text-blue-500 shadow-lg border border-blue-500/20">
            <Shield className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Selecionar Organização Ativa</h2>
            <p className="text-sm text-gray-400">
              Para gerenciar o organograma, cargos, alçadas e comitês de governança, selecione uma organização ativa do seu grupo econômico abaixo:
            </p>
          </div>

          <div className="space-y-3 pt-2 text-left max-h-[300px] overflow-y-auto pr-1">
            {organizations.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">Nenhuma organização cadastrada para este usuário.</p>
            ) : (
              organizations.map(org => (
                <button
                  key={org.id}
                  onClick={() => setActiveOrganizationId(org.id)}
                  className="w-full bg-gray-950/60 hover:bg-gray-900/60 border border-gray-800/80 hover:border-blue-500/40 p-4 rounded-[1.25rem] transition-all flex items-center justify-between group active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center p-2 text-gray-400 group-hover:text-blue-400 transition-colors border border-gray-800">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors uppercase">{org.name}</p>
                      {org.cnpj && <p className="text-[10px] text-gray-500 font-mono mt-0.5">{org.cnpj}</p>}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-gray-200 font-sans p-6 space-y-6">
      
      {/* ── HEADER E SELETOR DE EMPRESAS ──────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-500" />
            ÒPURA Organization & Governance
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Sistema Operacional Organizacional e Governança Corporativa Viva.
          </p>
        </div>
        
        <div className="flex items-center gap-3 bg-gray-900/60 backdrop-blur border border-gray-800 p-2.5 rounded-[1.25rem] shadow-inner">
          <span className="text-xs font-black uppercase text-gray-500 tracking-wider pl-2">Empresa Ativa:</span>
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="bg-gray-950 text-white font-bold text-sm border-0 focus:ring-0 cursor-pointer rounded-[0.75rem] py-1.5 px-3 pr-8"
          >
            {companies.map(c => (
              <option key={c.id} value={c.id}>
                {c.razao_social} ({c.tipo.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── NAVEGAÇÃO DE ABAS (TABS) ─────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-b border-gray-800 pb-px">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
          { id: 'organograma', label: 'Organograma', icon: Layers },
          { id: 'alcadas', label: 'Alçadas', icon: Coins },
          { id: 'delegacoes', label: 'Delegações', icon: Calendar },
          { id: 'raci', label: 'Matriz RACI', icon: FileCheck },
          { id: 'comites', label: 'Comitês', icon: Users },
          { id: 'sucessao', label: 'Sucessão', icon: UserCheck },
          { id: 'sandbox', label: 'Sandbox', icon: Copy }
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-5 py-3.5 font-black text-xs uppercase tracking-widest transition-all rounded-t-[1rem] -mb-px border-b-2 ${
                active 
                  ? 'bg-gray-900/80 text-white border-blue-500' 
                  : 'text-gray-400 border-transparent hover:text-gray-200'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-blue-500' : 'text-gray-500'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── CONTEÚDO DAS ABAS ─────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : companies.length === 0 ? (
        <div className="bg-gray-900/40 border border-gray-800/80 rounded-[1.5rem] p-12 text-center shadow-xl backdrop-blur-md space-y-5 max-w-lg mx-auto">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <h3 className="text-lg font-black text-white">Nenhuma Empresa Cadastrada</h3>
          <p className="text-sm text-gray-400">
            Esta organização não possui nenhuma empresa cadastrada no banco de dados. Para utilizar a governança, primeiro crie a empresa principal deste grupo.
          </p>
          <button
            onClick={handleCreateDefaultCompany}
            className="flex items-center gap-2.5 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[1rem] font-black text-xs uppercase tracking-widest transition-all mx-auto shadow-lg active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Criar Empresa Sede
          </button>
        </div>
      ) : (
        <div className="bg-gray-900/40 border border-gray-800/80 rounded-[1.5rem] p-6 shadow-xl backdrop-blur-md">
          
          {/* 1. DASHBOARD DE RISCOS */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: 'Cargos Estruturados', val: roles.length, icon: Briefcase, color: 'text-blue-500 bg-blue-500/10' },
                  { label: 'Colaboradores Ativos', val: employees.filter(e => e.status === 'ATIVO').length, icon: Users, color: 'text-emerald-500 bg-emerald-500/10' },
                  { label: 'Alçadas Definidas', val: authorityLimits.length, icon: Coins, color: 'text-amber-500 bg-amber-500/10' },
                  { label: 'Comitês Societários', val: committees.length, icon: Shield, color: 'text-purple-500 bg-purple-500/10' }
                ].map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <div key={i} className="bg-gray-950/60 border border-gray-800 rounded-[1.25rem] p-5 flex items-center justify-between">
                      <div>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{stat.label}</p>
                        <h3 className="text-3xl font-black text-white mt-1">{stat.val}</h3>
                      </div>
                      <div className={`p-3.5 rounded-[1rem] ${stat.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-gray-800/80 pt-6">
                <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Alertas de Governança e Riscos Corporativos
                </h3>
                
                {risks.length === 0 ? (
                  <div className="bg-emerald-950/20 border border-emerald-900/60 text-emerald-400 p-4 rounded-[1.25rem] text-sm font-medium flex items-center gap-3">
                    <Check className="w-5 h-5 text-emerald-500" />
                    Nenhum conflito, vaga crítica ou risco de autoridade identificado na estrutura ativa.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {risks.map((risk, index) => (
                      <div
                        key={index}
                        className={`border p-4 rounded-[1.25rem] flex gap-4 ${
                          risk.level === 'critical'
                            ? 'bg-rose-950/20 border-rose-900/60 text-rose-200'
                            : 'bg-amber-950/20 border-amber-900/60 text-amber-200'
                        }`}
                      >
                        <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${risk.level === 'critical' ? 'text-rose-500' : 'text-amber-500'}`} />
                        <div>
                          <h4 className="font-black text-sm text-white">{risk.title}</h4>
                          <p className="text-xs text-gray-400 mt-1">{risk.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. ORGANOGRAMA INTERATIVO (VISUALIZADOR EM ÁRVORE HIERÁRQUICA) */}
          {activeTab === 'organograma' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black text-white">Hierarquia de Cargos</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Estrutura organizacional ativa ordenada por nível hierárquico.</p>
                </div>
                <button
                  onClick={() => setIsRoleModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[1rem] font-bold text-xs uppercase tracking-wider transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Criar Cargo
                </button>
              </div>

              {/* Renderizador de Árvore Simplificado em CSS/HTML */}
              <div className="bg-gray-950/40 border border-gray-800 rounded-[1.25rem] p-6 min-h-[400px] flex flex-col items-center">
                {roles.length === 0 ? (
                  <p className="text-gray-500 text-sm mt-20">Nenhum cargo estruturado nesta empresa.</p>
                ) : (
                  <div className="space-y-6 w-full max-w-2xl">
                    {/* Agrupados por nível hierárquico */}
                    {Array.from(new Set(roles.map(r => r.nivel_hierarquico))).sort((a,b) => a - b).map(nivel => (
                      <div key={nivel} className="border-b border-gray-900 pb-4 last:border-b-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-600 block mb-3">Nível {nivel}</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {roles.filter(r => r.nivel_hierarquico === nivel).map(role => {
                            const occupiedBy = employees.filter(e => e.role_id === role.id && e.status === 'ATIVO');
                            return (
                              <div key={role.id} className="bg-gray-900/60 border border-gray-800 hover:border-gray-700 p-4 rounded-[1.25rem] transition-all flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs bg-gray-800 text-gray-300 font-bold px-2 py-0.5 rounded-[0.5rem]">{role.codigo || 'S/C'}</span>
                                    <h4 className="font-black text-sm text-white">{role.nome}</h4>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">{role.descricao || 'Sem descrição'}</p>
                                  
                                  {/* Ocupantes */}
                                  <div className="mt-3 flex flex-wrap gap-1.5">
                                    {occupiedBy.length === 0 ? (
                                      <span className="text-[10px] bg-rose-950/20 text-rose-400 border border-rose-950/80 px-2 py-0.5 rounded-[0.5rem] font-bold">Vago</span>
                                    ) : (
                                      occupiedBy.map(occ => (
                                        <span key={occ.id} className="text-[10px] bg-emerald-950/20 text-emerald-400 border border-emerald-950/80 px-2 py-0.5 rounded-[0.5rem] font-bold">{occ.name}</span>
                                      ))
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={async () => {
                                    if(await confirm({ title: `Excluir cargo ${role.nome}?`, message: 'Isso desassociará funcionários associados.', variant: 'danger', confirmLabel: 'Excluir' })) {
                                      await orgGovernanceService.deleteRole(role.id);
                                      setRoles(roles.filter(r => r.id !== role.id));
                                    }
                                  }}
                                  className="text-gray-600 hover:text-rose-500 p-1"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. ALÇADAS E LIMITES */}
          {activeTab === 'alcadas' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black text-white">Alçadas e Limites de Autoridade</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Configure os limites monetários de aprovação para fluxos do ecossistema.</p>
                </div>
                <button
                  onClick={() => setIsLimitModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[1rem] font-bold text-xs uppercase tracking-wider transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Nova Alçada
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                      <th className="pb-3 pl-4">Fluxo</th>
                      <th className="pb-3">Alvo</th>
                      <th className="pb-3">Min</th>
                      <th className="pb-3">Max</th>
                      <th className="pb-3">Assinatura Dupla</th>
                      <th className="pb-3 pr-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {authorityLimits.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-gray-500 text-sm">Nenhum limite de alçada configurado.</td>
                      </tr>
                    ) : (
                      authorityLimits.map(lim => {
                        const target = lim.role_id 
                          ? roles.find(r => r.id === lim.role_id)?.nome 
                          : (lim.employee_id ? employees.find(e => e.id === lim.employee_id)?.name : 'Departamento');
                        return (
                          <tr key={lim.id} className="border-b border-gray-800/60 hover:bg-gray-900/20 text-sm">
                            <td className="py-4 pl-4 font-black uppercase text-xs text-blue-400">{lim.flow_type}</td>
                            <td className="py-4 text-white font-bold">{target || 'Não identificado'}</td>
                            <td className="py-4 text-gray-300">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lim.limite_minimo)}</td>
                            <td className="py-4 text-gray-300">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lim.limite_maximo)}</td>
                            <td className="py-4">
                              {lim.requer_dupla_assinatura ? (
                                <span className="text-[10px] bg-amber-950/20 text-amber-400 border border-amber-950/80 px-2.5 py-1 rounded-[0.5rem] font-bold">Sim</span>
                              ) : (
                                <span className="text-[10px] bg-gray-800 text-gray-400 px-2.5 py-1 rounded-[0.5rem] font-bold">Não</span>
                              )}
                            </td>
                            <td className="py-4 pr-4 text-right">
                              <button
                                onClick={async () => {
                                  if(await confirm({ title: 'Excluir este limite?', variant: 'danger', confirmLabel: 'Excluir' })) {
                                    await orgGovernanceService.deleteAuthorityLimit(lim.id);
                                    setAuthorityLimits(authorityLimits.filter(l => l.id !== lim.id));
                                  }
                                }}
                                className="text-gray-500 hover:text-rose-500 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. DELEGAÇÕES TEMPORÁRIAS */}
          {activeTab === 'delegacoes' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black text-white">Delegações de Autoridade</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Designe substitutos temporários com alçadas de decisão vigentes.</p>
                </div>
                <button
                  onClick={() => setIsDelegationModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[1rem] font-bold text-xs uppercase tracking-wider transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Criar Delegação
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                      <th className="pb-3 pl-4">Delegador</th>
                      <th className="pb-3">Substituto</th>
                      <th className="pb-3">Fluxo</th>
                      <th className="pb-3">Período</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 pr-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delegations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-gray-500 text-sm">Nenhuma delegação temporária registrada.</td>
                      </tr>
                    ) : (
                      delegations.map(del => {
                        const delegator = employees.find(e => e.id === del.delegator_employee_id)?.name;
                        const delegatee = employees.find(e => e.id === del.delegatee_employee_id)?.name;
                        const start = new Date(del.data_inicio).toLocaleDateString('pt-BR');
                        const end = new Date(del.data_fim).toLocaleDateString('pt-BR');
                        return (
                          <tr key={del.id} className="border-b border-gray-800/60 hover:bg-gray-900/20 text-sm">
                            <td className="py-4 pl-4 text-white font-bold">{delegator || 'Não identificado'}</td>
                            <td className="py-4 text-white font-bold">{delegatee || 'Não identificado'}</td>
                            <td className="py-4 text-gray-400 font-bold uppercase text-xs">{del.flow_type || 'TODOS'}</td>
                            <td className="py-4 text-gray-300 text-xs font-semibold">{start} a {end}</td>
                            <td className="py-4">
                              {del.status === 'ativa' && (
                                <span className="text-[10px] bg-emerald-950/20 text-emerald-400 border border-emerald-950/80 px-2.5 py-1 rounded-[0.5rem] font-bold">Ativa</span>
                              )}
                              {del.status === 'revogada' && (
                                <span className="text-[10px] bg-rose-950/20 text-rose-400 border border-rose-950/80 px-2.5 py-1 rounded-[0.5rem] font-bold">Revogada</span>
                              )}
                              {del.status === 'expirada' && (
                                <span className="text-[10px] bg-gray-800 text-gray-400 px-2.5 py-1 rounded-[0.5rem] font-bold">Expirada</span>
                              )}
                            </td>
                            <td className="py-4 pr-4 text-right">
                              {del.status === 'ativa' && (
                                <button
                                  onClick={() => handleRevokeDelegation(del.id)}
                                  className="text-rose-500 hover:underline text-xs font-bold mr-3"
                                >
                                  Revogar
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  if(await confirm({ title: 'Excluir delegação?', variant: 'danger', confirmLabel: 'Excluir' })) {
                                    await orgGovernanceService.deleteDelegation(del.id);
                                    setDelegations(delegations.filter(d => d.id !== del.id));
                                  }
                                }}
                                className="text-gray-500 hover:text-rose-500 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. MATRIZ RACI */}
          {activeTab === 'raci' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-white">Matriz de Atribuição RACI</h3>
                <p className="text-xs text-gray-500 mt-0.5">Definições de controle (Responsável, Aprovador, Consultado, Informado) por processo.</p>
              </div>

              <div className="bg-gray-950/40 border border-gray-800 rounded-[1.25rem] p-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-800 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                        <th className="pb-3 pl-4">Processo / Atividade</th>
                        <th className="pb-3">R (Executa)</th>
                        <th className="pb-3">A (Aprova)</th>
                        <th className="pb-3">C (Consultado)</th>
                        <th className="pb-3 pr-4">I (Informado)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { proc: 'Contratação de Terceirizados', r: 'RH', a: 'Diretor Geral', c: 'Jurídico', i: 'Financeiro' },
                        { proc: 'Aprovação de Medição de Obras', r: 'Engenheiro de Obra', a: 'Gerente Geral', c: 'Planejamento', i: 'Suprimentos' },
                        { proc: 'Aquisição de Capex (Investimento)', r: 'Suprimentos', a: 'Conselho Consultivo', c: 'Diretoria Financeira', i: 'Contabilidade' }
                      ].map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-800/40 last:border-b-0 hover:bg-gray-900/10 text-sm">
                          <td className="py-4 pl-4 font-bold text-white">{item.proc}</td>
                          <td className="py-4"><span className="bg-blue-950/30 text-blue-400 border border-blue-900/50 px-2.5 py-1 rounded-[0.5rem] font-bold text-xs">{item.r}</span></td>
                          <td className="py-4"><span className="bg-amber-950/30 text-amber-400 border border-amber-900/50 px-2.5 py-1 rounded-[0.5rem] font-bold text-xs">{item.a}</span></td>
                          <td className="py-4"><span className="bg-purple-950/30 text-purple-400 border border-purple-900/50 px-2.5 py-1 rounded-[0.5rem] font-bold text-xs">{item.c}</span></td>
                          <td className="py-4 pr-4"><span className="bg-gray-800 text-gray-400 px-2.5 py-1 rounded-[0.5rem] font-bold text-xs">{item.i}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 6. GESTÃO DE COMITÊS */}
          {activeTab === 'comites' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-white">Comitês e Conselhos de Governança</h3>
                <p className="text-xs text-gray-500 mt-0.5">Cadastre comitês independentes e monitore os mandatos.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {committees.length === 0 ? (
                  <div className="bg-gray-950/40 border border-gray-800 p-10 text-center rounded-[1.25rem] md:col-span-2 text-gray-500 text-sm">
                    Nenhum comitê registrado nesta empresa.
                  </div>
                ) : (
                  committees.map(com => (
                    <div key={com.id} className="bg-gray-950/60 border border-gray-800 p-5 rounded-[1.25rem] space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-black text-white text-base">{com.nome}</h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[0.5rem] uppercase inline-block mt-1 ${com.status === 'ativo' ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/50' : 'bg-gray-800 text-gray-400'}`}>
                            {com.status}
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            if(await confirm({ title: 'Excluir este comitê?', variant: 'danger', confirmLabel: 'Excluir' })) {
                              await orgGovernanceService.deleteCommittee(com.id);
                              setCommittees(committees.filter(c => c.id !== com.id));
                            }
                          }}
                          className="text-gray-600 hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">{com.descricao || 'Sem descrição cadastrada.'}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 7. PLANO DE SUCESSÃO */}
          {activeTab === 'sucessao' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-white">Mapeamento de Sucessores e Carreira</h3>
                <p className="text-xs text-gray-500 mt-0.5">Prevenção de riscos para posições gerenciais e diretoria.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                      <th className="pb-3 pl-4">Posição Crítica</th>
                      <th className="pb-3">Titular</th>
                      <th className="pb-3">Sucessor Mapeado</th>
                      <th className="pb-3">Prontidão</th>
                      <th className="pb-3 pr-4 text-right">Risco de Perda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {successionPlans.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-gray-500 text-sm">Nenhum plano de sucessão cadastrado.</td>
                      </tr>
                    ) : (
                      successionPlans.map(plan => {
                        const targetRole = roles.find(r => r.id === plan.target_role_id)?.nome;
                        const currentEmp = employees.find(e => e.id === plan.current_employee_id)?.name;
                        const successor = employees.find(e => e.id === plan.successor_employee_id)?.name;
                        return (
                          <tr key={plan.id} className="border-b border-gray-800/60 hover:bg-gray-900/20 text-sm">
                            <td className="py-4 pl-4 text-white font-bold">{targetRole || 'Cargo Desconhecido'}</td>
                            <td className="py-4 text-gray-300">{currentEmp || 'Não Definido'}</td>
                            <td className="py-4 text-white font-semibold">{successor || 'Não Definido'}</td>
                            <td className="py-4 font-bold uppercase text-xs text-amber-500">{plan.prontidao.replace('_', ' ')}</td>
                            <td className="py-4 pr-4 text-right">
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-[0.5rem] uppercase ${plan.risco_perda === 'baixo' ? 'bg-emerald-950/20 text-emerald-400' : (plan.risco_perda === 'medio' ? 'bg-amber-950/20 text-amber-400' : 'bg-rose-950/20 text-rose-400')}`}>
                                {plan.risco_perda}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 8. MODO SANDBOX (PLANEJAMENTO FUTURO) */}
          {activeTab === 'sandbox' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-white">Sandbox de Reestruturação</h3>
                <p className="text-xs text-gray-500 mt-0.5">Simule novas diretorias, novos cargos e compare cenários futuros do grupo.</p>
              </div>

              <div className="bg-gray-950/40 border border-gray-800 p-8 rounded-[1.25rem] text-center max-w-lg mx-auto space-y-4">
                <Copy className="w-12 h-12 text-blue-500 mx-auto" />
                <h4 className="text-base font-black text-white">Deseja abrir um cenário de Sandbox?</h4>
                <p className="text-xs text-gray-400">
                  O modo Sandbox tira uma foto instantânea da estrutura organizacional ativa para permitir simulações sem alterar o organograma produtivo.
                </p>
                <button
                  onClick={async () => {
                    const name = prompt('Nome do Cenário:');
                    if (name) {
                      await orgGovernanceService.saveSandboxScenario({
                        company_id: selectedCompanyId,
                        nome: name,
                        descricao: 'Cenário simulado',
                        estrutura_dados: { roles, relationships },
                        criador_email: 'altair.rosa@alpaconstrutora.com.br',
                        status: 'rascunho'
                      });
                      const data = await orgGovernanceService.listSandboxScenarios(selectedCompanyId);
                      setSandboxScenarios(data);
                    }
                  }}
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-[1rem] transition-all"
                >
                  Criar Novo Cenário
                </button>
              </div>

              {sandboxScenarios.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sandboxScenarios.map(sc => (
                    <div key={sc.id} className="bg-gray-950/60 border border-gray-800 p-5 rounded-[1.25rem] flex items-center justify-between">
                      <div>
                        <h4 className="font-black text-white text-sm">{sc.nome}</h4>
                        <span className="text-[10px] text-gray-400 block mt-1">Criador: {sc.criador_email}</span>
                      </div>
                      <button
                        onClick={async () => {
                          if (await confirm({ title: 'Aprovar este cenário?', message: 'As mudanças serão aplicadas no organograma principal.', variant: 'default', confirmLabel: 'Aprovar' })) {
                            await orgGovernanceService.approveSandboxScenario(sc.id, 'altair.rosa@alpaconstrutora.com.br');
                            const data = await orgGovernanceService.listSandboxScenarios(selectedCompanyId);
                            setSandboxScenarios(data);
                          }
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-[0.5rem]"
                      >
                        Aprovar Cenário
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ── MODAL DE CRIAR CARGO ────────────────────────────── */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-gray-950 border border-gray-800 w-full max-w-md rounded-[1.5rem] p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-white">Criar Novo Cargo</h3>
              <button onClick={() => setIsRoleModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="space-y-4 text-sm">
              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Nome do Cargo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Diretor de Engenharia"
                  value={newRole.nome}
                  onChange={(e) => setNewRole({ ...newRole, nome: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 focus:border-blue-500 focus:ring-0 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Código</label>
                  <input
                    type="text"
                    placeholder="Ex: DIR_ENG"
                    value={newRole.codigo}
                    onChange={(e) => setNewRole({ ...newRole, codigo: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 focus:border-blue-500 focus:ring-0 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Nível Hierárquico</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newRole.nivel_hierarquico}
                    onChange={(e) => setNewRole({ ...newRole, nivel_hierarquico: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 focus:border-blue-500 focus:ring-0 text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Descrição</label>
                <textarea
                  placeholder="Descrição das responsabilidades..."
                  value={newRole.descricao}
                  onChange={(e) => setNewRole({ ...newRole, descricao: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 focus:border-blue-500 focus:ring-0 text-white h-20"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-gray-300 font-bold text-xs uppercase tracking-wider rounded-[1rem] transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-[1rem] transition-all"
                >
                  Salvar Cargo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL DE CRIAR ALÇADA ────────────────────────────── */}
      {isLimitModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-gray-950 border border-gray-800 w-full max-w-md rounded-[1.5rem] p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-white">Nova Alçada de Autoridade</h3>
              <button onClick={() => setIsLimitModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLimit} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Fluxo</label>
                  <select
                    value={newLimit.flow_type}
                    onChange={(e) => setNewLimit({ ...newLimit, flow_type: e.target.value as AuthorityFlowType })}
                    className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 text-white"
                  >
                    <option value="compras">Compras</option>
                    <option value="pagamentos">Pagamentos</option>
                    <option value="contratos">Contratos</option>
                    <option value="investimentos">Investimentos</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Alvo da Alçada</label>
                  <select
                    value={newLimit.target_type}
                    onChange={(e) => setNewLimit({ ...newLimit, target_type: e.target.value, target_id: '' })}
                    className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 text-white"
                  >
                    <option value="role">Cargo</option>
                    <option value="employee">Pessoa</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Selecionar Alvo</label>
                <select
                  value={newLimit.target_id}
                  required
                  onChange={(e) => setNewLimit({ ...newLimit, target_id: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 text-white"
                >
                  <option value="">Selecione...</option>
                  {newLimit.target_type === 'role' && roles.map(r => (
                    <option key={r.id} value={r.id}>{r.nome}</option>
                  ))}
                  {newLimit.target_type === 'employee' && employees.filter(e => e.status === 'ATIVO').map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Mínimo (R$)</label>
                  <input
                    type="number"
                    value={newLimit.limite_minimo}
                    onChange={(e) => setNewLimit({ ...newLimit, limite_minimo: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 focus:border-blue-500 focus:ring-0 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Máximo (R$)</label>
                  <input
                    type="number"
                    value={newLimit.limite_maximo}
                    onChange={(e) => setNewLimit({ ...newLimit, limite_maximo: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 focus:border-blue-500 focus:ring-0 text-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 bg-gray-900/60 p-3 rounded-[1rem] border border-gray-800">
                <input
                  type="checkbox"
                  id="double_sig"
                  checked={newLimit.requer_dupla_assinatura}
                  onChange={(e) => setNewLimit({ ...newLimit, requer_dupla_assinatura: e.target.checked })}
                  className="bg-gray-950 border-gray-800 rounded text-blue-600 focus:ring-0"
                />
                <label htmlFor="double_sig" className="text-xs text-gray-300 font-bold cursor-pointer">Requer Dupla Assinatura?</label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsLimitModalOpen(false)}
                  className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-gray-300 font-bold text-xs uppercase tracking-wider rounded-[1rem] transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-[1rem] transition-all"
                >
                  Salvar Alçada
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL DE CRIAR DELEGAÇÃO ─────────────────────────── */}
      {isDelegationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-gray-950 border border-gray-800 w-full max-w-md rounded-[1.5rem] p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-white">Criar Delegação Temporária</h3>
              <button onClick={() => setIsDelegationModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDelegation} className="space-y-4 text-sm">
              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Delegador (Quem se afasta)</label>
                <select
                  value={newDelegation.delegator_id}
                  required
                  onChange={(e) => setNewDelegation({ ...newDelegation, delegator_id: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 text-white"
                >
                  <option value="">Selecione...</option>
                  {employees.filter(e => e.status === 'ATIVO').map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Substituto (Quem aprova)</label>
                <select
                  value={newDelegation.delegatee_id}
                  required
                  onChange={(e) => setNewDelegation({ ...newDelegation, delegatee_id: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 text-white"
                >
                  <option value="">Selecione...</option>
                  {employees.filter(e => e.status === 'ATIVO' && e.id !== newDelegation.delegator_id).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Fluxo</label>
                  <select
                    value={newDelegation.flow_type}
                    onChange={(e) => setNewDelegation({ ...newDelegation, flow_type: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 text-white"
                  >
                    <option value="">Todos</option>
                    <option value="compras">Compras</option>
                    <option value="pagamentos">Pagamentos</option>
                    <option value="contratos">Contratos</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Limite Máx (R$)</label>
                  <input
                    type="number"
                    placeholder="Opcional"
                    value={newDelegation.limite_maximo}
                    onChange={(e) => setNewDelegation({ ...newDelegation, limite_maximo: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Início</label>
                  <input
                    type="datetime-local"
                    required
                    value={newDelegation.data_inicio}
                    onChange={(e) => setNewDelegation({ ...newDelegation, data_inicio: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Término</label>
                  <input
                    type="datetime-local"
                    required
                    value={newDelegation.data_fim}
                    onChange={(e) => setNewDelegation({ ...newDelegation, data_fim: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Motivo da Ausência</label>
                <input
                  type="text"
                  placeholder="Ex: Férias do Diretor"
                  value={newDelegation.motivo}
                  onChange={(e) => setNewDelegation({ ...newDelegation, motivo: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-[1rem] p-3 text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDelegationModalOpen(false)}
                  className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-gray-300 font-bold text-xs uppercase tracking-wider rounded-[1rem] transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-[1rem] transition-all"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
