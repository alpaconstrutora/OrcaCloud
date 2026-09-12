import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, Check, CheckCircle2, ChevronDown, ChevronUp,
    Loader2, Plus, Send, Settings, Shield, X,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import TabsBar from './ui/TabsBar';
import { usePersistedState } from './ui/TableUtils';
import { financialApprovalService } from '../services/financialApprovalService';
import { blueprintApprovalService } from '../services/blueprintApprovalService';
import { contractService } from '../services/contractService';
import { orderService } from '../services/orderService';
import { approvalService, type ApprovalPendingSummary, type ActionQueueItem } from '../services/approvalService';
import type {
    FinancialApprovalConfig, ApprovalStep,
} from '../types/financial';
import Button from './ui/Button';
import { formatMoney as fmt, formatDateBR as fmtDate } from './ui/Format';
import { useConfirm } from './ui/confirm';

// ─── dispatch por entidade ───────────────────────────────────
// A fila é unificada; cada ação vai ao serviço de domínio correto.

export const ENTITY_TAG: Record<ActionQueueItem['entity'], string> = {
    transaction:    'Transação',
    contract:       'Contrato',
    purchase_order: 'Compra',
    process_step:   'Processo',
    blueprint_snapshot: 'Planta',
};

// ⚠️ Toda entidade nova PRECISA aparecer nos três dispatches abaixo. O `return`
// final cai no serviço FINANCEIRO, que escreve em `internal_transactions` — uma
// entidade esquecida aqui seria aprovada contra a tabela errada, e a fila
// mostraria a ação como concluída.
function dispatchSubmit(item: ActionQueueItem, organizationId: string): Promise<unknown> {
    if (item.entity === 'blueprint_snapshot')
        return blueprintApprovalService.enviarParaAprovacao(item.id, organizationId);
    if (item.entity === 'contract')       return contractService.submitForApproval(item.id);
    if (item.entity === 'purchase_order') return orderService.submitForApproval(item.id, organizationId);
    return financialApprovalService.submitForApproval(item.id, organizationId);
}

function dispatchApprove(
    item: ActionQueueItem, level: 1 | 2, userEmail: string,
    labels: { level1_label: string; level2_label?: string }, notes?: string,
): Promise<unknown> {
    if (item.entity === 'blueprint_snapshot')
        return blueprintApprovalService.aprovar(item.id, level, userEmail, labels, notes);
    if (item.entity === 'contract')       return contractService.approveContract(item.id, level, userEmail, notes);
    if (item.entity === 'purchase_order') return orderService.approveOrder(item.id, level, userEmail, notes);
    return financialApprovalService.approve(item.id, level, userEmail, labels, notes);
}

function dispatchReject(item: ActionQueueItem, userEmail: string, reason: string): Promise<unknown> {
    if (item.entity === 'blueprint_snapshot')
        return blueprintApprovalService.rejeitar(item.id, userEmail, reason);
    if (item.entity === 'contract')       return contractService.rejectContract(item.id, userEmail, reason);
    if (item.entity === 'purchase_order') return orderService.rejectOrder(item.id, userEmail, reason);
    return financialApprovalService.reject(item.id, userEmail, reason);
}

// ─── ApprovalTrail ───────────────────────────────────────────
// Linha de detalhe (renderExpanded) abaixo do item da fila.

function ApprovalTrail({ chain, required }: { chain: ApprovalStep[]; required: number }) {
    const approvedCount = chain.filter(s => s.action === 'APROVADO').length;
    if (!chain.length) {
        return <p className="text-sm text-gray-400 italic">Aguardando aprovação…</p>;
    }
    return (
        <div className="space-y-1.5">
            {chain.map((s, i) => (
                <div key={i} className={`flex items-start gap-2 p-2 rounded-[6px] text-sm ${s.action === 'APROVADO' ? 'bg-green-50' : 'bg-red-50'}`}>
                    {s.action === 'APROVADO'
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-1" />
                        : <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-1" />}
                    <div>
                        <p className="font-medium text-gray-800">{s.role} — <span className={s.action === 'APROVADO' ? 'text-green-700' : 'text-red-700'}>{s.action}</span></p>
                        <p className="text-gray-400">{s.approved_by} · {fmtDate(s.approved_at.slice(0, 10))}</p>
                        {s.notes && <p className="text-gray-500 italic mt-0.5">"{s.notes}"</p>}
                    </div>
                </div>
            ))}
            {approvedCount < required && (
                <p className="text-sm text-amber-700">Aguardando nível {approvedCount + 1} de {required}…</p>
            )}
        </div>
    );
}

// ─── ApproveRejectModal ──────────────────────────────────────
// Exportado: `CentralControle.tsx` reaproveita o mesmo modal.

const INPUT_CLASS = 'w-full border border-gray-200 rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const LABEL_CLASS = 'block text-xs font-semibold text-slate-500 mb-1';

export interface ApproveRejectModalProps {
    item: ActionQueueItem;
    mode: 'approve' | 'reject';
    userEmail: string;
    config: FinancialApprovalConfig[];
    onDone: () => void;
    onClose: () => void;
}
export function ApproveRejectModal({ item, mode, userEmail, config, onDone, onClose }: ApproveRejectModalProps) {
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
                await dispatchApprove(item, nextLevel, userEmail, {
                    level1_label: matchingConfig?.level1_label ?? 'Gestor',
                    level2_label: matchingConfig?.level2_label ?? 'Financeiro / Diretoria',
                }, notes || undefined);
            } else {
                await dispatchReject(item, userEmail, notes);
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
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-sm">
                <div className="p-6">
                    <div className={`w-12 h-12 rounded-[10px] flex items-center justify-center mb-4 ${isApprove ? 'bg-green-100' : 'bg-red-100'}`}>
                        {isApprove ? <Check className="w-6 h-6 text-green-600" /> : <X className="w-6 h-6 text-red-500" />}
                    </div>
                    {/* §21 — título de modal em sentence case, sem uppercase */}
                    <h3 className="font-black text-slate-800 text-lg mb-1">
                        {isApprove ? `Aprovar — nível ${nextLevel}` : 'Rejeitar aprovação'}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4 truncate" title={item.title}>{ENTITY_TAG[item.entity]} · {item.title}</p>
                    <div className="bg-gray-50 rounded-[6px] p-3 mb-4 flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-500">Valor</span>
                        <span className="text-sm font-medium text-gray-800">{fmt(item.amount)}</span>
                    </div>
                    {err && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-[6px] p-2 mb-3">{err}</p>}
                    <div className="mb-5">
                        <label className={LABEL_CLASS}>
                            {isApprove ? 'Observação (opcional)' : 'Motivo da rejeição *'}
                        </label>
                        <textarea
                            rows={3}
                            placeholder={isApprove ? 'Ex: Orçamento verificado, aprovado.' : 'Informe o motivo…'}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className={`${INPUT_CLASS} resize-none`}
                        />
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="h-9 px-4 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                            Cancelar
                        </button>
                        <button
                            onClick={handle}
                            disabled={saving}
                            className={`flex-1 h-9 px-3.5 text-white rounded-[6px] text-[13px] font-medium whitespace-nowrap flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all active:scale-95 ${isApprove ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'}`}
                        >
                            {saving ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : isApprove ? <Check className="w-[15px] h-[15px]" /> : <X className="w-[15px] h-[15px]" />}
                            {isApprove ? 'Confirmar aprovação' : 'Confirmar rejeição'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── ApprovalQueue ───────────────────────────────────────────

// Colunas de DADO da fila — "Ações" entra por `actions` (§6.10).
const QUEUE_COLUMNS: StandardTableColumn[] = [
    { key: 'entity',       label: 'Tipo',       sortable: true, width: 100 },
    { key: 'title',        label: 'Título',     sortable: true, width: 230 },
    { key: 'party_name',   label: 'Parte',      sortable: true, width: 170 },
    { key: 'project_name', label: 'Obra',       sortable: true, width: 140 },
    { key: 'due_date',     label: 'Vencimento', sortable: true, width: 110 },
    { key: 'amount',       label: 'Valor',      sortable: true, width: 130, align: 'right' },
    { key: 'status',       label: 'Status',     sortable: true, width: 110 },
];

type EntityFilter = 'all' | ActionQueueItem['entity'];

function queueStatusLabel(item: ActionQueueItem): string {
    if (item.approval_status === 'RASCUNHO') return 'Rascunho';
    const approved = item.approval_chain.filter(s => s.action === 'APROVADO').length;
    return `Nível ${approved + 1}/${item.approval_required_levels}`;
}

const ACTION_LINK = 'text-sm font-medium p-1.5 rounded-[6px] transition-all whitespace-nowrap disabled:opacity-50';

interface QueueProps {
    organizationId: string;
    userEmail: string;
    config: FinancialApprovalConfig[];
}
function ApprovalQueue({ organizationId, userEmail, config }: QueueProps) {
    const [items, setItems] = useState<ActionQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [modal, setModal] = useState<{ item: ActionQueueItem; mode: 'approve' | 'reject' } | null>(null);
    const [entityFilter, setEntityFilter] = usePersistedState<EntityFilter>('financeiro:aprovacao:fila:tipo', 'all');

    const [submittingId, setSubmittingId] = useState<string | null>(null);

    // Recarga completa: os serviços de aprovação não devolvem o item com a
    // cadeia atualizada, então não dá para atualizar o array local (§22).
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setItems(await approvalService.listActionQueue(organizationId));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar fila');
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => { load(); }, [load]);

    async function handleSubmit(item: ActionQueueItem) {
        setSubmittingId(item.id);
        try {
            await dispatchSubmit(item, organizationId);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao enviar para aprovação');
        } finally {
            setSubmittingId(null);
        }
    }

    // Memoizado: a paginação do StandardTable volta à página 1 quando `rows`
    // muda de identidade — um `.filter()` solto aqui zeraria a página a cada render.
    const rows = useMemo(
        () => (entityFilter === 'all' ? items : items.filter(i => i.entity === entityFilter)),
        [items, entityFilter],
    );

    function renderCell(key: string, item: ActionQueueItem) {
        switch (key) {
            case 'entity':
                return <span className="text-sm font-normal text-gray-600">{ENTITY_TAG[item.entity]}</span>;
            case 'title':
                return <span className="block truncate text-sm font-normal text-gray-700" title={item.title}>{item.title}</span>;
            case 'party_name':
                return item.party_name
                    ? <span className="block truncate text-sm font-normal text-gray-700" title={item.party_name}>{item.party_name}</span>
                    : <span className="text-sm font-normal text-gray-400">—</span>;
            case 'project_name':
                return item.project_name
                    ? <span className="block truncate text-sm font-normal text-gray-700" title={item.project_name}>{item.project_name}</span>
                    : <span className="text-sm font-normal text-gray-400">—</span>;
            case 'due_date':
                return <span className="text-sm font-normal text-gray-600">{item.due_date ? fmtDate(item.due_date) : '—'}</span>;
            case 'amount':
                return <span className="text-sm font-medium text-gray-800">{fmt(item.amount)}</span>;
            case 'status':
                // §8 — texto colorido simples, sem pílula/fundo/uppercase
                return item.approval_status === 'RASCUNHO'
                    ? <span className="text-sm font-normal text-gray-600">Rascunho</span>
                    : <span className="text-sm font-normal text-amber-700">{queueStatusLabel(item)}</span>;
            default:
                return null;
        }
    }

    return (
        <>
            {/* Banner de erro fora do card acoplado (§5.2) */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700 mb-3">{error}</div>
            )}

            <StandardTable<ActionQueueItem>
                storageKey="financeiro:aprovacao:fila"
                columns={QUEUE_COLUMNS}
                rows={rows}
                rowKey={i => i.id}
                loading={loading}
                pagination={{ defaultPageSize: 100 }}
                searchText={i => `${ENTITY_TAG[i.entity]} ${i.title} ${i.party_name ?? ''} ${i.project_name ?? ''}`}
                searchPlaceholder="Buscar por título, parte ou obra..."
                filters={
                    <select
                        value={entityFilter}
                        onChange={e => setEntityFilter(e.target.value as EntityFilter)}
                        className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                    >
                        <option value="all">Todos os tipos</option>
                        {(Object.keys(ENTITY_TAG) as ActionQueueItem['entity'][]).map(k => (
                            <option key={k} value={k}>{ENTITY_TAG[k]}</option>
                        ))}
                    </select>
                }
                sortValue={(key, i) => {
                    if (key === 'entity') return ENTITY_TAG[i.entity];
                    if (key === 'status') return queueStatusLabel(i);
                    if (key === 'amount') return i.amount;
                    return (i as unknown as Record<string, string | undefined>)[key] ?? null;
                }}
                renderCell={renderCell}
                actions={{
                    width: 260,
                    render: item => {
                        const isDraft = item.approval_status === 'RASCUNHO';
                        const isExpanded = expanded === item.id;
                        return (
                            <>
                                {isDraft ? (
                                    <button
                                        onClick={() => handleSubmit(item)}
                                        disabled={submittingId === item.id}
                                        className={`${ACTION_LINK} text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex items-center gap-1`}
                                    >
                                        {submittingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                        Enviar p/ aprovação
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setModal({ item, mode: 'approve' })}
                                            className={`${ACTION_LINK} text-green-700 hover:text-green-800 hover:bg-green-50`}
                                        >
                                            Aprovar
                                        </button>
                                        <button
                                            onClick={() => setModal({ item, mode: 'reject' })}
                                            className={`${ACTION_LINK} text-red-600 hover:text-red-700 hover:bg-red-50`}
                                        >
                                            Rejeitar
                                        </button>
                                    </>
                                )}
                                <ActionIconButton
                                    kind="history"
                                    title={isExpanded ? 'Ocultar trilha de aprovação' : 'Ver trilha de aprovação'}
                                    icon={isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    onClick={() => setExpanded(isExpanded ? null : item.id)}
                                />
                            </>
                        );
                    },
                }}
                renderExpanded={(item, visibleCount) => expanded !== item.id ? null : (
                    <tr className="bg-gray-50/50">
                        <td colSpan={visibleCount} className="px-6 py-4">
                            <ApprovalTrail chain={item.approval_chain} required={item.approval_required_levels} />
                        </td>
                    </tr>
                )}
                empty={{
                    icon: <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum item pendente de ação',
                    subtitle: 'Nada acima da alçada aguardando envio, aprovação ou rejeição.',
                }}
            />

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

// ─── Faixas de alçada — tabela + modal ───────────────────────

const CONFIG_COLUMNS: StandardTableColumn[] = [
    { key: 'faixa_min',       label: 'Valor mínimo', sortable: true, width: 160, align: 'right' },
    { key: 'faixa_max',       label: 'Valor máximo', sortable: true, width: 160, align: 'right' },
    { key: 'required_levels', label: 'Níveis',       sortable: true, width: 100 },
    { key: 'level1_label',    label: 'Nível 1',      sortable: true, width: 200 },
    { key: 'level2_label',    label: 'Nível 2',      sortable: true, width: 220 },
    { key: 'is_active',       label: 'Status',       sortable: true, width: 110 },
];

interface ConfigTableProps {
    items: FinancialApprovalConfig[];
    loading: boolean;
    onEdit: (item: FinancialApprovalConfig) => void;
    onDelete: (item: FinancialApprovalConfig) => void;
}
function ApprovalConfigTable({ items, loading, onEdit, onDelete }: ConfigTableProps) {
    function renderCell(key: string, item: FinancialApprovalConfig) {
        switch (key) {
            case 'faixa_min':
                return <span className="text-sm font-medium text-gray-800">{fmt(item.faixa_min)}</span>;
            case 'faixa_max':
                return item.faixa_max != null
                    ? <span className="text-sm font-medium text-gray-800">{fmt(item.faixa_max)}</span>
                    : <span className="text-sm font-normal text-gray-400">Sem limite</span>;
            case 'required_levels':
                return <span className="text-sm font-normal text-gray-600">{item.required_levels === 1 ? '1 nível' : '2 níveis'}</span>;
            case 'level1_label':
                return <span className="block truncate text-sm font-normal text-gray-700" title={item.level1_label}>{item.level1_label}</span>;
            case 'level2_label':
                return item.required_levels === 2
                    ? <span className="block truncate text-sm font-normal text-gray-700" title={item.level2_label ?? ''}>{item.level2_label ?? 'Nível 2'}</span>
                    : <span className="text-sm font-normal text-gray-400">—</span>;
            case 'is_active':
                // §8 — texto colorido simples
                return item.is_active
                    ? <span className="text-sm font-normal text-green-700">Ativa</span>
                    : <span className="text-sm font-normal text-gray-500">Inativa</span>;
            default:
                return null;
        }
    }

    return (
        <StandardTable<FinancialApprovalConfig>
            storageKey="financeiro:aprovacao:faixas"
            columns={CONFIG_COLUMNS}
            rows={items}
            rowKey={i => i.id ?? `${i.faixa_min}-${i.faixa_max ?? 'inf'}`}
            loading={loading}
            searchText={i => `${i.level1_label} ${i.level2_label ?? ''} ${i.faixa_min} ${i.faixa_max ?? ''}`}
            searchPlaceholder="Buscar por rótulo de nível ou valor..."
            sortValue={(key, i) => {
                // "Sem limite" ordena depois de qualquer valor
                if (key === 'faixa_max') return i.faixa_max ?? Number.MAX_SAFE_INTEGER;
                if (key === 'level2_label') return i.required_levels === 2 ? (i.level2_label ?? '') : null;
                return (i as unknown as Record<string, string | number | boolean | null | undefined>)[key];
            }}
            renderCell={renderCell}
            actions={{
                width: 110,
                render: item => (
                    <>
                        <ActionIconButton kind="edit" onClick={() => onEdit(item)} />
                        <ActionIconButton kind="delete" onClick={() => onDelete(item)} />
                    </>
                ),
            }}
            // A mensagem antiga dizia "crie a primeira para ATIVAR o fluxo de
            // aprovação" — e passou a mentir em 15/08/2026, quando o boleto deixou
            // de se autoaprovar. Sem faixa, `fn_resolve_approval_levels` não
            // devolve linha e `approvalService.submit` cai no default de 1 nível:
            // o fluxo está ativo, e os títulos ficam parados esperando alguém.
            // Estado vazio aqui é um AVISO, não um convite.
            empty={{
                icon: <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />,
                title: 'Nenhuma faixa configurada — os títulos estão exigindo 1 nível de aprovação',
                subtitle: 'Sem faixa, o sistema assume 1 nível para qualquer valor e todo título enviado fica parado na fila até alguém aprovar. Crie as faixas para definir a partir de que valor cada nível é exigido.',
            }}
        />
    );
}

interface ConfigModalProps {
    editing: Partial<FinancialApprovalConfig>;
    setEditing: React.Dispatch<React.SetStateAction<Partial<FinancialApprovalConfig> | null>>;
    saving: boolean;
    onSave: () => void;
    onClose: () => void;
}
function ApprovalConfigModal({ editing, setEditing, saving, onSave, onClose }: ConfigModalProps) {
    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    {/* §21 — sentence case, sem uppercase */}
                    <h3 className="font-black text-slate-800 text-lg">
                        {editing.id ? 'Editar faixa' : 'Nova faixa'}
                    </h3>
                    <Button onClick={onClose} variant="ghost" size="icon">
                        <X className="w-4 h-4 text-gray-500" />
                    </Button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={LABEL_CLASS}>Valor mínimo (R$)</label>
                            <input
                                type="number" min={0} step="1"
                                value={editing.faixa_min ?? 0}
                                onChange={e => setEditing(f => ({ ...f!, faixa_min: parseFloat(e.target.value) || 0 }))}
                                className={INPUT_CLASS}
                            />
                        </div>
                        <div>
                            <label className={LABEL_CLASS}>Valor máximo (R$, vazio = sem limite)</label>
                            <input
                                type="number" min={0} step="1" placeholder="Sem limite"
                                value={editing.faixa_max ?? ''}
                                onChange={e => setEditing(f => ({ ...f!, faixa_max: e.target.value ? parseFloat(e.target.value) : null }))}
                                className={INPUT_CLASS}
                            />
                        </div>
                    </div>
                    <div>
                        <label className={LABEL_CLASS}>Níveis de aprovação</label>
                        <div className="flex gap-2">
                            {([1, 2] as const).map(n => (
                                <button
                                    key={n}
                                    onClick={() => setEditing(f => ({ ...f!, required_levels: n }))}
                                    className={`flex-1 h-9 rounded-[6px] text-sm font-medium transition-all border ${editing.required_levels === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
                                >
                                    {n === 1 ? '1 nível' : '2 níveis'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className={LABEL_CLASS}>Rótulo nível 1</label>
                        <input
                            type="text" placeholder="Ex: Gestor"
                            value={editing.level1_label ?? ''}
                            onChange={e => setEditing(f => ({ ...f!, level1_label: e.target.value }))}
                            className={INPUT_CLASS}
                        />
                    </div>
                    {editing.required_levels === 2 && (
                        <div>
                            <label className={LABEL_CLASS}>Rótulo nível 2</label>
                            <input
                                type="text" placeholder="Ex: Financeiro / Diretoria"
                                value={editing.level2_label ?? ''}
                                onChange={e => setEditing(f => ({ ...f!, level2_label: e.target.value }))}
                                className={INPUT_CLASS}
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
                        <span className="text-sm font-medium text-gray-700">Faixa ativa</span>
                    </label>
                </div>
                <div className="flex gap-3 px-6 pb-6">
                    <button onClick={onClose} className="flex-1 h-9 px-3.5 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={onSave}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Check className="w-[15px] h-[15px]" />}
                        Salvar
                    </button>
                </div>
            </div>
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
        approvalService.getPendingSummary(organizationId || null)
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
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-[10px] flex items-start gap-3 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
                <p className="font-semibold text-amber-800">
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

// §19.1/§20 — o título acompanha a aba ativa.
const VIEW_HEADERS: Record<Tab, { title: string; subtitle: string }> = {
    fila:   { title: 'Aprovação Financeira', subtitle: 'Itens acima da alçada aguardando envio, aprovação ou rejeição — fluxo multinível por faixa de valor.' },
    config: { title: 'Faixas de Alçada',     subtitle: 'Limites de valor e níveis de aprovação exigidos em cada faixa.' },
};

interface Props {
    organizationId?: string;
    userEmail?: string;
}

export default function FinancialApprovalModule({ organizationId = '', userEmail = '' }: Props) {
    const confirm = useConfirm();
    const [tab, setTab] = usePersistedState<Tab>('financeiro:aprovacao:aba', 'fila');

    // Faixas de alçada — a mesma lista alimenta a aba de configuração e o
    // modal de aprovação (rótulos dos níveis), por isso vive aqui e não na aba.
    const [config, setConfig] = useState<FinancialApprovalConfig[]>([]);
    const [configLoading, setConfigLoading] = useState(true);
    const [configError, setConfigError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Partial<FinancialApprovalConfig> | null>(null);
    const [saving, setSaving] = useState(false);

    const loadConfig = useCallback(async () => {
        setConfigLoading(true);
        setConfigError(null);
        try { setConfig(await financialApprovalService.listConfig(organizationId || null)); }
        catch (e) { setConfigError(e instanceof Error ? e.message : 'Erro ao carregar faixas'); }
        finally { setConfigLoading(false); }
    }, [organizationId]);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    function openNew() {
        setEditing({
            organization_id:  organizationId,
            faixa_min:        0,
            faixa_max:        null,
            required_levels:  1,
            level1_label:     'Gestor',
            level2_label:     'Financeiro / Diretoria',
            is_active:        true,
            sort_order:       config.length,
        });
    }

    // §22 — o service devolve o registro salvo: atualiza o array local em vez
    // de recarregar a tabela inteira.
    async function handleSave() {
        if (!editing) return;
        setSaving(true);
        setConfigError(null);
        try {
            const saved = await financialApprovalService.upsertConfig(editing as FinancialApprovalConfig);
            setConfig(prev => {
                const exists = prev.some(c => c.id === saved.id);
                const next = exists ? prev.map(c => (c.id === saved.id ? saved : c)) : [...prev, saved];
                return next.sort((a, b) => a.faixa_min - b.faixa_min);
            });
            setEditing(null);
        } catch (e) {
            setConfigError(e instanceof Error ? e.message : 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(item: FinancialApprovalConfig) {
        if (!item.id) return;
        const ok = await confirm({ title: 'Remover esta faixa?', variant: 'danger', confirmLabel: 'Remover' });
        if (!ok) return;
        try {
            await financialApprovalService.deleteConfig(item.id);
            setConfig(prev => prev.filter(c => c.id !== item.id));
        } catch (e) {
            setConfigError(e instanceof Error ? e.message : 'Erro ao remover');
        }
    }

    const header = VIEW_HEADERS[tab];

    return (
        <div className="space-y-6">
            {/* 1. Título (§20) — h1 solto, muda com a aba */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{header.title}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{header.subtitle}</p>
            </div>

            {/* 2. Toolbar de abas (§19.1) — ação primária §17 à direita */}
            <TabsBar<Tab>
                tabs={[
                    { id: 'fila',   label: 'Fila de aprovação', icon: <Shield className="w-4 h-4" /> },
                    { id: 'config', label: 'Faixas de alçada',  icon: <Settings className="w-4 h-4" />, badge: config.length },
                ]}
                value={tab}
                onChange={setTab}
            >
                {tab === 'config' && (
                    <button
                        onClick={openNew}
                        disabled={!organizationId}
                        title={!organizationId ? 'Selecione uma organização específica para criar uma faixa de alçada' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Nova faixa
                    </button>
                )}
            </TabsBar>

            {/* 5. Tabela com toolbar acoplada (§5.2/§6.10) */}
            {tab === 'fila' && (
                <div>
                    <SoftPendingBanner organizationId={organizationId} />
                    <ApprovalQueue
                        organizationId={organizationId}
                        userEmail={userEmail}
                        config={config}
                    />
                </div>
            )}
            {tab === 'config' && (
                <div>
                    {configError && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700 mb-3">{configError}</div>
                    )}
                    <ApprovalConfigTable
                        items={config}
                        loading={configLoading}
                        onEdit={item => setEditing({ ...item })}
                        onDelete={handleDelete}
                    />
                </div>
            )}

            {editing && (
                <ApprovalConfigModal
                    editing={editing}
                    setEditing={setEditing}
                    saving={saving}
                    onSave={handleSave}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
}
