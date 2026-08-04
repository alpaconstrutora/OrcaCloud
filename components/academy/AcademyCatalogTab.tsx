import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Layers, Plus, Search, Shield } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { useOrgWriteTarget } from '../../hooks/useOrgContext';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from '../ui/TableUtils';
import AcademyCourseSheet, { CAT_CONFIG } from './AcademyCourseSheet';
import { academyService } from '../../services/academyService';
import { trainingsService } from '../../services/trainingsService';
import type { TrainingCourse } from '../../types/academy';

/**
 * Catálogo de treinamentos — a mesma tabela de sempre, agora com Modalidade,
 * a versão vigente do conteúdo e a ação "Montar conteúdo".
 */

const COLUMNS: ColumnConfig[] = [
    { key: 'nome',        label: 'Treinamento', sortable: true },
    { key: 'categoria',   label: 'Categoria',   sortable: true },
    { key: 'modalidade',  label: 'Modalidade',  sortable: true },
    { key: 'nr',          label: 'NR',          sortable: true },
    { key: 'carga',       label: 'Carga',       sortable: true },
    { key: 'validade',    label: 'Validade',    sortable: true },
    { key: 'conteudo',    label: 'Conteúdo',    sortable: true },
    { key: 'obrigatorio', label: 'Obrigatório', sortable: true },
    { key: 'actions',     label: 'Ações',       sortable: false },
];

const MODALIDADE_LABEL: Record<string, string> = {
    PRESENCIAL: 'Presencial', EAD: 'EAD', HIBRIDO: 'Híbrido',
};

interface Props {
    orgId?: string | null;
    courses: TrainingCourse[];
    carregando: boolean;
    podeEditar: boolean;
    onCoursesChange: (fn: (prev: TrainingCourse[]) => TrainingCourse[]) => void;
    onMontarConteudo: (course: TrainingCourse) => void;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcademyCatalogTab: React.FC<Props> = ({
    orgId, courses, carregando, podeEditar, onCoursesChange, onMontarConteudo, notify,
}) => {
    const confirm = useConfirm();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const [sheetOrgId, setSheetOrgId] = useState<string | null | undefined>(orgId);
    const [search, setSearch] = usePersistedState('academyCatalog:search', '');
    const colunas = useTableColumns(COLUMNS, 'academyCatalogColumns');
    const [sheet, setSheet] = useState<{ course: TrainingCourse | null } | null>(null);

    const handleNewCourse = async () => {
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        const orgIdResolved = target.orgId;
        setSheetOrgId(orgIdResolved);
        setSheet({ course: null });
    };
    const [cargos, setCargos] = useState<Array<{ id: string; nome: string }>>([]);
    // course_id → "v3 vigente" | "rascunho" | undefined
    const [versoes, setVersoes] = useState<Record<string, string>>({});

    useEffect(() => {
        academyService.listCargoFuncaoOptions(orgId)
            .then(r => setCargos(r.cargos))
            .catch(() => setCargos([]));
    }, [orgId]);

    // Estado do conteúdo por curso — só para os que têm modalidade EAD/híbrida.
    useEffect(() => {
        const comConteudo = courses.filter(c => c.modalidade && c.modalidade !== 'PRESENCIAL');
        if (!comConteudo.length) { setVersoes({}); return; }

        let cancelado = false;
        (async () => {
            const entradas = await Promise.all(comConteudo.map(async c => {
                try {
                    const lista = await academyService.listVersions(c.id);
                    const pub = lista.find(v => v.status === 'PUBLICADA');
                    const rasc = lista.find(v => v.status === 'RASCUNHO');
                    return [c.id, pub ? `v${pub.versao} vigente` : rasc ? 'rascunho' : ''] as const;
                } catch {
                    return [c.id, ''] as const;
                }
            }));
            if (!cancelado) setVersoes(Object.fromEntries(entradas));
        })();
        return () => { cancelado = true; };
    }, [courses]);

    /**
     * Abre o construtor de conteúdo.
     *
     * Treinamento nasce PRESENCIAL, e o construtor só faz sentido em EAD/Híbrido.
     * Em vez de esconder o botão (o que deixava o caminho do vídeo indescobrível),
     * pergunta e habilita na hora.
     */
    const abrirConteudo = async (c: TrainingCourse) => {
        const ehEad = c.modalidade && c.modalidade !== 'PRESENCIAL';
        if (ehEad) { onMontarConteudo(c); return; }

        const ok = await confirm({
            title: 'Habilitar conteúdo a distância?',
            message: `"${c.nome}" está marcado como Presencial, então hoje só aceita registro de participação. Para montar aulas, vídeos e avaliação, ele passa a ser Híbrido — o registro presencial continua funcionando igual.`,
            variant: 'default',
            confirmLabel: 'Habilitar e montar conteúdo',
        });
        if (!ok) return;

        try {
            const atualizado = await trainingsService.updateTrainingCourse(c.id, { modalidade: 'HIBRIDO' });
            onCoursesChange(prev => prev.map(x => x.id === c.id ? atualizado : x));   // §22
            onMontarConteudo(atualizado);
        } catch (e: any) {
            notify('Não foi possível habilitar o conteúdo: ' + (e?.message || ''), 'error');
        }
    };

    const inativar = async (c: TrainingCourse) => {
        const ok = await confirm({
            title: 'Inativar treinamento?',
            message: 'Ele deixa de aparecer como opção para novos registros e atribuições. As evidências já registradas permanecem.',
            variant: 'warning',
            confirmLabel: 'Inativar',
        });
        if (!ok) return;
        await trainingsService.deleteTrainingCourse(c.id);
        onCoursesChange(prev => prev.map(x => x.id === c.id ? { ...x, status: 'INATIVO' } : x));   // §22
        notify('Treinamento inativado.');
    };

    const filtrados = useMemo(() => {
        const termo = search.trim().toLowerCase();
        const base = !termo ? courses : courses.filter(c =>
            c.nome.toLowerCase().includes(termo) ||
            (c.nr_referencia || '').toLowerCase().includes(termo));

        if (!colunas.sortColumn) return base;
        const dir = colunas.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (colunas.sortColumn) {
                case 'nome':        return dir * a.nome.localeCompare(b.nome);
                case 'categoria':   return dir * a.categoria.localeCompare(b.categoria);
                case 'modalidade':  return dir * (a.modalidade || '').localeCompare(b.modalidade || '');
                case 'nr':          return dir * (a.nr_referencia || '').localeCompare(b.nr_referencia || '');
                case 'carga':       return dir * (a.carga_horaria - b.carga_horaria);
                case 'validade':    return dir * ((a.validade_meses ?? -1) - (b.validade_meses ?? -1));
                case 'conteudo':    return dir * (versoes[a.id] || '').localeCompare(versoes[b.id] || '');
                case 'obrigatorio': return dir * (Number(a.is_obrigatorio) - Number(b.is_obrigatorio));
                default: return 0;
            }
        });
    }, [courses, search, colunas.sortColumn, colunas.sortDirection, versoes]);

    const th = 'px-6 py-2 border-r border-gray-100';
    const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-white">
                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                    <div className="flex-1 relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar treinamento ou NR..."
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
                        onClick={handleNewCourse}
                        disabled={!podeEditar}
                        title={!podeEditar ? 'Você não tem permissão para editar o catálogo' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 shrink-0 disabled:opacity-50"
                    >
                        <Plus className="w-[15px] h-[15px]" /> Novo treinamento
                    </button>
                </div>
            </div>

            {carregando ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                    <p className="mt-2 text-gray-500">Carregando...</p>
                </div>
            ) : filtrados.length === 0 ? (
                <div className="text-center py-12">
                    <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum treinamento cadastrado</h3>
                    <p className="text-sm text-gray-500">
                        Cadastre um treinamento para registrar participação ou montar conteúdo EAD.
                    </p>
                </div>
            ) : (
                <div className="overflow-auto max-h-[70vh]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                {COLUMNS.filter(c => c.key !== 'actions' && colunas.visibleColumns.includes(c.key)).map(c => (
                                    <SortableHeader
                                        key={c.key}
                                        label={c.label}
                                        colKey={c.key}
                                        uppercase={false}
                                        sortColumn={colunas.sortColumn}
                                        sortDirection={colunas.sortDirection}
                                        onSort={colunas.handleColumnSort}
                                        className={th}
                                    />
                                ))}
                                {colunas.visibleColumns.includes('actions') && (
                                    <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filtrados.map(c => {
                                const cat = CAT_CONFIG[c.categoria];
                                const ead = c.modalidade && c.modalidade !== 'PRESENCIAL';
                                return (
                                    <tr key={c.id} className="hover:bg-blue-50/50 transition-colors">
                                        {colunas.visibleColumns.includes('nome') && (
                                            <td className={td}>
                                                <p className="text-gray-900">{c.nome}</p>
                                                {c.instrutor && <p className="text-xs text-gray-400">{c.instrutor}</p>}
                                            </td>
                                        )}
                                        {colunas.visibleColumns.includes('categoria') && (
                                            <td className={td}>
                                                <span className={cat?.color ?? 'text-gray-600'}>{cat?.label ?? c.categoria}</span>
                                            </td>
                                        )}
                                        {colunas.visibleColumns.includes('modalidade') && (
                                            <td className={`${td} text-gray-600`}>
                                                {MODALIDADE_LABEL[c.modalidade || 'PRESENCIAL']}
                                            </td>
                                        )}
                                        {colunas.visibleColumns.includes('nr') && (
                                            <td className={`${td} text-rose-600`}>{c.nr_referencia || '—'}</td>
                                        )}
                                        {colunas.visibleColumns.includes('carga') && (
                                            <td className={`${td} text-gray-600`}>{c.carga_horaria}h</td>
                                        )}
                                        {colunas.visibleColumns.includes('validade') && (
                                            <td className={`${td} text-gray-500`}>
                                                {c.validade_meses ? `${c.validade_meses} meses` : 'Sem validade'}
                                            </td>
                                        )}
                                        {colunas.visibleColumns.includes('conteudo') && (
                                            <td className={td}>
                                                {/* Explica em vez de omitir: "—" não dizia se faltava
                                                    conteúdo ou se o treinamento nem aceita conteúdo. */}
                                                {!ead ? <span className="text-gray-400">Presencial — sem conteúdo</span>
                                                    : versoes[c.id] === 'rascunho'
                                                        ? <span className="text-amber-700">Rascunho — não publicado</span>
                                                        : versoes[c.id]
                                                            ? <span className="text-emerald-700">{versoes[c.id]}</span>
                                                            : <span className="text-gray-400">Sem conteúdo</span>}
                                            </td>
                                        )}
                                        {colunas.visibleColumns.includes('obrigatorio') && (
                                            <td className={td}>
                                                {c.is_obrigatorio ? (
                                                    <span className="flex items-center gap-1 text-rose-700">
                                                        <Shield className="w-3.5 h-3.5" /> Sim
                                                    </span>
                                                ) : <span className="text-gray-400">Não</span>}
                                            </td>
                                        )}
                                        {colunas.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* Sempre visível, inclusive em treinamento presencial: antes o
                                                        botão simplesmente não existia, e não havia como descobrir
                                                        que o caminho do conteúdo passava por trocar a modalidade. */}
                                                    <button
                                                        onClick={() => abrirConteudo(c)}
                                                        disabled={!podeEditar}
                                                        title={!podeEditar ? 'Você não tem permissão para editar o catálogo' : undefined}
                                                        className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-40 disabled:hover:bg-transparent"
                                                    >
                                                        <Layers className="w-4 h-4" /> Montar conteúdo
                                                    </button>
                                                    <ActionIconButton
                                                        kind="edit"
                                                        onClick={() => { setSheetOrgId(c.org_id); setSheet({ course: c }); }}
                                                        disabled={!podeEditar}
                                                    />
                                                    <ActionIconButton
                                                        kind="delete"
                                                        title="Inativar"
                                                        onClick={() => inativar(c)}
                                                        disabled={!podeEditar || c.status === 'INATIVO'}
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

            {sheet && sheetOrgId && (
                <AcademyCourseSheet
                    open
                    onClose={() => setSheet(null)}
                    orgId={sheetOrgId}
                    course={sheet.course}
                    cargos={cargos}
                    onSaved={(salvo, criado) => {
                        onCoursesChange(prev => criado
                            ? [...prev, salvo]
                            : prev.map(x => x.id === salvo.id ? salvo : x));   // §22
                        notify(criado ? 'Treinamento criado.' : 'Treinamento atualizado.');
                    }}
                    notify={notify}
                />
            )}

            {orgTargetModal}
        </div>
    );
};

export default AcademyCatalogTab;
