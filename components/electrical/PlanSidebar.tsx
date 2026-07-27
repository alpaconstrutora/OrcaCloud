import React, { useState } from 'react';
import { Layers, Plus, Trash2, Edit2, Check, X, Image as ImageIcon } from 'lucide-react';
import { OpuraElectricalPlan } from '../../types/electrical';

interface PlanSidebarProps {
  plans: OpuraElectricalPlan[];
  activePlanId: string | null;
  onSelectPlan: (id: string) => void;
  onDeletePlan: (id: string) => void;
  onRenamePlan: (id: string, newName: string) => void;
  onCreateEmptyPlan: () => void;
}

const PlanSidebar: React.FC<PlanSidebarProps> = ({ 
  plans, 
  activePlanId, 
  onSelectPlan, 
  onDeletePlan, 
  onRenamePlan,
  onCreateEmptyPlan 
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleStartEdit = (plan: OpuraElectricalPlan, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(plan.id);
    setEditName(plan.floorName || 'Planta sem nome');
  };

  const handleSaveEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingId && editName.trim()) {
      onRenamePlan(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Tem certeza que deseja excluir esta planta? TODAS as paredes, salas e pontos desenhados nela também serão excluídos permanentemente!')) {
      onDeletePlan(id);
    }
  };

  return (
    <div className="flex flex-col h-1/2 border-b border-slate-200">
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          Plantas / Páginas
        </h2>
        <button 
          onClick={onCreateEmptyPlan}
          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors"
          title="Nova Camada Vazia"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {plans.length === 0 ? (
          <div className="text-center p-4 text-sm text-slate-500">
            Nenhuma planta importada.
          </div>
        ) : (
          <div className="space-y-1">
            {plans.map(plan => (
              <div 
                key={plan.id}
                onClick={() => onSelectPlan(plan.id)}
                className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                  activePlanId === plan.id 
                    ? 'bg-blue-50 border border-blue-200' 
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                {editingId === plan.id ? (
                  <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                    <input 
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveEdit(e as any);
                        if (e.key === 'Escape') handleCancelEdit(e as any);
                      }}
                    />
                    <button onClick={handleSaveEdit} className="p-1 text-green-600 hover:bg-green-50 rounded">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={handleCancelEdit} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <ImageIcon className={`w-4 h-4 shrink-0 ${activePlanId === plan.id ? 'text-blue-500' : 'text-slate-400'}`} />
                      <span className={`text-sm truncate ${activePlanId === plan.id ? 'font-semibold text-blue-900' : 'text-slate-700'}`}>
                        {plan.floorName || 'Planta sem nome'}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => handleStartEdit(plan, e)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                        title="Renomear planta"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => handleDelete(plan.id, e)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                        title="Excluir planta e todos os desenhos"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanSidebar;
