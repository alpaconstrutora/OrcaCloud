import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, Check,
    Loader2, Plus, RefreshCw, Search, X, Filter,
    DollarSign, AlertTriangle, Landmark, MoveHorizontal, Undo2,
} from 'lucide-react';
import { taxPayableService } from '../services/taxPayableService';
import { taxSettingsService } from '../services/taxSettingsService';
import type { TaxPayable, TaxPayableEffectiveStatus } from '../types/financial';
import type { Organization } from '../types';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { formatMoney as fmt, formatDateBR as fmtDate } from './ui/Format';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';
import { useOrgContext, useOrgWriteTarget } from '../hooks/useOrgContext';
import ActionIconButton from './ui/ActionIconButton';

// ─── helpers ────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
    PREVISTO:  'A pagar',
    PAGO:      'Pago',
    VENCIDO:   'Vencido',
    CANCELADO: 'Cancelado',
};

// Padrão guia seção 8 — texto simples, sem pílula
const STATUS_TEXT_COLORS: Record<string, string> = {
    PREVISTO:  'text-blue-700',
    PAGO:      'text-green-700',
    VENCIDO:   'text-red-600',
    CANCELADO: 'text-gray-400',
};

const TRIBUTO_COLUMNS: ColumnConfig[] = [
    { key: 'party_name', label: 'Tributo', sortable: true },
    { key: 'category', label: 'Origem', sortable: true },
    { key: 'client_name', label: 'Cliente', sortable: true },
    { key: 'empreendimento_name', label: 'Empreendimento', sortable: true },
    { key: 'description', label: 'Descrição', sortable: true },
    { key: 'due_date', label: 'Vencimento', sortable: true },
    { key: 'amount', label: 'Valor', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    party_name: 160, category: 130, client_name: 160, empreendimento_name: 184,
    description: 200, due_date: 150, amount: 130, status: 130, actions: 220,
};

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' fica de fora: é célula fixa, não entra no
// arraste (mesmo padrão de ClientChargesModule.tsx).
const TRIBUTO_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    party_name: { label: 'Tributo', className: 'px-6 py-2 border-r border-gray-100 text-left whitespace-nowrap overflow-hidden' },
    category: { label: 'Origem', className: 'px-6 py-2 border-r border-gray-100 text-left whitespace-nowrap overflow-hidden' },
    client_name: { label: 'Cliente', className: 'px-6 py-2 border-r border-gray-100 text-left whitespace-nowrap overflow-hidden' },
    empreendimento_name: { label: 'Empreendimento', className: 'px-6 py-2 border-r border-gray-100 text-left whitespace-nowrap overflow-hidden' },
    description: { label: 'Descrição', className: 'px-6 py-2 border-r border-gray-100 text-left whitespace-nowrap overflow-hidden' },
    due_date: { label: 'Vencimento', className: 'px-6 py-2 border-r border-gray-100 text-left whitespace-nowrap overflow-hidden' },
    amount: { label: 'Valor', className: 'px-6 py-2 border-r border-gray-100 text-left whitespace-nowrap overflow-hidden' },
    status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 text-left whitespace-nowrap overflow-hidden' },
};

const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'party_name', label: 'Tributo', type: 'text' },
    { key: 'category', label: 'Origem', type: 'text' },
    { key: 'client_name', label: 'Cliente', type: 'text' },
    { key: 'empreendimento_name', label: 'Empreendimento', type: 'text' },
    { key: 'description', label: 'Descrição', type: 'text' },
    { key: 'amount', label: 'Valor', type: 'number' },
    { key: 'due_date', label: 'Vencimento', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })) },
];

function getAdvancedFilterValue(r: TaxPayable, key: string): unknown {
    switch (key) {
        case 'party_name': return r.party_name ?? '';
        case 'category': return r.category ?? '';
        case 'client_name': return r.client_name ?? '';
        case 'empreendimento_name': return r.empreendimento_name ?? '';
        case 'description': return r.description ?? '';
        case 'amount': return r.amount ?? null;
        case 'due_date': return r.due_date ?? null;
        case 'status': return r.effective_status;
        default: return null;
    }
}

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center gap-1 text-sm font-normal ${STATUS_TEXT_COLORS[status] ?? 'text-gray-600'}`}>
            {status === 'VENCIDO' && <AlertCircle className="w-3 h-3" />}
            {STATUS_LABEL[status] ?? status}
        </span>
    );
}

function today() { return new Date().toISOString().slice(0, 10); }

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderTributoCell(key: string, r: TaxPayable, isVencido: boolean): React.ReactNode {
    switch (key) {
        case 'party_name':
            return (
                <span className="text-sm font-normal text-gray-900 max-w-[160px] truncate block">
                    {r.party_name ?? <span className="text-gray-400 italic">—</span>}
                </span>
            );
        case 'category':
            return <span className="text-sm font-normal text-gray-600 max-w-[140px] truncate block">{r.category ?? '—'}</span>;
        case 'client_name':
            return (
                <span className="text-sm font-normal text-gray-600 max-w-[180px] truncate block" title={r.client_name ?? undefined}>
                    {r.client_name ?? <span className="text-gray-400 italic">—</span>}
                </span>
            );
        case 'empreendimento_name':
            return (
                <span className="text-sm font-normal text-gray-600 max-w-[180px] truncate block" title={r.empreendimento_name ?? undefined}>
                    {r.empreendimento_name ?? <span className="text-gray-400 italic">—</span>}
                </span>
            );
        case 'description':
            return <span className="text-sm font-normal text-gray-700 max-w-[200px] truncate block">{r.description ?? '—'}</span>;
        case 'due_date':
            return <span className={`text-sm font-normal whitespace-nowrap ${isVencido ? 'text-red-600' : 'text-gray-600'}`}>{fmtDate(r.due_date)}</span>;
        case 'amount':
            return <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{fmt(r.amount)}</span>;
        case 'status':
            return <StatusBadge status={r.effective_status} />;
        default:
            return null;
    }
}

// ─── types ──────────────────────────────────────────────────

type StatusFilter = 'all' | TaxPayableEffectiveStatus;
type ViewId = 'tributos' | 'fechamento';

// Título/subtítulo mudam com a aba ativa (§19.1/§20)
const VIEW_HEADERS: Record<ViewId, { title: string; subtitle: string }> = {
    tributos:   { title: 'Tributos a Pagar', subtitle: 'Tributos (IRRF, PIS, COFINS, CSLL…) sobre Vendas de Ativos e Locações.' },
    fechamento: { title: 'Fechamento',       subtitle: 'Conferência e fechamento dos tributos apurados sobre Vendas de Ativos e Locações.' },
};
const VIEWS: { id: ViewId; label: string }[] = [
    { id: 'tributos',   label: 'Tributos a Pagar' },
    { id: 'fechamento', label: 'Fechamento' },
];

// ─── NovoLancamentoModal ─────────────────────────────────────

interface NovoModalProps {
    organizationId: string;
    /** Presente = modo edição (só lançamento manual chega aqui). Ausente = criação. */
    tributo?: TaxPayable;
    onSave: () => void;
    onClose: () => void;
}
function NovoLancamentoModal({ organizationId, tributo, onSave, onClose }: NovoModalProps) {
    const isEdit = !!tributo;
    const [form, setForm] = useState({
        party_name:  tributo?.party_name ?? '',
        description: tributo?.description ?? '',
        amount:      tributo ? String(tributo.amount ?? '') : '',
        due_date:    tributo?.due_date ?? today(),
        category:    tributo?.category ?? 'Manual',
        // Competência (mês de auferimento). Default = mês do vencimento existente/hoje.
        competencia: (tributo?.transaction_date ?? tributo?.due_date ?? today()).slice(0, 7),
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [taxes, setTaxes] = useState<string[]>([]);

    useEffect(() => {
        let active = true;
        taxSettingsService.list(organizationId)
            .then(list => { if (active) setTaxes((list || []).filter(t => t.ativo).map(t => t.nome)); })
            .catch(() => { /* lista de tributos é opcional; campo aceita texto livre */ });
        return () => { active = false; };
    }, [organizationId]);

    async function handleSave() {
        if (!form.amount || !form.due_date || !form.description) {
            setErr('Preencha descrição, valor e vencimento.'); return;
        }
        setSaving(true);
        setErr(null);
        try {
            const amount = parseFloat(form.amount.replace(',', '.'));
            // Competência = 1º dia do mês escolhido (transaction_date).
            const competencia = form.competencia ? `${form.competencia}-01` : undefined;
            if (isEdit) {
                await taxPayableService.update(tributo!.id, {
                    due_date:    form.due_date,
                    amount,
                    description: form.description,
                    party_name:  form.party_name || null,
                    category:    form.category || null,
                    competencia,
                });
            } else {
                await taxPayableService.create(organizationId, {
                    due_date:    form.due_date,
                    amount,
                    description: form.description,
                    party_name:  form.party_name || undefined,
                    category:    form.category || 'Manual',
                    competencia,
                });
            }
            onSave();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="font-black text-slate-800 text-lg">{isEdit ? 'Editar tributo' : 'Novo tributo'}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {err && <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg p-3">{err}</p>}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Tributo</label>
                        <input
                            type="text"
                            list="tributos-pagar-nomes"
                            placeholder={taxes.length ? 'Selecione ou digite o tributo' : 'Ex: IRRF, PIS, COFINS...'}
                            value={form.party_name}
                            onChange={e => setForm(f => ({ ...f, party_name: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <datalist id="tributos-pagar-nomes">
                            {taxes.map(n => <option key={n} value={n} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Descrição *</label>
                        <input
                            type="text"
                            placeholder="Descrição do tributo"
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Valor (R$) *</label>
                            <input
                                type="number"
                                placeholder="0,00"
                                min={0}
                                step="0.01"
                                value={form.amount}
                                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Vencimento *</label>
                            <input
                                type="date"
                                value={form.due_date}
                                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Competência</label>
                        <input
                            type="month"
                            value={form.competencia}
                            onChange={e => setForm(f => ({ ...f, competencia: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">Mês de auferimento (usado no fechamento por competência). Padrão: mês do vencimento.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Origem</label>
                        <input
                            type="text"
                            placeholder="Ex: Venda de Ativo, Locação, Manual..."
                            value={form.category}
                            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
                <div className="flex gap-3 px-6 pb-6">
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-colors flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── main ────────────────────────────────────────────────────

interface Props {
    /** Org ativa no seletor global do topo. Vazio = "Todas as organizações". */
    organizationId?: string;
    /** Fallback de org quando o seletor global está em "Todas" — não há seletor nesta tela. */
    organizations?: Organization[];
}

export default function TributosAPagarManager({ organizationId, organizations }: Props) {
    const [rows, setRows]       = useState<TaxPayable[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState<string | null>(null);

    const [search, setSearch]           = usePersistedState('tributosPagarManagerFilters:search', '');
    const [statusFilter, setStatusFilter] = usePersistedState<StatusFilter>('tributosPagarManagerFilters:status', 'all');
    const [dueFrom, setDueFrom]         = usePersistedState('tributosPagarManagerFilters:dueFrom', '');
    const [dueTo, setDueTo]             = usePersistedState('tributosPagarManagerFilters:dueTo', '');
    const [showFilters, setShowFilters]  = useState(false);
    const [activeView, setActiveView] = usePersistedState<ViewId>('tributosPagarManager:view', 'tributos');
    // Competência (regime de fato gerador = transaction_date) — só filtra na aba Fechamento
    const [competencia, setCompetencia] = usePersistedState<string>('tributosPagarManager:competencia', today().slice(0, 7));
    // Regime de reconhecimento da org — define o rótulo do seletor (competência × recebimento)
    const [regime, setRegime] = useState<'CAIXA' | 'COMPETENCIA'>('CAIXA');
    const tableColumns = useTableColumns(TRIBUTO_COLUMNS, 'tributosPagarManagerColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'tributosPagarManagerColWidths');
    // Largura total = soma exata das colunas visíveis + checkbox fixo de 40px. NUNCA
    // w-full/100% junto com table-layout:fixed (§6.1).
    const tableTotalWidth = 40
        + (['party_name', 'category', 'client_name', 'empreendimento_name', 'description', 'due_date', 'amount', 'status'] as const)
            .reduce((sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0), 0)
        + cols.getWidth('actions');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'tributosPagarManagerFilters:advanced');

    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const confirm = useConfirm();
    const [showNovo, setShowNovo]         = useState(false);
    const [editando, setEditando]         = useState<TaxPayable | null>(null);
    const [changingStatus, setChangingStatus] = useState<string | null>(null);
    const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading]   = useState(false);
    const [generating, setGenerating]     = useState(false);

    // LEITURA: organização do seletor do topo; `null` = "Todas as organizações"
    // (os services não aplicam `.eq`, a RLS recorta). NUNCA `organizations[0]`,
    // que silenciosamente mostrava e gerava tributo da org errada.
    const { orgId: contextOrgId } = useOrgContext();
    const effectiveOrgId = organizationId || contextOrgId || null;

    // ESCRITA: tributo é registro operacional e a geração em lote é por-empresa
    // (REGRA #5, caso 3) → sempre uma organização específica.
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const [novoOrgId, setNovoOrgId] = useState<string | null>(null);

    const handleNovoTributo = async () => {
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        setNovoOrgId(target.orgId);
        setShowNovo(true);
    };

    useEffect(() => {
        let active = true;
        taxPayableService.getRecognitionRegime(effectiveOrgId)
            .then(r => { if (active) setRegime(r); })
            .catch(() => { /* mantém default CAIXA */ });
        return () => { active = false; };
    }, [effectiveOrgId]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await taxPayableService.list(effectiveOrgId, { search, status: statusFilter, dueFrom: dueFrom || undefined, dueTo: dueTo || undefined });
            setRows(data);
            setSelectedIds(new Set());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar');
        } finally {
            setLoading(false);
        }
    }, [effectiveOrgId, search, statusFilter, dueFrom, dueTo]);

    useEffect(() => { load(); }, [load]);

    async function handleBaixa(t: TaxPayable) {
        const ok = await confirm({
            title: 'Confirmar Pagamento',
            message: (
                <>
                    Marcar <b>{t.description ?? '(sem descrição)'}</b> como <b className="text-green-700">PAGO</b>?
                    <div className="bg-gray-50 rounded-xl p-3 mt-3 flex justify-between items-center">
                        <span className="text-xs text-gray-500">Valor</span>
                        <span className="font-bold text-gray-900">{fmt(t.amount)}</span>
                    </div>
                </>
            ),
            variant: 'default',
            confirmLabel: 'Confirmar',
        });
        if (!ok) return;
        try {
            await taxPayableService.updateStatus(t.id, 'PAGO');
            await load();
            notify('Tributo baixado com sucesso.');
        } catch (e) {
            notify('Erro: ' + (e instanceof Error ? e.message : 'Falha ao baixar'), 'error');
        }
    }

    /**
     * Exclusão só de lançamento manual — os automáticos são espelho de um
     * negócio comercial e voltariam no próximo sync. O serviço repete essa trava.
     */
    async function handleDelete(t: TaxPayable) {
        const ok = await confirm({
            title: 'Excluir tributo?',
            message: (
                <>
                    Excluir <b>{t.description ?? '(sem descrição)'}</b> de <b>{t.party_name ?? '—'}</b>?
                    <div className="bg-gray-50 rounded-xl p-3 mt-3 flex justify-between items-center">
                        <span className="text-xs text-gray-500">Valor</span>
                        <span className="font-bold text-gray-900">{fmt(t.amount)}</span>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">Essa ação não pode ser desfeita.</p>
                </>
            ),
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await taxPayableService.remove(t.id);
            await load();
            notify('Tributo excluído.');
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Falha ao excluir', 'error');
        }
    }

    async function handleBackfill() {
        // Geração em lote é inerentemente por-empresa: em "Todas as organizações"
        // pergunta em qual gerar, em vez de não fazer nada (botão morto).
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        const backfillOrgId = target.orgId;
        const ok = await confirm({
            title: 'Gerar tributos dos negócios existentes?',
            message: (
                <>
                    Recalcula os tributos de <b>todas as Vendas de Ativos e Locações</b> desta organização,
                    a partir das alíquotas ativas em Configurações › Tributos e Impostos.
                    <p className="mt-3 text-xs text-gray-500">Idempotente: preserva os tributos já pagos e apenas atualiza/gera os pendentes.</p>
                </>
            ),
            variant: 'default',
            confirmLabel: 'Gerar',
        });
        if (!ok) return;
        setGenerating(true);
        try {
            const n = await taxPayableService.generateAllForOrganization(backfillOrgId);
            await load();
            notify(`${n} negócio${n !== 1 ? 's' : ''} processado${n !== 1 ? 's' : ''}.`);
        } catch (e) {
            notify('Erro: ' + (e instanceof Error ? e.message : 'Falha ao gerar'), 'error');
        } finally {
            setGenerating(false);
        }
    }

    /**
     * Estorna a baixa: o tributo volta a Previsto. Confirma antes (§14) — é
     * reversão financeira.
     *
     * Até 15/08/2026 não havia caminho de volta: o `<select>` de status só é
     * renderizado quando `!isPago`. Mesmo buraco existia em Contas a Pagar e em
     * Contas a Receber.
     */
    async function estornar(r: TaxPayable) {
        const ok = await confirm({
            title: 'Estornar a baixa deste tributo?',
            message: 'O tributo volta para Previsto e a data de pagamento é apagada.',
            variant: 'warning',
            confirmLabel: 'Estornar',
        });
        if (!ok) return;
        await handleChangeStatus(r.id, 'PREVISTO');
    }

    async function handleChangeStatus(id: string, newStatus: string) {
        setChangingStatus(id);
        try {
            await taxPayableService.updateStatus(id, newStatus as Parameters<typeof taxPayableService.updateStatus>[1]);
            await load();
        } catch (e) {
            notify('Erro: ' + (e instanceof Error ? e.message : 'Falha'), 'error');
        } finally {
            setChangingStatus(null);
        }
    }

    const sorted = useMemo(() => {
        let result = applyFilterRules(rows, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue);
        // Fechamento: recorta pela competência (mês do fato gerador = transaction_date)
        if (activeView === 'fechamento' && competencia) {
            result = result.filter(r => (r.transaction_date ?? '').slice(0, 7) === competencia);
        }
        result = [...result];
        if (tableColumns.sortColumn) {
            result.sort((a, b) => {
                let va: string | number, vb: string | number;
                switch (tableColumns.sortColumn) {
                    case 'party_name':    va = (a.party_name ?? '').toLowerCase();    vb = (b.party_name ?? '').toLowerCase();    break;
                    case 'category':      va = (a.category ?? '').toLowerCase();      vb = (b.category ?? '').toLowerCase();      break;
                    case 'client_name':   va = (a.client_name ?? '').toLowerCase();   vb = (b.client_name ?? '').toLowerCase();   break;
                    case 'empreendimento_name':
                                          va = (a.empreendimento_name ?? '').toLowerCase(); vb = (b.empreendimento_name ?? '').toLowerCase(); break;
                    case 'description':   va = (a.description ?? '').toLowerCase();   vb = (b.description ?? '').toLowerCase();   break;
                    case 'due_date':      va = a.due_date ?? '';                      vb = b.due_date ?? '';                      break;
                    case 'amount':        va = a.amount ?? 0;                         vb = b.amount ?? 0;                         break;
                    case 'status':        va = a.effective_status;                    vb = b.effective_status;                    break;
                    default:              return 0;
                }
                if (va < vb) return tableColumns.sortDirection === 'asc' ? -1 : 1;
                if (va > vb) return tableColumns.sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [rows, advancedFilters.rules, tableColumns.sortColumn, tableColumns.sortDirection, activeView, competencia]);

    /** Só não-PAGO pode ser baixado. */
    const isSelectable = (t: TaxPayable) => t.effective_status !== 'PAGO' && t.effective_status !== 'CANCELADO';
    const selectableVisible = useMemo(() => sorted.filter(isSelectable), [sorted]);
    const selectableIndexById = useMemo(
        () => new Map(selectableVisible.map((r, i) => [r.id, i])),
        [selectableVisible],
    );
    const selectedVisible = useMemo(
        () => selectableVisible.filter(r => selectedIds.has(r.id)),
        [selectableVisible, selectedIds],
    );
    const allVisibleSelected = selectableVisible.length > 0 && selectedVisible.length === selectableVisible.length;
    const selectedTotal = selectedVisible.reduce((s, r) => s + (r.amount ?? 0), 0);

    function toggleRow(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null);

    function handleRowCheck(id: string, index: number, shiftKey: boolean) {
        if (shiftKey && lastCheckedIndex !== null) {
            const [start, end] = lastCheckedIndex < index ? [lastCheckedIndex, index] : [index, lastCheckedIndex];
            const rangeIds = selectableVisible.slice(start, end + 1).map(r => r.id);
            setSelectedIds(prev => new Set([...prev, ...rangeIds]));
        } else {
            toggleRow(id);
            setLastCheckedIndex(index);
        }
    }
    function toggleAllVisible() {
        setSelectedIds(prev => {
            if (allVisibleSelected) {
                const next = new Set(prev);
                selectableVisible.forEach(r => next.delete(r.id));
                return next;
            }
            const next = new Set(prev);
            selectableVisible.forEach(r => next.add(r.id));
            return next;
        });
    }
    const clearSelection = () => setSelectedIds(new Set());

    async function handleBulkBaixa() {
        const alvos = selectedVisible;
        if (alvos.length === 0) return;
        setBulkLoading(true);
        const okIds: string[] = [];
        const falhas: string[] = [];
        for (const r of alvos) {
            try {
                await taxPayableService.updateStatus(r.id, 'PAGO');
                okIds.push(r.id);
            } catch {
                falhas.push(r.party_name ?? r.description ?? r.id);
            }
        }
        setSelectedIds(new Set());
        setBulkLoading(false);
        if (okIds.length) await load();
        if (falhas.length) {
            notify(`${okIds.length} pago(s). Falha em ${falhas.length}: ${falhas.join(', ')}`, 'error');
        } else if (okIds.length) {
            notify(`${okIds.length} ${okIds.length !== 1 ? 'tributos baixados' : 'tributo baixado'}.`);
        }
    }

    const summary = useMemo(() => {
        const todayStr = today();
        const inicioMes = todayStr.slice(0, 7) + '-01';
        let aPagar = 0, vencidos = 0, pagoMes = 0;
        rows.forEach(r => {
            if (r.effective_status === 'PAGO') {
                if ((r.transaction_date ?? '') >= inicioMes) pagoMes += r.amount;
            } else if (r.effective_status === 'VENCIDO') {
                vencidos += r.amount;
            } else if (!['CANCELADO','PAGO'].includes(r.effective_status)) {
                aPagar += r.amount;
            }
        });
        return { aPagar, vencidos, pagoMes };
    }, [rows]);

    const STATUS_OPTIONS: StatusFilter[] = ['all','PREVISTO','PAGO','VENCIDO','CANCELADO'];

    return (
        <div className="space-y-6">
            {/* Cabeçalho de tela — §20 (título muda com a aba ativa) */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{VIEW_HEADERS[activeView].title}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{VIEW_HEADERS[activeView].subtitle}</p>
            </div>

            {/* KPI Cards — só na aba Tributos a Pagar (§20.1: mb-3) */}
            {activeView === 'tributos' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                <KpiCard
                    label="A Pagar"
                    value={fmt(summary.aPagar)}
                    sub={`${rows.filter(r => !['CANCELADO','PAGO'].includes(r.effective_status)).length} tributos em aberto`}
                    icon={<DollarSign className="w-5 h-5" />}
                    color="rose"
                    onClick={() => setStatusFilter('all')}
                />
                <KpiCard
                    label="Vencidos"
                    value={fmt(summary.vencidos)}
                    sub={`${rows.filter(r => r.effective_status === 'VENCIDO').length} tributos vencidos`}
                    icon={<AlertTriangle className="w-5 h-5" />}
                    color={summary.vencidos > 0 ? 'red' : 'gray'}
                    onClick={() => setStatusFilter('VENCIDO')}
                />
                <KpiCard
                    label="Pago (mês)"
                    value={fmt(summary.pagoMes)}
                    sub={`${rows.filter(r => r.effective_status === 'PAGO').length} tributos quitados`}
                    icon={<Check className="w-5 h-5" />}
                    color="emerald"
                    onClick={() => setStatusFilter('PAGO')}
                />
            </div>
            )}

            {/* Toolbar de abas — §19.1 */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {VIEWS.map(v => (
                        <button
                            key={v.id}
                            onClick={() => setActiveView(v.id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                activeView === v.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {v.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Toolbar de botões — §5.3 (escopo à esquerda, ações à direita) */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    {/* Escopo — competência/recebimento mensal (só na aba Fechamento; rótulo segue o regime da org) */}
                    {activeView === 'fechamento' && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-semibold whitespace-nowrap" title={regime === 'COMPETENCIA' ? 'Mês de auferimento da receita' : 'Mês de recebimento (regime de caixa)'}>
                                {regime === 'COMPETENCIA' ? 'Competência' : 'Mês de recebimento'}
                            </span>
                            <input
                                type="month"
                                value={competencia}
                                onChange={e => setCompetencia(e.target.value)}
                                className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer transition-all"
                            />
                        </div>
                    )}

                    {/* Sem seletor de organização aqui: vem do seletor global do topo. */}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Gerar — backfill dos negócios existentes (ação secundária) */}
                    <button
                        onClick={handleBackfill}
                        disabled={generating}
                        title="Gerar tributos das Vendas de Ativos e Locações já existentes"
                        className="h-9 flex items-center gap-1.5 px-3 rounded-[6px] text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-all whitespace-nowrap"
                    >
                        {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Landmark className="w-3.5 h-3.5" />} Gerar
                    </button>

                    {/* Novo — ação primária §17 */}
                    <button
                        onClick={handleNovoTributo}
                        className="h-9 flex items-center gap-1.5 px-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95"
                    >
                        <Plus className="w-[15px] h-[15px]" /> Novo
                    </button>
                </div>
            </div>

            {/* Banner de erro — FORA do card acoplado (§5.2), senão quebra a costura do border-b */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700 font-semibold">{error}</div>
            )}

            {/* Toolbar acoplada à tabela (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex flex-col gap-2.5 p-2 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por tributo, origem, empreendimento ou descrição..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Status pills — filtro rápido (§6.4) */}
                        <div className="flex items-center h-9 gap-1 overflow-x-auto">
                            {STATUS_OPTIONS.map(s => (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(s)}
                                    className={`h-9 px-3 rounded-[6px] text-xs font-semibold transition-all whitespace-nowrap ${
                                        statusFilter === s
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {s === 'all' ? 'Todos' : STATUS_LABEL[s]}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setShowFilters(v => !v)}
                            className={`h-9 flex items-center gap-1.5 px-3 rounded-[6px] text-sm font-medium border transition-all whitespace-nowrap ${showFilters ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        >
                            <Filter className="w-3.5 h-3.5" /> Filtros
                        </button>

                        <div className="flex items-center h-9">
                            <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />
                        </div>

                        <button
                            onClick={load}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shrink-0"
                            title="Atualizar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={TRIBUTO_COLUMNS.filter(c => c.key !== 'actions')}
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

                    {showFilters && (
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-semibold">Venc. de</span>
                                <input type="date" value={dueFrom} onChange={e => setDueFrom(e.target.value)}
                                    className="h-9 border border-gray-200 rounded-[6px] px-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-semibold">até</span>
                                <input type="date" value={dueTo} onChange={e => setDueTo(e.target.value)}
                                    className="h-9 border border-gray-200 rounded-[6px] px-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                            </div>
                            {(dueFrom || dueTo) && (
                                <button onClick={() => { setDueFrom(''); setDueTo(''); }}
                                    className="text-sm text-blue-600 font-medium hover:underline flex items-center gap-1">
                                    <X className="w-3 h-3" /> Limpar datas
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Conteúdo */}
                <div>
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500 text-sm">Carregando tributos...</p>
                        </div>
                    ) : sorted.length === 0 ? (
                        <div className="text-center py-12">
                            <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum tributo encontrado</h3>
                            <p className="text-sm text-gray-500">Os tributos são gerados ao salvar Vendas de Ativos / Locações, ou crie um lançamento manual.</p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-sm text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                <col style={{ width: '40px' }} /> {/* checkbox */}
                                {/* 'actions' está em TRIBUTO_COLUMNS só para reservar a chave no
                                    ColumnConfigButton/useTableColumns — a célula em si é fixa (fora do
                                    map), então é excluída aqui da lista arrastável/dinâmica. */}
                                {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                    borda de "Ações" não andar a cada redimensionamento. */}
                                <col />
                                {tableColumns.visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                            checked={allVisibleSelected}
                                            disabled={selectableVisible.length === 0}
                                            onChange={toggleAllVisible}
                                            title="Selecionar todos (não pagos)"
                                        />
                                    </th>
                                    {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                        const def = TRIBUTO_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}>
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-left relative overflow-hidden text-table-header font-semibold text-gray-500">
                                            Ações
                                            <cols.ResizeHandle colKey="actions" />
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {sorted.map(r => {
                                    const isVencido = r.effective_status === 'VENCIDO';
                                    const isPago = r.effective_status === 'PAGO';
                                    const isCancelado = r.effective_status === 'CANCELADO';
                                    // Só lançamento manual (sem reference_id) é editável/excluível.
                                    const isManual = !r.reference_id;
                                    return (
                                        <tr key={r.id} className={`hover:bg-blue-50/50 transition-colors ${selectedIds.has(r.id) ? 'bg-blue-50/60' : isVencido ? 'bg-red-50/30' : ''}`}>
                                            <td className="w-10 px-4 py-2.5 border-r border-gray-100 text-center">
                                                {isSelectable(r) ? (
                                                    <input
                                                        type="checkbox"
                                                        title="Dica: segure Shift e clique para selecionar um intervalo"
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                        checked={selectedIds.has(r.id)}
                                                        onChange={e => handleRowCheck(r.id, selectableIndexById.get(r.id) ?? 0, (e.nativeEvent as MouseEvent).shiftKey)}
                                                    />
                                                ) : null}
                                            </td>
                                            {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                                <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {renderTributoCell(key, r, isVencido)}
                                                </td>
                                            ))}
                                            {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                                            {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 last:border-r-0">
                                                <div className="flex items-center gap-1.5">
                                                    {!isPago && !isCancelado && (
                                                        <button
                                                            onClick={() => handleBaixa(r)}
                                                            className="text-green-700 hover:text-green-800 text-sm font-medium p-1.5 hover:bg-green-50 rounded-[6px] transition-all flex items-center gap-1"
                                                        >
                                                            <Check className="w-3.5 h-3.5" /> Pagar
                                                        </button>
                                                    )}
                                                    {isPago && (
                                                        <ActionIconButton
                                                            kind="settings"
                                                            title="Estornar baixa"
                                                            icon={<Undo2 className="w-4 h-4" />}
                                                            disabled={changingStatus === r.id}
                                                            onClick={() => estornar(r)}
                                                        />
                                                    )}
                                                    {!isPago && (
                                                        <select
                                                            value={r.business_status}
                                                            disabled={changingStatus === r.id}
                                                            onChange={e => handleChangeStatus(r.id, e.target.value)}
                                                            className="text-sm font-normal border border-gray-200 rounded-[6px] px-2 py-1 bg-white focus:outline-none cursor-pointer"
                                                        >
                                                            {(['PREVISTO','CANCELADO'] as const).map(s => (
                                                                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    {isManual && (
                                                        <>
                                                            <ActionIconButton
                                                                kind="edit"
                                                                title="Editar tributo"
                                                                onClick={() => setEditando(r)}
                                                            />
                                                            <ActionIconButton
                                                                kind="delete"
                                                                title="Excluir tributo"
                                                                onClick={() => handleDelete(r)}
                                                            />
                                                        </>
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
                    )}

                    {!loading && sorted.length > 0 && (
                        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
                            {sorted.length} tributo{sorted.length !== 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            </div>

            {/* Barra de ação em massa (§10) */}
            {selectedVisible.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                    <span className="flex-1 text-sm font-bold whitespace-nowrap">
                        {selectedVisible.length} selecionado{selectedVisible.length !== 1 ? 's' : ''}
                        <span className="ml-2 font-normal opacity-75">· {fmt(selectedTotal)}</span>
                    </span>
                    <button
                        onClick={handleBulkBaixa}
                        disabled={bulkLoading}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white text-green-700 rounded-xl text-sm font-semibold hover:bg-green-50 disabled:opacity-60 transition-colors"
                    >
                        {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Pagar (Baixa)
                    </button>
                    <button
                        onClick={clearSelection}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl font-bold text-sm hover:bg-blue-400 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                        Desmarcar
                    </button>
                </div>
            )}

            {/* Modals */}
            {showNovo && novoOrgId && (
                <NovoLancamentoModal
                    organizationId={novoOrgId}
                    onSave={() => { setShowNovo(false); load(); }}
                    onClose={() => { setShowNovo(false); setNovoOrgId(null); }}
                />
            )}
            {/* Editar: a organização sai do próprio tributo aberto. */}
            {editando && (
                <NovoLancamentoModal
                    organizationId={editando.organization_id || effectiveOrgId || ''}
                    tributo={editando}
                    onSave={() => { setEditando(null); load(); }}
                    onClose={() => setEditando(null)}
                />
            )}

            {/* Toast de Notificação — §13 */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}

            {orgTargetModal}
        </div>
    );
}
