import React from 'react';
import {
    X, Zap, Calendar, Save,
    CheckCircle2, Info, Loader2
} from 'lucide-react';
import { Contract, ContractUtilityBill, UtilityBillStatus } from '../types';
import { contractService } from '../services/contractService';

interface UtilityBillModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    onSuccess: () => void;
    initialData?: ContractUtilityBill;
}

const UtilityBillModal: React.FC<UtilityBillModalProps> = ({
    isOpen, onClose, contract, onSuccess, initialData
}) => {
    const [loading, setLoading] = React.useState(false);
    const [referenceMonth, setReferenceMonth] = React.useState(initialData?.reference_month || new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = React.useState(initialData?.due_date || '');
    const [status, setStatus] = React.useState<UtilityBillStatus>(initialData?.status || 'Pendente');
    const [totalValue, setTotalValue] = React.useState<string>(initialData?.total_value.toString() || '');
    const [consumptionMetric, setConsumptionMetric] = React.useState<string>(initialData?.consumption_metric?.toString() || '');
    const [notes, setNotes] = React.useState(initialData?.notes || '');

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!referenceMonth) {
            alert("Por favor, preencha o mês de referência.");
            return;
        }

        const value = parseFloat(totalValue.replace(',', '.'));
        if (isNaN(value) || value <= 0) {
            alert("Por favor, insira um valor total válido.");
            return;
        }

        try {
            setLoading(true);

            const billData: Omit<ContractUtilityBill, 'id' | 'created_at'> = {
                contract_id: contract.id,
                reference_month: referenceMonth,
                consumption_metric: consumptionMetric ? parseFloat(consumptionMetric.replace(',', '.')) : undefined,
                total_value: value,
                status: status,
                due_date: dueDate || undefined,
                notes: notes
            };

            if (initialData) {
                await contractService.updateUtilityBill(initialData.id, billData);
            } else {
                await contractService.createUtilityBill(billData);
            }

            onSuccess();
            onClose();
        } catch (error: any) {
            console.error("Erro ao salvar fatura:", error);
            alert(`Erro ao salvar fatura: ${error.message || "Erro desconhecido"}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={onClose} />

            <div className="bg-white w-full max-w-4xl rounded-[48px] shadow-2xl overflow-hidden relative z-10 flex flex-col">
                {/* Header */}
                <div className="bg-[#0B1727] p-8 md:p-12 text-white relative shrink-0">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full -mr-32 -mt-32 blur-3xl" />
                    <div className="flex justify-between items-start relative z-10">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
                                    <Zap className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <p className="text-[12px] font-medium text-blue-400 uppercase tracking-[0.2em]">{initialData ? 'Edição de Fatura' : 'Nova Fatura de Consumo'}</p>
                                    <h2 className="text-3xl font-medium tracking-tight uppercase leading-none">{contract.title}</h2>
                                </div>
                            </div>
                            <p className="text-gray-400 font-medium text-sm max-w-xl">
                                Registre a medição de consumo ou a mensalidade da assinatura deste contrato recorrente.
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-gray-400 hover:text-white border border-white/10"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body Form */}
                <div className="flex-1 overflow-y-auto p-12 bg-white space-y-8">
                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Mês de Referência</label>
                            <input
                                type="date"
                                required
                                value={referenceMonth}
                                onChange={e => setReferenceMonth(e.target.value)}
                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Data de Vencimento</label>
                            <input
                                type="date"
                                value={dueDate}
                                onChange={e => setDueDate(e.target.value)}
                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Valor Total (R$)</label>
                            <input
                                type="text"
                                required
                                placeholder="0,00"
                                value={totalValue}
                                onChange={e => setTotalValue(e.target.value)}
                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Consumo (Ex: kWh, m³) - Opcional</label>
                            <input
                                type="text"
                                placeholder="0,00"
                                value={consumptionMetric}
                                onChange={e => setConsumptionMetric(e.target.value)}
                                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            />
                        </div>

                        <div className="space-y-2 col-span-2">
                            <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Status de Pagamento</label>
                            <div className="flex gap-4">
                                {['Pendente', 'Pago', 'Atrasado', 'Cancelado'].map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setStatus(s as UtilityBillStatus)}
                                        className={`flex-1 py-4 px-6 rounded-2xl border text-sm font-medium transition-all ${
                                            status === s
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                                                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                                        }`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-8 md:p-12 bg-gray-50 border-t border-gray-100 shrink-0">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                                <Info className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Observações (Opcional)</p>
                                <input
                                    type="text"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Ex: Refaturamento por erro de leitura..."
                                    className="bg-transparent text-sm font-medium text-gray-700 outline-none w-full md:w-80 placeholder:text-gray-300"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <button
                                onClick={onClose}
                                className="flex-1 md:flex-none px-8 py-4 bg-white border border-gray-200 rounded-2xl text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all font-medium text-[12px] uppercase tracking-widest"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-10 py-4 bg-gray-900 text-white rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-gray-200 font-medium text-[12px] uppercase tracking-widest disabled:opacity-50 group active:scale-95"
                            >
                                {loading ? (
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                )}
                                {initialData ? 'Salvar Edição' : 'Registrar Fatura'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UtilityBillModal;
