import React from 'react';
import { CheckCircle2, ExternalLink, FileSignature, Loader2, Mail, ShieldCheck, XCircle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import {
    assinaturaInternaService, ErroDeAssinatura, ROTULO_PAPEL, ROTULO_SITUACAO,
    type AcessoDoSignatario, type ResultadoDaAssinatura, type VisaoParaAssinar,
} from '../../services/assinaturaInternaService';

/**
 * Assinar um documento pela assinatura interna (sem certificado): ler o PDF,
 * confirmar o CPF, pedir o código de 6 dígitos que chega por e-mail, marcar o
 * aceite e assinar. O mesmo fluxo para o comprador no Portal do Cliente, o
 * representante dentro do app, o corretor no portal dele e a testemunha pelo
 * link — muda só o `acesso` (canal + credencial).
 *
 * No celular o `Sheet` vira painel de baixo (UI_PATTERNS.md §4.3); o PDF abre
 * numa aba própria (iframe de PDF em celular não rola direito).
 * Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (F3).
 */

const ESPERA_REENVIO_S = 60;

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

interface Props {
    aberto: boolean;
    onFechar: () => void;
    acesso: AcessoDoSignatario | null;
    /** Chamado depois de assinar (para a lista de pendências se atualizar). */
    onAssinado?: (r: ResultadoDaAssinatura) => void;
    /** Prévia do gestor no portal: mostra tudo, mas não assina. */
    somenteLeitura?: boolean;
}

export function FluxoDeAssinatura({ aberto, onFechar, acesso, onAssinado, somenteLeitura = false }: Props) {
    const [visao, setVisao] = React.useState<VisaoParaAssinar | null>(null);
    const [carregando, setCarregando] = React.useState(false);
    const [erroCarga, setErroCarga] = React.useState<string | null>(null);

    const [cpf, setCpf] = React.useState('');
    const [codigo, setCodigo] = React.useState('');
    const [aceite, setAceite] = React.useState(false);
    const [emailDoCodigo, setEmailDoCodigo] = React.useState<string | null>(null);
    const [enviandoCodigo, setEnviandoCodigo] = React.useState(false);
    const [esperaReenvio, setEsperaReenvio] = React.useState(0);
    const [assinando, setAssinando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [resultado, setResultado] = React.useState<ResultadoDaAssinatura | null>(null);

    const carregar = React.useCallback(async () => {
        if (!acesso) return;
        setCarregando(true);
        setErroCarga(null);
        try {
            setVisao(await assinaturaInternaService.ver(acesso));
        } catch (e) {
            setErroCarga(e instanceof Error ? e.message : 'Não foi possível abrir o documento.');
        } finally {
            setCarregando(false);
        }
    }, [acesso]);

    React.useEffect(() => {
        if (!aberto) return;
        setVisao(null); setCpf(''); setCodigo(''); setAceite(false); setEmailDoCodigo(null);
        setErro(null); setResultado(null); setEsperaReenvio(0);
        void carregar();
    }, [aberto, carregar]);

    React.useEffect(() => {
        if (esperaReenvio <= 0) return;
        const t = setTimeout(() => setEsperaReenvio(s => s - 1), 1000);
        return () => clearTimeout(t);
    }, [esperaReenvio]);

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

    const assinar = async () => {
        if (!acesso || !visao) return;
        setAssinando(true);
        setErro(null);
        try {
            const r = await assinaturaInternaService.assinar(acesso, { codigo, cpf: soDigitos(cpf), termoVersao: visao.termo_versao });
            setResultado(r);
            onAssinado?.(r);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível assinar.');
            if (e instanceof ErroDeAssinatura && e.pedirCodigo) { setEmailDoCodigo(null); setCodigo(''); }
        } finally {
            setAssinando(false);
        }
    };

    const doc = visao?.documento;
    const podeAssinar = !!doc && doc.status === 'ENVIADO' && doc.signatario.status === 'PENDENTE' && !resultado;

    // Botão desligado sempre diz o motivo.
    const motivoDesligado = somenteLeitura ? 'Prévia do portal: só o cliente assina.'
        : soDigitos(cpf).length !== 11 ? 'Informe o seu CPF.'
        : !emailDoCodigo ? 'Peça o código de confirmação.'
        : codigo.length !== 6 ? 'Digite o código de 6 dígitos.'
        : !aceite ? 'Marque a declaração de aceite.'
        : null;

    const conteudo = () => {
        if (carregando || (!visao && !erroCarga)) {
            return (
                <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                    <p className="mt-2 text-gray-500">Abrindo o documento...</p>
                </div>
            );
        }
        if (erroCarga || !doc) {
            return (
                <div className="text-center py-12 px-6">
                    <XCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Não foi possível abrir</h3>
                    <p className="text-sm text-gray-500">{erroCarga}</p>
                </div>
            );
        }
        if (resultado) {
            return (
                <div className="text-center py-12 px-6">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Assinatura registrada</h3>
                    <p className="text-sm text-gray-600">
                        {resultado.concluido
                            ? 'Todas as pessoas assinaram. A via assinada foi enviada para o seu e-mail.'
                            : resultado.faltam > 0
                                ? `Falta${resultado.faltam > 1 ? 'm' : ''} ${resultado.faltam} assinatura${resultado.faltam > 1 ? 's' : ''}. Quando todos assinarem, você recebe a via por e-mail.`
                                : 'Estamos finalizando o documento. A via assinada chega por e-mail em instantes.'}
                    </p>
                </div>
            );
        }

        return (
            <div className="p-6 space-y-8">
                {/* Documento */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <FileSignature className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Documento</h3>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        <div className="space-y-1.5">
                            <dt className="text-xs font-semibold text-slate-500">Você assina como</dt>
                            <dd className="text-gray-900">
                                {ROTULO_PAPEL[doc.signatario.papel]}{doc.signatario.representa ? ` (por ${doc.signatario.representa})` : ''}
                            </dd>
                        </div>
                        <div className="space-y-1.5">
                            <dt className="text-xs font-semibold text-slate-500">Situação</dt>
                            <dd className="text-gray-900">{ROTULO_SITUACAO[doc.status]}</dd>
                        </div>
                        <div className="space-y-1.5">
                            <dt className="text-xs font-semibold text-slate-500">Prazo para assinar</dt>
                            <dd className="text-gray-900">{fmtDataHora(doc.expira_em)}</dd>
                        </div>
                        <div className="space-y-1.5">
                            <dt className="text-xs font-semibold text-slate-500">Páginas</dt>
                            <dd className="text-gray-900">{doc.paginas ?? '—'}</dd>
                        </div>
                    </dl>
                    {visao?.url && (
                        <>
                            <iframe title={`Documento: ${doc.titulo}`} src={visao.url}
                                className="hidden sm:block w-full h-[48vh] rounded-[6px] border border-gray-200 bg-gray-50" />
                            <a href={visao.url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                                <ExternalLink className="w-[15px] h-[15px]" /> Abrir o documento (PDF)
                            </a>
                        </>
                    )}
                    <ul className="divide-y divide-gray-100 rounded-[6px] border border-gray-100">
                        {doc.signatarios.map((s, i) => (
                            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                                <span className="text-gray-900 truncate">{s.nome} <span className="text-gray-500">· {ROTULO_PAPEL[s.papel]}</span></span>
                                {s.status === 'ASSINADO'
                                    ? <span className="text-emerald-700 shrink-0">Assinou em {fmtDataHora(s.assinado_em)}</span>
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
                            <h3 className="text-sm font-semibold text-gray-900">Confirmar a assinatura</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label htmlFor="assinatura-cpf" className="text-xs font-semibold text-slate-500">Seu CPF</label>
                                <input id="assinatura-cpf" inputMode="numeric" autoComplete="off" value={mascaraCpf(cpf)}
                                    onChange={e => setCpf(soDigitos(e.target.value).slice(0, 11))} placeholder="000.000.000-00"
                                    disabled={somenteLeitura}
                                    className="w-full px-3 h-9 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50" />
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor="assinatura-codigo" className="text-xs font-semibold text-slate-500">Código recebido por e-mail</label>
                                <input id="assinatura-codigo" inputMode="numeric" autoComplete="one-time-code" value={codigo}
                                    onChange={e => setCodigo(soDigitos(e.target.value).slice(0, 6))} placeholder="000000"
                                    disabled={!emailDoCodigo || somenteLeitura}
                                    className="w-full px-3 h-9 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 tracking-[0.3em] placeholder:text-gray-400 placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50" />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <span title={somenteLeitura ? 'Prévia do portal: só o cliente assina.' : esperaReenvio > 0 ? `Aguarde ${esperaReenvio}s para pedir outro código.` : undefined}>
                                <button type="button" onClick={() => void pedirCodigo()}
                                    disabled={enviandoCodigo || esperaReenvio > 0 || somenteLeitura}
                                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed">
                                    {enviandoCodigo ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Mail className="w-[15px] h-[15px]" />}
                                    {emailDoCodigo ? (esperaReenvio > 0 ? `Reenviar em ${esperaReenvio}s` : 'Reenviar código') : `Enviar código para ${doc.signatario.email_mascarado}`}
                                </button>
                            </span>
                            {emailDoCodigo && <span className="text-sm text-gray-600">Enviamos o código para {emailDoCodigo}. Vale por 10 minutos.</span>}
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
        );
    };

    return (
        <Sheet open={aberto} onClose={onFechar} size="lg">
            <SheetHeader onClose={onFechar}>
                <SheetTitle>Assinar documento</SheetTitle>
                <SheetDescription>{doc ? `${doc.titulo}${doc.emitente ? ` · ${doc.emitente}` : ''}` : 'Assinatura eletrônica'}</SheetDescription>
            </SheetHeader>
            <SheetPanel>{conteudo()}</SheetPanel>
            <SheetFooter>
                {podeAssinar && motivoDesligado && <span className="mr-auto text-xs text-gray-500">{motivoDesligado}</span>}
                <button type="button" onClick={onFechar}
                    className="h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                    {resultado || !podeAssinar ? 'Fechar' : 'Agora não'}
                </button>
                {podeAssinar && (
                    <span title={motivoDesligado ?? undefined}>
                        <button type="button" onClick={() => void assinar()} disabled={!!motivoDesligado || assinando}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100">
                            {assinando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <FileSignature className="w-[15px] h-[15px]" />}
                            Assinar
                        </button>
                    </span>
                )}
            </SheetFooter>
        </Sheet>
    );
}

export default FluxoDeAssinatura;
