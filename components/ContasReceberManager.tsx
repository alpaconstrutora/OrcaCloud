import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, Check, ChevronDown, ChevronUp,
    Loader2, Plus, RefreshCw, Search, TrendingUp, X, Filter,
    FileText, QrCode, Copy, ExternalLink, DollarSign, AlertTriangle, MoveHorizontal,
} from 'lucide-react';
import { receivableService } from '../services/receivableService';
import { clientChargeService } from '../services/clientChargeService';
import { asaasConfigService } from '../services/asaasConfigService';
import { clientService } from '../services/clientService';
import { financialRegistryService } from '../services/financialRegistryService';
import { useOrgContext, useOrgWriteTarget } from '../hooks/useOrgContext';
import type { ClientCharge, BillingType } from '../services/clientChargeService';
import type { Receivable, ReceivableEffectiveStatus, InadimplenciaFaixa } from '../types/financial';
import type { Organization, CostCenter } from '../types';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { formatMoney as fmt, formatDateBR as fmtDate } from './ui/Format';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';
import ActionIconButton from './ui/ActionIconButton';

// ─── helpers ────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
    PREVISTO:    'Previsto',
    EMITIDO:     'Emitido',
    ENVIADO:     'Enviado',
    RECEBIDO:    'Recebido',
    PARCIAL:     'Parcial',
    VENCIDO:     'Vencido',
    RENEGOCIADO: 'Renegociado',
    CANCELADO:   'Cancelado',
};

// Padrão guia seção 8 — texto simples, sem pílula
const STATUS_TEXT_COLORS: Record<string, string> = {
    PREVISTO:    'text-gray-600',
    EMITIDO:     'text-blue-700',
    ENVIADO:     'text-purple-700',
    RECEBIDO:    'text-green-700',
    PARCIAL:     'text-orange-700',
    VENCIDO:     'text-red-600',
    RENEGOCIADO: 'text-yellow-700',
    CANCELADO:   'text-gray-400',
};

const RECEBER_COLUMNS: ColumnConfig[] = [
    { key: 'party_name', label: 'Cliente / Parte', sortable: true },
    { key: 'description', label: 'Descrição', sortable: true },
    { key: 'project_name', label: 'Obra', sortable: true },
    { key: 'due_date', label: 'Vencimento', sortable: true },
    { key: 'amount', label: 'Valor', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    // Duas dimensões DIFERENTES (ver migration 20270822000013): Centro de
    // Custo é cost_centers_v2, Plano de Contas é plano_de_contas. Resolvidas
    // no client — vw_receivables só expõe os UUIDs.
    { key: 'cost_center_name', label: 'Centro de Custo', sortable: true },
    { key: 'plano_de_contas_name', label: 'Plano de Contas', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const DEFAULT_COL_WIDTHS: Record<string, number> = {
    party_name: 200, description: 220, project_name: 160, due_date: 130, amount: 140, status: 150,
    cost_center_name: 180, plano_de_contas_name: 180, actions: 260,
};

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Roda client-side
// por cima de `rows`, que já vem filtrado no servidor (search/status/período).
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'party_name', label: 'Cliente / Parte', type: 'text' },
    { key: 'description', label: 'Descrição', type: 'text' },
    { key: 'project_name', label: 'Obra', type: 'text' },
    { key: 'amount', label: 'Valor', type: 'number' },
    { key: 'due_date', label: 'Vencimento', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })) },
    { key: 'cost_center_name', label: 'Centro de Custo', type: 'text' },
    { key: 'plano_de_contas_name', label: 'Plano de Contas', type: 'text' },
];

function getAdvancedFilterValue(r: Receivable, key: string): unknown {
    switch (key) {
        case 'party_name': return r.party_name ?? '';
        case 'description': return r.description ?? '';
        case 'project_name': return r.project_name ?? '';
        case 'amount': return r.amount ?? null;
        case 'due_date': return r.due_date ?? null;
        case 'status': return r.effective_status;
        case 'cost_center_name': return r.cost_center_name ?? '';
        case 'plano_de_contas_name': return r.plano_de_contas_name ?? '';
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

// ─── types ──────────────────────────────────────────────────

type StatusFilter = 'all' | ReceivableEffectiveStatus;

// ─── NovoLancamentoModal ─────────────────────────────────────

interface NovoModalProps {
    organizationId: string;
    /** Presente = modo edição (só lançamento manual chega aqui). Ausente = criação. */
    receivable?: Receivable;
    onSave: () => void;
    onClose: () => void;
}
function NovoLancamentoModal({ organizationId, receivable, onSave, onClose }: NovoModalProps) {
    const isEdit = !!receivable;
    const [form, setForm] = useState({
        party_name:  receivable?.party_name ?? '',
        description: receivable?.description ?? '',
        amount:      receivable ? String(receivable.amount ?? '') : '',
        due_date:    receivable?.due_date ?? today(),
        category:    receivable?.category ?? '',
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        let active = true;
        clientService.listClients(organizationId)
            .then(list => {
                if (active) {
                    setClients(
                        (list || [])
                            .filter((c: any) => c?.name)
                            .map((c: any) => ({ id: c.id, name: c.name })),
                    );
                }
            })
            .catch(() => { /* lista de clientes é opcional; campo aceita texto livre */ });
        return () => { active = false; };
    }, [organizationId]);

    async function handleSave() {
        if (!form.amount || !form.due_date || !form.description) {
            setErr('Preencha descrição, valor e vencimento.'); return;
        }
        setSaving(true);
        setErr(null);
        try {
            const matched = form.party_name
                ? clients.find(c => c.name.trim().toLowerCase() === form.party_name.trim().toLowerCase())
                : undefined;
            const amount = parseFloat(form.amount.replace(',', '.'));
            if (isEdit) {
                await receivableService.update(receivable!.id, {
                    due_date:    form.due_date,
                    amount,
                    description: form.description,
                    // null (não undefined) para de fato limpar no banco quando o
                    // usuário apaga o campo — undefined seria ignorado pelo update.
                    party_id:    matched?.id ?? null,
                    party_name:  form.party_name || null,
                    category:    form.category || null,
                });
            } else {
                await receivableService.create(organizationId, {
                    due_date:    form.due_date,
                    amount,
                    description: form.description,
                    party_id:    matched?.id,
                    party_name:  form.party_name || undefined,
                    party_type:  'CLIENT',
                    category:    form.category || undefined,
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
                    <h2 className="font-black text-slate-800 text-lg">{isEdit ? 'Editar recebível' : 'Novo recebível'}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {err && <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg p-3">{err}</p>}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Cliente / Parte</label>
                        <input
                            type="text"
                            list="contas-receber-clientes"
                            placeholder={clients.length ? 'Selecione ou digite o cliente' : 'Nome do cliente'}
                            value={form.party_name}
                            onChange={e => setForm(f => ({ ...f, party_name: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <datalist id="contas-receber-clientes">
                            {clients.map(c => <option key={c.id} value={c.name} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Descrição *</label>
                        <input
                            type="text"
                            placeholder="Descrição do recebível"
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
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Categoria</label>
                        <input
                            type="text"
                            placeholder="Ex: Medição, Parcela, Locação..."
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

// ─── EmitirCobrancaModal ─────────────────────────────────────

interface EmitModalProps {
    organizationId: string;
    receivable: Receivable;
    existing?: ClientCharge;
    onDone: () => void;
    onClose: () => void;
}
function EmitirCobrancaModal({ organizationId, receivable, existing, onDone, onClose }: EmitModalProps) {
    const [billingType, setBillingType] = useState<BillingType>(existing?.billing_type ?? 'BOLETO');
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [result, setResult] = useState<ClientCharge | null>(existing ?? null);
    const [copied, setCopied] = useState(false);

    // Edição p/ "cancelar e reemitir" (corrige dados antes de gerar novo boleto)
    const [editMode, setEditMode] = useState(false);
    const [editAmount, setEditAmount] = useState(String(receivable.amount ?? ''));
    const [editDue, setEditDue] = useState(receivable.due_date ?? today());
    const [editDesc, setEditDesc] = useState(receivable.description ?? '');

    // Multa/juros/desconto — pré-carregados da config da org, ajustáveis por cobrança
    const [fine, setFine] = useState('2');
    const [interest, setInterest] = useState('1');
    const [discount, setDiscount] = useState('0');
    const [discountDays, setDiscountDays] = useState('0');
    const [saveDefault, setSaveDefault] = useState(false);

    useEffect(() => {
        if (existing) return; // já emitida: não precisa de config
        asaasConfigService.get(organizationId)
            .then(cfg => {
                setFine(String(cfg.fine_percent));
                setInterest(String(cfg.interest_percent_month));
                setDiscount(String(cfg.discount_percent));
                setDiscountDays(String(cfg.discount_days));
            })
            .catch(() => { /* usa os defaults dos useState */ });
    }, [organizationId, existing]);

    function chargesPayload() {
        return {
            fine_percent:           parseFloat(fine.replace(',', '.')) || 0,
            interest_percent_month: parseFloat(interest.replace(',', '.')) || 0,
            discount_percent:       parseFloat(discount.replace(',', '.')) || 0,
            discount_days:          parseInt(discountDays) || 0,
        };
    }

    async function persistDefaultIfNeeded(p: ReturnType<typeof chargesPayload>) {
        if (!saveDefault) return;
        await asaasConfigService.save({
            organization_id: organizationId,
            fine_percent: p.fine_percent,
            interest_percent_month: p.interest_percent_month,
            discount_percent: p.discount_percent,
            discount_days: p.discount_days,
        }).catch(() => { /* não bloqueia a emissão */ });
    }

    async function handleEmit() {
        setLoading(true);
        setErr(null);
        try {
            const p = chargesPayload();
            await persistDefaultIfNeeded(p);
            const res = await clientChargeService.emit(organizationId, receivable.id, billingType, p);
            setResult(res.charge);
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Erro ao emitir cobrança');
        } finally {
            setLoading(false);
        }
    }

    async function handleReemit() {
        const amountNum = parseFloat(editAmount.replace(',', '.'));
        if (!amountNum || amountNum <= 0 || !editDue) {
            setErr('Informe valor e vencimento válidos.'); return;
        }
        setLoading(true);
        setErr(null);
        try {
            // 1. Cancela o boleto atual no Asaas e reverte para PREVISTO
            await clientChargeService.cancel(organizationId, receivable.id);
            // 2. Corrige os dados do recebível
            await receivableService.update(receivable.id, {
                amount:      amountNum,
                due_date:    editDue,
                description: editDesc || undefined,
            });
            // 3. Emite novo boleto com os dados corrigidos
            const res = await clientChargeService.emit(organizationId, receivable.id, billingType, chargesPayload());
            setResult(res.charge);
            setEditMode(false);
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Erro ao reemitir cobrança');
        } finally {
            setLoading(false);
        }
    }

    function copyPix() {
        if (!result?.pix_payload) return;
        navigator.clipboard.writeText(result.pix_payload);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="font-black text-slate-800 text-lg">Emitir Cobrança</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Cliente</span>
                            <span className="font-bold text-gray-800">{receivable.party_name ?? '—'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Valor</span>
                            <span className="font-black text-gray-900">{fmt(receivable.amount)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Vencimento</span>
                            <span className="font-mono text-gray-700">{fmtDate(receivable.due_date)}</span>
                        </div>
                    </div>

                    {!result && (
                        <>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-2">Forma de cobrança</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {([
                                        { v: 'BOLETO' as BillingType, label: 'Boleto', icon: FileText },
                                        { v: 'PIX' as BillingType, label: 'PIX', icon: QrCode },
                                        { v: 'UNDEFINED' as BillingType, label: 'Boleto+PIX', icon: Check },
                                    ]).map(opt => (
                                        <button
                                            key={opt.v}
                                            onClick={() => setBillingType(opt.v)}
                                            className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-button font-bold transition-all ${
                                                billingType === opt.v
                                                    ? 'border-green-500 bg-green-50 text-green-700'
                                                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                            }`}
                                        >
                                            <opt.icon className="w-4 h-4" />
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Multa, juros e desconto */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-2">Encargos por atraso</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-xs text-gray-400 font-bold">Multa (%)</span>
                                        <input type="number" min={0} step="0.1" value={fine}
                                            onChange={e => setFine(e.target.value)}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                                    </div>
                                    <div>
                                        <span className="text-xs text-gray-400 font-bold">Juros ao mês (%)</span>
                                        <input type="number" min={0} step="0.1" value={interest}
                                            onChange={e => setInterest(e.target.value)}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-2">Desconto p/ pagamento antecipado</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-xs text-gray-400 font-bold">Desconto (%)</span>
                                        <input type="number" min={0} step="0.1" value={discount}
                                            onChange={e => setDiscount(e.target.value)}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                                    </div>
                                    <div>
                                        <span className="text-xs text-gray-400 font-bold">Até (dias antes)</span>
                                        <input type="number" min={0} step="1" value={discountDays}
                                            onChange={e => setDiscountDays(e.target.value)}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                                    </div>
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-form-label text-gray-600 font-semibold cursor-pointer">
                                <input type="checkbox" checked={saveDefault} onChange={e => setSaveDefault(e.target.checked)}
                                    className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                                Salvar como padrão da empresa
                            </label>

                            {err && <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg p-3">{err}</p>}
                        </>
                    )}

                    {result && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-green-700 text-sm font-bold">
                                <Check className="w-4 h-4" /> Cobrança emitida via Asaas
                            </div>
                            {result.bank_slip_url && (
                                <a href={result.bank_slip_url} target="_blank" rel="noreferrer"
                                    className="flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 rounded-xl text-sm font-bold text-blue-700 transition-colors">
                                    <span className="flex items-center gap-2"><FileText className="w-4 h-4" /> Abrir boleto (PDF)</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            )}
                            {result.invoice_url && (
                                <a href={result.invoice_url} target="_blank" rel="noreferrer"
                                    className="flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-sm font-bold text-gray-700 transition-colors">
                                    <span className="flex items-center gap-2"><ExternalLink className="w-4 h-4" /> Página de pagamento</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            )}
                            {result.pix_payload && (
                                <button onClick={copyPix}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 hover:bg-emerald-100 rounded-xl text-sm font-bold text-emerald-700 transition-colors">
                                    <span className="flex items-center gap-2"><QrCode className="w-4 h-4" /> {copied ? 'Copiado!' : 'Copiar PIX copia-e-cola'}</span>
                                    <Copy className="w-3.5 h-3.5" />
                                </button>
                            )}

                            {/* Cancelar e reemitir */}
                            <div className="border-t border-gray-100 pt-3 mt-1">
                                {!editMode ? (
                                    <button
                                        onClick={() => { setErr(null); setEditMode(true); }}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-xl text-sm font-bold text-amber-700 transition-colors"
                                    >
                                        <RefreshCw className="w-4 h-4" /> Editar e reemitir boleto
                                    </button>
                                ) : (
                                    <div className="space-y-3">
                                        <p className="text-xs text-amber-700 font-semibold bg-amber-50 rounded-lg p-2.5 leading-snug">
                                            O boleto atual será <b>cancelado no Asaas</b> e um novo será emitido com os dados corrigidos.
                                        </p>
                                        {err && <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg p-3">{err}</p>}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 mb-1">Valor (R$)</label>
                                                <input
                                                    type="number" min={0} step="0.01"
                                                    value={editAmount}
                                                    onChange={e => setEditAmount(e.target.value)}
                                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 mb-1">Vencimento</label>
                                                <input
                                                    type="date"
                                                    value={editDue}
                                                    onChange={e => setEditDue(e.target.value)}
                                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-500 mb-1">Descrição</label>
                                            <input
                                                type="text"
                                                value={editDesc}
                                                onChange={e => setEditDesc(e.target.value)}
                                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-500 mb-1">Forma de cobrança</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {([
                                                    { v: 'BOLETO' as BillingType, label: 'Boleto', icon: FileText },
                                                    { v: 'PIX' as BillingType, label: 'PIX', icon: QrCode },
                                                    { v: 'UNDEFINED' as BillingType, label: 'Boleto+PIX', icon: Check },
                                                ]).map(opt => (
                                                    <button
                                                        key={opt.v}
                                                        onClick={() => setBillingType(opt.v)}
                                                        className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-form-label font-bold transition-all ${
                                                            billingType === opt.v
                                                                ? 'border-amber-500 bg-amber-50 text-amber-700'
                                                                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <opt.icon className="w-4 h-4" />
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setEditMode(false)}
                                                disabled={loading}
                                                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                                            >
                                                Voltar
                                            </button>
                                            <button
                                                onClick={handleReemit}
                                                disabled={loading}
                                                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-colors flex items-center justify-center gap-2"
                                            >
                                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                Cancelar e reemitir
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex gap-3 px-6 pb-6">
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                        {result ? 'Fechar' : 'Cancelar'}
                    </button>
                    {!result && (
                        <button
                            onClick={handleEmit}
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                            Emitir
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── main ────────────────────────────────────────────────────

interface Props {
    organizationId?: string;
    organizations?: Organization[];
}

export default function ContasReceberManager({ organizationId, organizations }: Props) {
    const [rows, setRows]         = useState<Receivable[]>([]);
    const [inadimplencia, setInad] = useState<InadimplenciaFaixa[]>([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);

    // F2: filtros + ordenação sobrevivem a navegação/reload.
    const [search, setSearch]           = usePersistedState('contasReceberManagerFilters:search', '');
    const [statusFilter, setStatusFilter] = usePersistedState<StatusFilter>('contasReceberManagerFilters:status', 'all');
    const [dueFrom, setDueFrom]         = usePersistedState('contasReceberManagerFilters:dueFrom', '');
    const [dueTo, setDueTo]             = usePersistedState('contasReceberManagerFilters:dueTo', '');
    const [showFilters, setShowFilters]  = useState(false);
    const [showInad, setShowInad]        = useState(false);
    // storageKey explícito — antes usava o default 'tableColumns' e colidia com
    // qualquer outro componente que também não passasse a chave.
    const tableColumns = useTableColumns(RECEBER_COLUMNS, 'contasReceberManagerColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'contasReceberManagerColWidths');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'contasReceberManagerFilters:advanced');

    // Toast de Notificação — Seção 13 do guia
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const confirm = useConfirm();
    const [showNovo, setShowNovo]         = useState(false);
    const [editando, setEditando]         = useState<Receivable | null>(null);
    const [changingStatus, setChangingStatus] = useState<string | null>(null);
    const [charges, setCharges]           = useState<Record<string, ClientCharge>>({});
    const [emitindo, setEmitindo]         = useState<Receivable | null>(null);
    const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading]   = useState(false);
    // Duas dimensões DIFERENTES (ver migration 20270822000013) — carregadas uma
    // vez por organização para resolver os UUIDs de vw_receivables em nome.
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [planoContas, setPlanoContas] = useState<CostCenter[]>([]);

    // LEITURA: a organização vem do seletor do topo. `null` = "Todas as
    // organizações" — os services não aplicam `.eq('organization_id',…)` e a RLS
    // recorta. NUNCA `organizations[0]` (lia a org errada) nem guard que
    // bloqueia o carregamento (deixava a tela em branco).
    const { orgId: contextOrgId } = useOrgContext();
    const effectiveOrgId = organizationId || contextOrgId || null;

    // ESCRITA: novo lançamento é registro operacional → exige uma organização.
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const [novoOrgId, setNovoOrgId] = useState<string | null>(null);

    const handleNovoLancamento = async () => {
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        setNovoOrgId(target.orgId);
        setShowNovo(true);
    };

    useEffect(() => {
        let ativo = true;
        Promise.all([
            financialRegistryService.listCostCenters(effectiveOrgId ?? undefined),
            financialRegistryService.listPlanoContas(effectiveOrgId ?? undefined),
        ])
            .then(([cc, pc]) => {
                if (!ativo) return;
                setCostCenters(cc);
                setPlanoContas(pc);
            })
            .catch(err => console.error('[ContasReceberManager] Erro ao carregar Centro de Custo / Plano de Contas:', err));
        return () => { ativo = false; };
    }, [effectiveOrgId]);

    const costCenterNameById = useMemo(() => new Map(costCenters.map(c => [c.id, c.name])), [costCenters]);
    const planoContasNameById = useMemo(() => new Map(planoContas.map(c => [c.id, c.name])), [planoContas]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [data, inad, chargeMap] = await Promise.all([
                receivableService.list(effectiveOrgId, { search, status: statusFilter, dueFrom: dueFrom || undefined, dueTo: dueTo || undefined }),
                receivableService.getInadimplencia(effectiveOrgId),
                clientChargeService.byTransaction(effectiveOrgId).catch(() => ({} as Record<string, ClientCharge>)),
            ]);
            setRows(data);
            setInad(inad.filter(f => f.count > 0));
            setCharges(chargeMap);
            setSelectedIds(new Set());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar');
        } finally {
            setLoading(false);
        }
    }, [effectiveOrgId, search, statusFilter, dueFrom, dueTo]);

    useEffect(() => { load(); }, [load]);

    async function handleBaixa(receivable: Receivable) {
        const ok = await confirm({
            title: 'Confirmar Recebimento',
            message: (
                <>
                    Marcar <b>{receivable.description ?? '(sem descrição)'}</b> como <b className="text-green-700">RECEBIDO</b>?
                    <div className="bg-gray-50 rounded-xl p-3 mt-3 flex justify-between items-center">
                        <span className="text-xs text-gray-500">Valor</span>
                        <span className="font-bold text-gray-900">{fmt(receivable.amount)}</span>
                    </div>
                </>
            ),
            variant: 'default',
            confirmLabel: 'Confirmar',
        });
        if (!ok) return;
        try {
            await receivableService.updateStatus(receivable.id, 'RECEBIDO');
            await load();
            notify('Recebível baixado com sucesso.');
        } catch (e) {
            notify('Erro: ' + (e instanceof Error ? e.message : 'Falha ao baixar'), 'error');
        }
    }

    /**
     * Exclusão só de lançamento manual — os demais são espelho de outro módulo
     * (negócio, contrato, NF-e) e voltariam no próximo sync. O serviço repete
     * essa trava no banco; aqui é só o gate da UI.
     */
    async function handleDelete(r: Receivable) {
        const ok = await confirm({
            title: 'Excluir lançamento?',
            message: (
                <>
                    Excluir <b>{r.description ?? '(sem descrição)'}</b> de <b>{r.party_name ?? '—'}</b>?
                    <div className="bg-gray-50 rounded-xl p-3 mt-3 flex justify-between items-center">
                        <span className="text-xs text-gray-500">Valor</span>
                        <span className="font-bold text-gray-900">{fmt(r.amount)}</span>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">Essa ação não pode ser desfeita.</p>
                </>
            ),
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await receivableService.remove(r.id);
            await load();
            notify('Lançamento excluído.');
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Falha ao excluir', 'error');
        }
    }

    async function handleChangeStatus(id: string, newStatus: string) {
        setChangingStatus(id);
        try {
            await receivableService.updateStatus(id, newStatus as Parameters<typeof receivableService.updateStatus>[1]);
            await load();
        } catch (e) {
            notify('Erro: ' + (e instanceof Error ? e.message : 'Falha'), 'error');
        } finally {
            setChangingStatus(null);
        }
    }

    /** Injeta os nomes resolvidos de Centro de Custo/Plano de Contas — a view só
     *  traz os UUIDs (ver comentário na migration 20270847000000). */
    const rowsWithNames = useMemo(() => rows.map(r => ({
        ...r,
        cost_center_name: r.cost_center_id ? (costCenterNameById.get(r.cost_center_id) ?? '') : '',
        plano_de_contas_name: r.plano_de_contas_id ? (planoContasNameById.get(r.plano_de_contas_id) ?? '') : '',
    })), [rows, costCenterNameById, planoContasNameById]);

    const sorted = useMemo(() => {
        let result = applyFilterRules(rowsWithNames, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue);
        result = [...result];
        if (tableColumns.sortColumn) {
            result.sort((a, b) => {
                let va: string | number, vb: string | number;
                switch (tableColumns.sortColumn) {
                    case 'party_name':    va = (a.party_name ?? '').toLowerCase();    vb = (b.party_name ?? '').toLowerCase();    break;
                    case 'description':   va = (a.description ?? '').toLowerCase();   vb = (b.description ?? '').toLowerCase();   break;
                    case 'project_name':  va = (a.project_name ?? '').toLowerCase();  vb = (b.project_name ?? '').toLowerCase();  break;
                    case 'due_date':      va = a.due_date ?? '';                      vb = b.due_date ?? '';                      break;
                    case 'amount':        va = a.amount ?? 0;                         vb = b.amount ?? 0;                         break;
                    case 'cost_center_name':    va = (a.cost_center_name ?? '').toLowerCase();    vb = (b.cost_center_name ?? '').toLowerCase();    break;
                    case 'plano_de_contas_name': va = (a.plano_de_contas_name ?? '').toLowerCase(); vb = (b.plano_de_contas_name ?? '').toLowerCase(); break;
                    case 'status':        va = a.effective_status;                    vb = b.effective_status;                    break;
                    default:              return 0;
                }
                if (va < vb) return tableColumns.sortDirection === 'asc' ? -1 : 1;
                if (va > vb) return tableColumns.sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [rows, advancedFilters.rules, tableColumns.sortColumn, tableColumns.sortDirection]);

    /** Mesmo critério do botão "Baixar" por linha: só não-RECEBIDO pode ser baixado. */
    const isSelectable = (r: Receivable) => r.effective_status !== 'RECEBIDO';
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

    /** F4 (§10.1) — Shift+clique seleciona o intervalo entre a última linha marcada e a atual. */
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
                await receivableService.updateStatus(r.id, 'RECEBIDO');
                okIds.push(r.id);
            } catch {
                falhas.push(r.party_name ?? r.description ?? r.id);
            }
        }
        setSelectedIds(new Set());
        setBulkLoading(false);
        if (okIds.length) await load();
        if (falhas.length) {
            notify(`${okIds.length} baixado(s). Falha em ${falhas.length}: ${falhas.join(', ')}`, 'error');
        } else if (okIds.length) {
            notify(`${okIds.length} ${okIds.length !== 1 ? 'recebíveis baixados' : 'recebível baixado'}.`);
        }
    }

    const summary = useMemo(() => {
        const todayStr = today();
        const inicioMes = todayStr.slice(0, 7) + '-01';
        let aReceber = 0, vencidos = 0, recebidoMes = 0;
        rows.forEach(r => {
            if (r.effective_status === 'RECEBIDO') {
                if ((r.transaction_date ?? '') >= inicioMes) recebidoMes += r.amount;
            } else if (r.effective_status === 'VENCIDO') {
                vencidos += r.amount;
            } else if (!['CANCELADO','RECEBIDO'].includes(r.effective_status)) {
                aReceber += r.amount;
            }
        });
        return { aReceber, vencidos, recebidoMes };
    }, [rows]);

    const STATUS_OPTIONS: StatusFilter[] = ['all','PREVISTO','EMITIDO','ENVIADO','RECEBIDO','PARCIAL','VENCIDO','RENEGOCIADO'];

    return (
        <div className="space-y-6">
            {/* Cabeçalho de tela — §20 (flat, sem banda/logo; a sidebar já dá o contexto — §18) */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Contas a Receber</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Recebíveis de contratos, medições e parcelamentos.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard
                    label="A Receber"
                    value={fmt(summary.aReceber)}
                    sub={`${rows.filter(r => !['CANCELADO','RECEBIDO'].includes(r.effective_status)).length} títulos em aberto`}
                    icon={<DollarSign className="w-5 h-5" />}
                    color="blue"
                    onClick={() => setStatusFilter('all')}
                />
                <KpiCard
                    label="Vencidos"
                    value={fmt(summary.vencidos)}
                    sub={`${rows.filter(r => r.effective_status === 'VENCIDO').length} títulos vencidos`}
                    icon={<AlertTriangle className="w-5 h-5" />}
                    color={summary.vencidos > 0 ? 'red' : 'gray'}
                    onClick={() => setStatusFilter('VENCIDO')}
                />
                <KpiCard
                    label="Recebido (mês)"
                    value={fmt(summary.recebidoMes)}
                    sub={`${rows.filter(r => r.effective_status === 'RECEBIDO').length} títulos quitados`}
                    icon={<Check className="w-5 h-5" />}
                    color="emerald"
                    onClick={() => setStatusFilter('RECEBIDO')}
                />
            </div>

            {/* Inadimplência — bloco flat com radius compacto (§16), fora do card acoplado */}
            {inadimplencia.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-[10px] px-4 py-3">
                    <button
                        onClick={() => setShowInad(v => !v)}
                        className="flex items-center gap-2 text-xs font-semibold text-red-700"
                    >
                        <AlertCircle className="w-3.5 h-3.5" />
                        Inadimplência
                        {showInad ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {showInad && (
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {inadimplencia.map(f => (
                                <div key={f.faixa} className="bg-white rounded-[6px] p-2 border border-red-100">
                                    <p className="text-xs text-red-500 font-semibold">{f.faixa}</p>
                                    <p className="text-sm font-bold text-red-700">{fmt(f.valor)}</p>
                                    <p className="text-xs text-red-400">{f.count} título{f.count !== 1 ? 's' : ''}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Banner de erro fica FORA do card acoplado (§5.2) — dentro quebra a
                costura visível do border-b da toolbar. */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700 font-semibold">{error}</div>
            )}

            {/* Toolbar acoplada à tabela (§5.2) — toolbar e tabela dividem um único card;
                a costura visível entre elas é o border-b da toolbar. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por cliente, descrição ou obra..."
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

                        {/* Status — dropdown em vez de pills, para não competir por espaço
                            com os demais controles da toolbar (§5.3) */}
                        <div className="relative flex items-center h-9 shrink-0">
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                                className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none"
                            >
                                {STATUS_OPTIONS.map(s => (
                                    <option key={s} value={s}>{s === 'all' ? 'Todos' : STATUS_LABEL[s]}</option>
                                ))}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400 pointer-events-none absolute right-2.5" />
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

                        {/* Separador entre grupo "filtrar" e grupo "visualizar/ações" (§5.1) */}
                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        {/* Agrupador ColumnConfig — sem viewMode nesta tela (não há grid/lista) */}
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={RECEBER_COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            {/* Autofit sob comando explícito, nunca automático (§6.1.2) */}
                            <button
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Novo — CTA compacto §17 (verde = accent semântico "recebível" do módulo) */}
                        <button
                            onClick={handleNovoLancamento}
                            className="h-9 flex items-center gap-1.5 px-3.5 bg-green-600 hover:bg-green-700 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Novo
                        </button>
                    </div>

                    {showFilters && (
                        <div className="bg-gray-50 border border-gray-200 rounded-[10px] p-4 flex items-center gap-3 flex-wrap">
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

                {/* Conteúdo — tabela sem bg/border/rounded próprios (já dentro do card acoplado §5.2) */}
                <div>
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500 text-sm">Carregando recebíveis...</p>
                        </div>
                    ) : sorted.length === 0 ? (
                        <div className="text-center py-12">
                            <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum recebível encontrado</h3>
                            <p className="text-sm text-gray-500">Ajuste os filtros ou crie um novo lançamento.</p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-sm text-left border-collapse" style={{ tableLayout: 'fixed', width: RECEBER_COLUMNS.reduce((sum, c) => sum + (c.key === 'actions' ? 0 : tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 40 + cols.getWidth('actions')), minWidth: '100%' }}>
                            <colgroup>
                                <col style={{ width: '40px' }} />
                                {RECEBER_COLUMNS.filter(c => c.key !== 'actions').map(c => (
                                    tableColumns.visibleColumns.includes(c.key)
                                        ? <col key={c.key} data-col-key={c.key} style={{ width: `${cols.getWidth(c.key)}px` }} />
                                        : null
                                ))}
                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio,
                                    para a borda de "Ações" não andar a cada redimensionamento. */}
                                <col />
                                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                            </colgroup>
                            {/* thead sentence case (§6.2) — uppercase={false} porque SortableHeader
                                força uppercase internamente por padrão. */}
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="px-6 py-2 text-center border-r border-gray-100">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                            checked={allVisibleSelected}
                                            disabled={selectableVisible.length === 0}
                                            onChange={toggleAllVisible}
                                            title="Selecionar todos (não recebidos)"
                                        />
                                    </th>
                                    {tableColumns.visibleColumns.includes('party_name') && (
                                        <SortableHeader label="Cliente / Parte" colKey="party_name" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 text-left whitespace-nowrap border-r border-gray-100 relative overflow-hidden">
                                            <cols.ResizeHandle colKey="party_name" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('description') && (
                                        <SortableHeader label="Descrição" colKey="description" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 text-left whitespace-nowrap border-r border-gray-100 relative overflow-hidden">
                                            <cols.ResizeHandle colKey="description" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('project_name') && (
                                        <SortableHeader label="Obra" colKey="project_name" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 text-left whitespace-nowrap border-r border-gray-100 relative overflow-hidden">
                                            <cols.ResizeHandle colKey="project_name" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('due_date') && (
                                        <SortableHeader label="Vencimento" colKey="due_date" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 text-left whitespace-nowrap border-r border-gray-100 relative overflow-hidden">
                                            <cols.ResizeHandle colKey="due_date" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('amount') && (
                                        <SortableHeader label="Valor" colKey="amount" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 text-left whitespace-nowrap border-r border-gray-100 relative overflow-hidden">
                                            <cols.ResizeHandle colKey="amount" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader label="Status" colKey="status" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 text-left whitespace-nowrap border-r border-gray-100 relative overflow-hidden">
                                            <cols.ResizeHandle colKey="status" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('cost_center_name') && (
                                        <SortableHeader label="Centro de Custo" colKey="cost_center_name" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 text-left whitespace-nowrap border-r border-gray-100 relative overflow-hidden">
                                            <cols.ResizeHandle colKey="cost_center_name" />
                                        </SortableHeader>
                                    )}
                                    {tableColumns.visibleColumns.includes('plano_de_contas_name') && (
                                        <SortableHeader label="Plano de Contas" colKey="plano_de_contas_name" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 text-left whitespace-nowrap border-r border-gray-100 relative overflow-hidden">
                                            <cols.ResizeHandle colKey="plano_de_contas_name" />
                                        </SortableHeader>
                                    )}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500 relative overflow-hidden">
                                            Ações
                                            <cols.ResizeHandle colKey="actions" />
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {sorted.map(r => {
                                    const isVencido = r.effective_status === 'VENCIDO';
                                    const isRecebido = r.effective_status === 'RECEBIDO';
                                    // Só lançamento manual é editável/excluível aqui: os demais
                                    // são espelho de outro módulo e voltariam no próximo sync.
                                    const isManual = r.source_system === 'MANUAL';
                                    return (
                                        <tr key={r.id} className={`hover:bg-blue-50/50 transition-colors ${selectedIds.has(r.id) ? 'bg-blue-50/60' : isVencido ? 'bg-red-50/30' : ''}`}>
                                            <td className="px-6 py-2.5 text-center border-r border-gray-100">
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
                                            {tableColumns.visibleColumns.includes('party_name') && (
                                                <td className="px-6 py-2.5 text-sm font-normal text-gray-700 max-w-[160px] truncate border-r border-gray-100 last:border-r-0">
                                                    {r.party_name ?? <span className="text-gray-400 italic">—</span>}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('description') && (
                                                <td className="px-6 py-2.5 text-sm font-normal text-gray-700 max-w-[200px] truncate border-r border-gray-100 last:border-r-0">
                                                    {r.description ?? '—'}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('project_name') && (
                                                <td className="px-6 py-2.5 text-sm font-normal text-gray-700 max-w-[140px] truncate border-r border-gray-100 last:border-r-0">
                                                    {r.project_name ?? '—'}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('due_date') && (
                                                <td className={`px-6 py-2.5 text-sm font-normal whitespace-nowrap border-r border-gray-100 last:border-r-0 ${isVencido ? 'text-red-600' : 'text-gray-600'}`}>
                                                    {fmtDate(r.due_date)}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('amount') && (
                                                <td className="px-6 py-2.5 text-sm font-medium text-gray-800 whitespace-nowrap border-r border-gray-100 last:border-r-0">
                                                    {fmt(r.amount)}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('status') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <StatusBadge status={r.effective_status} />
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('cost_center_name') && (
                                                <td className="px-6 py-2.5 text-sm font-normal text-gray-700 max-w-[180px] truncate border-r border-gray-100 last:border-r-0">
                                                    {r.cost_center_name || '—'}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('plano_de_contas_name') && (
                                                <td className="px-6 py-2.5 text-sm font-normal text-gray-700 max-w-[180px] truncate border-r border-gray-100 last:border-r-0">
                                                    {r.plano_de_contas_name || '—'}
                                                </td>
                                            )}
                                            {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                                            {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5">
                                                <div className="flex items-center gap-1.5">
                                                    {!isRecebido && (
                                                        <button
                                                            onClick={() => handleBaixa(r)}
                                                            className="text-green-700 hover:text-green-800 text-sm font-medium p-1.5 hover:bg-green-50 rounded-[6px] transition-all flex items-center gap-1"
                                                        >
                                                            <Check className="w-3.5 h-3.5" /> Baixar
                                                        </button>
                                                    )}
                                                    {!isRecebido && (
                                                        charges[r.id] ? (
                                                            <button
                                                                onClick={() => setEmitindo(r)}
                                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all flex items-center gap-1"
                                                                title="Ver cobrança emitida"
                                                            >
                                                                <FileText className="w-3.5 h-3.5" /> Cobrança
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => setEmitindo(r)}
                                                                className="text-violet-700 hover:text-violet-800 text-sm font-medium p-1.5 hover:bg-violet-50 rounded-[6px] transition-all flex items-center gap-1"
                                                                title="Emitir boleto/PIX via Asaas"
                                                            >
                                                                <FileText className="w-3.5 h-3.5" /> Emitir
                                                            </button>
                                                        )
                                                    )}
                                                    {!isRecebido && (
                                                        <select
                                                            value={r.business_status}
                                                            disabled={changingStatus === r.id}
                                                            onChange={e => handleChangeStatus(r.id, e.target.value)}
                                                            className="text-sm font-normal border border-gray-200 rounded-[6px] px-2 py-1 bg-white focus:outline-none cursor-pointer"
                                                        >
                                                            {(['PREVISTO','EMITIDO','ENVIADO','PARCIAL','RENEGOCIADO','CANCELADO'] as const).map(s => (
                                                                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    {isManual && (
                                                        <>
                                                            <ActionIconButton
                                                                kind="edit"
                                                                title="Editar lançamento"
                                                                onClick={() => setEditando(r)}
                                                            />
                                                            <ActionIconButton
                                                                kind="delete"
                                                                title="Excluir lançamento"
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

                    {/* Contagem — rodapé dentro do card acoplado */}
                    {!loading && sorted.length > 0 && (
                        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
                            {sorted.length} título{sorted.length !== 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            </div>

            {/* Barra de ação em massa (F3) — §10: fixa no rodapé, paleta azul */}
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
                        Baixar (Recebido)
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
            {/* Editar/emitir: a organização sai do próprio registro aberto, então
                funciona igual em "Todas as organizações". */}
            {editando && (
                <NovoLancamentoModal
                    organizationId={editando.organization_id || effectiveOrgId || ''}
                    receivable={editando}
                    onSave={() => { setEditando(null); load(); }}
                    onClose={() => setEditando(null)}
                />
            )}
            {emitindo && (
                <EmitirCobrancaModal
                    organizationId={emitindo.organization_id || effectiveOrgId || ''}
                    receivable={emitindo}
                    existing={charges[emitindo.id]}
                    onDone={load}
                    onClose={() => setEmitindo(null)}
                />
            )}

            {/* Toast de Notificação — padrão guia seção 13 */}
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
