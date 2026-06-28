import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, FolderPlus, Pencil, Copy, Trash2, ChevronUp, ChevronDown, Package, Diamond, Ban, RotateCcw } from 'lucide-react';
import { HierarchyNode } from '../../types';
import { OutlineNodeType } from '../../utils/scheduleOutline';

export interface OutlineActions {
    onAddChild: (parentId: string, type: OutlineNodeType) => void;
    onAddItem: (parentId: string) => void;
    onAddMilestone: (parentId: string) => void;
    onRename: (id: string, currentName: string) => void;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
    onReorder: (id: string, dir: -1 | 1) => void;
    onToggleInactive: (id: string) => void;
}

/** Children types that may be added under a given node type. */
function addableChildren(type: HierarchyNode['type']): OutlineNodeType[] {
    switch (type) {
        case 'group': return ['phase', 'subphase', 'activity'];
        case 'phase': return ['subphase', 'activity'];
        case 'subphase': return ['activity'];
        default: return [];
    }
}

const CHILD_LABEL: Record<OutlineNodeType, string> = {
    group: 'Grupo', phase: 'Etapa', subphase: 'Subetapa', activity: 'Atividade', item: 'Item',
};

export const OutlineRowMenu: React.FC<{ node: HierarchyNode; actions: OutlineActions }> = ({ node, actions }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const children = addableChildren(node.type);
    const canHaveItem = node.type === 'group' || node.type === 'phase' || node.type === 'subphase';
    const close = () => setOpen(false);
    const run = (fn: () => void) => { fn(); close(); };

    return (
        <div ref={ref} className="relative inline-block" onClick={e => e.stopPropagation()}>
            <button
                onClick={() => setOpen(o => !o)}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                title="Ações"
            >
                <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {open && (
                <div className="absolute left-0 top-full mt-1 z-[120] w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 text-left animate-in fade-in zoom-in duration-150">
                    {children.map(ct => (
                        <button key={ct} onClick={() => run(() => actions.onAddChild(node.id, ct))}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-button font-medium text-gray-600 hover:bg-gray-50">
                            <FolderPlus className="w-3.5 h-3.5 text-gray-400" /> Adicionar {CHILD_LABEL[ct]}
                        </button>
                    ))}
                    {canHaveItem && (
                        <button onClick={() => run(() => actions.onAddItem(node.id))}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-button font-medium text-gray-600 hover:bg-gray-50">
                            <Package className="w-3.5 h-3.5 text-gray-400" /> Adicionar Item (com custo)
                        </button>
                    )}
                    {canHaveItem && (
                        <button onClick={() => run(() => actions.onAddMilestone(node.id))}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-button font-medium text-gray-600 hover:bg-gray-50">
                            <Diamond className="w-3.5 h-3.5 text-gray-400" /> Adicionar Marco
                        </button>
                    )}
                    {(children.length > 0 || canHaveItem) && <div className="h-px bg-gray-100 my-1" />}
                    <button onClick={() => run(() => actions.onRename(node.id, node.name))}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-button font-medium text-gray-600 hover:bg-gray-50">
                        <Pencil className="w-3.5 h-3.5 text-gray-400" /> Renomear
                    </button>
                    <button onClick={() => run(() => actions.onDuplicate(node.id))}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-button font-medium text-gray-600 hover:bg-gray-50">
                        <Copy className="w-3.5 h-3.5 text-gray-400" /> Duplicar
                    </button>
                    <button onClick={() => run(() => actions.onReorder(node.id, -1))}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-button font-medium text-gray-600 hover:bg-gray-50">
                        <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> Subir
                    </button>
                    <button onClick={() => run(() => actions.onReorder(node.id, 1))}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-button font-medium text-gray-600 hover:bg-gray-50">
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> Descer
                    </button>
                    {node.type === 'item' && (
                        <button onClick={() => run(() => actions.onToggleInactive(node.id))}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-button font-medium text-gray-600 hover:bg-gray-50">
                            {node.inactive
                                ? <><RotateCcw className="w-3.5 h-3.5 text-gray-400" /> Reativar</>
                                : <><Ban className="w-3.5 h-3.5 text-gray-400" /> Marcar Inativa</>}
                        </button>
                    )}
                    <div className="h-px bg-gray-100 my-1" />
                    <button onClick={() => run(() => actions.onDelete(node.id))}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-button font-medium text-red-500 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" /> Excluir
                    </button>
                </div>
            )}
        </div>
    );
};
