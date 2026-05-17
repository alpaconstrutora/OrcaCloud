import React from 'react';
import { X, CheckCircle2, AlertTriangle, Camera, Package } from 'lucide-react';
import { PurchaseOrder } from '../types';
import { orderService } from '../services/orderService';
import { CreateReceiptItemInput } from '../services/receiptService';

interface ReceiptItemRow {
    code: string;
    description: string;
    unit: string;
    quantityOrdered: number;
    quantityReceived: number;
    issue?: 'quebrado' | 'faltando';
}

interface OrderReceiptModalProps {
    order: PurchaseOrder;
    onClose: () => void;
    onSave: () => void;
}

const OrderReceiptModal: React.FC<OrderReceiptModalProps> = ({ order, onClose, onSave }) => {
    const [receiptPhoto, setReceiptPhoto] = React.useState<File | null>(null);
    const [receiptNotes, setReceiptNotes] = React.useState(order.receiptNotes || '');
    const [isSaving, setIsSaving] = React.useState(false);

    // Per-item receipt rows, pre-filled from order items
    const [rows, setRows] = React.useState<ReceiptItemRow[]>(() =>
        order.items.map(item => ({
            code: item.code,
            description: item.description,
            unit: item.unit,
            quantityOrdered: item.quantity,
            quantityReceived: item.quantity,
            issue: undefined,
        }))
    );

    const updateRow = (idx: number, patch: Partial<ReceiptItemRow>) => {
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
    };

    const hasAnyShortfall = rows.some(r => r.quantityReceived < r.quantityOrdered);
    const allReceived = rows.every(r => r.quantityReceived >= r.quantityOrdered);
    const hasDivergence = rows.some(r => r.issue || r.quantityReceived < r.quantityOrdered);

    const computedStatus = (): 'Recebido' | 'Divergência' | 'Parcial' => {
        if (hasDivergence) return 'Divergência';
        if (!allReceived) return 'Parcial';
        return 'Recebido';
    };

    const handleConfirmReceipt = async () => {
        try {
            setIsSaving(true);

            const receiptItems: CreateReceiptItemInput[] = rows.map(r => ({
                code: r.code,
                description: r.description,
                unit: r.unit,
                quantityOrdered: r.quantityOrdered,
                quantityReceived: r.quantityReceived,
                issue: r.issue,
            }));

            // Legacy discrepancy_report for display fallback on old order field
            const legacyDiscrepancies = rows
                .filter(r => r.issue || r.quantityReceived < r.quantityOrdered)
                .map(r => ({
                    code: r.code,
                    description: r.description,
                    issue: r.issue ?? 'faltando' as const,
                    quantity: r.quantityOrdered - r.quantityReceived,
                }));

            await orderService.confirmOrderReceipt(order.id, {
                status: computedStatus(),
                photo: receiptPhoto || undefined,
                notes: receiptNotes,
                receiptItems,
                discrepancies: legacyDiscrepancies.length > 0 ? legacyDiscrepancies : undefined,
                existingPhotoPath: order.receiptPhotoPath,
                existingReceivedAt: order.receivedAt,
                version: order.version,
            });
            onSave();
            onClose();
        } catch (error: any) {
            console.error("Erro ao confirmar recebimento:", error);
            if (error?.message?.startsWith('CONFLICT')) {
                alert("Pedido foi modificado por outro usuário. Feche e recarregue a página.");
            } else {
                alert("Erro ao confirmar recebimento: " + error.message);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const statusBadge = computedStatus();

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-4xl h-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200 border border-gray-200">
                {/* Header */}
                <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/30 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Checkout de Obra</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                Confirmação de Recebimento — {order.number}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                            statusBadge === 'Recebido' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            statusBadge === 'Parcial'  ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                         'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                            {statusBadge === 'Recebido' ? '✓ Tudo Recebido' :
                             statusBadge === 'Parcial'  ? '~ Recebimento Parcial' :
                                                          '⚠ Com Divergências'}
                        </div>
                        <button onClick={onClose} className="p-3 hover:bg-gray-200 rounded-2xl transition-all active:scale-95 group">
                            <X className="w-6 h-6 text-gray-400 group-hover:text-gray-600 transition-colors" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Items Table */}
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
                            <Package className="w-4 h-4 text-indigo-500" />
                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Itens do Pedido</h4>
                            <span className="ml-auto text-[10px] font-bold text-gray-400">
                                Informe a quantidade efetivamente recebida por item
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50/30">
                                    <tr>
                                        <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Item</th>
                                        <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Qtd Pedida</th>
                                        <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Qtd Recebida</th>
                                        <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Problema</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {rows.map((row, idx) => {
                                        const isShort = row.quantityReceived < row.quantityOrdered;
                                        return (
                                            <tr key={row.code} className={`transition-colors ${isShort ? 'bg-amber-50/40' : 'hover:bg-gray-50/40'}`}>
                                                <td className="px-5 py-4">
                                                    <p className="font-bold text-gray-900 text-sm">{row.description}</p>
                                                    <p className="font-mono text-[10px] text-gray-400 mt-0.5">{row.code} · {row.unit}</p>
                                                </td>
                                                <td className="px-5 py-4 text-right font-black text-gray-500">
                                                    {row.quantityOrdered} <span className="text-[10px] font-bold text-gray-400">{row.unit}</span>
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={row.quantityOrdered}
                                                        step="any"
                                                        value={row.quantityReceived}
                                                        onChange={e => {
                                                            const val = Math.max(0, parseFloat(e.target.value) || 0);
                                                            updateRow(idx, {
                                                                quantityReceived: val,
                                                                issue: val >= row.quantityOrdered ? undefined : (row.issue ?? 'faltando'),
                                                            });
                                                        }}
                                                        className={`w-24 text-right rounded-xl border p-2 text-sm font-bold outline-none focus:ring-2 transition-all ${
                                                            isShort
                                                                ? 'border-amber-300 bg-amber-50 text-amber-800 focus:ring-amber-300'
                                                                : 'border-emerald-200 bg-emerald-50 text-emerald-800 focus:ring-emerald-300'
                                                        }`}
                                                    />
                                                </td>
                                                <td className="px-5 py-4">
                                                    {isShort ? (
                                                        <select
                                                            value={row.issue ?? 'faltando'}
                                                            onChange={e => updateRow(idx, { issue: e.target.value as any })}
                                                            className="bg-white rounded-lg border border-amber-200 text-xs font-bold text-amber-800 p-2 outline-none focus:ring-2 focus:ring-amber-300"
                                                        >
                                                            <option value="faltando">Em falta / Menor Qtd</option>
                                                            <option value="quebrado">Quebrado / Avariado</option>
                                                        </select>
                                                    ) : (
                                                        <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                            OK
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {hasAnyShortfall && (
                            <div className="px-6 py-3 bg-amber-50 border-t border-amber-100 flex items-center gap-2 text-xs font-bold text-amber-700">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {rows.filter(r => r.quantityReceived < r.quantityOrdered).length} item(s) com quantidade inferior ao pedido
                            </div>
                        )}
                    </div>

                    {/* Photo Upload */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Foto do Comprovante / Carga</label>
                        <div className="relative group">
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={e => setReceiptPhoto(e.target.files?.[0] || null)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className={`p-6 border-2 border-dashed rounded-2xl flex items-center gap-4 transition-all ${receiptPhoto || order.receiptPhotoPath ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-200 bg-gray-50'}`}>
                                <Camera className={`w-8 h-8 shrink-0 ${receiptPhoto || order.receiptPhotoPath ? 'text-indigo-500' : 'text-gray-300'}`} />
                                <div>
                                    <p className={`font-bold text-sm ${receiptPhoto || order.receiptPhotoPath ? 'text-indigo-900' : 'text-gray-500'}`}>
                                        {receiptPhoto ? receiptPhoto.name :
                                            order.receiptPhotoPath ? 'Foto já enviada (clique para trocar)' :
                                                'Tirar foto ou selecionar arquivo'}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">Captura direta disponível em celulares</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Observações Adicionais</label>
                        <textarea
                            value={receiptNotes}
                            onChange={e => setReceiptNotes(e.target.value)}
                            placeholder="Ex: Mercadoria conferida pelo encarregado José..."
                            className="w-full p-5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all min-h-[100px] resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-50 bg-white flex gap-4 shrink-0">
                    <button
                        onClick={onClose}
                        className="flex-1 py-4 bg-gray-50 text-gray-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-all active:scale-95"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirmReceipt}
                        disabled={isSaving}
                        className={`flex-2 py-4 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-50 px-8 ${
                            statusBadge === 'Recebido' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' :
                            statusBadge === 'Parcial'  ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' :
                                                         'bg-amber-500 hover:bg-amber-600 shadow-amber-100'
                        }`}
                    >
                        {isSaving ? 'Processando...' :
                         statusBadge === 'Recebido' ? 'Confirmar Recebimento Total' :
                         statusBadge === 'Parcial'  ? 'Registrar Recebimento Parcial' :
                                                       'Registrar com Divergências'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OrderReceiptModal;
