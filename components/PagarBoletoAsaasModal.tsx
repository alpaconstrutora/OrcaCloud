import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Landmark, Loader2 } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';
import { supplierPaymentService } from '../services/supplierPaymentService';
import type { QuoteResult } from '../services/supplierPaymentService';

function fmt(v: number | undefined | null) {
    if (v == null) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(d: string | undefined | null) {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

interface Props {
    organizationId: string;
    boletoId: string;
    supplierName?: string;
    amount?: number;
    dueDate?: string;
    onClose: () => void;
    onPaid: () => void;
}

export default function PagarBoletoAsaasModal({ organizationId, boletoId, supplierName, amount, dueDate, onClose, onPaid }: Props) {
    const [loading, setLoading] = useState(true);
    const [quote, setQuote] = useState<QuoteResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [paying, setPaying] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const q = await supplierPaymentService.quote(organizationId, boletoId);
                if (active) setQuote(q);
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : 'Falha ao consultar boleto na Asaas');
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [organizationId, boletoId]);

    async function handleConfirm() {
        setPaying(true);
        setError(null);
        try {
            await supplierPaymentService.pay(organizationId, boletoId);
            onPaid();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao pagar boleto');
            setPaying(false);
        }
    }

    return (
        <Modal open onClose={onClose} size="md" dismissable={!paying}>
            <ModalHeader
                title="Pagar boleto via Asaas"
                description={supplierName}
                icon={<div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Landmark className="w-5 h-5 text-emerald-600" /></div>}
                onClose={paying ? undefined : onClose}
            />
            <ModalBody>
                {loading ? (
                    <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Consultando boleto na Asaas...</span>
                    </div>
                ) : error && !quote ? (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        {error}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            Confira o beneficiário abaixo antes de confirmar — evita pagar um boleto adulterado.
                        </div>

                        <dl className="divide-y divide-gray-100 text-sm">
                            <div className="flex items-center justify-between py-2">
                                <dt className="text-gray-500">Beneficiário (Asaas)</dt>
                                <dd className="font-bold text-gray-900 text-right">{quote?.beneficiary_name ?? '—'}</dd>
                            </div>
                            {quote?.beneficiary_cpf_cnpj && (
                                <div className="flex items-center justify-between py-2">
                                    <dt className="text-gray-500">CPF/CNPJ beneficiário</dt>
                                    <dd className="font-medium text-gray-700">{quote.beneficiary_cpf_cnpj}</dd>
                                </div>
                            )}
                            <div className="flex items-center justify-between py-2">
                                <dt className="text-gray-500">Valor</dt>
                                <dd className="font-bold text-gray-900">{fmt(quote?.real_value ?? amount)}</dd>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <dt className="text-gray-500">Vencimento</dt>
                                <dd className="font-medium text-gray-700">{fmtDate(dueDate)}</dd>
                            </div>
                            {quote?.fee != null && quote.fee > 0 && (
                                <div className="flex items-center justify-between py-2">
                                    <dt className="text-gray-500">Taxa Asaas</dt>
                                    <dd className="font-medium text-gray-700">{fmt(quote.fee)}</dd>
                                </div>
                            )}
                        </dl>

                        {quote?.value_mismatch && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                O valor capturado no upload ({fmt(quote.captured_value)}) diverge do valor real da
                                linha digitável ({fmt(quote.real_value)}). Confira o boleto antes de pagar — pode ser
                                erro de leitura ou boleto adulterado.
                            </div>
                        )}

                        {quote?.is_overdue && (
                            <p className="text-xs text-amber-600">Este boleto está vencido — pode haver juros/multa aplicados pelo credor.</p>
                        )}

                        {quote?.beneficiary_name_source === 'boleto_capturado' && (
                            <p className="text-xs text-amber-600">
                                A Asaas não retornou o nome do beneficiário na simulação — o nome acima foi capturado
                                no upload do boleto. Confira manualmente antes de pagar.
                            </p>
                        )}

                        {error && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                {error}
                            </div>
                        )}
                    </div>
                )}
            </ModalBody>
            <ModalFooter>
                <button
                    onClick={onClose}
                    disabled={paying}
                    className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded-lg text-sm transition-all disabled:opacity-50"
                >
                    Cancelar
                </button>
                <button
                    onClick={handleConfirm}
                    disabled={loading || paying || !quote}
                    className="flex items-center gap-2 px-6 py-2 text-white font-bold rounded-lg text-sm transition-all bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                    {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Confirmar pagamento
                </button>
            </ModalFooter>
        </Modal>
    );
}
