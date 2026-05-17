import React from 'react';
import {
    X, Plus, Calendar, Save,
    AlertCircle, CheckCircle2, DollarSign,
    FileText, History
} from 'lucide-react';
import {
    Contract, ContractAddendum
} from '../types';
import { contractService } from '../services/contractService';

interface ContractAddendumModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    onSuccess: () => void;
}

const ContractAddendumModal: React.FC<ContractAddendumModalProps> = ({
    isOpen, onClose, contract, onSuccess
}) => {
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [formData, setFormData] = React.useState({
        description: '',
        value_impact: 0,
        new_end_date: contract.end_date || '',
        notes: ''
    });

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!formData.description) {
            setError("Por favor, descreva o objeto do aditivo.");
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const existingAddendums = await contractService.listAddendums(contract.id);
            const addendumData: Omit<ContractAddendum, 'id' | 'created_at' | 'status' | 'approved_at'> = {
                contract_id: contract.id,
                number: `AD-${String(existingAddendums.length + 1).padStart(3, '0')}`,
                description: formData.description,
                type: formData.value_impact !== 0 ? (formData.new_end_date !== contract.end_date ? 'Ambos' : 'Valor') : 'Prazo',
                value_impact: formData.value_impact,
                new_end_date: formData.new_end_date || undefined,
                notes: formData.notes
            };

            await contractService.createAddendum(addendumData);
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Erro ao solicitar aditivo:", err);
            setError("Falha ao salvar aditivo. Verifique os dados.");
        } finally {
            setLoading(false);
        }
    };

    const newValue = (contract.current_value || 0) + formData.value_impact;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col border border-white/20">
                {/* Header */}
                <div className="bg-[#0B1727] p-8 text-white relative shrink-0">
                    <div className="absolute top-0 right-0 w-32 h-full bg-blue-600/10 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />
                    <div className="flex justify-between items-start relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
                                <Plus className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-medium tracking-tight uppercase leading-none">Novo Aditivo</h2>
                                <p className="text-blue-400 text-[12px] font-medium uppercase tracking-[0.2em] mt-2">Alteração de Valor ou Prazo</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-gray-400 hover:text-white border border-white/10"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Form */}
                <div className="p-10 space-y-8 overflow-y-auto">
                    <div className="space-y-2">
                        <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Descrição do Aditivo</label>
                        <div className="relative">
                            <FileText className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                            <input
                                type="text"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Ex: Acréscimo de escopo na fachada / Reajuste IGPM"
                                className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Impacto Financeiro (R$)</label>
                            <div className="relative">
                                <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
                                <input
                                    type="number"
                                    value={formData.value_impact}
                                    onChange={e => setFormData({ ...formData, value_impact: parseFloat(e.target.value) || 0 })}
                                    placeholder="0,00"
                                    className="w-full pl-14 pr-6 py-4 bg-blue-50/30 border border-blue-100/50 rounded-2xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                />
                            </div>
                            <p className="text-[12px] text-gray-400 font-medium ml-1 uppercase">Use valores negativos para descontos.</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[12px] font-medium text-gray-400 uppercase tracking-widest ml-1">Nova Data de Término</label>
                            <div className="relative">
                                <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                <input
                                    type="date"
                                    value={formData.new_end_date}
                                    onChange={e => setFormData({ ...formData, new_end_date: e.target.value })}
                                    className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-900 rounded-[32px] p-8 text-white flex justify-between items-center shadow-2xl">
                        <div>
                            <p className="text-[12px] font-medium text-blue-400 uppercase tracking-widest mb-1">Atual Valor do Contrato</p>
                            <p className="text-xs font-medium opacity-60">R$ {contract.current_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[12px] font-medium text-emerald-400 uppercase tracking-widest mb-1">Novo Valor Previsto</p>
                            <p className="text-2xl font-medium tracking-tighter">R$ {newValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="w-5 h-5" />
                            <p className="text-[12px] font-medium uppercase tracking-widest">{error}</p>
                        </div>
                    )}
                </div>

                <div className="p-8 bg-gray-50 border-t border-gray-100 shrink-0 flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-8 py-4 bg-white border border-gray-200 rounded-2xl text-gray-400 hover:text-gray-600 transition-all font-medium text-[12px] uppercase tracking-widest"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="flex items-center gap-2 px-10 py-4 bg-gray-900 text-white rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-gray-200 font-medium text-[12px] uppercase tracking-widest active:scale-95 group"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        )}
                        Solicitar Aditivo
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ContractAddendumModal;
