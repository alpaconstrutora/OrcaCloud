import React from 'react';
import { Link2, X, Plus } from 'lucide-react';
import { HierarchyNode, Predecessor, DependencyType } from '../../types';
import Button from '../ui/Button';
import ActionIconButton from '../ui/ActionIconButton';

interface PredecessorModalProps {
    taskId: string;
    hierarchy: HierarchyNode[];
    idToUid: Record<string, string>;
    predecessors: Predecessor[];
    onClose: () => void;
    onUpdate: (newPreds: Predecessor[]) => void;
}

export const PredecessorModal: React.FC<PredecessorModalProps> = ({
    taskId,
    hierarchy,
    idToUid,
    predecessors,
    onClose,
    onUpdate
}) => {
    // Flatten hierarchy to get all tasks for selection (items + group/phase/subphase nodes)
    const allTasks = React.useMemo(() => {
        const tasks: { id: string, name: string, group: string, phase: string, nodeType: string }[] = [];
        const walk = (nodes: HierarchyNode[], parentGroup = '', parentPhase = '') => {
            nodes.forEach(n => {
                if (n.id === taskId) {
                    if (n.children) walk(n.children, parentGroup, parentPhase);
                    return;
                }
                if (n.type === 'group') {
                    tasks.push({ id: n.id, name: n.name, group: '', phase: '', nodeType: 'group' });
                    if (n.children) walk(n.children, n.name, parentPhase);
                } else if (n.type === 'phase') {
                    tasks.push({ id: n.id, name: n.name, group: parentGroup, phase: '', nodeType: 'phase' });
                    if (n.children) walk(n.children, parentGroup, n.name);
                } else if (n.type === 'subphase') {
                    tasks.push({ id: n.id, name: n.name, group: parentGroup, phase: parentPhase, nodeType: 'subphase' });
                    if (n.children) walk(n.children, parentGroup, parentPhase);
                } else if (n.type === 'item' && n.data) {
                    tasks.push({
                        id: n.id,
                        name: n.data.sinapiItem.description,
                        group: parentGroup,
                        phase: parentPhase,
                        nodeType: 'item'
                    });
                }
            });
        };
        walk(hierarchy);
        return tasks;
    }, [hierarchy, taskId]);

    const handleAdd = (predId: string, type: DependencyType, lag: number) => {
        const exists = predecessors.some(p => p.id === predId);
        if (exists) return;
        onUpdate([...predecessors, { id: predId, type, lag }]);
    };

    const handleRemove = (predId: string) => {
        onUpdate(predecessors.filter(p => p.id !== predId));
    };

    const handleUpdatePred = (predId: string, field: 'type' | 'lag', value: string | number) => {
        onUpdate(predecessors.map(p =>
            p.id === predId ? { ...p, [field]: field === 'lag' ? Number(value) : value } : p
        ));
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-blue-600" />
                        Gerenciar Predecessores
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 bg-white">
                    <div className="space-y-6">
                        <div>
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Predecessores Atuais</h4>
                            <div className="space-y-2">
                                {predecessors.map(p => {
                                    const task = allTasks.find(t => t.id === p.id);
                                    const typeLabel: Record<string, string> = { group: 'Grupo', phase: 'Etapa', subphase: 'Subetapa', item: 'Item' };
                                    return (
                                        <div key={p.id} className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-bold text-gray-800 flex items-center gap-2">
                                                    <span className="shrink-0 bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-xs">{idToUid[p.id] || (task?.nodeType ? typeLabel[task.nodeType] : '—')}</span>
                                                    <span className="truncate">{task?.name || 'Item não encontrado'}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <select
                                                    value={p.type}
                                                    onChange={(e) => handleUpdatePred(p.id, 'type', e.target.value)}
                                                    className="text-xs font-bold border border-blue-200 bg-white rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                                >
                                                    <option value="FS">Termina-Início (TI)</option>
                                                    <option value="SS">Início-Início (II)</option>
                                                    <option value="FF">Termina-Termina (TT)</option>
                                                    <option value="SF">Início-Termina (IT)</option>
                                                </select>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        value={p.lag}
                                                        onChange={(e) => handleUpdatePred(p.id, 'lag', e.target.value)}
                                                        className="w-14 text-xs font-bold border border-blue-200 bg-white rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-blue-500 text-center"
                                                    />
                                                    <span className="text-[9px] text-gray-400 font-medium">lag</span>
                                                </div>
                                                <ActionIconButton kind="delete" onClick={() => handleRemove(p.id)} />
                                            </div>
                                        </div>
                                    );
                                })}
                                {predecessors.length === 0 && (
                                    <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-xl text-gray-400 text-xs">Nenhum predecessor definido</div>
                                )}
                            </div>
                        </div>

                        <div className="pt-6 border-t border-gray-100">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Adicionar Novo Predecessor</h4>
                            <div className="space-y-2">
                                {allTasks.filter(t => !predecessors.some(p => p.id === t.id)).map(task => {
                                    const nodeColors: Record<string, string> = {
                                        group: 'bg-violet-100 text-violet-600',
                                        phase: 'bg-sky-100 text-sky-600',
                                        subphase: 'bg-teal-100 text-teal-600',
                                        item: 'bg-gray-100 text-gray-400',
                                    };
                                    const nodeLabels: Record<string, string> = { group: 'Grupo', phase: 'Etapa', subphase: 'Subetapa', item: '' };
                                    return (
                                    <div key={task.id} className="p-3 border border-gray-100 rounded-xl hover:border-blue-200 hover:bg-blue-50/30 transition-all flex items-center justify-between group">
                                        <div className="flex-1">
                                            <div className="text-xs font-bold text-gray-800 line-clamp-1 flex items-center gap-2">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${nodeColors[task.nodeType] || 'bg-gray-100 text-gray-400'}`}>
                                                    {nodeLabels[task.nodeType] || idToUid[task.id]}
                                                </span>
                                                {task.name}
                                            </div>
                                            <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                                                {task.group && <span>{task.group}</span>}
                                                {task.group && task.phase && <span>•</span>}
                                                {task.phase && <span>{task.phase}</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <select id={`type-${task.id}`} className="text-xs font-bold border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-500" defaultValue="FS">
                                                <option value="FS">Termina-Início (TI)</option>
                                                <option value="SS">Início-Início (II)</option>
                                                <option value="FF">Termina-Termina (TT)</option>
                                                <option value="SF">Início-Termina (IT)</option>
                                            </select>
                                            <input id={`lag-${task.id}`} type="number" className="w-12 text-xs font-bold border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-500" defaultValue="0" />
                                            <Button
                                                onClick={() => {
                                                    const type = (document.getElementById(`type-${task.id}`) as HTMLSelectElement).value as DependencyType;
                                                    const lag = parseInt((document.getElementById(`lag-${task.id}`) as HTMLInputElement).value, 10) || 0;
                                                    handleAdd(task.id, type, lag);
                                                }}
                                                variant="primary"
                                                size="icon"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
