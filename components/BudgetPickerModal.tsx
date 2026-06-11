import React from 'react';
import {
    Search, X, ChevronRight, ChevronDown,
    Target, Hash, Layers, FolderOpen, Folder,
    FileStack, ListTree, Plus
} from 'lucide-react';
import { BudgetEntry, WBSGroup, SinapiType } from '../types';
import MaterialSelectionModal from './MaterialSelectionModal';

interface BudgetPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (items: BudgetEntry[]) => void;
    budget: BudgetEntry[];
    wbs?: WBSGroup[];
}

function fmtMoney(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function sumItems(items: BudgetEntry[]) {
    return items.reduce((s, i) => s + (i.sinapiItem?.price ?? 0) * (i.quantity ?? 1), 0);
}

const BudgetPickerModal: React.FC<BudgetPickerModalProps> = ({
    isOpen, onClose, onSelect, budget, wbs = []
}) => {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(() => {
        // Open first group by default — fall back to budget[0].group when wbs is absent
        const first = wbs?.[0]?.name ?? budget?.[0]?.group;
        return first ? new Set([first]) : new Set();
    });
    const [expandedPhases, setExpandedPhases] = React.useState<Set<string>>(new Set());
    const [expandedSubPhases, setExpandedSubPhases] = React.useState<Set<string>>(new Set());
    const [compositionItem, setCompositionItem] = React.useState<BudgetEntry | null>(null);

    // Derive structure from budget when wbs is not provided — must be before early return (rules of hooks)
    const effectiveWbs: WBSGroup[] = React.useMemo(() => {
        if (wbs && wbs.length > 0) return wbs;
        const groupMap = new Map<string, Map<string, Set<string>>>();
        budget.forEach(e => {
            const g = e.group || 'Sem grupo';
            const p = e.phase || 'Sem etapa';
            const sp = e.subPhase || '';
            if (!groupMap.has(g)) groupMap.set(g, new Map());
            const phaseMap = groupMap.get(g)!;
            if (!phaseMap.has(p)) phaseMap.set(p, new Set());
            if (sp) phaseMap.get(p)!.add(sp);
        });
        return Array.from(groupMap.entries()).map(([gName, phaseMap], gi) => ({
            id: `g-${gi}`,
            name: gName,
            phases: Array.from(phaseMap.entries()).map(([pName, subSet], pi) => ({
                id: `p-${gi}-${pi}`,
                name: pName,
                subPhases: Array.from(subSet)
            }))
        }));
    }, [wbs, budget]);

    const isSearching = searchTerm.trim().length > 0;
    const filteredItems = isSearching ? budget.filter(item => {
        const term = searchTerm.toLowerCase();
        const desc = (item.sinapiItem?.description || '').toLowerCase();
        const code = (item.sinapiItem?.code || '').toLowerCase();
        const grp = (item.group || '').toLowerCase();
        const ph = (item.phase || '').toLowerCase();
        return desc.includes(term) || code.includes(term) || grp.includes(term) || ph.includes(term);
    }) : [];

    if (!isOpen) return null;

    const toggleGroup = (name: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });
    };

    const togglePhase = (key: string) => {
        setExpandedPhases(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const toggleSubPhase = (key: string) => {
        setExpandedSubPhases(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };


    const handleSelectItem = (item: BudgetEntry) => {
        if (item.sinapiItem?.type === SinapiType.COMPOSITION) {
            setCompositionItem(item);
        } else {
            onSelect([item]);
        }
    };

    const handleSelectGroup = (groupName: string) => {
        const items = budget.filter(e => e.group === groupName);
        if (items.length > 0) onSelect(items);
    };

    const handleSelectPhase = (phaseName: string) => {
        const items = budget.filter(e => e.phase === phaseName);
        if (items.length > 0) onSelect(items);
    };

    const handleSelectSubPhase = (phaseName: string, subPhase: string) => {
        const items = budget.filter(e => e.phase === phaseName && e.subPhase === subPhase);
        if (items.length > 0) onSelect(items);
    };

    const totalItems = budget.length;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-3xl h-full max-h-[88vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-100">

                {/* Header */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                            <ListTree className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight leading-none">Importar do Orçamento</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                Selecione grupo, etapa, subetapa ou item individual
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2.5 hover:bg-white hover:shadow-sm rounded-2xl transition-all border border-transparent hover:border-gray-100 group">
                        <X className="w-5 h-5 text-gray-400 group-hover:text-red-500 transition-colors" />
                    </button>
                </div>

                {/* Search */}
                <div className="px-6 py-4 border-b border-gray-50 bg-white flex-shrink-0">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Filtrar por descrição, código ou etapa..."
                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none transition-all placeholder:text-gray-300"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                <X className="w-3 h-3 text-gray-400" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto bg-white">
                    {budget.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center gap-4 p-8">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                                <FileStack className="w-8 h-8 text-gray-200" />
                            </div>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest leading-tight">
                                Nenhum orçamento vinculado<br />a este contrato.
                            </p>
                            <p className="text-xs text-gray-300 font-medium">
                                Vincule um orçamento ao contrato para importar itens.
                            </p>
                        </div>
                    ) : isSearching ? (
                        /* ── SEARCH MODE: flat list ── */
                        <div className="p-4 space-y-1.5">
                            {filteredItems.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                                    <Search className="w-8 h-8 text-gray-200" />
                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Nenhum item encontrado</p>
                                </div>
                            ) : filteredItems.map((item, idx) => (
                                <ItemRow
                                    key={item.id || idx}
                                    item={item}
                                    showPath
                                    onSelect={() => handleSelectItem(item)}
                                />
                            ))}
                        </div>
                    ) : (
                        /* ── TREE MODE ── */
                        <div className="py-2">
                            {effectiveWbs.map(group => {
                                const groupItems = budget.filter(e => e.group === group.name);
                                if (groupItems.length === 0) return null;
                                const isGroupOpen = expandedGroups.has(group.name);

                                return (
                                    <div key={group.id} className="border-b border-gray-50 last:border-0">
                                        {/* Group row */}
                                        <div className="flex items-center gap-0 px-4 py-0.5 hover:bg-gray-50/80 group/row">
                                            <button
                                                onClick={() => toggleGroup(group.name)}
                                                className="flex items-center gap-2.5 flex-1 py-3 text-left min-w-0"
                                            >
                                                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                                                    {isGroupOpen
                                                        ? <FolderOpen className="w-3.5 h-3.5" />
                                                        : <Folder className="w-3.5 h-3.5" />
                                                    }
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-xs font-black text-gray-900 uppercase tracking-tight truncate block">{group.name}</span>
                                                    <span className="text-[10px] font-bold text-gray-400">{groupItems.length} itens · {fmtMoney(sumItems(groupItems))}</span>
                                                </div>
                                                {isGroupOpen
                                                    ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                    : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                }
                                            </button>
                                            <ImportBtn
                                                label="Importar grupo"
                                                onClick={() => handleSelectGroup(group.name)}
                                                color="blue"
                                            />
                                        </div>

                                        {isGroupOpen && group.phases.map(phase => {
                                            const phaseItems = groupItems.filter(e => e.phase === phase.name);
                                            if (phaseItems.length === 0) return null;
                                            const phaseKey = `${group.name}::${phase.name}`;
                                            const isPhaseOpen = expandedPhases.has(phaseKey);
                                            const hasSubPhases = phase.subPhases.length > 0 &&
                                                phaseItems.some(e => e.subPhase);

                                            return (
                                                <div key={phase.id} className="border-t border-gray-50">
                                                    {/* Phase row */}
                                                    <div className="flex items-center gap-0 pl-10 pr-4 py-0.5 hover:bg-indigo-50/40 group/row">
                                                        <button
                                                            onClick={() => togglePhase(phaseKey)}
                                                            className="flex items-center gap-2.5 flex-1 py-2.5 text-left min-w-0"
                                                        >
                                                            <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                                                                {isPhaseOpen
                                                                    ? <ChevronDown className="w-3 h-3" />
                                                                    : <ChevronRight className="w-3 h-3" />
                                                                }
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <span className="text-[11px] font-black text-gray-800 uppercase tracking-tight truncate block">{phase.name}</span>
                                                                <span className="text-[10px] font-bold text-gray-400">{phaseItems.length} itens · {fmtMoney(sumItems(phaseItems))}</span>
                                                            </div>
                                                        </button>
                                                        <ImportBtn
                                                            label="Importar etapa"
                                                            onClick={() => handleSelectPhase(phase.name)}
                                                            color="indigo"
                                                        />
                                                    </div>

                                                    {isPhaseOpen && hasSubPhases && phase.subPhases.map(sp => {
                                                        const spItems = phaseItems.filter(e => e.subPhase === sp);
                                                        if (spItems.length === 0) return null;
                                                        const spKey = `${phaseKey}::${sp}`;
                                                        const isSpOpen = expandedSubPhases.has(spKey);

                                                        return (
                                                            <div key={sp}>
                                                                {/* SubPhase row */}
                                                                <div className="flex items-center gap-0 pl-20 pr-4 py-0.5 hover:bg-violet-50/40 group/row">
                                                                    <button
                                                                        onClick={() => toggleSubPhase(spKey)}
                                                                        className="flex items-center gap-2 flex-1 py-2 text-left min-w-0"
                                                                    >
                                                                        <div className="w-5 h-5 rounded bg-violet-100 text-violet-600 flex items-center justify-center flex-shrink-0">
                                                                            {isSpOpen
                                                                                ? <ChevronDown className="w-2.5 h-2.5" />
                                                                                : <ChevronRight className="w-2.5 h-2.5" />
                                                                            }
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <span className="text-[10px] font-black text-gray-700 uppercase tracking-tight truncate block">{sp}</span>
                                                                            <span className="text-[9px] font-bold text-gray-400">{spItems.length} itens · {fmtMoney(sumItems(spItems))}</span>
                                                                        </div>
                                                                    </button>
                                                                    <ImportBtn
                                                                        label="Importar subetapa"
                                                                        onClick={() => handleSelectSubPhase(phase.name, sp)}
                                                                        color="violet"
                                                                    />
                                                                </div>

                                                                {isSpOpen && spItems.map((item, idx) => (
                                                                    <div key={item.id || idx} className="pl-28 pr-4 py-0.5">
                                                                        <ItemRow
                                                                            item={item}
                                                                            indent
                                                                            onSelect={() => handleSelectItem(item)}
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Items without subphase (or when no subphases) */}
                                                    {isPhaseOpen && phaseItems
                                                        .filter(e => !hasSubPhases || !e.subPhase)
                                                        .map((item, idx) => (
                                                            <div key={item.id || idx} className="pl-20 pr-4 py-0.5">
                                                                <ItemRow
                                                                    item={item}
                                                                    indent
                                                                    onSelect={() => handleSelectItem(item)}
                                                                />
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            );
                                        })}

                                        {/* Items not in any phase */}
                                        {isGroupOpen && groupItems
                                            .filter(e => !e.phase || !group.phases.find(p => p.name === e.phase))
                                            .map((item, idx) => (
                                                <div key={item.id || idx} className="pl-10 pr-4 py-0.5">
                                                    <ItemRow
                                                        item={item}
                                                        indent
                                                        onSelect={() => handleSelectItem(item)}
                                                    />
                                                </div>
                                            ))
                                        }
                                    </div>
                                );
                            })}

                            {/* Items with no group */}
                            {(() => {
                                const orphans = budget.filter(e =>
                                    !e.group || !effectiveWbs.find(g => g.name === e.group)
                                );
                                if (orphans.length === 0) return null;
                                return (
                                    <div className="border-t border-gray-50">
                                        <div className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                            Outros itens
                                        </div>
                                        {orphans.map((item, idx) => (
                                            <div key={item.id || idx} className="px-4 py-0.5">
                                                <ItemRow item={item} onSelect={() => handleSelectItem(item)} />
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center flex-shrink-0">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">
                        {isSearching ? `${filteredItems.length} de ${totalItems}` : totalItems} Itens
                    </span>
                    <div className="flex items-center gap-2 text-blue-600">
                        <Target className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Clique no nível desejado para importar</span>
                    </div>
                </div>
            </div>

            {compositionItem && (
                <MaterialSelectionModal
                    isOpen
                    onClose={() => setCompositionItem(null)}
                    item={compositionItem.sinapiItem!}
                    budgetQuantity={compositionItem.quantity}
                    onSelect={selected => {
                        onSelect(selected.map(insumo => ({
                            id: insumo.code,
                            sinapiItem: {
                                code: insumo.code,
                                description: insumo.description,
                                unit: insumo.unit,
                                price: insumo.price || 0,
                                type: insumo.type,
                                category: insumo.category ?? '',
                                source: 'Própria' as const,
                                isOverride: true,
                            },
                            quantity: insumo.selectedQuantity,
                            phase: compositionItem.phase,
                            group: compositionItem.group,
                        })));
                        setCompositionItem(null);
                        onClose();
                    }}
                />
            )}
        </div>
    );
};

/* ─── Shared sub-components ─── */

interface ItemRowProps {
    item: BudgetEntry;
    onSelect: () => void;
    indent?: boolean;
    showPath?: boolean;
}

const ItemRow: React.FC<ItemRowProps> = ({ item, onSelect, indent, showPath }) => {
    const desc = item.sinapiItem?.description || 'Item sem descrição';
    const code = item.sinapiItem?.code || '';
    const unit = item.sinapiItem?.unit || 'UNID';
    const price = item.sinapiItem?.price ?? 0;
    const isComp = item.sinapiItem?.type === SinapiType.COMPOSITION;

    return (
        <button
            onClick={onSelect}
            className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                hover:bg-blue-50 hover:border-blue-200 border border-transparent
                transition-all group text-left
                ${indent ? 'text-[11px]' : 'text-sm'}
            `}
        >
            <div className={`
                flex-shrink-0 rounded-lg flex items-center justify-center
                ${isComp ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400 group-hover:bg-blue-600 group-hover:text-white'}
                ${indent ? 'w-6 h-6' : 'w-8 h-8'}
                transition-all
            `}>
                {isComp ? <Layers className="w-3.5 h-3.5" /> : <Hash className="w-3 h-3" />}
            </div>
            <div className="flex-1 min-w-0">
                {showPath && (item.group || item.phase) && (
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest truncate mb-0.5">
                        {[item.group, item.phase, item.subPhase].filter(Boolean).join(' › ')}
                    </div>
                )}
                <div className="flex items-center gap-1.5 mb-0.5">
                    {code && <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">{code}</span>}
                    {code && <span className="w-0.5 h-0.5 bg-gray-300 rounded-full" />}
                    <span className="text-[9px] font-bold text-gray-400 uppercase">{unit}</span>
                </div>
                <p className="font-black text-gray-900 uppercase tracking-tight truncate leading-tight text-[11px]">
                    {desc}
                </p>
            </div>
            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                <div className="text-right">
                    <p className="text-[9px] font-bold text-gray-400 uppercase">R$/un</p>
                    <p className="text-xs font-black text-gray-800 tabular-nums">
                        {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                </div>
                <div className="w-7 h-7 rounded-lg bg-gray-50 group-hover:bg-blue-600 flex items-center justify-center transition-all border border-gray-100 group-hover:border-blue-600">
                    <Plus className="w-3.5 h-3.5 text-gray-300 group-hover:text-white transition-colors" />
                </div>
            </div>
        </button>
    );
};

interface ImportBtnProps {
    label: string;
    onClick: () => void;
    color: 'blue' | 'indigo' | 'violet';
}

const colorMap = {
    blue: 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border-blue-100',
    indigo: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white border-indigo-100',
    violet: 'bg-violet-50 text-violet-600 hover:bg-violet-600 hover:text-white border-violet-100',
};

const ImportBtn: React.FC<ImportBtnProps> = ({ label, onClick, color }) => (
    <button
        onClick={e => { e.stopPropagation(); onClick(); }}
        title={label}
        className={`
            flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg border
            text-[9px] font-black uppercase tracking-widest
            transition-all opacity-0 group-hover/row:opacity-100
            ${colorMap[color]}
        `}
    >
        <Plus className="w-2.5 h-2.5" />
        {label}
    </button>
);

export default BudgetPickerModal;
