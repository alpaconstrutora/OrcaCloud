import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Send, Lock, Unlock, Loader2, Check, X, AlertTriangle, Wallet, CheckCircle2, Clock, Building2, Undo2, Plus, PencilLine, Search, MoveHorizontal,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { supabase } from '../lib/supabase';
import { companyService } from '../services/companyService';
import { remuneracaoSocietariaService } from '../services/remuneracaoSocietariaService';
import { financialApprovalService } from '../services/financialApprovalService';
import { financialCloseService } from '../services/financialCloseService';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { formatMoney, formatDateBR } from './ui/Format';
import { KpiCard } from './ui/KpiCard';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import type { Company, ProlaboreManualEntry } from '../types';

// A categoria pode ter sido gravada de formas diferentes: o RH grava
// 'Pró-labore' (com acento/hífen) ao enviar a folha ao financeiro
// (remuneracaoSocietariaService.sendPayrollToFinancial); no Extrato Bancário,
// o usuário costuma classificar manualmente como 'Prolabore' (sem acento/hífen).
// Casa as duas formas em vez de depender de um valor único.
const PROLABORE_ILIKE_PATTERNS = ['%prolabore%', '%pró-labore%'];

interface ProlaboreRow {
    id: string;
    source: 'bank' | 'internal' | 'manual';
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

// Lançamento manual (prolabore_manual_entries) é sempre contado como "aprovado" —
// quem digita já está confirmando o valor; a ação disponível é excluir, não aprovar.
function isApproved(row: ProlaboreRow): boolean {
    if (row.source === 'manual') return true;
    return row.source === 'internal' ? row.approval_status === 'APROVADO' : !!row.prolabore_approved_at;
}

function manualEntryToRow(e: ProlaboreManualEntry): ProlaboreRow {
    return {
        id: e.id, source: 'manual', transaction_date: e.competence_month, amount: e.amount,
        description: e.description || 'Ajuste manual', category: 'Ajuste manual',
    };
}

function rowKey(row: ProlaboreRow): string {
    return `${row.source}:${row.id}`;
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

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    description: 220, party: 160, category: 140, date: 130, amount: 130, approval: 142, actions: 160,
};

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
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [bulkApproving, setBulkApproving] = useState(false);
    const [manualEntries, setManualEntries] = useState<ProlaboreManualEntry[]>([]);
    const [manualDescription, setManualDescription] = useState('');
    const [manualAmount, setManualAmount] = useState('');
    const [addingManual, setAddingManual] = useState(false);
    const [searchTerm, setSearchTerm] = usePersistedState<string>('prolaboreReconciliation:search', '');

    const tableColumns = useTableColumns(COLUMNS, 'prolaboreReconciliationColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'prolaboreReconciliationColWidths');
    // Largura total = soma exata das colunas visíveis + checkbox fixo de 40px. NUNCA
    // w-full/100% junto com table-layout:fixed (§6.1).
    const tableTotalWidth = 40
        + (['description', 'party', 'category', 'date', 'amount', 'approval'] as const)
            .reduce((sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0), 0)
        + cols.getWidth('actions');

    // Em "Todas as organizações" (organizationId vazio), a empresa selecionada
    // no seletor abaixo é quem define o escopo efetivo — mesmo padrão do resto
    // do app (ver feedback_todas_organizacoes_nao_esconder).
    const selectedCompany = companies.find(c => c.id === companyId);
    const effectiveOrganizationId = organizationId || selectedCompany?.org_id || '';

    useEffect(() => {
        companyService.list(organizationId || undefined).then(list => {
            setCompanies(list);
            if (list.length > 0 && !companyId) setCompanyId(list[0].id);
        }).catch(() => {});
    }, [organizationId]);

    const loadTransactions = useCallback(async () => {
        if (!effectiveOrganizationId) return;
        setLoading(true);
        try {
            const { start, end } = monthRange(competenceMonth);
            const orFilter = PROLABORE_ILIKE_PATTERNS.map(p => `category.ilike.${p}`).join(',');

            const [internalRes, bankRes] = await Promise.all([
                supabase
                    .from('internal_transactions')
                    .select('id, transaction_date, amount, description, category, party_name, approval_status')
                    .eq('organization_id', effectiveOrganizationId)
                    .or(orFilter)
                    .gte('transaction_date', start)
                    .lte('transaction_date', end),
                supabase
                    .from('bank_transactions')
                    .select('id, transaction_date, amount, description_raw, description_normalized, counterparty_name, category, status, prolabore_approved_at, prolabore_approved_by')
                    .eq('organization_id', effectiveOrganizationId)
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
    }, [effectiveOrganizationId, competenceMonth]);

    useEffect(() => { loadTransactions(); }, [loadTransactions]);

    const loadManualEntries = useCallback(async () => {
        if (!companyId || !competenceMonth) { setManualEntries([]); return; }
        try {
            setManualEntries(await remuneracaoSocietariaService.listManualEntries(companyId, competenceMonth));
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erro ao carregar lançamentos manuais', 'error');
        }
    }, [companyId, competenceMonth]);

    useEffect(() => { loadManualEntries(); }, [loadManualEntries]);

    useEffect(() => {
        if (!effectiveOrganizationId || !competenceMonth) { setPeriodLocked(null); return; }
        financialCloseService.isClosed(effectiveOrganizationId, competenceMonth).then(setPeriodLocked).catch(() => setPeriodLocked(null));
    }, [effectiveOrganizationId, competenceMonth]);

    useEffect(() => {
        if (!companyId || !competenceMonth) { setReconciledInfo(null); return; }
        remuneracaoSocietariaService.getPayrollByCompetence(companyId, competenceMonth).then(p => {
            setReconciledInfo(p?.bank_reconciled_total != null
                ? { total: p.bank_reconciled_total, at: p.bank_reconciled_at || '', by: p.bank_reconciled_by_email || '' }
                : null);
        }).catch(() => setReconciledInfo(null));
    }, [companyId, competenceMonth]);

    // Une extrato/interno (rows) com os ajustes manuais — mesma base usada
    // para totais, ordenação e "Lançar total em RH".
    const allRows = useMemo(() => [...rows, ...manualEntries.map(manualEntryToRow)], [rows, manualEntries]);

    const totals = useMemo(() => {
        const pendente = allRows.filter(r => !isApproved(r)).reduce((s, r) => s + r.amount, 0);
        const aprovado = allRows.filter(isApproved).reduce((s, r) => s + r.amount, 0);
        return { pendente, aprovado, total: pendente + aprovado, count: allRows.length };
    }, [allRows]);

    const searchedRows = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return allRows;
        return allRows.filter(r =>
            (r.description || '').toLowerCase().includes(term) ||
            (r.party_name || '').toLowerCase().includes(term) ||
            (r.category || '').toLowerCase().includes(term)
        );
    }, [allRows, searchTerm]);

    const sortedRows = useMemo(() => {
        const arr = [...searchedRows];
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
    }, [searchedRows, tableColumns.sortColumn, tableColumns.sortDirection]);

    /** Aprova um único lançamento sem toast/reload — reusado pela aprovação individual e em lote. */
    const approveOne = async (row: ProlaboreRow, approvedBy: string): Promise<void> => {
        if (row.source === 'internal') {
            const cfg = await financialApprovalService.resolveRequiredLevels(effectiveOrganizationId, row.amount);
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
    };

    const handleApprove = async (row: ProlaboreRow) => {
        setActingId(row.id);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            await approveOne(row, user?.email || 'sistema');
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

    const handleAddManualEntry = async () => {
        const amount = parseFloat(manualAmount.replace(',', '.'));
        if (!companyId) { showToast('Selecione a empresa.', 'error'); return; }
        if (!amount || isNaN(amount) || amount <= 0) { showToast('Informe um valor válido.', 'error'); return; }
        setAddingManual(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            await remuneracaoSocietariaService.addManualEntry({
                organizationId: effectiveOrganizationId, companyId, competenceMonth, amount,
                description: manualDescription || undefined,
                createdByEmail: user?.email || 'sistema',
            });
            setManualDescription('');
            setManualAmount('');
            showToast('Lançamento manual adicionado.');
            await loadManualEntries();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erro ao adicionar lançamento manual', 'error');
        } finally {
            setAddingManual(false);
        }
    };

    const handleDeleteManualEntry = async (row: ProlaboreRow) => {
        if (!await confirm({ title: 'Excluir lançamento manual?', message: `${row.description || 'Ajuste manual'} — ${formatMoney(row.amount)}`, variant: 'danger', confirmLabel: 'Excluir' })) return;
        setActingId(row.id);
        try {
            await remuneracaoSocietariaService.deleteManualEntry(row.id);
            showToast('Lançamento manual excluído.');
            await loadManualEntries();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erro ao excluir lançamento manual', 'error');
        } finally {
            setActingId(null);
        }
    };

    // Só lançamentos ainda não aprovados fazem sentido na seleção em lote.
    const selectableRows = useMemo(() => sortedRows.filter(r => !isApproved(r)), [sortedRows]);
    const selectedRows = useMemo(() => selectableRows.filter(r => selectedKeys.has(rowKey(r))), [selectableRows, selectedKeys]);
    const allVisibleSelected = selectableRows.length > 0 && selectableRows.every(r => selectedKeys.has(rowKey(r)));

    const toggleRowSelection = (row: ProlaboreRow) => {
        setSelectedKeys(prev => {
            const next = new Set(prev);
            const key = rowKey(row);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const toggleAllVisible = () => {
        setSelectedKeys(prev => {
            if (allVisibleSelected) {
                const next = new Set(prev);
                selectableRows.forEach(r => next.delete(rowKey(r)));
                return next;
            }
            const next = new Set(prev);
            selectableRows.forEach(r => next.add(rowKey(r)));
            return next;
        });
    };

    const handleBulkApprove = async () => {
        if (selectedRows.length === 0) return;
        if (!await confirm({
            title: `Aprovar ${selectedRows.length} lançamento${selectedRows.length !== 1 ? 's' : ''}?`,
            message: `Total selecionado: ${formatMoney(selectedRows.reduce((s, r) => s + r.amount, 0))}`,
            confirmLabel: 'Aprovar selecionados',
        })) return;
        setBulkApproving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const approvedBy = user?.email || 'sistema';
            const results = await Promise.allSettled(selectedRows.map(row => approveOne(row, approvedBy)));
            const failed = results.filter(r => r.status === 'rejected').length;
            const succeeded = results.length - failed;
            showToast(
                failed === 0 ? `${succeeded} lançamento${succeeded !== 1 ? 's' : ''} aprovado${succeeded !== 1 ? 's' : ''}.`
                    : `${succeeded} aprovado(s), ${failed} falharam.`,
                failed === 0 ? 'success' : 'error',
            );
            setSelectedKeys(new Set());
            await loadTransactions();
        } finally {
            setBulkApproving(false);
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
            if (periodLocked) await financialCloseService.reopenPeriod(effectiveOrganizationId, y, m);
            else await financialCloseService.closePeriod(effectiveOrganizationId, y, m);
            setPeriodLocked(await financialCloseService.isClosed(effectiveOrganizationId, competenceMonth));
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
                effectiveOrganizationId, companyId, competenceMonth, totals.aprovado, user?.email || 'sistema',
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
                    {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                        Duplo clique no divisor segue "restaurar padrão". */}
                    <button
                        onClick={() => cols.autoFit()}
                        className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                        title="Ajustar largura das colunas ao conteúdo"
                    >
                        <MoveHorizontal className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Lançamento manual — soma ao total (banco + manual) quando esse total vira a base de cálculo em RH */}
            <div className="flex flex-col md:flex-row gap-2.5 items-center flex-wrap px-4 py-3 bg-white border border-gray-100 rounded-[10px]">
                <PencilLine className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-500 font-medium whitespace-nowrap">Adicionar lançamento manual</span>
                <input type="text" value={manualDescription} onChange={e => setManualDescription(e.target.value)}
                    placeholder="Descrição (opcional)"
                    className="flex-1 min-w-[160px] h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                <input type="number" min="0" step="0.01" value={manualAmount} onChange={e => setManualAmount(e.target.value)}
                    placeholder="Valor (R$)"
                    className="w-32 h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                <button onClick={handleAddManualEntry} disabled={addingManual}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-gray-900 text-white hover:bg-black transition-all active:scale-95 disabled:opacity-50">
                    {addingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Adicionar
                </button>
            </div>

            {reconciledInfo && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-[10px] text-sm text-blue-800">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Total já lançado em RH: <strong>{formatMoney(reconciledInfo.total)}</strong>
                    {reconciledInfo.at && <span className="text-blue-600">— {formatDateBR(reconciledInfo.at)} por {reconciledInfo.by}</span>}
                </div>
            )}

            {/* Tabela — guia §6/§7, toolbar de busca acoplada (§5.2) */}
            <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por descrição, contraparte ou categoria..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                title="Limpar busca"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto">
                <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                    <colgroup>
                        <col style={{ width: '40px' }} /> {/* checkbox */}
                        {tableColumns.visibleColumns.includes('description') && <col data-col-key="description" style={{ width: `${cols.getWidth('description')}px` }} />}
                        {tableColumns.visibleColumns.includes('party') && <col data-col-key="party" style={{ width: `${cols.getWidth('party')}px` }} />}
                        {tableColumns.visibleColumns.includes('category') && <col data-col-key="category" style={{ width: `${cols.getWidth('category')}px` }} />}
                        {tableColumns.visibleColumns.includes('date') && <col data-col-key="date" style={{ width: `${cols.getWidth('date')}px` }} />}
                        {tableColumns.visibleColumns.includes('amount') && <col data-col-key="amount" style={{ width: `${cols.getWidth('amount')}px` }} />}
                        {tableColumns.visibleColumns.includes('approval') && <col data-col-key="approval" style={{ width: `${cols.getWidth('approval')}px` }} />}
                        {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                            borda de "Ações" não andar a cada redimensionamento. */}
                        <col />
                        {tableColumns.visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
                    </colgroup>
                    <thead>
                        <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                            <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                    checked={allVisibleSelected}
                                    disabled={selectableRows.length === 0}
                                    onChange={toggleAllVisible}
                                />
                            </th>
                            {tableColumns.visibleColumns.includes('description') && (
                                <SortableHeader colKey="description" label="Descrição" uppercase={false}
                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <cols.ResizeHandle colKey="description" />
                                </SortableHeader>
                            )}
                            {tableColumns.visibleColumns.includes('party') && (
                                <SortableHeader colKey="party" label="Contraparte" uppercase={false}
                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <cols.ResizeHandle colKey="party" />
                                </SortableHeader>
                            )}
                            {tableColumns.visibleColumns.includes('category') && (
                                <SortableHeader colKey="category" label="Categoria" uppercase={false}
                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <cols.ResizeHandle colKey="category" />
                                </SortableHeader>
                            )}
                            {tableColumns.visibleColumns.includes('date') && (
                                <SortableHeader colKey="date" label="Data" uppercase={false}
                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <cols.ResizeHandle colKey="date" />
                                </SortableHeader>
                            )}
                            {tableColumns.visibleColumns.includes('amount') && (
                                <SortableHeader colKey="amount" label="Valor" uppercase={false}
                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <cols.ResizeHandle colKey="amount" />
                                </SortableHeader>
                            )}
                            {tableColumns.visibleColumns.includes('approval') && (
                                <SortableHeader colKey="approval" label="Aprovação" uppercase={false}
                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                                    className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                                    <cols.ResizeHandle colKey="approval" />
                                </SortableHeader>
                            )}
                            {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                            <th aria-hidden="true" className="border-r border-gray-100" />
                            {tableColumns.visibleColumns.includes('actions') && (
                                <th className="px-6 py-2 text-right relative overflow-hidden text-sm font-semibold text-gray-500">
                                    Ações
                                    <cols.ResizeHandle colKey="actions" />
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={tableColumns.visibleColumns.length + 2} className="text-center py-12 text-gray-400">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                            </td></tr>
                        ) : sortedRows.length === 0 ? (
                            <tr><td colSpan={tableColumns.visibleColumns.length + 2} className="text-center py-12">
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
                                <tr key={rowKey(row)} className={`hover:bg-blue-50/50 transition-colors ${selectedKeys.has(rowKey(row)) ? 'bg-blue-50/60' : ''}`}>
                                    <td className="px-4 py-2.5 border-r border-gray-100 text-center">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                            checked={selectedKeys.has(rowKey(row))}
                                            disabled={approved}
                                            onChange={() => toggleRowSelection(row)}
                                        />
                                    </td>
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
                                    {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                    <td aria-hidden="true" className="border-r border-gray-100"></td>
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {row.source === 'manual' ? (
                                                    <ActionIconButton
                                                        kind="delete"
                                                        disabled={actingId === row.id}
                                                        title="Excluir lançamento manual"
                                                        icon={actingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                                                        onClick={() => handleDeleteManualEntry(row)}
                                                    />
                                                ) : row.source === 'internal' ? (
                                                    <>
                                                        {row.approval_status !== 'APROVADO' && (
                                                            <ActionIconButton
                                                                kind="edit"
                                                                title="Aprovar"
                                                                disabled={actingId === row.id}
                                                                icon={actingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                                onClick={() => handleApprove(row)}
                                                            />
                                                        )}
                                                        {row.approval_status !== 'REJEITADO' && (
                                                            <ActionIconButton
                                                                kind="delete"
                                                                title="Rejeitar"
                                                                disabled={actingId === row.id}
                                                                icon={<X className="w-4 h-4" />}
                                                                onClick={() => handleReject(row)}
                                                            />
                                                        )}
                                                    </>
                                                ) : approved ? (
                                                    <ActionIconButton
                                                        kind="edit"
                                                        tone="attention"
                                                        title="Desfazer aprovação"
                                                        disabled={actingId === row.id}
                                                        icon={actingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                                                        onClick={() => handleUndoBankApproval(row)}
                                                    />
                                                ) : (
                                                    <ActionIconButton
                                                        kind="edit"
                                                        title="Aprovar"
                                                        disabled={actingId === row.id}
                                                        icon={actingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                        onClick={() => handleApprove(row)}
                                                    />
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
            </div>

            {/* Barra de ações em lote — guia §10, fixa no rodapé, fora do fluxo normal */}
            {selectedRows.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                    <span className="flex-1 text-sm font-bold whitespace-nowrap">
                        {selectedRows.length} selecionado{selectedRows.length !== 1 ? 's' : ''}
                        <span className="ml-2 font-normal opacity-75">· {formatMoney(selectedRows.reduce((s, r) => s + r.amount, 0))}</span>
                    </span>
                    <button onClick={() => setSelectedKeys(new Set())} disabled={bulkApproving}
                        className="px-3 py-2 rounded-xl text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50">
                        Limpar
                    </button>
                    <button onClick={handleBulkApprove} disabled={bulkApproving}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-white text-blue-700 hover:bg-blue-50 transition-all active:scale-95 disabled:opacity-50">
                        {bulkApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Aprovar selecionados
                    </button>
                </div>
            )}

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
