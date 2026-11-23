import React from 'react';
import { createPortal } from 'react-dom';
import {
    ArrowLeft, ArrowRight, CheckCircle2, Copy, Download, FileSignature, Loader2, Mail, Minus, Plus, ShieldCheck, XCircle,
} from 'lucide-react';
import {
    assinaturaInternaService, ErroDeAssinatura, ROTULO_PAPEL, ROTULO_SITUACAO,
    type AcessoDoSignatario, type Leitura, type ResultadoDaAssinatura, type VisaoParaAssinar,
} from '../../services/assinaturaInternaService';
import { PaginasDoPdf, type PosicaoDeLeitura } from './PaginasDoPdf';

/**
 * TELA de assinatura (assinatura interna, sem certificado): o documento ocupa a
 * tela e o painel de assinar fica ao lado (computador) ou numa etapa própria
 * (celular). Ler até a última página → CPF → código de 6 dígitos por e-mail →
 * aceite → Assinar. A leitura vai para a trilha (evento ASSINOU).
 *
 * A mesma tela para os quatro canais — comprador no Portal do Cliente, corretor
 * no portal dele, testemunha pelo link e representante dentro do app; muda só o
 * `acesso` (canal + credencial). Até 22/11/2026 era uma gaveta lateral com o PDF
 * num quadro de ~450 px ("dificulta a visualização pelo cliente" — pedido do
 * usuário, que aprovou também exigir a leitura até o fim).
 *
 * É uma tela por cima de tudo (portal no <body>), com entrada no histórico: o
 * "voltar" do navegador fecha a tela e devolve à lista, em vez de sair do portal.
 * Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (Tela de assinatura).
 */

const ESPERA_REENVIO_S = 60;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;

const fmtDataHora = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const soDigitos = (v: string) => v.replace(/\D/g, '');
const mascaraCpf = (v: string) => {
    const d = soDigitos(v).slice(0, 11);
    return d
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
};

const btnSecundario = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed';
const btnPrimario = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const btnIcone = 'inline-flex items-center justify-center h-9 w-9 rounded-[6px] text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed';
const inputCls = 'w-full px-3 h-9 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50';

interface Props {
    aberto: boolean;
    onFechar: () => void;
    acesso: AcessoDoSignatario | null;
    /** Chamado depois de assinar (para a lista de pendências se atualizar). */
    onAssinado?: (r: ResultadoDaAssinatura) => void;
    /** Prévia do gestor no portal: mostra tudo, mas não assina. */
    somenteLeitura?: boolean;
}

interface EstadoDaLeitura {
    atual: number;
    /** Maior página que já esteve à vista. */
    ultima: number;
    total: number;
    /** Chegou ao fim alguma vez (não "desliga" ao rolar de volta). */
    fim: boolean;
    /** O PDF não desenhou na tela e a pessoa abriu o arquivo à parte. */
    externo: boolean;
}
const LEITURA_ZERO: EstadoDaLeitura = { atual: 0, ultima: 0, total: 0, fim: false, externo: false };

export function FluxoDeAssinatura({ aberto, onFechar, acesso, onAssinado, somenteLeitura = false }: Props) {
    const [visao, setVisao] = React.useState<VisaoParaAssinar | null>(null);
    const [carregando, setCarregando] = React.useState(false);
    const [erroCarga, setErroCarga] = React.useState<string | null>(null);
    /** O link é de outra conta da empresa: oferece copiar o link para abrir com a conta certa. */
    const [outroUsuario, setOutroUsuario] = React.useState(false);
    const [linkCopiado, setLinkCopiado] = React.useState(false);

    const [cpf, setCpf] = React.useState('');
    const [codigo, setCodigo] = React.useState('');
    const [aceite, setAceite] = React.useState(false);
    const [emailDoCodigo, setEmailDoCodigo] = React.useState<string | null>(null);
    const [enviandoCodigo, setEnviandoCodigo] = React.useState(false);
    const [esperaReenvio, setEsperaReenvio] = React.useState(0);
    const [assinando, setAssinando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [resultado, setResultado] = React.useState<ResultadoDaAssinatura | null>(null);

    const [leitura, setLeitura] = React.useState<EstadoDaLeitura>(LEITURA_ZERO);
    const [erroPdf, setErroPdf] = React.useState<string | null>(null);
    const [zoom, setZoom] = React.useState(1);
    /** Celular: ler o documento ou confirmar a assinatura (no computador, os dois lado a lado). */
    const [etapa, setEtapa] = React.useState<'ler' | 'confirmar'>('ler');
    const abertoEm = React.useRef(Date.now());

    const carregar = React.useCallback(async () => {
        if (!acesso) return;
        setCarregando(true);
        setErroCarga(null);
        setOutroUsuario(false);
        try {
            setVisao(await assinaturaInternaService.ver(acesso));
        } catch (e) {
            setErroCarga(e instanceof Error ? e.message : 'Não foi possível abrir o documento.');
            setOutroUsuario(e instanceof ErroDeAssinatura && e.outroUsuario);
        } finally {
            setCarregando(false);
        }
    }, [acesso]);

    React.useEffect(() => {
        if (!aberto) return;
        setVisao(null); setCpf(''); setCodigo(''); setAceite(false); setEmailDoCodigo(null);
        setErro(null); setResultado(null); setEsperaReenvio(0);
        setLeitura(LEITURA_ZERO); setErroPdf(null); setZoom(1); setEtapa('ler');
        abertoEm.current = Date.now();
        void carregar();
    }, [aberto, carregar]);

    React.useEffect(() => {
        if (esperaReenvio <= 0) return;
        const t = setTimeout(() => setEsperaReenvio(s => s - 1), 1000);
        return () => clearTimeout(t);
    }, [esperaReenvio]);

    // ── Tela: histórico do navegador, Esc, rolagem do fundo travada ─────────
    const fecharRef = React.useRef(onFechar);
    fecharRef.current = onFechar;
    const empurrou = React.useRef(false);
    React.useEffect(() => {
        if (!aberto) return;
        window.history.pushState({ ...(window.history.state ?? {}), telaDeAssinatura: true }, '');
        empurrou.current = true;
        const onPop = () => { empurrou.current = false; fecharRef.current(); };
        const onTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
        const overflowAntes = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('popstate', onPop);
        window.addEventListener('keydown', onTecla);
        return () => {
            window.removeEventListener('popstate', onPop);
            window.removeEventListener('keydown', onTecla);
            document.body.style.overflow = overflowAntes;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto]);

    /** Fechar = voltar no histórico (o popstate chama onFechar), igual ao botão do navegador. */
    function fechar() {
        if (empurrou.current) { empurrou.current = false; window.history.back(); return; }
        fecharRef.current();
    }

    const tituloRef = React.useRef<HTMLHeadingElement>(null);
    React.useEffect(() => { if (aberto) tituloRef.current?.focus(); }, [aberto]);

    const onPosicao = React.useCallback((p: PosicaoDeLeitura) => {
        setLeitura(l => ({
            ...l,
            atual: p.atual,
            total: p.total,
            ultima: Math.max(l.ultima, p.ultimaVista),
            fim: l.fim || p.noFim,
        }));
    }, []);

    const pedirCodigo = async () => {
        if (!acesso) return;
        setEnviandoCodigo(true);
        setErro(null);
        try {
            const r = await assinaturaInternaService.pedirCodigo(acesso);
            setEmailDoCodigo(r.email_mascarado);
            setCodigo('');
            setEsperaReenvio(ESPERA_REENVIO_S);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível enviar o código.');
        } finally {
            setEnviandoCodigo(false);
        }
    };

    const leituraParaATrilha = (): Leitura => {
        const segundos = Math.max(0, Math.round((Date.now() - abertoEm.current) / 1000));
        return leitura.fim
            ? { modo: 'TELA', paginas: leitura.total, ultima_pagina: leitura.total, chegou_ao_fim: true, segundos }
            : { modo: 'PDF_EXTERNO', paginas: visao?.documento.paginas ?? null, ultima_pagina: null, chegou_ao_fim: false, segundos };
    };

    const assinar = async () => {
        if (!acesso || !visao) return;
        setAssinando(true);
        setErro(null);
        try {
            const r = await assinaturaInternaService.assinar(acesso, {
                codigo, cpf: soDigitos(cpf), termoVersao: visao.termo_versao, leitura: leituraParaATrilha(),
            });
            setResultado(r);
            onAssinado?.(r);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível assinar.');
            if (e instanceof ErroDeAssinatura && e.pedirCodigo) { setEmailDoCodigo(null); setCodigo(''); }
        } finally {
            setAssinando(false);
        }
    };

    if (!aberto) return null;

    const doc = visao?.documento;
    const podeAssinar = !!doc && doc.status === 'ENVIADO' && doc.signatario.status === 'PENDENTE' && !resultado;
    const leuTudo = leitura.fim || leitura.externo;
    const motivoLeitura = leuTudo ? null
        : leitura.total > 0 ? `Role o documento até a última página (você está na ${leitura.atual} de ${leitura.total}).`
        : 'Leia o documento até a última página.';

    // Botão desligado sempre diz o motivo.
    const motivoDesligado = somenteLeitura ? 'Prévia do portal: só o cliente assina.'
        : motivoLeitura
        ?? (soDigitos(cpf).length !== 11 ? 'Informe o seu CPF.'
        : !emailDoCodigo ? 'Peça o código de confirmação.'
        : codigo.length !== 6 ? 'Digite o código de 6 dígitos.'
        : !aceite ? 'Marque a declaração de aceite.'
        : null);

    const subtitulo = doc
        ? [doc.emitente, `prazo ${fmtDataHora(doc.expira_em)}`, doc.paginas ? `${doc.paginas} página${doc.paginas > 1 ? 's' : ''}` : null]
            .filter(Boolean).join(' · ')
        : 'Assinatura eletrônica';

    // ── Estados de página inteira (carregando, erro, concluído) ─────────────
    const telaCheia = (conteudo: React.ReactNode) => (
        <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-6">
            <div className="max-w-md text-center">{conteudo}</div>
        </div>
    );

    let corpo: React.ReactNode;
    if (carregando || (!visao && !erroCarga)) {
        corpo = telaCheia(<><Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" /><p className="mt-2 text-gray-600">Abrindo o documento…</p></>);
    } else if (erroCarga || !doc) {
        corpo = telaCheia(<>
            <XCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-2">{outroUsuario ? 'Assinatura de outro usuário' : 'Não foi possível abrir'}</h2>
            <p className="text-sm text-gray-600">{erroCarga}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {outroUsuario && acesso && (
                    <button type="button" className={btnPrimario} onClick={() => {
                        const link = `${window.location.origin}/?assinar=${encodeURIComponent(acesso.signatarioId)}`;
                        void navigator.clipboard?.writeText(link).then(() => setLinkCopiado(true), () => setLinkCopiado(false));
                    }}>
                        <Copy className="w-[15px] h-[15px]" /> {linkCopiado ? 'Link copiado' : 'Copiar o link'}
                    </button>
                )}
                <button type="button" onClick={fechar} className={btnSecundario}><ArrowLeft className="w-[15px] h-[15px]" /> Voltar</button>
            </div>
        </>);
    } else if (resultado) {
        corpo = telaCheia(<>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-2">Assinatura registrada</h2>
            <p className="text-sm text-gray-600">
                {resultado.concluido
                    ? 'Todas as pessoas assinaram. A via assinada foi enviada para o seu e-mail.'
                    : resultado.faltam > 0
                        ? `Falta${resultado.faltam > 1 ? 'm' : ''} ${resultado.faltam} assinatura${resultado.faltam > 1 ? 's' : ''}. Quando todos assinarem, você recebe a via assinada por e-mail.`
                        : 'Estamos finalizando o documento. A via assinada chega por e-mail em instantes.'}
            </p>
            <button type="button" onClick={fechar} className={`${btnPrimario} mt-6`}><ArrowLeft className="w-[15px] h-[15px]" /> Voltar aos documentos</button>
        </>);
    } else {
        corpo = (
            <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[minmax(0,1fr)]">
                {/* ── Documento ───────────────────────────────────────── */}
                <section aria-label="Documento" className={`${etapa === 'confirmar' ? 'hidden lg:flex' : 'flex'} flex-1 lg:flex-none min-h-0 flex-col`}>
                    <div className="flex items-center gap-2 px-3 lg:px-4 h-12 bg-white border-b border-gray-200 shrink-0">
                        <span className="text-sm text-gray-700" aria-live="polite">
                            {leitura.total > 0 ? `Página ${leitura.atual} de ${leitura.total}` : 'Documento'}
                        </span>
                        <div className="ml-auto flex items-center gap-1">
                            <button type="button" className={btnIcone} onClick={() => setZoom(z => Math.max(ZOOM_MIN, +(z - 0.2).toFixed(1)))}
                                disabled={zoom <= ZOOM_MIN} title="Diminuir" aria-label="Diminuir"><Minus className="w-4 h-4" /></button>
                            <span className="w-12 text-center text-sm text-gray-700 tabular-nums">{Math.round(zoom * 100)}%</span>
                            <button type="button" className={btnIcone} onClick={() => setZoom(z => Math.min(ZOOM_MAX, +(z + 0.2).toFixed(1)))}
                                disabled={zoom >= ZOOM_MAX} title="Aumentar" aria-label="Aumentar"><Plus className="w-4 h-4" /></button>
                            {visao?.url && (
                                <a href={visao.url} target="_blank" rel="noopener noreferrer" className={btnIcone} title="Baixar o PDF" aria-label="Baixar o PDF">
                                    <Download className="w-4 h-4" />
                                </a>
                            )}
                        </div>
                    </div>

                    {erroPdf || !visao?.url ? (
                        <div className="flex-1 min-h-0 flex items-center justify-center p-6 bg-gray-100">
                            <div className="max-w-sm text-center space-y-3">
                                <p className="text-sm text-gray-700">Não foi possível mostrar o documento nesta tela.</p>
                                {visao?.url && (
                                    <a href={visao.url} target="_blank" rel="noopener noreferrer" className={btnSecundario}
                                        onClick={() => setLeitura(l => ({ ...l, externo: true }))}>
                                        <Download className="w-[15px] h-[15px]" /> Abrir o documento (PDF)
                                    </a>
                                )}
                                {leitura.externo && <p className="text-sm text-gray-600">Leia o documento inteiro antes de assinar.</p>}
                            </div>
                        </div>
                    ) : (
                        <PaginasDoPdf url={visao.url} zoom={zoom} titulo={doc.titulo} onPosicao={onPosicao} onErro={setErroPdf} />
                    )}

                    {/* Celular: barra fixa — a página onde está e o passo seguinte. */}
                    {podeAssinar && (
                        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-t border-gray-200 shrink-0">
                            <span className="text-sm text-gray-700 min-w-0">
                                {leuTudo ? 'Você chegou ao fim do documento.' : motivoLeitura}
                            </span>
                            <span className="ml-auto shrink-0" title={motivoLeitura ?? undefined}>
                                <button type="button" onClick={() => setEtapa('confirmar')} disabled={!leuTudo} className={btnPrimario}>
                                    Assinar <ArrowRight className="w-[15px] h-[15px]" />
                                </button>
                            </span>
                        </div>
                    )}
                </section>

                {/* ── Assinatura ─────────────────────────────────────── */}
                <aside aria-label="Assinatura" className={`${etapa === 'confirmar' ? 'flex' : 'hidden lg:flex'} flex-1 lg:flex-none min-h-0 flex-col bg-white lg:border-l border-gray-200`}>
                    <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6">
                        {etapa === 'confirmar' && (
                            <button type="button" onClick={() => setEtapa('ler')} className={`${btnSecundario} lg:hidden`}>
                                <ArrowLeft className="w-[15px] h-[15px]" /> Voltar ao documento
                            </button>
                        )}

                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            <div className="space-y-1">
                                <dt className="text-xs font-semibold text-slate-500">Você assina como</dt>
                                <dd className="text-gray-900">
                                    {ROTULO_PAPEL[doc.signatario.papel]}{doc.signatario.representa ? ` (por ${doc.signatario.representa})` : ''}
                                </dd>
                            </div>
                            <div className="space-y-1">
                                <dt className="text-xs font-semibold text-slate-500">Situação</dt>
                                <dd className="text-gray-900">{ROTULO_SITUACAO[doc.status]}</dd>
                            </div>
                        </dl>

                        <div className="space-y-2">
                            <h2 className="text-sm font-semibold text-gray-900">Quem assina</h2>
                            <ul className="divide-y divide-gray-100 rounded-[6px] border border-gray-100">
                                {doc.signatarios.map((s, i) => (
                                    <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                                        <span className="text-gray-900 truncate">{s.nome} <span className="text-gray-600">· {ROTULO_PAPEL[s.papel]}</span></span>
                                        {s.status === 'ASSINADO'
                                            ? <span className="text-emerald-700 shrink-0">Assinou</span>
                                            : <span className="text-amber-700 shrink-0">Pendente</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {doc.signatario.status === 'ASSINADO' && (
                            <p className="flex items-start gap-2 text-sm text-emerald-700">
                                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> Você assinou em {fmtDataHora(doc.signatario.assinado_em)}.
                            </p>
                        )}
                        {doc.status !== 'ENVIADO' && doc.signatario.status === 'PENDENTE' && (
                            <p className="text-sm text-gray-600">Este documento não está mais aguardando assinatura ({ROTULO_SITUACAO[doc.status].toLowerCase()}).</p>
                        )}

                        {podeAssinar && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                                    <h2 className="text-sm font-semibold text-gray-900">Confirmar a assinatura</h2>
                                </div>
                                <p className={`flex items-start gap-2 text-sm ${leuTudo ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {leuTudo
                                        ? <><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {leitura.fim ? 'Você leu o documento até a última página.' : 'Você abriu o documento (PDF).'}</>
                                        : <>{motivoLeitura}</>}
                                </p>
                                <div className="space-y-1.5">
                                    <label htmlFor="assinatura-cpf" className="text-xs font-semibold text-slate-500">Seu CPF</label>
                                    <input id="assinatura-cpf" inputMode="numeric" autoComplete="off" value={mascaraCpf(cpf)}
                                        onChange={e => setCpf(soDigitos(e.target.value).slice(0, 11))} placeholder="000.000.000-00"
                                        disabled={somenteLeitura} className={inputCls} />
                                </div>
                                <div className="space-y-2">
                                    <span title={somenteLeitura ? 'Prévia do portal: só o cliente assina.' : esperaReenvio > 0 ? `Aguarde ${esperaReenvio}s para pedir outro código.` : undefined} className="inline-flex">
                                        <button type="button" onClick={() => void pedirCodigo()}
                                            disabled={enviandoCodigo || esperaReenvio > 0 || somenteLeitura} className={btnSecundario}>
                                            {enviandoCodigo ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Mail className="w-[15px] h-[15px]" />}
                                            {emailDoCodigo ? (esperaReenvio > 0 ? `Reenviar em ${esperaReenvio}s` : 'Reenviar código') : `Enviar código para ${doc.signatario.email_mascarado}`}
                                        </button>
                                    </span>
                                    {emailDoCodigo && <p className="text-sm text-gray-600">Enviamos o código para {emailDoCodigo}. Vale por 10 minutos.</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="assinatura-codigo" className="text-xs font-semibold text-slate-500">Código recebido por e-mail</label>
                                    <input id="assinatura-codigo" inputMode="numeric" autoComplete="one-time-code" value={codigo}
                                        onChange={e => setCodigo(soDigitos(e.target.value).slice(0, 6))} placeholder="000000"
                                        disabled={!emailDoCodigo || somenteLeitura}
                                        className={`${inputCls} tracking-[0.3em] placeholder:tracking-normal`} />
                                </div>
                                <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} disabled={somenteLeitura}
                                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500/30 shrink-0" />
                                    <span>{visao?.termo}</span>
                                </label>
                            </div>
                        )}

                        {erro && (
                            <p role="alert" className="flex items-start gap-2 text-sm text-red-700">
                                <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                            </p>
                        )}
                    </div>

                    {podeAssinar && (
                        <div className="shrink-0 border-t border-gray-200 p-4 space-y-2">
                            {motivoDesligado && <p className="text-sm text-gray-600">{motivoDesligado}</p>}
                            <span title={motivoDesligado ?? undefined} className="flex">
                                <button type="button" onClick={() => void assinar()} disabled={!!motivoDesligado || assinando} className={`${btnPrimario} w-full`}>
                                    {assinando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <FileSignature className="w-[15px] h-[15px]" />}
                                    Assinar
                                </button>
                            </span>
                        </div>
                    )}
                </aside>
            </div>
        );
    }

    return createPortal(
        <div role="dialog" aria-modal="true" aria-labelledby="tela-assinatura-titulo" className="fixed inset-0 z-[1000] flex flex-col bg-gray-50">
            <header className="flex items-center gap-3 px-3 lg:px-6 py-3 bg-white border-b border-gray-200 shrink-0">
                <button type="button" onClick={fechar} className={btnIcone} title="Voltar aos documentos" aria-label="Voltar aos documentos">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                    <h1 id="tela-assinatura-titulo" ref={tituloRef} tabIndex={-1} className="text-base font-bold text-gray-900 truncate outline-none">
                        {doc?.titulo ?? 'Assinar documento'}
                    </h1>
                    <p className="text-sm text-gray-600 truncate">{subtitulo}</p>
                </div>
            </header>
            {corpo}
        </div>,
        document.body,
    );
}

export default FluxoDeAssinatura;
