import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Plus, RefreshCw, Search, Target } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from '../ui/TableUtils';
import AcademyAssignmentSheet, { type AlvoOpcao } from './AcademyAssignmentSheet';
import { academyService } from '../../services/academyService';
import { laborService } from '../../services/laborService';
import type {
    AcademyAssignment, AcademyAssignmentAlvo, TrainingCourse,
} from '../../types/academy';
import type { Employee } from '../../services/laborService';

/**
 * Atribuições — quem deve fazer o quê, com que prazo.
 *
 * A materialização em matrícula é do cron (`generate_academy_alerts`), não da
 * tela: é assim que quem entra na empresa depois também é alcançado. O botão
 * "Processar agora" existe para não esperar até o dia seguinte.
 */

const COLUMNS: ColumnConfig[] = [
    { key: 'curso',      label: 'Treinamento', sortable: true },
    { key: 'alvo',       label: 'Atribuído a', sortable: true },
    { key: 'prazo',      label: 'Prazo',       sortable: true },
    { key: 'obrigatorio',label: 'Obrigatório', sortable: true },
    { key: 'reciclagem', label: 'Reciclagem',  sortable: true },
    { key: 'matriculas', label: 'Matrículas',  sortable: true },
    { key: 'status',     label: 'Status',      sortable: true },
    { key: 'actions',    label: 'Ações',       sortable: false },
];

const ALVO_LABEL: Record<AcademyAssignmentAlvo, string> = {
    COLABORADOR: 'Colaborador', CARGO: 'Cargo', FUNCAO: 'Função',
    EQUIPE: 'Equipe', OBRA: 'Obra', TODOS: 'Toda a organização',
};

interface Props {
    orgId?: string | null;
    courses: TrainingCourse[];
    employees: Employee[];
    projects: Array<{ id: string; name: string }>;
    podeEditar: boolean;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcademyAssignmentsTab: React.FC<Props> = ({
    orgId, courses, employees, projects, podeEditar, notify,
}) => {
    const confirm = useConfirm();
    const [search, setSearch] = usePersistedState('academyAssignments:search', '');
    const colunas = useTableColumns(COLUMNS, 'academyAssignmentsColumns');

    const [assignments, setAssignments] = useState<AcademyAssignment[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [processando, setProcessando] = useState(false);
    const [sheet, setSheet] = useState<{ assignment: AcademyAssignment | null } | null>(null);
    const [opcoes, setOpcoes] = useState<Record<Exclude<AcademyAssignmentAlvo, 'TODOS'>, AlvoOpcao[]>>({
        COLABORADOR: [], CARGO: [], FUNCAO: [], EQUIPE: [], OBRA: [],
    });

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            setAssignments(await academyService.listAssignments(orgId));
        } catch (e: any) {
            notify('Erro ao carregar atribuições: ' + (e?.message || ''), 'error');
        } finally {
            setCarregando(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId]);

    useEffect(() => { void carregar(); }, [carregar]);

    // Opções de alvo. Obras vêm do container (useStore().projects — já sem
    // projeto de sistema e só OBRA, REGRA #2/#3).
    useEffect(() => {
        (async () => {
            try {
                const [{ cargos, funcoes }, teams] = await Promise.all([
                    academyService.listCargoFuncaoOptions(orgId),
                    orgId ? laborService.listTeams(orgId) : Promise.resolve([]),
                ]);
                setOpcoes({
                    COLABORADOR: employees.filter(e => e.status === 'ATIVO').map(e => ({ id: e.id, nome: e.name })),
                    CARGO: cargos.map(c => ({ id: c.id, nome: c.nome })),
                    FUNCAO: funcoes.map(f => ({ id: f.id, nome: f.nome })),
                    EQUIPE: (teams as Array<{ id: string; name: string }>).map(t => ({ id: t.id, nome: t.name })),
                    OBRA: projects.map(p => ({ id: p.id, nome: p.name })),
                });
            } catch {
                // Opções incompletas não impedem ver a lista.
            }
        })();
    }, [orgId, employees, projects]);

    const nomeDoAlvo = useCallback((a: AcademyAssignment) => {
        if (a.alvo_tipo === 'TODOS') return 'Toda a organização';
        const lista = opcoes[a.alvo_tipo] ?? [];
        return lista.find(o => o.id === a.alvo_id)?.nome ?? '—';
    }, [opcoes]);

    const processarAgora = async () => {
        setProcessando(true);
        try {
            const r = await academyService.runAlerts(7, orgId);
            await carregar();

            // "0 criadas" sem explicação faz o RH clicar de novo achando que
            // travou. Quando não há nada a criar, dizer o motivo mais provável.
            if (r.novas === 0 && r.reciclagens === 0) {
                const temBloqueada = assignments.some(a => a.status === 'ATIVA' && a.sem_conteudo_publicado);
                notify(
                    temBloqueada
                        ? 'Nenhuma matrícula criada — há treinamento sem versão publicada. Publique o conteúdo primeiro.'
                        : 'Nenhuma matrícula nova: todos os alcançados já estão matriculados.',
                    temBloqueada ? 'error' : 'success',
                );
                return;
            }
            notify(`${r.novas} matrícula(s) criada(s), ${r.reciclagens} reciclagem(ns), ${r.expiradas} expirada(s).`);
        } catch (e: any) {
            notify('Erro ao processar: ' + (e?.message || ''), 'error');
        } finally {
            setProcessando(false);
        }
    };

    const inativar = async (a: AcademyAssignment) => {
        const ok = await confirm({
            title: 'Inativar atribuição?',
            message: 'Novas matrículas deixam de ser criadas. As já existentes continuam valendo.',
            variant: 'warning',
            confirmLabel: 'Inativar',
        });
        if (!ok) return;
        await academyService.deleteAssignment(a.id);
        setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, status: 'INATIVA' } : x));   // §22
    };

    const filtradas = useMemo(() => {
        const termo = search.trim().toLowerCase();
        const base = !termo ? assignments : assignments.filter(a =>
            (a.course_nome || '').toLowerCase().includes(termo) ||
            nomeDoAlvo(a).toLowerCase().includes(termo));

        if (!colunas.sortColumn) return base;
        const dir = colunas.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (colunas.sortColumn) {
                case 'curso':       return dir * (a.course_nome || '').localeCompare(b.course_nome || '');
                case 'alvo':        return dir * nomeDoAlvo(a).localeCompare(nomeDoAlvo(b));
                case 'prazo':       return dir * ((a.prazo_dias ?? 0) - (b.prazo_dias ?? 0));
                case 'obrigatorio': return dir * (Number(a.obrigatorio) - Number(b.obrigatorio));
                case 'reciclagem':  return dir * (Number(a.reciclagem_automatica) - Number(b.reciclagem_automatica));
                case 'matriculas':  return dir * ((a.matriculas ?? 0) - (b.matriculas ?? 0));
                case 'status':      return dir * a.status.localeCompare(b.status);
                default: return 0;
            }
        });
    }, [assignments, search, colunas.sortColumn, colunas.sortDirection, nomeDoAlvo]);

    const th = 'px-6 py-2 border-r border-gray-100';
    const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

    // A atribuição sem conteúdo publicado é criada normalmente e nunca gera
    // matrícula — o RH atribui, acha que resolveu, e ninguém recebe nada.
    const bloqueadas = assignments.filter(a => a.status === 'ATIVA' && a.sem_conteudo_publicado);

    return (
        <>
        {bloqueadas.length > 0 && (
            <div className="p-4 mb-3 bg-amber-50 border border-amber-200 rounded-[10px] flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-semibold text-amber-900">
                        {bloqueadas.length} atribuição(ões) não vão gerar matrícula
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                        {[...new Set(bloqueadas.map(a => a.course_nome).filter(Boolean))].join(' · ')}
                        {' '}— o treinamento ainda não tem versão <span className="font-medium">publicada</span>.
                        Abra o Catálogo, clique em “Montar conteúdo” e publique a versão; até lá o colaborador
                        não vê nada, mesmo com a atribuição ativa.
                    </p>
                </div>
            </div>
        )}

        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-white">
                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                    <div className="flex-1 relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar treinamento ou alvo..."
                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>

                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                        <ColumnConfigButton
                            columns={COLUMNS.filter(c => c.key !== 'actions')}
                            visibleColumns={colunas.visibleColumns}
                            showColumnConfig={colunas.showColumnConfig}
                            onToggleShow={() => colunas.setShowColumnConfig(!colunas.showColumnConfig)}
                            onToggleColumn={colunas.toggleColumn}
                            onReset={colunas.resetColumns}
                        />
                    </div>

                    <button
                        onClick={processarAgora}
                        disabled={processando || !podeEditar}
                        title={!podeEditar ? 'Você não tem permissão para processar atribuições' : 'Cria as matrículas pendentes sem esperar o processamento diário'}
                        className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all shrink-0 disabled:opacity-50"
                    >
                        {processando
                            ? <Loader2 className="w-[15px] h-[15px] animate-spin" />
                            : <RefreshCw className="w-[15px] h-[15px]" />}
                        Processar agora
                    </button>

                    <button
                        onClick={() => setSheet({ assignment: null })}
                        disabled={!podeEditar || courses.length === 0}
                        title={!podeEditar ? 'Você não tem permissão para atribuir treinamentos'
                             : courses.length === 0 ? 'Cadastre um treinamento primeiro' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 shrink-0 disabled:opacity-50"
                    >
                        <Plus className="w-[15px] h-[15px]" /> Nova atribuição
                    </button>
                </div>
            </div>

            {carregando ? (
                <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                    <p className="mt-2 text-gray-500">Carregando atribuições...</p>
                </div>
            ) : filtradas.length === 0 ? (
                <div className="text-center py-12">
                    <Target className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma atribuição cadastrada</h3>
                    <p className="text-sm text-gray-500">
                        Atribua um treinamento por cargo, função, equipe ou obra — quem entrar depois também é alcançado.
                    </p>
                </div>
            ) : (
                <div className="overflow-auto max-h-[70vh]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                {colunas.visibleColumns.includes('curso') && (
                                    <SortableHeader label="Treinamento" colKey="curso" uppercase={false} sortColumn={colunas.sortColumn} sortDirection={colunas.sortDirection} onSort={colunas.handleColumnSort} className={th} />
                                )}
                                {colunas.visibleColumns.includes('alvo') && (
                                    <SortableHeader label="Atribuído a" colKey="alvo" uppercase={false} sortColumn={colunas.sortColumn} sortDirection={colunas.sortDirection} onSort={colunas.handleColumnSort} className={th} />
                                )}
                                {colunas.visibleColumns.includes('prazo') && (
                                    <SortableHeader label="Prazo" colKey="prazo" uppercase={false} sortColumn={colunas.sortColumn} sortDirection={colunas.sortDirection} onSort={colunas.handleColumnSort} className={th} />
                                )}
                                {colunas.visibleColumns.includes('obrigatorio') && (
                                    <SortableHeader label="Obrigatório" colKey="obrigatorio" uppercase={false} sortColumn={colunas.sortColumn} sortDirection={colunas.sortDirection} onSort={colunas.handleColumnSort} className={th} />
                                )}
                                {colunas.visibleColumns.includes('reciclagem') && (
                                    <SortableHeader label="Reciclagem" colKey="reciclagem" uppercase={false} sortColumn={colunas.sortColumn} sortDirection={colunas.sortDirection} onSort={colunas.handleColumnSort} className={th} />
                                )}
                                {colunas.visibleColumns.includes('status') && (
                                    <SortableHeader label="Status" colKey="status" uppercase={false} sortColumn={colunas.sortColumn} sortDirection={colunas.sortDirection} onSort={colunas.handleColumnSort} className={th} />
                                )}
                                {colunas.visibleColumns.includes('actions') && (
                                    <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filtradas.map(a => (
                                <tr key={a.id} className="hover:bg-blue-50/50 transition-colors">
                                    {colunas.visibleColumns.includes('curso') && (
                                        <td className={`${td} text-gray-900`}>{a.course_nome || '—'}</td>
                                    )}
                                    {colunas.visibleColumns.includes('alvo') && (
                                        <td className={td}>
                                            <p className="text-gray-800">{nomeDoAlvo(a)}</p>
                                            <p className="text-xs text-gray-400">{ALVO_LABEL[a.alvo_tipo]}</p>
                                        </td>
                                    )}
                                    {colunas.visibleColumns.includes('prazo') && (
                                        <td className={`${td} text-gray-600`}>
                                            {a.prazo_dias ? `${a.prazo_dias} dias` : '—'}
                                        </td>
                                    )}
                                    {colunas.visibleColumns.includes('obrigatorio') && (
                                        <td className={td}>
                                            <span className={a.obrigatorio ? 'text-rose-700' : 'text-gray-400'}>
                                                {a.obrigatorio ? 'Sim' : 'Não'}
                                            </span>
                                        </td>
                                    )}
                                    {colunas.visibleColumns.includes('reciclagem') && (
                                        <td className={td}>
                                            <span className={a.reciclagem_automatica ? 'text-emerald-700' : 'text-gray-400'}>
                                                {a.reciclagem_automatica ? 'Automática' : 'Manual'}
                                            </span>
                                        </td>
                                    )}
                                    {colunas.visibleColumns.includes('matriculas') && (
                                        <td className={td}>
                                            {a.sem_conteudo_publicado ? (
                                                <span className="text-amber-700">Sem conteúdo publicado</span>
                                            ) : (
                                                <span className={a.matriculas ? 'text-gray-700' : 'text-gray-400'}>
                                                    {a.matriculas ?? 0}
                                                </span>
                                            )}
                                        </td>
                                    )}
                                    {colunas.visibleColumns.includes('status') && (
                                        <td className={td}>
                                            <span className={a.status === 'ATIVA' ? 'text-emerald-700' : 'text-gray-500'}>
                                                {a.status === 'ATIVA' ? 'Ativa' : 'Inativa'}
                                            </span>
                                        </td>
                                    )}
                                    {colunas.visibleColumns.includes('actions') && (
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <ActionIconButton
                                                    kind="edit"
                                                    onClick={() => setSheet({ assignment: a })}
                                                    disabled={!podeEditar}
                                                />
                                                <ActionIconButton
                                                    kind="delete"
                                                    title="Inativar"
                                                    onClick={() => inativar(a)}
                                                    disabled={!podeEditar || a.status === 'INATIVA'}
                                                />
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {sheet && orgId && (
                <AcademyAssignmentSheet
                    open
                    onClose={() => setSheet(null)}
                    orgId={orgId}
                    courses={courses}
                    assignment={sheet.assignment}
                    opcoes={opcoes}
                    onSaved={() => { void carregar(); notify(sheet.assignment ? 'Atribuição atualizada.' : 'Atribuição criada.'); }}
                    notify={notify}
                />
            )}
        </div>
        </>
    );
};

export default AcademyAssignmentsTab;
