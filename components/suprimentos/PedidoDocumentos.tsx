import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, LayoutGrid, List, Loader2, Paperclip, Receipt, Search, Upload } from 'lucide-react';
// Ilustração do topo do cartão (pedido do usuário em 14/11/2026: "altere a
// imagem do card pelo anexo") — substitui o ícone Receipt.
import ilustracaoNotaFiscal from '../../assets/ilustracoes/nota-fiscal.webp';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import CartaoRecibo from '../ui/CartaoRecibo';
import { usePersistedScopedSearch, usePersistedState } from '../ui/TableUtils';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { useConfirm } from '../ui/confirm';
import { formatMoney, formatDateBR, formatDateTimeBR } from '../ui/Format';
import { pedidoDocumentoService, type NotaVinculadaAoPedido } from '../../services/pedidoDocumentoService';
import {
    ACCEPT_DOCUMENTO_PEDIDO,
    CATEGORIAS_DOCUMENTO_PEDIDO,
    barrasDoCodigo,
    codigoCurtoDocumento,
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
 * Os documentos têm duas visualizações, à escolha do usuário (09/11/2026:
 * "não é para substituir e sim criar uma opção de visualização"): tabela
 * (padrão) e cartões com cara de recibo de papel (`CartaoRecibo`, guia §34).
 * A busca é UMA só e vale nos dois modos.
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
        // Botão ativo do alternador cartões/lista (§5: azul sólido no app).
        toggleAtivo: 'bg-blue-600 text-white',
    },
    portal: {
        solidBtn: 'bg-[#E1553C] hover:bg-[#C8452E]',
        ring: 'focus:border-[#E1553C]',
        link: 'text-[#C24428] hover:text-[#A8381F] hover:bg-[#FDEDE8]',
        toggleAtivo: 'bg-[#E1553C] text-white',
    },
} as const;

// Soma 1.000 + 130 de ações: cabe na área útil do detalhe (~1.150 px com a
// barra lateral). Antes somava 1.240 e a coluna de ações ficava cortada.
const COLUNAS_DOCUMENTOS: StandardTableColumn[] = [
    { key: 'categoria', label: 'Categoria', sortable: true, width: 120 },
    { key: 'arquivo', label: 'Arquivo', sortable: true, width: 250 },
    { key: 'descricao', label: 'Descrição', sortable: true, width: 170 },
    { key: 'enviadoPor', label: 'Enviado por', sortable: true, width: 180 },
    { key: 'tamanho', label: 'Tamanho', sortable: true, width: 110, align: 'right' },
    { key: 'data', label: 'Data', sortable: true, width: 170 },
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

    const [modo, setModo] = usePersistedState<'cards' | 'list'>('suprimentos:pedido:documentos:viewMode', 'list');
    const [busca, setBusca] = usePersistedScopedSearch('suprimentos:pedido:documentos:busca', orderId);

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

    const textoDeBusca = (d: DocumentoPedido) =>
        `${d.fileName} ${d.descricao ?? ''} ${rotuloCategoriaDocumento(d.categoria)} ${d.enviadoPor ?? ''}`;
    const termo = busca.trim().toLowerCase();
    const filtrados = termo ? documentos.filter(d => textoDeBusca(d).toLowerCase().includes(termo)) : documentos;
    // Cartões na ordem padrão da tabela: mais recentes primeiro.
    const cartoes = [...filtrados].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const botaoAbrir = (d: DocumentoPedido) => (
        <button
            type="button"
            onClick={() => abrirEmNovaAba(d.id, () => pedidoDocumentoService.urlDoDocumento(d, portalToken))}
            disabled={abrindoId === d.id}
            className={`text-sm font-medium p-1.5 rounded-lg transition-all disabled:opacity-60 ${A.link}`}
        >
            {abrindoId === d.id ? 'Abrindo…' : 'Abrir'}
        </button>
    );

    // Desligado, o ActionIconButton não recebe hover: o motivo mora no span em volta.
    const botaoExcluir = (d: DocumentoPedido) => {
        const motivo = motivoNaoExcluir(d, ehComprador);
        return (
            <span className="inline-flex" title={motivo ?? undefined}>
                <ActionIconButton kind="delete" disabled={!!motivo} onClick={() => excluir(d)} />
            </span>
        );
    };

    // Alternador cartões/tabela (§5.1, molde de LaborDocuments) + ação primária
    // (§17), os mesmos nos dois modos.
    // Num grupo só: no celular a régua empilha, e alternador + botão ficam na
    // mesma linha, à direita, em vez de duas linhas centralizadas.
    const controles = (
        <div className="flex items-center justify-end gap-2.5 w-full md:w-auto shrink-0">
            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                <button type="button" onClick={() => setModo('cards')} title="Visualização em cards" aria-pressed={modo === 'cards'}
                    className={`p-1.5 rounded-[6px] transition-all ${modo === 'cards' ? A.toggleAtivo : 'text-gray-400 hover:text-gray-600'}`}>
                    <LayoutGrid className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setModo('list')} title="Visualização em lista" aria-pressed={modo === 'list'}
                    className={`p-1.5 rounded-[6px] transition-all ${modo === 'list' ? A.toggleAtivo : 'text-gray-400 hover:text-gray-600'}`}>
                    <List className="w-4 h-4" />
                </button>
            </div>
            <button
                type="button"
                onClick={() => setFormAberto(true)}
                className={`flex items-center gap-1.5 h-9 px-3.5 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0 ${A.solidBtn}`}
            >
                <Upload className="w-[15px] h-[15px]" />
                Enviar documento
            </button>
        </div>
    );

    const vazio = {
        icon: <Paperclip className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
        title: 'Nenhum documento anexado',
        subtitle: 'Envie notas fiscais, recibos, comprovantes ou boletos deste pedido. Comprador e fornecedor veem os mesmos arquivos.',
    };

    return (
        <div className="space-y-6">
            {modo === 'cards' ? (
                /* §5.2 — régua e grade no mesmo card. */
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-2 border-b border-gray-100 bg-white">
                        <div className="flex flex-col md:flex-row gap-2.5 items-center">
                            <div className="flex-1 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar documento..."
                                    value={busca}
                                    onChange={e => setBusca(e.target.value)}
                                    className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                            {controles}
                        </div>
                    </div>
                    {cartoes.length === 0 ? (
                        <div className="text-center py-12">
                            {vazio.icon}
                            <h3 className="text-lg font-bold text-gray-900 mb-2">{termo ? 'Nenhum documento encontrado' : vazio.title}</h3>
                            <p className="text-sm text-gray-500">{termo ? 'Tente ajustar a busca.' : vazio.subtitle}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 p-6 bg-gray-50">
                            {cartoes.map(d => (
                                <CartaoRecibo
                                    key={d.id}
                                    titulo={rotuloCategoriaDocumento(d.categoria)}
                                    icone={<img src={ilustracaoNotaFiscal} alt="" aria-hidden className="h-20 w-auto select-none" draggable={false} />}
                                    numero={codigoCurtoDocumento(d.id)}
                                    numeroTitulo={d.id}
                                    subtitulo={formatDateTimeBR(d.createdAt)}
                                    linhas={[
                                        { rotulo: 'Arquivo', valor: d.fileName, titulo: d.fileName },
                                        { rotulo: 'Tamanho', valor: tamanhoLegivel(d.sizeBytes), numerico: true },
                                        {
                                            rotulo: 'Enviado por',
                                            valor: `${d.enviadoPorLado === 'FORNECEDOR' ? 'Fornecedor' : 'Comprador'}${d.enviadoPor ? ` · ${d.enviadoPor}` : ''}`,
                                            titulo: d.enviadoPor ?? undefined,
                                        },
                                    ]}
                                    observacao={d.descricao}
                                    barras={barrasDoCodigo(d.id)}
                                    rodape={<>{botaoAbrir(d)}{botaoExcluir(d)}</>}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <StandardTable<DocumentoPedido>
                    storageKey="suprimentos:pedido:documentos"
                    columns={COLUNAS_DOCUMENTOS}
                    rows={documentos}
                    rowKey={d => d.id}
                    search={busca}
                    onSearchChange={setBusca}
                    searchText={textoDeBusca}
                    searchPlaceholder="Buscar documento..."
                    filters={controles}
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
                                return <span className="text-sm font-normal text-gray-700 whitespace-nowrap">{tamanhoLegivel(d.sizeBytes)}</span>;
                            default:
                                return <span className="text-sm font-normal text-gray-700">{formatDateTimeBR(d.createdAt)}</span>;
                        }
                    }}
                    actions={{
                        width: 130,
                        render: d => (
                            <div className="flex items-center justify-end gap-1.5">
                                {botaoAbrir(d)}
                                {botaoExcluir(d)}
                            </div>
                        ),
                    }}
                    empty={vazio}
                />
            )}

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
