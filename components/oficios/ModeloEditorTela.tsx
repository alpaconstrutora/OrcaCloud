import React from 'react';
import { ArrowLeft, Eye, Loader2, AlertCircle, Save } from 'lucide-react';
import type { DocGenModelo, DocGenModeloInsert, DocTipTap, LayoutModelo } from '../../types/docGen';
import { LAYOUT_PADRAO } from '../../types/docGen';
import type { OpuraDocumentCategoria } from '../../types/documents';
import { docGenModeloService } from '../../services/docGenModeloService';
import { chavesDoModelo } from '../../services/docGen/motorRender';
import { rotuloDaChave } from '../../services/docGen/catalogoCampos';
import { previaDoModelo } from '../../services/docGen/previa';
import { useStore } from '../../store/useStore';
import { useOrgWriteTarget, forEachTargetOrg, partialFailureNote } from '../../hooks/useOrgContext';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useScrollAoTopo } from '../../hooks/useScrollAoTopo';
import { useDepartamentosDaOrg } from '../../hooks/useDepartamentosDaOrg';
import { useToast } from '../../hooks/useToast';
import SaveStatus from '../ui/SaveStatus';
import EditorRico from './EditorRico';
import LayoutModeloForm from './LayoutModeloForm';
import PreviewPdf from './PreviewPdf';
import { CATEGORIAS_GED, CATEGORIA_GED_LABEL } from './rotulos';

/**
 * Editor de MODELO — tela in-flow (sem Sheet, sem overlay, sem tela cheia):
 * seta "voltar" + h1, como `DocxTemplateManager`. Quem monta (OficiosModule)
 * troca o próprio conteúdo por esta tela.
 *
 * §25: salvar uma edição permanece aqui; só criar volta à lista.
 * REGRA #5: criar com o topo em "Todas" pergunta e replica por organização.
 */
interface Props {
    modelo: DocGenModelo | null;
    /** Organização do topo (null = "Todas"). Em edição, manda a do modelo. */
    organizationId: string | null;
    onClose: () => void;
    /** `modelo` = o registro salvo; `null` = replicou em várias orgs, recarregue. */
    onSaved: (modelo: DocGenModelo | null, criado: boolean) => void;
}

interface Draft {
    nome: string;
    descricao: string;
    categoria_ged: OpuraDocumentCategoria;
    department_id: string | null;
    status: DocGenModelo['status'];
    responsavel_email: string;
    signatario_member_id: string | null;
    campos_obrigatorios: string[];
    conteudo: DocTipTap;
    layout: LayoutModelo;
    exige_aprovacao: boolean;
    exige_assinatura: boolean;
}

const texto = (t: string) => ({ type: 'text', text: t });
const variavel = (chave: string, marks?: { type: string }[]) => ({ type: 'variavel', attrs: { chave }, ...(marks ? { marks } : {}) });
const paragrafo = (content: unknown[], attrs?: Record<string, unknown>) => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content });

/** Esqueleto de ofício para um modelo novo — o exemplo do pedido original. */
export const CONTEUDO_INICIAL_OFICIO: DocTipTap = {
    type: 'doc',
    content: [
        paragrafo([texto('OFÍCIO Nº '), variavel('documento.numero', [{ type: 'bold' }])], { textAlign: 'right' }),
        paragrafo([variavel('documento.local_e_data')], { textAlign: 'right' }),
        paragrafo([texto('À')]),
        paragrafo([variavel('destinatario.razao_social', [{ type: 'bold' }])]),
        paragrafo([texto('A/C: '), variavel('destinatario.contato_nome')]),
        paragrafo([texto('Assunto: '), variavel('documento.assunto', [{ type: 'bold' }])]),
        paragrafo([texto('Prezados Senhores,')]),
        { type: 'campoLivre', attrs: { nome: 'conteudo', rotulo: 'Conteúdo do ofício' } },
        paragrafo([texto('Atenciosamente,')]),
        { type: 'assinaturas' },
        { type: 'anexos' },
    ] as DocTipTap['content'],
};

const INPUT = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const LABEL = 'text-xs font-semibold text-slate-500';

function draftDe(m: DocGenModelo | null): Draft {
    return m ? {
        nome: m.nome, descricao: m.descricao ?? '', categoria_ged: m.categoria_ged, department_id: m.department_id,
        status: m.status, responsavel_email: m.responsavel_email ?? '', signatario_member_id: m.signatario_member_id,
        campos_obrigatorios: m.campos_obrigatorios, conteudo: m.conteudo, layout: m.layout,
        exige_aprovacao: !!m.exige_aprovacao, exige_assinatura: !!m.exige_assinatura,
    } : {
        nome: '', descricao: '', categoria_ged: 'juridico', department_id: null, status: 'rascunho', responsavel_email: '',
        signatario_member_id: null, campos_obrigatorios: ['destinatario.razao_social', 'documento.assunto'],
        conteudo: CONTEUDO_INICIAL_OFICIO, layout: LAYOUT_PADRAO,
        exige_aprovacao: false, exige_assinatura: false,
    };
}

export default function ModeloEditorTela({ modelo, organizationId, onClose, onSaved }: Props) {
    const raiz = React.useRef<HTMLDivElement>(null);
    useScrollAoTopo(raiz);
    const { showToast } = useToast();
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();

    const [atual, setAtual] = React.useState<DocGenModelo | null>(modelo);
    const [draft, setDraft] = React.useState<Draft>(() => draftDe(modelo));
    const [salvando, setSalvando] = React.useState(false);
    const [savedAt, setSavedAt] = React.useState<number | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);

    const [previaAberta, setPreviaAberta] = React.useState(false);
    const [previaBlob, setPreviaBlob] = React.useState<Blob | null>(null);
    const [previaCarregando, setPreviaCarregando] = React.useState(false);
    const [previaErro, setPreviaErro] = React.useState<string | null>(null);

    const orgDoModelo = atual?.organization_id ?? organizationId;
    const organizations = useStore(s => s.organizations);
    const organization = React.useMemo(() => organizations.find(o => o.id === orgDoModelo) ?? null, [organizations, orgDoModelo]);
    const membros = organization?.members ?? [];
    const { departamentos } = useDepartamentosDaOrg(orgDoModelo);

    const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft(d => ({ ...d, [k]: v })); markDirty(); };

    const chaves = React.useMemo(() => chavesDoModelo(draft.conteudo, draft.layout), [draft.conteudo, draft.layout]);

    const toggleObrigatorio = (chave: string) => {
        const tem = draft.campos_obrigatorios.includes(chave);
        set('campos_obrigatorios', tem ? draft.campos_obrigatorios.filter(c => c !== chave) : [...draft.campos_obrigatorios, chave]);
    };

    const handleBack = async () => { if (await confirmDiscard()) onClose(); };

    const payload = (): Omit<DocGenModeloInsert, 'organization_id'> => ({
        nome: draft.nome.trim(),
        descricao: draft.descricao.trim() || null,
        tipo_documental: 'OFICIO',
        categoria_ged: draft.categoria_ged,
        department_id: draft.department_id,
        status: draft.status,
        conteudo: draft.conteudo,
        layout: draft.layout,
        // Só mantém as obrigatórias que ainda existem no modelo.
        campos_obrigatorios: draft.campos_obrigatorios.filter(c => chaves.includes(c)),
        signatario_member_id: draft.signatario_member_id,
        responsavel_email: draft.responsavel_email.trim() || null,
        exige_aprovacao: draft.exige_aprovacao,
        exige_assinatura: draft.exige_assinatura,
    });

    const salvar = async () => {
        if (!draft.nome.trim()) { setErro('Dê um nome ao modelo.'); return; }
        setErro(null);
        setSalvando(true);
        try {
            if (atual) {
                const salvo = await docGenModeloService.update(atual, payload());
                setAtual(salvo);
                setDraft(draftDe(salvo));
                markSaved();
                setSavedAt(Date.now());
                showToast('Modelo salvo.', 'success');
                onSaved(salvo, false);          // §25: editar permanece na tela
                return;
            }
            const target = await resolveWriteOrg('all-allowed');
            if (!target) return;
            const criados: DocGenModelo[] = [];
            const { ok, failed } = await forEachTargetOrg(target, async orgId => {
                criados.push(await docGenModeloService.create({ organization_id: orgId, ...payload() }));
            });
            if (ok === 0) throw new Error('Não foi possível criar o modelo em nenhuma organização.');
            markSaved();
            showToast(
                failed.length ? `Modelo criado em ${ok} organização(ões); ${partialFailureNote(failed)}.` : 'Modelo criado.',
                failed.length ? 'error' : 'success',
            );
            onSaved(criados.length === 1 ? criados[0] : null, true);   // criar fecha
            onClose();
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Falha ao salvar o modelo.';
            setErro(msg);
            showToast(msg, 'error');
        } finally {
            setSalvando(false);
        }
    };

    const abrirPrevia = async () => {
        setPreviaAberta(true);
        setPreviaCarregando(true);
        setPreviaErro(null);
        try {
            setPreviaBlob(await previaDoModelo({ conteudo: draft.conteudo, layout: draft.layout, titulo: draft.nome || 'Modelo sem nome', organization }));
        } catch (e) {
            setPreviaBlob(null);
            setPreviaErro(e instanceof Error ? e.message : 'Falha ao gerar a prévia.');
        } finally {
            setPreviaCarregando(false);
        }
    };

    return (
        /* §20.2: sem px-* na raiz — o gutter é o do <main>. */
        <div ref={raiz} className="space-y-6 animate-in fade-in duration-300 pb-24">
            <div className="flex items-center gap-4">
                <button type="button" onClick={handleBack} title="Voltar"
                    className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 group shrink-0">
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </button>
                <div className="min-w-0">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">{atual ? 'Editar modelo' : 'Novo modelo de ofício'}</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">
                        {atual ? `${atual.nome} · versão ${atual.versao}` : 'Monte o texto com variáveis do sistema e campos de redação livre; o PDF segue o layout definido aqui.'}
                    </p>
                </div>
            </div>

            {erro && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                </div>
            )}

            {/* §30 — um formulário, seções com título + linha, campos curtos em grade. */}
            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Identificação</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                        <div className="space-y-1.5 col-span-2">
                            <label className={LABEL}>Nome do modelo *</label>
                            <input value={draft.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex.: Ofício para prefeitura" className={INPUT} />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={LABEL}>Descrição</label>
                            <input value={draft.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Quando usar este modelo" className={INPUT} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Categoria no GED</label>
                            <select value={draft.categoria_ged} onChange={e => set('categoria_ged', e.target.value as OpuraDocumentCategoria)} className={INPUT}>
                                {CATEGORIAS_GED.map(c => <option key={c} value={c}>{CATEGORIA_GED_LABEL[c]}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Departamento</label>
                            <select value={draft.department_id ?? ''} onChange={e => set('department_id', e.target.value || null)} className={INPUT}>
                                <option value="">— Sem departamento —</option>
                                {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}{d.companyNome ? ` · ${d.companyNome}` : ''}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Status</label>
                            <select value={draft.status} onChange={e => set('status', e.target.value as Draft['status'])} className={INPUT}>
                                <option value="rascunho">Rascunho</option>
                                <option value="ativo">Ativo</option>
                                <option value="inativo">Inativo</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Responsável pelo modelo (e-mail)</label>
                            <input type="email" value={draft.responsavel_email} onChange={e => set('responsavel_email', e.target.value)} placeholder="quem mantém este modelo" className={INPUT} />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={LABEL}>Signatário padrão</label>
                            <select value={draft.signatario_member_id ?? ''} onChange={e => set('signatario_member_id', e.target.value || null)} className={INPUT}>
                                <option value="">— Escolher a cada documento —</option>
                                {membros.map(m => <option key={m.id} value={m.id}>{m.name}{m.cargo ? ` · ${m.cargo}` : ''}</option>)}
                            </select>
                            <p className="text-xs text-gray-400">Os usuários vêm de Minha Organização › Usuários; cargo, registro e assinatura são editados lá.</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Antes de emitir</h3>
                        <span className="text-xs text-gray-400">o que o ofício deste modelo precisa ter para receber número</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                        <label className="flex items-start gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={draft.exige_aprovacao} onChange={e => set('exige_aprovacao', e.target.checked)}
                                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600" />
                            <span>
                                <span className="block">Exige aprovação</span>
                                <span className="block text-xs text-gray-400">O ofício vai para a fila de aprovação (Central de Controle) e só é emitido depois de aprovado. Alterar o texto depois de aprovado pede nova aprovação.</span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={draft.exige_assinatura} onChange={e => set('exige_assinatura', e.target.checked)}
                                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600" />
                            <span>
                                <span className="block">Exige a assinatura eletrônica de todos os signatários</span>
                                <span className="block text-xs text-gray-400">Cada signatário assina pelo próprio usuário; o PDF traz "assinado eletronicamente por… em…".</span>
                            </span>
                        </label>
                    </div>
                </div>

                <LayoutModeloForm value={draft.layout} onChange={l => set('layout', l)} />

                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Conteúdo do modelo</h3>
                    </div>
                    <EditorRico value={draft.conteudo} onChange={doc => set('conteudo', doc)} modo="modelo" />
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Campos obrigatórios para emitir</h3>
                    </div>
                    {chaves.length === 0 ? (
                        <p className="text-sm text-gray-500">O modelo ainda não usa variáveis. Insira variáveis no conteúdo, cabeçalho ou rodapé para marcá-las aqui.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                            {chaves.map(ch => (
                                <label key={ch} className="flex items-start gap-2 text-sm text-gray-700">
                                    <input type="checkbox" checked={draft.campos_obrigatorios.includes(ch)} onChange={() => toggleObrigatorio(ch)}
                                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600" />
                                    <span className="min-w-0">
                                        <span className="block truncate" title={rotuloDaChave(ch)}>{rotuloDaChave(ch)}</span>
                                        <span className="block truncate text-[11px] text-gray-400">{`{{${ch}}}`}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Rodapé §25 — sticky no fluxo (não fixed). */}
            <div className="sticky bottom-0 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-white/95 backdrop-blur border-t border-gray-100 flex items-center justify-end gap-3">
                {atual && <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />}
                <button type="button" onClick={handleBack} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                    {atual ? 'Voltar' : 'Cancelar'}
                </button>
                <button type="button" onClick={abrirPrevia}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95">
                    <Eye className="w-[15px] h-[15px]" /> Prévia em PDF
                </button>
                <button type="button" onClick={salvar} disabled={salvando || (!!atual && !dirty)}
                    title={atual && !dirty ? 'Nada alterado desde o último salvamento' : undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Save className="w-[15px] h-[15px]" />}
                    {salvando ? 'Salvando…' : atual ? 'Salvar modelo' : 'Criar modelo'}
                </button>
            </div>

            <PreviewPdf open={previaAberta} onClose={() => setPreviaAberta(false)} titulo={draft.nome || 'Modelo sem nome'}
                blob={previaBlob} carregando={previaCarregando} erro={previaErro} />
            {orgTargetModal}
        </div>
    );
}
