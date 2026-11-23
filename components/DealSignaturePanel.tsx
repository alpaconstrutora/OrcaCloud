import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, FileSignature, FileDown, Loader2, RefreshCw, Send, Upload, XCircle } from 'lucide-react';
import { signatureService, SignatureSigner } from '../services/signatureService';
import {
    arquivoDaVersao, assinaturaDaVersao, contractDocumentVersionService, motivoNaoEnviaAoPortal,
} from '../services/contractDocumentVersionService';
import { abrirArquivoAssinado, BUCKET_DOCUMENTOS } from '../lib/storageAssinado';
import { PropertyDeal, Client, ContractDocumentVersion } from '../types';
import { EnviarParaAssinaturaSheet } from './assinatura/EnviarParaAssinaturaSheet';
import { AcompanharAssinaturaSheet } from './assinatura/AcompanharAssinaturaSheet';

/**
 * Negociação › Contrato › "Assinatura eletrônica": DOIS caminhos, lado a lado.
 *   • No portal (sem custo) — assinatura interna sem certificado. Assina uma
 *     VERSÃO do documento do contrato (a mesma da Emissão), e o "assinado" sobe
 *     para o contrato pela regra única de _shared/assinaturaPropagar.ts.
 *   • ZapSign — cobrado por documento, para os mais importantes. Caminho de
 *     sempre: PDF solto, token na própria negociação.
 * Até 22/11/2026 este bloco só oferecia o ZapSign (relato do usuário em
 * Comercial › Locações). Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md
 */

type Notify = (msg: string, type?: 'success' | 'error' | 'info') => void;

/** O contrato gerado a partir da negociação — dono das versões que o portal assina. */
export interface ContratoDaNegociacao {
    id: string;
    organization_id: string;
    number?: string | null;
}

interface DealSignaturePanelProps {
    deal: Partial<PropertyDeal>;
    /** Um cliente só (locação). Ignorado quando `clients` vem preenchido. */
    client?: Client | null;
    /** Todos os compradores da negociação — cada um vira um signatário, com o
     *  mesmo peso. Uma venda em casal precisa das duas assinaturas. */
    clients?: Client[];
    organizationId: string;
    onStatusChange?: (status: 'PENDING' | 'SIGNED') => void;
    /** Contrato gerado (null enquanto não há) — a assinatura no portal assina uma versão dele. */
    contrato?: ContratoDaNegociacao | null;
    /** Abre "Gerar documento do contrato" (o DealModal sabe). */
    onGerarDocumento?: () => void;
    /** Muda quando uma versão nova é gravada — recarrega a lista. */
    versoesRefreshKey?: number;
    onNotify: Notify;
}

type Modo = 'PORTAL' | 'ZAPSIGN';

const MODOS: { id: Modo; label: string }[] = [
    { id: 'PORTAL', label: 'No portal (sem custo)' },
    { id: 'ZAPSIGN', label: 'ZapSign' },
];

const SUBTITULO: Record<Modo, string> = {
    PORTAL: 'Sem custo por documento: cada signatário assina pelo portal ou por link, com código por e-mail, CPF e aceite.',
    ZAPSIGN: 'Cobrado por documento no ZapSign — para os contratos mais importantes.',
};

/** Status da assinatura ZapSign da negociação — texto colorido (§8). */
const STATUS_ZAPSIGN = {
    PENDING: { label: 'Aguardando assinatura', cor: 'text-amber-600' },
    SIGNED: { label: 'Assinado', cor: 'text-emerald-600' },
    REFUSED: { label: 'Recusado', cor: 'text-red-600' },
} as const;

const inputCls = 'w-full px-3 h-9 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const btnPrimario = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none';
const btnSecundario = 'flex items-center gap-1.5 h-9 px-3 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all disabled:opacity-50';

/** Versão que abre escolhida: a que está em assinatura; senão a última emitida
 *  do tipo Contrato; senão a última emitida; senão a mais recente. */
function versaoPadrao(vs: ContractDocumentVersion[]): ContractDocumentVersion | undefined {
    return vs.find(v => v.assinatura_envelope_id && v.signature_status === 'SENT')
        ?? vs.find(v => v.emitted && v.kind === 'CONTRATO')
        ?? vs.find(v => v.emitted)
        ?? vs[0];
}

const KIND: Record<string, string> = { MINUTA: 'minuta', CONTRATO: 'contrato', ADITIVO: 'aditivo', ANEXO: 'anexo' };

// ─── No portal (sem custo) ──────────────────────────────────────────────────

function AssinaturaNoPortal({ contrato, dealId, onGerarDocumento, versoesRefreshKey, onNotify }: {
    contrato: ContratoDaNegociacao | null;
    dealId?: string;
    onGerarDocumento?: () => void;
    versoesRefreshKey?: number;
    onNotify: Notify;
}) {
    const [versoes, setVersoes] = useState<ContractDocumentVersion[] | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [escolhida, setEscolhida] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [acompanhando, setAcompanhando] = useState(false);

    const notifyRef = useRef(onNotify);
    notifyRef.current = onNotify;

    const contratoId = contrato?.id ?? null;
    const carregar = useCallback(async () => {
        if (!contratoId) { setVersoes([]); return; }
        setErro(null);
        try {
            const vs = await contractDocumentVersionService.listByOwner('CONTRACT', contratoId);
            setVersoes(vs);
            setEscolhida(atual => (vs.some(v => v.id === atual) ? atual : versaoPadrao(vs)?.id ?? ''));
        } catch (e) {
            setErro(`Não foi possível carregar os documentos do contrato${e instanceof Error ? `: ${e.message}` : '.'}`);
            setVersoes([]);
        }
    }, [contratoId]);

    useEffect(() => { void carregar(); }, [carregar, versoesRefreshKey]);

    if (!contrato) {
        return (
            <p className="text-sm text-gray-600">
                Gere o contrato acima: a assinatura no portal assina a versão emitida do documento do contrato.
            </p>
        );
    }
    if (versoes === null) {
        return <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando documentos do contrato…</p>;
    }
    if (erro) return <p className="text-sm text-red-600">{erro}</p>;
    if (versoes.length === 0) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-gray-600">O contrato ainda não tem documento. Gere o documento, emita a versão e envie para assinatura.</p>
                {onGerarDocumento && (
                    <button type="button" onClick={onGerarDocumento} className={btnSecundario}>
                        <FileDown className="w-[15px] h-[15px]" /> Gerar documento do contrato
                    </button>
                )}
            </div>
        );
    }

    const v = versoes.find(x => x.id === escolhida) ?? versoes[0];
    const status = assinaturaDaVersao(v);
    const motivo = motivoNaoEnviaAoPortal(v);
    const rotulo = `Contrato${contrato.number ? ` ${contrato.number}` : ''}`;
    const titulo = `${rotulo} — ${v.name || 'Documento'} (v${v.v})`;

    return (
        <div className="space-y-3">
            <div className="space-y-1.5 max-w-xl">
                <label htmlFor="assinar-versao" className="text-xs font-semibold text-slate-500">Documento</label>
                <select id="assinar-versao" value={v.id} onChange={e => setEscolhida(e.target.value)} className={inputCls}>
                    {versoes.map(x => (
                        <option key={x.id} value={x.id}>
                            {`v${x.v} — ${x.name || 'Documento'} (${KIND[x.kind] ?? x.kind}${x.emitted ? '' : ', não emitida'})`}
                        </option>
                    ))}
                </select>
            </div>

            <p className="text-sm">
                <span className="text-gray-600">Assinatura: </span>
                {status
                    ? <span className={status.cor}>{status.texto}</span>
                    : <span className="text-gray-800">não enviada</span>}
            </p>
            {v.kind !== 'CONTRATO' && (
                <p className="text-sm text-gray-600">
                    Esta versão é {KIND[v.kind] ? `uma ${KIND[v.kind]}` : v.kind}: assinada, fica registrada nela; o status do contrato
                    só muda com a versão do tipo contrato.
                </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
                {v.assinatura_envelope_id ? (
                    <button type="button" onClick={() => setAcompanhando(true)} className={btnSecundario}>
                        <FileSignature className="w-[15px] h-[15px]" /> Acompanhar assinatura
                    </button>
                ) : (
                    <span title={motivo ?? undefined} className="inline-flex">
                        <button type="button" disabled={!!motivo} onClick={() => setEnviando(true)} className={btnPrimario}>
                            <Send className="w-[15px] h-[15px]" /> Enviar para assinatura
                        </button>
                    </span>
                )}
                <button
                    type="button"
                    className={btnSecundario}
                    onClick={() => abrirArquivoAssinado(BUCKET_DOCUMENTOS, arquivoDaVersao(v).caminho)
                        .catch(e => notifyRef.current(e instanceof Error ? e.message : 'Não foi possível abrir o documento.', 'error'))}
                >
                    <ExternalLink className="w-[15px] h-[15px]" /> {arquivoDaVersao(v).assinada ? 'Abrir via assinada' : 'Abrir documento'}
                </button>
            </div>
            {/* Botão desligado diz o motivo — também à vista, não só no title. */}
            {!v.assinatura_envelope_id && motivo && <p className="text-sm text-amber-700">{motivo}.</p>}

            <EnviarParaAssinaturaSheet
                aberto={enviando}
                onFechar={() => setEnviando(false)}
                origem={enviando ? { tipo: 'CDV', id: v.id } : null}
                titulo={titulo}
                organizationId={contrato.organization_id}
                contractId={contrato.id}
                dealId={dealId}
                onEnviado={async r => {
                    const semEmail = r.signatarios.filter(s => !s.email_enviado);
                    setEnviando(false);
                    await carregar();
                    onNotify(semEmail.length
                        ? `Enviado, mas o e-mail não saiu para: ${semEmail.map(s => s.nome).join(', ')}.`
                        : `Enviado para ${r.signatarios.length} signatário${r.signatarios.length > 1 ? 's' : ''}.`,
                        semEmail.length ? 'error' : 'success');
                }}
            />
            <AcompanharAssinaturaSheet
                aberto={acompanhando}
                onFechar={() => setAcompanhando(false)}
                origem={acompanhando ? { tipo: 'CDV', id: v.id } : null}
                titulo={titulo}
                onAbrirAssinado={v.signed_file_url ? () => {
                    abrirArquivoAssinado(BUCKET_DOCUMENTOS, v.signed_file_url)
                        .catch(e => notifyRef.current(e instanceof Error ? e.message : 'Não foi possível abrir o documento.', 'error'));
                } : undefined}
                onMudou={() => { void carregar(); }}
                onNotify={onNotify}
            />
        </div>
    );
}

// ─── ZapSign ────────────────────────────────────────────────────────────────

/** Linha editável de um signatário — nasce do cadastro do cliente. */
interface SignerRow { name: string; email: string; phone: string; }

function AssinaturaZapSign({ deal, people, organizationId, onStatusChange }: {
    deal: Partial<PropertyDeal>;
    people: Client[];
    organizationId: string;
    onStatusChange?: (status: 'PENDING' | 'SIGNED') => void;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [signerRows, setSignerRows] = useState<SignerRow[]>(() =>
        people.length > 0
            ? people.map(p => ({ name: p.name || 'Cliente', email: p.email || '', phone: p.phone || '' }))
            : [{ name: 'Cliente', email: '', phone: '' }]);
    const setSigner = (i: number, patch: Partial<SignerRow>) =>
        setSignerRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [signUrl, setSignUrl] = useState<string | null>((deal as any).signature_url || null);
    const [checking, setChecking] = useState(false);

    const currentStatus = (deal as any).signature_status as 'PENDING' | 'SIGNED' | 'REFUSED' | undefined;
    const signatureToken = (deal as any).signature_token as string | undefined;

    const handleSend = async () => {
        if (!file) { setError('Selecione o contrato em PDF.'); return; }
        const semEmail = signerRows.find(r => !r.email);
        if (semEmail) { setError(`Informe o e-mail de ${semEmail.name}.`); return; }
        if (!deal.id || !organizationId) { setError('Deal ou organização inválidos.'); return; }

        setLoading(true);
        setError('');
        try {
            const documentBase64 = await signatureService.pdfToBase64(file);
            const signers: SignatureSigner[] = signerRows.map(r => ({
                name: r.name, email: r.email, phone: r.phone || undefined,
            }));
            const result = await signatureService.sendForSignature({
                dealId: deal.id,
                organizationId,
                documentBase64,
                documentName: `Contrato - ${signerRows.map(r => r.name).join(', ') || deal.id}`,
                signers,
            });

            if (!result.success) {
                setError(result.error || 'Falha ao enviar documento.');
                return;
            }
            setSignUrl(result.sign_url || null);
            onStatusChange?.('PENDING');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao enviar documento.');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckStatus = async () => {
        if (!signatureToken || !deal.id) return;
        setChecking(true);
        try {
            const status = await signatureService.getStatus(signatureToken, deal.id, organizationId);
            if (status.status === 'finished') onStatusChange?.('SIGNED');
        } catch { /* silencioso */ } finally {
            setChecking(false);
        }
    };

    const statusCfg = currentStatus ? STATUS_ZAPSIGN[currentStatus] : null;

    if (signatureToken) {
        return (
            <div className="space-y-3">
                {statusCfg && (
                    <p className="text-sm"><span className="text-gray-600">Assinatura: </span><span className={statusCfg.cor}>{statusCfg.label}</span></p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                    {signUrl && (
                        <a href={signUrl} target="_blank" rel="noopener noreferrer" className={btnSecundario}>
                            <ExternalLink className="w-[15px] h-[15px]" /> Abrir link de assinatura
                        </a>
                    )}
                    {currentStatus !== 'SIGNED' && (
                        <button type="button" onClick={handleCheckStatus} disabled={checking} className={btnSecundario}>
                            <RefreshCw className={`w-[15px] h-[15px] ${checking ? 'animate-spin' : ''}`} /> Verificar status
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-500">Contrato (PDF)</span>
                <label className="flex items-center gap-2 px-3 h-9 bg-white border border-gray-200 rounded-[6px] cursor-pointer hover:border-blue-400 transition-all">
                    <Upload className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="text-sm text-gray-700 truncate">{file ? file.name : 'Selecionar arquivo PDF…'}</span>
                    <input type="file" accept=".pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
            </div>

            {/* Um signatário por comprador — todos assinam. */}
            {signerRows.map((row, i) => (
                <div key={i} className="space-y-1.5">
                    {signerRows.length > 1 && <p className="text-sm font-medium text-gray-800">{i + 1}. {row.name}</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label htmlFor={`zs-email-${i}`} className="text-xs font-semibold text-slate-500">E-mail do signatário</label>
                            <input id={`zs-email-${i}`} type="email" value={row.email} onChange={(e) => setSigner(i, { email: e.target.value })}
                                placeholder="email@cliente.com" className={inputCls} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor={`zs-fone-${i}`} className="text-xs font-semibold text-slate-500">WhatsApp (opcional)</label>
                            <input id={`zs-fone-${i}`} type="tel" value={row.phone} onChange={(e) => setSigner(i, { phone: e.target.value })}
                                placeholder="(11) 99999-9999" className={inputCls} />
                        </div>
                    </div>
                </div>
            ))}

            {error && (
                <p className="text-sm text-red-600 flex items-center gap-1.5"><XCircle className="w-4 h-4 shrink-0" />{error}</p>
            )}

            <button type="button" onClick={handleSend} disabled={loading} className={btnPrimario}>
                <Send className="w-[15px] h-[15px]" /> {loading ? 'Enviando…' : 'Enviar para assinatura'}
            </button>
        </div>
    );
}

// ─── Painel ─────────────────────────────────────────────────────────────────

const DealSignaturePanel: React.FC<DealSignaturePanelProps> = ({
    deal, client, clients, organizationId, onStatusChange, contrato = null, onGerarDocumento, versoesRefreshKey, onNotify,
}) => {
    const people = (clients && clients.length > 0) ? clients : (client ? [client] : []);
    // Negociação que já foi ao ZapSign abre nele; o resto abre no portal (sem custo).
    const [modo, setModo] = useState<Modo>((deal as any).signature_token ? 'ZAPSIGN' : 'PORTAL');

    return (
        <div className="space-y-4 p-5 bg-white border border-gray-200 rounded-[10px] shadow-sm">
            <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 rounded-[6px] text-blue-600 shrink-0">
                    <FileSignature className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                    <h4 className="text-sm font-bold text-gray-900">Assinatura eletrônica</h4>
                    <p className="text-sm text-gray-600">{SUBTITULO[modo]}</p>
                </div>
            </div>

            {/* Escolha do caminho — trilho §19.1. */}
            <div role="tablist" aria-label="Como assinar" className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 w-fit">
                {MODOS.map(m => (
                    <button
                        key={m.id}
                        type="button"
                        role="tab"
                        aria-selected={modo === m.id}
                        onClick={() => setModo(m.id)}
                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                            modo === m.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                        }`}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            {modo === 'PORTAL' ? (
                <AssinaturaNoPortal
                    contrato={contrato}
                    dealId={deal.id}
                    onGerarDocumento={onGerarDocumento}
                    versoesRefreshKey={versoesRefreshKey}
                    onNotify={onNotify}
                />
            ) : (
                <AssinaturaZapSign deal={deal} people={people} organizationId={organizationId} onStatusChange={onStatusChange} />
            )}
        </div>
    );
};

export default DealSignaturePanel;
