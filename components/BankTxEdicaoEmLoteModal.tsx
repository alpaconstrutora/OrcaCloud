import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, Tag } from 'lucide-react';
import { formatMoney } from './ui/Format';
import type { BankTransaction } from '../types';

interface ItemOption {
    id: string;
    name: string;
}

interface BankTxEdicaoEmLoteModalProps {
    transactions: BankTransaction[];
    categories: string[];
    clientOptions: string[];
    supplierOptions: string[];
    projects: ItemOption[];
    costCenters: ItemOption[];
    onClose: () => void;
    onSave: (fields: Partial<Pick<BankTransaction, 'category' | 'counterparty_name' | 'project_id' | 'cost_center_id'>>) => Promise<void>;
}

const BankTxEdicaoEmLoteModal: React.FC<BankTxEdicaoEmLoteModalProps> = ({
    transactions, categories, clientOptions, supplierOptions, projects, costCenters, onClose, onSave,
}) => {
    const [category, setCategory] = useState('');
    const [clientName, setClientName] = useState('');
    const [supplierName, setSupplierName] = useState('');
    const [projectId, setProjectId] = useState('');
    const [costCenterId, setCostCenterId] = useState('');
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const totalValor = transactions.reduce((s, t) => s + (t.amount ?? 0), 0);

    const contrapartes = [...new Set(transactions.map(t => t.counterparty_name ?? ''))];
    const mixedContraparte = contrapartes.length > 1;

    const entityName = clientName || supplierName;
    const noneChanged = !category && !entityName && !projectId && !costCenterId;

    async function handleSalvar() {
        setSaving(true);
        setErrorMsg(null);
        try {
            const fields: Partial<Pick<BankTransaction, 'category' | 'counterparty_name' | 'project_id' | 'cost_center_id'>> = {};
            if (category) fields.category = category;
            if (entityName) fields.counterparty_name = entityName;
            if (projectId) fields.project_id = projectId;
            if (costCenterId) fields.cost_center_id = costCenterId;
            await onSave(fields);
            onClose();
        } catch (err: unknown) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Edição em Lote</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {transactions.length} lançamento{transactions.length !== 1 ? 's' : ''} selecionado{transactions.length !== 1 ? 's' : ''} · {formatMoney(totalValor)}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

                    {/* Aviso contrapartes misturadas */}
                    {mixedContraparte && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>
                                Os lançamentos selecionados têm <strong>{contrapartes.length} contrapartes distintas</strong>.
                                A edição se aplica a todos igualmente.
                            </span>
                        </div>
                    )}

                    {/* Lista resumida */}
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 divide-y divide-gray-100 max-h-36 overflow-y-auto">
                        {transactions.map(t => (
                            <div key={t.id} className="flex items-center justify-between px-4 py-2 text-xs">
                                <span className="text-gray-700 font-medium truncate max-w-[60%]">
                                    {t.description_normalized ?? t.description_raw ?? '—'}
                                </span>
                                <span className="text-gray-500 font-bold flex-shrink-0 ml-2">
                                    {t.direction === 'DEBIT' ? '-' : '+'} {formatMoney(t.amount)}
                                </span>
                            </div>
                        ))}
                    </div>

                    {errorMsg && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* Campos de edição */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 pb-1 border-b border-gray-100">
                            <Tag className="w-3.5 h-3.5" />
                            Alterar campos — deixe vazio para não alterar
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Categoria</label>
                            <select
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                disabled={saving}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
                            >
                                <option value="">— Não alterar —</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Cliente</label>
                                <select
                                    value={clientName}
                                    onChange={e => { setClientName(e.target.value); if (e.target.value) setSupplierName(''); }}
                                    disabled={saving || !!supplierName}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
                                >
                                    <option value="">— Não alterar —</option>
                                    {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Fornecedor</label>
                                <select
                                    value={supplierName}
                                    onChange={e => { setSupplierName(e.target.value); if (e.target.value) setClientName(''); }}
                                    disabled={saving || !!clientName}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
                                >
                                    <option value="">— Não alterar —</option>
                                    {supplierOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Obra / Projeto</label>
                            <select
                                value={projectId}
                                onChange={e => setProjectId(e.target.value)}
                                disabled={saving}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
                            >
                                <option value="">— Não alterar —</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Centro de Custo</label>
                            <select
                                value={costCenterId}
                                onChange={e => setCostCenterId(e.target.value)}
                                disabled={saving}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
                            >
                                <option value="">— Não alterar —</option>
                                {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>

                        {noneChanged && (
                            <p className="text-xs text-gray-400 text-center">Selecione ao menos um campo para habilitar as ações.</p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex items-center gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-button uppercase tracking-widest hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSalvar}
                        disabled={saving || noneChanged}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-blue-600 text-white font-bold text-button uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-lg shadow-blue-900/20"
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BankTxEdicaoEmLoteModal;
