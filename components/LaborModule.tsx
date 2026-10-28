import React, { useState } from 'react';
import {
    Users, Clock, TrendingUp, DollarSign, BarChart3,
    UserPlus, Loader2, AlertCircle, Building2,
    Shield, Calendar, Target, FileText, Calculator, Settings, ChevronRight, Percent, HardHat, Umbrella, BookOpen, LayoutDashboard, UserMinus, ShieldAlert, Truck, ClipboardList, UserSearch, Smartphone, Award, MessageSquare, UtensilsCrossed, Gift, Briefcase, Banknote
} from 'lucide-react';
import { KpiCard as KpiCardBase, type KpiColor } from './ui/KpiCard';
import { Employee, LaborTeam, TimeEntry, ProductivityLog, LaborCostSummary } from '../services/laborService';
import LaborEmployeeList from './LaborEmployeeList';
import LaborEmployeeForm from './LaborEmployeeForm';
import LaborTimeTracking from './LaborTimeTracking';
import LaborProductivity from './LaborProductivity';
import LaborTeams from './LaborTeams';
import LaborCosts from './LaborCosts';
import LaborDocuments from './LaborDocuments';
import LaborPayroll from './LaborPayroll';
import LaborCostDashboard from './LaborCostDashboard';
import LaborRubrics from './LaborRubrics';
import LaborFiscalSettings from './LaborFiscalSettings';
import LaborEncargos from './LaborEncargos';
import LaborEPIs from './LaborEPIs';
import LaborAbsences from './LaborAbsences';
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
import { useOrgContext } from '../hooks/useOrgContext';
import { useLaborModuleData } from '../hooks/useLaborQueries';
import { laborKeys } from '../lib/queryKeys';
import { buildPartialFailureMessage } from '../lib/collectSettled';
import Button from './ui/Button';

// ─── Types ──────────────────────────────────────────────────
// 'allocations' saiu: virou aba de `LaborPayroll` em 2026-08-23.
type LaborTab = 'employees' | 'teams' | 'timetracking' | 'productivity' | 'costs' | 'payroll' | 'documents' | 'cost_dashboard' | 'rubrics' | 'fiscal' | 'encargos' | 'epis' | 'absences' | 'trainings' | 'rh_dashboard' | 'termination' | 'timebank' | 'sst' | 'contractors' | 'diary' | 'ats' | 'portal' | 'evaluation' | 'comunicacao' | 'bi_analytics' | 'esocial' | 'vale_refeicao' | 'incentivos' | 'cargos' | 'remuneracao_societaria';

const SECTION_TO_TAB: Record<string, LaborTab> = {
    'labor-dashboard': 'rh_dashboard',   // endereço antigo (o AppRouter também redireciona)
    'labor-cost-dashboard': 'cost_dashboard',
    'labor-employees': 'employees',
    'labor-teams': 'teams',
    // Alocações virou ABA da folha em 2026-08-23 (saiu do menu lateral). A
    // seção continua mapeada para não deixar tela em branco em quem tinha a
    // view antiga salva — cai na folha, que abre direto na aba Alocações.
    'labor-allocations': 'payroll',
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

const TAB_TO_SECTION: Record<LaborTab, string> = {
    ...(Object.fromEntries(
        Object.entries(SECTION_TO_TAB).map(([s, t]) => [t, s])
    ) as Record<LaborTab, string>),
    // ⚠️ Duas seções apontam para 'payroll' ('labor-payroll' e o legado
    // 'labor-allocations'), e o inverso automático fica com a ÚLTIMA. Sem esta
    // linha, abrir a folha pelo menu gravaria a view de Alocações.
    payroll: 'labor-payroll',
    // Idem: 'labor-dashboard' (endereço antigo) também aponta para 'rh_dashboard'.
    rh_dashboard: 'labor-rh-dashboard',
};

interface LaborModuleProps {
    /** @deprecated Não use. A org vem de `useOrgContext()` (REGRA #5). O AppRouter
     *  ainda passa esta prop para as demais telas; aqui ela é ignorada de propósito. */
    activeOrganizationId?: string;
    projects?: any[];
    activeSection?: string;
    onChangeView?: (view: string) => void;
}

// "Dashboard" (Gestão de Mão de Obra, KPIs + 26 atalhos) saiu em 28/10/2026: o
// Dashboard RH é a entrada do RH e o menu lateral já tem todos os atalhos
// (docs/planos/2026-10-28-dashboard-rh-numeros-e-paineis.md, passo 2). "Pontos
// pendentes" virou alerta lá; "Equipes" saiu.

// ─── MAIN MODULE ────────────────────────────────────────────
const LaborModule: React.FC<LaborModuleProps> = ({ projects = [], activeSection, onChangeView }) => {
    const activeTab: LaborTab = SECTION_TO_TAB[activeSection || ''] || 'rh_dashboard';

    const handleOpenTab = (tab: LaborTab) => {
        if (onChangeView) onChangeView(TAB_TO_SECTION[tab] || 'labor-rh-dashboard');
    };

    const queryClient = useQueryClient();
    const [editingEmployee, setEditingEmployee]= useState<Employee | null>(null);
    const [isEmployeeFormOpen, setIsEmployeeFormOpen] = useState(false);

    // Org vem do seletor global do topo — sem seletor próprio no módulo.
    // `useOrgContext` é a fonte única (REGRA #5): resolve a herança empresa→org e
    // usa UMA sentinela, `null` = "Todas as organizações". Não use a prop
    // `activeOrganizationId`: ela não conhece a empresa ativa, e o `|| ''` que
    // existia aqui virava `?org_id=eq.` no PostgREST — erro 22P02, não lista vazia.
    const { orgId, isAllOrgs } = useOrgContext();
    const currentOrgId = orgId ?? undefined;

    // §22 do guia de UI — atualizar o cache local (React Query) em vez de
    // refetch completo por 1 colaborador criado/editado.
    //
    // §25 do guia — quem fecha a tela é o próprio LaborEmployeeForm (só na
    // criação; editar permanece aberto para o usuário seguir conferindo as
    // outras abas). Este handler NUNCA fecha nada — só sincroniza o cache.
    // Ver docs/planos/2026-08-27-salvar-sem-fechar-formularios-multiaba.md.
    const handleEmployeeSaved = (updated: Employee) => {
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
        costSummary, docAlerts, organizations,
        isLoading, failedLabels, refetchAll,
    } = useLaborModuleData(currentOrgId);

    const pendingEntries = timeEntries.filter((e: any) => e.status === 'PENDENTE');

    const isAllOrgsMode = isAllOrgs;
    // Governa se a faixa de banners existe de verdade — precisa disso (e não só
    // renderizar a div vazia) para o `space-y-6` do pai não empurrar o conteúdo
    // 24px extra quando não há banner nenhum (ver comentário do `return` abaixo).
    const hasBanners = failedLabels.length > 0;

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
    // Editar Colaborador é TELA, não sobreposição (ver LaborEmployeeForm, bloco
    // isEditing): o módulo some com `hidden` — sem desmontar, para a lista
    // voltar com a busca, a rolagem e o cache intactos (§22) — e o formulário
    // ocupa o fluxo do <main>, com o gutter dele. Criar continua modal.
    const editandoColaborador = isEmployeeFormOpen && !!editingEmployee;

    return (
        <>
        <div className={`flex flex-col h-full space-y-6 ${editandoColaborador ? 'hidden' : ''}`}>
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

            </div>
            )}{/* /Banners */}

            {/* Content */}
            <div className="flex-1 overflow-y-auto pb-6">
                    {activeTab === 'cost_dashboard' && (
                        <LaborCostDashboard
                            orgId={orgId}
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
                            orgId={orgId}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'timetracking' && (
                        <LaborTimeTracking
                            employees={employees}
                            projects={projects}
                            orgId={orgId}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'productivity' && (
                        <LaborProductivity
                            employees={employees}
                            teams={teams}
                            projects={projects}
                            orgId={orgId}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'costs' && (
                        <LaborCosts
                            employees={employees}
                            teams={teams}
                            orgId={orgId}
                            projects={projects}
                            onNewEmployee={() => { setEditingEmployee(null); setIsEmployeeFormOpen(true); }}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'payroll' && (
                        <LaborPayroll
                            /* LaborPayroll usa 'all' como sentinela própria (processa
                               todas as empresas num só cálculo) — não é o `null` de leitura. */
                            orgId={orgId ?? 'all'}
                            /* Alocações é aba da folha desde 2026-08-23; a seção
                               legada do menu entra direto nela. */
                            initialTab={activeSection === 'labor-allocations' ? 'alocacoes' : 'ciclos'}
                            employees={employees}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'incentivos' && (
                        <LaborIncentivos
                            orgId={orgId}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                            teams={teams.map(t => ({ id: t.id, name: t.name }))}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'cargos' && (
                        <LaborCargos
                            orgId={orgId}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'remuneracao_societaria' && (
                        <LaborRemuneracaoSocietaria
                            orgId={orgId}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'rubrics' && <LaborRubrics />}
                    {activeTab === 'fiscal' && <LaborFiscalSettings />}
                    {activeTab === 'encargos' && (
                        <LaborEncargos
                            orgId={orgId}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'documents' && (
                        <LaborDocuments
                            employees={employees}
                            orgId={orgId}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'epis' && (
                        <LaborEPIs
                            orgId={orgId}
                            employees={employees}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'absences' && (
                        <LaborAbsences
                            orgId={orgId}
                            employees={employees}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {/* Treinamentos saiu do RH em 16/10/2026: item próprio "Treinamentos"
                        (components/training/TrainingsModule.tsx). O atalho do painel
                        abaixo continua levando a `labor-trainings`, que o AppRouter
                        redireciona para `treinamentos`. */}
                    {activeTab === 'rh_dashboard' && (
                        <LaborRHDashboard
                            orgId={orgId}
                            employees={employees}
                            costSummary={costSummary}
                            pontosPendentes={pendingEntries.length}
                            onNavigate={onChangeView}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'termination' && (
                        <LaborTermination
                            orgId={orgId}
                            employees={employees}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'timebank' && (
                        <LaborTimeBank
                            orgId={orgId}
                            employees={employees}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'sst' && (
                        <LaborSST
                            orgId={orgId}
                            employees={employees}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'contractors' && (
                        <LaborContractors
                            orgId={orgId}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'diary' && (
                        <LaborDiary
                            orgId={orgId}
                            employees={employees}
                            teams={teams}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            onRefresh={refetchAll}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'ats' && (
                        <LaborATS
                            orgId={orgId}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'portal' && (
                        <LaborPortal
                            orgId={orgId}
                            employees={employees}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'evaluation' && (
                        <LaborEvaluation
                            orgId={orgId}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'comunicacao' && (
                        <LaborComunicacao
                            orgId={orgId}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                            projects={projects.map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'bi_analytics' && (
                        <LaborBIAnalytics
                            orgId={orgId}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                            organizations={organizations}
                            onRefresh={refetchAll}
                        />
                    )}
                    {activeTab === 'esocial' && (
                        <LaborEsocial
                            orgId={orgId}
                            employees={employees.map(e => ({ id: e.id, name: e.name, status: e.status }))}
                            organizations={organizations}
                        />
                    )}
                    {activeTab === 'vale_refeicao' && (
                        <LaborValeRefeicao
                            orgId={orgId}
                            organizations={organizations.map(o => ({ id: o.id, name: o.name }))}
                            employees={employees}
                            projects={projects

                                .map(p => ({ id: p.id, name: p.name || (p as any).title || '' }))}
                            onRefresh={refetchAll}
                        />
                    )}
            </div>
        </div>

        {/* Formulário do colaborador — tela de edição ou modal de criação */}
        {isEmployeeFormOpen && (
            <LaborEmployeeForm
                employee={editingEmployee}
                orgId={orgId}
                organizations={organizations as unknown as { id: string; name: string; [key: string]: unknown }[]}
                onClose={() => { setIsEmployeeFormOpen(false); setEditingEmployee(null); }}
                onSaved={handleEmployeeSaved}
            />
        )}
        </>
    );
};

export default LaborModule;
