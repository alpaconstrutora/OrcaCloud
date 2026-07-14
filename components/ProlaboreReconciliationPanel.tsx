import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Send, Lock, Unlock, Loader2, Check, X, AlertTriangle, Wallet, CheckCircle2, Clock, Building2, Undo2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { companyService } from '../services/companyService';
import { remuneracaoSocietariaService } from '../services/remuneracaoSocietariaService';
import { financialApprovalService } from '../services/financialApprovalService';
import { financialCloseService } from '../services/financialCloseService';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { formatMoney, formatDateBR } from './ui/Format';
import { KpiCard } from './ui/KpiCard';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import type { Company } from '../types';

// A categoria pode ter sido gravada de formas diferentes: o RH grava
// 'Pró-labore' (com acento/hífen) ao enviar a folha ao financeiro
// (remuneracaoSocietariaService.sendPayrollToFinancial); no Extrato Bancário,
// o usuário costuma classificar manualmente como 'Prolabore' (sem acento/hífen).
// Casa as duas formas em vez de depender de um valor único.
const PROLABORE_ILIKE_PATTERNS = ['%prolabore%', '%pró-labore%'];

interface ProlaboreRow {
    id: string;
    source: 'bank' | 'internal';
    transaction_date: string;
    amount: number;
    description?: string;
    category?: string;
    party_name?: string | null;
    // internal_transactions: aprovação multinível já existente (approval_status).
    approval_status?: string | null;
    // bank_transactions: flag simples dedicado (não participa do motor multinível,
    // que exige internal_transactions/contracts/purchase_orders).
    prolabore_approved_at?: string | null;
    prolabore_approved_by?: string | null;
}

function isApproved(row: ProlaboreRow): boolean {
    return row.source === 'internal' ? row.approval_status === 'APROVADO' : !!row.prolabore_approved_at;
}

interface ProlaboreReconciliationPanelProps {
    organizationId: string;
}

const COLUMNS: ColumnConfig[] = [
    { key: 'description', label: 'Descrição',    sortable: true  },
    { key: 'party',       label: 'Contraparte',  sortable: true  },
    { key: 'category',    label: 'Categoria',    sortable: true  },
    { key: 'date',        label: 'Data',         sortable: true  },
    { key: 'amount',      label: 'Valor',        sortable: true  },
    { key: 'approval',    label: 'Aprovação',    sortable: true  },
    { key: 'actions',     label: 'Ações',        sortable: false },
];

function currentMonthISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthRange(competenceMonth: string): { start: string; end: string } {
    const [y, m] = competenceMonth.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
}

// Status simples colorido (guia §8) — sem pílula, sem fundo, sem uppercase.
const APPROVAL_LABELS: Record<string, string> = {
    RASCUNHO: 'Não enviado',
    PENDENTE: 'Pendente',
    APROVADO: 'Aprovado',
    REJEITADO: 'Rejeitado',
};
const APPROVAL_COLORS: Record<string, string> = {
    RASCUNHO: 'text-gray-500',
    PENDENTE: 'text-amber-700',
    APROVADO: 'text-emerald-700',
    REJEITADO: 'text-red-600',
};

const ProlaboreReconciliationPanel: React.FC<ProlaboreReconciliationPanelProps> = ({ organizationId }) => {
    const confirm = useConfirm();
    const { localToast, showToast } = useToast();

    const [companies, setCompanies] = useState<Company[]>([]);
    const [companyId, setCompanyId] = useState<string>('');
    const [competenceMonth, setCompetenceMonth] = usePersistedState<string>('prolaboreReconciliation:competence', currentMonthISO());
    const [rows, setRows] = useState<ProlaboreRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [actingId, setActingId] = useState<string | null>(null);
    const [periodLocked, setPeriodLocked] = useState<boolean | null>(null);
    const [periodActing, setPeriodActing] = useState(false);
    const [sendingToRh, setSendingToRh] = useState(false);
    const [reconciledInfo, setReconciledInfo] = useState<{ total: number; at: string; by: string } | null>(null);

    const tableColumns = useTableColumns(COLUMNS, 'prolaboreReconciliationColumns');

    useEffect(() => {
        companyService.list(organizationId).then(list => {
            setCompanies(list);
            if (list.length > 0 && !companyId) setCompanyId(list[0].id);
        }).catch(() => {});
    }, [organizationId]);

    const loadTransactions = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const { start, end } = monthRange(competenceMonth);
            const orFilter = PROLABORE_ILIKE_PATTERNS.map(p => `category.ilike.${p}`).join(',');

            const [internalRes, bankRes] = await Promise.all([
                supabase
                    .from('internal_transactions')
                    .select('id, transaction_date, amount, description, category, party_name, approval_status')
                    .eq('organization_id', organizationId)
                    .or(orFilter)
                    .gte('transaction_date', start)
                    .lte('transaction_date', end),
                supabase
                    .from('bank_transactions')
                    .select('id, transaction_date, amount, description_raw, description_normalized, counterparty_name, category, status, prolabore_approved_at, prolabore_approved_by')
                    .eq('organization_id', organizationId)
                    .or(orFilter)
                    .neq('status', 'MATCHED') // já conciliado — o internal_transactions correspondente representa o lançamento
                    .gte('transaction_date', start)
                    .lte('transaction_date', end),
            ]);
            if (internalRes.error) throw internalRes.error;
            if (bankRes.error) throw bankRes.error;

            const internalRows: ProlaboreRow[] = (internalRes.data || []).map((t: any) => ({
                id: t.id, source: 'internal', transaction_date: t.transaction_date, amount: t.amount,
                description: t.description, category: t.category, party_name: t.party_name, approval_status: t.approval_status,
            }));
            const bankRows: ProlaboreRow[] = (bankRes.data || []).map((t: any) => ({
                id: t.id, source: 'bank', transaction_date: t.transaction_date, amount: t.amount,
                description: t.description_normalized || t.description_raw, category: t.category, party_name: t.counterparty_name,
                prolabore_approved_at: t.prolabore_approved_at, prolabore_approved_by: t.prolabore_approved_by,
            }));

            setRows([...internalRows, ...bankRows]);
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erro ao carregar lançamentos de pró-labore', 'error');
        } finally {
            setLoading(false);
        }
    }, [organizationId, competenceMonth]);

    useEffect(() => { loadTransactions(); }, [loadTransactions]);

    useEffect(() => {
        if (!organizationId || !competenceMonth) { setPeriodLocked(null); return; }
        financialCloseService.isClosed(organizationId, competenceMonth).then(setPeriodLocked).catch(() => setPeriodLocked(null));
    }, [organizationId, competenceMonth]);

    useEffect(() => {
        if (!companyId || !competenceMonth) { setReconciledInfo(null); return; }
        remuneracaoSocietariaService.getPayrollByCompetence(companyId, competenceMonth).then(p => {
            setReconciledInfo(p?.bank_reconciled_total != null
                ? { total: p.bank_reconciled_total, at: p.bank_reconciled_at || '', by: p.bank_reconciled_by_email || '' }
                : null);
        }).catch(() => setReconciledInfo(null));
    }, [companyId, competenceMonth]);

    const totals = useMemo(() => {
        const pendente = rows.filter(r => !isApproved(r)).reduce((s, r) => s + r.amount, 0);
        const aprovado = rows.filter(isApproved).reduce((s, r) => s + r.amount, 0);
        return { pendente, aprovado, total: pendente + aprovado, count: rows.length };
    }, [rows]);

    const sortedRows = useMemo(() => {
        const arr = [...rows];
        return arr.sort((a, b) => {
            if (tableColumns.sortColumn) {
                const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                switch (tableColumns.sortColumn) {
                    case 'description': return (a.description || '').localeCompare(b.description || '') * dir;
                    case 'party':       return (a.party_name || '').localeCompare(b.party_name || '') * dir;
                    case 'category':    return (a.category || '').localeCompare(b.category || '') * dir;
                    case 'date':        return a.transaction_date.localeCompare(b.transaction_date) * dir;
                    case 'amount':      return (a.amount - b.amount) * dir;
                    case 'approval':    return Number(isApproved(a)) - Number(isApproved(b)) * dir;
                }
            }
            return b.transaction_date.localeCompare(a.transaction_date);
        });
    }, [rows, tableColumns.sortColumn, tableColumns.sortDirection]);

    const handleApprove = async (row: ProlaboreRow) => {
        setActingId(row.id);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const approvedBy = user?.email || 'sistema';
            if (row.source === 'internal') {
                const cfg = await financialApprovalService.resolveRequiredLevels(organizationId, row.amount);
                const labels = { level1_label: cfg?.level1_label || 'Financeiro', level2_label: cfg?.level2_label };
                if (!row.approval_status || row.approval_status === 'RASCUNHO') {
                    await financialApprovalService.submitForApproval(row.id);
                }
                await financialApprovalService.approve(row.id, 1, approvedBy, labels);
            } else {
                const { error } = await supabase
                    .from('bank_transactions')
                    .update({ prolabore_approved_at: new Date().toISOString(), prolabore_approved_by: approvedBy })
                    .eq('id', row.id);
                if (error) throw error;
            }
            showToast('Lançamento aprovado.');
            await loadTransactions();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erro ao aprovar lançamento', 'error');
        } finally {
            setActingId(null);
        }
    };

    const handleReject = async (row: ProlaboreRow) => {
        if (!await confirm({ title: 'Rejeitar lançamento?', message: `${row.description || 'Lançamento'} — ${formatMoney(row.amount)}`, variant: 'danger', confirmLabel: 'Rejeitar' })) return;
        setActingId(row.id);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            await financialApprovalService.reject(row.id, user?.email || 'sistema', 'Rejeitado na Conciliação Bancária (aba Pró-labore)');
            showToast('Lançamento rejeitado.');
            await loadTransactions();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erro ao rejeitar lançamento', 'error');
        } finally {
            setActingId(null);
        }
    };

    const handleUndoBankApproval = async (row: ProlaboreRow) => {
        setActingId(row.id);
        try {
            const { error } = await supabase
                .from('bank_transactions')
                .update({ prolabore_approved_at: null, prolabore_approved_by: null })
                .eq('id', row.id);
            if (error) throw error;
            showToast('Aprovação desfeita.');
            await loadTransactions();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erro ao desfazer aprovação', 'error');
        } finally {
            setActingId(null);
        }
    };

    const handleTogglePeriodLock = async () => {
        const [y, m] = competenceMonth.split('-').map(Number);
        if (periodLocked) {
            if (!await confirm({ title: 'Reabrir o mês?', message: 'O período volta a aceitar lançamentos em todo o Financeiro.', variant: 'warning', confirmLabel: 'Reabrir' })) return;
        } else {
            if (!await confirm({ title: 'Fechar o mês?', message: 'Lançamentos deste mês ficarão bloqueados para edição em todo o Financeiro — não só no Pró-labore.', confirmLabel: 'Fechar período' })) return;
        }
        setPeriodActing(true);
        try {
            if (periodLocked) await financialCloseService.reopenPeriod(organizationId, y, m);
            else await financialCloseService.closePeriod(organizationId, y, m);
            setPeriodLocked(await financialCloseService.isClosed(organizationId, competenceMonth));
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erro ao alterar o fechamento do período', 'error');
        } finally {
            setPeriodActing(false);
        }
    };

    const handleSendTotalToRh = async () => {
        if (!companyId) { showToast('Selecione a empresa.', 'error'); return; }
        if (!await confirm({
            title: 'Lançar total em RH?',
            message: `Registra ${formatMoney(totals.aprovado)} em RH > Remuneração Societária > Pró-labore como total conciliado no banco para esta competência. Não cria novo lançamento financeiro.`,
            confirmLabel: 'Lançar total',
        })) return;
        setSendingToRh(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const payroll = await remuneracaoSocietariaService.recordBankReconciledTotal(
                organizationId, companyId, competenceMonth, totals.aprovado, user?.email || 'sistema',
            );
            setReconciledInfo({ total: payroll.bank_reconciled_total || 0, at: payroll.bank_reconciled_at || '', by: payroll.bank_reconciled_by_email || '' });
            showToast('Total lançado em RH com sucesso.');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erro ao lançar total em RH', 'error');
        } finally {
            setSendingToRh(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* KPIs — §4.2 quebra de simetria (Total é o principal, Pendente/Aprovado a decomposição) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard shadow={false} size="lg" className="col-span-2" label="Total de pró-labore no mês" value={formatMoney(totals.total)} icon={<Wallet className="w-4 h-4" />} color="blue" />
                <KpiCard shadow={false} size="sm" label="Pendente de aprovação" value={formatMoney(totals.pendente)} icon={<Clock className="w-4 h-4" />} color="amber" />
                <KpiCard shadow={false} size="sm" label="Aprovado" value={formatMoney(totals.aprovado)} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
            </div>

            {/* Toolbar — competência, empresa, fechamento, lançar total (guia §5.1 desaninhada) */}
            <div className="flex flex-col md:flex-row gap-2.5 items-center flex-wrap">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-500">Competência</label>
                    <input type="month" value={competenceMonth.slice(0, 7)}
                        onChange={e => setCompetenceMonth(`${e.target.value}-01`)}
                        className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                </div>
                {companies.length > 1 && (
                    <div className="flex items-center gap-2 bg-gray-50 px-3 h-9 rounded-[6px] border border-gray-200">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="text-sm font-medium bg-transparent outline-none">
                            {companies.map(c => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                        </select>
                    </div>
                )}

                <div className="flex-1" />

                {periodLocked !== null && (
                    <button onClick={handleTogglePeriodLock} disabled={periodActing}
                        title="Fecha/reabre o mês inteiro no Financeiro — afeta todos os lançamentos, não só o Pró-labore"
                        className={`flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium border transition-all disabled:opacity-50 ${
                            periodLocked ? 'border-gray-800 bg-gray-900 text-white hover:bg-black' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}>
                        {periodActing ? <Loader2 className="w-4 h-4 animate-spin" /> : periodLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        {periodLocked ? 'Mês fechado — Reabrir' : 'Mês aberto — Fechar'}
                    </button>
                )}

                <button onClick={handleSendTotalToRh} disabled={sendingToRh || totals.aprovado <= 0}
                    title="Registra o total aprovado em RH > Remuneração Societária > Pró-labore (não cria novo lançamento financeiro)"
                    className="flex items-center gap-1.5 h-9 px-4 rounded-[6px] text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {sendingToRh ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Lançar total em RH
                </button>

                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                    <ColumnConfigButton
                        columns={COLUMNS.filter(c => c.key !== 'actions')}
                        visibleColumns={tableColumns.visibleColumns}
                        showColumnConfig={tableColumns.showColumnConfig}
                        onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                        onToggleColumn={tableColumns.toggleColumn}
                        onReset={tableColumns.resetColumns}
                    />
                </div>
            </div>

            {reconciledInfo && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-[10px] text-sm text-blue-800">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Total já lançado em RH: <strong>{formatMoney(reconciledInfo.total)}</strong>
                    {reconciledInfo.at && <span className="text-blue-600">— {formatDateBR(reconciledInfo.at)} por {reconciledInfo.by}</span>}
                </div>
            )}

            {/* Tabela — guia §6/§7 */}
            <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                            {tableColumns.visibleColumns.includes('description') && (
                                <SortableHeader colKey="description" label="Descrição" uppercase={false}
                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100" />
                            )}
                            {tableColumns.visibleColumns.includes('party') && (
                                <SortableHeader colKey="party" label="Contraparte" uppercase={false}
                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100" />
                            )}
                            {tableColumns.visibleColumns.includes('category') && (
                                <SortableHeader colKey="category" label="Categoria" uppercase={false}
                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100" />
                            )}
                            {tableColumns.visibleColumns.includes('date') && (
                                <SortableHeader colKey="date" label="Data" uppercase={false}
                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100" />
                            )}
                            {tableColumns.visibleColumns.includes('amount') && (
                                <SortableHeader colKey="amount" label="Valor" uppercase={false}
                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100" />
                            )}
                            {tableColumns.visibleColumns.includes('approval') && (
                                <SortableHeader colKey="approval" label="Aprovação" uppercase={false}
                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100" />
                            )}
                            {tableColumns.visibleColumns.includes('actions') && (
                                <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={7} className="text-center py-12 text-gray-400">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                            </td></tr>
                        ) : sortedRows.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-12">
                                <div className="flex flex-col items-center gap-2 text-gray-400">
                                    <Wallet className="w-8 h-8 opacity-30" />
                                    <p className="text-sm font-medium">Nenhum lançamento de pró-labore nesta competência.</p>
                                </div>
                            </td></tr>
                        ) : sortedRows.map(row => {
                            const approved = isApproved(row);
                            const approvalLabel = row.source === 'internal'
                                ? (APPROVAL_LABELS[row.approval_status || 'RASCUNHO'] || row.approval_status)
                                : (approved ? 'Aprovado' : 'Pendente');
                            const approvalColor = row.source === 'internal'
                                ? (APPROVAL_COLORS[row.approval_status || 'RASCUNHO'] || 'text-gray-500')
                                : (approved ? 'text-emerald-700' : 'text-amber-700');
                            return (
                                <tr key={`${row.source}:${row.id}`} className="hover:bg-blue-50/50 transition-colors">
                                    {tableColumns.visibleColumns.includes('description') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{row.description || '—'}</td>
                                    )}
                                    {tableColumns.visibleColumns.includes('party') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{row.party_name || '—'}</td>
                                    )}
                                    {tableColumns.visibleColumns.includes('category') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{row.category || '—'}</td>
                                    )}
                                    {tableColumns.visibleColumns.includes('date') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{formatDateBR(row.transaction_date)}</td>
                                    )}
                                    {tableColumns.visibleColumns.includes('amount') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800">{formatMoney(row.amount)}</td>
                                    )}
                                    {tableColumns.visibleColumns.includes('approval') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100">
                                            <span className={`text-sm font-normal ${approvalColor}`}>{approvalLabel}</span>
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {row.source === 'internal' ? (
                                                    <>
                                                        {row.approval_status !== 'APROVADO' && (
                                                            <button onClick={() => handleApprove(row)} disabled={actingId === row.id}
                                                                title="Aprovar"
                                                                className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-100 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50">
                                                                {actingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                            </button>
                                                        )}
                                                        {row.approval_status !== 'REJEITADO' && (
                                                            <button onClick={() => handleReject(row)} disabled={actingId === row.id}
                                                                title="Rejeitar"
                                                                className="p-2.5 bg-white border border-red-50 text-red-500 hover:bg-red-50 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50">
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </>
                                                ) : approved ? (
                                                    <button onClick={() => handleUndoBankApproval(row)} disabled={actingId === row.id}
                                                        title="Desfazer aprovação"
                                                        className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-amber-600 hover:border-amber-100 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50">
                                                        {actingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleApprove(row)} disabled={actingId === row.id}
                                                        title="Aprovar"
                                                        className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-100 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50">
                                                        {actingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default ProlaboreReconciliationPanel;
