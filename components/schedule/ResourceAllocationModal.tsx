import React from 'react';
import { Users, X, Trash2, Plus } from 'lucide-react';
import { ProjectSchedule, ResourceAllocation } from '../../types';

interface ResourceAllocationModalProps {
    taskId: string;
    schedule: ProjectSchedule;
    allocationType: 'ROLE' | 'WORKER' | 'TEAM';
    setAllocationType: (type: 'ROLE' | 'WORKER' | 'TEAM') => void;
    onClose: () => void;
    onUpdateAllocation: (taskId: string, allocations: ResourceAllocation[]) => void;
}

export const ResourceAllocationModal: React.FC<ResourceAllocationModalProps> = ({
    taskId,
    schedule,
    allocationType,
    setAllocationType,
    onClose,
    onUpdateAllocation
}) => {
    const taskAllocations = schedule.itemSchedules?.find(s => s.id === taskId)?.allocations || [];

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-600" />
                        Alocação de Recursos
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                    <div className="space-y-6">
                        <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Recursos Alocados</h4>
                            <div className="space-y-2">
                                {taskAllocations.map(alloc => {
                                    const role = alloc.resourceType === 'ROLE' ? schedule.resources?.roles.find(r => r.id === alloc.resourceId) : null;
                                    const worker = alloc.resourceType === 'WORKER' ? schedule.resources?.workers.find(w => w.id === alloc.resourceId) : null;
                                    const team = alloc.resourceType === 'TEAM' ? schedule.resources?.teams.find(t => t.id === alloc.resourceId) : null;
                                    const name = role?.name || worker?.name || team?.name || 'Recurso Desconhecido';

                                    return (
                                        <div key={alloc.id} className="flex items-center justify-between p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                                            <div>
                                                <div className="text-sm font-black text-gray-900">{name}</div>
                                                <div className="text-[10px] text-gray-500 mt-0.5">
                                                    {alloc.resourceType === 'TEAM' ? 'Equipe' : alloc.resourceType === 'WORKER' ? 'Trabalhador' : 'Função'} • {alloc.quantity} unid. • {alloc.hoursPerDay}h/dia
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    onUpdateAllocation(taskId, taskAllocations.filter(a => a.id !== alloc.id));
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                                {taskAllocations.length === 0 && (
                                    <div className="text-center py-8 border-2 border-dashed border-gray-100 rounded-2xl text-gray-400 text-sm">
                                        Nenhum recurso alocado
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="pt-6 border-t border-gray-100">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Adicionar Novo Recurso</h4>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    const formData = new FormData(e.currentTarget);
                                    const resourceId = formData.get('resourceId') as string;
                                    if (!resourceId) return;

                                    const newAlloc: ResourceAllocation = {
                                        id: crypto.randomUUID(),
                                        resourceId,
                                        resourceType: allocationType,
                                        quantity: parseFloat(formData.get('quantity') as string) || 1,
                                        hoursPerDay: parseFloat(formData.get('hoursPerDay') as string) || 8,
                                    };
                                    onUpdateAllocation(taskId, [...taskAllocations, newAlloc]);
                                    e.currentTarget.reset();
                                }}
                                className="space-y-4"
                            >
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Tipo de Recurso</label>
                                        <div className="flex bg-gray-100 p-1 rounded-xl">
                                            {(['ROLE', 'WORKER', 'TEAM'] as const).map(type => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setAllocationType(type)}
                                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${allocationType === type ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    {type === 'ROLE' ? 'Função' : type === 'WORKER' ? 'Trabalhador' : 'Equipe'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">
                                            {allocationType === 'ROLE' ? 'Função/Recurso' : allocationType === 'WORKER' ? 'Trabalhador' : 'Equipe'}
                                        </label>
                                        <select name="resourceId" required className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-sm">
                                            <option value="">Selecione...</option>
                                            {allocationType === 'ROLE' && schedule.resources?.roles.map(role => (
                                                <option key={role.id} value={role.id}>{role.name}</option>
                                            ))}
                                            {allocationType === 'WORKER' && schedule.resources?.workers.map(worker => (
                                                <option key={worker.id} value={worker.id}>{worker.name}</option>
                                            ))}
                                            {allocationType === 'TEAM' && schedule.resources?.teams.map(team => (
                                                <option key={team.id} value={team.id}>{team.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Quantidade</label>
                                        <input name="quantity" type="number" step="0.1" defaultValue="1" required className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Horas/Dia</label>
                                        <input name="hoursPerDay" type="number" step="0.5" defaultValue="8" required className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                                    </div>
                                </div>
                                <button type="submit" className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-sm">
                                    <Plus className="w-4 h-4" />
                                    Adicionar Recurso
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
