import React, { useState } from 'react';
import { XCircle, AlertTriangle, X, FileText } from 'lucide-react';
import { commercialFinanceService } from '../services/commercialFinanceService';
import { PropertyDeal } from '../types';

interface DealCancelModalProps {
    isOpen: boolean;
    deal: Partial<PropertyDeal>;
    organizationId: string;
    onConfirm: (reason: string, refundAmount: number) => void;
    onClose: () => void;
}

const DISTRATO_REASONS = [
    'Desistência do cliente',
    'Recusa de crédito / financiamento',
    'Divergência de valor / condições',
    'Problema jurídico no imóvel',
    'Falecimento do comprador',
    'Rescisão mútua',
    'Outro',
];

const DealCancelModal: React.FC<DealCancelModalProps> = ({ isOpen, deal, organizationId, onConfirm, onClose }) => {
    const [reason, setReason] = useState('');
    const [customReason, setCustomReason] = useState('');
    const [refundAmount, setRefundAmount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [paidInfo, setPaidInfo] = useState<{ hasPaid: boolean; paidCount: number } | null>(null);

    React.useEffect(() => {
        if (!isOpen || !deal.id) return;
        commercialFinanceService.hasPaidInstallments(deal.id, organizationId)
            .then(info => setPaidInfo(info))
            .catch(() => setPaidInfo(null));
    }, [isOpen, deal.id, organizationId]);

    if (!isOpen) return null;

    const finalReason = reason === 'Outro' ? customReason : reason;

    const handleConfirm = async () => {
        if (!finalReason.trim()) { setError('Informe o motivo do distrato.'); return; }
        setLoading(true);
        setError('');
        try {
            onConfirm(finalReason, refundAmount);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao processar distrato.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 bg-red-50 border-b border-red-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-600 rounded-xl text-white">
                            <XCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-red-900 uppercase tracking-wide">Distrato / Cancelamento</h3>
                            <p className="text-xs text-red-600 font-bold">Esta ação libera a unidade no espelho de vendas.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-all">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Alerta parcelas pagas */}
                    {paidInfo?.hasPaid && (
                        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-black text-amber-800 uppercase tracking-wide mb-1">Atenção: Parcelas Pagas</p>
                                <p className="text-xs text-amber-700">
                                    Esta negociação possui <strong>{paidInfo.paidCount} parcela(s) liquidada(s)</strong> no financeiro.
                                    Elas serão marcadas como canceladas. Informe abaixo o valor de devolução ao cliente, se aplicável.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Motivo */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Motivo do Distrato *</label>
                        <div className="grid grid-cols-1 gap-2">
                            {DISTRATO_REASONS.map(r => (
                                <button
                                    key={r}
                                    onClick={() => setReason(r)}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-left border transition-all
                                        ${reason === r
                                            ? 'bg-red-600 text-white border-red-700'
                                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-red-200 hover:bg-red-50'
                                        }`}
                                >
                                    <FileText className="w-3.5 h-3.5 shrink-0" />
                                    {r}
                                </button>
                            ))}
                        </div>
                        {reason === 'Outro' && (
                            <input
                                type="text"
                                value={customReason}
                                onChange={(e) => setCustomReason(e.target.value)}
                                placeholder="Descreva o motivo..."
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-red-400 transition-all"
                            />
                        )}
                    </div>

                    {/* Valor de devolução */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                            Valor a Devolver ao Cliente (R$)
                        </label>
                        <input
                            type="number"
                            min={0}
                            value={refundAmount}
                            onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 outline-none focus:border-red-400 transition-all"
                        />
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
                            Será registrado como observação do distrato para controle financeiro.
                        </p>
                    </div>

                    {error && <p className="text-xs font-bold text-red-600">{error}</p>}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-6 pt-0">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 text-xs font-black rounded-xl hover:bg-gray-200 transition-all uppercase tracking-wide"
                    >
                        Voltar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading || !finalReason.trim()}
                        className="flex-1 px-4 py-3 bg-red-600 text-white text-xs font-black rounded-xl hover:bg-red-700 transition-all uppercase tracking-wide shadow-md shadow-red-900/20 disabled:opacity-50"
                    >
                        {loading ? 'Processando...' : 'Confirmar Distrato'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DealCancelModal;
