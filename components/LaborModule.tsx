import React, { useState } from 'react';
import {
    Users, Clock, TrendingUp, DollarSign, BarChart3,
    UserPlus, Loader2, AlertCircle, Building2,
    Shield, Calendar, Target, Check, FileText, Calculator, Settings, ChevronRight, Percent, HardHat, Umbrella, BookOpen, LayoutDashboard, UserMinus, ShieldAlert, Truck, ClipboardList, UserSearch, Smartphone, Award, MessageSquare
} from 'lucide-react';
import { laborService, Employee, LaborTeam, TimeEntry, ProductivityLog, LaborCostSummary } from '../services/laborService';
import LaborEmployeeList from './LaborEmployeeList';
import LaborEmployeeForm from './LaborEmployeeForm';
import LaborTimeTracking from './LaborTimeTracking';
import LaborProductivity from './LaborProductivity';
import LaborTeams from './LaborTeams';
import LaborCosts from './LaborCosts';
import LaborDocuments from './LaborDocuments';
import LaborPayroll from './LaborPayroll';
import LaborAllocations from './LaborAllocations';
import LaborCostDashboard from './LaborCostDashboard';
import LaborRubrics from './LaborRubrics';
import LaborFiscalSettings from './LaborFiscalSettings';
import LaborEncargos from './LaborEncargos';
import LaborEPIs from './LaborEPIs';
import LaborAbsences from './LaborAbsences';
import LaborTrainings from './LaborTrainings';
import LaborRHDashboard from './LaborRHDashboard';
import LaborTermination from './LaborTermination';
import LaborTimeBank from './LaborTimeBank';
import LaborSST from './LaborSST';
import LaborContractors from './LaborContractors';
import LaborDiary from './LaborDiary';
import LaborATS from './LaborATS';
import LaborPortal from './LaborPortal';
import LaborEvaluation from './LaborEvaluation';
import LaborComunicacao from './LaborComunicacao';
import LaborBIAnalytics from './LaborBIAnalytics';
import LaborEsocial from './LaborEsocial';
import { useLaborModuleData } from '../hooks/useLaborQueries';
import { buildPartialFailureMessage } from '../lib/collectSettled';

// ─── Types ──────────────────────────────────────────────────
type LaborTab = 'dashboard' | 'employees' | 'teams' | 'allocations' | 'timetracking' | 'productivity' | 'costs' | 'payroll' | 'documents' | 'cost_dashboard' | 'rubrics' | 'fiscal' | 'encargos' | 'epis' | 'absences' | 'trainings' | 'rh_dashboard' | 'termination' | 'timebank' | 'sst' | 'contractors' | 'diary' | 'ats' | 'portal' | 'evaluation' | 'comunicacao' | 'bi_analytics' | 'esocial';

const SECTION_TO_TAB: Record<string, LaborTab> = {
    'labor-dashboard': 'dashboard',
    'labor-cost-dashboard': 'cost_dashboard',
    'labor-employees': 'employees',
    'labor-teams': 'teams',
    'labor-allocations': 'allocations',
    'labor-timetracking': 'timetracking',
    'labor-productivity': 'productivity',
    'labor-documents': 'documents',
    'labor-costs': 'costs',
    'labor-payroll': 'payroll',
    'labor-rubrics': 'rubrics',
    'labor-encargos': 'encargos',
    'labor-fiscal': 'fiscal',
    'labor-epis': 'epis',
    'labor-absences':     'absences',
    'labor-trainings':    'trainings',
    'labor-rh-dashboard': 'rh_dashboard',
    'labor-termination':  'termination',
    'labor-timebank':     'timebank',
    'labor-sst':          'sst',
    'labor-contractors':  'contractors',
    'labor-diary':        'diary',
    'labor-ats':          'ats',
    'labor-portal':       'portal',
    'labor-evaluation':   'evaluation',
    'labor-comunicacao':  'comunicacao',
    'labor-bi-analytics': 'bi_analytics',
    'labor-esocial':      'esocial',
};

const TAB_TO_SECTION: Record<LaborTab, string> = Object.fromEntries(
    Object.entries(SECTION_TO_TAB).map(([s, t]) => [t, s])
) as Record<LaborTab, string>;

interface LaborModuleProps {
    activeOrganizationId?: string;
    projects?: any[];
    activeSection?: string;
    onChangeView?: (view: string) => void;
}

// ─── KPI Card ───────────────────────────────────────────────
const KpiCard: React.FC<{
    label: string;
    value: string;
    sub?: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
}> = ({ label, value, sub, icon: Icon, color, bgColor }) => (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all duration-300">
        <div className={`absolute top-0 right-0 w-32 h-32 ${bgColor} -mr-16 -mt-16 rounded-full opacity-40 group-hover:scale-110 transition-transform duration-500`} />
        <div className="relative z-10 flex items-center justify-between">
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{label}</p>
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{value}</h3>
                {sub && <p className={`text-[10px] font-bold mt-2 ${color} bg-opacity-10 px-2 py-1 rounded-lg inline-block`} style={{ backgroundColor: `${color}15` }}>{sub}</p>}
            </div>
            <div className={`p-4 ${bgColor.replace('50','600').replace('bg-','bg-')} rounded-2xl shadow-lg`}>
                <Icon className="w-8 h-8 text-white" />
            </div>
        </div>
    </div>
);

// ─── Dashboard Tab ──────────────────────────────────────────
const LaborDashboardTab: React.FC<{
    employees: Employee[];
    teams: LaborTeam[];
    pendingEntries: TimeEntry[];
    productivity: ProductivityLog[];
    costSummary: LaborCostSummary | null;
    onOpenTab: (tab: LaborTab) => void;
}> = ({ employees, teams, pendingEntries, productivity, costSummary, onOpenTab }) => {
    const activeCount = employees.filter(e => e.status === 'ATIVO').length;
    const avgProductivity = productivity.length > 0
        ? productivity.reduce((s, p) => s + (p.productivity_pct || 0), 0) / productivity.length
        : 0;

    return (
        <div className="space-y-6">
            {/* KPI Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Colaboradores Ativos" value={`${activeCount}`} sub={`${employees.length} cadastrados`} icon={Users} color="text-indigo-600" bgColor="bg-indigo-50" />
                <KpiCard label="Equipes" value={`${teams.length}`} sub="ATIVAS" icon={Shield} color="text-emerald-600" bgColor="bg-emerald-50" />
                <KpiCard label="Pontos Pendentes" value={`${pendingEntries.length}`} sub="AGUARDAM APROVAÇÃO" icon={Clock} color="text-amber-600" bgColor="bg-amber-50" />
                <KpiCard label="Custo Aprovado" value={`R$ ${(costSummary?.totalCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} sub={`${(costSummary?.totalHours || 0).toFixed(0)}h registradas`} icon={DollarSign} color="text-rose-600" bgColor="bg-rose-50" />
            </div>

            {/* Quick Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                    { tab: 'employees' as LaborTab, icon: UserPlus, title: 'Colaboradores', desc: `${activeCount} ativos • Gerencie o cadastro e vínculos`, color: 'indigo' },
                    { tab: 'timetracking' as LaborTab, icon: Clock, title: 'Registro de Ponto', desc: `${pendingEntries.length} pontos aguardando aprovação`, color: 'amber', badge: pendingEntries.length },
                    { tab: 'productivity' as LaborTab, icon: Target, title: 'Produtividade', desc: `Média: ${avgProductivity.toFixed(0)}% do planejado`, color: 'emerald' },
                    { tab: 'teams' as LaborTab, icon: Shield, title: 'Equipes', desc: `${teams.length} equipes configuradas`, color: 'blue' },
                    { tab: 'costs' as LaborTab, icon: DollarSign, title: 'Custos de MO', desc: 'Custo por colaborador e obra', color: 'rose' },
                    { tab: 'payroll' as LaborTab, icon: Calculator, title: 'Folha de Pagamento', desc: 'Cálculo de INSS, FGTS e IRRF', color: 'blue' },
                    { tab: 'timetracking' as LaborTab, icon: BarChart3, title: 'Horas Trabalhadas', desc: `${(costSummary?.totalHours || 0).toFixed(0)}h aprovadas no total`, color: 'purple' },
                    { tab: 'epis' as LaborTab, icon: HardHat, title: 'Gestão de EPIs', desc: 'Catálogo, entregas e controle de estoque', color: 'amber' },
                    { tab: 'absences'    as LaborTab, icon: Umbrella,         title: 'Férias e Ausências', desc: 'Solicitações, saldos e alertas de vencimento', color: 'cyan' },
                    { tab: 'trainings'   as LaborTab, icon: BookOpen,         title: 'Treinamentos',       desc: 'NRs, certificados e controle de vencimento', color: 'emerald' },
                    { tab: 'rh_dashboard' as LaborTab, icon: LayoutDashboard, title: 'Dashboard RH',     desc: 'KPIs executivos: turnover, absenteísmo, custos', color: 'violet' },
                    { tab: 'termination'  as LaborTab, icon: UserMinus,       title: 'Desligamentos',   desc: 'Checklist, entrevista e encerramento de acesso', color: 'rose' },
                    { tab: 'timebank'     as LaborTab, icon: Clock,           title: 'Banco de Horas',  desc: 'Saldos, QR Code check-in e geolocalização', color: 'blue' },
                    { tab: 'sst'          as LaborTab, icon: ShieldAlert,     title: 'SST',             desc: 'Acidentes (CAT), checklists e indicadores TFCA', color: 'orange' },
                    { tab: 'contractors'  as LaborTab, icon: Truck,           title: 'Empreiteiros',    desc: 'Cadastro, medições com retenções e documentos', color: 'purple' },
                    { tab: 'diary'        as LaborTab, icon: ClipboardList,   title: 'Diário de Obra',  desc: 'Apontamento HH em lote — fecha e gera ponto', color: 'teal' },
                    { tab: 'ats'          as LaborTab, icon: UserSearch,      title: 'Recrutamento',    desc: 'Pipeline Kanban, banco de talentos, contratação', color: 'violet' },
                    { tab: 'portal'       as LaborTab, icon: Smartphone,      title: 'Portal Colaborador', desc: 'Link self-service: ponto, férias, docs no celular', color: 'indigo' },
                    { tab: 'evaluation'   as LaborTab, icon: Award,           title: 'Avaliação 360°',  desc: 'Ciclos, competências, PDI e ranking de equipes', color: 'violet' },
                    { tab: 'comunicacao'  as LaborTab, icon: MessageSquare,   title: 'Comunicação',     desc: 'Avisos, DDS digitais, treinamentos e WhatsApp', color: 'teal' },
                    { tab: 'bi_analytics' as LaborTab, icon: BarChart3,       title: 'BI Analytics RH', desc: 'Turnover, retenção, produtividade e movimentações', color: 'sky' },
                    { tab: 'esocial'      as LaborTab, icon: FileText,        title: 'eSocial',         desc: 'Eventos S-1xxx/S-2xxx, lotes e transmissão', color: 'orange' },
                ].map(({ tab, icon: Icon, title, desc, color, badge }) => (
                    <button
                        key={`${tab}-${title}`}
                        onClick={() => onOpenTab(tab)}
                        className={`bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-${color}-200 transition-all duration-200 text-left group flex items-start gap-4`}
                    >
                        <div className={`p-3 bg-${color}-50 rounded-xl group-hover:scale-110 transition-transform`}>
                            <Icon className={`w-5 h-5 text-${color}-600`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black text-slate-900">{title}</h3>
                                {badge !== undefined && badge > 0 && (
                                    <span className="px-2 py-0.5 bg-red-500 text-white text-[9px] font-black rounded-full">{badge}</span>
                                )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors self-center" />
                    </button>
                ))}
            </div>

            {/* Top Performers */}
            {(costSummary?.byEmployee || []).length > 0 && (
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-indigo-600" /> Top Custo por Colaborador
                    </h3>
                    <div className="space-y-3">
                        {(costSummary?.byEmployee || []).slice(0, 5).map((emp, i) => {
                            const maxCost = Math.max(...(costSummary?.byEmployee || []).map(e => e.cost));
                            const pct = maxCost > 0 ? (emp.cost / maxCost * 100) : 0;
                            return (
                                <div key={emp.employee_id} className="flex items-center gap-4">
                                    <div className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center text-[10px] font-black text-indigo-600">{i + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-bold text-slate-700 truncate">{emp.name}</span>
                                            <span className="text-xs font-black text-slate-900 ml-2">R$ {emp.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-slate-400 w-12 text-right">{emp.hours.toFixed(0)}h</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── MAIN MODULE ────────────────────────────────────────────
const LaborModule: React.FC<LaborModuleProps> = ({ activeOrganizationId, projects = [], activeSection, onChangeView }) => {
    const activeTab: LaborTab = SECTION_TO_TAB[activeSection || ''] || 'dashboard';

    const handleOpenTab = (tab: LaborTab) => {
        if (onChangeView) onChangeView(TAB_TO_SECTION[tab] || 'labor-dashboard');
    };

    const [editingEmployee, setEditingEmployee]= useState<Employee | null>(null);
    const [isEmployeeFormOpen, setIsEmployeeFormOpen] = useState(false);
    const [isMigrating, setIsMigrating]       = useState(false);
    const [showConfirmMigrate, setShowConfirmMigrate] = useState(false);
    const [selectedOrgId, setSelectedOrgId]   = useState<string | undefined>(undefined);

    const currentOrgId = selectedOrgId;

    // ── React Query: dados do módulo ──────────────────────────
    const {
        employees, teams, timeEntries, productivityLogs,
        costSummary, docAlerts, legacyCount, organizations,
        isLoading, failedLabels, refetchAll,
    } = useLaborModuleData(currentOrgId);

    const handleMigrate = async () => {
        setIsMigrating(true);
        try {
            const res = await laborService.migrateLegacyWorkers(currentOrgId || '');
            alert(`Sucesso! ${res.imported} novos colaboradores importados.`);
            refetchAll();
        } catch (err) {
            console.error(err);
            alert('Erro ao migrar colaboradores.');
        } finally {
            setIsMigrating(false);
        }
    };

    const pendingEntries = timeEntries.filter((e: any) => e.status === 'PENDENTE');

    const orgId = activeOrganizationId || '';
    const isAllOrgsMode = !currentOrgId;

    if (isLoading && employees.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                    <p className="text-slate-500 font-medium">Carregando dados de mão de obra...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-4 bg-white border-b border-slate-100 shrink-0">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-900/20">
                            <Users className="w-5 h-5 text-white" />
                        </div>
                        Gestão de Mão de Obra
                        {isAllOrgsMode && (
                            <span className="ml-2 px-3 py-1 bg-amber-100 text-amber-600 text-[10px] font-black rounded-full uppercase tracking-widest border border-amber-200 shadow-sm animate-pulse">
                                Modo Consolidado
                            </span>
                        )}
                    </h1>
                    <p className="text-slate-400 text-xs mt-1 font-medium ml-1">
                        Controle total de pessoal • Produtividade • Custos em obra
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="hidden md:flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        <select
                            value={selectedOrgId || ''}
                            onChange={(e) => setSelectedOrgId(e.target.value)}
                            className="text-xs font-bold text-slate-600 outline-none bg-transparent min-w-[180px]"
                        >
                            <option value="">Todas as Organizações</option>
                            {organizations.map(org => (
                                <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                        </select>
                    </div>

                    {activeTab === 'employees' && (
                        <button
                            onClick={() => {
                                if (isAllOrgsMode) {
                                    alert('Para cadastrar um novo colaborador, selecione uma organização específica no filtro acima ou no menu lateral.');
                                    return;
                                }
                                setEditingEmployee(null);
                                setIsEmployeeFormOpen(true);
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm shadow-lg active:scale-95
                                ${isAllOrgsMode ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-900/20'}`}
                            title={isAllOrgsMode ? 'Selecione uma organização para cadastrar' : ''}
                        >
                            <UserPlus className="w-4 h-4" />
                            Novo Colaborador
                        </button>
                    )}
                    <button
                        onClick={refetchAll}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all font-bold text-sm"
                        title="Recarregar dados"
                    >
                        <Calendar className="w-4 h-4" />
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Banners */}
            <div className="px-6 space-y-3 shrink-0">
            {/* Banner de falhas parciais de carregamento */}
            {failedLabels.length > 0 && (
                <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="font-bold">{buildPartialFailureMessage(failedLabels)}</p>
                    <button onClick={refetchAll} className="ml-auto shrink-0 text-xs font-black uppercase text-amber-600 hover:text-amber-800 underline">Tentar novamente</button>
                </div>
            )}

            {/* Migration Banner */}
            {!isAllOrgsMode && legacyCount > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm text-indigo-600">
                            <Users className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Migração de Dados Disponível</h4>
                            <p className="text-[11px] text-slate-500">Encontramos {legacyCount} colaboradores no sistema legatário. Deseja importá-los para o novo módulo?</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {!showConfirmMigrate ? (
                            <button
                                onClick={() => setShowConfirmMigrate(true)}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-md"
                            >
                                Importar Agora
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 bg-white/50 p-1.5 rounded-xl border border-indigo-200">
                                <span className="text-[11px] font-bold text-indigo-900 mx-2">Confirmar?</span>
                                <button
                                    onClick={async () => {
                                        setIsMigrating(true);
                                        setShowConfirmMigrate(false);
                                        try {
                                            const res = await laborService.migrateLegacyWorkers(orgId);
                                            alert(`Sucesso! ${res.imported} colaboradores importados. ${res.skipped} já existiam.`);
                                            refetchAll();
                                        } catch (err) {
                                            alert('Erro na migração.');
                                        } finally {
                                            setIsMigrating(false);
                                        }
                                    }}
                                    disabled={isMigrating}
                                    className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold text-[10px] hover:bg-emerald-700 transition-all flex items-center gap-1"
                                >
                                    {isMigrating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    Sim
                                </button>
                                <button
                                    onClick={() => setShowConfirmMigrate(false)}
                                    className="bg-white text-slate-500 px-3 py-1.5 rounded-lg font-bold text-[10px] hover:bg-slate-100 transition-all border border-slate-200"
                                >
                                    Não
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            </div>{/* /Banners */}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'dashboard' && (
                        <LaborDashboardTab
                            employees={employees}
                            teams={teams}
                            pendingEntries={pendingEntries}
                            productivity={productivityLogs}
                            costSummary={costSummary}
                            onOpenTab={handleOpenTab}
                        />
                    )}
                    {activeTab === 'cost_dashboard' && (
                        <LaborCostDashboard
                            orgId={currentOrgId || activeOrganizationId || ''}
                            legacyCount={legacyCount}
                            onMigrate={handleMigrate}
                        />
                    )}
                    {activeTab === 'employees' && (
                        <LaborEmployeeList
                            employees={employees}
                            projects={projects}
                            organizations={organizations}
                            onEdit={(emp) => { setEditingEmployee(emp); setIsEmployeeFormOpen(true); }}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'teams' && (
                        <LaborTeams
                            teams={teams}
                            employees={employees}
                            projects={projects}
                            orgId={currentOrgId || activeOrganizationId || ''}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'allocations' && (
                        <LaborAllocations
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                        />
                    )}
                    {activeTab === 'timetracking' && (
                        <LaborTimeTracking
                            employees={employees}
                            projects={projects}
                            orgId={currentOrgId || activeOrganizationId || ''}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'productivity' && (
                        <LaborProductivity
                            employees={employees}
                            teams={teams}
                            projects={projects}
                            orgId={currentOrgId || activeOrganizationId || ''}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'costs' && (
                        <LaborCosts
                            employees={employees}
                            teams={teams}
                            orgId={currentOrgId || activeOrganizationId || ''}
                            projects={projects}
                            legacyCount={legacyCount}
                            onMigrate={handleMigrate}
                        />
                    )}
                    {activeTab === 'payroll' && (
                        <LaborPayroll
                            orgId={selectedOrgId === undefined ? (activeOrganizationId || 'all') : (selectedOrgId || 'all')}
                        />
                    )}
                    {activeTab === 'rubrics' && <LaborRubrics />}
                    {activeTab === 'fiscal' && <LaborFiscalSettings />}
                    {activeTab === 'encargos' && (
                        <LaborEncargos orgId={currentOrgId || activeOrganizationId || ''} />
                    )}
                    {activeTab === 'documents' && (
                        <LaborDocuments
                            employees={employees}
                            orgId={currentOrgId || activeOrganizationId || ''}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'epis' && (
                        <LaborEPIs
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'absences' && (
                        <LaborAbsences
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'trainings' && (
                        <LaborTrainings
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'rh_dashboard' && (
                        <LaborRHDashboard
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            costSummary={costSummary}
                            onNavigate={onChangeView}
                        />
                    )}
                    {activeTab === 'termination' && (
                        <LaborTermination
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'timebank' && (
                        <LaborTimeBank
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                        />
                    )}
                    {activeTab === 'sst' && (
                        <LaborSST
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                        />
                    )}
                    {activeTab === 'contractors' && (
                        <LaborContractors
                            orgId={currentOrgId || activeOrganizationId || ''}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                        />
                    )}
                    {activeTab === 'diary' && (
                        <LaborDiary
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            teams={teams}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'ats' && (
                        <LaborATS
                            orgId={currentOrgId || activeOrganizationId || ''}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                        />
                    )}
                    {activeTab === 'portal' && (
                        <LaborPortal
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                        />
                    )}
                    {activeTab === 'evaluation' && (
                        <LaborEvaluation
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                        />
                    )}
                    {activeTab === 'comunicacao' && (
                        <LaborComunicacao
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                        />
                    )}
                    {activeTab === 'bi_analytics' && (
                        <LaborBIAnalytics
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                        />
                    )}
                    {activeTab === 'esocial' && (
                        <LaborEsocial
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                        />
                    )}
            </div>

            {/* Employee Form Modal */}
            {isEmployeeFormOpen && (
                <LaborEmployeeForm
                    employee={editingEmployee}
                    orgId={currentOrgId || activeOrganizationId || ''}
                    organizations={organizations as unknown as { id: string; name: string; [key: string]: unknown }[]}
                    onClose={() => { setIsEmployeeFormOpen(false); setEditingEmployee(null); }}
                    onSaved={() => { setIsEmployeeFormOpen(false); setEditingEmployee(null); refetchAll(); }}
                />
            )}
        </div>
    );
};

export default LaborModule;
