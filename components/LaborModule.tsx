import React, { useState } from 'react';
import {
    Users, Clock, TrendingUp, DollarSign, BarChart3,
    UserPlus, Loader2, AlertCircle, Building2,
    Shield, Calendar, Target, Check, FileText, Calculator, Settings, ChevronRight, Percent, HardHat, Umbrella, BookOpen, LayoutDashboard, UserMinus, ShieldAlert, Truck, ClipboardList, UserSearch, Smartphone, Award, MessageSquare, UtensilsCrossed, Gift, Briefcase, Banknote
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
import LaborScopeBar from './LaborScopeBar';
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
import LaborValeRefeicao from './LaborValeRefeicao';
import LaborIncentivos from './LaborIncentivos';
import LaborCargos from './LaborCargos';
import LaborRemuneracaoSocietaria from './LaborRemuneracaoSocietaria';
import { useQueryClient } from '@tanstack/react-query';
import { useLaborModuleData } from '../hooks/useLaborQueries';
import { laborKeys } from '../lib/queryKeys';
import { buildPartialFailureMessage } from '../lib/collectSettled';
import Button from './ui/Button';

// ─── Types ──────────────────────────────────────────────────
type LaborTab = 'dashboard' | 'employees' | 'teams' | 'allocations' | 'timetracking' | 'productivity' | 'costs' | 'payroll' | 'documents' | 'cost_dashboard' | 'rubrics' | 'fiscal' | 'encargos' | 'epis' | 'absences' | 'trainings' | 'rh_dashboard' | 'termination' | 'timebank' | 'sst' | 'contractors' | 'diary' | 'ats' | 'portal' | 'evaluation' | 'comunicacao' | 'bi_analytics' | 'esocial' | 'vale_refeicao' | 'incentivos' | 'cargos' | 'remuneracao_societaria';

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
    'labor-esocial':        'esocial',
    'labor-vale-refeicao':  'vale_refeicao',
    'labor-incentivos':     'incentivos',
    'labor-cargos':         'cargos',
    'labor-remuneracao-societaria': 'remuneracao_societaria',
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
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">{label}</p>
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{value}</h3>
                {sub && <p className={`text-xs font-bold mt-2 ${color} bg-opacity-10 px-2 py-1 rounded-lg inline-block`} style={{ backgroundColor: `${color}15` }}>{sub}</p>}
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
    onRefresh: () => void;
}> = ({ employees, teams, pendingEntries, productivity, costSummary, onOpenTab, onRefresh }) => {
    const activeCount = employees.filter(e => e.status === 'ATIVO').length;
    const avgProductivity = productivity.length > 0
        ? productivity.reduce((s, p) => s + (p.productivity_pct || 0), 0) / productivity.length
        : 0;

    return (
        <div className="space-y-6">
            {/* 1. Título */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestão de Mão de Obra</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Controle total de pessoal, produtividade e custos em obra.</p>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="Colaboradores Ativos" value={`${activeCount}`} sub={`${employees.length} cadastrados`} icon={Users} color="text-indigo-600" bgColor="bg-indigo-50" />
                <KpiCard label="Equipes" value={`${teams.length}`} sub="ATIVAS" icon={Shield} color="text-emerald-600" bgColor="bg-emerald-50" />
                <KpiCard label="Pontos Pendentes" value={`${pendingEntries.length}`} sub="AGUARDAM APROVAÇÃO" icon={Clock} color="text-amber-600" bgColor="bg-amber-50" />
                <KpiCard label="Custo Aprovado" value={`R$ ${(costSummary?.totalCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} sub={`${(costSummary?.totalHours || 0).toFixed(0)}h registradas`} icon={DollarSign} color="text-rose-600" bgColor="bg-rose-50" />
            </div>

            <LaborScopeBar onRefresh={onRefresh} />

            {/* Quick Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                    { tab: 'employees' as LaborTab, icon: UserPlus, title: 'Colaboradores', desc: `${activeCount} ativos • Gerencie o cadastro e vínculos`, color: 'indigo' },
                    { tab: 'cargos' as LaborTab, icon: Briefcase, title: 'Cargos & Funções', desc: 'Estrutura de cargos, níveis e responsabilidades', color: 'violet' },
                    { tab: 'timetracking' as LaborTab, icon: Clock, title: 'Registro de Ponto', desc: `${pendingEntries.length} pontos aguardando aprovação`, color: 'amber', badge: pendingEntries.length },
                    { tab: 'productivity' as LaborTab, icon: Target, title: 'Produtividade', desc: `Média: ${avgProductivity.toFixed(0)}% do planejado`, color: 'emerald' },
                    { tab: 'incentivos' as LaborTab, icon: Gift, title: 'Incentivos & Produtividade', desc: 'Gratificações, metas e guarda de habitualidade', color: 'indigo' },
                    { tab: 'remuneracao_societaria' as LaborTab, icon: Banknote, title: 'Remuneração Societária', desc: 'Pró-labore de sócios-administradores', color: 'emerald' },
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
                    { tab: 'esocial'        as LaborTab, icon: FileText,          title: 'eSocial',             desc: 'Eventos S-1xxx/S-2xxx, lotes e transmissão', color: 'orange' },
                    { tab: 'vale_refeicao'  as LaborTab, icon: UtensilsCrossed,   title: 'Vale Refeição',        desc: 'Cálculo automático mensal por dias elegíveis', color: 'orange' },
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
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{desc}</p>
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
                                    <div className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center text-xs font-black text-indigo-600">{i + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-bold text-slate-700 truncate">{emp.name}</span>
                                            <span className="text-xs font-black text-slate-900 ml-2">R$ {emp.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                    <span className="text-xs text-slate-400 w-12 text-right">{emp.hours.toFixed(0)}h</span>
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

    const queryClient = useQueryClient();
    const [editingEmployee, setEditingEmployee]= useState<Employee | null>(null);
    const [isEmployeeFormOpen, setIsEmployeeFormOpen] = useState(false);
    const [isMigrating, setIsMigrating]       = useState(false);
    const [showConfirmMigrate, setShowConfirmMigrate] = useState(false);

    // Org vem do seletor global do topo — sem seletor próprio no módulo.
    // undefined = "Todas as organizações" (REGRA #5: leitura não bloqueia).
    const currentOrgId = activeOrganizationId || undefined;

    // §22 do guia de UI — atualizar o cache local (React Query) em vez de
    // refetch completo por 1 colaborador criado/editado.
    const handleEmployeeSaved = (updated: Employee) => {
        setIsEmployeeFormOpen(false);
        setEditingEmployee(null);
        queryClient.setQueryData<Employee[]>(laborKeys.employees(currentOrgId), prev => {
            if (!prev) return prev;
            // Se a lista está filtrada por organização e o colaborador mudou
            // de organização, ele "vaza" da lista atual — remover, não inserir.
            const combinaComOrg = !currentOrgId || updated.org_id === currentOrgId;
            const existe = prev.some(e => e.id === updated.id);
            if (!combinaComOrg) return prev.filter(e => e.id !== updated.id);
            return existe ? prev.map(e => (e.id === updated.id ? updated : e)) : [updated, ...prev];
        });
    };

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
    // Governa se a faixa de banners existe de verdade — precisa disso (e não só
    // renderizar a div vazia) para o `space-y-6` do pai não empurrar o conteúdo
    // 24px extra quando não há banner nenhum (ver comentário do `return` abaixo).
    const hasBanners = failedLabels.length > 0 || (!isAllOrgsMode && legacyCount > 0);

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

    // Sempre dentro do <Layout> (é o wrapper das ~31 abas de Recursos Humanos —
    // SECTION_TO_TAB — nenhuma delas é standalone). O `h-full` sozinho é seguro
    // (só preenche a área de conteúdo já com o padding de <main> descontado, sem
    // truque de margem negativa); o problema era o `px-6`/`p-6` PRÓPRIOS somando
    // com o gutter do Layout — 48px em vez de 24px em TODA tela de RH (medido
    // com Playwright, 2026-08-08). `space-y-6` no pai reproduz o respiro entre
    // banner e conteúdo sem duplicar lateral; `pb-6` no conteúdo é só o
    // respiro de fim de scroll (a caixa rola por dentro, o pb-* de <main>
    // nunca chega a ser exercitado).
    return (
        <div className="flex flex-col h-full space-y-6">
            {/* Banners — só entra no fluxo (e só então o `space-y-6` do pai conta
                como respiro real) quando existe algo pra mostrar; senão o
                conteúdo vira o PRIMEIRO filho e fica nos 24px do Layout, sem o
                gap extra. */}
            {hasBanners && (
            <div className="space-y-3 shrink-0">
            {/* Banner de falhas parciais de carregamento */}
            {failedLabels.length > 0 && (
                <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="font-bold">{buildPartialFailureMessage(failedLabels)}</p>
                    <button onClick={refetchAll} className="ml-auto shrink-0 text-button font-black uppercase text-amber-600 hover:text-amber-800 underline">Tentar novamente</button>
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
                            <p className="text-xs text-slate-500">Encontramos {legacyCount} colaboradores no sistema legatário. Deseja importá-los para o novo módulo?</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {!showConfirmMigrate ? (
                            <button
                                onClick={() => setShowConfirmMigrate(true)}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-button font-bold hover:bg-indigo-700 transition-all shadow-md"
                            >
                                Importar Agora
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 bg-white/50 p-1.5 rounded-xl border border-indigo-200">
                                <span className="text-xs font-bold text-indigo-900 mx-2">Confirmar?</span>
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
                                    className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-emerald-700 transition-all flex items-center gap-1"
                                >
                                    {isMigrating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    Sim
                                </button>
                                <button
                                    onClick={() => setShowConfirmMigrate(false)}
                                    className="bg-white text-slate-500 px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-slate-100 transition-all border border-slate-200"
                                >
                                    Não
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            </div>
            )}{/* /Banners */}

            {/* Content */}
            <div className="flex-1 overflow-y-auto pb-6">
                    {activeTab === 'dashboard' && (
                        <LaborDashboardTab
                            employees={employees}
                            teams={teams}
                            pendingEntries={pendingEntries}
                            productivity={productivityLogs}
                            costSummary={costSummary}
                            onOpenTab={handleOpenTab}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'cost_dashboard' && (
                        <LaborCostDashboard
                            orgId={currentOrgId || activeOrganizationId || ''}
                            legacyCount={legacyCount}
                            onMigrate={handleMigrate}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'employees' && (
                        <LaborEmployeeList
                            employees={employees}
                            projects={projects}
                            organizations={organizations}
                            onEdit={(emp) => { setEditingEmployee(emp); setIsEmployeeFormOpen(true); }}
                            onNew={() => { setEditingEmployee(null); setIsEmployeeFormOpen(true); }}
                            onRefresh={refetchAll}
                            isAllOrgsMode={isAllOrgsMode}
                        />
                    )}
                    {activeTab === 'teams' && (
                        <LaborTeams
                            teams={teams}
                            employees={employees}
                            projects={projects}
                            orgId={currentOrgId || activeOrganizationId || ''}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'allocations' && (
                        <LaborAllocations
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'timetracking' && (
                        <LaborTimeTracking
                            employees={employees}
                            projects={projects}
                            orgId={currentOrgId || activeOrganizationId || ''}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'productivity' && (
                        <LaborProductivity
                            employees={employees}
                            teams={teams}
                            projects={projects}
                            orgId={currentOrgId || activeOrganizationId || ''}
                            onRefresh={refetchAll}
                            organizations={organizations}
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
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'payroll' && (
                        <LaborPayroll
                            orgId={currentOrgId || 'all'}
                        />
                    )}
                    {activeTab === 'incentivos' && (
                        <LaborIncentivos
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                            teams={teams.map(t => ({ id: t.id, name: t.name }))}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'cargos' && (
                        <LaborCargos
                            orgId={currentOrgId || activeOrganizationId || ''}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'remuneracao_societaria' && (
                        <LaborRemuneracaoSocietaria
                            orgId={currentOrgId || activeOrganizationId || ''}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'rubrics' && <LaborRubrics />}
                    {activeTab === 'fiscal' && <LaborFiscalSettings />}
                    {activeTab === 'encargos' && (
                        <LaborEncargos
                            orgId={currentOrgId || activeOrganizationId || ''}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'documents' && (
                        <LaborDocuments
                            employees={employees}
                            orgId={currentOrgId || activeOrganizationId || ''}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'epis' && (
                        <LaborEPIs
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'absences' && (
                        <LaborAbsences
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'trainings' && (
                        <LaborTrainings
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            onRefresh={refetchAll}
                            organizations={organizations}
                            // Atribuição por obra. `projects` já chega sem projeto
                            // de sistema e só com OBRA (REGRA #2/#3).
                            projects={projects.map(p => ({ id: p.id, name: p.name }))}
                        />
                    )}
                    {activeTab === 'rh_dashboard' && (
                        <LaborRHDashboard
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            costSummary={costSummary}
                            onNavigate={onChangeView}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'termination' && (
                        <LaborTermination
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'timebank' && (
                        <LaborTimeBank
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'sst' && (
                        <LaborSST
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'contractors' && (
                        <LaborContractors
                            orgId={currentOrgId || activeOrganizationId || ''}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'diary' && (
                        <LaborDiary
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees}
                            teams={teams}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'ats' && (
                        <LaborATS
                            orgId={currentOrgId || activeOrganizationId || ''}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'portal' && (
                        <LaborPortal
                            orgId={activeOrganizationId || currentOrgId || ''}
                            employees={employees}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'evaluation' && (
                        <LaborEvaluation
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'comunicacao' && (
                        <LaborComunicacao
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'bi_analytics' && (
                        <LaborBIAnalytics
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'esocial' && (
                        <LaborEsocial
                            orgId={currentOrgId || activeOrganizationId || ''}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'vale_refeicao' && (
                        <LaborValeRefeicao
                            orgId={currentOrgId || activeOrganizationId || ''}
                            organizations={organizations.map(o => ({ id: o.id, name: o.name }))}
                            employees={employees}
                            projects={projects

                                .map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            onRefresh={refetchAll}
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
                    onSaved={handleEmployeeSaved}
                />
            )}
        </div>
    );
};

export default LaborModule;
