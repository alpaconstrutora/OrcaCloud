import React from 'react';
import { ArrowLeft, Eye, Loader2, AlertCircle, Save, Send, UserRound, RefreshCw, FileDown, FolderOpen, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import type {
    DestinatarioSnapshot, DocGenAssinatura, DocGenDocumento, DocGenDocumentoRascunho, DocGenEvento, DocGenModelo, DocGenVinculo,
    DocGenVinculoTipo, DocTipTap,
} from '../../types/docGen';
import { DOC_TIPTAP_VAZIO } from '../../types/docGen';
import { useStore } from '../../store/useStore';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useScrollAoTopo } from '../../hooks/useScrollAoTopo';
import { useDepartamentosDaOrg } from '../../hooks/useDepartamentosDaOrg';
import { useToast } from '../../hooks/useToast';
import SaveStatus from '../ui/SaveStatus';
import { useConfirm } from '../ui/confirm';
import { emitirOficio, arquivarNoGed, urlDoPdf, cancelarOficio, assinaturasParaPdf, assinaturasValidas } from '../../services/docGen/emissao';
import { ROTULO_SITUACAO, referenciaDeOficio, type OficioRecebido } from '../../services/docGen/tramitacao';
import AprovacaoAssinaturaCard from './AprovacaoAssinaturaCard';
import AssistenteIASheet from './AssistenteIASheet';
import { urlDeValidacao } from '../../services/docGen/envio';
import { tabelasDoDocumento } from '../../services/docGen/tabelasDinamicas';
import TramitacaoCard from './TramitacaoCard';
import VinculosPainel, { type AlvoVinculo, type VinculoPendente } from './VinculosPainel';
import HistoricoDocumento from './HistoricoDocumento';
import RegistrarRecebidoSheet from './RegistrarRecebidoSheet';
import EditorRico from './EditorRico';
import PreviewPdf from './PreviewPdf';
import SeletorDestinatario from './SeletorDestinatario';
import CamposPendentesPainel from './CamposPendentesPainel';
import AnexosEditor from './AnexosEditor';
import SignatariosEditor from './SignatariosEditor';
import { docGenDocumentoService, rascunhoDoDocumento, rascunhoDoModelo } from '../../services/docGenDocumentoService';
import { camposLivresDoModelo } from '../../services/docGen/motorRender';
import { validarDocumento, temBloqueante, type Pendencia } from '../../services/docGen/validarDocumento';
import { previaDoDocumento } from '../../services/docGen/previa';
import {
    atualizarCadastroDestinatario, lerDestinatario, listarContratos, listarEmpreendimentos,
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
 *
 * F4: aprovação e assinaturas (rascunho), tramitação e prazo (emitido),
 * documentos relacionados ("em resposta a") e histórico.
 */
interface Props {
    modelo: DocGenModelo;
    documento: DocGenDocumento | null;
    /** "Responder" um ofício recebido: o novo nasce vinculado (em resposta a). */
    respondendoA?: OficioRecebido | null;
    /** Ofícios e recebidos da organização — para o "em resposta a" e os vínculos. */
    documentos: DocGenDocumento[];
    recebidos: OficioRecebido[];
    onClose: () => void;
    onSaved: (doc: DocGenDocumento) => void;
    onAbrirOficio: (id: string) => void;
    onRecebidoRegistrado: (r: OficioRecebido) => void;
}

const INPUT = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:bg-gray-50 disabled:text-gray-500';
const LABEL = 'text-xs font-semibold text-slate-500';



function draftDe(modelo: DocGenModelo, doc: DocGenDocumento | null, empresaAtiva: string | null, respondendoA?: OficioRecebido | null): DocGenDocumentoRascunho {
    if (doc) return rascunhoDoDocumento(doc);
    if (!respondendoA) return rascunhoDoModelo(modelo, { company_id: empresaAtiva });
    // Resposta a um ofício recebido: destinatário = quem enviou (o cadastro é relido ao abrir).
    const m = respondendoA.meta;
    return rascunhoDoModelo(modelo, {
        company_id: empresaAtiva,
        assunto: `Resposta ao ${referenciaDeOficio({ numero: m.numero, remetente: m.remetente })}`,
        destinatario_tipo: 'MANUAL',
        destinatario_snapshot: { tipo: 'MANUAL', razao_social: m.remetente },
        project_id: respondendoA.documento.project_id ?? null,
    });
}

export default function NovoOficioTela({ modelo, documento, respondendoA, documentos, recebidos, onClose, onSaved, onAbrirOficio, onRecebidoRegistrado }: Props) {
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
        const d = draftDe(modelo, documento, empresa, respondendoA);
        // Rascunho segue o modelo ATUAL (prévia e emissão usam o texto de hoje do
        // modelo); a versão que valeu fica gravada ao salvar e congela na emissão.
        return documento && documento.status !== 'RASCUNHO' ? d : { ...d, modelo_versao: modelo.versao };
    });
    const [salvando, setSalvando] = React.useState(false);
    const [savedAt, setSavedAt] = React.useState<number | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [seletorAberto, setSeletorAberto] = React.useState(false);

    // Em aprovação o texto trava (o banco também recusa) — retira-se da aprovação para editar.
    const emAprovacao = !!atual && atual.status === 'RASCUNHO' && atual.approval_status === 'PENDENTE';
    const somenteLeitura = !!atual && (atual.status !== 'RASCUNHO' || emAprovacao);
    const ehRascunho = !atual || atual.status === 'RASCUNHO';

    // ── F4: vínculos, assinaturas e histórico do documento gravado ──
    const [vinculos, setVinculos] = React.useState<DocGenVinculo[]>([]);
    const [pendentes, setPendentes] = React.useState<VinculoPendente[]>(
        () => (!documento && respondendoA ? [{ tipo: 'RESPONDE', alvo: { gedId: respondendoA.documento.id } }] : []),
    );
    const [assinaturas, setAssinaturas] = React.useState<DocGenAssinatura[]>([]);
    const [eventos, setEventos] = React.useState<DocGenEvento[]>([]);
    const [carregandoExtras, setCarregandoExtras] = React.useState(false);
    const [registrandoResposta, setRegistrandoResposta] = React.useState(false);
    const atualId = atual?.id ?? null;
    const recarregarExtras = React.useCallback(async () => {
        if (!atualId) return;
        setCarregandoExtras(true);
        try {
            const [v, a, e] = await Promise.all([
                docGenDocumentoService.listVinculosDoDocumento(atualId),
                docGenDocumentoService.listAssinaturas(atualId),
                docGenDocumentoService.listEventos(atualId),
            ]);
            setVinculos(v);
            setAssinaturas(a);
            setEventos(e);
        } catch (e) {
            console.error('[NovoOficioTela] Falha ao carregar vínculos/assinaturas/histórico:', e);
        } finally {
            setCarregandoExtras(false);
        }
    }, [atualId]);
    React.useEffect(() => { void recarregarExtras(); }, [recarregarExtras, atual?.status, atual?.approval_status, atual?.versao]);

    // Resposta a ofício recebido de fornecedor cadastrado: destinatário vem do cadastro.
    React.useEffect(() => {
        const sid = !documento ? respondendoA?.meta.remetente_supplier_id : null;
        if (!sid) return;
        let vivo = true;
        lerDestinatario('FORNECEDOR', sid, organizations).then(snap => {
            if (!vivo || !snap) return;
            setDraft(d => ({ ...d, destinatario_tipo: 'FORNECEDOR', destinatario_id: snap.id ?? null, destinatario_snapshot: snap, supplier_id: snap.id ?? null }));
        }).catch(() => {});
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Texto do {{documento.em_resposta_a}} — do vínculo RESPONDE (gravado ou ainda pendente). */
    const emRespostaA = React.useMemo(() => {
        const gravado = vinculos.find(v => v.tipo === 'RESPONDE' && v.de_documento_id === atualId);
        const pend = pendentes.find(p => p.tipo === 'RESPONDE');
        const docId = gravado?.para_documento_id ?? (pend && 'documentoId' in pend.alvo ? pend.alvo.documentoId : null);
        const gedId = gravado?.para_ged_id ?? (pend && 'gedId' in pend.alvo ? pend.alvo.gedId : null);
        if (docId) {
            const d = documentos.find(x => x.id === docId);
            return d ? referenciaDeOficio({ numero: d.numero, data: d.data_documento, nome: d.assunto }) : '';
        }
        if (gedId) {
            const r = recebidos.find(x => x.documento.id === gedId);
            return r ? referenciaDeOficio({ numero: r.meta.numero, remetente: r.meta.remetente, data: r.meta.data_documento ?? r.meta.recebido_em }) : '';
        }
        return '';
    }, [vinculos, pendentes, atualId, documentos, recebidos]);

    const adicionarVinculo = async (tipo: DocGenVinculoTipo, alvo: AlvoVinculo) => {
        if (!atual) { setPendentes(p => [...p, { tipo, alvo }]); markDirty(); return; }
        try {
            await docGenDocumentoService.vincular({
                organization_id: atual.organization_id, de: { documentoId: atual.id },
                para: 'documentoId' in alvo ? { documentoId: alvo.documentoId } : { gedId: alvo.gedId }, tipo,
            });
            await recarregarExtras();
            showToast('Documento vinculado.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao vincular.', 'error');
        }
    };

    const removerVinculo = async (v: DocGenVinculo | VinculoPendente) => {
        if (!('id' in v)) { setPendentes(p => p.filter(x => x !== v)); return; }
        try {
            await docGenDocumentoService.desvincular(v.id);
            setVinculos(l => l.filter(x => x.id !== v.id));
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao desfazer o vínculo.', 'error');
        }
    };

    // ── F7: assistente de IA por campo livre ──
    const [iaCampo, setIaCampo] = React.useState<{ nome: string; rotulo: string } | null>(null);
    /** Ofício recebido (GED) a que este responde — a IA lê o PDF para sugerir a resposta. */
    const recebidoGedId = React.useMemo(() => {
        const gravado = vinculos.find(v => v.tipo === 'RESPONDE' && v.de_documento_id === atualId && v.para_ged_id)?.para_ged_id;
        if (gravado) return gravado;
        const pend = pendentes.find(x => x.tipo === 'RESPONDE' && 'gedId' in x.alvo);
        return pend && 'gedId' in pend.alvo ? pend.alvo.gedId : null;
    }, [vinculos, pendentes, atualId]);

    /** Vínculos escolhidos antes do primeiro "Salvar" — gravados quando o ofício passa a existir. */
    const gravarPendentes = async (doc: DocGenDocumento) => {
        for (const p of pendentes) {
            await docGenDocumentoService.vincular({
                organization_id: doc.organization_id, de: { documentoId: doc.id },
                para: 'documentoId' in p.alvo ? { documentoId: p.alvo.documentoId } : { gedId: p.alvo.gedId }, tipo: p.tipo,
            }).catch(e => showToast(e instanceof Error ? e.message : 'Falha ao gravar o vínculo.', 'error'));
        }
        setPendentes([]);
    };
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
                const ctx = await montarContexto(draft, { organization, companies, projects, nomeDepartamento, emailUsuario, emRespostaA });
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
    }, [draft, organization, companies, projects, nomeDepartamento, emailUsuario, modelo, emRespostaA]);

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
            if (!atual) await gravarPendentes(doc);
            setAtual(doc);
            markSaved();
            setSavedAt(Date.now());
            const perdeuAprovacao = atual?.approval_status === 'APROVADO' && doc.approval_status !== 'APROVADO';
            const tinhaAssinatura = !!atual && assinaturasValidas(atual.signatarios, assinaturas, atual.versao).some(Boolean);
            showToast(
                !atual ? 'Rascunho criado.'
                    : perdeuAprovacao || tinhaAssinatura
                        ? `Rascunho salvo (versão ${doc.versao}). O texto mudou: ${[perdeuAprovacao ? 'a aprovação' : '', tinhaAssinatura ? 'as assinaturas' : ''].filter(Boolean).join(' e ')} precisa(m) ser refeita(s).`
                        : `Rascunho salvo (versão ${doc.versao}).`,
                'success',
            );
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
    const depsEmissao = () => ({ modelo, organization, companies, projects, nomeDepartamento, emailUsuario, emRespostaA });

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
                const novo = !base;
                base = base ? await docGenDocumentoService.salvar(base, draft) : await docGenDocumentoService.create(draft);
                if (novo) await gravarPendentes(base);
                setAtual(base);
                markSaved();
            }
            const emitido = await emitirOficio(base, depsEmissao());
            setAtual(emitido);
            onSaved(emitido);
            if (emitido.resposta_esperada_ate) {
                await docGenDocumentoService.garantirTarefaDePrazo({
                    id: emitido.id, organizationId: emitido.organization_id, prazo: emitido.resposta_esperada_ate,
                    titulo: `Cobrar resposta do ofício ${emitido.numero ?? ''}`.trim(),
                    descricao: `${emitido.assunto} — ${emitido.destinatario_snapshot?.razao_social ?? ''}`,
                }).catch(e => console.warn('[NovoOficioTela] tarefa do prazo não criada:', e));
            }
            // Respondeu um ofício recebido: a tarefa "Responder…" daquele recebido acabou.
            const respondidos = await docGenDocumentoService.listVinculosDoDocumento(emitido.id).catch(() => []);
            for (const v of respondidos) {
                if (v.tipo === 'RESPONDE' && v.de_documento_id === emitido.id && v.para_ged_id) {
                    await docGenDocumentoService.concluirTarefaDePrazo(v.para_ged_id, 'oficio_recebido');
                }
            }
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
            const ctx = await montarContexto(draft, { organization, companies, projects, nomeDepartamento, emailUsuario, emRespostaA });
            const v = valoresDoDocumento(modelo, ctx, draft.valores);
            // Assinatura só vale para a versão salva: com alteração pendente, a prévia sai sem o carimbo.
            const blocoAssinaturas = await assinaturasParaPdf(
                { id: atual?.id ?? '', versao: atual?.versao ?? 0, signatarios: draft.signatarios }, organization, dirty || !atual ? [] : assinaturas,
            );
            setPreviaBlob(await previaDoDocumento({
                conteudoModelo: modelo.conteudo,
                layout: modelo.layout,
                titulo: draft.assunto || modelo.nome,
                valores: v,
                camposLivres: draft.conteudo,
                assinaturas: blocoAssinaturas,
                anexos: draft.anexos.map(a => a.nome),
                organization,
                numero: atual?.numero ?? null,
                validacaoUrl: atual ? urlDeValidacao(atual.id) : null,
                tabelas: tabelasDoDocumento(modelo, ctx),
                paginasAnexas: draft.anexos_no_pdf
                    ? await import('../../services/docGen/anexosNoPdf').then(m => m.rasterizarAnexos(orgId, draft.anexos))
                    : null,
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
    const subtitulo = atual && atual.status !== 'RASCUNHO'
        ? `${ROTULO_SITUACAO[atual.status]} · emitido em ${emitidoEm} por ${atual.emitido_por ?? '—'} · modelo "${modelo.nome}" (v${draft.modelo_versao})`
        : atual
            ? `Rascunho · versão ${atual.versao}${emAprovacao ? ' · em aprovação' : atual.approval_status === 'APROVADO' ? ' · aprovado' : ''} · modelo "${modelo.nome}" (v${draft.modelo_versao})`
            : `Modelo "${modelo.nome}" · ${CATEGORIA_GED_LABEL[modelo.categoria_ged]}`;
    const faltamAssinar = atual
        ? draft.signatarios.filter((_, i) => !assinaturasValidas(atual.signatarios, assinaturas, atual.versao)[i]).map(s => s.nome)
        : draft.signatarios.map(s => s.nome);
    const motivoEmitir = calculando ? 'Conferindo os dados…'
        : bloqueado ? `${qtdPendencias} pendência(s) impede(m) a emissão — veja a Validação.`
        : emAprovacao ? 'O ofício está em aprovação — aguarde a decisão para emitir.'
        : (modelo.exige_aprovacao || modelo.exige_assinatura) && (dirty || !atual) ? 'Salve o rascunho antes — a aprovação e as assinaturas valem para a versão salva.'
        : modelo.exige_aprovacao && atual?.approval_status !== 'APROVADO' ? 'Este modelo exige aprovação antes da emissão — envie para aprovação.'
        : modelo.exige_assinatura && faltamAssinar.length ? `Falta a assinatura de: ${faltamAssinar.join(', ')}.`
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

            {atual && atual.status !== 'RASCUNHO' && atual.status !== 'CANCELADO' && !atual.ged_document_id && (
                <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1 min-w-[240px]">O número {atual.numero} foi emitido, mas o PDF ainda não está no GED.</span>
                    <button type="button" onClick={arquivarDeNovo} disabled={emitindo}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50">
                        {emitindo ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <FolderOpen className="w-[15px] h-[15px]" />} Gerar PDF e arquivar no GED
                    </button>
                </div>
            )}
            {emAprovacao && (
                <div className="flex items-start gap-2 rounded-[10px] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                    Ofício em aprovação: o texto está travado até a decisão. Para alterar, use "Retirar da aprovação" na seção Aprovação e assinaturas.
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
                            <div className="flex items-center justify-between gap-3">
                                <label className={LABEL}>{c.rotulo}</label>
                                {!somenteLeitura && (
                                    <button type="button" onClick={() => setIaCampo(c)} title="Redigir, revisar ou responder com a ajuda da IA — a sugestão só entra se você escolher"
                                        className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100">
                                        <Sparkles className="w-4 h-4" /> Assistente de IA
                                    </button>
                                )}
                            </div>
                            {somenteLeitura ? (
                                <div className="rounded-[10px] border border-gray-100 px-4 py-3 text-sm text-gray-500">Documento emitido — texto congelado.</div>
                            ) : (
                                <EditorRico
                                    value={(draft.conteudo[c.nome] as DocTipTap | undefined) ?? DOC_TIPTAP_VAZIO}
                                    onChange={doc => set('conteudo', { ...draft.conteudo, [c.nome]: doc })}
                                    modo="documento"
                                    organizationId={orgId}
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
                    {draft.anexos.some(a => a.tipo === 'GED') && (
                        <label className="flex items-start gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={draft.anexos_no_pdf} disabled={somenteLeitura}
                                onChange={e => set('anexos_no_pdf', e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600" />
                            <span>
                                <span className="block">Incluir os anexos do GED dentro do PDF do ofício</span>
                                <span className="block text-xs text-gray-400">Cada página entra como imagem depois do texto (PDF e imagens; até 30 páginas). Outros formatos ficam só no GED.</span>
                            </span>
                        </label>
                    )}
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

            {/* Validação — card próprio: tem estado (§30, "bloco com estado ganha card"). Só antes de emitir. */}
            {ehRascunho && <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
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
            </div>}

            {(!atual || atual.status === 'RASCUNHO') && (
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4" id="secao-aprovacao">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Aprovação e assinaturas</h3>
                    </div>
                    <AprovacaoAssinaturaCard
                        documento={atual}
                        modelo={modelo}
                        dirty={dirty}
                        membros={organization?.members ?? []}
                        emailUsuario={emailUsuario}
                        assinaturas={assinaturas}
                        onDocumento={doc => { setAtual(doc); onSaved(doc); }}
                        onAssinaturasMudaram={() => void recarregarExtras()}
                    />
                </div>
            )}

            {atual && atual.status !== 'RASCUNHO' && (
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Tramitação</h3>
                        <span className="text-xs text-gray-400">envio, protocolo, resposta e prazo</span>
                    </div>
                    <TramitacaoCard
                        documento={atual}
                        onDocumento={doc => { setAtual(doc); onSaved(doc); void recarregarExtras(); }}
                        onCancelar={cancelar}
                        onArquivarResposta={() => setRegistrandoResposta(true)}
                        emitente={valores['empresa.razao_social'] || (companies.find(c => c.id === atual.company_id)?.razao_social ?? organization?.name ?? '')}
                        onHistoricoMudou={() => void recarregarExtras()}
                    />
                </div>
            )}

            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Documentos relacionados</h3>
                    {emRespostaA && <span className="text-xs text-gray-400 truncate" title={emRespostaA}>em resposta a: {emRespostaA}</span>}
                </div>
                <VinculosPainel
                    documentoId={atual?.id ?? null}
                    vinculos={vinculos}
                    pendentes={pendentes}
                    documentos={documentos}
                    recebidos={recebidos}
                    rascunho={!somenteLeitura}
                    onAdicionar={(tipo, alvo) => void adicionarVinculo(tipo, alvo)}
                    onRemover={v => void removerVinculo(v)}
                    onAbrirOficio={async id => { if (await confirmDiscard()) onAbrirOficio(id); }}
                    onAbrirGed={id => navigateToFocus('opura-docs', id, 'GED_DOCUMENTO')}
                />
            </div>

            {atual && (
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Histórico</h3>
                    </div>
                    <HistoricoDocumento eventos={eventos} carregando={carregandoExtras && eventos.length === 0} />
                </div>
            )}

            <div className="sticky bottom-0 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-white/95 backdrop-blur border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
                {atual && <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />}
                <button type="button" onClick={handleBack} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                    {atual ? 'Voltar' : 'Cancelar'}
                </button>
                <button type="button" onClick={abrirPrevia}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95">
                    <Eye className="w-[15px] h-[15px]" /> Prévia em PDF
                </button>
                {ehRascunho && (
                    <button type="button" onClick={salvar} disabled={salvando || emAprovacao || (!!atual && !dirty)}
                        title={emAprovacao ? 'Em aprovação — retire da aprovação para editar' : atual && !dirty ? 'Nada alterado desde o último salvamento' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-blue-200 text-blue-700 rounded-[6px] hover:bg-blue-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Save className="w-[15px] h-[15px]" />}
                        {salvando ? 'Salvando…' : 'Salvar rascunho'}
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
                {ehRascunho && (
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
            <AssistenteIASheet
                aberto={!!iaCampo}
                onClose={() => setIaCampo(null)}
                organizationId={orgId}
                campo={iaCampo}
                textoAtual={iaCampo ? ((draft.conteudo[iaCampo.nome] as DocTipTap | undefined) ?? null) : null}
                contexto={{
                    assunto: draft.assunto,
                    destinatario: draft.destinatario_snapshot ? [draft.destinatario_snapshot.razao_social, draft.destinatario_snapshot.contato_nome && `A/C ${draft.destinatario_snapshot.contato_nome}`].filter(Boolean).join(' — ') : null,
                    emitente: valores['empresa.razao_social'] || organization?.name,
                    obra: valores['obra.nome'] || null,
                    contrato: [valores['contrato.numero'], valores['contrato.titulo']].filter(Boolean).join(' — ') || null,
                    em_resposta_a: emRespostaA || null,
                    data_do_documento: draft.data_documento ?? 'automática (a da emissão)',
                    prazo_de_resposta: draft.resposta_esperada_ate,
                }}
                recebidoGedId={recebidoGedId}
                recebidoDescricao={emRespostaA || null}
                onAplicar={doc => { if (iaCampo) set('conteudo', { ...draft.conteudo, [iaCampo.nome]: doc }); }}
            />
            <PreviewPdf open={previaAberta} onClose={() => setPreviaAberta(false)} titulo={draft.assunto || modelo.nome}
                blob={previaBlob} carregando={previaCarregando} erro={previaErro} />
            {atual && atual.status !== 'RASCUNHO' && (
                <RegistrarRecebidoSheet
                    open={registrandoResposta}
                    onClose={() => setRegistrandoResposta(false)}
                    organizationId={atual.organization_id}
                    emitidos={[atual]}
                    respostaA={atual}
                    emailUsuario={emailUsuario}
                    onRegistrado={async r => {
                        onRecebidoRegistrado(r);
                        const relido = await docGenDocumentoService.get(atual.id).catch(() => null);
                        if (relido) { setAtual(relido); onSaved(relido); }
                        void recarregarExtras();
                    }}
                />
            )}
        </div>
    );
}
