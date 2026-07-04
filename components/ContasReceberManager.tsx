import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, Building2, Check, ChevronDown, ChevronUp,
    Loader2, Plus, RefreshCw, Search, TrendingUp, X, Filter,
    FileText, QrCode, Copy, ExternalLink,
} from 'lucide-react';
import { receivableService } from '../services/receivableService';
import { clientChargeService } from '../services/clientChargeService';
import { asaasConfigService } from '../services/asaasConfigService';
import { clientService } from '../services/clientService';
import type { ClientCharge, BillingType } from '../services/clientChargeService';
import type { Receivable, ReceivableEffectiveStatus, InadimplenciaFaixa } from '../types/financial';
import type { Organization } from '../types';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { formatMoney as fmt, formatDateBR as fmtDate } from './ui/Format';

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

const STATUS_COLORS: Record<string, string> = {
    PREVISTO:    'bg-gray-100 text-gray-600 border-gray-200',
    EMITIDO:     'bg-blue-50 text-blue-700 border-blue-100',
    ENVIADO:     'bg-purple-50 text-purple-700 border-purple-100',
    RECEBIDO:    'bg-green-50 text-green-700 border-green-100',
    PARCIAL:     'bg-orange-50 text-orange-700 border-orange-100',
    VENCIDO:     'bg-red-50 text-red-700 border-red-100',
    RENEGOCIADO: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    CANCELADO:   'bg-gray-50 text-gray-400 border-gray-100',
};

const RECEBER_COLUMNS: ColumnConfig[] = [
    { key: 'party_name', label: 'Cliente / Descrição', sortable: true },
    { key: 'amount', label: 'Valor', sortable: true },
    { key: 'due_date', label: 'Vencimento', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'partial_amount', label: 'Recebido', sortable: true },
];

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-widest border ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            {status === 'VENCIDO' && <AlertCircle className="w-2.5 h-2.5 mr-1" />}
            {STATUS_LABEL[status] ?? status}
        </span>
    );
}

function today() { return new Date().toISOString().slice(0, 10); }

// ─── types ──────────────────────────────────────────────────

type StatusFilter = 'all' | ReceivableEffectiveStatus;

interface SortConfig { key: keyof Receivable; dir: 'asc' | 'desc' }

// ─── NovoLancamentoModal ─────────────────────────────────────

interface NovoModalProps {
    organizationId: string;
    onSave: () => void;
    onClose: () => void;
}
function NovoLancamentoModal({ organizationId, onSave, onClose }: NovoModalProps) {
    const [form, setForm] = useState({
        party_name: '',
        description: '',
        amount: '',
        due_date: today(),
        category: '',
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
            await receivableService.create(organizationId, {
                due_date:    form.due_date,
                amount:      parseFloat(form.amount.replace(',', '.')),
                description: form.description,
                party_id:    matched?.id,
                party_name:  form.party_name || undefined,
                party_type:  'CLIENT',
                category:    form.category || undefined,
            });
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
                    <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">Novo Recebível</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {err && <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg p-3">{err}</p>}
                    <div>
                        <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1">Cliente / Parte</label>
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
                        <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1">Descrição *</label>
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
                            <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1">Valor (R$) *</label>
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
                            <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1">Vencimento *</label>
                            <input
                                type="date"
                                value={form.due_date}
                                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1">Categoria</label>
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

// ─── BaixaModal ──────────────────────────────────────────────

interface BaixaModalProps {
    receivable: Receivable;
    onConfirm: () => void;
    onClose: () => void;
    saving: boolean;
}
function BaixaModal({ receivable, onConfirm, onClose, saving }: BaixaModalProps) {
    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                <div className="p-6">
                    <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center mb-4">
                        <Check className="w-6 h-6 text-green-600" />
                    </div>
                    <h2 className="text-base font-black text-gray-900 mb-1">Confirmar Recebimento</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        Marcar <span className="font-bold text-gray-800">{receivable.description ?? '(sem descrição)'}</span> como <span className="font-bold text-green-700">RECEBIDO</span>?
                    </p>
                    <div className="bg-gray-50 rounded-xl p-3 mb-5 flex justify-between items-center">
                        <span className="text-xs text-gray-500">Valor</span>
                        <span className="font-black text-gray-900">{fmt(receivable.amount)}</span>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                            Cancelar
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-colors flex items-center justify-center gap-2"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Confirmar
                        </button>
                    </div>
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
                    <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">Emitir Cobrança</h2>
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
                                <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-2">Forma de cobrança</label>
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
                                <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-2">Encargos por atraso</label>
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
                                <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-2">Desconto p/ pagamento antecipado</label>
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
                                                <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1">Valor (R$)</label>
                                                <input
                                                    type="number" min={0} step="0.01"
                                                    value={editAmount}
                                                    onChange={e => setEditAmount(e.target.value)}
                                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1">Vencimento</label>
                                                <input
                                                    type="date"
                                                    value={editDue}
                                                    onChange={e => setEditDue(e.target.value)}
                                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1">Descrição</label>
                                            <input
                                                type="text"
                                                value={editDesc}
                                                onChange={e => setEditDesc(e.target.value)}
                                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1">Forma de cobrança</label>
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
    onOrgChange?: (id: string) => void;
}

export default function ContasReceberManager({ organizationId, organizations, onOrgChange }: Props) {
    const [selectedOrgId, setSelectedOrgId] = useState<string>('ALL');
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
    const [sort, setSort]               = usePersistedState<SortConfig>('contasReceberManagerFilters:sort', { key: 'due_date', dir: 'asc' });
    // storageKey explícito — antes usava o default 'tableColumns' e colidia com
    // qualquer outro componente que também não passasse a chave.
    const tableColumns = useTableColumns(RECEBER_COLUMNS, 'contasReceberManagerColumns');

    const [showNovo, setShowNovo]         = useState(false);
    const [baixando, setBaixando]         = useState<Receivable | null>(null);
    const [savingBaixa, setSavingBaixa]   = useState(false);
    const [changingStatus, setChangingStatus] = useState<string | null>(null);
    const [charges, setCharges]           = useState<Record<string, ClientCharge>>({});
    const [emitindo, setEmitindo]         = useState<Receivable | null>(null);
    const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading]   = useState(false);

    const effectiveOrgId = selectedOrgId === 'ALL'
        ? (organizationId || organizations?.[0]?.id || '')
        : selectedOrgId;

    const load = useCallback(async () => {
        if (!effectiveOrgId) return;
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

    function handleOrgChange(id: string) {
        setSelectedOrgId(id);
        if (id !== 'ALL') onOrgChange?.(id);
    }

    function handleSort(key: keyof Receivable) {
        setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
    }

    async function handleBaixa() {
        if (!baixando) return;
        setSavingBaixa(true);
        try {
            await receivableService.updateStatus(baixando.id, 'RECEBIDO');
            setBaixando(null);
            await load();
        } catch (e) {
            alert('Erro: ' + (e instanceof Error ? e.message : 'Falha ao baixar'));
        } finally {
            setSavingBaixa(false);
        }
    }

    async function handleChangeStatus(id: string, newStatus: string) {
        setChangingStatus(id);
        try {
            await receivableService.updateStatus(id, newStatus as Parameters<typeof receivableService.updateStatus>[1]);
            await load();
        } catch (e) {
            alert('Erro: ' + (e instanceof Error ? e.message : 'Falha'));
        } finally {
            setChangingStatus(null);
        }
    }

    const sorted = useMemo(() => {
        const copy = [...rows];
        copy.sort((a, b) => {
            const va = (a[sort.key] ?? '') as string;
            const vb = (b[sort.key] ?? '') as string;
            const cmp = String(va).localeCompare(String(vb), 'pt-BR', { numeric: true });
            return sort.dir === 'asc' ? cmp : -cmp;
        });
        return copy;
    }, [rows, sort]);

    /** Mesmo critério do botão "Baixar" por linha: só não-RECEBIDO pode ser baixado. */
    const isSelectable = (r: Receivable) => r.effective_status !== 'RECEBIDO';
    const selectableVisible = useMemo(() => sorted.filter(isSelectable), [sorted]);
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
            alert(`${okIds.length} baixado(s). Falha em ${falhas.length}: ${falhas.join(', ')}`);
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

    const SortIcon = ({ k }: { k: keyof Receivable }) =>
        sort.key === k
            ? sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
            : null;

    const STATUS_OPTIONS: StatusFilter[] = ['all','PREVISTO','EMITIDO','ENVIADO','RECEBIDO','PARCIAL','VENCIDO','RENEGOCIADO'];

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Contas a Receber</h1>
                            <p className="text-xs text-gray-500">Recebíveis de contratos, medições e parcelamentos</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {organizations && organizations.length > 1 && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                                <select
                                    value={selectedOrgId}
                                    onChange={e => handleOrgChange(e.target.value)}
                                    className="bg-transparent outline-none text-gray-700 font-medium pr-5 cursor-pointer"
                                >
                                    <option value="ALL">Todas as Organizações</option>
                                    {organizations.map(o => (
                                        <option key={o.id} value={o.id}>{o.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button
                            onClick={() => setShowNovo(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-black rounded-xl transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Novo
                        </button>
                        <button
                            onClick={load}
                            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                            title="Atualizar"
                        >
                            <RefreshCw className="w-4 h-4 text-gray-500" />
                        </button>
                    </div>
                </div>

                {/* KPI summary */}
                <div className="grid grid-cols-3 gap-4 mt-4">
                    {[
                        { label: 'A Receber', value: summary.aReceber,    color: 'text-blue-700' },
                        { label: 'Vencidos',  value: summary.vencidos,    color: summary.vencidos > 0 ? 'text-red-600' : 'text-gray-700' },
                        { label: 'Recebido (mês)', value: summary.recebidoMes, color: 'text-green-700' },
                    ].map(k => (
                        <div key={k.label} className="bg-gray-50 rounded-xl p-3">
                            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-0.5">{k.label}</p>
                            <p className={`text-base font-black ${k.color}`}>{fmt(k.value)}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Inadimplência */}
            {inadimplencia.length > 0 && (
                <div className="bg-red-50 border-b border-red-100 px-6 py-3 flex-shrink-0">
                    <button
                        onClick={() => setShowInad(v => !v)}
                        className="flex items-center gap-2 text-button font-black text-red-700 uppercase tracking-widest"
                    >
                        <AlertCircle className="w-3.5 h-3.5" />
                        Inadimplência
                        {showInad ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {showInad && (
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {inadimplencia.map(f => (
                                <div key={f.faixa} className="bg-white rounded-lg p-2 border border-red-100">
                                    <p className="text-xs text-red-500 font-bold uppercase">{f.faixa}</p>
                                    <p className="text-sm font-black text-red-700">{fmt(f.valor)}</p>
                                    <p className="text-xs text-red-400">{f.count} título{f.count !== 1 ? 's' : ''}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Toolbar */}
            <div className="bg-white border-b border-gray-100 px-6 py-3 flex-shrink-0">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[180px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por cliente, descrição ou obra..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Status tabs */}
                    <div className="flex items-center gap-1 overflow-x-auto">
                        {STATUS_OPTIONS.map(s => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                                    statusFilter === s
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                            >
                                {s === 'all' ? 'Todos' : STATUS_LABEL[s]}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setShowFilters(v => !v)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-button font-bold border transition-all ${showFilters ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                        <Filter className="w-3.5 h-3.5" /> Filtros
                    </button>
                </div>

                {showFilters && (
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-semibold">Venc. de</span>
                            <input type="date" value={dueFrom} onChange={e => setDueFrom(e.target.value)}
                                className="border border-gray-200 rounded-lg px-2 py-1.5 text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-semibold">até</span>
                            <input type="date" value={dueTo} onChange={e => setDueTo(e.target.value)}
                                className="border border-gray-200 rounded-lg px-2 py-1.5 text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        {(dueFrom || dueTo) && (
                            <button onClick={() => { setDueFrom(''); setDueTo(''); }}
                                className="text-button text-blue-600 font-bold hover:underline flex items-center gap-1">
                                <X className="w-3 h-3" /> Limpar datas
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Barra de ação em massa (F3) */}
            {selectedVisible.length > 0 && (
                <div className="flex items-center gap-4 bg-green-600 text-white px-6 py-3 flex-shrink-0">
                    <span className="text-sm font-semibold">
                        {selectedVisible.length} selecionado{selectedVisible.length !== 1 ? 's' : ''}
                        <span className="ml-2 font-normal text-green-100">{fmt(selectedTotal)}</span>
                    </span>
                    <div className="flex-1" />
                    <button
                        onClick={handleBulkBaixa}
                        disabled={bulkLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-green-700 text-sm font-semibold hover:bg-green-50 disabled:opacity-60 transition-colors"
                    >
                        {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Baixar (Recebido)
                    </button>
                    <button
                        onClick={clearSelection}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm font-medium text-green-100 hover:text-white hover:bg-green-500 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" /> Limpar
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {error && (
                    <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">{error}</div>
                )}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                ) : sorted.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <TrendingUp className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-sm font-semibold">Nenhum recebível encontrado</p>
                        <p className="text-xs mt-1">Ajuste os filtros ou crie um novo lançamento</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="w-10 px-4 py-3 text-center">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer disabled:opacity-40"
                                        checked={allVisibleSelected}
                                        disabled={selectableVisible.length === 0}
                                        onChange={toggleAllVisible}
                                        title="Selecionar todos (não recebidos)"
                                    />
                                </th>
                                {[
                                    { label: 'Cliente / Parte',  key: 'party_name'       },
                                    { label: 'Descrição',        key: 'description'      },
                                    { label: 'Obra',             key: 'project_name'     },
                                    { label: 'Vencimento',       key: 'due_date'         },
                                    { label: 'Valor',            key: 'amount'           },
                                    { label: 'Status',           key: 'effective_status' },
                                    { label: 'Ações',            key: null               },
                                ].map(col => (
                                    <th
                                        key={col.label}
                                        onClick={() => col.key && handleSort(col.key as keyof Receivable)}
                                        className={`px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-500 whitespace-nowrap ${col.key ? 'cursor-pointer hover:text-gray-800 select-none' : ''}`}
                                    >
                                        <span className="flex items-center gap-1">
                                            {col.label}
                                            {col.key && <SortIcon k={col.key as keyof Receivable} />}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {sorted.map(r => {
                                const isVencido = r.effective_status === 'VENCIDO';
                                const isRecebido = r.effective_status === 'RECEBIDO';
                                return (
                                    <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(r.id) ? 'bg-green-50/60' : isVencido ? 'bg-red-50/30' : ''}`}>
                                        <td className="w-10 px-4 py-3 text-center">
                                            {isSelectable(r) ? (
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                                                    checked={selectedIds.has(r.id)}
                                                    onChange={() => toggleRow(r.id)}
                                                />
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-gray-900 max-w-[160px] truncate">
                                            {r.party_name ?? <span className="text-gray-400 italic">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                                            {r.description ?? '—'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-table-body max-w-[140px] truncate">
                                            {r.project_name ?? '—'}
                                        </td>
                                        <td className={`px-4 py-3 font-mono text-table-body whitespace-nowrap ${isVencido ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                            {fmtDate(r.due_date)}
                                        </td>
                                        <td className="px-4 py-3 font-black text-gray-900 whitespace-nowrap">
                                            {fmt(r.amount)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={r.effective_status} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {!isRecebido && (
                                                    <button
                                                        onClick={() => setBaixando(r)}
                                                        className="px-2.5 py-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1"
                                                    >
                                                        <Check className="w-3 h-3" /> Baixar
                                                    </button>
                                                )}
                                                {!isRecebido && (
                                                    charges[r.id] ? (
                                                        <button
                                                            onClick={() => setEmitindo(r)}
                                                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1"
                                                            title="Ver cobrança emitida"
                                                        >
                                                            <FileText className="w-3 h-3" /> Cobrança
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => setEmitindo(r)}
                                                            className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1"
                                                            title="Emitir boleto/PIX via Asaas"
                                                        >
                                                            <FileText className="w-3 h-3" /> Emitir
                                                        </button>
                                                    )
                                                )}
                                                {!isRecebido && (
                                                    <select
                                                        value={r.business_status}
                                                        disabled={changingStatus === r.id}
                                                        onChange={e => handleChangeStatus(r.id, e.target.value)}
                                                        className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none cursor-pointer"
                                                    >
                                                        {(['PREVISTO','EMITIDO','ENVIADO','PARCIAL','RENEGOCIADO','CANCELADO'] as const).map(s => (
                                                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer count */}
            {!loading && (
                <div className="bg-white border-t border-gray-100 px-6 py-2 flex-shrink-0">
                    <p className="text-xs text-gray-400">
                        {sorted.length} título{sorted.length !== 1 ? 's' : ''}
                    </p>
                </div>
            )}

            {/* Modals */}
            {showNovo && (
                <NovoLancamentoModal
                    organizationId={effectiveOrgId}
                    onSave={() => { setShowNovo(false); load(); }}
                    onClose={() => setShowNovo(false)}
                />
            )}
            {baixando && (
                <BaixaModal
                    receivable={baixando}
                    onConfirm={handleBaixa}
                    onClose={() => setBaixando(null)}
                    saving={savingBaixa}
                />
            )}
            {emitindo && (
                <EmitirCobrancaModal
                    organizationId={effectiveOrgId}
                    receivable={emitindo}
                    existing={charges[emitindo.id]}
                    onDone={load}
                    onClose={() => setEmitindo(null)}
                />
            )}
        </div>
    );
}
