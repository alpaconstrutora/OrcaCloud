import React, { useState } from 'react';
import { FileSignature, Upload, Send, CheckCircle2, Clock, XCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { signatureService, SignatureSigner } from '../services/signatureService';
import { PropertyDeal, Client } from '../types';

interface DealSignaturePanelProps {
    deal: Partial<PropertyDeal>;
    client?: Client | null;
    organizationId: string;
    onStatusChange?: (status: 'PENDING' | 'SIGNED') => void;
}

const STATUS_CONFIG = {
    PENDING: { label: 'Aguardando Assinatura', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    SIGNED:  { label: 'Assinado', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    REFUSED: { label: 'Recusado', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
} as const;

const DealSignaturePanel: React.FC<DealSignaturePanelProps> = ({ deal, client, organizationId, onStatusChange }) => {
    const [file, setFile] = useState<File | null>(null);
    const [signerEmail, setSignerEmail] = useState(client?.email || '');
    const [signerPhone, setSignerPhone] = useState(client?.phone || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [signUrl, setSignUrl] = useState<string | null>((deal as any).signature_url || null);
    const [checking, setChecking] = useState(false);

    const currentStatus = (deal as any).signature_status as 'PENDING' | 'SIGNED' | 'REFUSED' | undefined;
    const signatureToken = (deal as any).signature_token as string | undefined;

    const handleSend = async () => {
        if (!file) { setError('Selecione o contrato em PDF.'); return; }
        if (!signerEmail) { setError('Informe o e-mail do signatário.'); return; }
        if (!deal.id || !organizationId) { setError('Deal ou organização inválidos.'); return; }

        setLoading(true);
        setError('');
        try {
            const documentBase64 = await signatureService.pdfToBase64(file);
            const signers: SignatureSigner[] = [
                { name: client?.name || 'Cliente', email: signerEmail, phone: signerPhone || undefined },
            ];
            const result = await signatureService.sendForSignature({
                dealId: deal.id,
                organizationId,
                documentBase64,
                documentName: `Contrato - ${client?.name || deal.id}`,
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

    const statusCfg = currentStatus ? STATUS_CONFIG[currentStatus] : null;

    return (
        <div className="space-y-4 p-5 bg-purple-50 border border-purple-100 rounded-2xl">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-600 rounded-xl text-white">
                    <FileSignature className="w-4 h-4" />
                </div>
                <div>
                    <h4 className="text-sm font-black text-purple-900 uppercase tracking-wide">Assinatura Eletrônica</h4>
                    <p className="text-xs text-purple-600">Powered by ZapSign — validade jurídica garantida</p>
                </div>
                {statusCfg && (
                    <div className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
                        <statusCfg.icon className="w-3.5 h-3.5" />
                        {statusCfg.label}
                    </div>
                )}
            </div>

            {/* Já foi enviado */}
            {signatureToken ? (
                <div className="space-y-3">
                    {signUrl && (
                        <a
                            href={signUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-700 transition-all w-fit"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Abrir Link de Assinatura
                        </a>
                    )}
                    {currentStatus !== 'SIGNED' && (
                        <button
                            onClick={handleCheckStatus}
                            disabled={checking}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-purple-200 text-purple-700 text-xs font-bold rounded-xl hover:bg-purple-50 transition-all"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                            Verificar Status
                        </button>
                    )}
                </div>
            ) : (
                /* Formulário de envio */
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] font-black text-purple-700 uppercase tracking-widest mb-1 block">Contrato (PDF)</label>
                        <label className="flex items-center gap-3 px-4 py-3 bg-white border border-purple-200 rounded-xl cursor-pointer hover:border-purple-400 transition-all">
                            <Upload className="w-4 h-4 text-purple-500 shrink-0" />
                            <span className="text-xs font-bold text-purple-700 truncate">
                                {file ? file.name : 'Selecionar arquivo PDF...'}
                            </span>
                            <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                            />
                        </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-black text-purple-700 uppercase tracking-widest mb-1 block">E-mail do signatário</label>
                            <input
                                type="email"
                                value={signerEmail}
                                onChange={(e) => setSignerEmail(e.target.value)}
                                placeholder="email@cliente.com"
                                className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-purple-400 transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-purple-700 uppercase tracking-widest mb-1 block">WhatsApp (opcional)</label>
                            <input
                                type="tel"
                                value={signerPhone}
                                onChange={(e) => setSignerPhone(e.target.value)}
                                placeholder="(11) 99999-9999"
                                className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-purple-400 transition-all"
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="text-xs font-bold text-red-600 flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5 shrink-0" />{error}
                        </p>
                    )}

                    <button
                        onClick={handleSend}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-xs font-black rounded-xl hover:bg-purple-700 transition-all disabled:opacity-50 uppercase tracking-wide shadow-md shadow-purple-900/10"
                    >
                        <Send className="w-3.5 h-3.5" />
                        {loading ? 'Enviando...' : 'Enviar para Assinatura'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default DealSignaturePanel;
