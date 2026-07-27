import React from 'react';
import { Square, Trash2 } from 'lucide-react';
import { OpuraElectricalRoom } from '../../types/electrical';

interface RoomSidebarProps {
  rooms: OpuraElectricalRoom[];
  onDeleteRoom: (id: string) => void;
}

const RoomSidebar: React.FC<RoomSidebarProps> = ({ rooms, onDeleteRoom }) => {
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <Square className="w-4 h-4" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">Ambientes</h2>
          <p className="text-xs text-slate-500">{rooms.length} marcados na planta</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {rooms.length === 0 ? (
          <div className="text-center text-slate-400 p-6 text-sm">
            Nenhum ambiente marcado. Use a ferramenta na barra superior para começar.
          </div>
        ) : (
          rooms.map(room => (
            <div key={room.id} className="p-3 border border-slate-200 rounded-xl hover:border-blue-200 hover:bg-blue-50/50 transition-colors group">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">{room.name}</span>
                <button 
                  onClick={() => onDeleteRoom(room.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                  title="Excluir ambiente"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs text-slate-400 mt-1 flex flex-col gap-1">
                <span>{(room.polygonPoints?.length || 0) / 2} vértices</span>
                {(room.areaSqm !== undefined || room.perimeterM !== undefined) && (
                  <div className="flex items-center gap-3 text-slate-500">
                    <span>Área: <strong className="text-slate-700">{room.areaSqm || 0}</strong> m²</span>
                    <span>Perímetro: <strong className="text-slate-700">{room.perimeterM || 0}</strong> m</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RoomSidebar;
