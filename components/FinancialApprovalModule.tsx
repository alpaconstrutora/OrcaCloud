import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle, Check, CheckCircle2, ChevronDown, ChevronUp,
    Loader2, Plus, Send, Settings, Shield, Trash2, X,
} from 'lucide-react';
import { financialApprovalService } from '../services/financialApprovalService';
import { approvalService, type ApprovalPendingSummary } from '../services/approvalService';
import type {
    FinancialApprovalConfig, ApprovalQueueItem, ApprovalStep,
} from '../types/financial';

// ─── helpers ────────────────────────────────────────────────

function fmt(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(d: string | null | undefined) {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
}

// ─── ApprovalTrail ───────────────────────────────────────────

function ApprovalTrail({ chain, required }: { chain: ApprovalStep[]; required: number }) {
    if (!chain.length) {
        return <p className="text-xs text-gray-400 italic">Aguardando aprovação…</p>;
    }
    return (
        <div className="space-y-1.5">
            {chain.map((s, i) => (
                <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${s.action === 'APROVADO' ? 'bg-green-50' : 'bg-red-50'}`}>
                    {s.action === 'APROVADO'
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                        : <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />}
                    <div>
                        <p className="font-bold text-gray-800">{s.role} — <span className={s.action === 'APROVADO' ? 'text-green-700' : 'text-red-700'}>{s.action}</span></p>
                        <p className="text-gray-400">{s.approved_by} · {fmtDate(s.approved_at.slice(0, 10))}</p>
                        {s.notes && <p className="text-gray-500 italic mt-0.5">"{s.notes}"</p>}
                    </div>
                </div>
            ))}
            {chain.filter(s => s.action === 'APROVADO').length < required && (
                <p className="text-xs text-amber-600 font-semibold">Aguardando nível {chain.filter(s => s.action === 'APROVADO').length + 1} de {required}…</p>
            )}
        </div>
    );
}

// ─── ApproveRejectModal ──────────────────────────────────────

interface ApproveRejectModalProps {
    item: ApprovalQueueItem;
    mode: 'approve' | 'reject';
    userEmail: string;
    config: FinancialApprovalConfig[];
    onDone: () => void;
    onClose: () => void;
}
function ApproveRejectModal({ item, mode, userEmail, config, onDone, onClose }: ApproveRejectModalProps) {
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const approvedLevels = item.approval_chain.filter(s => s.action === 'APROVADO').map(s => s.level);
    const nextLevel = (approvedLevels.includes(1) ? 2 : 1) as 1 | 2;

    const matchingConfig = config.find(c =>
        item.amount >= c.faixa_min && (c.faixa_max == null || item.amount < c.faixa_max)
    );

    async function handle() {
        if (mode === 'reject' && !notes.trim()) { setErr('Informe o motivo da rejeição.'); return; }
        setSaving(true);
        setErr(null);
        try {
            if (mode === 'approve') {
                await financialApprovalService.approve(item.id, nextLevel, userEmail, {
                    level1_label: matchingConfig?.level1_label ?? 'Gestor',
                    level2_label: matchingConfig?.level2_label ?? 'Financeiro / Diretoria',
                }, notes || undefined);
            } else {
                await financialApprovalService.reject(item.id, userEmail, notes);
            }
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Erro');
        } finally {
            setSaving(false);
        }
    }

    const isApprove = mode === 'approve';
    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                <div className="p-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${isApprove ? 'bg-green-100' : 'bg-red-100'}`}>
                        {isApprove ? <Check className="w-6 h-6 text-green-600" /> : <X className="w-6 h-6 text-red-500" />}
                    </div>
                    <h2 className="text-base font-black text-gray-900 mb-1">
                        {isApprove ? `Aprovar — Nível ${nextLevel}` : 'Rejeitar Aprovação'}
                    </h2>
                    <p className="text-sm text-gray-500 mb-4 truncate">{item.description ?? '(sem descrição)'}</p>
                    <div className="bg-gray-50 rounded-xl p-3 mb-4 flex justify-between">
                        <span className="text-xs text-gray-500">Valor</span>
                        <span className="font-black text-gray-900">{fmt(item.amount)}</span>
                    </div>
                    {err && <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg p-2 mb-3">{err}</p>}
                    <div className="mb-5">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                            {isApprove ? 'Observação (opcional)' : 'Motivo da rejeição *'}
                        </label>
                        <textarea
                            rows={3}
                            placeholder={isApprove ? 'Ex: Orçamento verificado, aprovado.' : 'Informe o motivo…'}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">
                            Cancelar
                        </button>
                        <button
                            onClick={handle}
                            disabled={saving}
                            className={`flex-1 px-4 py-2.5 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50 transition-colors ${isApprove ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'}`}
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isApprove ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                            {isApprove ? 'Confirmar Aprovação' : 'Confirmar Rejeição'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── ApprovalQueue ───────────────────────────────────────────

interface QueueProps {
    organizationId: string;
    userEmail: string;
    config: FinancialApprovalConfig[];
}
function ApprovalQueue({ organizationId, userEmail, config }: QueueProps) {
    const [items, setItems] = useState<ApprovalQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [modal, setModal] = useState<{ item: ApprovalQueueItem; mode: 'approve' | 'reject' } | null>(null);

    const [submittingId, setSubmittingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setItems(await financialApprovalService.listActionQueue(organizationId));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar fila');
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => { load(); }, [load]);

    async function handleSubmit(id: string) {
        setSubmittingId(id);
        try {
            await financialApprovalService.submitForApproval(id, organizationId);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao enviar para aprovação');
        } finally {
            setSubmittingId(null);
        }
    }

    if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
    if (error) return <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">{error}</div>;

    if (!items.length) return (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <CheckCircle2 className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-semibold">Nenhum item acima da alçada pendente de ação</p>
        </div>
    );

    return (
        <>
            <div className="divide-y divide-gray-50">
                {items.map(item => {
                    const approvedLevels = item.approval_chain.filter(s => s.action === 'APROVADO').map(s => s.level);
                    const isExpanded = expanded === item.id;
                    const isDraft = item.approval_status === 'RASCUNHO';
                    return (
                        <div key={item.id} className="bg-white">
                            <div className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <p className="text-sm font-bold text-gray-900 truncate">{item.description ?? '(sem descrição)'}</p>
                                        {isDraft ? (
                                            <span className="text-[10px] font-black text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full uppercase tracking-widest flex-shrink-0">
                                                Rascunho
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full uppercase tracking-widest flex-shrink-0">
                                                Nível {approvedLevels.length + 1}/{item.approval_required_levels}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                        {item.party_name && <span>{item.party_name}</span>}
                                        {item.project_name && <span>· {item.project_name}</span>}
                                        {item.due_date && <span>· Venc. {fmtDate(item.due_date)}</span>}
                                    </div>
                                </div>
                                <p className="text-base font-black text-gray-900 whitespace-nowrap">{fmt(item.amount)}</p>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {isDraft ? (
                                        <button
                                            onClick={() => handleSubmit(item.id)}
                                            disabled={submittingId === item.id}
                                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                                        >
                                            {submittingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Enviar p/ aprovação
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => setModal({ item, mode: 'approve' })}
                                                className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1"
                                            >
                                                <Check className="w-3 h-3" /> Aprovar
                                            </button>
                                            <button
                                                onClick={() => setModal({ item, mode: 'reject' })}
                                                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1"
                                            >
                                                <X className="w-3 h-3" /> Rejeitar
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={() => setExpanded(isExpanded ? null : item.id)}
                                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                    </button>
                                </div>
                            </div>
                            {isExpanded && (
                                <div className="px-6 pb-4">
                                    <ApprovalTrail chain={item.approval_chain} required={item.approval_required_levels} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {modal && (
                <ApproveRejectModal
                    item={modal.item}
                    mode={modal.mode}
                    userEmail={userEmail}
                    config={config}
                    onDone={() => { setModal(null); load(); }}
                    onClose={() => setModal(null)}
                />
            )}
        </>
    );
}

// ─── ApprovalConfigPanel ─────────────────────────────────────

interface ConfigPanelProps {
    organizationId: string;
}
function ApprovalConfigPanel({ organizationId }: ConfigPanelProps) {
    const [items, setItems] = useState<FinancialApprovalConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Partial<FinancialApprovalConfig> | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { setItems(await financialApprovalService.listConfig(organizationId)); }
        catch (e) { setError(e instanceof Error ? e.message : 'Erro'); }
        finally { setLoading(false); }
    }, [organizationId]);

    useEffect(() => { load(); }, [load]);

    function openNew() {
        setEditing({
            organization_id:  organizationId,
            faixa_min:        0,
            faixa_max:        null,
            required_levels:  1,
            level1_label:     'Gestor',
            level2_label:     'Financeiro / Diretoria',
            is_active:        true,
            sort_order:       items.length,
        });
    }

    async function handleSave() {
        if (!editing) return;
        setSaving(true);
        try {
            await financialApprovalService.upsertConfig(editing as FinancialApprovalConfig);
            setEditing(null);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!window.confirm('Remover esta faixa?')) return;
        try {
            await financialApprovalService.deleteConfig(id);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao remover');
        }
    }

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">Faixas de Alçada</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Configure os limites de valor e os níveis de aprovação exigidos.</p>
                </div>
                <button
                    onClick={openNew}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl transition-colors"
                >
                    <Plus className="w-4 h-4" /> Nova faixa
                </button>
            </div>

            {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">{error}</div>}

            {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
                    {items.length === 0 && (
                        <div className="p-8 text-center text-sm text-gray-400">
                            Nenhuma faixa configurada. Crie a primeira para ativar o fluxo de aprovação.
                        </div>
                    )}
                    {items.map(item => (
                        <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-black text-gray-900">
                                        {fmt(item.faixa_min)} — {item.faixa_max != null ? fmt(item.faixa_max) : 'Sem limite'}
                                    </span>
                                    {!item.is_active && (
                                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inativa</span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500">
                                    {item.required_levels === 1
                                        ? `1 nível: ${item.level1_label}`
                                        : `2 níveis: ${item.level1_label} → ${item.level2_label ?? 'Nível 2'}`}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setEditing({ ...item })}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-700"
                                >
                                    <Settings className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => item.id && handleDelete(item.id)}
                                    className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Edit modal */}
            {editing && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                                {editing.id ? 'Editar Faixa' : 'Nova Faixa'}
                            </h2>
                            <button onClick={() => setEditing(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                                <X className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Valor mínimo (R$)</label>
                                    <input
                                        type="number" min={0} step="1"
                                        value={editing.faixa_min ?? 0}
                                        onChange={e => setEditing(f => ({ ...f!, faixa_min: parseFloat(e.target.value) || 0 }))}
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Valor máximo (R$, vazio = sem limite)</label>
                                    <input
                                        type="number" min={0} step="1" placeholder="Sem limite"
                                        value={editing.faixa_max ?? ''}
                                        onChange={e => setEditing(f => ({ ...f!, faixa_max: e.target.value ? parseFloat(e.target.value) : null }))}
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Níveis de aprovação</label>
                                <div className="flex gap-2">
                                    {([1, 2] as const).map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setEditing(f => ({ ...f!, required_levels: n }))}
                                            className={`flex-1 py-2 rounded-xl text-sm font-black transition-all border ${editing.required_levels === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
                                        >
                                            {n === 1 ? '1 nível' : '2 níveis'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Rótulo Nível 1</label>
                                <input
                                    type="text" placeholder="Ex: Gestor"
                                    value={editing.level1_label ?? ''}
                                    onChange={e => setEditing(f => ({ ...f!, level1_label: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            {editing.required_levels === 2 && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Rótulo Nível 2</label>
                                    <input
                                        type="text" placeholder="Ex: Financeiro / Diretoria"
                                        value={editing.level2_label ?? ''}
                                        onChange={e => setEditing(f => ({ ...f!, level2_label: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            )}
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={editing.is_active ?? true}
                                    onChange={e => setEditing(f => ({ ...f!, is_active: e.target.checked }))}
                                    className="w-4 h-4 accent-blue-600"
                                />
                                <span className="text-sm font-semibold text-gray-700">Faixa ativa</span>
                            </label>
                        </div>
                        <div className="flex gap-3 px-6 pb-6">
                            <button onClick={() => setEditing(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── SoftPendingBanner ───────────────────────────────────────
// Enforcement SOFT: avisa (não bloqueia) sobre itens que caem em uma
// faixa de alçada mas ainda não foram aprovados. Read-only.

const ENTITY_LABEL: Record<string, string> = {
    transaction: 'saídas financeiras',
    contract:    'contratos',
    purchase_order: 'compras',
};

function SoftPendingBanner({ organizationId }: { organizationId: string }) {
    const [summary, setSummary] = useState<ApprovalPendingSummary[]>([]);

    useEffect(() => {
        if (!organizationId) return;
        approvalService.getPendingSummary(organizationId)
            .then(s => setSummary(s.filter(x => x.qtd > 0)))
            .catch(() => {});
    }, [organizationId]);

    const totalQtd = summary.reduce((a, x) => a + Number(x.qtd), 0);
    if (totalQtd === 0) return null;

    const totalSoma = summary.reduce((a, x) => a + Number(x.soma), 0);
    const partes = summary
        .map(x => `${x.qtd} ${ENTITY_LABEL[x.entity] ?? x.entity}`)
        .join(' · ');

    return (
        <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
                <p className="font-black text-amber-800">
                    {totalQtd} {totalQtd === 1 ? 'item acima da alçada sem aprovação' : 'itens acima da alçada sem aprovação'}
                    {' '}({fmt(totalSoma)})
                </p>
                <p className="text-amber-700 mt-0.5">{partes}.</p>
                <p className="text-amber-600/80 text-xs mt-1">
                    Aprovação recomendada, mas não obrigatória — os lançamentos seguem normalmente.
                </p>
            </div>
        </div>
    );
}

// ─── main ────────────────────────────────────────────────────

type Tab = 'fila' | 'config';

interface Props {
    organizationId?: string;
    userEmail?: string;
}

export default function FinancialApprovalModule({ organizationId = '', userEmail = '' }: Props) {
    const [tab, setTab] = useState<Tab>('fila');
    const [config, setConfig] = useState<FinancialApprovalConfig[]>([]);

    useEffect(() => {
        if (!organizationId) return;
        financialApprovalService.listConfig(organizationId).then(setConfig).catch(() => {});
    }, [organizationId]);

    const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
        { id: 'fila',   label: 'Fila de Aprovação', icon: Shield   },
        { id: 'config', label: 'Configurar Faixas',  icon: Settings },
    ];

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900">Aprovação Financeira</h1>
                        <p className="text-xs text-gray-500">Fluxo multinível por faixa de valor</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 border-b border-gray-100 -mb-4 -mx-6 px-6">
                    {TABS.map(t => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                className={[
                                    'flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-all -mb-px',
                                    tab === t.id
                                        ? 'border-blue-600 text-blue-700'
                                        : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
                                ].join(' ')}
                            >
                                <Icon className="w-3.5 h-3.5" /> {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
                {tab === 'fila' && (
                    <>
                        <SoftPendingBanner organizationId={organizationId} />
                        <ApprovalQueue
                            organizationId={organizationId}
                            userEmail={userEmail}
                            config={config}
                        />
                    </>
                )}
                {tab === 'config' && (
                    <ApprovalConfigPanel
                        organizationId={organizationId}
                    />
                )}
            </div>
        </div>
    );
}
