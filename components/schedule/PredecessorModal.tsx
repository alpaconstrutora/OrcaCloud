import React from 'react';
import { Link2, X, Trash2, Plus } from 'lucide-react';
import { HierarchyNode, Predecessor, DependencyType } from '../../types';

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
    // Flatten hierarchy to get all tasks for selection
    const allTasks = React.useMemo(() => {
        const tasks: { id: string, name: string, group: string, phase: string }[] = [];
        const walk = (nodes: HierarchyNode[]) => {
            nodes.forEach(n => {
                if (n.type === 'item' && n.data && n.id !== taskId) {
                    tasks.push({
                        id: n.id,
                        name: n.data.sinapiItem.description,
                        group: n.data.group,
                        phase: n.data.phase
                    });
                }
                if (n.children) walk(n.children);
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
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Predecessores Atuais</h4>
                            <div className="space-y-2">
                                {predecessors.map(p => {
                                    const task = allTasks.find(t => t.id === p.id);
                                    return (
                                        <div key={p.id} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                            <div className="flex-1">
                                                <div className="text-xs font-bold text-gray-800 flex items-center gap-2">
                                                    <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[10px]">{idToUid[p.id]}</span>
                                                    {task?.name || 'Item não encontrado'}
                                                </div>
                                                <div className="text-[10px] text-gray-500 mt-0.5">Tipo: {p.type} • Lag: {p.lag} dias</div>
                                            </div>
                                            <button onClick={() => handleRemove(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                                {predecessors.length === 0 && (
                                    <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-xl text-gray-400 text-xs">Nenhum predecessor definido</div>
                                )}
                            </div>
                        </div>

                        <div className="pt-6 border-t border-gray-100">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Adicionar Novo Predecessor</h4>
                            <div className="space-y-2">
                                {allTasks.filter(t => !predecessors.some(p => p.id === t.id)).map(task => (
                                    <div key={task.id} className="p-3 border border-gray-100 rounded-xl hover:border-blue-200 hover:bg-blue-50/30 transition-all flex items-center justify-between group">
                                        <div className="flex-1">
                                            <div className="text-xs font-bold text-gray-800 line-clamp-1 flex items-center gap-2">
                                                <span className="text-[9px] bg-gray-100 px-1 rounded text-gray-400">{idToUid[task.id]}</span>
                                                {task.name}
                                            </div>
                                            <div className="text-[10px] text-gray-500 flex items-center gap-2 mt-0.5">
                                                <span>{task.group}</span>
                                                <span>•</span>
                                                <span>{task.phase}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <select id={`type-${task.id}`} className="text-[10px] font-bold border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-500" defaultValue="FS">
                                                <option value="FS">FS</option>
                                                <option value="SS">SS</option>
                                                <option value="FF">FF</option>
                                                <option value="SF">SF</option>
                                            </select>
                                            <input id={`lag-${task.id}`} type="number" className="w-12 text-[10px] font-bold border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-500" defaultValue="0" />
                                            <button
                                                onClick={() => {
                                                    const type = (document.getElementById(`type-${task.id}`) as HTMLSelectElement).value as DependencyType;
                                                    const lag = parseInt((document.getElementById(`lag-${task.id}`) as HTMLInputElement).value, 10) || 0;
                                                    handleAdd(task.id, type, lag);
                                                }}
                                                className="bg-blue-600 text-white p-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
