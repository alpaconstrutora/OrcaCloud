import React, { useState, useEffect, useCallback } from 'react';
import {
    Lock, Unlock, CheckCircle2, AlertTriangle, RefreshCw,
    CalendarCheck, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';
import { financialCloseService } from '../services/financialCloseService';
import { useToast } from '../hooks/useToast';
import { useConfirm } from './ui/confirm';
import type { FinancialCloseChecklist, FinancialPeriodLock } from '../types/financial';

function formatBRL(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTHS_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface ChecklistItemProps {
    label: string;
    count: number;
    okWhenZero?: boolean;
}
function ChecklistItem({ label, count, okWhenZero = true }: ChecklistItemProps) {
    const ok = okWhenZero ? count === 0 : true;
    return (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-gray-50/70">
            <div className="flex items-center gap-2.5">
                {ok
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                <span className="text-sm font-semibold text-gray-700">{label}</span>
            </div>
            <span className={`tabular-nums text-sm font-black ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>{count}</span>
        </div>
    );
}

interface FinancialClosePanelProps {
    organizationId: string;
}

const FinancialClosePanel: React.FC<FinancialClosePanelProps> = ({ organizationId }) => {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [checklist, setChecklist] = useState<FinancialCloseChecklist | null>(null);
    const [periods, setPeriods] = useState<FinancialPeriodLock[]>([]);
    const [loading, setLoading] = useState(false);
    const [acting, setActing] = useState(false);

    const load = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const [cl, ps] = await Promise.all([
                financialCloseService.getChecklist(organizationId, year, month),
                financialCloseService.listPeriods(organizationId),
            ]);
            setChecklist(cl);
            setPeriods(ps);
        } catch (e) {
            console.error('[FinancialClosePanel]', e);
            showToast('Erro ao carregar fechamento', 'error');
        } finally {
            setLoading(false);
        }
    }, [organizationId, year, month, showToast]);

    useEffect(() => { load(); }, [load]);

    const pendingTotal = checklist
        ? checklist.pending_bank_count + checklist.unclassified_count + checklist.internal_pending_count
        : 0;
    const isClosed = checklist?.is_closed ?? false;

    const onClose = async () => {
        const msg = pendingTotal > 0
            ? `Ainda há ${pendingTotal} pendência(s) neste mês. Deseja fechar mesmo assim? Lançamentos do período ficarão bloqueados.`
            : 'Fechar o período? Lançamentos deste mês ficarão bloqueados para edição.';
        if (!await confirm({ title: `Fechar ${MONTHS_FULL[month - 1]}/${year}?`, message: msg, variant: pendingTotal > 0 ? 'warning' : 'default', confirmLabel: 'Fechar período' })) return;
        setActing(true);
        try {
            await financialCloseService.closePeriod(organizationId, year, month);
            showToast('Período fechado', 'success');
            await load();
        } catch (e) {
            console.error('[FinancialClosePanel] close', e);
            showToast('Erro ao fechar período', 'error');
        } finally {
            setActing(false);
        }
    };

    const onReopen = async () => {
        if (!await confirm({ title: `Reabrir ${MONTHS_FULL[month - 1]}/${year}?`, message: 'O período volta a aceitar lançamentos. A ação fica registrada.', variant: 'warning', confirmLabel: 'Reabrir' })) return;
        setActing(true);
        try {
            await financialCloseService.reopenPeriod(organizationId, year, month);
            showToast('Período reaberto', 'success');
            await load();
        } catch (e) {
            console.error('[FinancialClosePanel] reopen', e);
            showToast('Erro ao reabrir período', 'error');
        } finally {
            setActing(false);
        }
    };

    const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

    if (!organizationId) {
        return (
            <div className="min-h-[300px] flex items-center justify-center">
                <div className="text-center space-y-2 max-w-sm">
                    <CalendarCheck className="w-10 h-10 text-gray-200 mx-auto" />
                    <p className="text-sm font-semibold text-gray-600">Selecione uma organização para ver o fechamento mensal.</p>
                    <p className="text-xs text-gray-400">O fechamento é por empresa — com "Todas as organizações" não há um período único para travar/destravar.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5 min-h-[500px]">
            {/* Header / seletor */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <CalendarCheck className="w-4 h-4" />
                    Fechamento Mensal
                </h4>
                <div className="flex items-center gap-2">
                    <select
                        value={month}
                        onChange={e => setMonth(Number(e.target.value))}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <select
                        value={year}
                        onChange={e => setYear(Number(e.target.value))}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 disabled:opacity-50" title="Atualizar">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Banner de status */}
            <div className={`rounded-2xl border p-5 flex items-center gap-4 ${isClosed ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-100 shadow-sm'}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isClosed ? 'bg-white/10' : 'bg-emerald-50'}`}>
                    {isClosed ? <Lock className="w-6 h-6 text-white" /> : <Unlock className="w-6 h-6 text-emerald-600" />}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`text-lg font-black ${isClosed ? 'text-white' : 'text-gray-900'}`}>
                        {MONTHS_FULL[month - 1]} / {year}
                    </p>
                    <p className={`text-sm font-semibold ${isClosed ? 'text-gray-300' : 'text-gray-400'}`}>
                        {isClosed ? 'Período fechado — lançamentos bloqueados' : pendingTotal > 0 ? `${pendingTotal} pendência(s) antes do fechamento` : 'Pronto para fechar'}
                    </p>
                </div>
                {isClosed ? (
                    <button onClick={onReopen} disabled={acting} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-gray-900 text-sm font-black hover:bg-gray-100 disabled:opacity-50">
                        <Unlock className="w-4 h-4" /> Reabrir
                    </button>
                ) : (
                    <button onClick={onClose} disabled={acting} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-black hover:bg-black disabled:opacity-50">
                        <Lock className="w-4 h-4" /> Fechar período
                    </button>
                )}
            </div>

            {/* Checklist + totais */}
            {checklist && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Checklist de Fechamento</p>
                        <ChecklistItem label="Movimentos do extrato pendentes de conciliação" count={checklist.pending_bank_count} />
                        <ChecklistItem label="Movimentos sem classificação" count={checklist.unclassified_count} />
                        <ChecklistItem label="Tarifas bancárias não contabilizadas" count={checklist.fees_uncategorized_count} />
                        <ChecklistItem label="Títulos do mês ainda pendentes" count={checklist.internal_pending_count} />
                    </div>
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <div className="flex items-center gap-2 mb-1">
                                <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Entradas</p>
                            </div>
                            <p className="text-xl font-black text-emerald-600 tabular-nums">{formatBRL(checklist.total_entradas)}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <div className="flex items-center gap-2 mb-1">
                                <ArrowUpRight className="w-4 h-4 text-red-500" />
                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Saídas</p>
                            </div>
                            <p className="text-xl font-black text-red-600 tabular-nums">{formatBRL(checklist.total_saidas)}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Histórico de períodos */}
            {periods.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-50">
                        <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest">Histórico de Períodos</h5>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {periods.map(p => (
                            <button
                                key={p.id}
                                onClick={() => { setYear(p.period_year); setMonth(p.period_month); }}
                                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 text-left"
                            >
                                {p.is_closed
                                    ? <Lock className="w-4 h-4 text-gray-400" />
                                    : <Unlock className="w-4 h-4 text-emerald-500" />}
                                <span className="text-sm font-bold text-gray-800 flex-1">
                                    {MONTHS_FULL[p.period_month - 1]} / {p.period_year}
                                </span>
                                <span className={`text-button font-black px-2 py-0.5 rounded-full ${p.is_closed ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {p.is_closed ? 'Fechado' : 'Reaberto'}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinancialClosePanel;
