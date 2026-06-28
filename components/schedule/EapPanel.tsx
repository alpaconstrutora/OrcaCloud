import React, { useState, useMemo } from 'react';
import {
    Building2,
    Layers,
    DoorOpen,
    Wrench,
    ChevronRight,
    ChevronDown,
    Plus,
    X,
    Check,
    AlertCircle,
    BarChart2,
} from 'lucide-react';
import { HierarchyNode, ProjectSchedule, EapLocation, EapNode } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────

const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};

const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

function flatLeaves(nodes: HierarchyNode[]): HierarchyNode[] {
    const acc: HierarchyNode[] = [];
    const walk = (n: HierarchyNode) => {
        if (n.type === 'item') acc.push(n);
        (n.children || []).forEach(walk);
    };
    nodes.forEach(walk);
    return acc;
}

function minDate(a?: string, b?: string): string | undefined {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
}
function maxDate(a?: string, b?: string): string | undefined {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
}

// Build EAP física tree from schedule items
function buildEapTree(
    leaves: HierarchyNode[],
    schedule: ProjectSchedule,
): { tree: EapNode[]; unassigned: EapNode } {
    const schedById: Record<string, typeof schedule.itemSchedules extends Array<infer T> ? T : never> = {};
    (schedule.itemSchedules ?? []).forEach(s => { (schedById as any)[s.id] = s; });

    // Group items by location path
    const map = new Map<string, {
        bloco: string; pavimento: string; ambiente: string; disciplina: string;
        itemIds: string[];
    }>();

    const unassignedIds: string[] = [];

    leaves.forEach(leaf => {
        const sched = (schedById as any)[leaf.id];
        const loc: EapLocation = sched?.location ?? {};
        const bloco = loc.bloco?.trim() || '';
        const pavimento = loc.pavimento?.trim() || '';
        const ambiente = loc.ambiente?.trim() || '';
        const disciplina = loc.disciplina?.trim() || '';

        if (!bloco && !pavimento && !ambiente && !disciplina) {
            unassignedIds.push(leaf.id);
            return;
        }

        const key = `${bloco}||${pavimento}||${ambiente}||${disciplina}`;
        if (!map.has(key)) map.set(key, { bloco, pavimento, ambiente, disciplina, itemIds: [] });
        map.get(key)!.itemIds.push(leaf.id);
    });

    // Build budgeted + completion metrics per leaf set
    function metrics(itemIds: string[]) {
        let budgetedTotal = 0, weightedPct = 0, start: string | undefined, end: string | undefined;
        itemIds.forEach(id => {
            const leaf = leaves.find(l => l.id === id);
            const sched = (schedById as any)[id];
            const b = leaf?.budgetedTotal ?? 0;
            budgetedTotal += b;
            weightedPct += ((sched?.manualRealPct ?? 0) / 100) * b;
            start = minDate(start, sched?.earlyStart ?? sched?.startDate);
            end = maxDate(end, sched?.earlyFinish ?? sched?.endDate);
        });
        return {
            budgetedTotal,
            completionPct: budgetedTotal > 0 ? (weightedPct / budgetedTotal) * 100 : 0,
            startDate: start,
            endDate: end,
        };
    }

    // Build 4-level tree: bloco → pavimento → ambiente → disciplina
    const blocoMap = new Map<string, Map<string, Map<string, Map<string, string[]>>>>();

    map.forEach(({ bloco, pavimento, ambiente, disciplina, itemIds }) => {
        if (!blocoMap.has(bloco)) blocoMap.set(bloco, new Map());
        const pavMap = blocoMap.get(bloco)!;
        if (!pavMap.has(pavimento)) pavMap.set(pavimento, new Map());
        const ambMap = pavMap.get(pavimento)!;
        if (!ambMap.has(ambiente)) ambMap.set(ambiente, new Map());
        const discMap = ambMap.get(ambiente)!;
        if (!discMap.has(disciplina)) discMap.set(disciplina, []);
        discMap.get(disciplina)!.push(...itemIds);
    });

    const tree: EapNode[] = [];

    blocoMap.forEach((pavMap, bloco) => {
        const blocoIds: string[] = [];
        const blocoChildren: EapNode[] = [];

        pavMap.forEach((ambMap, pavimento) => {
            const pavIds: string[] = [];
            const pavChildren: EapNode[] = [];

            ambMap.forEach((discMap, ambiente) => {
                const ambIds: string[] = [];
                const ambChildren: EapNode[] = [];

                discMap.forEach((ids, disciplina) => {
                    if (disciplina) {
                        const m = metrics(ids);
                        ambChildren.push({
                            key: `${bloco}||${pavimento}||${ambiente}||${disciplina}`,
                            label: disciplina,
                            level: 'disciplina',
                            children: [],
                            itemIds: ids,
                            ...m,
                        });
                    }
                    ambIds.push(...ids);
                });

                // Items with no disciplina go directly to ambiente
                const noDisciplinaIds = discMap.get('') ?? [];
                const totalAmbIds = [...new Set([...ambIds])];
                const ambM = metrics(totalAmbIds);

                if (ambiente) {
                    pavChildren.push({
                        key: `${bloco}||${pavimento}||${ambiente}`,
                        label: ambiente,
                        level: 'ambiente',
                        children: ambChildren,
                        itemIds: noDisciplinaIds,
                        ...ambM,
                    });
                } else {
                    // no ambiente → items go to pavimento level
                    pavIds.push(...noDisciplinaIds);
                }
                pavIds.push(...totalAmbIds);
            });

            const totalPavIds = [...new Set(pavIds)];
            const pavM = metrics(totalPavIds);

            if (pavimento) {
                blocoChildren.push({
                    key: `${bloco}||${pavimento}`,
                    label: pavimento,
                    level: 'pavimento',
                    children: pavChildren,
                    itemIds: pavIds.filter(id => !pavChildren.some(c => c.itemIds.includes(id))),
                    ...pavM,
                });
            } else {
                blocoIds.push(...pavIds);
            }
            blocoIds.push(...totalPavIds);
        });

        const totalBlocoIds = [...new Set(blocoIds)];
        const blocoM = metrics(totalBlocoIds);

        tree.push({
            key: bloco,
            label: bloco || 'Sem bloco',
            level: 'bloco',
            children: blocoChildren,
            itemIds: blocoIds.filter(id => !blocoChildren.some(c => c.itemIds.includes(id))),
            ...blocoM,
        });
    });

    const unassM = metrics(unassignedIds);
    const unassigned: EapNode = {
        key: '__unassigned__',
        label: 'Sem localização',
        level: 'unassigned',
        children: [],
        itemIds: unassignedIds,
        ...unassM,
    };

    return { tree, unassigned };
}

// ─── Props ────────────────────────────────────────────────────

interface Props {
    hierarchy: HierarchyNode[];
    schedule: ProjectSchedule;
    onUpdateLocation: (itemId: string, location: EapLocation) => void;
}

// ─── Component ────────────────────────────────────────────────

export const EapPanel: React.FC<Props> = ({ hierarchy, schedule, onUpdateLocation }) => {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [editing, setEditing] = useState<string | null>(null);  // itemId being assigned
    const [editForm, setEditForm] = useState<EapLocation>({});

    const leaves = useMemo(() => flatLeaves(hierarchy), [hierarchy]);
    const { tree, unassigned } = useMemo(() => buildEapTree(leaves, schedule), [leaves, schedule]);

    const schedById = useMemo(() => {
        const m: Record<string, any> = {};
        (schedule.itemSchedules ?? []).forEach(s => { m[s.id] = s; });
        return m;
    }, [schedule.itemSchedules]);

    const leafById = useMemo(() => {
        const m: Record<string, HierarchyNode> = {};
        leaves.forEach(l => { m[l.id] = l; });
        return m;
    }, [leaves]);

    const toggleExpand = (key: string) =>
        setExpanded(e => ({ ...e, [key]: !e[key] }));

    const startEdit = (itemId: string) => {
        const loc = schedById[itemId]?.location ?? {};
        setEditForm({ ...loc });
        setEditing(itemId);
    };

    const saveEdit = () => {
        if (!editing) return;
        onUpdateLocation(editing, editForm);
        setEditing(null);
    };

    // Total KPIs
    const totalBudget = leaves.reduce((s, l) => s + (l.budgetedTotal ?? 0), 0);
    const assignedCount = leaves.filter(l => {
        const loc = schedById[l.id]?.location;
        return loc && (loc.bloco || loc.pavimento || loc.ambiente);
    }).length;

    const LEVEL_ICON: Record<string, React.ReactNode> = {
        bloco:      <Building2 className="w-3.5 h-3.5" />,
        pavimento:  <Layers className="w-3.5 h-3.5" />,
        ambiente:   <DoorOpen className="w-3.5 h-3.5" />,
        disciplina: <Wrench className="w-3.5 h-3.5" />,
        unassigned: <AlertCircle className="w-3.5 h-3.5" />,
    };

    const LEVEL_COLOR: Record<string, string> = {
        bloco:      'text-blue-600 bg-blue-50 border-blue-100',
        pavimento:  'text-indigo-600 bg-indigo-50 border-indigo-100',
        ambiente:   'text-violet-600 bg-violet-50 border-violet-100',
        disciplina: 'text-orange-600 bg-orange-50 border-orange-100',
        unassigned: 'text-gray-500 bg-gray-50 border-gray-200',
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <h2 className="text-sm font-bold text-gray-800">EAP Física — Estrutura Analítica da Obra</h2>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold border border-blue-100">
                        {assignedCount}/{leaves.length} atividades com localização
                    </span>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 flex-wrap text-[10px]">
                {(['bloco','pavimento','ambiente','disciplina'] as const).map(level => (
                    <div key={level} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${LEVEL_COLOR[level]}`}>
                        {LEVEL_ICON[level]}
                        <span className="font-bold capitalize">{level}</span>
                    </div>
                ))}
                <span className="text-gray-400 ml-1">Clique em uma atividade para atribuir localização</span>
            </div>

            {/* Empty state */}
            {tree.length === 0 && unassigned.itemIds.length === 0 && (
                <div className="bg-white border border-dashed border-gray-200 rounded-2xl py-14 text-center">
                    <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-500">Nenhuma atividade no cronograma</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                        Adicione atividades ao cronograma e atribua localizações físicas para visualizar a EAP.
                    </p>
                </div>
            )}

            {/* EAP tree */}
            {tree.length > 0 && (
                <div className="space-y-2">
                    {tree.map(node => (
                        <EapNodeRow
                            key={node.key}
                            node={node}
                            expanded={expanded}
                            toggleExpand={toggleExpand}
                            leafById={leafById}
                            schedById={schedById}
                            onEdit={startEdit}
                            editing={editing}
                            editForm={editForm}
                            setEditForm={setEditForm}
                            saveEdit={saveEdit}
                            cancelEdit={() => setEditing(null)}
                            levelIcon={LEVEL_ICON}
                            levelColor={LEVEL_COLOR}
                            depth={0}
                        />
                    ))}
                </div>
            )}

            {/* Unassigned */}
            {unassigned.itemIds.length > 0 && (
                <div className="bg-white border border-dashed border-gray-200 rounded-2xl overflow-hidden">
                    <button
                        onClick={() => toggleExpand('__unassigned__')}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                    >
                        <AlertCircle className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-xs font-bold text-gray-600 flex-1 text-left">
                            Sem localização ({unassigned.itemIds.length} atividades)
                        </span>
                        <span className="text-[10px] text-gray-400">
                            Clique para expandir e atribuir localizações
                        </span>
                        {expanded['__unassigned__']
                            ? <ChevronDown className="w-4 h-4 text-gray-400" />
                            : <ChevronRight className="w-4 h-4 text-gray-400" />
                        }
                    </button>
                    {expanded['__unassigned__'] && (
                        <div className="border-t border-dashed border-gray-200 divide-y divide-gray-50">
                            {unassigned.itemIds.map(id => (
                                <ItemRowCompact
                                    key={id}
                                    itemId={id}
                                    leafById={leafById}
                                    schedById={schedById}
                                    onEdit={startEdit}
                                    editing={editing}
                                    editForm={editForm}
                                    setEditForm={setEditForm}
                                    saveEdit={saveEdit}
                                    cancelEdit={() => setEditing(null)}
                                    depth={0}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── EapNodeRow (recursive) ───────────────────────────────────

const EapNodeRow: React.FC<{
    node: EapNode;
    expanded: Record<string, boolean>;
    toggleExpand: (key: string) => void;
    leafById: Record<string, HierarchyNode>;
    schedById: Record<string, any>;
    onEdit: (id: string) => void;
    editing: string | null;
    editForm: EapLocation;
    setEditForm: (v: EapLocation) => void;
    saveEdit: () => void;
    cancelEdit: () => void;
    levelIcon: Record<string, React.ReactNode>;
    levelColor: Record<string, string>;
    depth: number;
}> = ({ node, expanded, toggleExpand, leafById, schedById, onEdit, editing, editForm, setEditForm, saveEdit, cancelEdit, levelIcon, levelColor, depth }) => {
    const isOpen = expanded[node.key] ?? (depth === 0);
    const hasChildren = node.children.length > 0 || node.itemIds.length > 0;
    const totalItems = countItems(node);
    const clr = levelColor[node.level];

    return (
        <div className={`bg-white border rounded-xl overflow-hidden ${clr.includes('border-blue') ? 'border-blue-100' : clr.includes('border-indigo') ? 'border-indigo-100' : clr.includes('border-violet') ? 'border-violet-100' : 'border-orange-100'}`}
            style={{ marginLeft: depth * 16 }}>
            {/* Node header */}
            <button
                onClick={() => toggleExpand(node.key)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/50 transition-colors"
            >
                <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${clr}`}>
                    {levelIcon[node.level]}
                    {node.label}
                </span>

                <div className="flex-1 flex items-center gap-3">
                    {/* Progress bar */}
                    <div className="flex-1 max-w-32">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full ${node.completionPct >= 100 ? 'bg-emerald-400' : node.completionPct > 0 ? 'bg-blue-400' : 'bg-gray-200'}`}
                                style={{ width: `${Math.min(node.completionPct, 100)}%` }}
                            />
                        </div>
                    </div>
                    <span className="text-[10px] text-gray-500 font-bold">{node.completionPct.toFixed(0)}%</span>
                </div>

                <div className="flex items-center gap-4 text-[10px] text-gray-400 shrink-0">
                    <span>{totalItems} ativ.</span>
                    {node.budgetedTotal > 0 && <span>{fmtBRL(node.budgetedTotal)}</span>}
                    {node.startDate && <span>{fmtDate(node.startDate)} → {fmtDate(node.endDate)}</span>}
                </div>

                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
            </button>

            {isOpen && hasChildren && (
                <div className="border-t border-gray-50">
                    {/* Child nodes */}
                    {node.children.map(child => (
                        <EapNodeRow
                            key={child.key}
                            node={child}
                            expanded={expanded}
                            toggleExpand={toggleExpand}
                            leafById={leafById}
                            schedById={schedById}
                            onEdit={onEdit}
                            editing={editing}
                            editForm={editForm}
                            setEditForm={setEditForm}
                            saveEdit={saveEdit}
                            cancelEdit={cancelEdit}
                            levelIcon={levelIcon}
                            levelColor={levelColor}
                            depth={depth + 1}
                        />
                    ))}
                    {/* Direct items */}
                    {node.itemIds.map(id => (
                        <ItemRowCompact
                            key={id}
                            itemId={id}
                            leafById={leafById}
                            schedById={schedById}
                            onEdit={onEdit}
                            editing={editing}
                            editForm={editForm}
                            setEditForm={setEditForm}
                            saveEdit={saveEdit}
                            cancelEdit={cancelEdit}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

function countItems(node: EapNode): number {
    const childCount = node.children.reduce((s, c) => s + countItems(c), 0);
    return node.itemIds.length + childCount;
}

// ─── ItemRowCompact ───────────────────────────────────────────

const ItemRowCompact: React.FC<{
    itemId: string;
    leafById: Record<string, HierarchyNode>;
    schedById: Record<string, any>;
    onEdit: (id: string) => void;
    editing: string | null;
    editForm: EapLocation;
    setEditForm: (v: EapLocation) => void;
    saveEdit: () => void;
    cancelEdit: () => void;
    depth: number;
}> = ({ itemId, leafById, schedById, onEdit, editing, editForm, setEditForm, saveEdit, cancelEdit, depth }) => {
    const leaf = leafById[itemId];
    const sched = schedById[itemId];
    if (!leaf) return null;

    const realPct = sched?.manualRealPct ?? 0;
    const start = sched?.earlyStart ?? sched?.startDate;
    const end = sched?.earlyFinish ?? sched?.endDate;
    const isEditing = editing === itemId;

    return (
        <div style={{ paddingLeft: Math.max(16, depth * 16 + 8) }}
            className="py-2 pr-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
            {isEditing ? (
                <LocationForm
                    form={editForm}
                    setForm={setEditForm}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    label={leaf.name}
                />
            ) : (
                <div className="flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                    <span className="text-xs text-gray-700 flex-1 truncate font-medium">{leaf.name}</span>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400 shrink-0">
                        <span>{fmtDate(start)} → {fmtDate(end)}</span>
                        <div className="flex items-center gap-1">
                            <div className="w-10 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${realPct}%` }} />
                            </div>
                            <span>{realPct}%</span>
                        </div>
                        <button
                            onClick={() => onEdit(itemId)}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-bold"
                        >
                            <Plus className="w-3 h-3" />
                            Localização
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── LocationForm ─────────────────────────────────────────────

const FIELD_LABELS: { key: keyof EapLocation; label: string; placeholder: string }[] = [
    { key: 'bloco',      label: 'Bloco / Torre',  placeholder: 'ex: Torre A, Bloco 1' },
    { key: 'pavimento',  label: 'Pavimento',      placeholder: 'ex: 3º Andar, Térreo' },
    { key: 'ambiente',   label: 'Ambiente',       placeholder: 'ex: Apt 301, Hall' },
    { key: 'disciplina', label: 'Disciplina',     placeholder: 'ex: Hidráulica, Estrutura' },
];

const LocationForm: React.FC<{
    form: EapLocation;
    setForm: (v: EapLocation) => void;
    onSave: () => void;
    onCancel: () => void;
    label: string;
}> = ({ form, setForm, onSave, onCancel, label }) => (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800 truncate">{label}</span>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
            {FIELD_LABELS.map(({ key, label: lbl, placeholder }) => (
                <div key={key}>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">{lbl}</label>
                    <input
                        type="text"
                        value={form[key] ?? ''}
                        onChange={e => setForm({ ...form, [key]: e.target.value })}
                        placeholder={placeholder}
                        className="w-full text-form-input border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
                    />
                </div>
            ))}
        </div>
        <div className="flex items-center gap-2 justify-end">
            <button
                onClick={onCancel}
                className="px-3 py-1 text-[11px] font-bold text-gray-500 hover:text-gray-700 transition-colors"
            >
                Cancelar
            </button>
            <button
                onClick={onSave}
                className="flex items-center gap-1 px-3 py-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
                <Check className="w-3 h-3" />
                Salvar
            </button>
        </div>
    </div>
);
