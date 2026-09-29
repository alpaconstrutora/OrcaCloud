import React from 'react';
import {
    X, BarChart3, Calendar, Save,
    AlertCircle, Info,
    Upload, Video, Loader2, FileText, Trash2, ExternalLink, TrendingUp,
    Wallet, ClipboardList
} from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';
import { storageService } from '../services/storageService';
import {
    Contract, ContractItem, ContractAddendum, ContractMeasurement,
    ContractMeasurementItem, MeasurementMode
} from '../types';
import { contractService } from '../services/contractService';
import { sanitizeFileName } from '../utils/storageUtils';
import { formatMoney, formatDateBR } from './ui/Format';

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
    const [measurementDate, setMeasurementDate] = React.useState(initialData?.measurement_date || new Date().toLocaleDateString('sv-SE'));
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

    // Proteção contra perda (UI_PATTERNS §4.1): qualquer alteração no painel faz o
    // fechamento — Esc, clique fora, X ou Cancelar — perguntar antes de descartar.
    const confirm = useConfirm();
    const [alterado, setAlterado] = React.useState(false);
    const marcarAlterado = React.useCallback(() => setAlterado(true), []);
    const fechar = React.useCallback(async () => {
        if (alterado) {
            const ok = await confirm({
                title: 'Sair sem salvar?',
                message: 'Há alterações não salvas nesta medição. Se sair agora, elas serão perdidas.',
                variant: 'warning',
                confirmLabel: 'Sair e descartar',
                cancelLabel: 'Continuar editando',
            });
            if (!ok) return;
        }
        onClose();
    }, [alterado, confirm, onClose]);

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
        setAlterado(false);

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
                setModalError(`O valor total da medição excede o saldo disponível do contrato em ${formatMoney(Math.abs(saldoAFaturar))}.`);
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

    const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

    // §21/§30 — rótulo e campo do formulário (mesma régua do ContractModal).
    const rotulo = 'block text-xs font-semibold text-slate-500';
    const campo = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all hover:border-blue-200';
    const tituloSecao = (Icone: React.ElementType, texto: string) => (
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Icone className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">{texto}</h3>
        </div>
    );
    // Segmentado com a altura de um campo (mesmo desenho de "Condição de Pagamento").
    const segmento = (ativo: boolean) =>
        `flex-1 px-4 rounded-[4px] text-[13px] font-medium whitespace-nowrap transition-all ${ativo ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:text-gray-900'}`;

    return (
        // Painel lateral (UI_PATTERNS.md §3: criar/editar registro = Sheet), escolhido
        // pelo usuário em 2026-09-29 no lugar do modal central escuro. `4xl` (896px):
        // a tabela de itens tem 7 colunas e em 672px a descrição virava coluna de
        // uma palavra — largura aprovada expressamente junto com o formato.
        <Sheet open={isOpen} onClose={onClose} size="4xl" dirty={alterado}>
            <SheetHeader onClose={fechar}>
                <SheetTitle>{initialData ? `Editar medição nº ${initialData.number}` : 'Nova medição'}</SheetTitle>
                <SheetDescription>
                    {contract.number ? `${contract.number} · ` : ''}{contract.title}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6">
                {/* Qualquer digitação no painel marca "alterado" — é o que faz fechar perguntar antes de descartar. */}
                <div className="space-y-8" onChangeCapture={marcarAlterado}>
                    <div className="grid grid-cols-2 gap-4">
                        <KpiCard label="TOTAL DO PERÍODO" value={formatMoney(totalValue)} icon={<BarChart3 className="w-5 h-5" />} color="blue" />
                        <KpiCard
                            label="SALDO A FATURAR"
                            value={formatMoney(saldoAFaturar)}
                            sub={saldoAFaturar < 0 ? 'Acima do valor atual do contrato' : 'Depois desta medição'}
                            icon={<Wallet className="w-5 h-5" />}
                            color={saldoAFaturar < 0 ? 'red' : 'emerald'}
                        />
                    </div>

                    {/* Período e tipo */}
                    <div className="space-y-4">
                        {tituloSecao(Calendar, 'Período da medição')}
                        <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={rotulo}>Início</label>
                                <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className={campo} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={rotulo}>Fim</label>
                                <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className={campo} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={rotulo}>Data da medição</label>
                                <input type="date" value={measurementDate} onChange={e => setMeasurementDate(e.target.value)} className={campo} />
                            </div>
                            {/* Linha própria, na largura do conteúdo: em 1/4 da linha o
                                "Híbrido" saía para fora do painel. */}
                            <div className="col-span-3 space-y-1.5">
                                <label className={rotulo}>Tipo de medição</label>
                                <div className="inline-flex h-9 bg-gray-50 rounded-[6px] p-0.5 border border-gray-100">
                                    {(['QUANTITATIVO', 'PERCENTUAL', 'HIBRIDO'] as MeasurementMode[]).map(m => (
                                        <button key={m} type="button" onClick={() => { setMeasurementMode(m); marcarAlterado(); }} className={segmento(measurementMode === m)}>
                                            {MODE_LABELS[m]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Nota fiscal */}
                    <div className="space-y-4">
                        {tituloSecao(FileText, 'Nota fiscal do período')}
                        <div className="flex items-center justify-between gap-4">
                            <p className={`text-sm ${invoiceUrl ? 'text-emerald-700 font-medium' : 'text-gray-500'}`}>
                                {invoiceUrl ? 'Nota fiscal anexada.' : 'Nenhuma nota fiscal anexada.'}
                            </p>
                            <input type="file" id="invoice-upload" className="hidden" accept=".pdf,.doc,.docx,image/*" onChange={e => { marcarAlterado(); handleInvoiceUpload(e); }} />
                            {isUploadingInvoice ? (
                                <span className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500">
                                    <Loader2 className="w-[15px] h-[15px] animate-spin" /> Enviando...
                                </span>
                            ) : invoiceUrl ? (
                                <div className="flex items-center gap-2">
                                    <a href={invoiceUrl} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 transition-all font-medium text-[13px]">
                                        <ExternalLink className="w-[15px] h-[15px]" /> Ver arquivo
                                    </a>
                                    <button type="button" onClick={() => { setInvoiceUrl(''); marcarAlterado(); }}
                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-red-600 rounded-[6px] hover:bg-red-50 transition-all font-medium text-[13px]">
                                        <Trash2 className="w-[15px] h-[15px]" /> Remover
                                    </button>
                                </div>
                            ) : (
                                <button type="button" onClick={() => document.getElementById('invoice-upload')?.click()}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 transition-all font-medium text-[13px] shrink-0">
                                    <Upload className="w-[15px] h-[15px]" /> Anexar nota fiscal
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Aditivos aprovados — contexto do valor atual do contrato */}
                    {addendums.length > 0 && (
                        <div className="space-y-4">
                            {tituloSecao(TrendingUp, `Aditivos aprovados (${addendums.length})`)}
                            <p className="text-xs text-gray-500">O valor atual do contrato — e portanto o saldo a faturar — já inclui estes aditivos.</p>
                            <div className="rounded-[10px] border border-gray-100 divide-y divide-gray-100">
                                {addendums.map(a => (
                                    <div key={a.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                                        <div className="min-w-0">
                                            <span className="font-medium text-gray-900">{a.number}</span>
                                            <span className="text-gray-600"> — {a.description}</span>
                                            {a.new_end_date && (
                                                <span className="text-gray-500"> · novo término em {formatDateBR(a.new_end_date)}</span>
                                            )}
                                        </div>
                                        {a.value_impact !== 0 && (
                                            <span className={`shrink-0 font-medium ${a.value_impact > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                {a.value_impact > 0 ? '+' : ''}{formatMoney(a.value_impact)}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Itens medidos — §6.9: tabela em painel lateral, px-3/px-4 */}
                    <div className="space-y-4">
                        {tituloSecao(ClipboardList, 'Itens medidos')}
                        {items.length === 0 ? (
                            <div className="rounded-[10px] border border-dashed border-gray-200 py-10 text-center">
                                <ClipboardList className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                                <p className="text-sm font-medium text-gray-900">Este contrato não tem itens para medir</p>
                                <p className="text-sm text-gray-500 mt-1">Cadastre os itens na aba "Itens do Contrato" e volte para lançar a medição.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                                <table className="w-full text-left border-collapse">
                                    <colgroup>
                                        <col />
                                        <col style={{ width: 56 }} />
                                        <col style={{ width: 88 }} />
                                        <col style={{ width: 88 }} />
                                        <col style={{ width: 112 }} />
                                        <col style={{ width: 104 }} />
                                        <col style={{ width: 112 }} />
                                    </colgroup>
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            <th className="px-4 py-2 border-r border-gray-100">Item</th>
                                            <th className="px-3 py-2 border-r border-gray-100">Unid.</th>
                                            <th className="px-3 py-2 border-r border-gray-100 text-right">Qtd. contrato</th>
                                            <th className="px-3 py-2 border-r border-gray-100 text-right">
                                                {measurementMode === 'QUANTITATIVO' ? 'Medido antes' : '% antes'}
                                            </th>
                                            <th className="px-3 py-2 border-r border-gray-100 text-right">
                                                {measurementMode === 'QUANTITATIVO' ? 'Qtd. medida' : measurementMode === 'PERCENTUAL' ? '% no período' : 'Medição'}
                                            </th>
                                            <th className="px-3 py-2 border-r border-gray-100">Evidências</th>
                                            <th className="px-3 py-2 text-right">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {items.map((item) => {
                                            const mode = effectiveItemMode(item.id);
                                            const prevQty = previousItems[item.id] || 0;
                                            const prevPct = previousPercent(item);
                                            const currentQty = quantities[item.id] || 0;
                                            const currentPct = percentages[item.id] || 0;
                                            const remainingQty = item.quantity - prevQty;
                                            const remainingPct = Math.max(0, 100 - prevPct);
                                            const isExceeded = (mode === 'QUANTITATIVO' && currentQty > remainingQty)
                                                || (mode === 'PERCENTUAL' && currentPct > remainingPct);

                                            return (
                                                <tr key={item.id} className="align-top hover:bg-blue-50/50 transition-colors">
                                                    {/* Texto livre quebra linha, não trunca (drawer em tabela). */}
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-900 break-words">{item.description}</td>
                                                    <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{item.unit}</td>
                                                    <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 text-right">{qtd(item.quantity)}</td>
                                                    <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-500 text-right">
                                                        {mode === 'QUANTITATIVO' ? qtd(prevQty) : pct(prevPct)}
                                                    </td>
                                                    <td className="px-3 py-2 border-r border-gray-100">
                                                        {measurementMode === 'HIBRIDO' && (
                                                            <div className="flex h-7 bg-gray-50 rounded-[6px] p-0.5 border border-gray-100 mb-1.5">
                                                                {(['QUANTITATIVO', 'PERCENTUAL'] as const).map(m => (
                                                                    <button
                                                                        key={m}
                                                                        type="button"
                                                                        onClick={() => { setItemModes(prev => ({ ...prev, [item.id]: m })); marcarAlterado(); }}
                                                                        className={`${segmento((itemModes[item.id] ?? 'QUANTITATIVO') === m)} text-xs`}
                                                                    >
                                                                        {m === 'QUANTITATIVO' ? 'Qtd' : '%'}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div className="relative">
                                                            {mode === 'QUANTITATIVO' ? (
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    value={quantities[item.id] || ''}
                                                                    onChange={e => setQuantities(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                                                                    placeholder="0,00"
                                                                    className={`w-full h-9 px-3 rounded-[6px] border text-sm text-right font-medium outline-none transition-all focus:ring-2 focus:ring-blue-500/10 ${isExceeded ? 'border-red-300 bg-red-50 text-red-700' : 'bg-white border-gray-200 focus:border-blue-500'}`}
                                                                />
                                                            ) : (
                                                                <>
                                                                    <input
                                                                        type="number"
                                                                        step="0.1"
                                                                        min="0"
                                                                        max="100"
                                                                        value={percentages[item.id] || ''}
                                                                        onChange={e => setPercentages(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                                                                        placeholder="0,0"
                                                                        className={`w-full h-9 pl-3 pr-7 rounded-[6px] border text-sm text-right font-medium outline-none transition-all focus:ring-2 focus:ring-blue-500/10 ${isExceeded ? 'border-red-300 bg-red-50 text-red-700' : 'bg-white border-gray-200 focus:border-blue-500'}`}
                                                                    />
                                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                                                                </>
                                                            )}
                                                        </div>
                                                        {/* Aviso junto do campo (UI_PATTERNS §6.4), não balão sobreposto. */}
                                                        {isExceeded ? (
                                                            <p className="text-xs text-red-600 mt-1 text-right">
                                                                Acima do saldo ({mode === 'QUANTITATIVO' ? qtd(Math.max(0, remainingQty)) : pct(remainingPct)})
                                                            </p>
                                                        ) : mode === 'PERCENTUAL' && remainingPct < 100 ? (
                                                            <p className="text-xs text-gray-500 mt-1 text-right">Disponível: {pct(remainingPct)}</p>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-3 py-2 border-r border-gray-100">
                                                        <input
                                                            type="file"
                                                            id={`file-${item.id}`}
                                                            className="hidden"
                                                            accept="image/*,video/*"
                                                            onChange={e => { const f = e.target.files?.[0]; if (f) { marcarAlterado(); handleFileUpload(item.id, f); } }}
                                                        />
                                                        {uploadingItems[item.id] ? (
                                                            <span className="flex items-center gap-1.5 h-9 text-[13px] text-gray-500">
                                                                <Loader2 className="w-[15px] h-[15px] animate-spin" /> Enviando...
                                                            </span>
                                                        ) : (
                                                            <div className="flex flex-wrap gap-1.5 items-center min-h-9">
                                                                {(attachments[item.id] || []).map((url, idx) => (
                                                                    <div key={idx} className="relative group/thumb">
                                                                        <button
                                                                            type="button"
                                                                            title="Abrir evidência"
                                                                            className="w-8 h-8 rounded-[6px] border border-gray-200 overflow-hidden hover:border-blue-500 transition-all block"
                                                                            onClick={() => window.open(url, '_blank')}
                                                                        >
                                                                            {url.match(/\.(mp4|webm|ogg)$/i) ? (
                                                                                <span className="w-full h-full bg-gray-100 flex items-center justify-center">
                                                                                    <Video className="w-4 h-4 text-gray-500" />
                                                                                </span>
                                                                            ) : (
                                                                                <img src={url} className="w-full h-full object-cover" alt="Evidência" />
                                                                            )}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            title="Remover evidência"
                                                                            aria-label="Remover evidência"
                                                                            onClick={() => {
                                                                                marcarAlterado();
                                                                                setAttachments(prev => {
                                                                                    const n = { ...prev };
                                                                                    n[item.id] = n[item.id].filter((_, i) => i !== idx);
                                                                                    return n;
                                                                                });
                                                                            }}
                                                                            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                                                                        >
                                                                            <X className="w-2.5 h-2.5" />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                                {/* §9 — ação de linha como link de texto */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => document.getElementById(`file-${item.id}`)?.click()}
                                                                    className="flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
                                                                >
                                                                    <Upload className="w-3.5 h-3.5" />
                                                                    {attachments[item.id]?.length > 0 ? 'Mais' : 'Anexar'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                    {/* §7 — valor financeiro é o único caso com font-medium */}
                                                    <td className="px-3 py-2.5 text-sm font-medium text-gray-900 text-right">{formatMoney(itemValue(item))}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Observações */}
                    <div className="space-y-4">
                        {tituloSecao(Info, 'Observações')}
                        <textarea
                            rows={2}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Ex.: medição parcial conforme cronograma"
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all hover:border-blue-200 resize-y"
                        />
                    </div>
                </div>
            </SheetPanel>

            <SheetFooter>
                {modalError && (
                    <p role="alert" className="mr-auto flex items-center gap-2 text-xs font-medium text-red-600">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {modalError}
                    </p>
                )}
                <button
                    type="button"
                    onClick={fechar}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 transition-all font-medium text-[13px]"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={loading}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Save className="w-[15px] h-[15px]" />}
                    {initialData ? 'Salvar alterações' : 'Salvar medição'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default ContractMeasurementModal;
