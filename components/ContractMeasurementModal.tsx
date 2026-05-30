import React from 'react';
import {
    X, BarChart3, Calendar, Save,
    AlertCircle, Info,
    Upload, Video, Loader2, FileText, Trash2, ExternalLink, TrendingUp
} from 'lucide-react';
import { storageService } from '../services/storageService';
import {
    Contract, ContractItem, ContractAddendum, ContractMeasurement,
    ContractMeasurementItem
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
    const [quantities, setQuantities] = React.useState<Record<string, number>>({});
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
        if (initialItems) {
            const initialQtys: Record<string, number> = {};
            const initialAtts: Record<string, string[]> = {};
            initialItems.forEach(item => {
                initialQtys[item.contract_item_id] = item.quantity_executed;
                if (item.attachment_urls) initialAtts[item.contract_item_id] = item.attachment_urls;
            });
            setQuantities(initialQtys);
            setAttachments(initialAtts);
        } else {
            setQuantities({});
            setAttachments({});
        }

        return () => { cancelled = true; };
    }, [isOpen, contract.id, initialData, initialItems]);

    if (!isOpen) return null;

    const handleQtyChange = (itemId: string, val: string) => {
        const num = parseFloat(val) || 0;
        setQuantities(prev => ({ ...prev, [itemId]: num }));
    };

    const totalValue = items.reduce((sum, item) => {
        const qty = quantities[item.id] || 0;
        return sum + (qty * item.unit_price);
    }, 0);

    // Use item-based previous value (qty × unit_price) to stay consistent with the
    // "Saldo Ant." column in the table, avoiding drift from stored measurement totals.
    const previousValueByItems = items.reduce((sum, item) => {
        return sum + (previousItems[item.id] || 0) * item.unit_price;
    }, 0);

    const saldoAFaturar = contract.current_value - previousValueByItems - totalValue;

    const handleFileUpload = async (itemId: string, file: File) => {
        try {
            setUploadingItems(prev => ({ ...prev, [itemId]: true }));

            const sanitizedName = sanitizeFileName(file.name);
            const fileName = `${contract.id}/${Date.now()}_${sanitizedName}`;
            const path = `measurements/${fileName}`;

            console.log(`[UPLOAD] Starting upload for item ${itemId}: ${path}`);

            const uploadResult = await storageService.uploadFile('documents', path, file);
            console.log(`[UPLOAD] Success:`, uploadResult);

            const publicUrl = storageService.getPublicUrl('documents', path);

            setAttachments(prev => ({
                ...prev,
                [itemId]: [...(prev[itemId] || []), publicUrl]
            }));
        } catch (error: any) {
            console.error("Erro ao fazer upload:", error);
            const errorMsg = error.message || error.error_description || "Erro desconhecido";
            setModalError(`Erro ao fazer upload do arquivo: ${errorMsg}`);
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
            console.error("Erro no upload da NF:", error);
            setModalError(`Erro no upload da NF: ${error.message}`);
        } finally {
            setIsUploadingInvoice(false);
        }
    };

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
                total_value: totalValue,
                retention_value: initialData?.retention_value || 0,
                net_value: totalValue - (initialData?.retention_value || 0),
                notes: notes,
                invoice_url: invoiceUrl
            };

            const measurementItems: Omit<ContractMeasurementItem, 'id' | 'measurement_id' | 'created_at'>[] = items
                .filter(item => (quantities[item.id] || 0) > 0 || (attachments[item.id] && attachments[item.id].length > 0))
                .map(item => ({
                    contract_item_id: item.id,
                    quantity_executed: quantities[item.id] || 0,
                    value_executed: (quantities[item.id] || 0) * item.unit_price,
                    attachment_urls: attachments[item.id] || []
                }));

            if (measurementItems.length === 0) {
                setModalError("Insira ao menos uma quantidade medida ou um anexo de evidência.");
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
            console.error("Erro ao salvar medição:", error);
            const errorMsg = error.message || error.error_description || "Erro desconhecido";
            setModalError(`Erro ao salvar medição: ${errorMsg}`);
        } finally {
            setLoading(false);
        }
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
                                    <p className="text-[12px] font-medium text-blue-400 uppercase tracking-[0.2em]">{initialData ? 'Edição de Medição' : 'Medição de Contrato'}</p>
                                    <h2 className="text-3xl font-medium tracking-tight uppercase leading-none">{initialData ? `Medição #${initialData.number}` : contract.title}</h2>
                                </div>
                            </div>
                            <p className="text-gray-400 font-medium text-sm max-w-xl">
                                Lancamento de execução física e conferência de saldo para liberação financeira.
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-gray-400 hover:text-white border border-white/10"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-5 gap-6 mt-12 relative z-10 bg-white/5 p-6 rounded-3xl border border-white/10">
                        <div className="space-y-2 text-left">
                            <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Calendar className="w-3 h-3" /> Início Período
                            </p>
                            <input
                                type="date"
                                value={periodStart}
                                onChange={e => setPeriodStart(e.target.value)}
                                className="w-full bg-transparent text-white font-medium text-sm outline-none border-b border-white/10 focus:border-blue-500 transition-colors p-1"
                            />
                        </div>
                        <div className="space-y-2 text-left">
                            <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Calendar className="w-3 h-3" /> Fim Período
                            </p>
                            <input
                                type="date"
                                value={periodEnd}
                                onChange={e => setPeriodEnd(e.target.value)}
                                className="w-full bg-transparent text-white font-medium text-sm outline-none border-b border-white/10 focus:border-blue-500 transition-colors p-1"
                            />
                        </div>
                        <div className="space-y-2 text-left">
                            <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Calendar className="w-3 h-3" /> Data Medição
                            </p>
                            <input
                                type="date"
                                value={measurementDate}
                                onChange={e => setMeasurementDate(e.target.value)}
                                className="w-full bg-transparent text-white font-medium text-sm outline-none border-b border-white/10 focus:border-blue-500 transition-colors p-1"
                            />
                        </div>
                        <div className="text-right flex flex-col justify-center border-l border-white/10 pl-6">
                            <p className="text-[12px] font-medium text-emerald-400 uppercase tracking-widest mb-1">Saldo a Faturar</p>
                            <p className={`text-2xl font-medium tracking-tighter ${saldoAFaturar < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                R$ {saldoAFaturar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">após este período</p>
                        </div>
                        <div className="text-right flex flex-col justify-center border-l border-white/10 pl-6">
                            <p className="text-[12px] font-medium text-blue-400 uppercase tracking-widest mb-1">Total do Período</p>
                            <p className="text-3xl font-medium tracking-tighter">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>

                    {/* NF Upload Area */}
                    <div className="mt-6 flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10 animate-in fade-in duration-500">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${invoiceUrl ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-white/10'}`}>
                                <FileText className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Nota Fiscal do Período (NF)</p>
                                <p className="text-sm font-medium text-white">
                                    {invoiceUrl ? 'Documento Vinculado com Sucesso' : 'Nenhuma nota fiscal anexada'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <input
                                type="file"
                                id="invoice-upload"
                                className="hidden"
                                accept=".pdf,.doc,.docx,image/*"
                                onChange={handleInvoiceUpload}
                            />
                            {isUploadingInvoice ? (
                                <div className="flex items-center gap-2 px-6 py-3 bg-white/5 text-gray-400 rounded-xl text-[12px] font-medium uppercase tracking-widest animate-pulse">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Subindo...
                                </div>
                            ) : invoiceUrl ? (
                                <>
                                    <a
                                        href={invoiceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-[12px] font-medium uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20"
                                    >
                                        <ExternalLink className="w-4 h-4" /> Ver Arquivo
                                    </a>
                                    <button
                                        onClick={() => setInvoiceUrl('')}
                                        className="p-3 bg-white/5 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all border border-white/10"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => document.getElementById('invoice-upload')?.click()}
                                    className="flex items-center gap-2 px-8 py-3 bg-white text-gray-900 rounded-xl text-[12px] font-medium uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-xl shadow-gray-200"
                                >
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
                            <p className="text-[12px] font-medium text-amber-400 uppercase tracking-widest">
                                {addendums.length} Aditivo{addendums.length > 1 ? 's' : ''} Aprovado{addendums.length > 1 ? 's' : ''} — Valor atual inclui estes aditivos
                            </p>
                        </div>
                        <div className="divide-y divide-white/5">
                            {addendums.map(a => (
                                <div key={a.id} className="flex items-center justify-between px-5 py-3 text-[12px]">
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

                {/* Body Table */}
                <div className="flex-1 overflow-y-auto p-12 bg-white">
                    <div className="bg-gray-50 rounded-[32px] border border-gray-100 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-[#f8fafc] border-b border-gray-100">
                                <tr>
                                    <th className="px-8 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Item / Descrição</th>
                                    <th className="px-6 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Unid.</th>
                                    <th className="px-6 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-right">Qtd. Contrato</th>
                                    <th className="px-6 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-right">Saldo Ant.</th>
                                    <th className="px-6 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-right">Qtd. Medida</th>
                                    <th className="px-6 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest">Anexo / Foto (URL)</th>
                                    <th className="px-8 py-5 text-[12px] font-medium text-gray-400 uppercase tracking-widest text-right">Valor Período</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-700">
                                {items.map((item) => {
                                    const prevQty = previousItems[item.id] || 0;
                                    const currentQty = quantities[item.id] || 0;
                                    const remainingQty = item.quantity - prevQty;
                                    const isExceeded = currentQty > remainingQty;

                                    return (
                                        <tr key={item.id} className="hover:bg-blue-50/20 transition-all group">
                                            <td className="px-8 py-6">
                                                <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{item.description}</p>
                                                <p className="text-[12px] text-gray-400 font-medium">ID: {item.id.slice(0, 8)}</p>
                                            </td>
                                            <td className="px-6 py-6 font-medium text-xs uppercase text-gray-400">{item.unit}</td>
                                            <td className="px-6 py-6 text-right font-medium text-sm text-gray-700">{item.quantity.toLocaleString('pt-BR')}</td>
                                            <td className="px-6 py-6 text-right font-medium text-sm text-gray-400">{prevQty.toLocaleString('pt-BR')}</td>
                                            <td className="px-6 py-6 text-right">
                                                <div className="relative inline-block w-24">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={quantities[item.id] || ''}
                                                        onChange={e => handleQtyChange(item.id, e.target.value)}
                                                        placeholder="0,00"
                                                        className={`w-full bg-white border ${isExceeded ? 'border-red-300 bg-red-50 text-red-600' : 'border-gray-200 focus:border-blue-500'} rounded-xl px-3 py-2 text-right font-medium text-sm outline-none transition-all`}
                                                    />
                                                    {isExceeded && (
                                                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[12px] font-medium px-2 py-1 rounded-lg whitespace-nowrap shadow-lg">
                                                            Acima do Saldo
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-6">
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="file"
                                                        id={`file-${item.id}`}
                                                        className="hidden"
                                                        accept="image/*,video/*"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) handleFileUpload(item.id, file);
                                                        }}
                                                    />

                                                    {uploadingItems[item.id] ? (
                                                        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-400 rounded-xl text-[12px] font-medium uppercase tracking-widest border border-gray-100">
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
                                                                className="flex items-center gap-2 px-3 py-2 bg-white text-blue-600 rounded-xl text-[12px] font-medium uppercase tracking-widest border border-blue-100 hover:bg-blue-50 transition-all shadow-sm"
                                                                title="Adicionar Novo Anexo"
                                                            >
                                                                <Upload className="w-3 h-3" />
                                                                {attachments[item.id]?.length > 0 ? 'Add' : 'Anexar'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-right font-medium text-sm text-gray-900">
                                                R$ {(currentQty * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                                    <p className="text-[12px] font-medium text-gray-400 uppercase tracking-widest">Observações</p>
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
                                    <p className="text-[12px] font-medium">{modalError}</p>
                                </div>
                            )}
                            <button
                                onClick={onClose}
                                className="px-8 py-4 bg-white border border-gray-200 rounded-2xl text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all font-medium text-[12px] uppercase tracking-widest"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="flex items-center gap-2 px-10 py-4 bg-gray-900 text-white rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-gray-200 font-medium text-[12px] uppercase tracking-widest disabled:opacity-50 group active:scale-95"
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
