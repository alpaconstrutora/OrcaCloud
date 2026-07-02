import React from 'react';
import { Users, X, Trash2, Plus } from 'lucide-react';
import Button from '../ui/Button';
import { ProjectSchedule, ResourceAllocation } from '../../types';

interface ResourceAllocationModalProps {
    taskId: string;
    schedule: ProjectSchedule;
    allocationType: 'ROLE' | 'WORKER' | 'TEAM' | 'MATERIAL' | 'COST';
    setAllocationType: (type: 'ROLE' | 'WORKER' | 'TEAM' | 'MATERIAL' | 'COST') => void;
    onClose: () => void;
    onUpdateAllocation: (taskId: string, allocations: ResourceAllocation[]) => void;
}

const TYPE_LABEL: Record<ResourceAllocationModalProps['allocationType'], string> = {
    ROLE: 'Função',
    WORKER: 'Trabalhador',
    TEAM: 'Equipe',
    MATERIAL: 'Material',
    COST: 'Custo Avulso',
};

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
                                    const material = alloc.resourceType === 'MATERIAL' ? schedule.resources?.materials?.find(m => m.id === alloc.resourceId) : null;
                                    const name = role?.name || worker?.name || team?.name || material?.name || (alloc.resourceType === 'COST' ? 'Custo Avulso' : 'Recurso Desconhecido');
                                    const isNonHuman = alloc.resourceType === 'MATERIAL' || alloc.resourceType === 'COST';

                                    return (
                                        <div key={alloc.id} className="flex items-center justify-between p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                                            <div>
                                                <div className="text-sm font-black text-gray-900">{name}</div>
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                    {TYPE_LABEL[alloc.resourceType]} • {alloc.resourceType === 'COST'
                                                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(alloc.fixedCost || 0)
                                                        : `${alloc.quantity} unid.`}
                                                    {!isNonHuman && ` • ${alloc.hoursPerDay}h/dia`}
                                                    {!isNonHuman && !!alloc.overtimeHours && ` • +${alloc.overtimeHours}h extra`}
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

                                    if (allocationType === 'COST') {
                                        const fixedCost = parseFloat(formData.get('fixedCost') as string) || 0;
                                        if (fixedCost <= 0) return;
                                        const newAlloc: ResourceAllocation = {
                                            id: crypto.randomUUID(),
                                            resourceId: 'cost',
                                            resourceType: 'COST',
                                            quantity: 1,
                                            hoursPerDay: 0,
                                            fixedCost,
                                        };
                                        onUpdateAllocation(taskId, [...taskAllocations, newAlloc]);
                                        e.currentTarget.reset();
                                        return;
                                    }

                                    const resourceId = formData.get('resourceId') as string;
                                    if (!resourceId) return;

                                    const newAlloc: ResourceAllocation = {
                                        id: crypto.randomUUID(),
                                        resourceId,
                                        resourceType: allocationType,
                                        quantity: parseFloat(formData.get('quantity') as string) || 1,
                                        hoursPerDay: allocationType === 'MATERIAL' ? 0 : parseFloat(formData.get('hoursPerDay') as string) || 8,
                                        ...(allocationType !== 'MATERIAL' && formData.get('overtimeHours') ? { overtimeHours: parseFloat(formData.get('overtimeHours') as string) || undefined } : {}),
                                    };
                                    onUpdateAllocation(taskId, [...taskAllocations, newAlloc]);
                                    e.currentTarget.reset();
                                }}
                                className="space-y-4"
                            >
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Tipo de Recurso</label>
                                        <div className="flex bg-gray-100 p-1 rounded-xl flex-wrap">
                                            {(['ROLE', 'WORKER', 'TEAM', 'MATERIAL', 'COST'] as const).map(type => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setAllocationType(type)}
                                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${allocationType === type ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    {TYPE_LABEL[type]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {allocationType !== 'COST' && (
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">{TYPE_LABEL[allocationType]}</label>
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
                                                {allocationType === 'MATERIAL' && (schedule.resources?.materials || []).map(material => (
                                                    <option key={material.id} value={material.id}>{material.name} ({material.unit})</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {allocationType === 'COST' ? (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Valor Fixo (R$)</label>
                                        <input name="fixedCost" type="number" step="0.01" required className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-100 outline-none text-sm" placeholder="Ex: mobilização, taxa" />
                                    </div>
                                ) : allocationType === 'MATERIAL' ? (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Quantidade</label>
                                        <input name="quantity" type="number" step="0.1" defaultValue="1" required className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Quantidade</label>
                                            <input name="quantity" type="number" step="0.1" defaultValue="1" required className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Horas/Dia</label>
                                            <input name="hoursPerDay" type="number" step="0.5" defaultValue="8" required className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Hora Extra/Dia</label>
                                            <input name="overtimeHours" type="number" step="0.5" placeholder="0" className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                                        </div>
                                    </div>
                                )}

                                <Button type="submit" className="w-full shadow-sm">
                                    <Plus className="w-4 h-4" />
                                    Adicionar Recurso
                                </Button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
