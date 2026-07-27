import React, { useState, useEffect } from 'react';
import { electricalProjectService } from '../../services/electricalProjectService';
import { OpuraElectricalPoint, OpuraElectricalBoard, OpuraElectricalCircuit } from '../../types/electrical';
import { exportElectricalService } from '../../services/exportElectricalService';
import { Loader2, Download } from 'lucide-react';
import Button from '../ui/Button';

interface LoadScheduleViewProps {
  versionId: string;
  points: OpuraElectricalPoint[];
}

const LoadScheduleView: React.FC<LoadScheduleViewProps> = ({ versionId, points }) => {
  const [boards, setBoards] = useState<OpuraElectricalBoard[]>([]);
  const [circuits, setCircuits] = useState<OpuraElectricalCircuit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [versionId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const bds = await electricalProjectService.listBoards(versionId);
      setBoards(bds);
      
      let allCircuits: OpuraElectricalCircuit[] = [];
      for (const bd of bds) {
        const cts = await electricalProjectService.listCircuits(bd.id);
        allCircuits = [...allCircuits, ...cts];
      }
      setCircuits(allCircuits);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // Aggregate points by circuit
  const circuitMap: Record<string, { powerW: number; points: OpuraElectricalPoint[] }> = {};
  points.forEach(pt => {
    if (pt.circuitId) {
      if (!circuitMap[pt.circuitId]) {
        circuitMap[pt.circuitId] = { powerW: 0, points: [] };
      }
      circuitMap[pt.circuitId].powerW += (pt.powerW || 0);
      circuitMap[pt.circuitId].points.push(pt);
    }
  });

  return (
    <div className="flex-1 bg-white overflow-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Quadro de Cargas</h2>
          <Button variant="secondary" onClick={() => exportElectricalService.generateLoadSchedulePDF(boards, circuits, `V${versionId}`)} disabled={boards.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Baixar PDF
          </Button>
        </div>
        
        {boards.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
            <h3 className="text-sm font-medium text-slate-900 mb-1">Nenhum Quadro Encontrado</h3>
            <p className="text-sm text-slate-500">Crie quadros e circuitos na barra lateral selecionando um ponto.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {boards.map(board => {
              const boardCircuits = circuits.filter(c => c.boardId === board.id);
              
              return (
                <div key={board.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-semibold text-slate-800">{board.name}</h3>
                    <div className="text-sm text-slate-500">
                      Disjuntor Geral: <span className="font-medium text-slate-900">{board.mainBreakerCapacity || 0}A</span>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                        <tr>
                          <th className="px-4 py-3 font-medium">Circuito</th>
                          <th className="px-4 py-3 font-medium">Tipo</th>
                          <th className="px-4 py-3 font-medium text-right">Tensão (V)</th>
                          <th className="px-4 py-3 font-medium text-right">Pontos</th>
                          <th className="px-4 py-3 font-medium text-right">Potência Instalada (W)</th>
                          <th className="px-4 py-3 font-medium text-right">Corrente Est. (A)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {boardCircuits.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-6 text-center text-slate-500 text-sm">
                              Nenhum circuito neste quadro.
                            </td>
                          </tr>
                        ) : (
                          boardCircuits.map(circuit => {
                            const circuitData = circuitMap[circuit.id] || { powerW: 0, points: [] };
                            const voltage = circuit.voltage || 220;
                            const estimatedCurrent = circuitData.powerW > 0 ? (circuitData.powerW / voltage).toFixed(1) : '0.0';
                            
                            return (
                              <tr key={circuit.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-900">{circuit.name}</td>
                                <td className="px-4 py-3 text-slate-600">{circuit.circuitType || '-'}</td>
                                <td className="px-4 py-3 text-slate-600 text-right">{voltage}V</td>
                                <td className="px-4 py-3 text-slate-600 text-right">{circuitData.points.length}</td>
                                <td className="px-4 py-3 font-medium text-slate-900 text-right">{circuitData.powerW}W</td>
                                <td className="px-4 py-3 font-medium text-blue-600 text-right">{estimatedCurrent}A</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadScheduleView;
