import React from 'react';
import { ArrowLeft, Eye, Loader2, AlertCircle, Save, Send, UserRound, RefreshCw, FileDown, FolderOpen, Ban, Lock } from 'lucide-react';
import type { DestinatarioSnapshot, DocGenDocumento, DocGenDocumentoRascunho, DocGenModelo, DocTipTap } from '../../types/docGen';
import { DOC_TIPTAP_VAZIO } from '../../types/docGen';
import { useStore } from '../../store/useStore';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useScrollAoTopo } from '../../hooks/useScrollAoTopo';
import { useDepartamentosDaOrg } from '../../hooks/useDepartamentosDaOrg';
import { useToast } from '../../hooks/useToast';
import SaveStatus from '../ui/SaveStatus';
import { useConfirm } from '../ui/confirm';
import { emitirOficio, arquivarNoGed, urlDoPdf, cancelarOficio } from '../../services/docGen/emissao';
import EditorRico from './EditorRico';
import PreviewPdf from './PreviewPdf';
import SeletorDestinatario from './SeletorDestinatario';
import CamposPendentesPainel from './CamposPendentesPainel';
import AnexosEditor from './AnexosEditor';
import SignatariosEditor from './SignatariosEditor';
import { docGenDocumentoService, rascunhoDoModelo } from '../../services/docGenDocumentoService';
import { camposLivresDoModelo } from '../../services/docGen/motorRender';
import { validarDocumento, temBloqueante, type Pendencia } from '../../services/docGen/validarDocumento';
import { previaDoDocumento } from '../../services/docGen/previa';
import {
    atualizarCadastroDestinatario, imagensDasAssinaturas, lerDestinatario, listarContratos, listarEmpreendimentos,
    montarContexto, obrasDaOrganizacao, valoresDoDocumento, type OpcaoSimples,
} from '../../services/docGen/resolverContexto';
import { ROTULO_TIPO, resumoDoDestinatario, snapshotComCampo } from '../../services/docGen/destinatario';
import { dataPorExtenso, hojeIso } from '../../services/docGen/dataExtenso';
import { CATEGORIA_GED_LABEL } from './rotulos';

/**
 * Novo ofício / rascunho — TELA in-flow (seta voltar + h1), como o editor de
 * modelo. Plano: docs/planos/2026-10-07-gerador-de-oficios.md (F2).
 *
 * §25 com uma nuance registrada no plano: "Salvar rascunho" de um ofício NOVO
 * não fecha a tela. O §25 fecha na criação porque "a tarefa acabou"; aqui a
 * tarefa é redigir o ofício, e o rascunho é só um ponto de parada — fechar
 * jogaria o usuário na lista no meio da redação.
 *
 * A organização é a do MODELO (o ofício herda o dono do modelo) — nunca se
 * pergunta (REGRA #5 regra 4: registro operacional de uma organização só).
 */
interface Props {
    modelo: DocGenModelo;
    documento: DocGenDocumento | null;
    onClose: () => void;
    onSaved: (doc: DocGenDocumento) => void;
}

const INPUT = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:bg-gray-50 disabled:text-gray-500';
const LABEL = 'text-xs font-semibold text-slate-500';



function draftDe(modelo: DocGenModelo, doc: DocGenDocumento | null, empresaAtiva: string | null): DocGenDocumentoRascunho {
    if (!doc) return rascunhoDoModelo(modelo, { company_id: empresaAtiva });
    const { id: _id, status: _s, numero: _n, versao: _v, ged_document_id: _g, ged_version_id: _gv, emitido_por: _ep, emitido_em: _ee,
        created_by: _cb, created_at: _ca, updated_at: _ua, ...resto } = doc;
    return resto;
}

export default function NovoOficioTela({ modelo, documento, onClose, onSaved }: Props) {
    const raiz = React.useRef<HTMLDivElement>(null);
    useScrollAoTopo(raiz);
    const { showToast } = useToast();
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
    const confirm = useConfirm();
    const navigateToFocus = useStore(s => s.navigateToFocus);

    const organizations = useStore(s => s.organizations);
    const companies = useStore(s => s.companies);
    const projects = useStore(s => s.projects);
    const activeEmpresaId = useStore(s => s.activeEmpresaId);
    const emailUsuario = useStore(s => s.currentProfile?.email ?? null);

    const [atual, setAtual] = React.useState<DocGenDocumento | null>(documento);
    const [draft, setDraft] = React.useState<DocGenDocumentoRascunho>(() => {
        const empresa = companies.find(c => c.id === activeEmpresaId && c.org_id === modelo.organization_id)?.id ?? null;
        const d = draftDe(modelo, documento, empresa);
        // Rascunho segue o modelo ATUAL (prévia e emissão usam o texto de hoje do
        // modelo); a versão que valeu fica gravada ao salvar e congela na emissão.
        return documento && documento.status !== 'RASCUNHO' ? d : { ...d, modelo_versao: modelo.versao };
    });
    const [salvando, setSalvando] = React.useState(false);
    const [savedAt, setSavedAt] = React.useState<number | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [seletorAberto, setSeletorAberto] = React.useState(false);

    const somenteLeitura = !!atual && atual.status !== 'RASCUNHO';
    const orgId = draft.organization_id;
    const organization = React.useMemo(() => organizations.find(o => o.id === orgId) ?? null, [organizations, orgId]);
    const companiesDaOrg = React.useMemo(() => companies.filter(c => c.org_id === orgId), [companies, orgId]);
    const obras = React.useMemo(() => obrasDaOrganizacao(projects, orgId), [projects, orgId]);
    const { departamentos, nomePorId } = useDepartamentosDaOrg(orgId);
    const nomeDepartamento = React.useCallback((id: string | null | undefined) => (id ? nomePorId[id] ?? '' : ''), [nomePorId]);

    const [empreendimentos, setEmpreendimentos] = React.useState<OpcaoSimples[]>([]);
    const [contratos, setContratos] = React.useState<OpcaoSimples[]>([]);
    React.useEffect(() => {
        let vivo = true;
        listarEmpreendimentos(orgId).then(l => vivo && setEmpreendimentos(l)).catch(() => vivo && setEmpreendimentos([]));
        listarContratos(orgId).then(l => vivo && setContratos(l)).catch(() => vivo && setContratos([]));
        return () => { vivo = false; };
    }, [orgId]);

    const set = <K extends keyof DocGenDocumentoRascunho>(k: K, v: DocGenDocumentoRascunho[K]) => {
        setDraft(d => ({ ...d, [k]: v }));
        markDirty();
    };

    const camposLivres = React.useMemo(() => camposLivresDoModelo(modelo.conteudo), [modelo.conteudo]);

    // ── Valores resolvidos + validação (debounce: cada tecla não refaz 4 consultas) ──
    const [valores, setValores] = React.useState<Record<string, string>>({});
    const [pendencias, setPendencias] = React.useState<Pendencia[]>([]);
    const [calculando, setCalculando] = React.useState(true);
    const seq = React.useRef(0);
    React.useEffect(() => {
        const minha = ++seq.current;
        setCalculando(true);
        const t = setTimeout(async () => {
            try {
                const ctx = await montarContexto(draft, { organization, companies, projects, nomeDepartamento, emailUsuario });
                if (minha !== seq.current) return;      // resposta fora de ordem
                const v = valoresDoDocumento(modelo, ctx, draft.valores);
                setValores(v);
                setPendencias(validarDocumento({
                    modelo,
                    assunto: draft.assunto,
                    temDestinatario: !!draft.destinatario_snapshot?.razao_social,
                    quantidadeSignatarios: draft.signatarios.length,
                    conteudo: draft.conteudo,
                    valores: v,
                }));
            } catch (e) {
                console.error('[NovoOficioTela] Falha ao resolver os campos:', e);
            } finally {
                if (minha === seq.current) setCalculando(false);
            }
        }, 400);
        return () => clearTimeout(t);
    }, [draft, organization, companies, projects, nomeDepartamento, emailUsuario, modelo]);

    // ── Destinatário ──
    const escolherDestinatario = (snap: DestinatarioSnapshot) => {
        setDraft(d => {
            const anterior = d.destinatario_snapshot;
            const n: DocGenDocumentoRascunho = { ...d, destinatario_tipo: snap.tipo, destinatario_id: snap.id ?? null, destinatario_snapshot: snap };
            // Cliente/fornecedor destinatário também é o vínculo (grupos {{cliente.*}}/{{fornecedor.*}}).
            if (anterior?.tipo === 'CLIENTE' && d.client_id === anterior.id) n.client_id = null;
            if (anterior?.tipo === 'FORNECEDOR' && d.supplier_id === anterior.id) n.supplier_id = null;
            if (snap.tipo === 'CLIENTE') n.client_id = snap.id ?? null;
            if (snap.tipo === 'FORNECEDOR') n.supplier_id = snap.id ?? null;
            return n;
        });
        markDirty();
    };

    const recarregarDestinatario = async () => {
        const d = draft.destinatario_snapshot;
        if (!d || !d.id || d.tipo === 'MANUAL') return;
        const novo = await lerDestinatario(d.tipo, d.id, organizations);
        if (novo) { set('destinatario_snapshot', novo); showToast('Dados do destinatário relidos do cadastro.', 'success'); }
    };

    const soNesteDocumento = (chave: string, valor: string) => set('valores', { ...draft.valores, [chave]: valor });

    const gravarNoCadastro = async (chave: string, valor: string) => {
        const d = draft.destinatario_snapshot;
        if (!d?.id) throw new Error('Destinatário sem cadastro de origem.');
        await atualizarCadastroDestinatario(d.tipo, d.id, chave, valor);
        set('destinatario_snapshot', snapshotComCampo(d, chave, valor));
        showToast(`Cadastro de ${ROTULO_TIPO[d.tipo].toLowerCase()} atualizado.`, 'success');
    };

    const irPara = (chave: string) => {
        const alvo = chave === 'destinatario' ? 'secao-destinatario'
            : chave === 'assunto' ? 'campo-assunto'
            : chave === 'signatarios' ? 'secao-signatarios'
            : chave.startsWith('campo:') ? `campo-livre-${chave.slice(6)}` : null;
        if (!alvo) return;
        const el = document.getElementById(alvo);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (chave === 'destinatario') setSeletorAberto(true);
        if (chave === 'assunto') (el as HTMLInputElement | null)?.focus();
    };

    // ── Salvar ──
    const handleBack = async () => { if (await confirmDiscard()) onClose(); };

    const salvar = async () => {
        setErro(null);
        setSalvando(true);
        try {
            const doc = atual ? await docGenDocumentoService.salvar(atual, draft) : await docGenDocumentoService.create(draft);
            setAtual(doc);
            markSaved();
            setSavedAt(Date.now());
            showToast(atual ? `Rascunho salvo (versão ${doc.versao}).` : 'Rascunho criado.', 'success');
            onSaved(doc);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Falha ao salvar o rascunho.';
            setErro(msg);
            showToast(msg, 'error');
        } finally {
            setSalvando(false);
        }
    };

    // ── Emissão (F3) ──
    const [emitindo, setEmitindo] = React.useState(false);
    const depsEmissao = () => ({ modelo, organization, companies, projects, nomeDepartamento, emailUsuario });

    const emitir = async () => {
        const ok = await confirm({
            title: 'Emitir o ofício?',
            message: 'O número oficial é atribuído agora e não volta. O PDF é arquivado no GED com o hash, e o documento fica congelado — alterar depois só com nova revisão.',
            variant: 'warning',
            confirmLabel: 'Emitir',
        });
        if (!ok) return;
        setErro(null);
        setEmitindo(true);
        try {
            // Emite o que está na tela: salva antes se houver pendência de gravação.
            let base = atual;
            if (!base || dirty) {
                base = base ? await docGenDocumentoService.salvar(base, draft) : await docGenDocumentoService.create(draft);
                setAtual(base);
                markSaved();
            }
            const emitido = await emitirOficio(base, depsEmissao());
            setAtual(emitido);
            onSaved(emitido);
            showToast(`Ofício ${emitido.numero} emitido e arquivado no GED.`, 'success');
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Falha ao emitir.';
            // Se o número já saiu, o ofício está EMITIDO mesmo sem arquivo — a tela tem de mostrar isso.
            if (atual?.id) {
                const relido = await docGenDocumentoService.get(atual.id).catch(() => null);
                if (relido) { setAtual(relido); onSaved(relido); }
            }
            setErro(msg);
            showToast(msg, 'error');
        } finally {
            setEmitindo(false);
        }
    };

    const arquivarDeNovo = async () => {
        if (!atual) return;
        setErro(null);
        setEmitindo(true);
        try {
            const final = await arquivarNoGed(atual.id, depsEmissao());
            setAtual(final);
            onSaved(final);
            showToast('PDF gerado e arquivado no GED.', 'success');
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Falha ao arquivar.';
            setErro(msg);
            showToast(msg, 'error');
        } finally {
            setEmitindo(false);
        }
    };

    const abrirPdf = async () => {
        if (!atual) return;
        try {
            window.open(await urlDoPdf(atual, emailUsuario), '_blank', 'noopener');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao abrir o PDF.', 'error');
        }
    };

    const cancelar = async () => {
        if (!atual) return;
        const ok = await confirm({
            title: `Cancelar o ofício ${atual.numero}?`,
            message: 'O número continua usado e o arquivo continua no GED, marcado como cancelado. Nada é apagado.',
            variant: 'danger',
            confirmLabel: 'Cancelar ofício',
            cancelLabel: 'Voltar',
        });
        if (!ok) return;
        try {
            const c = await cancelarOficio(atual);
            setAtual(c);
            onSaved(c);
            showToast(`Ofício ${c.numero} cancelado.`, 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao cancelar.', 'error');
        }
    };

    // ── Prévia ──
    const [previaAberta, setPreviaAberta] = React.useState(false);
    const [previaBlob, setPreviaBlob] = React.useState<Blob | null>(null);
    const [previaCarregando, setPreviaCarregando] = React.useState(false);
    const [previaErro, setPreviaErro] = React.useState<string | null>(null);
    const abrirPrevia = async () => {
        setPreviaAberta(true);
        setPreviaCarregando(true);
        setPreviaErro(null);
        try {
            const ctx = await montarContexto(draft, { organization, companies, projects, nomeDepartamento, emailUsuario });
            const v = valoresDoDocumento(modelo, ctx, draft.valores);
            const imagens = await imagensDasAssinaturas(draft.signatarios, organization);
            setPreviaBlob(await previaDoDocumento({
                conteudoModelo: modelo.conteudo,
                layout: modelo.layout,
                titulo: draft.assunto || modelo.nome,
                valores: v,
                camposLivres: draft.conteudo,
                assinaturas: draft.signatarios.map((s, i) => ({ nome: s.nome, cargo: s.cargo, registroProfissional: s.registroProfissional, imagemDataUrl: imagens[i] })),
                anexos: draft.anexos.map(a => a.nome),
                organization,
                numero: atual?.numero ?? null,
            }));
        } catch (e) {
            setPreviaBlob(null);
            setPreviaErro(e instanceof Error ? e.message : 'Falha ao gerar a prévia.');
        } finally {
            setPreviaCarregando(false);
        }
    };

    const bloqueado = temBloqueante(pendencias);
    const qtdPendencias = pendencias.filter(p => p.severidade === 'bloqueante').length;
    const dataAutomatica = draft.data_documento === null;
    const cidadePadrao = valores['empresa.cidade'] || '';

    const titulo = atual?.numero ? `Ofício ${atual.numero}` : atual ? 'Ofício em elaboração' : 'Novo ofício';
    const emitidoEm = atual?.emitido_em ? new Date(atual.emitido_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const subtitulo = atual?.status === 'EMITIDO'
        ? `Emitido em ${emitidoEm} por ${atual.emitido_por ?? '—'} · modelo "${modelo.nome}" (v${draft.modelo_versao})`
        : atual?.status === 'CANCELADO'
            ? `Cancelado · emitido em ${emitidoEm} por ${atual.emitido_por ?? '—'}`
            : atual
                ? `Rascunho · versão ${atual.versao} · modelo "${modelo.nome}" (v${draft.modelo_versao})`
                : `Modelo "${modelo.nome}" · ${CATEGORIA_GED_LABEL[modelo.categoria_ged]}`;
    const motivoEmitir = calculando ? 'Conferindo os dados…'
        : bloqueado ? `${qtdPendencias} pendência(s) impede(m) a emissão — veja a Validação.`
        : undefined;

    return (
        <div ref={raiz} className="space-y-6 animate-in fade-in duration-300 pb-24">
            <div className="flex items-center gap-4">
                <button type="button" onClick={handleBack} title="Voltar"
                    className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 group shrink-0">
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </button>
                <div className="min-w-0">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">{titulo}</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">{subtitulo}</p>
                </div>
            </div>

            {erro && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                </div>
            )}

            {atual?.status === 'EMITIDO' && !atual.ged_document_id && (
                <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1 min-w-[240px]">O número {atual.numero} foi emitido, mas o PDF ainda não está no GED.</span>
                    <button type="button" onClick={arquivarDeNovo} disabled={emitindo}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50">
                        {emitindo ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <FolderOpen className="w-[15px] h-[15px]" />} Gerar PDF e arquivar no GED
                    </button>
                </div>
            )}
            {atual && atual.status !== 'RASCUNHO' && atual.ged_document_id && (
                <div className="flex items-start gap-2 rounded-[10px] bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-600">
                    <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                    {atual.status === 'CANCELADO'
                        ? 'Ofício cancelado. O número continua usado e o arquivo continua no GED, marcado como cancelado.'
                        : 'Documento emitido e congelado: o PDF oficial está no GED com o hash SHA-256. Alterar exige nova revisão.'}
                </div>
            )}

            {/* §30 — um formulário: seções com título + linha, campos curtos em grade. */}
            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Identificação</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                        <div className="space-y-1.5 col-span-2 md:col-span-4">
                            <label className={LABEL} htmlFor="campo-assunto">Assunto *</label>
                            <input id="campo-assunto" value={draft.assunto} disabled={somenteLeitura} onChange={e => set('assunto', e.target.value)}
                                placeholder="Ex.: Solicitação de ligação definitiva de energia – Residencial Central" className={INPUT} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Empresa emitente</label>
                            <select value={draft.company_id ?? ''} disabled={somenteLeitura} onChange={e => set('company_id', e.target.value || null)} className={INPUT}>
                                <option value="">{organization?.name ?? 'Organização'} (a própria organização)</option>
                                {companiesDaOrg.map(c => <option key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Departamento</label>
                            <select value={draft.department_id ?? ''} disabled={somenteLeitura} onChange={e => set('department_id', e.target.value || null)} className={INPUT}>
                                <option value="">— Sem departamento —</option>
                                {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}{d.companyNome ? ` · ${d.companyNome}` : ''}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Data do documento</label>
                            {dataAutomatica ? (
                                <div className="flex items-center h-9 text-sm text-gray-600">Automática — a da emissão</div>
                            ) : (
                                <input type="date" value={draft.data_documento ?? ''} disabled={somenteLeitura} min="2000-01-01" max="2099-12-31"
                                    onChange={e => set('data_documento', e.target.value || hojeIso())} className={INPUT} />
                            )}
                            {!somenteLeitura && (
                                <label className="flex items-center gap-2 text-xs text-gray-600">
                                    <input type="checkbox" checked={dataAutomatica} onChange={e => set('data_documento', e.target.checked ? null : hojeIso())}
                                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600" />
                                    Data automática
                                </label>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Cidade (local e data)</label>
                            <input value={draft.cidade ?? ''} disabled={somenteLeitura} onChange={e => set('cidade', e.target.value || null)}
                                placeholder={cidadePadrao ? `${cidadePadrao} (da empresa)` : 'Cidade da empresa'} className={INPUT} />
                            <p className="text-[11px] text-gray-400 truncate" title={valores['documento.local_e_data']}>
                                {`${draft.cidade || cidadePadrao || '—'}, ${dataPorExtenso(draft.data_documento ?? hojeIso())}`}
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Resposta esperada até</label>
                            <input type="date" value={draft.resposta_esperada_ate ?? ''} disabled={somenteLeitura} min="2000-01-01" max="2099-12-31"
                                onChange={e => set('resposta_esperada_ate', e.target.value || null)} className={INPUT} />
                        </div>
                    </div>
                </div>

                <div className="space-y-4" id="secao-destinatario">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Destinatário</h3>
                    </div>
                    {draft.destinatario_snapshot ? (
                        <div className="flex flex-wrap items-start gap-4 rounded-[10px] border border-gray-100 bg-gray-50/60 px-4 py-3">
                            <UserRound className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-gray-900">{draft.destinatario_snapshot.razao_social}</p>
                                <p className="text-xs text-gray-500">{ROTULO_TIPO[draft.destinatario_snapshot.tipo]}{resumoDoDestinatario(draft.destinatario_snapshot).replace(draft.destinatario_snapshot.razao_social, '')}</p>
                                {draft.destinatario_snapshot.contato_nome && <p className="text-xs text-gray-500">A/C: {draft.destinatario_snapshot.contato_nome}</p>}
                            </div>
                            {!somenteLeitura && (
                                <div className="flex items-center gap-2">
                                    {draft.destinatario_snapshot.tipo !== 'MANUAL' && (
                                        <button type="button" onClick={recarregarDestinatario} title="Relê os dados do cadastro de origem"
                                            className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-[6px]">
                                            <RefreshCw className="w-4 h-4" /> Reler cadastro
                                        </button>
                                    )}
                                    <button type="button" onClick={() => setSeletorAberto(true)}
                                        className="h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px]">
                                        {draft.destinatario_snapshot.tipo === 'MANUAL' ? 'Editar / trocar' : 'Trocar'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button type="button" disabled={somenteLeitura} onClick={() => setSeletorAberto(true)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                            <UserRound className="w-[15px] h-[15px]" /> Escolher destinatário
                        </button>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Vínculos</h3>
                        <span className="text-xs text-gray-400">preenchem as variáveis de obra, empreendimento e contrato</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={LABEL}>Obra</label>
                            <select value={draft.project_id ?? ''} disabled={somenteLeitura} onChange={e => set('project_id', e.target.value || null)} className={INPUT}>
                                <option value="">— Nenhuma —</option>
                                {obras.map(p => <option key={p.id} value={p.id}>{p.settings?.code ? `${p.settings.code} · ` : ''}{p.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Empreendimento</label>
                            <select value={draft.empreendimento_id ?? ''} disabled={somenteLeitura} onChange={e => set('empreendimento_id', e.target.value || null)} className={INPUT}>
                                <option value="">— Nenhum —</option>
                                {empreendimentos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Contrato</label>
                            <select value={draft.contract_id ?? ''} disabled={somenteLeitura} onChange={e => set('contract_id', e.target.value || null)} className={INPUT}>
                                <option value="">— Nenhum —</option>
                                {contratos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Redação</h3>
                    </div>
                    {camposLivres.length === 0 ? (
                        <p className="text-sm text-gray-500">O modelo não tem campos de redação livre — o texto é todo do modelo.</p>
                    ) : camposLivres.map(c => (
                        <div key={c.nome} id={`campo-livre-${c.nome}`} className="space-y-1.5">
                            <label className={LABEL}>{c.rotulo}</label>
                            {somenteLeitura ? (
                                <div className="rounded-[10px] border border-gray-100 px-4 py-3 text-sm text-gray-500">Documento emitido — texto congelado.</div>
                            ) : (
                                <EditorRico
                                    value={(draft.conteudo[c.nome] as DocTipTap | undefined) ?? DOC_TIPTAP_VAZIO}
                                    onChange={doc => set('conteudo', { ...draft.conteudo, [c.nome]: doc })}
                                    modo="documento"
                                    minHeightClass="min-h-[180px]"
                                />
                            )}
                        </div>
                    ))}
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Anexos</h3>
                    </div>
                    <AnexosEditor
                        anexos={draft.anexos}
                        onChange={a => set('anexos', a)}
                        organizationId={orgId}
                        categoriaGed={modelo.categoria_ged}
                        projectId={draft.project_id}
                        emailUsuario={emailUsuario}
                        somenteLeitura={somenteLeitura}
                    />
                </div>

                <div className="space-y-4" id="secao-signatarios">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Signatários</h3>
                    </div>
                    <SignatariosEditor
                        signatarios={draft.signatarios}
                        onChange={s => set('signatarios', s)}
                        membros={organization?.members ?? []}
                        nomeDepartamento={nomeDepartamento}
                        somenteLeitura={somenteLeitura}
                    />
                </div>
            </div>

            {/* Validação — card próprio: tem estado (§30, "bloco com estado ganha card"). */}
            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Validação</h3>
                    <span className="text-xs text-gray-400">o que falta para emitir</span>
                </div>
                <CamposPendentesPainel
                    pendencias={pendencias}
                    calculando={calculando}
                    destinatarioTipo={draft.destinatario_tipo}
                    destinatarioTemCadastro={!!draft.destinatario_id}
                    somenteLeitura={somenteLeitura}
                    onSoNesteDocumento={soNesteDocumento}
                    onGravarNoCadastro={gravarNoCadastro}
                    onIrPara={irPara}
                />
            </div>

            <div className="sticky bottom-0 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-white/95 backdrop-blur border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
                {atual && <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />}
                <button type="button" onClick={handleBack} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                    {atual ? 'Voltar' : 'Cancelar'}
                </button>
                <button type="button" onClick={abrirPrevia}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95">
                    <Eye className="w-[15px] h-[15px]" /> Prévia em PDF
                </button>
                {!somenteLeitura && (
                    <button type="button" onClick={salvar} disabled={salvando || (!!atual && !dirty)}
                        title={atual && !dirty ? 'Nada alterado desde o último salvamento' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-blue-200 text-blue-700 rounded-[6px] hover:bg-blue-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Save className="w-[15px] h-[15px]" />}
                        {salvando ? 'Salvando…' : 'Salvar rascunho'}
                    </button>
                )}
                {atual?.status === 'EMITIDO' && (
                    <button type="button" onClick={cancelar}
                        className="flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-[6px]">
                        <Ban className="w-[15px] h-[15px]" /> Cancelar ofício
                    </button>
                )}
                {atual?.ged_document_id && (
                    <>
                        <button type="button" onClick={() => navigateToFocus('opura-docs', atual.ged_document_id!, 'GED_DOCUMENTO')}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px]">
                            <FolderOpen className="w-[15px] h-[15px]" /> Abrir no GED
                        </button>
                        <button type="button" onClick={abrirPdf} title="Abre o PDF oficial numa nova aba — para baixar ou imprimir"
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                            <FileDown className="w-[15px] h-[15px]" /> Abrir PDF
                        </button>
                    </>
                )}
                {!somenteLeitura && (
                    /* Desligado SEMPRE com o motivo (memória feedback_botao_desligado_sempre_diz_por_que). */
                    <button type="button" onClick={emitir} disabled={!!motivoEmitir || emitindo || salvando}
                        title={motivoEmitir ?? 'Atribui o número oficial, gera o PDF e arquiva no GED'}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        {emitindo ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Send className="w-[15px] h-[15px]" />}
                        {emitindo ? 'Emitindo…' : 'Emitir'}
                    </button>
                )}
            </div>

            <SeletorDestinatario
                open={seletorAberto}
                onClose={() => setSeletorAberto(false)}
                organizationId={orgId}
                organizations={organizations}
                atual={draft.destinatario_snapshot}
                onEscolher={escolherDestinatario}
            />
            <PreviewPdf open={previaAberta} onClose={() => setPreviaAberta(false)} titulo={draft.assunto || modelo.nome}
                blob={previaBlob} carregando={previaCarregando} erro={previaErro} />
        </div>
    );
}
