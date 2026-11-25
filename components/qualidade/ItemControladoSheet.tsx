import React from 'react';
import { BookOpen, ClipboardList, FileText, GraduationCap, Hash, Lock, Search, Upload, X } from 'lucide-react';
import type {
    ItemControlado, OrigemItem, ProcedimentoResumo, RegistroTreinamento, SituacaoItem, TipoItemControlado,
} from '../../types/qualidadeSiac';
import type { TrainingCourse } from '../../types/academy';
import type { SinapiItem } from '../../types/budget';
import { qualidadeSiacService } from '../../services/qualidadeSiacService';
import { trainingsService } from '../../services/trainingsService';
import { documentService } from '../../services/documentService';
import { laborService, type Employee } from '../../services/laborService';
import {
    errorMessage, forEachTargetOrg, partialFailureNote, targetOrgIds, type WriteTarget,
} from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { useConfirm } from '../ui/confirm';
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetTitle } from '../ui/sheet';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import SaveStatus from '../ui/SaveStatus';
import { DocumentPicker } from '../ui/DocumentPicker';
import DatabasePickerModal from '../DatabasePickerModal';
import {
    empreiteiraDaFicha, motivoDoProcedimentoNaoContar, rotuloDoProcedimento, treinamentoVigente,
} from '../../utils/qualidadeSiac';
import { MOTIVO_SEM_EDICAO_QUALIDADE } from '../../utils/permissaoQualidadeSiac';
import { ROTULO_ORIGEM } from './ListaControlada';

/**
 * Sheet do item controlado (serviço ou material) do SiAC — fase 1
 * (docs/planos/2026-11-25-qualidade-siac-pbqph.md, "Telas (rascunho)").
 *
 * Dois modos (`EdicaoDoItem`, produzido pelo `QualidadeModule`):
 *  - **novo**: só nome, etapa e origem. O alvo já veio resolvido (`resolveWriteOrg('all-allowed')`);
 *    mantida "Todas", cria em cada organização (`forEachTargetOrg`). Criar fecha o Sheet (§25).
 *  - **editar**: o item inteiro. A organização é a do PRÓPRIO item (`item.organization_id`), nunca
 *    perguntada: o GED, os cursos e as pessoas são todos dessa organização. Salvar NÃO fecha (§25).
 *
 * Gravação:
 *  - Os dados do item (nome, etapa, origem, substitui, situação, justificativa) vão no "Salvar".
 *  - Procedimento, curso e códigos gravam NA HORA (são vínculos: escolher já é a decisão) e pedem a
 *    recarga ao módulo (`onSaved`, que devolve a Promise da recarga). Uma gravação de cada vez: a
 *    próxima só é liberada depois que a recarga terminou.
 *  - Toda gravação de vínculo parte do ÚLTIMO estado confirmado, que o Sheet guarda (`vinculos`):
 *    `definirCodigos` troca o conjunto inteiro, então montar a lista a partir de um item velho
 *    (recarga que ainda não chegou, item que saiu da lista do topo) apagaria o que já foi gravado.
 *    A cada item novo vindo da recarga, o estado local passa a ser o dele.
 *  - Dispensar e arquivar pedem justificativa (é a prova perante o SiAC; arquivar não pode tirar um
 *    item do Anexo 4 do N sem explicação) e o texto é GUARDADO — só voltar a Ativo o limpa.
 *  - O banco recusa DISPENSADO sem justificativa (CHECK; ARQUIVADO é só pela tela) e referência de outra organização (42501):
 *    o erro sobe no toast, com a mensagem do banco.
 */
export type EdicaoDoItem =
    | { modo: 'editar'; item: ItemControlado }
    | { modo: 'novo'; tipo: TipoItemControlado; alvo: WriteTarget };

interface Props {
    /** `null` = fechado. */
    edicao: EdicaoDoItem | null;
    /** Itens da organização do item (para "substitui o item nº"). */
    itensDaOrg: ItemControlado[];
    procedimento: ProcedimentoResumo | null;
    treinamentos: RegistroTreinamento[];
    podeEditar: boolean;
    onClose(): void;
    /** Pede a recarga ao módulo e devolve a Promise dela. Nunca fecha nada (§25). */
    onSaved(): Promise<void>;
    onRegistrarTreinamento(item: ItemControlado): void;
}

const ROTULO = 'block text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-700 disabled:cursor-not-allowed transition-all';
const AREA = 'w-full px-3 py-2 min-h-[72px] bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-700 disabled:cursor-not-allowed transition-all';
const COM_ERRO = 'border-red-300 focus:border-red-500 focus:ring-red-500/20';
const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shrink-0';
const BOTAO_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white text-gray-700 border border-gray-200 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
const BOTAO_VOLTAR = 'h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]';
const CARTAO = 'bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4';

const TEXTO_DO_TIPO: Record<TipoItemControlado, {
    nome: string; novo: string; criar: string; criado: string; base: string; baseSub: string; semNome: string;
}> = {
    SERVICO: {
        nome: 'Serviço', novo: 'Novo serviço controlado', criar: 'Criar serviço', criado: 'Serviço criado',
        base: 'Buscar composição na Base', baseSub: 'Escolha as composições que executam este serviço.',
        semNome: 'Dê um nome ao serviço.',
    },
    MATERIAL: {
        nome: 'Material', novo: 'Novo material controlado', criar: 'Criar material', criado: 'Material criado',
        base: 'Buscar insumo na Base', baseSub: 'Escolha os insumos que correspondem a este material.',
        semNome: 'Dê um nome ao material.',
    },
};

/** Origem de item novo: o Anexo 4 só entra pela carga da lista mínima. */
const ORIGENS_NOVAS: OrigemItem[] = ['PROPRIO', 'CLIENTE', 'FAD_DATEC'];

const ROTULO_SITUACAO: Record<SituacaoItem, string> = { ATIVO: 'Ativo', DISPENSADO: 'Dispensado', ARQUIVADO: 'Arquivado' };

const MOTIVO_SEM_CURSO = 'Escolha o curso de treinamento primeiro';
const MOTIVO_SEM_ALTERACAO = 'Nada a salvar: nenhum campo mudou.';
const MOTIVO_OCUPADO = 'Aguarde: a gravação anterior ainda não terminou.';

/** O que grava na hora: o Sheet guarda o último estado confirmado (ver o topo do arquivo). */
type Vinculos = Pick<ItemControlado, 'codigos' | 'procedure_document_id' | 'training_course_id'>;
const vinculosDe = (i: ItemControlado): Vinculos => ({
    codigos: i.codigos, procedure_document_id: i.procedure_document_id, training_course_id: i.training_course_id,
});

type Falha = string | ((erro: string) => string);
type Vincular = (acao: () => Promise<unknown>, sucesso: string, falha: Falha) => Promise<boolean>;

interface Form {
    nome: string;
    etapa: string;
    origem: OrigemItem;
    substitui_item_id: string;
    situacao: SituacaoItem;
    justificativa: string;
}

const formDoItem = (i: ItemControlado): Form => ({
    nome: i.nome,
    etapa: i.etapa ?? '',
    origem: i.origem,
    substitui_item_id: i.substitui_item_id ?? '',
    situacao: i.situacao,
    justificativa: i.justificativa ?? '',
});

const FORM_NOVO: Form = { nome: '', etapa: '', origem: 'PROPRIO', substitui_item_id: '', situacao: 'ATIVO', justificativa: '' };

const mesmoForm = (a: Form, b: Form) =>
    a.nome === b.nome && a.etapa === b.etapa && a.origem === b.origem && a.substitui_item_id === b.substitui_item_id
    && a.situacao === b.situacao && a.justificativa === b.justificativa;

const dataBr = (iso: string) => {
    const [a, m, d] = iso.slice(0, 10).split('-');
    return a && m && d ? `${d}/${m}/${a}` : iso;
};

const ErroDoCampo: React.FC<{ id: string; erro?: string }> = ({ id, erro }) =>
    erro ? <p id={id} className="text-xs text-red-600 mt-1">{erro}</p> : null;

export const ItemControladoSheet: React.FC<Props> = (props) => {
    const { showToast, localToast } = useToast();
    const { edicao } = props;
    const chave = edicao === null ? null : edicao.modo === 'editar' ? `editar:${edicao.item.id}` : 'novo';
    return (
        <>
            {edicao !== null && <SheetDoItem key={chave} {...props} edicao={edicao} showToast={showToast} />}
            {/* §13 — com o ToastProvider na raiz `localToast` vem null; sem provider (teste) aparece aqui,
                fora do Sheet, para o aviso de "criado" sobreviver ao fechar. */}
            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {localToast.message}
                </div>
            )}
        </>
    );
};

type PropsInternas = Omit<Props, 'edicao'> & {
    edicao: EdicaoDoItem;
    showToast: (m: string, t?: 'success' | 'error') => void;
};

const SheetDoItem: React.FC<PropsInternas> = ({
    edicao, itensDaOrg, procedimento, treinamentos, podeEditar, onClose, onSaved, onRegistrarTreinamento, showToast,
}) => {
    const confirm = useConfirm();
    const organizations = useStore(s => s.organizations);
    const emailUsuario = useStore(s => s.currentProfile.email);
    const item = edicao.modo === 'editar' ? edicao.item : null;
    const tipo: TipoItemControlado = edicao.modo === 'editar' ? edicao.item.tipo : edicao.tipo;
    const texto = TEXTO_DO_TIPO[tipo];
    const nomeOrg = (id: string) => organizations.find(o => o.id === id)?.name ?? 'organização';

    // ── Formulário (dirty por comparação com o último estado salvo — §25) ──
    // O Sheet é remontado por item (`key`): o estado inicial é o do item na abertura, não o de cada recarga.
    const [inicial] = React.useState<Form>(() => (item ? formDoItem(item) : FORM_NOVO));
    const [salvo, setSalvo] = React.useState<Form>(inicial);
    const [form, setForm] = React.useState<Form>(inicial);
    const [erros, setErros] = React.useState<{ nome?: string; justificativa?: string }>({});
    const [salvando, setSalvando] = React.useState(false);
    const [savedAt, setSavedAt] = React.useState<number | null>(null);
    const dirty = !mesmoForm(form, salvo);
    const set = <K extends keyof Form>(k: K, v: Form[K]) => {
        setForm(f => ({ ...f, [k]: v }));
        if (k === 'nome' || k === 'justificativa' || k === 'situacao') setErros(e => ({ ...e, [k === 'situacao' ? 'justificativa' : k]: undefined }));
    };

    // Vínculos que gravam na hora (procedimento, curso, códigos): um de cada vez — o ref barra o
    // segundo clique antes mesmo de o estado `vinculando` chegar à tela.
    const [vinculando, setVinculando] = React.useState(false);
    const vinculandoRef = React.useRef(false);
    const ocupado = salvando || vinculando;

    const [vinculos, setVinculos] = React.useState<Vinculos | null>(() => (item ? vinculosDe(item) : null));
    // Item novo da recarga (o módulo só troca o item quando a lista recarregada o traz): passa a valer.
    React.useEffect(() => { if (item) setVinculos(vinculosDe(item)); }, [item]);
    const aplicar = React.useCallback((p: Partial<Vinculos>) => setVinculos(v => (v ? { ...v, ...p } : v)), []);
    const atual: ItemControlado | null = item && vinculos ? { ...item, ...vinculos } : null;

    const fechar = async () => {
        if (dirty && !(await confirm({
            title: 'Sair sem salvar?',
            message: 'Há alterações não salvas. Se sair agora, elas serão perdidas.',
            variant: 'warning', confirmLabel: 'Sair e descartar', cancelLabel: 'Continuar editando',
        }))) return;
        onClose();
    };

    const validar = (): boolean => {
        const e: { nome?: string; justificativa?: string } = {};
        if (!form.nome.trim()) e.nome = texto.semNome;
        if (form.situacao === 'DISPENSADO' && !form.justificativa.trim()) e.justificativa = 'Escreva por que o item foi dispensado.';
        if (form.situacao === 'ARQUIVADO' && !form.justificativa.trim()) e.justificativa = 'Escreva por que o item foi arquivado.';
        setErros(e);
        const primeiro = e.nome ? 'qi-nome' : e.justificativa ? 'qi-justificativa' : null;
        if (primeiro) document.getElementById(primeiro)?.focus();
        return primeiro === null;
    };

    const criar = async (alvo: WriteTarget) => {
        if (!validar()) return;
        setSalvando(true);
        try {
            const input = { tipo, nome: form.nome.trim(), etapa: form.etapa.trim() || null, origem: form.origem };
            const { ok, failed } = await forEachTargetOrg(alvo, org => qualidadeSiacService.criarItem(org, input));
            if (ok === 0) {
                showToast(`Não foi possível criar: ${errorMessage(failed[0]?.error, 'erro desconhecido')}`, 'error');
                return;
            }
            const nota = partialFailureNote(failed);
            showToast(`${texto.criado}${ok > 1 ? ` em ${ok} organizações` : ''}${nota ? ` (${nota})` : ''}.`, 'success');
            await onSaved();
            onClose();
        } finally {
            setSalvando(false);
        }
    };

    const salvar = async (atual: ItemControlado) => {
        if (!validar()) return;
        setSalvando(true);
        try {
            // Dispensado e arquivado guardam a justificativa (prova perante o SiAC); só Ativo a limpa.
            const justificativa = form.situacao === 'ATIVO' ? null : form.justificativa.trim();
            await qualidadeSiacService.atualizarItem(atual.id, {
                nome: form.nome.trim(),
                etapa: form.etapa.trim() || null,
                origem: form.origem,
                substitui_item_id: form.substitui_item_id || null,
                situacao: form.situacao,
                justificativa,
            });
            const gravado = { ...form, nome: form.nome.trim(), etapa: form.etapa.trim(), justificativa: justificativa ?? '' };
            setForm(gravado);
            setSalvo(gravado);
            setSavedAt(Date.now());
            showToast(`${texto.nome} salvo.`, 'success');
            await onSaved();
        } catch (e) {
            showToast(`Não foi possível salvar: ${errorMessage(e, 'erro desconhecido')}`, 'error');
        } finally {
            setSalvando(false);
        }
    };

    /**
     * Grava um vínculo na hora e ESPERA a recarga antes de liberar a próxima gravação. A `acao` chama
     * `aplicar` com o que o banco confirmou. Devolve se deu certo.
     */
    const vincular: Vincular = async (acao, sucesso, falha) => {
        if (vinculandoRef.current) return false;
        vinculandoRef.current = true;
        setVinculando(true);
        try {
            try {
                await acao();
            } catch (e) {
                const m = errorMessage(e, 'erro desconhecido');
                showToast(typeof falha === 'function' ? falha(m) : `${falha}: ${m}`, 'error');
                return false;
            }
            showToast(sucesso, 'success');
            await onSaved();
            return true;
        } finally {
            vinculandoRef.current = false;
            setVinculando(false);
        }
    };

    const motivoSalvar = !podeEditar ? MOTIVO_SEM_EDICAO_QUALIDADE
        : ocupado ? MOTIVO_OCUPADO
        : item && !dirty ? MOTIVO_SEM_ALTERACAO
        : undefined;

    const substituiveis = item
        ? itensDaOrg.filter(i => i.organization_id === item.organization_id && i.origem === 'ANEXO4' && i.id !== item.id)
            .sort((a, b) => (a.anexo4_numero ?? a.ordem) - (b.anexo4_numero ?? b.ordem))
        : [];
    const origens: OrigemItem[] = ORIGENS_NOVAS.includes(form.origem) ? ORIGENS_NOVAS : [form.origem, ...ORIGENS_NOVAS];
    // Item gravado sempre pode ser arquivado (o "apagar" da tela: sai da lista e do painel, nada se perde) e,
    // arquivado, volta a Ativo pelo mesmo select. Item novo não mostra a situação (nasce Ativo).
    const situacoes: SituacaoItem[] = ['ATIVO', 'DISPENSADO', 'ARQUIVADO'];

    const ondeCria = edicao.modo === 'novo'
        ? edicao.alvo.kind === 'all'
            ? `Será criado em ${targetOrgIds(edicao.alvo).length} organizações.`
            : `Será criado em ${nomeOrg(edicao.alvo.orgId)}.`
        : null;

    return (
        <Sheet open onClose={onClose} size="2xl" dirty={dirty}>
            <SheetHeader onClose={() => void fechar()}>
                <SheetTitle>{item ? item.nome : texto.novo}</SheetTitle>
                <SheetDescription>
                    {item
                        ? `${texto.nome}${item.anexo4_numero ? ` nº ${item.anexo4_numero} do Anexo 4` : ''} · ${nomeOrg(item.organization_id)}`
                        : ondeCria}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-5">
                {!podeEditar && (
                    <p className="flex items-center gap-1.5 text-sm text-gray-700">
                        <Lock className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" /> {MOTIVO_SEM_EDICAO_QUALIDADE}
                    </p>
                )}

                {/* ── Dados do item ── */}
                <div className={CARTAO}>
                    <SecaoTitulo icon={ClipboardList} titulo={`Dados do ${tipo === 'SERVICO' ? 'serviço' : 'material'}`} />
                    <fieldset disabled={!podeEditar || salvando} className="min-w-0 space-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="qi-nome">Nome</label>
                            <input id="qi-nome" className={`${CAMPO} ${erros.nome ? COM_ERRO : ''}`} value={form.nome}
                                aria-invalid={!!erros.nome} aria-describedby={erros.nome ? 'qi-nome-erro' : undefined}
                                onChange={e => set('nome', e.target.value)} />
                            <ErroDoCampo id="qi-nome-erro" erro={erros.nome} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="qi-etapa">Etapa</label>
                                <input id="qi-etapa" className={CAMPO} value={form.etapa} placeholder="Ex.: Estrutura"
                                    onChange={e => set('etapa', e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="qi-origem">Origem</label>
                                <select id="qi-origem" className={CAMPO} value={form.origem}
                                    onChange={e => set('origem', e.target.value as OrigemItem)}>
                                    {origens.map(o => <option key={o} value={o}>{ROTULO_ORIGEM[o]}</option>)}
                                </select>
                            </div>
                        </div>

                        {item && (
                            <>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="qi-substitui">Substitui o item nº</label>
                                    <select id="qi-substitui" className={CAMPO} value={form.substitui_item_id}
                                        onChange={e => set('substitui_item_id', e.target.value)}>
                                        <option value="">Não substitui item do Anexo 4</option>
                                        {/* Valor gravado fora da lista (outro tipo de origem, item que saiu): o select
                                            mostra o que está gravado, e o Salvar não o troca por "não substitui". */}
                                        {form.substitui_item_id && !substituiveis.some(i => i.id === form.substitui_item_id) && (
                                            <option value={form.substitui_item_id}>
                                                {itensDaOrg.find(i => i.id === form.substitui_item_id)?.nome ?? 'Item gravado (fora da lista do Anexo 4)'}
                                            </option>
                                        )}
                                        {substituiveis.map(i => (
                                            <option key={i.id} value={i.id}>{i.anexo4_numero ?? '—'} · {i.nome}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-600">Opcional: quando este item cumpre o papel de um item do Anexo 4.</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="qi-situacao">Situação</label>
                                    <select id="qi-situacao" className={CAMPO} value={form.situacao}
                                        onChange={e => set('situacao', e.target.value as SituacaoItem)}>
                                        {situacoes.map(s => <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>)}
                                    </select>
                                </div>
                                {(form.situacao === 'DISPENSADO' || form.situacao === 'ARQUIVADO') && (
                                    <div className="space-y-1.5">
                                        <label className={ROTULO} htmlFor="qi-justificativa">
                                            {form.situacao === 'ARQUIVADO' ? 'Justificativa do arquivamento' : 'Justificativa da dispensa'}
                                        </label>
                                        <textarea id="qi-justificativa" className={`${AREA} ${erros.justificativa ? COM_ERRO : ''}`}
                                            value={form.justificativa}
                                            placeholder={form.situacao === 'ARQUIVADO'
                                                ? 'Ex.: criado por engano em todas as organizações'
                                                : 'Ex.: a construtora não executa alvenaria estrutural'}
                                            aria-invalid={!!erros.justificativa}
                                            aria-describedby={erros.justificativa ? 'qi-justificativa-erro' : undefined}
                                            onChange={e => set('justificativa', e.target.value)} />
                                        <ErroDoCampo id="qi-justificativa-erro" erro={erros.justificativa} />
                                        {form.situacao === 'ARQUIVADO' && (
                                            <p className="text-xs text-gray-600">
                                                Arquivado sai da lista controlada, do painel do nível e da visão por obra. Para reativar, use
                                                "Mostrar arquivados" acima da tabela, abra o item e volte a situação para Ativo.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </fieldset>
                </div>

                {item && atual && (() => {
                    // As props vêm do item do MÓDULO; valem só se forem do vínculo atual (entre gravar e recarregar,
                    // ou com o item fora da lista do topo, são do anterior).
                    const resumo = procedimento && procedimento.id === atual.procedure_document_id ? procedimento : null;
                    const registros = atual.training_course_id === item.training_course_id ? treinamentos : [];
                    return (
                        <>
                            <SecaoProcedimento item={atual} procedimento={resumo} podeEditar={podeEditar} ocupado={ocupado}
                                emailUsuario={emailUsuario} vincular={vincular} aplicar={aplicar} />
                            <SecaoTreinamento item={atual} treinamentos={registros} versaoAtivaEm={resumo?.versao_ativa_em ?? null}
                                podeEditar={podeEditar} ocupado={ocupado} vincular={vincular} aplicar={aplicar}
                                onRegistrarTreinamento={onRegistrarTreinamento} />
                            <SecaoCodigos item={atual} texto={texto} podeEditar={podeEditar} ocupado={ocupado} vincular={vincular} aplicar={aplicar} />
                        </>
                    );
                })()}
            </SheetPanel>

            <SheetFooter>
                {item && <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />}
                <button type="button" onClick={() => void fechar()} className={BOTAO_VOLTAR}>{item ? 'Voltar' : 'Cancelar'}</button>
                <button type="button" className={BOTAO_PRIMARIO} disabled={motivoSalvar !== undefined} title={motivoSalvar}
                    onClick={() => void (item ? salvar(item) : edicao.modo === 'novo' && criar(edicao.alvo))}>
                    {salvando ? 'Salvando…' : item ? 'Salvar alterações' : texto.criar}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

// ── Procedimento escrito (GED) ──────────────────────────────────────────────
const SecaoProcedimento: React.FC<{
    item: ItemControlado;
    procedimento: ProcedimentoResumo | null;
    podeEditar: boolean;
    ocupado: boolean;
    emailUsuario?: string;
    vincular: Vincular;
    aplicar: (p: Partial<Vinculos>) => void;
}> = ({ item, procedimento, podeEditar, ocupado, emailUsuario, vincular, aplicar }) => {
    const [escolhendo, setEscolhendo] = React.useState(false);
    const arquivoRef = React.useRef<HTMLInputElement>(null);
    const vinculado = item.procedure_document_id !== null;
    // O resumo só vale se for do documento vinculado agora (entre gravar e recarregar, pode ser o anterior).
    const resumo = procedimento && procedimento.id === item.procedure_document_id ? procedimento : null;
    const motivo = !podeEditar ? MOTIVO_SEM_EDICAO_QUALIDADE : ocupado ? MOTIVO_OCUPADO : undefined;

    const escolher = async (docId: string) => {
        if (ocupado) return;
        const ok = await vincular(async () => {
            await qualidadeSiacService.atualizarItem(item.id, { procedure_document_id: docId });
            aplicar({ procedure_document_id: docId });
        }, 'Procedimento vinculado.', 'Não foi possível vincular o procedimento');
        if (ok) setEscolhendo(false);
    };

    const enviar = async (file: File | null) => {
        if (!file) return;
        // Upload e vínculo são dois passos: se só o segundo falha, o documento JÁ está no GED — reenviar
        // duplicaria. A mensagem manda escolher o que foi enviado.
        let enviado = false;
        await vincular(async () => {
            const doc = await documentService.uploadNewDocument({
                organization_id: item.organization_id,
                nome: `Procedimento — ${item.nome}`,
                descricao: `Procedimento escrito do ${item.tipo === 'SERVICO' ? 'serviço' : 'material'} controlado (Qualidade · SiAC)`,
                categoria: 'engenharia',
                tipo_documento: 'Procedimento (SiAC)',
                status: 'ativo',
                alerta_dias_antecedencia: 30,
                tags: ['qualidade-siac'],
            }, file, emailUsuario ?? undefined);
            enviado = true;
            await qualidadeSiacService.atualizarItem(item.id, { procedure_document_id: doc.id });
            aplicar({ procedure_document_id: doc.id });
        }, 'Procedimento enviado ao GED e vinculado.', m => (enviado
            ? `O procedimento foi enviado ao GED, mas não foi possível vinculá-lo (${m}); escolha-o em "Escolher do GED".`
            : `Não foi possível enviar o procedimento: ${m}`));
        if (arquivoRef.current) arquivoRef.current.value = '';
    };

    const desvincular = () => vincular(async () => {
        await qualidadeSiacService.atualizarItem(item.id, { procedure_document_id: null });
        aplicar({ procedure_document_id: null });
    },
        'Procedimento desvinculado (o documento continua no GED).', 'Não foi possível desvincular o procedimento');

    return (
        <div className={CARTAO}>
            <SecaoTitulo icon={FileText} titulo="Procedimento escrito" acoes={(
                <>
                    <button type="button" className={BOTAO_SECUNDARIO} disabled={!!motivo} title={motivo}
                        aria-expanded={escolhendo} onClick={() => setEscolhendo(v => !v)}>
                        <Search className="w-[15px] h-[15px]" aria-hidden="true" /> Escolher do GED
                    </button>
                    <button type="button" className={BOTAO_SECUNDARIO} disabled={!!motivo} title={motivo}
                        onClick={() => arquivoRef.current?.click()}>
                        <Upload className="w-[15px] h-[15px]" aria-hidden="true" /> Enviar procedimento
                    </button>
                    <input ref={arquivoRef} type="file" className="hidden" aria-label="Arquivo do procedimento"
                        onChange={e => void enviar(e.target.files?.[0] ?? null)} />
                </>
            )} />
            <p className="text-xs text-gray-600">Escolher ou enviar grava na hora. O documento fica no GED, categoria Engenharia.</p>
            {vinculado ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-gray-900">{resumo ? rotuloDoProcedimento(resumo) : 'Documento vinculado'}</span>
                    <button type="button" className={BOTAO_SECUNDARIO} disabled={!!motivo} title={motivo} onClick={() => void desvincular()}>
                        Desvincular
                    </button>
                </div>
            ) : (
                <p className="text-sm text-gray-700">Sem procedimento vinculado.</p>
            )}
            {vinculado && resumo && motivoDoProcedimentoNaoContar(resumo) !== null && (
                <p className="text-sm text-amber-700">{motivoDoProcedimentoNaoContar(resumo)}</p>
            )}
            {escolhendo && (
                // Durante uma gravação a lista fica desligada (e o `escolher` confere de novo): dois cliques
                // não viram duas gravações.
                <fieldset disabled={ocupado} title={ocupado ? MOTIVO_OCUPADO : undefined} className="min-w-0">
                    <DocumentPicker organizationId={item.organization_id} excludeIntegrated
                        storageKey="qualidade:item:procedimento:busca" onPick={d => void escolher(d.id)} />
                </fieldset>
            )}
        </div>
    );
};

// ── Treinamento (curso) e treinados ─────────────────────────────────────────
const SecaoTreinamento: React.FC<{
    item: ItemControlado;
    treinamentos: RegistroTreinamento[];
    versaoAtivaEm: string | null;
    podeEditar: boolean;
    ocupado: boolean;
    vincular: Vincular;
    aplicar: (p: Partial<Vinculos>) => void;
    onRegistrarTreinamento: (item: ItemControlado) => void;
}> = ({ item, treinamentos, versaoAtivaEm, podeEditar, ocupado, vincular, aplicar, onRegistrarTreinamento }) => {
    const org = item.organization_id;
    const [cursos, setCursos] = React.useState<TrainingCourse[]>([]);
    const [erroCursos, setErroCursos] = React.useState<string | null>(null);
    const [recarga, setRecarga] = React.useState(0);
    React.useEffect(() => {
        let vivo = true;
        setErroCursos(null);
        trainingsService.listTrainingCourses(org)
            .then(l => { if (vivo) setCursos(l); })
            .catch(e => { if (vivo) { setCursos([]); setErroCursos(errorMessage(e, 'erro desconhecido')); } });
        return () => { vivo = false; };
    }, [org, recarga]);

    // Nomes das pessoas: o registro só traz o employee_id. Busca no RH sempre que há registro de alguém
    // cujo nome o Sheet ainda não conhece — não só no primeiro registro: o 2º treinamento em obra pode
    // trazer uma pessoa de empreiteira que acabou de ganhar ficha (antes ela aparecia como "não
    // encontrada"). A dependência é o CONJUNTO dessas pessoas (texto ordenado): quem o RH não devolve
    // é marcado como já procurado e não volta à busca. Enquanto a busca anda, a linha diz "carregando…"
    // (antes dizia "Pessoa não encontrada no RH" até a resposta chegar).
    const [pessoas, setPessoas] = React.useState<Record<string, Employee>>({});
    const [procurados, setProcurados] = React.useState<ReadonlySet<string>>(() => new Set());
    const [erroPessoas, setErroPessoas] = React.useState<string | null>(null);
    const semNome = React.useMemo(
        () => [...new Set(treinamentos.map(r => r.employee_id).filter(id => !pessoas[id] && !procurados.has(id)))].sort().join(','),
        [treinamentos, pessoas, procurados],
    );
    React.useEffect(() => {
        if (!semNome) return;
        let vivo = true;
        const ids = semNome.split(',');
        const marcarProcurados = () => setProcurados(s => new Set([...s, ...ids]));
        setErroPessoas(null);
        // Nomes e "procurados" mudam no MESMO callback (um render só): senão o conjunto mudaria entre os
        // dois e a busca recomeçaria para quem o RH não devolveu.
        laborService.listEmployees(org)
            .then(l => {
                if (!vivo) return;
                setPessoas(p => ({ ...p, ...Object.fromEntries(l.map(e => [e.id, e])) }));
                marcarProcurados();
            })
            .catch(e => {
                if (!vivo) return;
                setErroPessoas(errorMessage(e, 'erro desconhecido'));
                marcarProcurados();
            });
        return () => { vivo = false; };
    }, [org, semNome]);
    const buscandoNome = React.useMemo(() => new Set(semNome ? semNome.split(',') : []), [semNome]);

    const motivo = !podeEditar ? MOTIVO_SEM_EDICAO_QUALIDADE : ocupado ? MOTIVO_OCUPADO : undefined;
    const motivoRegistrar = !podeEditar ? MOTIVO_SEM_EDICAO_QUALIDADE : !item.training_course_id ? MOTIVO_SEM_CURSO : undefined;
    const cursoAtual = cursos.find(c => c.id === item.training_course_id);

    const escolherCurso = (id: string) => vincular(async () => {
        await qualidadeSiacService.atualizarItem(item.id, { training_course_id: id || null });
        aplicar({ training_course_id: id || null });
    },
        id ? 'Curso vinculado.' : 'Curso desvinculado.', 'Não foi possível vincular o curso');

    const criarCurso = async () => {
        // Criar e vincular são dois passos: se só o vínculo falha, o curso JÁ existe no Treinamentos.
        let criado = false;
        await vincular(async () => {
            const novo = await trainingsService.createTrainingCourse({
                org_id: org,
                nome: item.nome,
                categoria: 'QUALIDADE',
                modalidade: 'PRESENCIAL',
                status: 'ATIVO',
                is_obrigatorio: false,
                roles_obrigatorios: [],
                carga_horaria: 1,
            });
            criado = true;
            setRecarga(n => n + 1);
            await qualidadeSiacService.atualizarItem(item.id, { training_course_id: novo.id });
            aplicar({ training_course_id: novo.id });
        }, 'Curso presencial criado e vinculado.', m => (criado
            ? `O curso foi criado no Treinamentos, mas não foi possível vinculá-lo (${m}); escolha-o na lista de cursos.`
            : `Não foi possível criar o curso: ${m}`));
    };

    const linhas = [...treinamentos].sort((a, b) => b.data_realizacao.localeCompare(a.data_realizacao));

    return (
        <div className={CARTAO}>
            <SecaoTitulo icon={GraduationCap} titulo="Treinamento" acoes={(
                <button type="button" className={BOTAO_SECUNDARIO} disabled={!!motivo} title={motivo ?? 'Cria um curso presencial com o nome do item no Treinamentos'}
                    onClick={() => void criarCurso()}>
                    <BookOpen className="w-[15px] h-[15px]" aria-hidden="true" /> Criar curso presencial
                </button>
            )} />
            <div className="space-y-1.5">
                <label className={ROTULO} htmlFor="qi-curso">Curso</label>
                <select id="qi-curso" className={CAMPO} value={item.training_course_id ?? ''} disabled={!!motivo} title={motivo}
                    onChange={e => void escolherCurso(e.target.value)}>
                    <option value="">Sem curso vinculado</option>
                    {item.training_course_id && !cursoAtual && <option value={item.training_course_id}>Curso vinculado</option>}
                    {cursos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <p className="text-xs text-gray-600">Cursos do Treinamentos desta organização. Escolher grava na hora.</p>
                {erroCursos && <p className="text-xs text-red-600">Não foi possível listar os cursos: {erroCursos}</p>}
            </div>

            {/* Treinados — o botão fica ACIMA da lista (§6.14: nada abaixo da lista). */}
            <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-gray-900">Treinados</h4>
                    <button type="button" className={BOTAO_SECUNDARIO} disabled={!!motivoRegistrar} title={motivoRegistrar}
                        onClick={() => onRegistrarTreinamento(item)}>
                        <GraduationCap className="w-[15px] h-[15px]" aria-hidden="true" /> Registrar treinamento em obra
                    </button>
                </div>
                {erroPessoas && <p className="text-xs text-red-600">Não foi possível buscar os nomes no RH: {erroPessoas}</p>}
                {linhas.length === 0 ? (
                    <p className="text-sm text-gray-700">{item.training_course_id ? 'Ninguém tem registro neste curso ainda.' : 'Sem curso, não há treinados.'}</p>
                ) : (
                    <ul className="divide-y divide-gray-100 border border-gray-100 rounded-[8px]">
                        {linhas.map((r, i) => {
                            const p = pessoas[r.employee_id];
                            const emp = empreiteiraDaFicha(p);
                            const situacao = !r.aprovado ? { t: 'não aprovado', c: 'text-red-700' }
                                : versaoAtivaEm === null ? { t: 'sem versão ativa do procedimento', c: 'text-gray-700' }
                                : treinamentoVigente(r, versaoAtivaEm) ? { t: 'revisão vigente', c: 'text-emerald-700' }
                                : { t: 'revisão anterior', c: 'text-amber-700' };
                            return (
                                <li key={`${r.employee_id}-${r.data_realizacao}-${i}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
                                    <span className="min-w-0 truncate text-gray-900">{p?.name ?? (buscandoNome.has(r.employee_id) ? 'carregando…' : 'Pessoa não encontrada no RH')}</span>
                                    <span className="flex flex-wrap items-center gap-x-3 text-gray-700">
                                        <span>{r.externo ? `Empreiteira${emp ? ` · ${emp}` : ''}` : 'Próprio'}</span>
                                        <span>{dataBr(r.data_realizacao)}</span>
                                        <span className={situacao.c}>{situacao.t}</span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
};

// ── Códigos da Base ─────────────────────────────────────────────────────────
const SecaoCodigos: React.FC<{
    item: ItemControlado;
    texto: (typeof TEXTO_DO_TIPO)[TipoItemControlado];
    podeEditar: boolean;
    ocupado: boolean;
    vincular: Vincular;
    aplicar: (p: Partial<Vinculos>) => void;
}> = ({ item, texto, podeEditar, ocupado, vincular, aplicar }) => {
    const [buscando, setBuscando] = React.useState(false);
    const motivo = !podeEditar ? MOTIVO_SEM_EDICAO_QUALIDADE : ocupado ? MOTIVO_OCUPADO : undefined;

    const adicionar = async (escolhidos: SinapiItem[]) => {
        setBuscando(false);
        const novos = [...new Set([...item.codigos, ...escolhidos.map(s => s.code)])];
        await vincular(async () => {
            await qualidadeSiacService.definirCodigos(item.id, novos);
            aplicar({ codigos: novos });
        },
            escolhidos.length === 1 ? 'Código incluído.' : 'Códigos incluídos.', 'Não foi possível incluir os códigos');
    };

    const remover = (codigo: string) => vincular(async () => {
        const restantes = item.codigos.filter(c => c !== codigo);
        await qualidadeSiacService.definirCodigos(item.id, restantes);
        aplicar({ codigos: restantes });
    },
        `Código ${codigo} removido.`, 'Não foi possível remover o código');

    return (
        <div className={CARTAO}>
            <SecaoTitulo icon={Hash} titulo="Códigos" acoes={(
                <button type="button" className={BOTAO_SECUNDARIO} disabled={!!motivo} title={motivo} onClick={() => setBuscando(true)}>
                    <Search className="w-[15px] h-[15px]" aria-hidden="true" /> {texto.base}
                </button>
            )} />
            <p className="text-xs text-gray-600">Incluir ou remover grava na hora.</p>
            {item.codigos.length === 0 ? (
                <p className="text-sm text-gray-700">Nenhum código vinculado.</p>
            ) : (
                <ul className="flex flex-wrap gap-2">
                    {item.codigos.map(c => (
                        <li key={c} className="flex items-center gap-1 h-8 pl-2.5 pr-1 border border-gray-200 rounded-[6px] text-sm text-gray-900">
                            {c}
                            <button type="button" className="p-1 rounded-[4px] text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={`Remover o código ${c}`} title={motivo ?? `Remover o código ${c}`} disabled={!!motivo}
                                onClick={() => void remover(c)}>
                                <X className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <DatabasePickerModal isOpen={buscando} onClose={() => setBuscando(false)} onSelect={s => void adicionar([s])}
                multiple onSelectMany={l => void adicionar(l)} title={texto.base} subtitle={texto.baseSub} />
        </div>
    );
};

export default ItemControladoSheet;
