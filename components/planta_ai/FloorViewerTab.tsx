import React, { useMemo, useState, useRef, Suspense } from 'react';
import { Layers, Map, Square, Box, Columns2, Loader2 } from 'lucide-react';
import { PlantScenario, PlantTerrain, PlantUrbanRuleset } from '../../types/plantaAi';
import FloorPlanCanvas2D from './FloorPlanCanvas2D';
import { PlantaAiEngine } from '../../services/plantaAiEngine';

// Code-split: three.js só carrega quando o 3D é exibido.
const Building3DViewer = React.lazy(() => import('./Building3DViewer'));

type ViewMode = '2d' | '3d' | 'split';

const Viewer3DFallback = () => (
  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-3">
    <Loader2 className="w-6 h-6 animate-spin" />
    <span className="text-sm">Carregando modelo 3D…</span>
  </div>
);

interface FloorViewerTabProps {
  scenario: PlantScenario | null;
  terrain: PlantTerrain | null;
  rules: PlantUrbanRuleset | null;
}

export default function FloorViewerTab({ scenario, terrain, rules }: FloorViewerTabProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const containerRef = useRef<HTMLDivElement>(null);

  const geometry = useMemo(() => {
    if (!scenario || !terrain || !rules) return null;
    return PlantaAiEngine.getScenarioGeometry(scenario, terrain, rules);
  }, [scenario, terrain, rules]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
        setIsFullscreen(true); // Fallback to CSS fullscreen
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!scenario) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-500">
        <Map className="w-12 h-12 mb-4 text-gray-300" />
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
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">Plantas Baixas: {scenario.name}</h2>
            <p className="text-xs text-gray-500 font-medium">Visualizador Paramétrico 2D / 3D</p>
          </div>
        </div>

        {/* Seletor de modo de visualização */}
        <div className="flex bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
          {([
            { mode: '2d' as ViewMode, icon: Square, label: '2D' },
            { mode: '3d' as ViewMode, icon: Box, label: '3D' },
            { mode: 'split' as ViewMode, icon: Columns2, label: 'Lado a lado' },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === mode ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex bg-gray-50 p-6 overflow-hidden gap-6">
          {/* Left panel - Structure Tree */}
          <div className="w-1/3 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 font-semibold text-gray-700 text-sm">
              Estrutura Volumétrica
            </div>
            <div className="p-4 overflow-y-auto space-y-4 text-sm">
              <div className="font-medium text-gray-800 flex items-center gap-2">
                <Map className="w-4 h-4 text-indigo-500" />
                Implantação Térreo
              </div>
              <div className="pl-6 font-medium text-gray-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-500" />
                Pavimento Tipo (x{scenario.floors_count})
              </div>
              <div className="pl-12 text-gray-600 space-y-2">
                {Array.from({ length: scenario.units_per_floor || 1 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>Unidade Final {i + 1}</span>
                    <span className="text-xs bg-gray-100 px-2 rounded-full font-mono">{Math.round((scenario.total_private_area || 0) / (scenario.total_units || 1))} m²</span>
                  </div>
                ))}
              </div>
              <div className="font-medium text-gray-800 flex items-center gap-2 opacity-50">
                <Layers className="w-4 h-4 text-gray-400" />
                Subsolos (Opcional)
              </div>
            </div>
          </div>

          {/* Right panel - Canvas */}
          <div
            ref={containerRef}
            className={`flex-1 bg-white border border-gray-200 relative flex items-stretch overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'rounded-xl'}`}
          >
            {(viewMode === '2d' || viewMode === 'split') && (
              <div className={`${viewMode === 'split' ? 'w-1/2 border-r border-gray-200' : 'w-full'} h-full flex items-center justify-center relative`}>
                <FloorPlanCanvas2D
                  buildingWidth={geometry?.buildingWidth}
                  buildingDepth={geometry?.buildingDepth}
                  unitsPerFloor={scenario.units_per_floor}
                  privateAreaPerUnit={(scenario.total_units || 0) > 0 ? (scenario.total_private_area || 0) / (scenario.total_units || 1) : 0}
                  terrainWidth={geometry?.terrainWidth}
                  terrainDepth={geometry?.terrainDepth}
                  leftSetback={geometry?.leftSetback}
                  frontSetback={geometry?.frontSetback}
                  minRightSetback={rules?.right_setback || 1.5}
                  minRearSetback={rules?.rear_setback || 3}
                  isRotated={true}
                  onToggleFullscreen={viewMode === '2d' ? toggleFullscreen : undefined}
                  isFullscreen={isFullscreen}
                />
              </div>
            )}

            {(viewMode === '3d' || viewMode === 'split') && (
              <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} h-full`}>
                <Suspense fallback={<Viewer3DFallback />}>
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
                    onToggleFullscreen={viewMode === '3d' ? toggleFullscreen : undefined}
                    isFullscreen={isFullscreen}
                  />
                </Suspense>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
