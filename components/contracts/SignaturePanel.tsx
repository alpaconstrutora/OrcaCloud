import React, { useState } from 'react';
import { PenLine, ExternalLink, RefreshCw, Plus, Trash2 } from 'lucide-react';

export type SignatureStatus = 'PENDING' | 'SENT' | 'SIGNED' | 'EXPIRED' | 'CANCELLED';

export interface Signer { name: string; email: string; phone?: string }

interface Props {
    /** Rótulo do que está sendo assinado (ex.: "Contrato CL-2026-001", "Aditivo AD-001"). */
    label: string;
    status?: SignatureStatus;
    signatureUrl?: string;
    completedAt?: string;
    signedFileUrl?: string;
    /** Ausente = não há documento para assinar (o painel explica em vez de falhar). */
    onSend?: (signers: Signer[]) => Promise<void>;
    onRefresh?: () => Promise<void>;
    /** Motivo de o envio estar indisponível, mostrado no lugar do formulário. */
    disabledReason?: string;
}

const STATUS_LABEL: Record<SignatureStatus, string> = {
    PENDING: 'Aguardando envio',
    SENT: 'Enviado para assinatura',
    SIGNED: 'Assinado',
    EXPIRED: 'Expirado',
    CANCELLED: 'Cancelado',
};

const STATUS_COLOR: Record<SignatureStatus, string> = {
    PENDING: 'text-gray-600',
    SENT: 'text-blue-600',
    SIGNED: 'text-emerald-600',
    EXPIRED: 'text-amber-600',
    CANCELLED: 'text-red-600',
};

/** Data BR sem bug de fuso — em UTC-3 `new Date(iso)` retrocede um dia. */
const fmtDateTime = (iso?: string) => {
    if (!iso) return '';
    const [date, time] = iso.split('T');
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}${time ? ` ${time.slice(0, 5)}` : ''}`;
};

/**
 * Assinatura eletrônica (ZapSign) de um documento qualquer — contrato, aditivo
 * ou versão de documento.
 *
 * Extraído do `SignaturePanel` que vivia dentro de ContractDetailView e só
 * sabia assinar `contract`. As props agora são o estado da assinatura, não a
 * entidade, para o mesmo painel servir aos três casos.
 */
const SignaturePanel: React.FC<Props> = ({
    label, status, signatureUrl, completedAt, signedFileUrl, onSend, onRefresh, disabledReason,
}) => {
    const [signers, setSigners] = useState<Signer[]>([{ name: '', email: '', phone: '' }]);
    const [sending, setSending] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const current = status ?? 'PENDING';
    const podeEnviar = Boolean(onSend) && !disabledReason && current !== 'SIGNED';

    const setSigner = (i: number, patch: Partial<Signer>) =>
        setSigners(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

    const handleSend = async () => {
        const validos = signers.filter(s => s.name.trim() && s.email.trim());
        if (validos.length === 0 || !onSend) return;
        setSending(true);
        try { await onSend(validos); } finally { setSending(false); }
    };

    const handleRefresh = async () => {
        if (!onRefresh) return;
        setRefreshing(true);
        try { await onRefresh(); } finally { setRefreshing(false); }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <PenLine className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{label}</span>
                    <span className={`text-sm font-normal ${STATUS_COLOR[current]}`}>· {STATUS_LABEL[current]}</span>
                    {completedAt && (
                        <span className="text-sm text-gray-400">em {fmtDateTime(completedAt)}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {signatureUrl && current !== 'SIGNED' && (
                        <a
                            href={signatureUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
                        >
                            <ExternalLink className="w-4 h-4" /> Link de assinatura
                        </a>
                    )}
                    {signedFileUrl && (
                        <a
                            href={signedFileUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
                        >
                            <ExternalLink className="w-4 h-4" /> Documento assinado
                        </a>
                    )}
                    {onRefresh && status && (
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            title="Atualizar status da assinatura"
                            className="h-9 w-9 flex items-center justify-center bg-gray-50 text-gray-500 rounded-[6px] hover:bg-gray-100 transition-all disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>
            </div>

            {disabledReason && (
                <p className="text-sm text-gray-500">{disabledReason}</p>
            )}

            {podeEnviar && (
                <div className="space-y-2">
                    {signers.map((s, i) => (
                        <div key={i} className="flex flex-col md:flex-row gap-2">
                            <input
                                type="text" placeholder="Nome do signatário" value={s.name}
                                onChange={(e) => setSigner(i, { name: e.target.value })}
                                className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                            <input
                                type="email" placeholder="E-mail" value={s.email}
                                onChange={(e) => setSigner(i, { email: e.target.value })}
                                className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                            <input
                                type="text" placeholder="WhatsApp (opcional)" value={s.phone ?? ''}
                                onChange={(e) => setSigner(i, { phone: e.target.value })}
                                className="w-full md:w-44 h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                            {signers.length > 1 && (
                                <button
                                    onClick={() => setSigners(prev => prev.filter((_, idx) => idx !== i))}
                                    title="Remover signatário"
                                    className="h-9 w-9 flex items-center justify-center bg-white border border-red-100 text-red-500 rounded-[6px] hover:bg-red-50 transition-all"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSigners(prev => [...prev, { name: '', email: '', phone: '' }])}
                            className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all"
                        >
                            <Plus className="w-4 h-4" /> Signatário
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={sending || !signers.some(s => s.name.trim() && s.email.trim())}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                        >
                            <PenLine className="w-[15px] h-[15px]" />
                            {sending ? 'Enviando…' : 'Enviar para assinatura'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SignaturePanel;
