import React, { useState, useEffect, useCallback } from 'react';
import {
    Landmark, ShieldCheck, AlertTriangle, BookOpen, RefreshCw,
    Pencil, Check, X, Tag, Receipt, Scale, Building2, HardHat,
} from 'lucide-react';
import { reconciliationDashboardService } from '../services/reconciliationDashboardService';
import { useToast } from '../hooks/useToast';
import type {
    ReconciliationDashboard as DashboardData, ReconciliationAccountBalance,
    ReconciliationConsolidated,
} from '../types/financial';
import { formatMoney as formatBRL } from './ui/Format';

// Tolerância para considerar saldos "batendo" (centavos de arredondamento).
const EPS = 0.01;

interface KPIProps {
    label: string;
    value: number;
    icon: React.ElementType;
    iconBg: string;
    hint?: string;
    tone?: 'neutral' | 'good' | 'warn';
}
function KPICard({ label, value, icon: Icon, iconBg, hint, tone = 'neutral' }: KPIProps) {
    const valueColor =
        tone === 'good' ? 'text-emerald-600'
        : tone === 'warn' ? 'text-amber-600'
        : value < 0 ? 'text-red-600' : 'text-gray-900';
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                    <p className={`text-xl font-black mt-0.5 tabular-nums ${valueColor}`}>{formatBRL(value)}</p>
                    {hint && <p className="text-xs text-gray-400 mt-1 font-medium">{hint}</p>}
                </div>
            </div>
        </div>
    );
}

interface ReconciliationDashboardProps {
    organizationId: string | null;
}

const ReconciliationDashboardView: React.FC<ReconciliationDashboardProps> = ({ organizationId }) => {
    const { showToast } = useToast();
    const [asOf, setAsOf] = useState(new Date().toISOString().split('T')[0]);
    const [data, setData] = useState<DashboardData | null>(null);
    const [consolidated, setConsolidated] = useState<ReconciliationConsolidated | null>(null);
    const [loading, setLoading] = useState(false);

    // Edição de saldo inicial inline
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editBalance, setEditBalance] = useState('');
    const [editDate, setEditDate] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [d, cons] = await Promise.all([
                reconciliationDashboardService.getDashboard(organizationId, asOf),
                reconciliationDashboardService.getConsolidated(organizationId, asOf),
            ]);
            setData(d);
            setConsolidated(cons);
        } catch (e) {
            console.error('[ReconciliationDashboard]', e);
            showToast('Erro ao carregar dashboard de conciliação', 'error');
        } finally {
            setLoading(false);
        }
    }, [organizationId, asOf, showToast]);

    useEffect(() => { load(); }, [load]);

    const startEdit = (acc: ReconciliationAccountBalance) => {
        setEditingId(acc.account_id);
        setEditBalance(String(acc.opening_balance ?? 0));
        setEditDate('');
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditBalance('');
        setEditDate('');
    };

    const saveEdit = async (accountId: string) => {
        const parsed = parseFloat(editBalance.replace(',', '.'));
        if (isNaN(parsed)) {
            showToast('Saldo inicial inválido', 'error');
            return;
        }
        setSaving(true);
        try {
            await reconciliationDashboardService.setOpeningBalance(accountId, parsed, editDate || null);
            showToast('Saldo inicial atualizado', 'success');
            cancelEdit();
            await load();
        } catch (e) {
            console.error('[ReconciliationDashboard] saveEdit', e);
            showToast('Erro ao salvar saldo inicial', 'error');
        } finally {
            setSaving(false);
        }
    };

    const totals = data?.totals;
    const systemBalance = data?.system_balance ?? 0;
    const reconciledTotal = totals?.reconciled_balance ?? 0;
    const integrityGap = reconciledTotal - systemBalance;
    const hasIntegrityGap = Math.abs(integrityGap) > EPS;
    const fees = data?.fees ?? { value: 0, count: 0 };

    return (
        <div className="space-y-5 min-h-[500px]">
            {/* Header / filtro */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Scale className="w-4 h-4" />
                    Saldo Bancário vs. Contábil
                </h4>
                <div className="flex items-center gap-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Posição em</label>
                    <input
                        type="date"
                        value={asOf}
                        onChange={e => setAsOf(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                        onClick={load}
                        disabled={loading}
                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-colors disabled:opacity-50"
                        title="Atualizar"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* KPIs principais */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <KPICard
                    label="Saldo Bancário (Real)"
                    value={totals?.bank_balance ?? 0}
                    icon={Landmark}
                    iconBg="bg-blue-50 text-blue-600"
                    hint="Saldo inicial + extrato importado"
                />
                <KPICard
                    label="Saldo Conciliado"
                    value={reconciledTotal}
                    icon={ShieldCheck}
                    iconBg="bg-emerald-50 text-emerald-600"
                    hint="Movimentos já conciliados"
                />
                <KPICard
                    label="Pendente de Conciliação"
                    value={totals?.difference ?? 0}
                    icon={AlertTriangle}
                    iconBg="bg-amber-50 text-amber-600"
                    tone={Math.abs(totals?.difference ?? 0) > EPS ? 'warn' : 'good'}
                    hint={`${totals?.pending_count ?? 0} lançamento(s) pendente(s)`}
                />
                <KPICard
                    label="Saldo Contábil do Sistema"
                    value={systemBalance}
                    icon={BookOpen}
                    iconBg="bg-indigo-50 text-indigo-600"
                    hint="Saldo inicial + lançamentos conciliados"
                />
            </div>

            {/* Alertas */}
            {(hasIntegrityGap || (totals?.unclassified_count ?? 0) > 0 || fees.count > 0) && (
                <div className="space-y-2">
                    {hasIntegrityGap && (
                        <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <p className="text-sm font-semibold text-red-700">
                                Divergência crítica: saldo conciliado do extrato e saldo contábil do sistema diferem em{' '}
                                <span className="font-black tabular-nums">{formatBRL(Math.abs(integrityGap))}</span>.
                                Verifique vínculos de conciliação faltantes ou duplicados.
                            </p>
                        </div>
                    )}
                    {(totals?.unclassified_count ?? 0) > 0 && (
                        <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                            <Tag className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            <p className="text-sm font-semibold text-amber-700">
                                {totals?.unclassified_count} movimentação(ões) pendente(s) sem classificação.
                            </p>
                        </div>
                    )}
                    {fees.count > 0 && (
                        <div className="flex items-center gap-3 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
                            <Receipt className="w-4 h-4 text-orange-500 flex-shrink-0" />
                            <p className="text-sm font-semibold text-orange-700">
                                {fees.count} possível(is) tarifa(s) bancária(s) não contabilizada(s) —{' '}
                                <span className="font-black tabular-nums">{formatBRL(fees.value)}</span>.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Tabela por conta */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-50">
                    <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest">Conciliação por Conta Bancária</h5>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                <th className="text-left  px-5 py-3">Conta</th>
                                <th className="text-right px-3 py-3">Saldo Inicial</th>
                                <th className="text-right px-3 py-3">Saldo Bancário</th>
                                <th className="text-right px-3 py-3">Conciliado</th>
                                <th className="text-right px-3 py-3">Diferença</th>
                                <th className="text-right px-3 py-3">Pendentes</th>
                                <th className="text-right px-5 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {(data?.accounts ?? []).map(acc => {
                                const isEditing = editingId === acc.account_id;
                                const diff = acc.difference;
                                const conciliada = Math.abs(diff) <= EPS;
                                return (
                                    <tr key={acc.account_id} className="hover:bg-gray-50/50">
                                        <td className="px-5 py-3">
                                            <p className="font-bold text-gray-800">{acc.account_name}</p>
                                            {acc.bank_name && <p className="text-xs text-gray-400 font-medium">{acc.bank_name}</p>}
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            {isEditing ? (
                                                <div className="flex flex-col items-end gap-1">
                                                    <input
                                                        type="text"
                                                        value={editBalance}
                                                        onChange={e => setEditBalance(e.target.value)}
                                                        placeholder="0,00"
                                                        className="w-28 px-2 py-1 rounded border border-gray-200 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                    <input
                                                        type="date"
                                                        value={editDate}
                                                        onChange={e => setEditDate(e.target.value)}
                                                        title="Data de início (opcional)"
                                                        className="w-28 px-2 py-1 rounded border border-gray-200 text-right text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                            ) : (
                                                <span className="tabular-nums text-gray-600">{formatBRL(acc.opening_balance)}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums font-bold text-gray-900">{formatBRL(acc.bank_balance)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-emerald-600 font-semibold">{formatBRL(acc.reconciled_balance)}</td>
                                        <td className={`px-3 py-3 text-right tabular-nums font-bold ${conciliada ? 'text-gray-300' : 'text-amber-600'}`}>
                                            {conciliada ? '—' : formatBRL(diff)}
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            {acc.pending_count > 0 ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-black">
                                                    {acc.pending_count}
                                                </span>
                                            ) : (
                                                <Check className="w-4 h-4 text-emerald-500 inline" />
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            {isEditing ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => saveEdit(acc.account_id)}
                                                        disabled={saving}
                                                        className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50"
                                                        title="Salvar"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={cancelEdit}
                                                        disabled={saving}
                                                        className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                                                        title="Cancelar"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => startEdit(acc)}
                                                    className="p-1.5 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50"
                                                    title="Editar saldo inicial"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {!loading && (data?.accounts ?? []).length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400 font-medium">
                                        Nenhuma conta bancária cadastrada.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {(data?.accounts ?? []).length > 0 && totals && (
                            <tfoot>
                                <tr className="border-t-2 border-gray-100 bg-gray-50/50 font-black text-gray-900">
                                    <td className="px-5 py-3 text-xs uppercase tracking-widest text-gray-500">Total</td>
                                    <td className="px-3 py-3 text-right tabular-nums">{formatBRL(totals.opening_balance)}</td>
                                    <td className="px-3 py-3 text-right tabular-nums">{formatBRL(totals.bank_balance)}</td>
                                    <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{formatBRL(totals.reconciled_balance)}</td>
                                    <td className={`px-3 py-3 text-right tabular-nums ${Math.abs(totals.difference) <= EPS ? 'text-gray-300' : 'text-amber-600'}`}>
                                        {Math.abs(totals.difference) <= EPS ? '—' : formatBRL(totals.difference)}
                                    </td>
                                    <td className="px-3 py-3 text-right tabular-nums">{totals.pending_count}</td>
                                    <td className="px-5 py-3"></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* Consolidado por empresa (SPE) */}
            {consolidated && consolidated.by_empresa.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-indigo-500" />
                        <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            Caixa Consolidado por Empresa
                        </h5>
                        <span className="text-xs text-gray-300 font-bold">
                            {consolidated.totals.empresa_count} empresa(s) · {consolidated.totals.account_count} conta(s)
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                    <th className="text-left  px-5 py-3">Empresa</th>
                                    <th className="text-right px-3 py-3">Contas</th>
                                    <th className="text-right px-3 py-3">Saldo Bancário</th>
                                    <th className="text-right px-3 py-3">Conciliado</th>
                                    <th className="text-right px-3 py-3">Diferença</th>
                                    <th className="text-right px-5 py-3">Pendentes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {consolidated.by_empresa.map(e => (
                                    <tr key={e.empresa_id ?? 'none'} className="hover:bg-gray-50/50">
                                        <td className="px-5 py-3 font-bold text-gray-800">{e.empresa_name}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-gray-500">{e.account_count}</td>
                                        <td className="px-3 py-3 text-right tabular-nums font-bold text-gray-900">{formatBRL(e.bank_balance)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-emerald-600 font-semibold">{formatBRL(e.reconciled_balance)}</td>
                                        <td className={`px-3 py-3 text-right tabular-nums font-bold ${Math.abs(e.difference) <= EPS ? 'text-gray-300' : 'text-amber-600'}`}>
                                            {Math.abs(e.difference) <= EPS ? '—' : formatBRL(e.difference)}
                                        </td>
                                        <td className="px-5 py-3 text-right tabular-nums">{e.pending_count || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-100 bg-gray-50/50 font-black text-gray-900">
                                    <td className="px-5 py-3 text-xs uppercase tracking-widest text-gray-500">Grupo</td>
                                    <td className="px-3 py-3 text-right tabular-nums">{consolidated.totals.account_count}</td>
                                    <td className="px-3 py-3 text-right tabular-nums">{formatBRL(consolidated.totals.bank_balance)}</td>
                                    <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{formatBRL(consolidated.totals.reconciled_balance)}</td>
                                    <td className="px-3 py-3"></td>
                                    <td className="px-5 py-3"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* Caixa realizado por obra */}
            {consolidated && consolidated.by_project.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
                        <HardHat className="w-4 h-4 text-orange-500" />
                        <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            Caixa Realizado por Obra
                        </h5>
                        <span className="text-xs text-gray-300 font-bold">conciliado até a data</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                    <th className="text-left  px-5 py-3">Obra</th>
                                    <th className="text-right px-3 py-3">Entradas</th>
                                    <th className="text-right px-3 py-3">Saídas</th>
                                    <th className="text-right px-5 py-3">Caixa Líquido</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {consolidated.by_project.map(p => (
                                    <tr key={p.project_id} className="hover:bg-gray-50/50">
                                        <td className="px-5 py-3 font-bold text-gray-800">{p.project_name}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{formatBRL(p.credit)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-red-600">{formatBRL(p.debit)}</td>
                                        <td className={`px-5 py-3 text-right tabular-nums font-black ${p.net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatBRL(p.net)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReconciliationDashboardView;
