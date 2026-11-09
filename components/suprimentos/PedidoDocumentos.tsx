import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Paperclip, Receipt, Upload } from 'lucide-react';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { useConfirm } from '../ui/confirm';
import { formatMoney, formatDateBR, formatDateTimeBR } from '../ui/Format';
import { pedidoDocumentoService, type NotaVinculadaAoPedido } from '../../services/pedidoDocumentoService';
import {
    ACCEPT_DOCUMENTO_PEDIDO,
    CATEGORIAS_DOCUMENTO_PEDIDO,
    erroDoArquivoDocumento,
    motivoNaoExcluir,
    rotuloCategoriaDocumento,
    tamanhoLegivel,
    type CategoriaDocumentoPedido,
    type DocumentoPedido,
} from '../../lib/pedidoDocumentos';

/**
 * Pedido de compra › Recebimento › Documentos.
 *
 * Pedido do usuário em 09/11/2026: "criar aba para upload de notas fiscais,
 * recibos etc" — dentro de Recebimento. Plano:
 * docs/planos/2026-11-09-pedido-compra-documentos.md
 *
 * Dois blocos:
 *   1. Documentos do pedido — anexos que comprador e fornecedor enviam. O anexo
 *      só GUARDA o arquivo: NF anexada aqui não entra no fiscal nem gera título.
 *   2. Notas fiscais vinculadas — as que já chegam ao pedido por outros módulos
 *      (nota do fornecedor, NF-e importada), só para leitura. A gestão delas
 *      continua em Contas a Pagar › Notas — o motivo de a seção "Documentos
 *      Fiscais" ter saído deste pedido em 21/08 era justamente ter dois lugares.
 *
 * A lista de documentos mora no PAI (o badge da sub-aba conta ela, e ela chega
 * junto dos demais anexos do pedido); este componente só a recebe e devolve.
 */

// Acento da tela de detalhe (§24): o mesmo componente serve app e portal.
const ACCENTS = {
    indigo: {
        solidBtn: 'bg-indigo-600 hover:bg-indigo-700',
        ring: 'focus:border-indigo-600',
        link: 'text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50',
    },
    portal: {
        solidBtn: 'bg-[#E1553C] hover:bg-[#C8452E]',
        ring: 'focus:border-[#E1553C]',
        link: 'text-[#C24428] hover:text-[#A8381F] hover:bg-[#FDEDE8]',
    },
} as const;

const COLUNAS_DOCUMENTOS: StandardTableColumn[] = [
    { key: 'categoria', label: 'Categoria', sortable: true, width: 140 },
    { key: 'arquivo', label: 'Arquivo', sortable: true, width: 280 },
    { key: 'descricao', label: 'Descrição', sortable: true, width: 240 },
    { key: 'enviadoPor', label: 'Enviado por', sortable: true, width: 200 },
    { key: 'tamanho', label: 'Tamanho', sortable: true, width: 100, align: 'right' },
    { key: 'data', label: 'Data', sortable: true, width: 150 },
];

const COLUNAS_NOTAS: StandardTableColumn[] = [
    { key: 'origem', label: 'Origem', sortable: true, width: 170 },
    { key: 'numero', label: 'Número', sortable: true, width: 110 },
    { key: 'emitente', label: 'Emitente / arquivo', sortable: true, width: 300 },
    { key: 'valor', label: 'Valor', sortable: true, width: 140, align: 'right' },
    { key: 'data', label: 'Data', sortable: true, width: 120 },
];

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white transition-colors';

interface PedidoDocumentosProps {
    orderId: string;
    portalToken?: string;
    ehComprador: boolean;
    accent?: 'indigo' | 'portal';
    documentos: DocumentoPedido[];
    onDocumentosChange: (docs: DocumentoPedido[]) => void;
    notify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const PedidoDocumentos: React.FC<PedidoDocumentosProps> = ({
    orderId, portalToken, ehComprador, accent = 'indigo', documentos, onDocumentosChange, notify,
}) => {
    const A = ACCENTS[accent];
    const confirmar = useConfirm();
    const [enviando, setEnviando] = useState(false);
    const [formAberto, setFormAberto] = useState(false);
    const [abrindoId, setAbrindoId] = useState<string | null>(null);

    const [notas, setNotas] = useState<NotaVinculadaAoPedido[]>([]);
    const [carregandoNotas, setCarregandoNotas] = useState(true);

    useEffect(() => {
        let cancelado = false;
        setCarregandoNotas(true);
        pedidoDocumentoService.notasVinculadas(orderId, { portalToken, ehComprador })
            .then(n => { if (!cancelado) setNotas(n); })
            .finally(() => { if (!cancelado) setCarregandoNotas(false); });
        return () => { cancelado = true; };
    }, [orderId, portalToken, ehComprador]);

    // URL assinada no CLIQUE. A aba abre antes do await: depois dele o
    // navegador trata o window.open como pop-up não pedido.
    const abrirEmNovaAba = async (id: string, gerarUrl: () => Promise<string>) => {
        const aba = window.open('', '_blank');
        setAbrindoId(id);
        try {
            const url = await gerarUrl();
            if (aba) aba.location.href = url; else window.open(url, '_blank', 'noopener,noreferrer');
        } catch (e) {
            aba?.close();
            notify(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.', 'error');
        } finally {
            setAbrindoId(null);
        }
    };

    const excluir = async (doc: DocumentoPedido) => {
        const ok = await confirmar({
            title: 'Excluir documento?',
            message: `"${doc.fileName}" sai do pedido para o comprador e o fornecedor. Essa ação não pode ser desfeita.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await pedidoDocumentoService.excluir(doc, portalToken);
            onDocumentosChange(documentos.filter(d => d.id !== doc.id));
            notify('Documento excluído.');
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Erro ao excluir o documento.', 'error');
        }
    };

    const enviar = async (form: { arquivo: File; categoria: CategoriaDocumentoPedido; descricao: string }) => {
        setEnviando(true);
        try {
            const novo = await pedidoDocumentoService.enviar({
                orderId,
                file: form.arquivo,
                categoria: form.categoria,
                descricao: form.descricao,
                lado: ehComprador ? 'COMPRADOR' : 'FORNECEDOR',
                portalToken,
            });
            onDocumentosChange([novo, ...documentos]);
            setFormAberto(false);
            notify('Documento enviado.');
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Erro ao enviar o documento.', 'error');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="space-y-6">
            <StandardTable<DocumentoPedido>
                storageKey="suprimentos:pedido:documentos"
                searchScope={orderId}
                columns={COLUNAS_DOCUMENTOS}
                rows={documentos}
                rowKey={d => d.id}
                searchText={d => `${d.fileName} ${d.descricao ?? ''} ${rotuloCategoriaDocumento(d.categoria)} ${d.enviadoPor ?? ''}`}
                searchPlaceholder="Buscar documento..."
                defaultSort={{ column: 'data', direction: 'desc' }}
                sortValue={(key, d) => {
                    switch (key) {
                        case 'categoria': return rotuloCategoriaDocumento(d.categoria);
                        case 'arquivo': return d.fileName.toLowerCase();
                        case 'descricao': return (d.descricao ?? '').toLowerCase();
                        case 'enviadoPor': return `${d.enviadoPorLado} ${d.enviadoPor ?? ''}`;
                        case 'tamanho': return d.sizeBytes ?? 0;
                        default: return d.createdAt;
                    }
                }}
                renderCell={(key, d) => {
                    switch (key) {
                        case 'categoria':
                            return <span className="text-sm font-normal text-gray-700">{rotuloCategoriaDocumento(d.categoria)}</span>;
                        case 'arquivo':
                            return (
                                <span className="flex items-center gap-2 min-w-0 text-sm font-normal text-gray-900" title={d.fileName}>
                                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                                    <span className="truncate">{d.fileName}</span>
                                </span>
                            );
                        case 'descricao':
                            return <span className="block truncate text-sm font-normal text-gray-700" title={d.descricao ?? undefined}>{d.descricao || '—'}</span>;
                        case 'enviadoPor':
                            return (
                                <span className="block truncate text-sm font-normal text-gray-700" title={d.enviadoPor ?? undefined}>
                                    {d.enviadoPorLado === 'FORNECEDOR' ? 'Fornecedor' : 'Comprador'}
                                    {d.enviadoPor ? <span className="text-gray-500"> · {d.enviadoPor}</span> : null}
                                </span>
                            );
                        case 'tamanho':
                            return <span className="text-sm font-normal text-gray-700">{tamanhoLegivel(d.sizeBytes)}</span>;
                        default:
                            return <span className="text-sm font-normal text-gray-700">{formatDateTimeBR(d.createdAt)}</span>;
                    }
                }}
                actions={{
                    width: 130,
                    render: d => {
                        const motivo = motivoNaoExcluir(d, ehComprador);
                        return (
                            <div className="flex items-center justify-end gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => abrirEmNovaAba(d.id, () => pedidoDocumentoService.urlDoDocumento(d, portalToken))}
                                    disabled={abrindoId === d.id}
                                    className={`text-sm font-medium p-1.5 rounded-lg transition-all disabled:opacity-60 ${A.link}`}
                                >
                                    {abrindoId === d.id ? 'Abrindo…' : 'Abrir'}
                                </button>
                                {/* Desligado, o ActionIconButton não recebe hover:
                                    o motivo mora no span em volta. */}
                                <span className="inline-flex" title={motivo ?? undefined}>
                                    <ActionIconButton kind="delete" disabled={!!motivo} onClick={() => excluir(d)} />
                                </span>
                            </div>
                        );
                    },
                }}
                toolbarRight={
                    <button
                        type="button"
                        onClick={() => setFormAberto(true)}
                        className={`flex items-center gap-1.5 h-9 px-3.5 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0 ${A.solidBtn}`}
                    >
                        <Upload className="w-[15px] h-[15px]" />
                        Enviar documento
                    </button>
                }
                empty={{
                    icon: <Paperclip className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum documento anexado',
                    subtitle: 'Envie notas fiscais, recibos, comprovantes ou boletos deste pedido. Comprador e fornecedor veem os mesmos arquivos.',
                }}
            />

            <div className="space-y-3">
                <SecaoTitulo
                    icon={Receipt}
                    titulo="Notas fiscais vinculadas ao pedido"
                    resumo={ehComprador && !portalToken
                        ? 'Só leitura — a gestão fica em Financeiro › Contas a Pagar › Notas.'
                        : 'Só leitura — notas enviadas na aba Nota Fiscal do portal e ligadas a este pedido.'}
                />
                <StandardTable<NotaVinculadaAoPedido>
                    storageKey="suprimentos:pedido:notas-vinculadas"
                    columns={COLUNAS_NOTAS}
                    rows={notas}
                    rowKey={n => `${n.origem}:${n.id}`}
                    loading={carregandoNotas}
                    defaultSort={{ column: 'data', direction: 'desc' }}
                    sortValue={(key, n) => {
                        switch (key) {
                            case 'origem': return n.origem;
                            case 'numero': return Number(n.numero ?? 0);
                            case 'emitente': return (n.emitente ?? n.arquivo?.nome ?? '').toLowerCase();
                            case 'valor': return n.valor ?? 0;
                            default: return n.data ?? '';
                        }
                    }}
                    renderCell={(key, n) => {
                        switch (key) {
                            case 'origem':
                                return <span className="text-sm font-normal text-gray-700">{n.origem === 'NFE' ? 'NF-e importada' : 'Enviada pelo fornecedor'}</span>;
                            case 'numero':
                                return <span className="text-sm font-normal text-gray-700">{n.numero ?? '—'}</span>;
                            case 'emitente': {
                                const texto = n.emitente ?? n.arquivo?.nome ?? '—';
                                return <span className="block truncate text-sm font-normal text-gray-900" title={texto}>{texto}</span>;
                            }
                            case 'valor':
                                return <span className="text-sm font-medium text-gray-800">{n.valor != null ? formatMoney(n.valor) : '—'}</span>;
                            default:
                                return <span className="text-sm font-normal text-gray-700">{n.data ? formatDateBR(n.data) : '—'}</span>;
                        }
                    }}
                    actions={{
                        width: 100,
                        render: n => (
                            <div className="flex items-center justify-end">
                                <span className="inline-flex" title={n.arquivo ? undefined : 'Esta nota não tem arquivo guardado'}>
                                    <button
                                        type="button"
                                        onClick={() => abrirEmNovaAba(`nota:${n.id}`, () => pedidoDocumentoService.urlDaNota(n, portalToken))}
                                        disabled={!n.arquivo || abrindoId === `nota:${n.id}`}
                                        className={`text-sm font-medium p-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${A.link}`}
                                    >
                                        {abrindoId === `nota:${n.id}` ? 'Abrindo…' : 'Abrir'}
                                    </button>
                                </span>
                            </div>
                        ),
                    }}
                    empty={{
                        icon: <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Nenhuma nota fiscal vinculada',
                        subtitle: 'Notas importadas no fiscal ou enviadas pelo fornecedor aparecem aqui quando ligadas a este pedido.',
                    }}
                />
            </div>

            <EnviarDocumentoSheet
                open={formAberto}
                onClose={() => setFormAberto(false)}
                enviando={enviando}
                onEnviar={enviar}
                accent={accent}
            />
        </div>
    );
};

interface EnviarDocumentoSheetProps {
    open: boolean;
    onClose: () => void;
    enviando: boolean;
    onEnviar: (form: { arquivo: File; categoria: CategoriaDocumentoPedido; descricao: string }) => void;
    accent: 'indigo' | 'portal';
}

const EnviarDocumentoSheet: React.FC<EnviarDocumentoSheetProps> = ({ open, onClose, enviando, onEnviar, accent }) => {
    const A = ACCENTS[accent];
    const fileRef = useRef<HTMLInputElement>(null);
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [categoria, setCategoria] = useState<CategoriaDocumentoPedido>('NOTA_FISCAL');
    const [descricao, setDescricao] = useState('');
    const [erro, setErro] = useState<string | null>(null);

    // Cada abertura começa limpa.
    useEffect(() => {
        if (!open) return;
        setArquivo(null);
        setCategoria('NOTA_FISCAL');
        setDescricao('');
        setErro(null);
    }, [open]);

    const escolher = (f: File | null) => {
        if (!f) return;
        const problema = erroDoArquivoDocumento(f);
        setErro(problema);
        setArquivo(problema ? null : f);
    };

    const motivoDesligado = enviando ? 'Enviando…' : !arquivo ? 'Escolha um arquivo' : null;

    return (
        <Sheet open={open} onClose={onClose} size="lg" dirty={!!arquivo && !enviando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Enviar documento</SheetTitle>
                <SheetDescription>
                    O arquivo fica guardado no pedido, visível para o comprador e o fornecedor. Não lança nota fiscal nem título a pagar.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-8">
                <div className="space-y-4">
                    <SecaoTitulo icon={Paperclip} titulo="Arquivo" />
                    <input
                        ref={fileRef}
                        type="file"
                        accept={ACCEPT_DOCUMENTO_PEDIDO}
                        className="hidden"
                        onChange={e => { escolher(e.target.files?.[0] ?? null); e.target.value = ''; }}
                    />
                    {arquivo ? (
                        <div className="flex items-center gap-3 p-3 rounded-[6px] border border-gray-100 bg-gray-50">
                            <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-sm text-gray-900" title={arquivo.name}>{arquivo.name}</span>
                            <span className="text-sm text-gray-500 shrink-0">{tamanhoLegivel(arquivo.size)}</span>
                            <button type="button" onClick={() => setArquivo(null)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Remover</button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); escolher(e.dataTransfer.files?.[0] ?? null); }}
                            className="w-full flex flex-col items-center gap-2 py-8 rounded-[10px] border border-dashed border-gray-300 bg-gray-50 hover:bg-white transition-colors"
                        >
                            <Upload className="w-6 h-6 text-gray-400" />
                            <span className="text-sm font-medium text-gray-700">Clique ou arraste o arquivo aqui</span>
                            <span className="text-xs text-gray-500">PDF, XML ou imagem (JPG, PNG, WEBP, HEIC) · até 10 MB</span>
                        </button>
                    )}
                    {erro && (
                        <p className="flex items-center gap-1.5 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4 shrink-0" /> {erro}
                        </p>
                    )}
                </div>

                <div className="space-y-4">
                    <SecaoTitulo icon={FileText} titulo="Identificação" />
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO}>Categoria</label>
                            <select
                                value={categoria}
                                onChange={e => setCategoria(e.target.value as CategoriaDocumentoPedido)}
                                className={`${CAMPO} ${A.ring}`}
                            >
                                {CATEGORIAS_DOCUMENTO_PEDIDO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={ROTULO}>Descrição</label>
                            <input
                                type="text"
                                value={descricao}
                                maxLength={500}
                                onChange={e => setDescricao(e.target.value)}
                                placeholder="Ex.: NF 1234 — entrega parcial"
                                className={`${CAMPO} ${A.ring}`}
                            />
                        </div>
                    </div>
                </div>
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 px-3.5 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-[6px] transition-all"
                    >
                        Cancelar
                    </button>
                    <span className="inline-flex" title={motivoDesligado ?? undefined}>
                        <button
                            type="button"
                            onClick={() => arquivo && onEnviar({ arquivo, categoria, descricao })}
                            disabled={!!motivoDesligado}
                            className={`flex items-center gap-1.5 h-9 px-3.5 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${A.solidBtn}`}
                        >
                            {enviando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <CheckCircle2 className="w-[15px] h-[15px]" />}
                            Enviar
                        </button>
                    </span>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default PedidoDocumentos;
