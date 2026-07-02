import React, { useState, useEffect, useCallback } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    FileText,
    Package,
    Settings,
    Users,
    Wrench,
    Plus,
    X,
    ChevronDown,
    Loader2,
    RefreshCw,
    RotateCcw,
} from 'lucide-react';
import { HierarchyNode, ScheduleConstraint, ConstraintCategory } from '../../types';
import Button from '../ui/Button';
import {
    scheduleConstraintsService,
} from '../../services/scheduleConstraintsService';

// ─── Config ───────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<ConstraintCategory, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
    projeto:      { label: 'Projeto',      icon: FileText,      color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
    material:     { label: 'Material',     icon: Package,       color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
    contrato:     { label: 'Contrato',     icon: FileText,      color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
    equipe:       { label: 'Equipe',       icon: Users,         color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200' },
    equipamento:  { label: 'Equipamento',  icon: Wrench,        color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
    aprovacao:    { label: 'Aprovação',    icon: Settings,      color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
};

const CATEGORIES = Object.keys(CATEGORY_CONFIG) as ConstraintCategory[];

const fmtDate = (s?: string) => {
    if (!s) return '—';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y.slice(-2)}`;
};

const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return dueDate < new Date().toISOString().split('T')[0];
};

// ─── Types ────────────────────────────────────────────────────

interface Props {
    organizationId: string;
    projectId: string;
    hierarchy: HierarchyNode[];
}

interface NewConstraintForm {
    scheduleItemId: string;
    category: ConstraintCategory;
    description: string;
    responsible: string;
    dueDate: string;
}

const EMPTY_FORM: NewConstraintForm = {
    scheduleItemId: '',
    category: 'material',
    description: '',
    responsible: '',
    dueDate: '',
};

// ─── Helpers ──────────────────────────────────────────────────

function flattenItems(nodes: HierarchyNode[]): { id: string; label: string }[] {
    const acc: { id: string; label: string }[] = [];
    const walk = (node: HierarchyNode, depth = 0) => {
        acc.push({ id: node.id, label: `${'  '.repeat(depth)}${node.name}` });
        (node.children || []).forEach(c => walk(c, depth + 1));
    };
    nodes.forEach(n => walk(n));
    return acc;
}

// ─── Component ────────────────────────────────────────────────

export const ConstraintsPanel: React.FC<Props> = ({ organizationId, projectId, hierarchy }) => {
    const [constraints, setConstraints] = useState<ScheduleConstraint[]>([]);
    const [loading, setLoading] = useState(true);
    const [showResolved, setShowResolved] = useState(false);
    const [expandedCategory, setExpandedCategory] = useState<ConstraintCategory | null>('material');
    const [addingFor, setAddingFor] = useState<string | null>(null); // scheduleItemId or '__new__'
    const [form, setForm] = useState<NewConstraintForm>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const items = flattenItems(hierarchy);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await scheduleConstraintsService.listByProject(organizationId, projectId);
            setConstraints(data);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, [organizationId, projectId]);

    useEffect(() => { load(); }, [load]);

    const openConstraints = constraints.filter(c => c.status === 'open');
    const resolvedConstraints = constraints.filter(c => c.status === 'removed');

    const byCategory = (cat: ConstraintCategory, list: ScheduleConstraint[]) =>
        list.filter(c => c.category === cat);

    const handleAdd = async () => {
        if (!form.description.trim() || !form.scheduleItemId) return;
        setSaving(true);
        try {
            await scheduleConstraintsService.create(organizationId, projectId, {
                scheduleItemId: form.scheduleItemId,
                category: form.category,
                description: form.description.trim(),
                responsible: form.responsible.trim() || undefined,
                dueDate: form.dueDate || undefined,
            });
            setForm(EMPTY_FORM);
            setAddingFor(null);
            await load();
        } catch (e) {
            setError(String(e));
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (id: string) => {
        try {
            await scheduleConstraintsService.remove(id);
            await load();
        } catch (e) {
            setError(String(e));
        }
    };

    const handleReopen = async (id: string) => {
        try {
            await scheduleConstraintsService.reopen(id);
            await load();
        } catch (e) {
            setError(String(e));
        }
    };

    const itemName = (id: string) =>
        items.find(i => i.id === id)?.label.trim() ?? id;

    // ── KPIs ──
    const overdueCount = openConstraints.filter(c => isOverdue(c.dueDate)).length;
    const byItemId: Record<string, number> = {};
    openConstraints.forEach(c => { byItemId[c.scheduleItemId] = (byItemId[c.scheduleItemId] ?? 0) + 1; });
    const affectedActivities = Object.keys(byItemId).length;

    return (
        <div className="space-y-4">
            {/* KPI bar */}
            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: 'Restrições abertas', value: openConstraints.length, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
                    { label: 'Atividades bloqueadas', value: affectedActivities, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
                    { label: 'Vencidas', value: overdueCount, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
                    { label: 'Resolvidas', value: resolvedConstraints.length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                ].map(kpi => (
                    <div key={kpi.label} className={`${kpi.bg} border ${kpi.border} rounded-xl px-4 py-3`}>
                        <div className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</div>
                        <div className="text-xs font-medium text-gray-500 mt-0.5">{kpi.label}</div>
                    </div>
                ))}
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Header actions */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <h2 className="text-sm font-bold text-gray-800">Quadro de Restrições</h2>
                    <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        {openConstraints.length} abertas
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setShowResolved(v => !v)}>
                        {showResolved ? 'Ocultar resolvidas' : 'Ver resolvidas'}
                    </Button>
                    <Button variant="secondary" size="icon" onClick={load}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => { setAddingFor('__new__'); setForm(EMPTY_FORM); }}
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Nova restrição
                    </Button>
                </div>
            </div>

            {/* Add form (global) */}
            {addingFor === '__new__' && (
                <NewConstraintForm
                    form={form}
                    items={items}
                    onChange={patch => setForm(f => ({ ...f, ...patch }))}
                    onSave={handleAdd}
                    onCancel={() => setAddingFor(null)}
                    saving={saving}
                />
            )}

            {/* Categories */}
            {loading && constraints.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Carregando restrições…</span>
                </div>
            ) : (
                <div className="space-y-2">
                    {CATEGORIES.map(cat => {
                        const cfg = CATEGORY_CONFIG[cat];
                        const Icon = cfg.icon;
                        const open = byCategory(cat, openConstraints);
                        const resolved = showResolved ? byCategory(cat, resolvedConstraints) : [];
                        const all = [...open, ...resolved];
                        if (all.length === 0 && expandedCategory !== cat) return null;

                        const isExpanded = expandedCategory === cat;

                        return (
                            <div key={cat} className={`border ${cfg.border} rounded-xl overflow-hidden`}>
                                {/* Category header */}
                                <button
                                    onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 ${cfg.bg} hover:opacity-90 transition-opacity`}
                                >
                                    <Icon className={`w-4 h-4 ${cfg.color} shrink-0`} />
                                    <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
                                    <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${open.length > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {open.length} {open.length === 1 ? 'aberta' : 'abertas'}
                                    </span>
                                    <ChevronDown className={`w-4 h-4 ml-auto ${cfg.color} transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>

                                {isExpanded && (
                                    <div className="divide-y divide-gray-100 bg-white">
                                        {all.length === 0 ? (
                                            <div className="px-4 py-8 text-center text-xs text-gray-400">
                                                Nenhuma restrição de {cfg.label.toLowerCase()}
                                            </div>
                                        ) : (
                                            all.map(c => (
                                                <ConstraintRow
                                                    key={c.id}
                                                    constraint={c}
                                                    itemName={itemName(c.scheduleItemId)}
                                                    onRemove={handleRemove}
                                                    onReopen={handleReopen}
                                                />
                                            ))
                                        )}
                                        {/* Add in this category */}
                                        {addingFor === cat ? (
                                            <div className="p-3 bg-gray-50">
                                                <NewConstraintForm
                                                    form={{ ...form, category: cat }}
                                                    items={items}
                                                    onChange={patch => setForm(f => ({ ...f, ...patch }))}
                                                    onSave={handleAdd}
                                                    onCancel={() => setAddingFor(null)}
                                                    saving={saving}
                                                    fixedCategory={cat}
                                                />
                                            </div>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                onClick={() => { setAddingFor(cat); setForm({ ...EMPTY_FORM, category: cat }); }}
                                                className="w-full justify-start normal-case font-medium tracking-normal text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                Adicionar restrição de {cfg.label.toLowerCase()}
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─── ConstraintRow ────────────────────────────────────────────

const ConstraintRow: React.FC<{
    constraint: ScheduleConstraint;
    itemName: string;
    onRemove: (id: string) => void;
    onReopen: (id: string) => void;
}> = ({ constraint: c, itemName, onRemove, onReopen }) => {
    const removed = c.status === 'removed';
    const overdue = !removed && isOverdue(c.dueDate);

    return (
        <div className={`flex items-start gap-3 px-4 py-3 group ${removed ? 'opacity-60' : ''}`}>
            <div className="mt-0.5 shrink-0">
                {removed
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    : <AlertTriangle className={`w-4 h-4 ${overdue ? 'text-red-500' : 'text-amber-400'}`} />
                }
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${removed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                    {c.description}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                    <span className="text-xs text-gray-400 truncate">{itemName}</span>
                    {c.responsible && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {c.responsible}
                        </span>
                    )}
                    {c.dueDate && (
                        <span className={`text-xs flex items-center gap-1 ${overdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                            <Clock className="w-3 h-3" />
                            {fmtDate(c.dueDate)}
                            {overdue && ' • VENCIDA'}
                        </span>
                    )}
                </div>
            </div>
            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                {removed ? (
                    <button
                        onClick={() => onReopen(c.id)}
                        className="p-1 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors"
                        title="Reabrir"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                ) : (
                    <button
                        onClick={() => onRemove(c.id)}
                        className="p-1 rounded hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors"
                        title="Marcar como removida"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
};

// ─── NewConstraintForm ────────────────────────────────────────

const NewConstraintForm: React.FC<{
    form: NewConstraintForm;
    items: { id: string; label: string }[];
    onChange: (patch: Partial<NewConstraintForm>) => void;
    onSave: () => void;
    onCancel: () => void;
    saving: boolean;
    fixedCategory?: ConstraintCategory;
}> = ({ form, items, onChange, onSave, onCancel, saving, fixedCategory }) => (
    <div className="bg-white border border-blue-100 rounded-xl p-4 space-y-3 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Atividade *</label>
                <select
                    value={form.scheduleItemId}
                    onChange={e => onChange({ scheduleItemId: e.target.value })}
                    className="w-full text-form-input border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                    <option value="">Selecione…</option>
                    {items.map(i => (
                        <option key={i.id} value={i.id}>{i.label}</option>
                    ))}
                </select>
            </div>

            {!fixedCategory && (
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Categoria *</label>
                    <select
                        value={form.category}
                        onChange={e => onChange({ category: e.target.value as ConstraintCategory })}
                        className="w-full text-form-input border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                        {CATEGORIES.map(c => (
                            <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className={fixedCategory ? 'col-span-2' : ''}>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Responsável</label>
                <input
                    type="text"
                    value={form.responsible}
                    onChange={e => onChange({ responsible: e.target.value })}
                    placeholder="Nome do responsável"
                    className="w-full text-form-input border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
            </div>

            <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Descrição *</label>
                <input
                    type="text"
                    value={form.description}
                    onChange={e => onChange({ description: e.target.value })}
                    placeholder="Descreva a restrição…"
                    className="w-full text-form-input border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    onKeyDown={e => e.key === 'Enter' && onSave()}
                />
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Prazo para remoção</label>
                <input
                    type="date"
                    value={form.dueDate}
                    onChange={e => onChange({ dueDate: e.target.value })}
                    className="w-full text-form-input border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
            </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
            <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="normal-case font-medium tracking-normal"
            >
                <X className="w-3.5 h-3.5 inline mr-1" />
                Cancelar
            </Button>
            <Button
                variant="primary"
                size="sm"
                onClick={onSave}
                disabled={saving || !form.description.trim() || !form.scheduleItemId}
            >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Salvar
            </Button>
        </div>
    </div>
);
