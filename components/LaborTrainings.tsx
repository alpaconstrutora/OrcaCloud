import React, { useMemo, useState } from 'react';
import {
    AlertTriangle, Award, BookOpen, CheckCircle2, Plus, Search, Users, XCircle,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from './ui/TableUtils';
import LaborScopeBar from './LaborScopeBar';
import AcademyCatalogTab from './academy/AcademyCatalogTab';
import AcademyAssignmentsTab from './academy/AcademyAssignmentsTab';
import AcademyPanels from './academy/AcademyPanels';
import AcademyCourseBuilder from './academy/AcademyCourseBuilder';
import AcademyRecordSheet from './academy/AcademyRecordSheet';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { laborService, Employee } from '../services/laborService';
import { trainingsService } from '../services/trainingsService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';
import type {
    AcademyEnrollment, EmployeeTraining, TrainingCourse,
} from '../types/academy';

/**
 * Academia ÒPURA — container do submódulo Recursos Humanos › Treinamentos.
 *
 * Esta tela é de GESTÃO, e só isso:
 *   Catálogo · Atribuições · Registros · Painéis
 *
 * O colaborador NÃO faz treinamento aqui. Quem tem login usa a área pessoal
 * "Meus Treinamentos" (`components/academy/MeusTreinamentosView.tsx`, item
 * solto na sidebar, sem guarda de módulo); quem não tem login — a maior parte
 * da mão de obra — usa o Portal do Colaborador por token. O motivo é simples:
 * esta tela está atrás de `canViewLabor`, e quem precisa FAZER treinamento
 * justamente não tem permissão de RH.
 *
 * O conteúdo de cada aba mora em `components/academy/` — este arquivo só
 * orquestra. Montar conteúdo de um curso troca o conteúdo por uma TELA (padrão
 * ContractDetailView: seta de voltar + <h1>, sem overlay).
 *
 * Spec: PLANO_MODULO_TREINAMENTOS.md
 */

type TView = 'catalog' | 'assignments' | 'records' | 'panels';

const VIEWS: Array<{ id: TView; label: string }> = [
    { id: 'catalog',     label: 'Catálogo' },
    { id: 'assignments', label: 'Atribuições' },
    { id: 'records',     label: 'Registros' },
    { id: 'panels',      label: 'Painéis' },
];

// O <h1> muda com a aba — senão o título mente (§19.1).
const VIEW_HEADERS: Record<TView, { title: string; subtitle: string }> = {
    catalog:     { title: 'Catálogo de treinamentos', subtitle: 'Treinamentos internos, NRs e conteúdo EAD da organização.' },
    assignments: { title: 'Atribuições',              subtitle: 'Quem precisa fazer cada treinamento, com prazo e reciclagem.' },
    records:     { title: 'Registros de treinamento', subtitle: 'Evidências de participação e controle de vencimento.' },
    panels:      { title: 'Painéis de treinamento',   subtitle: 'Aderência da equipe e conformidade de NR.' },
};

const RECORD_COLUMNS: ColumnConfig[] = [
    { key: 'employee',  label: 'Colaborador',  sortable: true },
    { key: 'course',    label: 'Treinamento',  sortable: true },
    { key: 'origem',    label: 'Origem',       sortable: true },
    { key: 'realizado', label: 'Realizado em', sortable: true },
    { key: 'validade',  label: 'Validade',     sortable: true },
    { key: 'nota',      label: 'Nota',         sortable: true },
    { key: 'status',    label: 'Status',       sortable: true },
    { key: 'actions',   label: 'Ações',        sortable: false },
];

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' não entra (renderizada fixa fora do drag).
const RECORD_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    employee: { label: 'Colaborador', className: 'px-6 py-2 border-r border-gray-100' },
    course: { label: 'Treinamento', className: 'px-6 py-2 border-r border-gray-100' },
    origem: { label: 'Origem', className: 'px-6 py-2 border-r border-gray-100' },
    realizado: { label: 'Realizado em', className: 'px-6 py-2 border-r border-gray-100' },
    validade: { label: 'Validade', className: 'px-6 py-2 border-r border-gray-100' },
    nota: { label: 'Nota', className: 'px-6 py-2 border-r border-gray-100' },
    status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100' },
};

const STATUS_COLORS: Record<string, string> = {
    ATIVO: 'text-emerald-700', VENCIDO: 'text-rose-700', PENDENTE: 'text-amber-700',
};

/** Datas puras (YYYY-MM-DD) nunca podem passar por `new Date()`: viram o dia anterior. */
const fmtData = (iso?: string) => {
    if (!iso) return '—';
    const [a, m, d] = iso.split('T')[0].split('-');
    return `${d}/${m}/${a}`;
};

interface RecordCellCtx {
    hoje: string;
    vencendo: boolean | '' | null | undefined;
}

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `recordColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderRecordCell(key: string, r: EmployeeTraining, ctx: RecordCellCtx): React.ReactNode {
    switch (key) {
        case 'employee':
            return <span className="text-gray-900">{r.employee_name || '—'}</span>;
        case 'course':
            return (
                <>
                    <p className="text-gray-800">{r.course_nome || '—'}</p>
                    {r.nr_referencia && <p className="text-xs font-medium text-rose-600">{r.nr_referencia}</p>}
                </>
            );
        case 'origem':
            return (
                <span className={r.origem === 'ACADEMIA' ? 'text-indigo-700' : 'text-gray-600'}>
                    {r.origem === 'ACADEMIA' ? 'Academia (EAD)' : 'Presencial'}
                </span>
            );
        case 'realizado':
            return <span className="text-gray-500">{fmtData(r.data_realizacao)}</span>;
        case 'validade':
            return r.data_validade ? (
                <span className={
                    r.data_validade < ctx.hoje ? 'text-rose-700'
                        : ctx.vencendo ? 'text-amber-700' : 'text-gray-600'
                }>
                    {fmtData(r.data_validade)}
                </span>
            ) : <span className="text-gray-400">Sem validade</span>;
        case 'nota':
            return r.nota != null ? (
                <span className={r.aprovado ? 'text-emerald-700' : 'text-rose-700'}>{r.nota}</span>
            ) : <span className="text-gray-400">—</span>;
        case 'status':
            return <span className={STATUS_COLORS[r.status] ?? 'text-gray-600'}>{r.status}</span>;
        default:
            return null;
    }
}

function useToast() {
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };
    const Toast = () => notification ? (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-[10px] shadow-xl text-sm font-medium ${
            notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {notification.message}
        </div>
    ) : null;
    return { notify, Toast };
}

interface LaborTrainingsProps {
    orgId: string;
    employees: Employee[];
    onRefresh?: () => void;
    organizations: Array<{ id: string; name: string }>;
    /** Obras vindas de useStore().projects (sem projeto de sistema, só OBRA). */
    projects?: Array<{ id: string; name: string }>;
    podeEditar?: boolean;
}

const LaborTrainings: React.FC<LaborTrainingsProps> = ({
    orgId, employees, onRefresh, projects = [], podeEditar = true,
}) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const { notify, Toast } = useToast();

    const [viewSalva, setView] = usePersistedState<TView>('laborTrainings:view', 'catalog');
    // A aba 'classroom' saiu daqui na Etapa 1.1 (virou "Meus Treinamentos"),
    // mas continua gravada no localStorage de quem já tinha usado a tela.
    // Sem esta normalização, VIEW_HEADERS[view] vem undefined e a tela quebra
    // em `header.title`. Vale para qualquer aba que venha a ser removida.
    const view: TView = VIEWS.some(v => v.id === viewSalva) ? viewSalva : 'catalog';
    const [search, setSearch] = usePersistedState('laborTrainings:search', '');
    const [filterEmployee, setFilterEmployee] = usePersistedState('laborTrainings:employee', '');
    const [filterStatus, setFilterStatus] = usePersistedState<EmployeeTraining['status'] | ''>('laborTrainings:status', '');
    const recordColumns = useTableColumns(RECORD_COLUMNS, 'laborTrainingsRecordColumns');

    // Telas (troca in-flow, não overlay)
    const [builderCourse, setBuilderCourse] = useState<TrainingCourse | null>(null);
    const [recordSheet, setRecordSheet] = useState(false);

    const coursesKey = laborKeys.trainingCourses(orgId);
    const recordsKey = [...laborKeys.all, 'employeeTrainings', orgId, filterEmployee, filterStatus];
    const alertsKey  = laborKeys.trainingAlerts(orgId);

    const { data: courses = [], isLoading: loadingCourses } = useQuery({
        queryKey: coursesKey,
        // Sem `enabled: !!orgId` — com "Todas as organizações" a RLS recorta
        // sozinha e a tela não pode ficar vazia (REGRA #5).
        queryFn: () => trainingsService.listTrainingCourses(orgId),
        staleTime: STALE.normal,
    });

    const { data: records = [], isLoading: loadingRecords } = useQuery({
        queryKey: recordsKey,
        queryFn: () => trainingsService.listEmployeeTrainings({
            orgId,
            employeeId: filterEmployee || undefined,
            status: filterStatus || undefined,
        }),
        staleTime: STALE.fast,
    });

    const { data: alerts = [] } = useQuery({
        queryKey: alertsKey,
        queryFn: () => trainingsService.getTrainingAlerts(orgId),
        staleTime: STALE.normal,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: coursesKey });
        qc.invalidateQueries({ queryKey: recordsKey });
        qc.invalidateQueries({ queryKey: alertsKey });
    };

    /** §22: mexe no cache local em vez de recarregar a tabela inteira. */
    const atualizarCursos = (fn: (prev: TrainingCourse[]) => TrainingCourse[]) =>
        qc.setQueryData<TrainingCourse[]>(coursesKey, prev => fn(prev ?? []));

    const excluirRegistro = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir registro?',
            message: 'Este registro de treinamento será removido permanentemente.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        await trainingsService.deleteEmployeeTraining(id);
        qc.setQueryData<EmployeeTraining[]>(recordsKey, prev => (prev ?? []).filter(r => r.id !== id));
        notify('Registro excluído.');
    };

    // KPIs
    const cursosAtivos = courses.filter(c => c.status === 'ATIVO').length;
    const registrosAtivos = records.filter(r => r.status === 'ATIVO').length;
    const registrosVencidos = records.filter(r => r.status === 'VENCIDO').length;

    const registrosFiltrados = useMemo(() => {
        const termo = search.trim().toLowerCase();
        const base = !termo ? records : records.filter(r =>
            (r.employee_name || '').toLowerCase().includes(termo) ||
            (r.course_nome || '').toLowerCase().includes(termo) ||
            (r.nr_referencia || '').toLowerCase().includes(termo));

        if (!recordColumns.sortColumn) return base;
        const dir = recordColumns.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (recordColumns.sortColumn) {
                case 'employee':  return dir * (a.employee_name || '').localeCompare(b.employee_name || '');
                case 'course':    return dir * (a.course_nome || '').localeCompare(b.course_nome || '');
                case 'origem':    return dir * (a.origem || '').localeCompare(b.origem || '');
                case 'realizado': return dir * a.data_realizacao.localeCompare(b.data_realizacao);
                case 'validade':  return dir * (a.data_validade || '').localeCompare(b.data_validade || '');
                case 'nota':      return dir * ((a.nota ?? -1) - (b.nota ?? -1));
                case 'status':    return dir * a.status.localeCompare(b.status);
                default: return 0;
            }
        });
    }, [records, search, recordColumns.sortColumn, recordColumns.sortDirection]);

    // ── TELAS (trocam o conteúdo in-flow) ───────────────────────────────

    if (builderCourse) {
        return (
            <>
                <AcademyCourseBuilder
                    course={builderCourse}
                    orgId={orgId}
                    podeEditar={podeEditar}
                    onVoltar={() => { setBuilderCourse(null); invalidate(); }}
                    notify={notify}
                />
                <Toast />
            </>
        );
    }

    const header = VIEW_HEADERS[view];
    const th = 'px-6 py-2 border-r border-gray-100';
    const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';
    const hoje = new Date().toISOString().split('T')[0];

    return (
        <div className="space-y-6">
            {/* Cabeçalho de tela (§20) — título acompanha a aba */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{header.title}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{header.subtitle}</p>
            </div>

            {alerts.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-[10px] flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-semibold text-amber-900">
                            {alerts.length} treinamento{alerts.length > 1 ? 's' : ''} vencendo em 30 dias
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                            {alerts.slice(0, 4).map(a => `${a.employee_name} — ${a.course_nome}`).join(' · ')}
                            {alerts.length > 4 && ` e mais ${alerts.length - 4}…`}
                        </p>
                    </div>
                </div>
            )}

            {(view === 'catalog' || view === 'records') && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                    <KpiCard label="Treinamentos Ativos" value={`${cursosAtivos}`} icon={<BookOpen className="w-5 h-5" />} color="emerald" />
                    <KpiCard label="Registros Ativos" value={`${registrosAtivos}`} icon={<CheckCircle2 className="w-5 h-5" />} color="indigo" />
                    <KpiCard label="Registros Vencidos" value={`${registrosVencidos}`} icon={<XCircle className="w-5 h-5" />} color="rose" />
                    <KpiCard label="Vencendo em 30 Dias" value={`${alerts.length}`} icon={<AlertTriangle className="w-5 h-5" />} color="amber" />
                </div>
            )}

            {/* Toolbar de abas (§19.1) */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {VIEWS.map(v => (
                        <button
                            key={v.id}
                            onClick={() => setView(v.id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                view === v.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {v.label}
                        </button>
                    ))}
                </div>
            </div>

            <LaborScopeBar onRefresh={onRefresh || (() => {})} />

            {view === 'catalog' && (
                <AcademyCatalogTab
                    orgId={orgId}
                    courses={courses}
                    carregando={loadingCourses}
                    podeEditar={podeEditar}
                    onCoursesChange={atualizarCursos}
                    onMontarConteudo={setBuilderCourse}
                    notify={notify}
                />
            )}

            {view === 'assignments' && (
                <AcademyAssignmentsTab
                    orgId={orgId}
                    courses={courses}
                    employees={employees}
                    projects={projects}
                    podeEditar={podeEditar}
                    notify={notify}
                />
            )}

            {view === 'panels' && <AcademyPanels orgId={orgId} />}

            {view === 'records' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-white">
                        <div className="flex flex-col md:flex-row gap-2.5 items-center">
                            <div className="flex-1 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Buscar colaborador, treinamento ou NR..."
                                    className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                            <select
                                value={filterEmployee}
                                onChange={e => setFilterEmployee(e.target.value)}
                                className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none"
                            >
                                <option value="">Todos os colaboradores</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <select
                                value={filterStatus}
                                onChange={e => setFilterStatus(e.target.value as EmployeeTraining['status'] | '')}
                                className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none"
                            >
                                <option value="">Todos os status</option>
                                <option value="ATIVO">Ativo</option>
                                <option value="VENCIDO">Vencido</option>
                                <option value="PENDENTE">Pendente</option>
                            </select>
                            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                <ColumnConfigButton
                                    columns={RECORD_COLUMNS.filter(c => c.key !== 'actions')}
                                    visibleColumns={recordColumns.visibleColumns}
                                    showColumnConfig={recordColumns.showColumnConfig}
                                    onToggleShow={() => recordColumns.setShowColumnConfig(!recordColumns.showColumnConfig)}
                                    onToggleColumn={recordColumns.toggleColumn}
                                    onReset={recordColumns.resetColumns}
                                />
                            </div>
                            <button
                                onClick={() => setRecordSheet(true)}
                                disabled={!podeEditar || !orgId}
                                title={!podeEditar ? 'Você não tem permissão para registrar treinamentos'
                                     : !orgId ? 'Selecione uma organização para registrar' : undefined}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 shrink-0 disabled:opacity-50"
                            >
                                <Plus className="w-[15px] h-[15px]" /> Registrar treinamento
                            </button>
                        </div>
                    </div>

                    {loadingRecords ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : registrosFiltrados.length === 0 ? (
                        <div className="text-center py-12">
                            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum treinamento registrado</h3>
                            <p className="text-sm text-gray-500">
                                Registre uma participação presencial ou conclua um treinamento EAD.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        {recordColumns.orderedVisibleColumns
                                            .filter(key => key !== 'actions')
                                            .map(key => {
                                                const def = RECORD_COLUMN_HEADERS[key];
                                                if (!def) return null;
                                                return (
                                                    <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                        sortColumn={recordColumns.sortColumn} sortDirection={recordColumns.sortDirection}
                                                        onSort={recordColumns.handleColumnSort}
                                                        onMoveColumn={recordColumns.moveColumn}
                                                        className={def.className} />
                                                );
                                            })}
                                        {recordColumns.visibleColumns.includes('actions') && (
                                            <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {registrosFiltrados.map(r => {
                                        const vencendo = r.data_validade &&
                                            r.data_validade <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
                                        return (
                                            <tr key={r.id} className="hover:bg-blue-50/50 transition-colors">
                                                {recordColumns.orderedVisibleColumns
                                                    .filter(key => key !== 'actions')
                                                    .map(key => (
                                                        <td key={key} className={td}>
                                                            {renderRecordCell(key, r, { hoje, vencendo })}
                                                        </td>
                                                    ))}
                                                {recordColumns.visibleColumns.includes('actions') && (
                                                    <td className="px-6 py-2.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {(r.certificado_url || r.academy_certificate_id) && (
                                                                <span className="p-1.5 text-indigo-400" title="Certificado disponível">
                                                                    <Award className="w-4 h-4" />
                                                                </span>
                                                            )}
                                                            <ActionIconButton
                                                                kind="delete"
                                                                onClick={() => excluirRegistro(r.id)}
                                                                disabled={!podeEditar}
                                                            />
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {recordSheet && orgId && (
                <AcademyRecordSheet
                    open
                    onClose={() => setRecordSheet(false)}
                    orgId={orgId}
                    employees={employees}
                    courses={courses}
                    onSaved={criado => {
                        qc.setQueryData<EmployeeTraining[]>(recordsKey, prev => [criado, ...(prev ?? [])]);   // §22
                        qc.invalidateQueries({ queryKey: alertsKey });
                        notify('Treinamento registrado.');
                    }}
                    notify={notify}
                />
            )}

            <Toast />
        </div>
    );
};

export default LaborTrainings;
