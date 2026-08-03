import React, { useState, useEffect } from 'react';
import { OpuraElectricalRoom } from '../../types/electrical';
import { RoomTypology, getRoomRequirements } from './utils/nbr5410';
import { Calculator, Settings, Zap } from 'lucide-react';

interface RoomSummaryPanelProps {
  room: OpuraElectricalRoom;
  onUpdateName: (newName: string) => void;
  onAutoDistribute: (typology: RoomTypology) => void;
  onClose: () => void;
}

export const RoomSummaryPanel: React.FC<RoomSummaryPanelProps> = ({ room, onUpdateName, onAutoDistribute, onClose }) => {
  const [typology, setTypology] = useState<RoomTypology>('sala_quarto');
  
  // Extract typology from name if it was saved like "Banheiro | Meu Banheiro"
  useEffect(() => {
    if (room.name.includes('|')) {
      const parts = room.name.split('|');
      const typ = parts[0].trim().toLowerCase() as RoomTypology;
      if (['banheiro', 'cozinha', 'sala_quarto', 'varanda', 'outros'].includes(typ)) {
        setTypology(typ);
      }
    }
  }, [room.name]);

  const reqs = getRoomRequirements(room.areaSqm || 0, room.perimeterM || 0, typology);

  const handleTypologyChange = (t: RoomTypology) => {
    setTypology(t);
    // Persist in name
    const currentCustomName = room.name.includes('|') ? room.name.split('|')[1].trim() : room.name;
    onUpdateName(`${t} | ${currentCustomName}`);
  };

  const currentCustomName = room.name.includes('|') ? room.name.split('|')[1].trim() : room.name;

  return (
    <div className="w-80 bg-white border-l border-slate-200 shadow-xl flex flex-col absolute right-0 top-0 bottom-0 z-50">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          Propriedades do Ambiente
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-6">
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-500 uppercase">Nome do Ambiente</label>
          <input 
            type="text" 
            value={currentCustomName}
            onChange={(e) => onUpdateName(`${typology} | ${e.target.value}`)}
            className="w-full border border-slate-300 rounded-md p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-500 uppercase">Tipologia (NBR 5410)</label>
          <select 
            value={typology}
            onChange={(e) => handleTypologyChange(e.target.value as RoomTypology)}
            className="w-full border border-slate-300 rounded-md p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="sala_quarto">Sala / Dormitório</option>
            <option value="cozinha">Cozinha / Copa / Área de Serviço</option>
            <option value="banheiro">Banheiro</option>
            <option value="varanda">Varanda</option>
            <option value="outros">Outros (Corredor, Depósito, etc)</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <span className="text-xs text-slate-500 block mb-1">Área</span>
            <span className="font-bold text-slate-700">{room.areaSqm?.toFixed(2) || 0} m²</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <span className="text-xs text-slate-500 block mb-1">Perímetro</span>
            <span className="font-bold text-slate-700">{room.perimeterM?.toFixed(2) || 0} m</span>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-3">
          <h4 className="font-semibold text-blue-900 flex items-center gap-2 text-sm">
            <Calculator className="w-4 h-4" />
            Quadro de Cargas NBR 5410
          </h4>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center border-b border-blue-100 pb-2">
              <span className="text-blue-700">Iluminação Mín.</span>
              <span className="font-bold text-blue-900">{reqs.lightingVA} VA</span>
            </div>
            
            <div className="pt-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-blue-700">Tomadas Mín. (TUGs)</span>
                <span className="font-bold text-blue-900">{reqs.receptaclesCount} un</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {reqs.receptaclesVA.map((va, idx) => (
                  <span key={idx} className="text-xs bg-white border border-blue-200 text-blue-800 px-2 py-1 rounded">
                    {va} VA
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <button 
          onClick={() => onAutoDistribute(typology)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          <Zap className="w-5 h-5" />
          Auto-Distribuir Pontos
        </button>
        <p className="text-xs text-slate-500 text-center mt-3">
          Isto irá gerar o ponto de teto e as tomadas uniformemente no perímetro.
        </p>
      </div>
    </div>
  );
};
