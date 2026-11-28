import React from 'react';
import { AlertCircle, ArrowLeft, Camera, CheckCircle2, ExternalLink, FileText, Loader2, PackageCheck, Paperclip, RefreshCw } from 'lucide-react';
import Button from '../../ui/Button';
import { rotuloStatusLogistico, situacaoDaRetirada } from '../../../utils/formaEntrega';
import { motivoParaNaoReceber, podeReceber, saldoPorItem } from '../../../lib/recebimento';
import { ACCEPT_DOCUMENTO_PEDIDO, erroDoArquivoDocumento, rotuloCategoriaDocumento, type CategoriaDocumentoPedido } from '../../../lib/pedidoDocumentos';
import { fraseDoFinanceiro, type FonteRecebimento, type PedidoAberto } from '../../../services/recebimentoFonte';
import ConferenciaForm from './ConferenciaForm';
import RetiradaForm from './RetiradaForm';

/**
 * Um pedido no Recebimento do celular: o que ele espera (conferir ou retirar), os itens
 * com o saldo a receber, os documentos (enviar NF/recibo) e o histórico de conferências e
 * divergências (só leitura — resolver divergência continua no computador).
 */

interface Props {
    fonte: FonteRecebimento;
    orderId: string;
    onVoltar: () => void;
    /** A lista precisa recarregar (o pedido mudou de grupo). */
    onMudou: () => void;
    onVerPedidoCompleto?: (orderId: string) => void;
}

const COR_DO_STATUS: Record<string, string> = {
    'Confirmado': 'text-gray-800', 'Separação': 'text-blue-700', 'Em Trânsito': 'text-indigo-800',
    'Entregue': 'text-amber-800', 'Recebido': 'text-green-800', 'Divergência': 'text-red-600',
    'Parcial': 'text-amber-800', 'Pendente': 'text-red-600', 'Resolvida': 'text-green-800', 'Aceita': 'text-gray-800', 'Devolvida': 'text-gray-800',
    'Enviado': 'text-blue-600',
};
const ROTULO_PROBLEMA: Record<string, string> = { faltando: 'faltou', quebrado: 'quebrado' };
const dataCurta = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : '—');
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

type Tela = 'detalhe' | 'conferir' | 'retirar';
type Aviso = { texto: string; tipo: 'ok' | 'erro' } | null;

const RecebimentoDetalhe: React.FC<Props> = ({ fonte, orderId, onVoltar, onMudou, onVerPedidoCompleto }) => {
    const [pedido, setPedido] = React.useState<PedidoAberto | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [versao, setVersao] = React.useState(0);
    const [tela, setTela] = React.useState<Tela>('detalhe');
    const [aviso, setAviso] = React.useState<Aviso>(null);
    const [urls, setUrls] = React.useState<Record<string, string>>({});
    const [categoria, setCategoria] = React.useState<CategoriaDocumentoPedido>('NOTA_FISCAL');
    const [enviando, setEnviando] = React.useState(false);
    const arquivoRef = React.useRef<HTMLInputElement>(null);
    const avisoTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

    const avisar = React.useCallback((a: NonNullable<Aviso>) => {
        clearTimeout(avisoTimer.current);
        setAviso(a);
        avisoTimer.current = setTimeout(() => setAviso(null), 4500);
    }, []);
    React.useEffect(() => () => clearTimeout(avisoTimer.current), []);

    React.useEffect(() => {
        let cancelado = false;
        setErro(null);
        fonte.abrir(orderId)
            .then(p => { if (!cancelado) setPedido(p); })
            .catch((e: unknown) => { if (!cancelado) setErro(e instanceof Error && e.message ? e.message : 'Não consegui abrir o pedido.'); });
        return () => { cancelado = true; };
    }, [fonte, orderId, versao]);

    // Assina os arquivos do pedido (comprovantes e documentos) para abrir.
    React.useEffect(() => {
        if (!pedido) return;
        const paths = [
            ...pedido.conferencias.map(c => c.foto).filter((p): p is string => !!p),
            ...pedido.documentos.map(d => d.path),
        ];
        if (paths.length === 0) return;
        let cancelado = false;
        fonte.assinar(pedido.id, paths).then(u => { if (!cancelado) setUrls(u); }).catch(() => { /* abrir arquivo é extra */ });
        return () => { cancelado = true; };
    }, [fonte, pedido]);

    const recarregar = () => { setVersao(v => v + 1); onMudou(); };

    if (erro) {
        return (
            <div className="space-y-4">
                <Cabecalho titulo="Pedido" onVoltar={onVoltar} />
                <div role="alert" className="text-center py-10 bg-white rounded-[10px] border border-gray-100">
                    <AlertCircle className="w-10 h-10 text-red-600 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-sm font-semibold text-gray-900 max-w-[32ch] mx-auto">{erro}</p>
                    <Button variant="secondary" onClick={() => setVersao(v => v + 1)} className="mt-3">
                        <RefreshCw className="w-4 h-4" /> Tentar de novo
                    </Button>
                </div>
            </div>
        );
    }
    if (!pedido) {
        return (
            <div className="space-y-4">
                <Cabecalho titulo="Pedido" onVoltar={onVoltar} />
                <div role="status" className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" aria-hidden="true" />
                    <p className="mt-2 text-gray-500 text-sm">Carregando…</p>
                </div>
            </div>
        );
    }

    const anteriores = pedido.conferencias.map(c => ({
        status: c.status,
        itens: c.itens.map(i => ({ indice: i.indice, code: i.code, quantidadeRecebida: Number(i.recebida) })),
    }));
    const saldo = saldoPorItem(pedido.itens, anteriores);
    const recebe = podeReceber(pedido.status, pedido.fob);
    const retirada = situacaoDaRetirada(pedido.status);
    const retira = pedido.fob && retirada.pode;

    if (tela === 'conferir') {
        return (
            <ConferenciaForm
                fonte={fonte}
                pedido={pedido}
                saldo={saldo}
                onCancelar={() => setTela('detalhe')}
                onGravado={r => {
                    setTela('detalhe');
                    const fin = fraseDoFinanceiro(r.financeiro);
                    const base = r.status === 'Recebido' ? 'Recebimento confirmado.'
                        : r.status === 'Parcial' ? 'Recebimento parcial registrado — o resto fica a receber.'
                        : 'Recebimento registrado com divergência.';
                    avisar({ texto: fin ? `${base} ${fin}` : base, tipo: 'ok' });
                    recarregar();
                }}
            />
        );
    }
    if (tela === 'retirar') {
        return (
            <RetiradaForm
                fonte={fonte}
                pedido={pedido}
                onCancelar={() => setTela('detalhe')}
                onGravado={r => {
                    setTela('detalhe');
                    const fin = fraseDoFinanceiro(r.financeiro);
                    avisar({ texto: fin ? `Retirada registrada. ${fin}` : 'Retirada registrada. Agora é só conferir.', tipo: 'ok' });
                    recarregar();
                }}
            />
        );
    }

    const enviarDocumento = async (file: File) => {
        const problema = erroDoArquivoDocumento(file);
        if (problema) { avisar({ texto: problema, tipo: 'erro' }); return; }
        setEnviando(true);
        try {
            await fonte.enviarDocumento({ orderId: pedido.id, file, categoria, descricao: null });
            avisar({ texto: `${rotuloCategoriaDocumento(categoria)} enviado.`, tipo: 'ok' });
            setVersao(v => v + 1);
        } catch (e) {
            avisar({ texto: e instanceof Error && e.message ? e.message : 'O arquivo não foi enviado.', tipo: 'erro' });
        } finally {
            setEnviando(false);
            if (arquivoRef.current) arquivoRef.current.value = '';
        }
    };

    const motivoReceber = motivoParaNaoReceber(pedido.status, pedido.fob);

    return (
        <div className="space-y-6 pb-6">
            <Cabecalho
                titulo={pedido.numero || 'Pedido'}
                subtitulo={[pedido.fornecedor, pedido.obra, pedido.org_nome].filter(Boolean).join(' · ')}
                onVoltar={onVoltar}
            />

            {/* O que o pedido espera */}
            <section className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className={`text-sm font-normal ${COR_DO_STATUS[pedido.status] || 'text-gray-600'}`}>
                        {rotuloStatusLogistico(pedido.status, pedido.fob)}
                    </span>
                    <span className="text-xs text-gray-500">
                        {pedido.fob ? 'Retirada pelo comprador (FOB)' : 'Entrega do fornecedor (CIF)'}
                        {pedido.previsao ? ` · previsão ${dataCurta(pedido.previsao)}` : ''}
                    </span>
                </div>
                {pedido.fob && pedido.retirado_por && (
                    <p className="text-sm text-gray-700">Retirado por {pedido.retirado_por.nome} em {dataCurta(pedido.data_retirada)}.</p>
                )}
                {recebe && (
                    <button type="button" onClick={() => setTela('conferir')}
                        className="w-full flex items-center justify-center gap-2 h-11 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-sm active:scale-[0.99] transition-all">
                        <PackageCheck className="w-4 h-4" /> Conferir e receber
                    </button>
                )}
                {retira && (
                    <button type="button" onClick={() => setTela('retirar')}
                        className="w-full flex items-center justify-center gap-2 h-11 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-sm active:scale-[0.99] transition-all">
                        <CheckCircle2 className="w-4 h-4" /> Registrar retirada
                    </button>
                )}
                {!recebe && !retira && motivoReceber && pedido.status !== 'Recebido' && pedido.status !== 'Divergência' && (
                    <p className="text-sm text-gray-600">{motivoReceber}</p>
                )}
            </section>

            {/* Itens e saldo */}
            <section aria-labelledby="receber-itens" className="space-y-3">
                <h2 id="receber-itens" className="text-base font-semibold text-gray-900">Itens</h2>
                <ul className="bg-white rounded-[10px] border border-gray-100 shadow-sm divide-y divide-gray-100">
                    {pedido.itens.map((it, i) => (
                        <li key={i} className="px-4 py-3 flex items-start gap-3">
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm text-gray-900">{it.description || it.code || `Item ${i + 1}`}</span>
                                <span className="block text-xs text-gray-500">Pedido: {qtd(it.quantity)} {it.unit || ''}</span>
                            </span>
                            <span className={`text-sm font-normal whitespace-nowrap ${saldo[i] > 0 ? 'text-amber-800' : 'text-green-800'}`}>
                                {saldo[i] > 0 ? `a receber ${qtd(saldo[i])}` : 'recebido'}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            {/* Documentos */}
            <section aria-labelledby="receber-docs" className="space-y-3">
                <h2 id="receber-docs" className="text-base font-semibold text-gray-900">Nota fiscal e recibos</h2>
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 items-end">
                        <div className="space-y-1.5">
                            <label htmlFor="receber-doc-categoria" className="block text-xs font-semibold text-slate-500">Tipo</label>
                            <select id="receber-doc-categoria" value={categoria} onChange={e => setCategoria(e.target.value as CategoriaDocumentoPedido)}
                                className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900">
                                <option value="NOTA_FISCAL">Nota fiscal</option>
                                <option value="RECIBO">Recibo</option>
                                <option value="COMPROVANTE">Comprovante</option>
                                <option value="OUTRO">Outro</option>
                            </select>
                        </div>
                        <button type="button" disabled={enviando} onClick={() => arquivoRef.current?.click()}
                            title={enviando ? 'Enviando o arquivo…' : undefined}
                            className="flex items-center justify-center gap-1.5 h-9 px-3 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] disabled:opacity-60">
                            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                            {enviando ? 'Enviando…' : 'Foto ou arquivo'}
                        </button>
                        <input ref={arquivoRef} type="file" accept={ACCEPT_DOCUMENTO_PEDIDO} className="sr-only" aria-label="Arquivo do documento"
                            onChange={e => { const f = e.target.files?.[0]; if (f) void enviarDocumento(f); }} />
                    </div>
                    {pedido.documentos.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhum documento neste pedido.</p>
                    ) : (
                        <ul className="divide-y divide-gray-100 -mx-4">
                            {pedido.documentos.map(d => (
                                <li key={d.id} className="px-4 py-2.5 flex items-center gap-3">
                                    <FileText className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm text-gray-900 truncate" title={d.arquivo}>{d.arquivo}</span>
                                        <span className="block text-xs text-gray-500">
                                            {rotuloCategoriaDocumento(d.categoria)} · {dataCurta(d.criado_em)}{d.lado === 'FORNECEDOR' ? ' · do fornecedor' : ''}
                                        </span>
                                    </span>
                                    {urls[d.path] && (
                                        <a href={urls[d.path]} target="_blank" rel="noreferrer" title="Abrir"
                                            className="flex items-center justify-center h-9 w-9 rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-blue-600">
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>

            {/* Histórico */}
            {(pedido.conferencias.length > 0 || pedido.divergencias.length > 0) && (
                <section aria-labelledby="receber-historico" className="space-y-3">
                    <h2 id="receber-historico" className="text-base font-semibold text-gray-900">Conferências</h2>
                    <ul className="space-y-3">
                        {pedido.conferencias.map((c, n) => (
                            <li key={c.id} className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-2">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                    <span className="text-sm font-medium text-gray-900">Conferência {n + 1}</span>
                                    <span className={`text-sm font-normal ${COR_DO_STATUS[c.status] || 'text-gray-600'}`}>{c.status}</span>
                                </div>
                                <p className="text-xs text-gray-500">
                                    {dataHora(c.recebido_em)}{c.recebido_por ? ` · ${c.recebido_por}` : ''}{c.origem === 'LINK' ? ' · pelo link do celular' : ''}
                                </p>
                                <ul className="text-sm text-gray-700 space-y-0.5">
                                    {c.itens.map((i, k) => (
                                        <li key={k}>
                                            {i.description || i.code}: {qtd(Number(i.recebida))} de {qtd(Number(i.pedida))} {i.unit || ''}
                                            {i.problema ? <span className="text-red-600"> · {ROTULO_PROBLEMA[i.problema] ?? i.problema}</span> : null}
                                        </li>
                                    ))}
                                </ul>
                                {c.notas && <p className="text-sm text-gray-700 italic">“{c.notas}”</p>}
                                {c.foto && urls[c.foto] && (
                                    <a href={urls[c.foto]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600">
                                        <Paperclip className="w-4 h-4" /> Ver foto do comprovante
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                    {pedido.divergencias.length > 0 && (
                        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-2">
                            <h3 className="text-sm font-semibold text-gray-900">Divergências</h3>
                            <ul className="space-y-2">
                                {pedido.divergencias.map(d => (
                                    <li key={d.id} className="text-sm text-gray-700">
                                        <span className="text-gray-900">{d.description}</span>: {qtd(Number(d.quantity))} {d.unit || ''} {ROTULO_PROBLEMA[d.issue ?? ''] ?? d.issue}
                                        {' · '}<span className={COR_DO_STATUS[d.status] || 'text-gray-600'}>{d.status}</span>
                                        {d.resposta_fornecedor && <span className="block text-xs text-gray-500">Fornecedor: {d.resposta_fornecedor}</span>}
                                        {d.resolucao && <span className="block text-xs text-gray-500">Resolução: {d.resolucao}</span>}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-gray-500">Resolver divergência continua no computador, em Suprimentos › Recebimento.</p>
                        </div>
                    )}
                </section>
            )}

            {onVerPedidoCompleto && (
                <button type="button" onClick={() => onVerPedidoCompleto(pedido.id)}
                    className="w-full flex items-center justify-center gap-1.5 h-11 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px]">
                    Ver pedido completo
                </button>
            )}

            {aviso && (
                <div role={aviso.tipo === 'erro' ? 'alert' : 'status'}
                    className={`fixed bottom-6 right-6 left-6 sm:left-auto z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                        aviso.tipo === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {aviso.texto}
                </div>
            )}
        </div>
    );
};

export const Cabecalho: React.FC<{ titulo: string; subtitulo?: string; onVoltar: () => void }> = ({ titulo, subtitulo, onVoltar }) => (
    <div>
        <div className="flex items-center gap-3">
            <button type="button" onClick={onVoltar} title="Voltar"
                className="flex items-center justify-center h-9 w-9 -ml-2 rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all shrink-0">
                <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-gray-900 truncate">{titulo}</h1>
        </div>
        {subtitulo && <p className="text-gray-500 text-sm mt-1 ml-12 truncate">{subtitulo}</p>}
    </div>
);

export default RecebimentoDetalhe;
