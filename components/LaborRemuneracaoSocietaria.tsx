import React, { useState, useEffect, useCallback } from 'react';
import {
    Banknote, Building2, Loader2, AlertCircle, Users, Calculator,
    Check, Send, Save, X, Crown, TrendingUp, Paperclip, Plus, FileText,
    Lock, Unlock, RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { companyService } from '../services/companyService';
import { remuneracaoSocietariaService } from '../services/remuneracaoSocietariaService';
import { financialCloseService } from '../services/financialCloseService';
import { useConfirm } from './ui/confirm';
import {
    Company, CompanyPartner,
    PartnerCompensationSettings, ProlaborePayroll, ProlaborePayrollItem,
    PROLABORE_STATUS_LABELS,
    ProfitDistributionBatch, ProfitDistributionItem,
    PROFIT_BATCH_STATUS_LABELS, DIVIDEND_MONTHLY_THRESHOLD_PF,
} from '../types';
import Button from './ui/Button';
import LaborScopeBar from './LaborScopeBar';

interface Props {
    orgId: string | null;
    organizations: Array<{ id: string; name: string }>;
    onRefresh: () => void;
}

type SubTab = 'socios' | 'prolabore' | 'dividendos';

const cls = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

function currentMonthISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function parseYearMonth(dateStr: string): { year: number; month: number } {
    const [y, m] = dateStr.split('-').map(Number);
    return { year: y, month: m };
}

const LaborRemuneracaoSocietaria: React.FC<Props> = ({ orgId, organizations, onRefresh }) => {
    const confirm = useConfirm();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [companyId, setCompanyId] = useState<string>('');
    const [subTab, setSubTab] = useState<SubTab>('socios');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [partners, setPartners] = useState<CompanyPartner[]>([]);
    const [settingsByPartner, setSettingsByPartner] = useState<Record<string, PartnerCompensationSettings>>({});
    const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{ has_prolabore: boolean; prolabore_amount: string; payment_day: string }>({
        has_prolabore: false, prolabore_amount: '', payment_day: '5',
    });
    const [saving, setSaving] = useState(false);

    const [competenceMonth, setCompetenceMonth] = useState(currentMonthISO());
    const [payroll, setPayroll] = useState<ProlaborePayroll | null>(null);
    const [payrollItems, setPayrollItems] = useState<ProlaborePayrollItem[]>([]);
    const [calculating, setCalculating] = useState(false);
    const [calcInfo, setCalcInfo] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncInfo, setSyncInfo] = useState<string | null>(null);
    const [manualEntriesTotal, setManualEntriesTotal] = useState(0);

    const [batches, setBatches] = useState<ProfitDistributionBatch[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    const [batchItems, setBatchItems] = useState<ProfitDistributionItem[]>([]);
    const [showNewBatchForm, setShowNewBatchForm] = useState(false);
    const [newBatchForm, setNewBatchForm] = useState({
        periodStart: '', periodEnd: '', accountingProfitAmount: '', availableProfitAmount: '', proposedAmount: '',
    });
    const [creatingBatch, setCreatingBatch] = useState(false);
    const [uploadingAta, setUploadingAta] = useState(false);
    const [savingAnexoIV, setSavingAnexoIV] = useState(false);

    // Trava de período (Fechamento Mensal) — atalho para reabrir/fechar o mês
    // específico sendo trabalhado neste módulo, sem sair para o Financeiro.
    // O fechamento GERAL (com checklist de pendências) continua só no
    // Financeiro > Conciliação Bancária > aba Fechamento.
    const [periodLocked, setPeriodLocked] = useState<boolean | null>(null);
    const [periodActing, setPeriodActing] = useState(false);

    useEffect(() => {
        companyService.list(orgId).then(list => {
            setCompanies(list);
            if (list.length > 0 && !companyId) setCompanyId(list[0].id);
        }).catch(e => setError(e.message));
    }, [orgId]);

    // Toda operação desta aba (pró-labore, distribuição de lucro, fechamento de
    // período) grava e é por organização. Em "Todas as organizações" a empresa
    // escolhida aqui já determina a org — mesma herança empresa→org do seletor
    // do topo (REGRA #5). Só fica sem org se nenhuma empresa estiver escolhida.
    const effectiveOrgId = orgId ?? companies.find(c => c.id === companyId)?.org_id ?? null;
    const exigirOrg = (): string | null => {
        if (!effectiveOrgId) setError('Selecione uma empresa (ou uma organização específica no topo) para esta operação.');
        return effectiveOrgId;
    };

    const loadSocios = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        setError(null);
        try {
            const [partnerList, settingsList] = await Promise.all([
                remuneracaoSocietariaService.listEligiblePartners(companyId),
                remuneracaoSocietariaService.listCompensationSettings(companyId),
            ]);
            setPartners(partnerList);
            const map: Record<string, PartnerCompensationSettings> = {};
            settingsList.forEach(s => { map[s.partner_id] = s; });
            setSettingsByPartner(map);
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    const loadPayroll = useCallback(async () => {
        if (!companyId) return;
        const org = exigirOrg();
        if (!org) return;
        setLoading(true);
        setError(null);
        setCalcInfo(null);
        try {
            const p = await remuneracaoSocietariaService.getOrCreatePayroll(org, companyId, competenceMonth);
            setPayroll(p);
            const items = await remuneracaoSocietariaService.listPayrollItems(p.id);
            setPayrollItems(items);
            const manualEntries = await remuneracaoSocietariaService.listManualEntries(companyId, competenceMonth);
            setManualEntriesTotal(manualEntries.reduce((s, e) => s + e.amount, 0));
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [companyId, competenceMonth, effectiveOrgId]);

    const loadBatches = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        setError(null);
        try {
            const list = await remuneracaoSocietariaService.listProfitBatches(companyId);
            setBatches(list);
            if (list.length > 0) {
                setSelectedBatchId(prev => (prev && list.some(b => b.id === prev)) ? prev : list[0].id);
            } else {
                setSelectedBatchId(null);
                setBatchItems([]);
            }
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => {
        if (subTab === 'socios') loadSocios();
        else if (subTab === 'prolabore') loadPayroll();
        else loadBatches();
    }, [subTab, loadSocios, loadPayroll, loadBatches]);

    const refreshPeriodLock = useCallback(async (dateStr: string) => {
        if (!orgId || !dateStr) { setPeriodLocked(null); return; }
        try {
            setPeriodLocked(await financialCloseService.isClosed(orgId, dateStr));
        } catch {
            setPeriodLocked(null);
        }
    }, [orgId]);

    useEffect(() => {
        if (subTab === 'prolabore') refreshPeriodLock(competenceMonth);
    }, [subTab, competenceMonth, refreshPeriodLock]);

    const selectedBatch = batches.find(b => b.id === selectedBatchId) || null;

    const selectedBatchRefDate = selectedBatch
        ? (selectedBatch.payment_date || selectedBatch.approval_date || selectedBatch.profit_period_end)
        : null;

    useEffect(() => {
        if (subTab === 'dividendos' && selectedBatchRefDate) refreshPeriodLock(selectedBatchRefDate);
        else if (subTab === 'dividendos' && !selectedBatchRefDate) setPeriodLocked(null);
    }, [subTab, selectedBatchRefDate, refreshPeriodLock]);

    const handleTogglePeriodLock = async (dateStr: string) => {
        const org = exigirOrg();
        if (!org) return;
        const { year, month } = parseYearMonth(dateStr);
        const MONTHS_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const label = `${MONTHS_FULL[month - 1]}/${year}`;
        if (periodLocked) {
            if (!await confirm({ title: `Reabrir ${label}?`, message: 'O período volta a aceitar lançamentos. A ação fica registrada no Fechamento Mensal.', variant: 'warning', confirmLabel: 'Reabrir' })) return;
        } else {
            if (!await confirm({ title: `Fechar ${label}?`, message: 'Lançamentos deste mês ficarão bloqueados para edição em todo o Financeiro (não só na Remuneração Societária).', variant: 'default', confirmLabel: 'Fechar período' })) return;
        }
        setPeriodActing(true);
        setError(null);
        try {
            if (periodLocked) await financialCloseService.reopenPeriod(org, year, month);
            else await financialCloseService.closePeriod(org, year, month);
            await refreshPeriodLock(dateStr);
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setPeriodActing(false);
        }
    };

    useEffect(() => {
        if (!selectedBatchId) return;
        remuneracaoSocietariaService.listBatchItems(selectedBatchId)
            .then(setBatchItems)
            .catch(e => setError(e.message));
    }, [selectedBatchId]);

    const handleCreateBatch = async () => {
        const org = exigirOrg();
        if (!org) return;
        setError(null);
        const available = parseFloat(newBatchForm.availableProfitAmount);
        const proposed = parseFloat(newBatchForm.proposedAmount);
        if (!newBatchForm.periodStart || !newBatchForm.periodEnd || isNaN(available) || isNaN(proposed)) {
            setError('Preencha período, lucro disponível e valor proposto.');
            return;
        }
        setCreatingBatch(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { batch } = await remuneracaoSocietariaService.createProfitBatch({
                organizationId: org,
                companyId,
                periodStart: newBatchForm.periodStart,
                periodEnd: newBatchForm.periodEnd,
                accountingProfitAmount: newBatchForm.accountingProfitAmount ? parseFloat(newBatchForm.accountingProfitAmount) : undefined,
                availableProfitAmount: available,
                proposedAmount: proposed,
                createdByEmail: user?.email || 'desconhecido',
            });
            setShowNewBatchForm(false);
            setNewBatchForm({ periodStart: '', periodEnd: '', accountingProfitAmount: '', availableProfitAmount: '', proposedAmount: '' });
            await loadBatches();
            setSelectedBatchId(batch.id);
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setCreatingBatch(false);
        }
    };

    const handleUploadAta = async (file: File) => {
        if (!selectedBatch) return;
        setUploadingAta(true);
        setError(null);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            await remuneracaoSocietariaService.attachBatchDocument(selectedBatch, file, user?.email || 'desconhecido');
            await loadBatches();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setUploadingAta(false);
        }
    };

    const handleApproveBatch = async () => {
        if (!selectedBatch) return;
        if (!await confirm({ title: 'Aprovar distribuição de lucros?', message: `Período ${selectedBatch.profit_period_start} a ${selectedBatch.profit_period_end} — ${batchItems.length} sócio(s).`, variant: 'default' })) return;
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            await remuneracaoSocietariaService.approveProfitBatch(selectedBatch.id, user?.email || 'desconhecido');
            await loadBatches();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleSendBatchToFinancial = async () => {
        const org = exigirOrg();
        if (!org) return;
        if (!selectedBatch) return;
        if (!await confirm({ title: 'Enviar ao financeiro?', message: 'Gera um lançamento (contas a pagar) por sócio, com a retenção já calculada.', variant: 'default' })) return;
        setSaving(true);
        try {
            await remuneracaoSocietariaService.sendProfitBatchToFinancial(org, selectedBatch, batchItems);
            await loadBatches();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    /**
     * Backfill: itens enviados ao financeiro ANTES da integração com `invoices`
     * (versões antigas do código só gravavam internal_transactions) ficam sem
     * título em Contas a Pagar. Este botão gera o título retroativamente —
     * idempotente, não duplica se o título já existir.
     */
    const handleSyncPayrollInvoices = async () => {
        const org = exigirOrg();
        if (!org) return;
        if (!payroll) return;
        setSyncing(true);
        setError(null);
        setSyncInfo(null);
        try {
            const created = await remuneracaoSocietariaService.syncPayrollInvoices(org, payroll, payrollItems);
            setSyncInfo(created > 0
                ? `${created} título(s) criado(s) em Contas a Pagar.`
                : 'Todos os itens já têm título em Contas a Pagar.');
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSyncing(false);
        }
    };

    const handleSyncBatchInvoices = async () => {
        const org = exigirOrg();
        if (!org) return;
        if (!selectedBatch) return;
        setSyncing(true);
        setError(null);
        setSyncInfo(null);
        try {
            const created = await remuneracaoSocietariaService.syncProfitBatchInvoices(org, selectedBatch, batchItems);
            setSyncInfo(created > 0
                ? `${created} título(s) criado(s) em Contas a Pagar.`
                : 'Todos os itens já têm título em Contas a Pagar.');
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSyncing(false);
        }
    };

    const openEditRegime = (p: CompanyPartner) => {
        const s = settingsByPartner[p.id];
        setEditingPartnerId(p.id);
        setEditForm({
            has_prolabore: s?.has_prolabore ?? false,
            prolabore_amount: s?.prolabore_amount != null ? String(s.prolabore_amount) : '',
            payment_day: s?.payment_day != null ? String(s.payment_day) : '5',
        });
    };

    const saveRegime = async (partner: CompanyPartner) => {
        const org = exigirOrg();
        if (!org) return;
        setSaving(true);
        setError(null);
        try {
            const existing = settingsByPartner[partner.id];
            await remuneracaoSocietariaService.saveCompensationSettings({
                id: existing?.id,
                organization_id: org,
                company_id: companyId,
                partner_id: partner.id,
                has_prolabore: editForm.has_prolabore,
                prolabore_amount: editForm.prolabore_amount ? parseFloat(editForm.prolabore_amount) : undefined,
                payment_day: editForm.payment_day ? parseInt(editForm.payment_day, 10) : undefined,
            });
            setEditingPartnerId(null);
            await loadSocios();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleCalculate = async () => {
        setError(null);
        setCalcInfo(null);
        if (!companyId) { setError('Selecione uma empresa antes de calcular a folha.'); return; }
        if (!payroll) { setError('A folha da competência ainda não foi carregada. Aguarde o carregamento ou troque a competência para tentar novamente.'); return; }
        setCalculating(true);
        try {
            const settingsList = await remuneracaoSocietariaService.listCompensationSettings(companyId);
            // "Valor mensal" só é obrigatório quando a competência ainda não tem total
            // conciliado no banco — com bank_reconciled_total, o serviço usa esse valor
            // real como base, mesmo que o valor mensal esteja zerado/não preenchido.
            const hasBankBase = payroll?.bank_reconciled_total != null;
            const active = settingsList.filter(s => s.has_prolabore && (hasBankBase || (s.prolabore_amount && s.prolabore_amount > 0)));
            if (active.length === 0) {
                setCalcInfo(hasBankBase
                    ? 'Nenhum sócio está marcado como "Recebe pró-labore". Vá na aba "Sócios", clique em Configurar e marque a opção.'
                    : 'Nenhum sócio está configurado para receber pró-labore. Vá na aba "Sócios", clique em Configurar e marque "Recebe pró-labore" com um valor mensal.');
                setCalculating(false);
                return;
            }
            const items = await remuneracaoSocietariaService.recalculatePayroll(payroll, settingsList);
            setPayrollItems(items);
            const refreshed = await supabase.from('prolabore_payrolls').select('*').eq('id', payroll.id).single();
            if (refreshed.data) setPayroll(refreshed.data as ProlaborePayroll);
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setCalculating(false);
        }
    };

    const handleApprove = async () => {
        if (!payroll) { setError('A folha ainda não foi carregada.'); return; }
        if (!await confirm({ title: 'Aprovar folha de pró-labore?', message: `Competência ${competenceMonth.slice(0, 7)} — ${payrollItems.length} sócio(s).`, variant: 'default' })) return;
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            await remuneracaoSocietariaService.approvePayroll(payroll.id, user?.email || 'desconhecido');
            await loadPayroll();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleSendToFinancial = async () => {
        const org = exigirOrg();
        if (!org) return;
        if (!payroll) { setError('A folha ainda não foi carregada.'); return; }
        if (!await confirm({ title: 'Enviar ao financeiro?', message: 'Gera um lançamento (contas a pagar) por sócio.', variant: 'default' })) return;
        setSaving(true);
        try {
            await remuneracaoSocietariaService.sendPayrollToFinancial(org, payroll, payrollItems);
            await loadPayroll();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const selectedCompany = companies.find(c => c.id === companyId) || null;

    const handleToggleAnexoIV = async (checked: boolean) => {
        if (!selectedCompany) return;
        setSavingAnexoIV(true);
        setError(null);
        try {
            await companyService.update(selectedCompany.id, { simples_anexo_iv: checked });
            setCompanies(prev => prev.map(c => c.id === selectedCompany.id ? { ...c, simples_anexo_iv: checked } : c));
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSavingAnexoIV(false);
        }
    };

    const BRL = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="space-y-6">
            {/* 1. Título */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Remuneração Societária</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Pró-labore, distribuição de lucros e dividendos de sócios-administradores.</p>
            </div>

            <LaborScopeBar
                onRefresh={onRefresh}
            />

            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <select value={companyId} onChange={e => setCompanyId(e.target.value)}
                        className="text-form-input font-bold text-slate-600 outline-none bg-transparent min-w-[180px]">
                        {companies.map(c => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex items-center gap-2 border-b border-slate-100">
                <button onClick={() => setSubTab('socios')}
                    className={`px-4 py-2 text-sm font-black uppercase tracking-wide border-b-2 transition-all ${subTab === 'socios' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                    <Users className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" /> Sócios
                </button>
                <button onClick={() => setSubTab('prolabore')}
                    className={`px-4 py-2 text-sm font-black uppercase tracking-wide border-b-2 transition-all ${subTab === 'prolabore' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                    <Calculator className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" /> Pró-labore
                </button>
                <button onClick={() => setSubTab('dividendos')}
                    className={`px-4 py-2 text-sm font-black uppercase tracking-wide border-b-2 transition-all ${subTab === 'dividendos' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                    <TrendingUp className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" /> Lucros e Dividendos
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
            )}

            {calcInfo && subTab === 'prolabore' && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {calcInfo}
                </div>
            )}

            {syncInfo && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
                    <Check className="w-4 h-4 flex-shrink-0" /> {syncInfo}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : subTab === 'socios' ? (
                <div className="space-y-2">
                    {selectedCompany?.regime_tributario === 'simples' && (
                        <label className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 cursor-pointer">
                            <input type="checkbox" checked={!!selectedCompany.simples_anexo_iv} disabled={savingAnexoIV}
                                onChange={e => handleToggleAnexoIV(e.target.checked)} />
                            Empresa é Simples Nacional <strong>Anexo IV</strong> (advocacia, limpeza, segurança, construção civil, decoração) — recolhe Cota Patronal (20%) à parte, não é isenta
                        </label>
                    )}
                    {partners.length === 0 && (
                        <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                            <Users className="w-8 h-8 opacity-30" />
                            <p className="text-sm font-medium">Nenhum sócio ativo cadastrado para esta empresa.</p>
                        </div>
                    )}
                    {partners.map(p => {
                        const s = settingsByPartner[p.id];
                        const isEditing = editingPartnerId === p.id;
                        return (
                            <div key={p.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                                <div className="flex items-center gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-black text-gray-900 text-sm">{p.nome}</span>
                                            {p.is_administrador && (
                                                <span className="flex items-center gap-1 text-sm font-normal text-amber-700">
                                                    <Crown className="w-3 h-3" /> Admin
                                                </span>
                                            )}
                                            <span className="text-xs text-gray-400">{p.participacao_pct.toFixed(2)}%</span>
                                        </div>
                                        {!isEditing && (
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {s?.has_prolabore
                                                    ? `Pró-labore: ${BRL(s.prolabore_amount || 0)} • dia ${s.payment_day ?? '-'}`
                                                    : 'Sem pró-labore configurado'}
                                            </p>
                                        )}
                                    </div>
                                    {!isEditing ? (
                                        <Button onClick={() => openEditRegime(p)} className="gap-1.5">Configurar</Button>
                                    ) : (
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => saveRegime(p)} disabled={saving}
                                                className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg">
                                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                            </button>
                                            <button onClick={() => setEditingPartnerId(null)}
                                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {isEditing && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
                                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                            <input type="checkbox" checked={editForm.has_prolabore}
                                                onChange={e => setEditForm(f => ({ ...f, has_prolabore: e.target.checked }))} />
                                            Recebe pró-labore
                                        </label>
                                        <div>
                                            <label className="block text-form-label font-black uppercase tracking-widest text-gray-500 mb-1">Valor mensal (R$)</label>
                                            <input type="number" min="0" step="0.01" className={cls}
                                                value={editForm.prolabore_amount}
                                                onChange={e => setEditForm(f => ({ ...f, prolabore_amount: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="block text-form-label font-black uppercase tracking-widest text-gray-500 mb-1">Dia de pagamento</label>
                                            <input type="number" min="1" max="31" className={cls}
                                                value={editForm.payment_day}
                                                onChange={e => setEditForm(f => ({ ...f, payment_day: e.target.value }))} />
                                        </div>
                                        <p className="md:col-span-3 text-xs text-gray-400">
                                            Só é usado como base de cálculo se a competência ainda não tiver um total conciliado no banco (Financeiro &gt; Conciliação Bancária &gt; Pró-labore) — quando existir, o valor real do banco manda.
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : subTab === 'prolabore' ? (
                <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-black uppercase tracking-widest text-gray-500">Competência</label>
                            <input type="month" className={cls}
                                value={competenceMonth.slice(0, 7)}
                                onChange={e => setCompetenceMonth(`${e.target.value}-01`)} />
                        </div>
                        {payroll && (
                            <span className="text-sm font-normal text-gray-600">
                                {PROLABORE_STATUS_LABELS[payroll.status]}
                            </span>
                        )}
                        {payroll?.bank_reconciled_total != null && (
                            <span className="text-xs text-blue-700 font-medium" title="Registrado via Financeiro > Conciliação Bancária > Pró-labore — esta é a base usada no cálculo da folha (Bruto), não o Valor Mensal fixo da aba Sócios">
                                Base de cálculo: banco {BRL(payroll.bank_reconciled_total)}
                                {manualEntriesTotal !== 0 ? ` + manual ${BRL(manualEntriesTotal)} = ${BRL(payroll.bank_reconciled_total + manualEntriesTotal)}` : ''}
                                {payroll.bank_reconciled_at ? ` (conciliado em ${new Date(payroll.bank_reconciled_at).toLocaleString('pt-BR')})` : ''}
                            </span>
                        )}
                        {periodLocked !== null && (
                            <button onClick={() => handleTogglePeriodLock(competenceMonth)} disabled={periodActing}
                                title="Fecha/reabre o mês inteiro no Financeiro — afeta todos os lançamentos, não só a Remuneração Societária"
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-button font-black uppercase tracking-wide border transition-all disabled:opacity-50 ${
                                    periodLocked ? 'border-gray-800 bg-gray-900 text-white hover:bg-black' : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                }`}>
                                {periodActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : periodLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                {periodLocked ? 'Mês Fechado — Reabrir' : 'Mês Aberto — Fechar'}
                            </button>
                        )}
                        <div className="flex items-center gap-2">
                            {(!payroll || payroll.status === 'rascunho' || payroll.status === 'calculado') && (
                                <Button onClick={handleCalculate} disabled={calculating || loading} className="gap-1.5">
                                    {calculating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
                                    Calcular Folha
                                </Button>
                            )}
                            {payroll?.status === 'calculado' && payrollItems.length > 0 && (
                                <Button onClick={handleApprove} disabled={saving} className="gap-1.5">
                                    <Check className="w-3.5 h-3.5" /> Aprovar
                                </Button>
                            )}
                            {payroll?.status === 'aprovado' && (
                                <Button onClick={handleSendToFinancial} disabled={saving} className="gap-1.5">
                                    <Send className="w-3.5 h-3.5" /> Enviar ao Financeiro
                                </Button>
                            )}
                            {payroll && !['rascunho', 'calculado', 'aprovado'].includes(payroll.status) && (
                                <Button onClick={handleSyncPayrollInvoices} disabled={syncing} className="gap-1.5"
                                    title="Gera o título em Contas a Pagar para itens já pagos que ficaram sem título (ex.: enviados antes desta integração)">
                                    {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                    Sincronizar Contas a Pagar
                                </Button>
                            )}
                        </div>
                    </div>

                    {payrollItems.length === 0 ? (
                        <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                            <Calculator className="w-8 h-8 opacity-30" />
                            <p className="text-sm font-medium">Nenhum item calculado. Configure o pró-labore dos sócios na aba "Sócios" e clique em Calcular Folha.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">
                                        <th className="py-2">Sócio</th>
                                        <th className="py-2 text-right">Bruto</th>
                                        <th className="py-2 text-right">INSS (11%)</th>
                                        <th className="py-2 text-right">IRRF</th>
                                        <th className="py-2 text-right">Líquido</th>
                                        <th className="py-2 text-right">Cota Patronal</th>
                                        <th className="py-2 text-right">Contrib. Terceiros</th>
                                        <th className="py-2 text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payrollItems.map(i => (
                                        <tr key={i.id} className="border-b border-gray-50">
                                            <td className="py-2 font-normal text-gray-900">{i.partner_nome}</td>
                                            <td className="py-2 text-right">{BRL(i.gross_amount)}</td>
                                            <td className="py-2 text-right text-red-500">-{BRL(i.inss_amount)}</td>
                                            <td className="py-2 text-right text-red-500">-{BRL(i.irrf_amount)}</td>
                                            <td className="py-2 text-right font-medium text-emerald-600">{BRL(i.net_amount)}</td>
                                            <td className="py-2 text-right text-gray-400">{i.patronal_amount > 0 ? BRL(i.patronal_amount) : '—'}</td>
                                            <td className="py-2 text-right text-gray-400">{i.terceiros_amount > 0 ? BRL(i.terceiros_amount) : '—'}</td>
                                            <td className="py-2 text-right text-xs text-gray-400">{i.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                {payroll && (
                                    <tfoot>
                                        <tr className="font-black text-gray-900 border-t-2 border-gray-200">
                                            <td className="py-2">Total</td>
                                            <td className="py-2 text-right">{BRL(payroll.gross_total)}</td>
                                            <td className="py-2 text-right text-red-500">-{BRL(payroll.inss_total)}</td>
                                            <td className="py-2 text-right text-red-500">-{BRL(payroll.irrf_total)}</td>
                                            <td className="py-2 text-right text-emerald-600">{BRL(payroll.net_total)}</td>
                                            <td className="py-2 text-right text-gray-500">{payroll.patronal_total > 0 ? BRL(payroll.patronal_total) : '—'}</td>
                                            <td className="py-2 text-right text-gray-500">{payroll.terceiros_total > 0 ? BRL(payroll.terceiros_total) : '—'}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                            <p className="text-[10px] text-gray-400 mt-2">
                                Cota Patronal (20%) e Contribuições de Terceiros (Sistema S) são despesas da empresa — não reduzem o líquido do sócio. Não incidem se a empresa for optante do Simples Nacional.
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Lista de lotes */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-black uppercase tracking-widest text-gray-500">Distribuições</p>
                            <Button onClick={() => setShowNewBatchForm(v => !v)} className="gap-1.5">
                                <Plus className="w-3.5 h-3.5" /> Nova
                            </Button>
                        </div>

                        {showNewBatchForm && (
                            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
                                <div>
                                    <label className="block text-form-label font-black uppercase tracking-widest text-gray-500 mb-1">Período apurado — início</label>
                                    <input type="date" className={cls} value={newBatchForm.periodStart}
                                        onChange={e => setNewBatchForm(f => ({ ...f, periodStart: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="block text-form-label font-black uppercase tracking-widest text-gray-500 mb-1">Período apurado — fim</label>
                                    <input type="date" className={cls} value={newBatchForm.periodEnd}
                                        onChange={e => setNewBatchForm(f => ({ ...f, periodEnd: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="block text-form-label font-black uppercase tracking-widest text-gray-500 mb-1">Lucro contábil apurado (opcional)</label>
                                    <input type="number" min="0" step="0.01" className={cls} value={newBatchForm.accountingProfitAmount}
                                        onChange={e => setNewBatchForm(f => ({ ...f, accountingProfitAmount: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="block text-form-label font-black uppercase tracking-widest text-gray-500 mb-1">
                                        Lucro disponível (informado manualmente) *
                                    </label>
                                    <input type="number" min="0" step="0.01" className={cls} value={newBatchForm.availableProfitAmount}
                                        onChange={e => setNewBatchForm(f => ({ ...f, availableProfitAmount: e.target.value }))} />
                                    <p className="text-[10px] text-amber-600 mt-1">Não é apurado automaticamente pelo sistema — confira com a contabilidade e anexe o balancete como ata.</p>
                                </div>
                                <div>
                                    <label className="block text-form-label font-black uppercase tracking-widest text-gray-500 mb-1">Valor proposto para distribuição *</label>
                                    <input type="number" min="0" step="0.01" className={cls} value={newBatchForm.proposedAmount}
                                        onChange={e => setNewBatchForm(f => ({ ...f, proposedAmount: e.target.value }))} />
                                </div>
                                <div className="flex justify-end gap-2 pt-1 border-t border-gray-200">
                                    <button type="button" onClick={() => setShowNewBatchForm(false)}
                                        className="px-4 py-2 text-button font-black uppercase tracking-wide text-gray-500 hover:text-gray-700">
                                        Cancelar
                                    </button>
                                    <Button onClick={handleCreateBatch} disabled={creatingBatch} className="gap-1.5">
                                        {creatingBatch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                        Criar e Distribuir
                                    </Button>
                                </div>
                            </div>
                        )}

                        {batches.length === 0 && !showNewBatchForm && (
                            <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                                <TrendingUp className="w-8 h-8 opacity-30" />
                                <p className="text-sm font-medium text-center">Nenhuma distribuição registrada.</p>
                            </div>
                        )}

                        {batches.map(b => (
                            <button key={b.id} onClick={() => setSelectedBatchId(b.id)}
                                className={`w-full text-left bg-white border rounded-xl px-4 py-3 transition-all ${selectedBatchId === b.id ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-200 hover:border-gray-300'}`}>
                                <p className="text-sm font-black text-gray-900">
                                    {b.profit_period_start.slice(0, 7)} a {b.profit_period_end.slice(0, 7)}
                                </p>
                                <p className="text-xs text-gray-400">{BRL(b.proposed_amount)}</p>
                                <span className="inline-block mt-1 text-sm font-normal text-gray-600">
                                    {PROFIT_BATCH_STATUS_LABELS[b.status]}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Detalhe do lote selecionado */}
                    <div className="lg:col-span-2 space-y-4">
                        {!selectedBatch ? (
                            <div className="flex flex-col items-center py-16 text-gray-400 gap-2">
                                <TrendingUp className="w-8 h-8 opacity-30" />
                                <p className="text-sm font-medium">Selecione ou crie uma distribuição.</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between flex-wrap gap-3">
                                    <div>
                                        <p className="text-sm font-black text-gray-900">
                                            Lucro disponível: {BRL(selectedBatch.available_profit_amount)} • Proposto: {BRL(selectedBatch.proposed_amount)}
                                        </p>
                                        <span className="text-sm font-normal text-gray-600 inline-block mt-1">
                                            {PROFIT_BATCH_STATUS_LABELS[selectedBatch.status]}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {periodLocked !== null && selectedBatchRefDate && (
                                            <button onClick={() => handleTogglePeriodLock(selectedBatchRefDate)} disabled={periodActing}
                                                title="Fecha/reabre o mês inteiro no Financeiro — afeta todos os lançamentos, não só a Remuneração Societária"
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-button font-black uppercase tracking-wide border transition-all disabled:opacity-50 ${
                                                    periodLocked ? 'border-gray-800 bg-gray-900 text-white hover:bg-black' : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                                }`}>
                                                {periodActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : periodLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                                {periodLocked ? 'Mês Fechado — Reabrir' : 'Mês Aberto — Fechar'}
                                            </button>
                                        )}
                                        <label className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-button font-black uppercase tracking-wide cursor-pointer border ${selectedBatch.document_id ? 'border-emerald-200 text-emerald-600 bg-emerald-50' : 'border-amber-200 text-amber-600 bg-amber-50'}`}>
                                            {uploadingAta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : selectedBatch.document_id ? <FileText className="w-3.5 h-3.5" /> : <Paperclip className="w-3.5 h-3.5" />}
                                            {selectedBatch.document_id ? 'Ata Anexada' : 'Anexar Ata'}
                                            <input type="file" className="hidden" accept=".pdf,.doc,.docx,image/*"
                                                onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadAta(f); }} />
                                        </label>
                                        {selectedBatch.status === 'rascunho' && batchItems.length > 0 && (
                                            <Button onClick={handleApproveBatch} disabled={saving || !selectedBatch.document_id} className="gap-1.5"
                                                title={!selectedBatch.document_id ? 'Anexe a ata antes de aprovar' : ''}>
                                                <Check className="w-3.5 h-3.5" /> Aprovar
                                            </Button>
                                        )}
                                        {selectedBatch.status === 'aprovado' && (
                                            <Button onClick={handleSendBatchToFinancial} disabled={saving} className="gap-1.5">
                                                <Send className="w-3.5 h-3.5" /> Enviar ao Financeiro
                                            </Button>
                                        )}
                                        {!['rascunho', 'em_validacao_contabil', 'aguardando_aprovacao', 'aprovado'].includes(selectedBatch.status) && (
                                            <Button onClick={handleSyncBatchInvoices} disabled={syncing} className="gap-1.5"
                                                title="Gera o título em Contas a Pagar para itens já pagos que ficaram sem título (ex.: enviados antes desta integração)">
                                                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                                Sincronizar Contas a Pagar
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">
                                                <th className="py-2">Sócio</th>
                                                <th className="py-2 text-right">Participação</th>
                                                <th className="py-2 text-right">Bruto</th>
                                                <th className="py-2 text-right">Retenção (IRRF)</th>
                                                <th className="py-2 text-right">Líquido</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {batchItems.map(i => (
                                                <tr key={i.id} className="border-b border-gray-50">
                                                    <td className="py-2 font-normal text-gray-900">{i.partner_nome}</td>
                                                    <td className="py-2 text-right text-gray-400">{i.ownership_percentage.toFixed(2)}%</td>
                                                    <td className="py-2 text-right">{BRL(i.gross_amount)}</td>
                                                    <td className="py-2 text-right text-red-500">
                                                        {i.withholding_tax_amount > 0 ? `-${BRL(i.withholding_tax_amount)}` : '—'}
                                                    </td>
                                                    <td className="py-2 text-right font-medium text-emerald-600">{BRL(i.net_amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {batchItems.some(i => i.gross_amount > DIVIDEND_MONTHLY_THRESHOLD_PF) && (
                                        <p className="text-[10px] text-amber-600 mt-2">
                                            ⚠ Um ou mais sócios PF residentes ultrapassam R$ {DIVIDEND_MONTHLY_THRESHOLD_PF.toLocaleString('pt-BR')} no mês — retenção de 10% aplicada automaticamente (Lei 15.270/2025).
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LaborRemuneracaoSocietaria;
