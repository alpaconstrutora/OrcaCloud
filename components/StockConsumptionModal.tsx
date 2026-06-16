// components/StockConsumptionModal.tsx
// Modal de consumo de estoque vinculado a uma Ordem de Execução (OE)
// Usado dentro do OperacionalModule / WorkOrder detail

import React from 'react';
import { X, Plus, Trash2, Loader2, PackageMinus, Check, AlertTriangle } from 'lucide-react';
import { inventoryService } from '../services/inventoryService';
import type { Warehouse, StockBalance, StockConsumptionItem } from '../types/inventory';

interface Props {
    organizationId: string;
    workOrderId: string;
    workOrderCode: string;
    onClose: () => void;
    onConsumed: (totalCost: number) => void;
}

interface ConsumptionLine extends StockConsumptionItem {
    _key: number;
    _balance?: number;       // saldo disponível (informativo)
    _avgCost?: number;       // custo médio (informativo)
    _insufficientStock: boolean;
}

export const StockConsumptionModal: React.FC<Props> = ({
    organizationId,
    workOrderId,
    workOrderCode,
    onClose,
    onConsumed,
}) => {
    const [warehouses, setWarehouses] = React.useState<Warehouse[]>([]);
    const [balances, setBalances] = React.useState<StockBalance[]>([]);
    const [warehouseId, setWarehouseId] = React.useState('');
    const [lines, setLines] = React.useState<ConsumptionLine[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [err, setErr] = React.useState('');
    const keyRef = React.useRef(0);

    React.useEffect(() => {
        inventoryService.listWarehouses(organizationId)
            .then(whs => {
                setWarehouses(whs);
                if (whs.length > 0) setWarehouseId(whs[0].id);
            })
            .finally(() => setLoading(false));
    }, [organizationId]);

    React.useEffect(() => {
        if (!warehouseId) return;
        inventoryService.listBalances(organizationId, { warehouseId, positiveOnly: false })
            .then(setBalances);
    }, [organizationId, warehouseId]);

    const addLine = () => {
        keyRef.current += 1;
        setLines(prev => [...prev, {
            _key: keyRef.current,
            inputCode: '',
            inputDescription: '',
            inputUnit: 'un',
            quantity: 0,
            _insufficientStock: false,
        }]);
    };

    const removeLine = (key: number) => setLines(prev => prev.filter(l => l._key !== key));

    const updateLine = (key: number, patch: Partial<ConsumptionLine>) => {
        setLines(prev => prev.map(l => {
            if (l._key !== key) return l;
            const updated = { ...l, ...patch };
            // auto-fill ao selecionar insumo pelo código
            if (patch.inputCode !== undefined) {
                const bal = balances.find(b => b.inputCode === patch.inputCode);
                if (bal) {
                    updated.inputDescription = bal.inputDescription;
                    updated.inputUnit = bal.inputUnit;
                    updated._balance = bal.quantity;
                    updated._avgCost = bal.avgUnitCost;
                }
            }
            updated._insufficientStock =
                updated._balance !== undefined && updated.quantity > (updated._balance ?? 0);
            return updated;
        }));
    };

    const estimatedTotal = lines.reduce((s, l) => s + l.quantity * (l._avgCost ?? 0), 0);

    const save = async () => {
        if (!warehouseId) { setErr('Selecione o almoxarifado.'); return; }
        const valid = lines.filter(l => l.inputDescription && l.quantity > 0);
        if (valid.length === 0) { setErr('Adicione ao menos um item com quantidade.'); return; }

        setSaving(true);
        setErr('');
        try {
            const cost = await inventoryService.consumeStockForWorkOrder(
                workOrderId,
                warehouseId,
                valid.map(l => ({
                    inputCode: l.inputCode || undefined,
                    inputDescription: l.inputDescription,
                    inputUnit: l.inputUnit,
                    quantity: l.quantity,
                }))
            );
            onConsumed(cost);
        } catch (e: unknown) {
            setErr((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    const fmtBrl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
                    <div className="flex items-center gap-3">
                        <PackageMinus className="w-5 h-5 text-red-400" />
                        <div>
                            <h3 className="font-semibold text-white">Consumo de Material</h3>
                            <p className="text-xs text-gray-400">OE {workOrderCode}</p>
                        </div>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>
                ) : (
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                        {/* Almoxarifado */}
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Almoxarifado de origem *</label>
                            <select
                                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                                value={warehouseId}
                                onChange={e => setWarehouseId(e.target.value)}
                            >
                                {warehouses.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}{w.projectName ? ` — ${w.projectName}` : ''}</option>
                                ))}
                            </select>
                        </div>

                        {/* Linhas de consumo */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs text-gray-400 uppercase font-medium">Itens consumidos</label>
                                <button
                                    onClick={addLine}
                                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                                >
                                    <Plus className="w-3 h-3" /> Adicionar item
                                </button>
                            </div>

                            {lines.length === 0 && (
                                <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg">
                                    Clique em "Adicionar item" para registrar o consumo.
                                </div>
                            )}

                            <div className="space-y-2">
                                {lines.map(line => (
                                    <div key={line._key} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-2">
                                        <div className="grid grid-cols-12 gap-2">
                                            {/* Seletor de insumo do saldo */}
                                            <div className="col-span-5">
                                                <label className="block text-xs text-gray-500 mb-1">Insumo (do estoque)</label>
                                                <select
                                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
                                                    value={line.inputCode ?? ''}
                                                    onChange={e => updateLine(line._key, { inputCode: e.target.value || '' })}
                                                >
                                                    <option value="">— Selecione ou preencha —</option>
                                                    {balances.map(b => (
                                                        <option key={b.inputCode} value={b.inputCode}>
                                                            {b.inputDescription} ({fmt(b.quantity)} {b.inputUnit})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Descrição manual (se não estiver no saldo) */}
                                            <div className="col-span-4">
                                                <label className="block text-xs text-gray-500 mb-1">Descrição</label>
                                                <input
                                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
                                                    value={line.inputDescription}
                                                    onChange={e => updateLine(line._key, { inputDescription: e.target.value })}
                                                    placeholder="Nome do insumo"
                                                />
                                            </div>

                                            {/* Un */}
                                            <div className="col-span-1">
                                                <label className="block text-xs text-gray-500 mb-1">Un</label>
                                                <input
                                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
                                                    value={line.inputUnit}
                                                    onChange={e => updateLine(line._key, { inputUnit: e.target.value })}
                                                />
                                            </div>

                                            {/* Qtd */}
                                            <div className="col-span-2">
                                                <label className="block text-xs text-gray-500 mb-1">Quantidade</label>
                                                <input
                                                    type="number" min="0.001" step="0.01"
                                                    className={`w-full bg-gray-900 border rounded px-2 py-1.5 text-sm text-white ${line._insufficientStock ? 'border-yellow-500' : 'border-gray-600'}`}
                                                    value={line.quantity || ''}
                                                    onChange={e => updateLine(line._key, { quantity: parseFloat(e.target.value) || 0 })}
                                                />
                                            </div>
                                        </div>

                                        {/* Info de saldo e custo + botão remover */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3 text-xs">
                                                {line._balance !== undefined && (
                                                    <span className={line._insufficientStock ? 'text-yellow-400' : 'text-gray-400'}>
                                                        Saldo: {fmt(line._balance)} {line.inputUnit}
                                                        {line._insufficientStock && ' ⚠ insuficiente'}
                                                    </span>
                                                )}
                                                {line._avgCost != null && line.quantity > 0 && (
                                                    <span className="text-gray-500">
                                                        ≈ {fmtBrl(line.quantity * line._avgCost)}
                                                    </span>
                                                )}
                                            </div>
                                            <button onClick={() => removeLine(line._key)} className="text-gray-600 hover:text-red-400">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-700 shrink-0 space-y-3">
                    {lines.some(l => l._insufficientStock) && (
                        <div className="flex items-center gap-2 text-yellow-400 text-xs bg-yellow-900/20 border border-yellow-800 rounded-lg px-3 py-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            Um ou mais itens excedem o saldo disponível. O consumo será registrado mesmo assim (saldo ficará negativo).
                        </div>
                    )}
                    {err && <p className="text-red-400 text-xs">{err}</p>}
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-400">
                            Custo estimado: <span className="text-white font-semibold">{fmtBrl(estimatedTotal)}</span>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800">
                                Cancelar
                            </button>
                            <button
                                onClick={save} disabled={saving || lines.length === 0}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                Registrar Consumo
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StockConsumptionModal;
