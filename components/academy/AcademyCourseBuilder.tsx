import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft, BookOpen, ClipboardList, FileText, Loader2, Plus, Send, Archive,
    PlayCircle, Paperclip, Info,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import AcademyLessonSheet from './AcademyLessonSheet';
import AcademyMaterialsPanel from './AcademyMaterialsPanel';
import AcademyQuestionBankPanel from './AcademyQuestionBankPanel';
import { academyService } from '../../services/academyService';
import type {
    AcademyCourseVersion, AcademyLesson, AcademyModule, TrainingCourse,
} from '../../types/academy';

/**
 * Construtor de conteúdo — TELA (troca in-flow no padrão ContractDetailView:
 * seta de voltar + <h1>, sem overlay, sidebar visível). É fluxo longo e
 * multi-nível; UI_PATTERNS §3 manda página, não Sheet.
 *
 * Publicar não altera o passado: arquiva a versão vigente e cria a nova. As
 * matrículas e certificados da anterior permanecem intactos.
 */

type Aba = 'conteudo' | 'materiais' | 'avaliacoes' | 'regras';

const ABAS: Array<{ id: Aba; label: string }> = [
    { id: 'conteudo',   label: 'Conteúdo' },
    { id: 'materiais',  label: 'Materiais' },
    { id: 'avaliacoes', label: 'Avaliações' },
    { id: 'regras',     label: 'Regras de conclusão' },
];

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

interface Props {
    course: TrainingCourse;
    orgId: string;
    podeEditar: boolean;
    onVoltar: () => void;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcademyCourseBuilder: React.FC<Props> = ({ course, orgId, podeEditar, onVoltar, notify }) => {
    const confirm = useConfirm();
    const [aba, setAba] = useState<Aba>('conteudo');
    const [carregando, setCarregando] = useState(true);
    const [versoes, setVersoes] = useState<AcademyCourseVersion[]>([]);
    const [versaoId, setVersaoId] = useState<string | null>(null);
    const [modulos, setModulos] = useState<AcademyModule[]>([]);
    const [aulas, setAulas] = useState<AcademyLesson[]>([]);
    const [aulaSheet, setAulaSheet] = useState<{ lesson: AcademyLesson | null; moduleId?: string } | null>(null);
    const [publicando, setPublicando] = useState(false);

    const versao = useMemo(() => versoes.find(v => v.id === versaoId) ?? null, [versoes, versaoId]);
    const somenteLeitura = !podeEditar || versao?.status !== 'RASCUNHO';

    const carregarVersoes = useCallback(async (preferir?: string) => {
        const lista = await academyService.listVersions(course.id);
        setVersoes(lista);
        const escolhida = preferir
            ?? lista.find(v => v.status === 'RASCUNHO')?.id
            ?? lista.find(v => v.status === 'PUBLICADA')?.id
            ?? lista[0]?.id
            ?? null;
        setVersaoId(escolhida);
        return escolhida;
    }, [course.id]);

    const carregarEstrutura = useCallback(async (vId: string) => {
        const [mods, les] = await Promise.all([
            academyService.listModules(vId),
            academyService.listLessons(vId),
        ]);
        setModulos(mods);
        setAulas(les);
    }, []);

    useEffect(() => {
        (async () => {
            setCarregando(true);
            try {
                const escolhida = await carregarVersoes();
                if (escolhida) await carregarEstrutura(escolhida);
            } catch (e: any) {
                notify('Erro ao carregar o conteúdo: ' + (e?.message || ''), 'error');
            } finally {
                setCarregando(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [course.id]);

    useEffect(() => {
        if (versaoId) void carregarEstrutura(versaoId);
    }, [versaoId, carregarEstrutura]);

    // ── Ações de versão ─────────────────────────────────────────────────

    const abrirRascunho = async () => {
        try {
            const novaId = await academyService.ensureDraftVersion(course.id);
            await carregarVersoes(novaId);
            await carregarEstrutura(novaId);
            notify('Rascunho aberto.');
        } catch (e: any) {
            notify('Erro ao abrir rascunho: ' + (e?.message || ''), 'error');
        }
    };

    const publicar = async () => {
        if (!versaoId) return;
        setPublicando(true);
        try {
            const p = await academyService.getPublishPreview(versaoId);

            // Bloco de contexto antes de decisão de alto impacto (§6.2).
            const linhas = [
                `Versão ${p.versao} · ${p.modulos} módulo(s) · ${p.aulas} aula(s) · ${p.provas} avaliação(ões)`,
                p.reciclagens > 0
                    ? `${p.reciclagens} colaborador(es) que já concluíram serão matriculados em reciclagem.`
                    : 'Nenhuma reciclagem será gerada.',
                p.em_andamento > 0
                    ? (p.migrar_em_andamento
                        ? `${p.em_andamento} matrícula(s) em andamento serão migradas para esta versão.`
                        : `${p.em_andamento} matrícula(s) em andamento continuarão na versão antiga.`)
                    : null,
                'A versão vigente será arquivada. Nenhuma evidência anterior é apagada.',
            ].filter(Boolean);

            const ok = await confirm({
                title: 'Publicar esta versão?',
                message: linhas.join('\n'),
                variant: 'warning',
                confirmLabel: 'Publicar',
            });
            if (!ok) return;

            const r = await academyService.publishVersion(versaoId);
            await carregarVersoes(versaoId);
            notify(`Versão ${r.versao} publicada. ${r.reciclagens} reciclagem(ns) criada(s).`);
        } catch (e: any) {
            notify('Não foi possível publicar: ' + (e?.message || ''), 'error');
        } finally {
            setPublicando(false);
        }
    };

    const arquivar = async () => {
        if (!versaoId) return;
        const ok = await confirm({
            title: 'Arquivar esta versão?',
            message: 'O conteúdo sai de circulação para novas matrículas. As evidências e certificados já emitidos permanecem válidos.',
            variant: 'warning',
            confirmLabel: 'Arquivar',
        });
        if (!ok) return;
        await academyService.archiveVersion(versaoId);
        await carregarVersoes(versaoId);
        notify('Versão arquivada.');
    };

    // ── Módulos e aulas ─────────────────────────────────────────────────

    const criarModulo = async () => {
        if (!versaoId) return;
        try {
            const m = await academyService.createModule({
                org_id: orgId, version_id: versaoId,
                titulo: `Módulo ${modulos.length + 1}`,
                ordem: modulos.length, obrigatorio: true,
            });
            setModulos(prev => [...prev, m]);   // §22: atualiza array local
        } catch (e: any) {
            notify('Erro ao criar módulo: ' + (e?.message || ''), 'error');
        }
    };

    const renomearModulo = async (m: AcademyModule, titulo: string) => {
        setModulos(prev => prev.map(x => x.id === m.id ? { ...x, titulo } : x));
        try {
            await academyService.updateModule(m.id, { titulo });
        } catch {
            notify('Não foi possível renomear o módulo.', 'error');
        }
    };

    const excluirModulo = async (m: AcademyModule) => {
        const qtd = aulas.filter(a => a.module_id === m.id).length;
        const ok = await confirm({
            title: 'Excluir módulo?',
            message: qtd > 0
                ? `O módulo "${m.titulo}" e suas ${qtd} aula(s) serão removidos deste rascunho.`
                : `O módulo "${m.titulo}" será removido deste rascunho.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        await academyService.deleteModule(m.id);
        setModulos(prev => prev.filter(x => x.id !== m.id));
        setAulas(prev => prev.filter(a => a.module_id !== m.id));
    };

    const excluirAula = async (a: AcademyLesson) => {
        const ok = await confirm({
            title: 'Excluir aula?',
            message: `"${a.titulo}" será removida deste rascunho.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        await academyService.deleteLesson(a.id);
        setAulas(prev => prev.filter(x => x.id !== a.id));
        // A mídia é reaproveitada entre versões — só apaga se ninguém mais usa.
        if (a.storage_path && a.storage_path !== 'pendente') {
            await academyService.deleteMediaIfUnused(a.storage_path).catch(() => undefined);
        }
    };

    const salvarRegra = async <K extends keyof AcademyCourseVersion>(campo: K, valor: AcademyCourseVersion[K]) => {
        if (!versaoId) return;
        setVersoes(prev => prev.map(v => v.id === versaoId ? { ...v, [campo]: valor } : v));
        try {
            await academyService.updateVersion(versaoId, { [campo]: valor } as Partial<AcademyCourseVersion>);
        } catch {
            notify('Não foi possível salvar a regra.', 'error');
        }
    };

    // ── Render ──────────────────────────────────────────────────────────

    const Cabecalho = (
        <div className="flex items-center gap-4">
            <button
                onClick={onVoltar}
                className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 group shrink-0"
            >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            </button>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-blue-600 truncate">Montar conteúdo</span>
                    {course.nr_referencia && (
                        <>
                            <span className="w-1 h-1 bg-gray-300 rounded-full shrink-0" />
                            <span className="text-xs font-medium text-rose-600">{course.nr_referencia}</span>
                        </>
                    )}
                </div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-tight truncate">{course.nome}</h1>
            </div>

            {versoes.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0">
                    <select
                        value={versaoId ?? ''}
                        onChange={e => setVersaoId(e.target.value)}
                        className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none"
                    >
                        {versoes.map(v => (
                            <option key={v.id} value={v.id}>
                                v{v.versao} — {v.status === 'RASCUNHO' ? 'rascunho'
                                    : v.status === 'PUBLICADA' ? 'vigente' : 'arquivada'}
                            </option>
                        ))}
                    </select>

                    {versao?.status === 'RASCUNHO' && (
                        <button
                            onClick={publicar}
                            disabled={!podeEditar || publicando}
                            title={!podeEditar ? 'Você não tem permissão para publicar' : undefined}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                        >
                            {publicando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Send className="w-[15px] h-[15px]" />}
                            Publicar versão
                        </button>
                    )}

                    {versao?.status === 'PUBLICADA' && (
                        <>
                            <button
                                onClick={abrirRascunho}
                                disabled={!podeEditar}
                                title={!podeEditar ? 'Você não tem permissão para editar' : undefined}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                            >
                                <Plus className="w-[15px] h-[15px]" /> Nova versão
                            </button>
                            <ActionIconButton kind="delete" icon={<Archive className="w-4 h-4" />} title="Arquivar" onClick={arquivar} />
                        </>
                    )}
                </div>
            )}
        </div>
    );

    if (carregando) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500 pb-4">
                {Cabecalho}
                <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                    <p className="mt-2 text-gray-500">Carregando conteúdo...</p>
                </div>
            </div>
        );
    }

    if (!versao) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500 pb-4">
                {Cabecalho}
                <div className="text-center py-12">
                    <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Este treinamento ainda não tem conteúdo</h3>
                    <p className="text-sm text-gray-500 mb-6">
                        Crie a primeira versão para montar módulos, aulas e avaliações.
                    </p>
                    <button
                        onClick={abrirRascunho}
                        disabled={!podeEditar}
                        title={!podeEditar ? 'Você não tem permissão para editar' : undefined}
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                    >
                        <Plus className="w-[15px] h-[15px]" /> Criar primeira versão
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-4">
            {Cabecalho}

            {somenteLeitura && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-[10px] flex items-start gap-3">
                    <Info className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                    <p className="text-xs font-medium text-gray-600">
                        {versao.status === 'PUBLICADA'
                            ? 'Esta é a versão vigente e não pode ser editada. Crie uma nova versão para alterar o conteúdo — a evidência de quem já concluiu fica preservada.'
                            : versao.status === 'ARQUIVADA'
                                ? 'Versão arquivada, mantida apenas como evidência.'
                                : 'Você não tem permissão para editar este conteúdo.'}
                    </p>
                </div>
            )}

            {/* Toolbar de abas (§19.1) */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {ABAS.map(a => (
                        <button
                            key={a.id}
                            onClick={() => setAba(a.id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                aba === a.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>

            {aba === 'conteudo' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-end">
                        <button
                            onClick={criarModulo}
                            disabled={somenteLeitura}
                            title={somenteLeitura ? 'Versão não editável' : undefined}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Novo módulo
                        </button>
                    </div>

                    {modulos.length === 0 ? (
                        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm text-center py-12">
                            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum módulo criado</h3>
                            <p className="text-sm text-gray-500">Comece criando um módulo e adicione as aulas nele.</p>
                        </div>
                    ) : modulos.map(m => {
                        const doModulo = aulas.filter(a => a.module_id === m.id).sort((a, b) => a.ordem - b.ordem);
                        return (
                            <div key={m.id} className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                                    <input
                                        value={m.titulo}
                                        onChange={e => renomearModulo(m, e.target.value)}
                                        disabled={somenteLeitura}
                                        className="flex-1 px-2 py-1 bg-transparent border border-transparent hover:border-gray-200 focus:border-blue-500 rounded-[6px] text-sm font-medium text-gray-900 outline-none transition-all disabled:hover:border-transparent"
                                    />
                                    <span className="text-sm font-normal text-gray-400 shrink-0">
                                        {doModulo.length} aula{doModulo.length === 1 ? '' : 's'}
                                    </span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            onClick={() => setAulaSheet({ lesson: null, moduleId: m.id })}
                                            disabled={somenteLeitura}
                                            className="flex items-center gap-1.5 h-8 px-2.5 rounded-[6px] text-sm font-medium text-blue-600 hover:bg-blue-50 transition-all disabled:opacity-40"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Aula
                                        </button>
                                        <ActionIconButton
                                            kind="delete"
                                            onClick={() => excluirModulo(m)}
                                            disabled={somenteLeitura}
                                        />
                                    </div>
                                </div>

                                {doModulo.length === 0 ? (
                                    <p className="px-4 py-6 text-sm font-normal text-gray-400 text-center">
                                        Nenhuma aula neste módulo.
                                    </p>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {doModulo.map(a => (
                                            <div key={a.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-blue-50/50 transition-colors">
                                                <PlayCircle className="w-4 h-4 text-gray-400 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-normal text-gray-900 truncate">{a.titulo}</p>
                                                    <p className="text-xs text-gray-400">
                                                        {a.tipo.replace('_', ' ').toLowerCase()}
                                                        {a.duracao_segundos ? ` · ${Math.round(a.duracao_segundos / 60)} min` : ''}
                                                        {!a.obrigatoria ? ' · opcional' : ''}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <ActionIconButton
                                                        kind="edit"
                                                        onClick={() => setAulaSheet({ lesson: a })}
                                                        disabled={somenteLeitura}
                                                    />
                                                    <ActionIconButton
                                                        kind="delete"
                                                        onClick={() => excluirAula(a)}
                                                        disabled={somenteLeitura}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {aba === 'materiais' && (
                <AcademyMaterialsPanel
                    orgId={orgId}
                    versionId={versao.id}
                    modules={modulos}
                    lessons={aulas}
                    somenteLeitura={somenteLeitura}
                    notify={notify}
                />
            )}

            {aba === 'avaliacoes' && (
                <AcademyQuestionBankPanel
                    orgId={orgId}
                    versionId={versao.id}
                    modules={modulos}
                    somenteLeitura={somenteLeitura}
                    notify={notify}
                />
            )}

            {aba === 'regras' && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6 space-y-5 max-w-2xl">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700">Quando o treinamento conta como concluído</h3>
                        <p className="text-xs text-gray-400 mt-1">
                            Estas regras ficam congeladas nesta versão. Alterá-las não afeta quem já concluiu
                            sob a regra anterior.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">% mínimo do conteúdo</label>
                            <input
                                type="number" min="0" max="100"
                                value={versao.regra_percentual_minimo}
                                onChange={e => salvarRegra('regra_percentual_minimo', parseInt(e.target.value) || 0)}
                                disabled={somenteLeitura}
                                className={inputCls}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">Nota mínima (vazio = sem prova)</label>
                            <input
                                type="number" min="0" max="10" step="0.1"
                                value={versao.regra_nota_minima ?? ''}
                                onChange={e => salvarRegra('regra_nota_minima', e.target.value ? parseFloat(e.target.value) : undefined)}
                                disabled={somenteLeitura}
                                className={inputCls}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">Tentativas por avaliação</label>
                            <input
                                type="number" min="1"
                                value={versao.regra_tentativas_max}
                                onChange={e => salvarRegra('regra_tentativas_max', parseInt(e.target.value) || 1)}
                                disabled={somenteLeitura}
                                className={inputCls}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">Carga horária EAD (h)</label>
                            <input
                                type="number" min="0" step="0.5"
                                value={versao.carga_horaria_ead}
                                onChange={e => salvarRegra('carga_horaria_ead', parseFloat(e.target.value) || 0)}
                                disabled={somenteLeitura}
                                className={inputCls}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500">O que mudou nesta versão</label>
                        <textarea
                            value={versao.notas_versao ?? ''}
                            onChange={e => salvarRegra('notas_versao', e.target.value)}
                            disabled={somenteLeitura}
                            placeholder="Aparece para quem for fazer a reciclagem."
                            className={inputCls + ' resize-none h-20'}
                        />
                    </div>

                    <div className="space-y-2 border-t border-gray-100 pt-4">
                        {([
                            ['regra_ordem_obrigatoria', 'Exigir ordem das aulas (aula N só abre com a anterior concluída)'],
                            ['regra_exige_aceite', 'Exigir aceite formal ao concluir'],
                            ['exige_reciclagem', 'Publicar esta versão obriga reciclagem de quem concluiu a anterior'],
                            ['migrar_em_andamento', 'Migrar matrículas em andamento para esta versão ao publicar'],
                        ] as Array<[keyof AcademyCourseVersion, string]>).map(([campo, label]) => (
                            <label key={campo} className="flex items-start gap-2.5 text-sm font-normal text-gray-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!!versao[campo]}
                                    onChange={e => salvarRegra(campo, e.target.checked as never)}
                                    disabled={somenteLeitura}
                                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600"
                                />
                                {label}
                            </label>
                        ))}
                    </div>

                    {versao.regra_exige_aceite && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">Texto do aceite</label>
                            <textarea
                                value={versao.regra_texto_aceite ?? ''}
                                onChange={e => salvarRegra('regra_texto_aceite', e.target.value)}
                                disabled={somenteLeitura}
                                placeholder="Declaro que participei do treinamento e compreendi o conteúdo apresentado."
                                className={inputCls + ' resize-none h-20'}
                            />
                        </div>
                    )}
                </div>
            )}

            {aulaSheet && versao && (
                <AcademyLessonSheet
                    open
                    onClose={() => setAulaSheet(null)}
                    orgId={orgId}
                    courseId={course.id}
                    versionId={versao.id}
                    modules={modulos}
                    lesson={aulaSheet.lesson}
                    defaultModuleId={aulaSheet.moduleId}
                    onSaved={salva => {
                        setAulas(prev => prev.some(a => a.id === salva.id)
                            ? prev.map(a => a.id === salva.id ? salva : a)
                            : [...prev, salva]);
                        notify(aulaSheet.lesson ? 'Aula atualizada.' : 'Aula criada.');
                    }}
                    notify={notify}
                />
            )}
        </div>
    );
};

export default AcademyCourseBuilder;
