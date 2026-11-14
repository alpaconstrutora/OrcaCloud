import React from 'react';
import { Camera, ImagePlus, X, Loader2, CheckCircle2, AlertTriangle, Building2, Search, RotateCcw, ArrowRight, Receipt } from 'lucide-react';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { formatMoney } from '../ui/Format';
import { MAX_FOTOS_FAST, type ResultadoDoPedidoFast } from '../../lib/pedidoFast';
import { ErroPedidoFast, type FontePedidoFast, type LeituraDoLote } from '../../services/pedidoFastService';

/**
 * Pedido Fast — os DOIS passos do comprador (foto da nota/recibo + obra) e o
 * resultado. Plano: docs/planos/2026-11-14-pedido-fast.md (Parte 1, item 7).
 *
 * Um componente só para o celular (`PedidoFastMobile`), o Sheet do desktop
 * (`SupplyChainOrderList`) e — Parte 2 — a aba do link do celular: quem muda é a
 * `fonte` (logado × link). A leitura começa assim que a foto é tirada; o
 * comprador escolhe a obra enquanto a IA lê. Tocar em "Criar pedido" antes do
 * fim da leitura só espera ela acabar.
 */

export interface ObraDoFast {
    id: string;
    nome: string;
    /** Só em "Todas as organizações" — duas obras de mesmo nome em orgs diferentes. */
    organizacao?: string | null;
}

interface Props {
    fonte: FontePedidoFast;
    obras: ObraDoFast[];
    /** Chave do localStorage da última obra usada (conveniência por navegador). */
    chaveUltimaObra?: string;
    onCriado?: (r: ResultadoDoPedidoFast) => void;
    onVerPedido?: (pedidoId: string) => void;
    /** Tem foto tirada e o pedido ainda não foi criado (guarda de saída do Sheet). */
    onPendenteChange?: (pendente: boolean) => void;
}

type EstadoDaLeitura =
    | { tipo: 'vazio' }
    | { tipo: 'lendo' }
    | { tipo: 'lida'; lote: LeituraDoLote }
    | { tipo: 'erro'; mensagem: string };

interface FotoNaTela { file: File; url: string }

const ROTULO = 'block text-xs font-semibold text-slate-500';
const MAX_OBRAS_SEM_BUSCA = 8;

function lerUltimaObra(chave?: string): string {
    if (!chave) return '';
    try { return localStorage.getItem(chave) ?? ''; } catch { return ''; }
}

const PedidoFastFluxo: React.FC<Props> = ({ fonte, obras, chaveUltimaObra = 'pedidoFast:ultimaObra', onCriado, onVerPedido, onPendenteChange }) => {
    const [fotos, setFotos] = React.useState<FotoNaTela[]>([]);
    const [leitura, setLeitura] = React.useState<EstadoDaLeitura>({ tipo: 'vazio' });
    const [obraId, setObraId] = React.useState<string>(() => {
        const ultima = lerUltimaObra(chaveUltimaObra);
        return obras.some(o => o.id === ultima) ? ultima : '';
    });
    const [busca, setBusca] = React.useState('');
    const [criando, setCriando] = React.useState(false);
    const [aguardandoLeitura, setAguardandoLeitura] = React.useState(false);
    const [erroCriar, setErroCriar] = React.useState<string | null>(null);
    const [resultado, setResultado] = React.useState<ResultadoDoPedidoFast | null>(null);
    const cameraRef = React.useRef<HTMLInputElement>(null);
    const galeriaRef = React.useRef<HTMLInputElement>(null);
    const seqLeitura = React.useRef(0);

    // As obras chegam depois (store carregando): pré-seleciona a última usada.
    React.useEffect(() => {
        if (obraId || obras.length === 0) return;
        const ultima = lerUltimaObra(chaveUltimaObra);
        if (obras.some(o => o.id === ultima)) setObraId(ultima);
        else if (obras.length === 1) setObraId(obras[0].id);
    }, [obras, obraId, chaveUltimaObra]);

    React.useEffect(() => { onPendenteChange?.(fotos.length > 0 && !resultado); }, [fotos.length, resultado, onPendenteChange]);
    React.useEffect(() => () => { fotos.forEach(f => URL.revokeObjectURL(f.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const ler = React.useCallback(async (lista: FotoNaTela[]) => {
        const seq = ++seqLeitura.current;
        if (lista.length === 0) { setLeitura({ tipo: 'vazio' }); return; }
        setLeitura({ tipo: 'lendo' });
        try {
            const lote = await fonte.ler(lista.map(f => f.file));
            if (seq === seqLeitura.current) setLeitura({ tipo: 'lida', lote });
        } catch (e) {
            if (seq !== seqLeitura.current) return;
            setLeitura({ tipo: 'erro', mensagem: e instanceof ErroPedidoFast ? e.message : 'Não consegui enviar a foto. Confira a internet e tente de novo.' });
            setAguardandoLeitura(false);
        }
    }, [fonte]);

    const adicionarFotos = (arquivos: FileList | null) => {
        if (!arquivos?.length) return;
        const novas = Array.from(arquivos)
            .filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
            .slice(0, MAX_FOTOS_FAST - fotos.length)
            .map(file => ({ file, url: URL.createObjectURL(file) }));
        if (novas.length === 0) return;
        const lista = [...fotos, ...novas];
        setFotos(lista);
        setErroCriar(null);
        void ler(lista);
    };

    const removerFoto = (i: number) => {
        URL.revokeObjectURL(fotos[i].url);
        const lista = fotos.filter((_, k) => k !== i);
        setFotos(lista);
        void ler(lista);
    };

    const criar = React.useCallback(async () => {
        if (leitura.tipo !== 'lida' || !obraId) return;
        setCriando(true);
        setErroCriar(null);
        try {
            const r = await fonte.criar(leitura.lote.lote, obraId);
            try { localStorage.setItem(chaveUltimaObra, obraId); } catch { /* conveniência: sem storage, segue */ }
            setResultado(r);
            onCriado?.(r);
        } catch (e) {
            setErroCriar(e instanceof ErroPedidoFast ? e.message : 'Não consegui criar o pedido. Tente de novo.');
        } finally {
            setCriando(false);
            setAguardandoLeitura(false);
        }
    }, [leitura, obraId, fonte, chaveUltimaObra, onCriado]);

    // Tocou em "Criar pedido" durante a leitura: cria assim que ela terminar.
    React.useEffect(() => {
        if (aguardandoLeitura && leitura.tipo === 'lida' && obraId && !criando) void criar();
    }, [aguardandoLeitura, leitura, obraId, criando, criar]);

    const recomecar = () => {
        fotos.forEach(f => URL.revokeObjectURL(f.url));
        seqLeitura.current++;
        setFotos([]);
        setLeitura({ tipo: 'vazio' });
        setResultado(null);
        setErroCriar(null);
        setAguardandoLeitura(false);
    };

    const obrasFiltradas = React.useMemo(() => {
        const t = busca.trim().toLowerCase();
        const lista = t ? obras.filter(o => `${o.nome} ${o.organizacao ?? ''}`.toLowerCase().includes(t)) : obras;
        return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [obras, busca]);

    // ── Resultado ────────────────────────────────────────────────────────────
    if (resultado) {
        return (
            <div className="space-y-4">
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-base font-semibold text-gray-900">Pedido {resultado.numero} criado</p>
                            <p className="text-sm text-gray-600 mt-0.5">
                                {resultado.leituraFalhou
                                    ? 'Com a foto anexada. Os itens ficam para o gestor lançar.'
                                    : `${resultado.itens.length} ${resultado.itens.length === 1 ? 'item' : 'itens'} · ${formatMoney(resultado.total)}`}
                            </p>
                            <p className="text-sm text-gray-600">
                                {resultado.fornecedorNome
                                    ? <>Fornecedor {resultado.fornecedorNome}{resultado.fornecedorCadastrado ? ' (cadastrado agora)' : ''}</>
                                    : 'Fornecedor a conferir pelo gestor'}
                            </p>
                        </div>
                    </div>
                    {!resultado.leituraFalhou && !resultado.totalConfere && (
                        <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-[6px] px-3 py-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            A soma dos itens não bateu com o total da nota — o gestor confere no pedido.
                        </p>
                    )}
                    <p className="text-xs text-gray-500">Os gestores foram avisados. O pedido está como Retirado, aguardando a conferência.</p>
                </div>

                {resultado.itens.length > 0 && (
                    <ul className="bg-white rounded-[10px] border border-gray-100 shadow-sm divide-y divide-gray-100">
                        {resultado.itens.map(i => (
                            <li key={i.code} className="flex items-start justify-between gap-3 px-4 py-2.5">
                                <span className="text-sm text-gray-700 min-w-0">
                                    {i.description}
                                    <span className="block text-xs text-gray-500">{i.quantity.toLocaleString('pt-BR')} {i.unit} × {formatMoney(i.unitPrice)}</span>
                                </span>
                                <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{formatMoney(i.total)}</span>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                    {onVerPedido && (
                        <button type="button" onClick={() => onVerPedido(resultado.pedidoId)}
                            className="flex items-center justify-center gap-1.5 h-11 sm:h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95">
                            Ver pedido <ArrowRight className="w-[15px] h-[15px]" />
                        </button>
                    )}
                    <button type="button" onClick={recomecar}
                        className="flex items-center justify-center gap-1.5 h-11 sm:h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                        <Receipt className="w-[15px] h-[15px]" /> Fazer outro Pedido Fast
                    </button>
                </div>
            </div>
        );
    }

    // ── Os dois passos ───────────────────────────────────────────────────────
    const lendo = leitura.tipo === 'lendo';
    const motivoDesligado =
        fotos.length === 0 ? 'Tire a foto da nota ou do recibo'
            : !obraId ? 'Escolha a obra'
                : leitura.tipo === 'erro' ? 'A foto não foi enviada — toque em "Tentar de novo"'
                    : null;
    const ocupado = criando || aguardandoLeitura;
    const rotuloDoBotao = criando ? 'Criando o pedido…' : aguardandoLeitura ? 'Lendo a nota…' : 'Criar pedido';

    return (
        <div className="space-y-4">
            {/* 1. Foto */}
            <section className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-4">
                <SecaoTitulo icon={Camera} titulo="1. Foto da nota ou recibo" resumo={`até ${MAX_FOTOS_FAST} fotos`} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { adicionarFotos(e.target.files); e.target.value = ''; }} />
                <input ref={galeriaRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { adicionarFotos(e.target.files); e.target.value = ''; }} />

                {fotos.length < MAX_FOTOS_FAST && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button type="button" onClick={() => cameraRef.current?.click()} disabled={ocupado}
                            className="h-14 sm:h-11 rounded-[6px] border-2 border-dashed border-blue-200 bg-blue-50/40 text-blue-700 text-sm font-medium flex items-center justify-center gap-2 active:bg-blue-50 disabled:opacity-60">
                            <Camera className="w-5 h-5" /> {fotos.length ? 'Tirar mais uma foto' : 'Tirar foto'}
                        </button>
                        <button type="button" onClick={() => galeriaRef.current?.click()} disabled={ocupado}
                            className="h-11 rounded-[6px] border border-gray-200 bg-white text-gray-700 text-sm font-medium flex items-center justify-center gap-2 hover:bg-gray-50 disabled:opacity-60">
                            <ImagePlus className="w-4 h-4" /> Escolher da galeria
                        </button>
                    </div>
                )}

                {fotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                        {fotos.map((f, i) => (
                            <div key={f.url} className="relative">
                                <img src={f.url} alt={`Foto ${i + 1} da nota`} className="w-full h-24 object-cover rounded-[6px] border border-gray-100" />
                                <button type="button" onClick={() => removerFoto(i)} disabled={ocupado} title="Tirar esta foto"
                                    aria-label={`Tirar a foto ${i + 1}`}
                                    className="absolute top-1 right-1 w-7 h-7 rounded-[6px] bg-black/60 text-white flex items-center justify-center disabled:opacity-50">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div aria-live="polite">
                    {lendo && (
                        <p className="flex items-center gap-2 text-sm text-gray-600">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Lendo a nota… você já pode escolher a obra.
                        </p>
                    )}
                    {leitura.tipo === 'lida' && !leitura.lote.falha && leitura.lote.leitura.itens.length > 0 && (
                        <p className="flex items-start gap-2 text-sm text-emerald-800">
                            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                Li {leitura.lote.leitura.itens.length} {leitura.lote.leitura.itens.length === 1 ? 'item' : 'itens'}
                                {leitura.lote.leitura.total > 0 ? ` · ${formatMoney(leitura.lote.leitura.total)}` : ''}
                                {leitura.lote.leitura.fornecedor.nome ? ` · ${leitura.lote.leitura.fornecedor.nome}` : ''}
                            </span>
                        </p>
                    )}
                    {leitura.tipo === 'lida' && (leitura.lote.falha || leitura.lote.leitura.itens.length === 0) && (
                        <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-[6px] px-3 py-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                Não consegui ler os itens{leitura.lote.falha ? ` (${leitura.lote.falha.motivo})` : ''}.
                                {' '}A foto está guardada: o pedido será criado com ela, e os itens ficam para o gestor lançar.
                            </span>
                        </p>
                    )}
                    {leitura.tipo === 'erro' && (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-[6px] px-3 py-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span className="flex-1 min-w-0">{leitura.mensagem}</span>
                            <button type="button" onClick={() => void ler(fotos)}
                                className="flex items-center gap-1 h-8 px-2.5 rounded-[6px] bg-white border border-red-200 text-red-700 text-[13px] font-medium">
                                <RotateCcw className="w-3.5 h-3.5" /> Tentar de novo
                            </button>
                        </div>
                    )}
                </div>
            </section>

            {/* 2. Obra */}
            <section className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-4">
                <SecaoTitulo icon={Building2} titulo="2. Obra" />
                {obras.length === 0 ? (
                    <p className="text-sm text-gray-600">Nenhuma obra disponível — confira a organização escolhida no topo.</p>
                ) : (
                    <div className="space-y-2">
                        {obras.length > MAX_OBRAS_SEM_BUSCA && (
                            <div className="space-y-1.5">
                                <label htmlFor="pedido-fast-busca-obra" className={ROTULO}>Buscar obra</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input id="pedido-fast-busca-obra" type="search" value={busca} onChange={e => setBusca(e.target.value)}
                                        placeholder="Nome da obra"
                                        className="w-full h-11 sm:h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                                </div>
                            </div>
                        )}
                        <div role="radiogroup" aria-label="Obra do pedido" className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
                            {obrasFiltradas.map(o => {
                                const ativa = o.id === obraId;
                                return (
                                    <button key={o.id} type="button" role="radio" aria-checked={ativa} onClick={() => setObraId(o.id)}
                                        className={`w-full text-left min-h-11 sm:min-h-9 px-3 py-2 rounded-[6px] border text-sm transition-colors ${ativa ? 'border-blue-500 bg-blue-50 text-blue-800 font-medium' : 'border-gray-100 text-gray-700 hover:bg-gray-50'}`}>
                                        {o.nome}
                                        {o.organizacao && <span className="block text-xs text-gray-500 font-normal">{o.organizacao}</span>}
                                    </button>
                                );
                            })}
                            {obrasFiltradas.length === 0 && <p className="text-sm text-gray-600 px-1 py-2">Nenhuma obra com “{busca}”.</p>}
                        </div>
                    </div>
                )}
            </section>

            {erroCriar && (
                <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-[6px] px-3 py-2" role="alert">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {erroCriar}
                </p>
            )}

            <div className="space-y-1.5">
                <button type="button"
                    disabled={!!motivoDesligado || ocupado}
                    title={motivoDesligado ?? undefined}
                    onClick={() => { if (lendo) setAguardandoLeitura(true); else void criar(); }}
                    className="w-full flex items-center justify-center gap-1.5 h-12 sm:h-10 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100">
                    {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                    {rotuloDoBotao}
                </button>
                {/* Botão desligado sempre diz o motivo — também em texto, porque `title` não aparece no toque. */}
                {motivoDesligado && !ocupado && <p className="text-xs text-gray-500 text-center">{motivoDesligado}</p>}
            </div>
        </div>
    );
};

export default PedidoFastFluxo;
