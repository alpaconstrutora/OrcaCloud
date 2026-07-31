import React, { useState } from 'react';
import { X, Save, Trash2, Plus, Minus, AlignCenter } from 'lucide-react';
import { OpuraElectricalConduit, WireAnnotation } from '../../types/electrical';
import Button from '../ui/Button';

interface ConduitPropertiesSidebarProps {
  conduit: OpuraElectricalConduit;
  onUpdate: (updates: Partial<OpuraElectricalConduit>) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export default function ConduitPropertiesSidebar({ conduit, onUpdate, onDelete, onClose }: ConduitPropertiesSidebarProps) {
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState(conduit.type || 'teto');
  const [wires, setWires] = useState<WireAnnotation[]>(conduit.wires || []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({ type, wires });
    } finally {
      setSaving(false);
    }
  };

  const addCircuit = () => {
    setWires([...wires, { circuit: '', phase: 0, neutral: 0, ground: 0, returns: [] }]);
  };

  const removeCircuit = (index: number) => {
    const newWires = [...wires];
    newWires.splice(index, 1);
    setWires(newWires);
  };

  const updateCircuit = (index: number, updates: Partial<WireAnnotation>) => {
    const newWires = [...wires];
    newWires[index] = { ...newWires[index], ...updates };
    setWires(newWires);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      {saving && (
        <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-20 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}
      
      {/* HEADER */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200 shrink-0">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <AlignCenter className="w-5 h-5 text-orange-500" />
          Propriedades da Conexão
        </h3>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* TIPO */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 block">Tipo de Eletroduto</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'teto', label: 'Teto/Laje', desc: 'Contínuo' },
              { id: 'parede', label: 'Parede', desc: 'Tracejado' },
              { id: 'piso', label: 'Piso', desc: 'Pontilhado' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`p-2 border rounded-lg text-center transition-colors ${type === t.id ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'}`}
              >
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-[10px] opacity-70">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* FIOS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-700 block">Circuitos e Fiação</label>
            <button
              onClick={addCircuit}
              className="text-xs flex items-center gap-1 text-orange-600 hover:bg-orange-50 px-2 py-1 rounded-md font-medium transition-colors"
            >
              <Plus className="w-3 h-3" /> Adicionar
            </button>
          </div>

          {wires.length === 0 ? (
            <div className="text-center p-6 bg-white border border-dashed border-slate-300 rounded-lg text-slate-400 text-sm">
              Nenhuma fiação definida.
            </div>
          ) : (
            wires.map((wire, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 space-y-3 shadow-sm relative">
                <button
                  onClick={() => removeCircuit(idx)}
                  className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                
                <div className="pr-6">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Circuito</label>
                  <input
                    type="text"
                    value={wire.circuit}
                    onChange={(e) => updateCircuit(idx, { circuit: e.target.value })}
                    placeholder="Ex: 1, 2, Ilum"
                    className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Fases</label>
                    <div className="flex items-center border border-slate-300 rounded overflow-hidden">
                      <button onClick={() => updateCircuit(idx, { phase: Math.max(0, (wire.phase||0) - 1) })} className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border-r border-slate-300"><Minus className="w-3 h-3" /></button>
                      <div className="flex-1 text-center text-sm font-medium">{wire.phase || 0}</div>
                      <button onClick={() => updateCircuit(idx, { phase: (wire.phase||0) + 1 })} className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border-l border-slate-300"><Plus className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Neutros</label>
                    <div className="flex items-center border border-slate-300 rounded overflow-hidden">
                      <button onClick={() => updateCircuit(idx, { neutral: Math.max(0, (wire.neutral||0) - 1) })} className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border-r border-slate-300"><Minus className="w-3 h-3" /></button>
                      <div className="flex-1 text-center text-sm font-medium">{wire.neutral || 0}</div>
                      <button onClick={() => updateCircuit(idx, { neutral: (wire.neutral||0) + 1 })} className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border-l border-slate-300"><Plus className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Terras</label>
                    <div className="flex items-center border border-slate-300 rounded overflow-hidden">
                      <button onClick={() => updateCircuit(idx, { ground: Math.max(0, (wire.ground||0) - 1) })} className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border-r border-slate-300"><Minus className="w-3 h-3" /></button>
                      <div className="flex-1 text-center text-sm font-medium">{wire.ground || 0}</div>
                      <button onClick={() => updateCircuit(idx, { ground: (wire.ground||0) + 1 })} className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border-l border-slate-300"><Plus className="w-3 h-3" /></button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Retornos (separados por vírgula)</label>
                  <input
                    type="text"
                    value={wire.returns?.join(', ') || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val.trim()) updateCircuit(idx, { returns: [] });
                      else updateCircuit(idx, { returns: val.split(',').map(s => s.trim()).filter(Boolean) });
                    }}
                    placeholder="Ex: a, b"
                    className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                  />
                </div>
              </div>
            ))
          )}
        </div>

      </div>
      
      {/* FOOTER */}
      <div className="p-4 bg-white border-t border-slate-200 shrink-0 space-y-3">
        <Button
          variant="primary"
          className="w-full justify-center flex items-center gap-2"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar Propriedades'}
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-center flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={onDelete}
          disabled={saving}
        >
          <Trash2 className="w-4 h-4" />
          Excluir Conexão
        </Button>
      </div>
    </div>
  );
}
