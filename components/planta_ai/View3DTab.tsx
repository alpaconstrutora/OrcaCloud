import React, { useMemo, useState, useRef, Suspense } from 'react';
import { Box, Maximize, Minimize, Loader2 } from 'lucide-react';
import { PlantScenario, PlantTerrain, PlantUrbanRuleset } from '../../types/plantaAi';
import { PlantaAiEngine } from '../../services/plantaAiEngine';

// Code-split: o three.js só é baixado quando a aba 3D é aberta.
const Building3DViewer = React.lazy(() => import('./Building3DViewer'));

interface View3DTabProps {
  scenario: PlantScenario | null;
  terrain: PlantTerrain | null;
  rules: PlantUrbanRuleset | null;
}

const Fallback = () => (
  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-3">
    <Loader2 className="w-6 h-6 animate-spin" />
    <span className="text-sm">Carregando modelo 3D…</span>
  </div>
);

export default function View3DTab({ scenario, terrain, rules }: View3DTabProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const geometry = useMemo(() => {
    if (!scenario || !terrain || !rules) return null;
    return PlantaAiEngine.getScenarioGeometry(scenario, terrain, rules);
  }, [scenario, terrain, rules]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => setIsFullscreen(true));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  React.useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  if (!scenario) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-500">
        <Box className="w-12 h-12 mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhum cenário selecionado</h3>
        <p className="text-sm">Vá até a aba de Cenários e clique em "Ver Plantas" em uma das opções geradas.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[600px]">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-sm flex items-center justify-center">
            <Box className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">Modelo 3D: {scenario.name}</h2>
            <p className="text-xs text-gray-500 font-medium">
              Massa volumétrica · {Math.max(1, Math.round(scenario.floors_count || 1))} pavimentos ·
              {' '}{scenario.units_per_floor || 0} unid./andar
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        className={`flex-1 bg-gray-50 relative flex items-center justify-center overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : 'p-6'}`}
      >
        <Suspense fallback={<Fallback />}>
          <Building3DViewer
            buildingWidth={geometry?.buildingWidth}
            buildingDepth={geometry?.buildingDepth}
            unitsPerFloor={scenario.units_per_floor}
            terrainWidth={geometry?.terrainWidth}
            terrainDepth={geometry?.terrainDepth}
            leftSetback={geometry?.leftSetback}
            frontSetback={geometry?.frontSetback}
            minRightSetback={rules?.right_setback || 1.5}
            minRearSetback={rules?.rear_setback || 3}
            floorsCount={scenario.floors_count || 1}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
          />
        </Suspense>
      </div>
    </div>
  );
}
