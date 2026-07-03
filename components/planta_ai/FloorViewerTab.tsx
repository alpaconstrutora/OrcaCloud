import React, { useMemo, useState, useRef } from 'react';
import { X, Layers, Maximize, Minimize, Map, MousePointer2 } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { PlantScenario, PlantTerrain, PlantUrbanRuleset } from '../../types/plantaAi';
import FloorPlanCanvas2D from './FloorPlanCanvas2D';
import { PlantaAiEngine } from '../../services/plantaAiEngine';

interface FloorViewerTabProps {
  scenario: PlantScenario | null;
  terrain: PlantTerrain | null;
  rules: PlantUrbanRuleset | null;
}

export default function FloorViewerTab({ scenario, terrain, rules }: FloorViewerTabProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
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
            <p className="text-xs text-gray-500 font-medium">Visualizador Paramétrico 2D</p>
          </div>
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
            className={`flex-1 bg-white border border-gray-200 relative flex items-center justify-center overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'rounded-xl'}`}
          >
            <div className="absolute top-4 right-4 flex gap-2 z-10 shadow-sm rounded-lg overflow-hidden border border-gray-200">
               <button 
                 onClick={toggleFullscreen}
                 className="p-2 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                 title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
               >
                 {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
               </button>
            </div>
            
            {/* Visual tip for panning */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur border border-gray-200 rounded-full text-xs text-gray-500 shadow-sm z-10 pointer-events-none">
              <MousePointer2 className="w-3.5 h-3.5" />
              <span>Use o scroll (rodinha) para Zoom. Clique e arraste para Mover.</span>
            </div>

            <TransformWrapper
              initialScale={1}
              minScale={0.1}
              maxScale={8}
              centerOnInit={true}
              wheel={{ step: 0.1 }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <React.Fragment>
                  <div className="absolute top-4 left-4 flex flex-col gap-1 z-10 shadow-sm rounded-lg overflow-hidden border border-gray-200 bg-white">
                    <button onClick={() => zoomIn()} className="p-2 hover:bg-gray-50 text-gray-600 border-b border-gray-100" title="Zoom In">+</button>
                    <button onClick={() => zoomOut()} className="p-2 hover:bg-gray-50 text-gray-600 border-b border-gray-100" title="Zoom Out">-</button>
                    <button onClick={() => resetTransform()} className="p-2 hover:bg-gray-50 text-gray-600 text-xs font-bold" title="Resetar Visualização">⛶</button>
                  </div>
                  
                  <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className={isFullscreen ? 'w-full h-full' : 'w-full h-full'}>
                      <FloorPlanCanvas2D 
                        buildingWidth={geometry?.buildingWidth}
                        buildingDepth={geometry?.buildingDepth}
                        unitsPerFloor={scenario.units_per_floor}
                        privateAreaPerUnit={(scenario.total_units || 0) > 0 ? (scenario.total_private_area || 0) / (scenario.total_units || 1) : 0}
                        terrainWidth={geometry?.terrainWidth}
                        terrainDepth={geometry?.terrainDepth}
                        leftSetback={geometry?.leftSetback}
                        frontSetback={geometry?.frontSetback}
                        isRotated={true}
                      />
                    </div>
                  </TransformComponent>
                </React.Fragment>
              )}
            </TransformWrapper>
          </div>
      </div>
    </div>
  );
}
