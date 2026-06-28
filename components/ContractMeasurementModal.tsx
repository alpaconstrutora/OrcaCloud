import React from 'react';
import {
    X, BarChart3, Calendar, Save,
    AlertCircle, Info,
    Upload, Video, Loader2, FileText, Trash2, ExternalLink, TrendingUp
} from 'lucide-react';
import { storageService } from '../services/storageService';
import {
    Contract, ContractItem, ContractAddendum, ContractMeasurement,
    ContractMeasurementItem, MeasurementMode
} from '../types';
import { contractService } from '../services/contractService';
import { sanitizeFileName } from '../utils/storageUtils';

interface ContractMeasurementModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    items: ContractItem[];
    addendums?: ContractAddendum[];
    onSuccess: () => void;
    initialData?: ContractMeasurement;
    initialItems?: ContractMeasurementItem[];
}

const ContractMeasurementModal: React.FC<ContractMeasurementModalProps> = ({
    isOpen, onClose, contract, items, addendums = [], onSuccess, initialData, initialItems
}) => {
    const [loading, setLoading] = React.useState(false);
    const [periodStart, setPeriodStart] = React.useState(initialData?.period_start || '');
    const [periodEnd, setPeriodEnd] = React.useState(initialData?.period_end || '');
    const [measurementDate, setMeasurementDate] = React.useState(initialData?.measurement_date || new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = React.useState(initialData?.notes || '');
    const [measurementMode, setMeasurementMode] = React.useState<MeasurementMode>(
        initialData?.measurement_mode ?? 'QUANTITATIVO'
    );
    // Quantitativo: qty por item
    const [quantities, setQuantities] = React.useState<Record<string, number>>({});
    // Percentual/Híbrido: % por item neste período
    const [percentages, setPercentages] = React.useState<Record<string, number>>({});
    // Híbrido: modo escolhido por item
    const [itemModes, setItemModes] = React.useState<Record<string, 'QUANTITATIVO' | 'PERCENTUAL'>>({});
    const [attachments, setAttachments] = React.useState<Record<string, string[]>>({});
    const [uploadingItems, setUploadingItems] = React.useState<Record<string, boolean>>({});
    const [previousItems, setPreviousItems] = React.useState<Record<string, number>>({});
    const [invoiceUrl, setInvoiceUrl] = React.useState(initialData?.invoice_url || '');
    const [isUploadingInvoice, setIsUploadingInvoice] = React.useState(false);
    const [modalError, setModalError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        (async () => {
            try {
                const measurements = await contractService.listMeasurements(contract.id);
                if (cancelled) return;

                const allItems: ContractMeasurementItem[] = [];
                for (const m of measurements) {
                    const mItems = await contractService.getMeasurementItems(m.id);
                    if (cancelled) return;
                    allItems.push(...mItems);
                }
                // previousItems: qty acumulada excluindo medição em edição
                const totals: Record<string, number> = {};
                allItems.forEach(item => {
                    if (initialData && item.measurement_id === initialData.id) return;
                    totals[item.contract_item_id] = (totals[item.contract_item_id] || 0) + item.quantity_executed;
                });
                setPreviousItems(totals);
            } catch (error) {
                console.error("Erro ao carregar saldo anterior:", error);
            }
        })();

        setInvoiceUrl(initialData?.invoice_url || '');
        setMeasurementMode(initialData?.measurement_mode ?? 'QUANTITATIVO');

        if (initialItems) {
            const initialQtys: Record<string, number> = {};
            const initialPcts: Record<string, number> = {};
            const initialModes: Record<string, 'QUANTITATIVO' | 'PERCENTUAL'> = {};
            const initialAtts: Record<string, string[]> = {};
            initialItems.forEach(item => {
                initialQtys[item.contract_item_id] = item.quantity_executed;
                if (item.percent_executed != null) initialPcts[item.contract_item_id] = item.percent_executed;
                if (item.item_mode) initialModes[item.contract_item_id] = item.item_mode;
                if (item.attachment_urls) initialAtts[item.contract_item_id] = item.attachment_urls;
            });
            setQuantities(initialQtys);
            setPercentages(initialPcts);
            setItemModes(initialModes);
            setAttachments(initialAtts);
        } else {
            setQuantities({});
            setPercentages({});
            setItemModes({});
            setAttachments({});
        }

        return () => { cancelled = true; };
    }, [isOpen, contract.id, initialData, initialItems]);

    if (!isOpen) return null;

    // ── Helpers ────────────────────────────────────────────────────────────────

    // Retorna o modo efetivo de um item (leva em conta HIBRIDO)
    const effectiveItemMode = (itemId: string): 'QUANTITATIVO' | 'PERCENTUAL' => {
        if (measurementMode === 'QUANTITATIVO') return 'QUANTITATIVO';
        if (measurementMode === 'PERCENTUAL') return 'PERCENTUAL';
        // HIBRIDO: default QUANTITATIVO se não escolhido
        return itemModes[itemId] ?? 'QUANTITATIVO';
    };

    // Valor medido para um item neste período
    const itemValue = (item: ContractItem): number => {
        const mode = effectiveItemMode(item.id);
        if (mode === 'QUANTITATIVO') {
            return (quantities[item.id] || 0) * item.unit_price;
        }
        // PERCENTUAL: % do valor total do item neste período
        return ((percentages[item.id] || 0) / 100) * item.total_price;
    };

    // % já medida anteriormente para um item (0–100)
    const previousPercent = (item: ContractItem): number => {
        if (!item.total_price) return 0;
        const prevQty = previousItems[item.id] || 0;
        return Math.min(100, (prevQty * item.unit_price / item.total_price) * 100);
    };

    const totalValue = items.reduce((sum, item) => sum + itemValue(item), 0);

    const previousValueByItems = items.reduce((sum, item) => {
        return sum + (previousItems[item.id] || 0) * item.unit_price;
    }, 0);

    const saldoAFaturar = contract.current_value - previousValueByItems - totalValue;

    // ── Upload helpers ──────────────────────────────────────────────────────────

    const handleFileUpload = async (itemId: string, file: File) => {
        try {
            setUploadingItems(prev => ({ ...prev, [itemId]: true }));
            const sanitizedName = sanitizeFileName(file.name);
            const path = `measurements/${contract.id}/${Date.now()}_${sanitizedName}`;
            await storageService.uploadFile('documents', path, file);
            const publicUrl = storageService.getPublicUrl('documents', path);
            setAttachments(prev => ({ ...prev, [itemId]: [...(prev[itemId] || []), publicUrl] }));
        } catch (error: any) {
            setModalError(`Erro ao fazer upload do arquivo: ${error.message || 'Erro desconhecido'}`);
        } finally {
            setUploadingItems(prev => ({ ...prev, [itemId]: false }));
        }
    };

    const handleInvoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setIsUploadingInvoice(true);
            const sanitizedName = sanitizeFileName(file.name);
            const path = `invoices/${contract.id}/${Date.now()}_${sanitizedName}`;
            await storageService.uploadFile('documents', path, file);
            const publicUrl = storageService.getPublicUrl('documents', path);
            setInvoiceUrl(publicUrl);
        } catch (error: any) {
            setModalError(`Erro no upload da NF: ${error.message}`);
        } finally {
            setIsUploadingInvoice(false);
        }
    };

    // ── Save ───────────────────────────────────────────────────────────────────

    const handleSave = async () => {
        if (!periodStart || !periodEnd) {
            setModalError("Por favor, preencha o período da medição.");
            return;
        }
        setModalError(null);

        try {
            setLoading(true);

            const measurementData: Omit<ContractMeasurement, 'id' | 'created_at'> = {
                contract_id: contract.id,
                number: initialData?.number || (await contractService.listMeasurements(contract.id)).length + 1,
                period_start: periodStart,
                period_end: periodEnd,
                measurement_date: measurementDate,
                status: initialData?.status || 'Pendente',
                measurement_mode: measurementMode,
                total_value: totalValue,
                // retention_value e net_value são recalculados pelo service
                retention_value: initialData?.retention_value || 0,
                net_value: totalValue - (initialData?.retention_value || 0),
                notes,
                invoice_url: invoiceUrl,
            };

            // Constrói itens conforme o modo
            const measurementItems: Omit<ContractMeasurementItem, 'id' | 'measurement_id' | 'created_at'>[] = items
                .filter(item => {
                    const mode = effectiveItemMode(item.id);
                    if (mode === 'QUANTITATIVO') return (quantities[item.id] || 0) > 0 || (attachments[item.id]?.length || 0) > 0;
                    return (percentages[item.id] || 0) > 0 || (attachments[item.id]?.length || 0) > 0;
                })
                .map(item => {
                    const mode = effectiveItemMode(item.id);
                    const qty = mode === 'QUANTITATIVO' ? (quantities[item.id] || 0) : 0;
                    const pct = mode === 'PERCENTUAL' ? (percentages[item.id] || 0) : null;
                    const val = itemValue(item);
                    return {
                        contract_item_id: item.id,
                        quantity_executed: qty,
                        value_executed: val,
                        percent_executed: pct ?? undefined,
                        item_mode: mode,
                        attachment_urls: attachments[item.id] || [],
                    };
                });

            if (measurementItems.length === 0) {
                setModalError("Insira ao menos uma quantidade/percentual medido ou um anexo de evidência.");
                setLoading(false);
                return;
            }

            if (saldoAFaturar < -0.01) {
                setModalError(`O valor total da medição excede o saldo disponível do contrato em R$ ${Math.abs(saldoAFaturar).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`);
                setLoading(false);
                return;
            }

            if (initialData) {
                await contractService.updateMeasurement(initialData.id, measurementData, measurementItems);
            } else {
                await contractService.createMeasurement(measurementData, measurementItems);
            }
            onSuccess();
            onClose();
        } catch (error: any) {
            setModalError(`Erro ao salvar medição: ${error.message || 'Erro desconhecido'}`);
        } finally {
            setLoading(false);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    const MODE_LABELS: Record<MeasurementMode, string> = {
        QUANTITATIVO: 'Quantitativo',
        PERCENTUAL: 'Percentual',
        HIBRIDO: 'Híbrido',
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={onClose} />

            <div className="bg-white w-full max-w-6xl rounded-[48px] shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="bg-[#0B1727] p-8 md:p-12 text-white relative shrink-0">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full -mr-32 -mt-32 blur-3xl" />
                    <div className="flex justify-between items-start relative z-10">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
                                    <BarChart3 className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-blue-400 uppercase tracking-[0.2em]">{initialData ? 'Edição de Medição' : 'Medição de Contrato'}</p>
                                    <h2 className="text-3xl font-medium tracking-tight uppercase leading-none">{initialData ? `Medição #${initialData.number}` : contract.title}</h2>
                                </div>
                            </div>
                            <p className="text-gray-400 font-medium text-sm max-w-xl">
                                Lançamento de execução física e conferência de saldo para liberação financeira.
                            </p>
                        </div>
                        <button onClick={onClose} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-gray-400 hover:text-white border border-white/10">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Datas + modo de medição */}
                    <div className="grid grid-cols-6 gap-4 mt-10 relative z-10 bg-white/5 p-5 rounded-3xl border border-white/10">
                        <div className="space-y-2 text-left">
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Calendar className="w-3 h-3" /> Início
                            </p>
                            <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                                className="w-full bg-transparent text-white font-medium text-sm outline-none border-b border-white/10 focus:border-blue-500 transition-colors p-1" />
                        </div>
                        <div className="space-y-2 text-left">
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Calendar className="w-3 h-3" /> Fim
                            </p>
                            <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                                className="w-full bg-transparent text-white font-medium text-sm outline-none border-b border-white/10 focus:border-blue-500 transition-colors p-1" />
                        </div>
                        <div className="space-y-2 text-left">
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Calendar className="w-3 h-3" /> Data Medição
                            </p>
                            <input type="date" value={measurementDate} onChange={e => setMeasurementDate(e.target.value)}
                                className="w-full bg-transparent text-white font-medium text-sm outline-none border-b border-white/10 focus:border-blue-500 transition-colors p-1" />
                        </div>
                        {/* Modo de medição */}
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Tipo de Medição</p>
                            <div className="flex gap-1">
                                {(['QUANTITATIVO', 'PERCENTUAL', 'HIBRIDO'] as MeasurementMode[]).map(m => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setMeasurementMode(m)}
                                        className={`flex-1 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                                            measurementMode === m
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white/10 text-gray-400 hover:bg-white/20'
                                        }`}
                                    >
                                        {MODE_LABELS[m].split(' ')[0]}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="text-right flex flex-col justify-center border-l border-white/10 pl-4">
                            <p className="text-xs font-medium text-emerald-400 uppercase tracking-widest mb-1">Saldo a Faturar</p>
                            <p className={`text-2xl font-medium tracking-tighter ${saldoAFaturar < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                R$ {saldoAFaturar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="text-right flex flex-col justify-center border-l border-white/10 pl-4">
                            <p className="text-xs font-medium text-blue-400 uppercase tracking-widest mb-1">Total do Período</p>
                            <p className="text-3xl font-medium tracking-tighter">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>

                    {/* NF Upload */}
                    <div className="mt-5 flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${invoiceUrl ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-white/10'}`}>
                                <FileText className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Nota Fiscal do Período (NF)</p>
                                <p className="text-sm font-medium text-white">
                                    {invoiceUrl ? 'Documento Vinculado com Sucesso' : 'Nenhuma nota fiscal anexada'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <input type="file" id="invoice-upload" className="hidden" accept=".pdf,.doc,.docx,image/*" onChange={handleInvoiceUpload} />
                            {isUploadingInvoice ? (
                                <div className="flex items-center gap-2 px-6 py-3 bg-white/5 text-gray-400 rounded-xl text-xs font-medium uppercase tracking-widest animate-pulse">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Subindo...
                                </div>
                            ) : invoiceUrl ? (
                                <>
                                    <a href={invoiceUrl} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-medium uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20">
                                        <ExternalLink className="w-4 h-4" /> Ver Arquivo
                                    </a>
                                    <button onClick={() => setInvoiceUrl('')}
                                        className="p-3 bg-white/5 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all border border-white/10">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </>
                            ) : (
                                <button onClick={() => document.getElementById('invoice-upload')?.click()}
                                    className="flex items-center gap-2 px-8 py-3 bg-white text-gray-900 rounded-xl text-button font-medium uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-xl shadow-gray-200">
                                    <Upload className="w-4 h-4" /> Anexar Nota Fiscal
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Aditivos Aprovados */}
                {addendums.length > 0 && (
                    <div className="mx-8 mb-2 mt-4 bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
                            <TrendingUp className="w-4 h-4 text-amber-400" />
                            <p className="text-xs font-medium text-amber-400 uppercase tracking-widest">
                                {addendums.length} Aditivo{addendums.length > 1 ? 's' : ''} Aprovado{addendums.length > 1 ? 's' : ''} — Valor atual inclui estes aditivos
                            </p>
                        </div>
                        <div className="divide-y divide-white/5">
                            {addendums.map(a => (
                                <div key={a.id} className="flex items-center justify-between px-5 py-3 text-xs">
                                    <div className="flex items-center gap-3">
                                        <span className="font-medium text-gray-300">{a.number}</span>
                                        <span className="text-gray-500">{a.description}</span>
                                        {a.new_end_date && (
                                            <span className="text-blue-400 flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                Novo término: {new Date(a.new_end_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                            </span>
                                        )}
                                    </div>
                                    {a.value_impact !== 0 && (
                                        <span className={`font-medium ${a.value_impact > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {a.value_impact > 0 ? '+' : ''}R$ {a.value_impact.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tabela de itens */}
                <div className="flex-1 overflow-y-auto p-12 bg-white">
                    <div className="bg-gray-50 rounded-[32px] border border-gray-100 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-[#f8fafc] border-b border-gray-100">
                                <tr>
                                    <th className="px-8 py-5 text-table-header font-medium text-gray-400 uppercase tracking-widest">Item / Descrição</th>
                                    <th className="px-6 py-5 text-table-header font-medium text-gray-400 uppercase tracking-widest">Unid.</th>
                                    <th className="px-6 py-5 text-table-header font-medium text-gray-400 uppercase tracking-widest text-right">Qtd. Contrato</th>
                                    <th className="px-6 py-5 text-table-header font-medium text-gray-400 uppercase tracking-widest text-right">
                                        {measurementMode === 'QUANTITATIVO' ? 'Saldo Ant.' : '% Ant.'}
                                    </th>
                                    <th className="px-6 py-5 text-table-header font-medium text-gray-400 uppercase tracking-widest text-right">
                                        {measurementMode === 'QUANTITATIVO' ? 'Qtd. Medida' : measurementMode === 'PERCENTUAL' ? '% Período' : 'Medição'}
                                    </th>
                                    <th className="px-6 py-5 text-table-header font-medium text-gray-400 uppercase tracking-widest">Anexo / Foto</th>
                                    <th className="px-8 py-5 text-table-header font-medium text-gray-400 uppercase tracking-widest text-right">Valor Período</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-700">
                                {items.map((item) => {
                                    const mode = effectiveItemMode(item.id);
                                    const prevQty = previousItems[item.id] || 0;
                                    const prevPct = previousPercent(item);
                                    const currentQty = quantities[item.id] || 0;
                                    const currentPct = percentages[item.id] || 0;
                                    const remainingQty = item.quantity - prevQty;
                                    const remainingPct = Math.max(0, 100 - prevPct);
                                    const isQtyExceeded = mode === 'QUANTITATIVO' && currentQty > remainingQty;
                                    const isPctExceeded = mode === 'PERCENTUAL' && currentPct > remainingPct;
                                    const isExceeded = isQtyExceeded || isPctExceeded;

                                    return (
                                        <tr key={item.id} className="hover:bg-blue-50/20 transition-all group">
                                            <td className="px-8 py-5">
                                                <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{item.description}</p>
                                                <p className="text-xs text-gray-400 font-medium">ID: {item.id.slice(0, 8)}</p>
                                            </td>
                                            <td className="px-6 py-5 font-medium text-table-body uppercase text-gray-400">{item.unit}</td>
                                            <td className="px-6 py-5 text-right font-medium text-sm text-gray-700">{item.quantity.toLocaleString('pt-BR')}</td>

                                            {/* Saldo anterior — qty ou % conforme modo */}
                                            <td className="px-6 py-5 text-right font-medium text-sm text-gray-400">
                                                {mode === 'QUANTITATIVO'
                                                    ? prevQty.toLocaleString('pt-BR')
                                                    : `${prevPct.toFixed(1)}%`
                                                }
                                            </td>

                                            {/* Input de medição */}
                                            <td className="px-6 py-5 text-right">
                                                {/* Híbrido: toggle por item */}
                                                {measurementMode === 'HIBRIDO' && (
                                                    <div className="flex gap-1 justify-end mb-1">
                                                        {(['QUANTITATIVO', 'PERCENTUAL'] as const).map(m => (
                                                            <button
                                                                key={m}
                                                                type="button"
                                                                onClick={() => setItemModes(prev => ({ ...prev, [item.id]: m }))}
                                                                className={`px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider transition-all ${
                                                                    (itemModes[item.id] ?? 'QUANTITATIVO') === m
                                                                        ? 'bg-blue-600 text-white'
                                                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                                }`}
                                                            >
                                                                {m === 'QUANTITATIVO' ? 'Qtd' : '%'}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="relative inline-block">
                                                    {mode === 'QUANTITATIVO' ? (
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={quantities[item.id] || ''}
                                                                onChange={e => setQuantities(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                                                                placeholder="0,00"
                                                                className={`w-24 bg-white border ${isExceeded ? 'border-red-300 bg-red-50 text-red-600' : 'border-gray-200 focus:border-blue-500'} rounded-xl px-3 py-2 text-right font-medium text-sm outline-none transition-all`}
                                                            />
                                                            {isExceeded && (
                                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-medium px-2 py-1 rounded-lg whitespace-nowrap shadow-lg z-10">
                                                                    Acima do Saldo
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                step="0.1"
                                                                min="0"
                                                                max="100"
                                                                value={percentages[item.id] || ''}
                                                                onChange={e => setPercentages(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                                                                placeholder="0,0"
                                                                className={`w-20 bg-white border ${isExceeded ? 'border-red-300 bg-red-50 text-red-600' : 'border-gray-200 focus:border-blue-500'} rounded-xl pl-3 pr-6 py-2 text-right font-medium text-sm outline-none transition-all`}
                                                            />
                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">%</span>
                                                            {isExceeded && (
                                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-medium px-2 py-1 rounded-lg whitespace-nowrap shadow-lg z-10">
                                                                    Acima de {remainingPct.toFixed(1)}%
                                                                </div>
                                                            )}
                                                            {/* Saldo % disponível */}
                                                            {remainingPct < 100 && (
                                                                <p className="text-xs text-gray-400 mt-0.5 text-right">
                                                                    Disp: {remainingPct.toFixed(1)}%
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Anexos */}
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="file"
                                                        id={`file-${item.id}`}
                                                        className="hidden"
                                                        accept="image/*,video/*"
                                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(item.id, f); }}
                                                    />
                                                    {uploadingItems[item.id] ? (
                                                        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-400 rounded-xl text-xs font-medium uppercase tracking-widest border border-gray-100">
                                                            <Loader2 className="w-3 h-3 animate-spin" /> Subindo...
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-2 items-center">
                                                            {(attachments[item.id] || []).map((url, idx) => (
                                                                <div key={idx} className="relative group/thumb">
                                                                    <div
                                                                        className="w-10 h-10 rounded-lg border border-gray-100 overflow-hidden cursor-pointer hover:border-blue-500 transition-all shadow-sm"
                                                                        onClick={() => window.open(url, '_blank')}
                                                                    >
                                                                        {url.match(/\.(mp4|webm|ogg)$/i) ? (
                                                                            <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                                                                                <Video className="w-4 h-4 text-white" />
                                                                            </div>
                                                                        ) : (
                                                                            <img src={url} className="w-full h-full object-cover" alt="Anexo" />
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setAttachments(prev => {
                                                                            const n = { ...prev };
                                                                            n[item.id] = n[item.id].filter((_, i) => i !== idx);
                                                                            return n;
                                                                        })}
                                                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity shadow-lg"
                                                                    >
                                                                        <X className="w-2 h-2" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            <button
                                                                onClick={() => document.getElementById(`file-${item.id}`)?.click()}
                                                                className="flex items-center gap-2 px-3 py-2 bg-white text-blue-600 rounded-xl text-button font-medium uppercase tracking-widest border border-blue-100 hover:bg-blue-50 transition-all shadow-sm"
                                                            >
                                                                <Upload className="w-3 h-3" />
                                                                {attachments[item.id]?.length > 0 ? 'Add' : 'Anexar'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-8 py-5 text-right font-medium text-sm text-gray-900">
                                                R$ {itemValue(item).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-12 bg-gray-50 border-t border-gray-100 shrink-0">
                    <div className="flex justify-between items-center bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                                    <Info className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Observações</p>
                                    <input
                                        type="text"
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        placeholder="Ex: Medição parcial conforme cronograma..."
                                        className="bg-transparent text-sm font-medium text-gray-700 outline-none w-80 placeholder:text-gray-300"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {modalError && (
                                <div className="flex items-center gap-3 px-5 py-3 bg-red-50 border border-red-100 rounded-2xl text-red-600 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <p className="text-xs font-medium">{modalError}</p>
                                </div>
                            )}
                            <button
                                onClick={onClose}
                                className="px-8 py-4 bg-white border border-gray-200 rounded-2xl text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all font-medium text-button uppercase tracking-widest"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="flex items-center gap-2 px-10 py-4 bg-gray-900 text-white rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-gray-200 font-medium text-button uppercase tracking-widest disabled:opacity-50 group active:scale-95"
                            >
                                {loading ? (
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                )}
                                {initialData ? 'Confirmar Alterações' : 'Finalizar Medição'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContractMeasurementModal;
