import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { contractRenewalService, RenewalPreview } from '../../services/contractRenewalService';
import { Contract } from '../../types';

interface Props {
    open: boolean;
    contractId: string | null;
    onClose: () => void;
    onRenewed: (child: Contract) => void;
}

/** Data BR sem bug de fuso: em UTC-3, `new Date(iso)` retrocede um dia. */
const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};
const fmtMonth = (iso?: string) => {
    if (!iso) return '—';
    const [y, m] = iso.slice(0, 10).split('-');
    return `${m}/${y}`;
};
const fmtCur = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const DURATIONS = [12, 24, 36];

const RenewContractSheet: React.FC<Props> = ({ open, contractId, onClose, onRenewed }) => {
    const [preview, setPreview] = useState<RenewalPreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [months, setMonths] = useState(12);
    const [customEnd, setCustomEnd] = useState('');
    const [applyReajuste, setApplyReajuste] = useState(true);
    const [valueOverride, setValueOverride] = useState<string>('');
    const [notes, setNotes] = useState('');

    const load = useCallback(async () => {
        if (!contractId) return;
        setLoading(true);
        setError(null);
        try {
            const p = await contractRenewalService.previewRenewal(contractId, {
                months,
                endDate: customEnd || undefined,
                applyReajuste,
            });
            setPreview(p);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Não foi possível carregar a renovação.');
            setPreview(null);
        } finally {
            setLoading(false);
        }
    }, [contractId, months, customEnd, applyReajuste]);

    useEffect(() => { if (open) load(); }, [open, load]);

    // Reset ao abrir outro contrato
    useEffect(() => {
        if (!open) return;
        setMonths(12); setCustomEnd(''); setApplyReajuste(true);
        setValueOverride(''); setNotes(''); setError(null);
    }, [open, contractId]);

    const handleRenew = async () => {
        if (!contractId) return;
        setSaving(true);
        setError(null);
        try {
            const parsed = valueOverride ? Number(valueOverride.replace(',', '.')) : undefined;
            const { child } = await contractRenewalService.renewContract(contractId, {
                months,
                endDate: customEnd || undefined,
                applyReajuste,
                newValue: parsed && parsed > 0 ? parsed : undefined,
                notes: notes || undefined,
            });
            onRenewed(child);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao renovar o contrato.');
        } finally {
            setSaving(false);
        }
    };

    const effectiveValue = valueOverride
        ? Number(valueOverride.replace(',', '.')) || 0
        : (preview?.newValue ?? 0);

    return (
        <Sheet open={open} onClose={onClose} size="xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Renovar contrato de locação</SheetTitle>
                <SheetDescription>
                    A renovação cria um contrato novo, com numeração e parcelas próprias, e encerra o atual.
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-6">
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : !preview ? (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-[10px] p-4 text-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{error || 'Contrato indisponível para renovação.'}</span>
                    </div>
                ) : (
                    <>
                        {/* Contrato atual — somente leitura */}
                        <div className="bg-gray-50 border border-gray-100 rounded-[10px] p-4 grid grid-cols-2 gap-y-3 gap-x-4">
                            <div>
                                <p className="text-xs font-semibold text-slate-500">Contrato atual</p>
                                <p className="text-sm text-gray-800 mt-0.5">{preview.parent.number}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-slate-500">Vigência atual</p>
                                <p className="text-sm text-gray-800 mt-0.5">
                                    {fmtDate(preview.parent.start_date)} a {fmtDate(preview.parent.end_date)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-slate-500">Valor vigente</p>
                                <p className="text-sm font-medium text-gray-800 mt-0.5">{fmtCur(preview.currentValue)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-slate-500">Novo número</p>
                                <p className="text-sm text-gray-800 mt-0.5">{preview.nextNumber}</p>
                            </div>
                        </div>

                        {/* Duração */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500">Duração da nova vigência</label>
                            <div className="flex flex-wrap items-center gap-2">
                                {DURATIONS.map(d => (
                                    <button
                                        key={d}
                                        onClick={() => { setMonths(d); setCustomEnd(''); }}
                                        className={`h-9 px-3.5 rounded-[6px] text-sm font-medium transition-all ${
                                            !customEnd && months === d
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                                        }`}
                                    >
                                        {d} meses
                                    </button>
                                ))}
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    title="Fim da vigência personalizado"
                                />
                            </div>
                        </div>

                        {/* Vigência resultante */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500">Início</label>
                                <div
                                    className="h-9 px-3 flex items-center bg-gray-100 border border-gray-200 rounded-[6px] text-sm text-gray-600"
                                    title="Dia seguinte ao fim do contrato atual — evita sobreposição de parcelas."
                                >
                                    {fmtDate(preview.startDate)}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500">Término</label>
                                <div className="h-9 px-3 flex items-center bg-gray-50 border border-gray-200 rounded-[6px] text-sm text-gray-700">
                                    {fmtDate(preview.endDate)}
                                </div>
                            </div>
                        </div>

                        {/* Reajuste */}
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                                <input
                                    type="checkbox"
                                    checked={applyReajuste}
                                    onChange={(e) => setApplyReajuste(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                Aplicar reajuste pelo índice do contrato
                            </label>

                            {preview.index && applyReajuste && (
                                <p className="text-sm text-gray-600">
                                    {preview.index.name} {fmtMonth(preview.index.baseMonth)} → {fmtMonth(preview.index.currentMonth)}
                                    {' · '}fator {preview.fator.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                </p>
                            )}

                            {preview.reajusteWarning && applyReajuste && (
                                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-[10px] p-3 text-sm">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{preview.reajusteWarning}</span>
                                </div>
                            )}
                        </div>

                        {/* Novo valor */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500">Novo valor do aluguel</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={valueOverride}
                                placeholder={String(preview.newValue.toFixed(2))}
                                onChange={(e) => setValueOverride(e.target.value)}
                                className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                            <p className="text-sm text-gray-500">
                                Sugerido: {fmtCur(preview.newValue)}
                                {preview.fator !== 1 && ` (era ${fmtCur(preview.currentValue)})`}
                            </p>
                        </div>

                        {/* Observações */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500">Observações</label>
                            <textarea
                                rows={2}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder="Anotações da renovação (opcional)"
                            />
                        </div>

                        {/* Impacto */}
                        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 text-blue-800 rounded-[10px] p-3 text-sm">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                O contrato {preview.parent.number} será encerrado
                                {preview.pendingToCancel > 0
                                    ? ` e ${preview.pendingToCancel} parcela(s) futura(s) dele serão canceladas.`
                                    : '. Nenhuma parcela futura dele será cancelada.'}
                                {' '}Parcelas já pagas não são afetadas.
                            </span>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-[10px] p-3 text-sm">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}
                    </>
                )}
            </SheetPanel>

            <SheetFooter>
                <button
                    onClick={onClose}
                    className="h-9 px-3.5 rounded-[6px] text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
                >
                    Cancelar
                </button>
                <button
                    onClick={handleRenew}
                    disabled={saving || loading || !preview || effectiveValue <= 0}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                >
                    <RefreshCw className={`w-[15px] h-[15px] ${saving ? 'animate-spin' : ''}`} />
                    {saving ? 'Renovando...' : 'Renovar contrato'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default RenewContractSheet;
