import React from 'react';
import { ExternalLink, FileSignature, FileText, Loader2, Lock, Plus, ScrollText } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { abrirArquivoAssinado, BUCKET_DOCUMENTOS } from '../../lib/storageAssinado';
import {
    negociacaoDocumentosService, ROTULO_TIPO_DOCUMENTO,
    type DocumentoDaNegociacao, type TipoDocumentoNegociacao,
} from '../../services/negociacaoDocumentosService';
import { EnviarParaAssinaturaSheet } from './EnviarParaAssinaturaSheet';
import { AcompanharAssinaturaSheet } from './AcompanharAssinaturaSheet';

/**
 * Negociação › Documentos: os PDFs da negociação (proposta, reserva, ficha,
 * vistoria, distrato) e a assinatura interna deles. Venda e locação.
 * Tabela §6.10 (`StandardTable`), status em texto colorido (§8), ações §9.
 * Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (F5).
 */

const COLUMNS: StandardTableColumn[] = [
    { key: 'kind', label: 'Tipo', sortable: true, width: 170 },
    { key: 'nome', label: 'Documento', sortable: true, width: 300 },
    { key: 'v', label: 'Versão', sortable: true, width: 90 },
    { key: 'assinatura', label: 'Assinatura', sortable: true, width: 170 },
    { key: 'created_at', label: 'Data', sortable: true, width: 110 },
];

const ASSINATURA: Record<string, { texto: string; cor: string }> = {
    SENT: { texto: 'Aguardando', cor: 'text-amber-600' },
    SIGNED: { texto: 'Assinado', cor: 'text-emerald-600' },
    CANCELLED: { texto: 'Cancelada', cor: 'text-gray-500' },
    EXPIRED: { texto: 'Prazo vencido', cor: 'text-red-600' },
};

const TIPOS = Object.keys(ROTULO_TIPO_DOCUMENTO) as TipoDocumentoNegociacao[];
const inputCls = 'w-full px-3 h-9 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const fmtData = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
const ehPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

interface Props {
    dealId: string;
    organizationId: string;
    /** Rótulo da negociação no título que vai no e-mail ("Venda — Apto 101"). */
    rotulo: string;
    /** Monta o PDF da proposta com os dados atuais (o DealModal sabe montar). */
    gerarProposta?: () => { blob: Blob; nomeArquivo: string } | null;
    /** Por que a proposta não pode ser gerada agora — `null` quando pode. */
    motivoSemProposta?: string | null;
    onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function DocumentosDaNegociacaoPanel({ dealId, organizationId, rotulo, gerarProposta, motivoSemProposta = null, onNotify }: Props) {
    const confirm = useConfirm();
    const [docs, setDocs] = React.useState<DocumentoDaNegociacao[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [ocupado, setOcupado] = React.useState<string | null>(null);

    const [novoAberto, setNovoAberto] = React.useState(false);
    const [novoTipo, setNovoTipo] = React.useState<TipoDocumentoNegociacao>('RESERVA');
    const [novoNome, setNovoNome] = React.useState('');
    const [novoArquivo, setNovoArquivo] = React.useState<File | null>(null);
    const [arquivoRecusado, setArquivoRecusado] = React.useState<string | null>(null);
    const [subindo, setSubindo] = React.useState(false);
    const arquivoRef = React.useRef<HTMLInputElement>(null);

    const [paraEnviar, setParaEnviar] = React.useState<DocumentoDaNegociacao | null>(null);
    const [acompanhando, setAcompanhando] = React.useState<DocumentoDaNegociacao | null>(null);

    const notifyRef = React.useRef(onNotify);
    notifyRef.current = onNotify;

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        try {
            setDocs(await negociacaoDocumentosService.listar(dealId));
        } catch (e) {
            notifyRef.current(`Erro ao carregar documentos: ${e instanceof Error ? e.message : ''}`, 'error');
        } finally {
            setCarregando(false);
        }
    }, [dealId]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    const tituloDe = (d: DocumentoDaNegociacao) => `${ROTULO_TIPO_DOCUMENTO[d.kind]} — ${rotulo}${d.v > 1 ? ` (v${d.v})` : ''}`;

    const abrirNovo = () => {
        setNovoTipo('RESERVA'); setNovoNome(''); setNovoArquivo(null); setArquivoRecusado(null);
        if (arquivoRef.current) arquivoRef.current.value = '';
        setNovoAberto(true);
    };

    const subirNovo = async () => {
        if (!novoArquivo) return;
        setSubindo(true);
        try {
            const doc = await negociacaoDocumentosService.subir({
                organizationId, dealId, kind: novoTipo, nome: novoNome.trim() || ROTULO_TIPO_DOCUMENTO[novoTipo],
                arquivo: novoArquivo, nomeArquivo: novoArquivo.name,
            });
            setDocs(ds => [doc, ...ds]);
            setNovoAberto(false);
            onNotify('Documento adicionado.', 'success');
        } catch (e) {
            onNotify(`Erro ao subir: ${e instanceof Error ? e.message : ''}`, 'error');
        } finally { setSubindo(false); }
    };

    const gravarProposta = async () => {
        const gerado = gerarProposta?.();
        if (!gerado) return;
        setOcupado('proposta');
        try {
            const doc = await negociacaoDocumentosService.subir({
                organizationId, dealId, kind: 'PROPOSTA', nome: 'Proposta', arquivo: gerado.blob,
                nomeArquivo: gerado.nomeArquivo, source: 'SISTEMA',
            });
            setDocs(ds => [doc, ...ds]);
            onNotify('Proposta gravada na negociação. Agora ela pode ser enviada para assinatura.', 'success');
        } catch (e) {
            onNotify(`Erro ao gravar a proposta: ${e instanceof Error ? e.message : ''}`, 'error');
        } finally { setOcupado(null); }
    };

    const excluir = async (d: DocumentoDaNegociacao) => {
        const ok = await confirm({
            title: `Excluir "${d.nome}"?`,
            message: 'O arquivo é removido junto. Esta ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        setOcupado(d.id);
        try {
            await negociacaoDocumentosService.excluir(d);
            setDocs(ds => ds.filter(x => x.id !== d.id));
            onNotify('Documento excluído.', 'success');
        } catch (e) {
            onNotify(e instanceof Error ? e.message : 'Erro ao excluir.', 'error');
        } finally { setOcupado(null); }
    };

    const motivoNaoEnvia = (d: DocumentoDaNegociacao) =>
        d.signature_status === 'SIGNED' ? 'Documento já assinado'
            : d.signature_status === 'SENT' ? 'Assinatura em andamento'
            : null;

    return (
        <>
            <StandardTable<DocumentoDaNegociacao>
                storageKey="negociacao:documentos"
                searchScope={dealId}
                columns={COLUMNS}
                rows={docs}
                rowKey={d => d.id}
                loading={carregando}
                searchText={d => `${ROTULO_TIPO_DOCUMENTO[d.kind]} ${d.nome}`}
                searchPlaceholder="Buscar por tipo ou documento..."
                sortValue={(key, d) => {
                    switch (key) {
                        case 'kind': return ROTULO_TIPO_DOCUMENTO[d.kind];
                        case 'nome': return d.nome;
                        case 'v': return d.v;
                        case 'assinatura': return d.signature_status ? ASSINATURA[d.signature_status]?.texto ?? '' : '';
                        case 'created_at': return d.created_at;
                        default: return null;
                    }
                }}
                renderCell={(key, d) => {
                    switch (key) {
                        case 'kind': return <span className="text-sm font-normal text-gray-700">{ROTULO_TIPO_DOCUMENTO[d.kind]}</span>;
                        case 'nome': return <span className="block truncate text-sm font-normal text-gray-700" title={d.nome}>{d.nome}</span>;
                        case 'v': return <span className="text-sm font-normal text-gray-600">v{d.v}</span>;
                        case 'assinatura': {
                            const a = d.signature_status ? ASSINATURA[d.signature_status] : null;
                            return a ? <span className={`text-sm font-normal ${a.cor}`}>{a.texto}</span> : <span className="text-sm font-normal text-gray-400">—</span>;
                        }
                        case 'created_at': return <span className="text-sm font-normal text-gray-600">{fmtData(d.created_at)}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 230,
                    render: d => {
                        const naoEnvia = motivoNaoEnvia(d);
                        const naoExclui = d.assinatura_envelope_id ? 'Documento enviado para assinatura não pode ser excluído' : null;
                        return (
                            <div className="flex items-center justify-end gap-1.5">
                                {!d.assinatura_envelope_id || d.signature_status === 'CANCELLED' || d.signature_status === 'EXPIRED' ? (
                                    <span title={naoEnvia ?? undefined} className="inline-flex">
                                        <button type="button" onClick={() => setParaEnviar(d)} disabled={!!naoEnvia}
                                            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50">
                                            <FileSignature className="w-3.5 h-3.5" /> Enviar para assinar
                                        </button>
                                    </span>
                                ) : (
                                    <button type="button" onClick={() => setAcompanhando(d)}
                                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all">
                                        <FileSignature className="w-3.5 h-3.5" /> Acompanhar
                                    </button>
                                )}
                                <ActionIconButton kind="view" title={d.signed_path ? 'Abrir via assinada' : 'Abrir documento'} icon={<ExternalLink className="w-4 h-4" />}
                                    onClick={() => {
                                        abrirArquivoAssinado(BUCKET_DOCUMENTOS, d.signed_path || d.storage_path)
                                            .catch(e => notifyRef.current(e instanceof Error ? e.message : 'Não foi possível abrir o documento.', 'error'));
                                    }} />
                                <span title={naoExclui ?? undefined} className="inline-flex">
                                    <ActionIconButton kind="delete" title={naoExclui ?? 'Excluir documento'} disabled={!!naoExclui || ocupado === d.id}
                                        icon={naoExclui ? <Lock className="w-4 h-4" /> : undefined} onClick={() => void excluir(d)} />
                                </span>
                            </div>
                        );
                    },
                }}
                empty={{
                    icon: <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum documento ainda',
                    subtitle: 'Grave a proposta ou suba o PDF da reserva, ficha, vistoria ou distrato.',
                }}
                toolbarRight={
                    <div className="flex items-center gap-2 shrink-0">
                        {gerarProposta && (
                            <span title={motivoSemProposta ?? undefined}>
                                <button type="button" onClick={() => void gravarProposta()} disabled={!!motivoSemProposta || ocupado === 'proposta'}
                                    className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed">
                                    {ocupado === 'proposta' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <ScrollText className="w-[15px] h-[15px]" />}
                                    Gravar proposta
                                </button>
                            </span>
                        )}
                        <button type="button" onClick={abrirNovo}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                            <Plus className="w-[15px] h-[15px]" /> Novo documento
                        </button>
                    </div>
                }
            />

            <Sheet open={novoAberto} onClose={() => setNovoAberto(false)} size="md" dirty={!!novoArquivo && !subindo}>
                <SheetHeader onClose={() => setNovoAberto(false)}>
                    <SheetTitle>Novo documento da negociação</SheetTitle>
                    <SheetDescription>PDF que pode ser enviado para assinatura no portal.</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="doc-neg-tipo" className="text-xs font-semibold text-slate-500">Tipo</label>
                            <select id="doc-neg-tipo" value={novoTipo} onChange={e => setNovoTipo(e.target.value as TipoDocumentoNegociacao)} className={inputCls}>
                                {TIPOS.map(t => <option key={t} value={t}>{ROTULO_TIPO_DOCUMENTO[t]}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="doc-neg-nome" className="text-xs font-semibold text-slate-500">Nome</label>
                            <input id="doc-neg-nome" value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder={ROTULO_TIPO_DOCUMENTO[novoTipo]} className={inputCls} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-500">Arquivo (PDF)</p>
                        {/* Input escondido + botão: o seletor nativo muda de idioma conforme o navegador. */}
                        <input ref={arquivoRef} type="file" accept="application/pdf" className="hidden"
                            onChange={e => {
                                const f = e.target.files?.[0] ?? null;
                                if (f && !ehPdf(f)) { setNovoArquivo(null); setArquivoRecusado(`"${f.name}" não é PDF.`); return; }
                                setArquivoRecusado(null); setNovoArquivo(f);
                            }} />
                        <div className="flex items-center gap-3">
                            <button type="button" onClick={() => arquivoRef.current?.click()}
                                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                                <FileText className="w-[15px] h-[15px]" /> Escolher arquivo
                            </button>
                            <span className="text-sm text-gray-700 truncate">{novoArquivo?.name ?? 'Nenhum arquivo escolhido'}</span>
                        </div>
                        {arquivoRecusado && <p className="text-xs text-red-700">{arquivoRecusado}</p>}
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button type="button" onClick={() => setNovoAberto(false)} className="h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                        Cancelar
                    </button>
                    <span title={!novoArquivo ? 'Escolha o PDF do documento' : undefined}>
                        <button type="button" onClick={() => void subirNovo()} disabled={!novoArquivo || subindo}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed">
                            {subindo ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Plus className="w-[15px] h-[15px]" />} Adicionar
                        </button>
                    </span>
                </SheetFooter>
            </Sheet>

            <EnviarParaAssinaturaSheet
                aberto={!!paraEnviar}
                onFechar={() => setParaEnviar(null)}
                origem={paraEnviar ? { tipo: 'DEAL_DOC', id: paraEnviar.id } : null}
                titulo={paraEnviar ? tituloDe(paraEnviar) : ''}
                organizationId={organizationId}
                dealId={dealId}
                onEnviado={async r => {
                    const semEmail = r.signatarios.filter(s => !s.email_enviado);
                    setParaEnviar(null);
                    await carregar();
                    onNotify(semEmail.length
                        ? `Enviado, mas o e-mail não saiu para: ${semEmail.map(s => s.nome).join(', ')}.`
                        : `Enviado para ${r.signatarios.length} signatário${r.signatarios.length > 1 ? 's' : ''}.`,
                        semEmail.length ? 'error' : 'success');
                }}
            />
            <AcompanharAssinaturaSheet
                aberto={!!acompanhando}
                onFechar={() => setAcompanhando(null)}
                origem={acompanhando ? { tipo: 'DEAL_DOC', id: acompanhando.id } : null}
                titulo={acompanhando ? tituloDe(acompanhando) : ''}
                onAbrirAssinado={acompanhando?.signed_path ? () => {
                    abrirArquivoAssinado(BUCKET_DOCUMENTOS, acompanhando.signed_path)
                        .catch(e => notifyRef.current(e instanceof Error ? e.message : 'Não foi possível abrir o documento.', 'error'));
                } : undefined}
                onMudou={() => void carregar()}
                onNotify={onNotify}
            />
        </>
    );
}

export default DocumentosDaNegociacaoPanel;
