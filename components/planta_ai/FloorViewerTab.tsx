import React, { useMemo, useState, useRef, useEffect, Suspense } from 'react';
import { Layers, Map, Square, Box, Columns2, Loader2 } from 'lucide-react';
import { PlantScenario, PlantTerrain, PlantUrbanRuleset, PlantFloor, PlantUnit } from '../../types/plantaAi';
import FloorPlanCanvas2D, { RealUnitCell } from './FloorPlanCanvas2D';
import { PlantaAiEngine } from '../../services/plantaAiEngine';
import { plantaAiMaterializeService } from '../../services/plantaAiMaterializeService';

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

  // Unidades reais materializadas (plant_floors/plant_units). Quando o cenário foi materializado
  // — inclusive o gerado a partir de Torres & Unidades — o 2D desenha estas, com a área e o código
  // exatos de cada unidade, em vez da grade paramétrica uniforme.
  const [realFloors, setRealFloors] = useState<PlantFloor[]>([]);
  const [realUnits, setRealUnits] = useState<(PlantUnit & { _floor_number: number })[]>([]);
  const [selectedFloorNumber, setSelectedFloorNumber] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadReal() {
      if (!scenario?.id || !scenario.materialized_at) {
        setRealFloors([]); setRealUnits([]); setSelectedFloorNumber(null);
        return;
      }
      try {
        const floors = await plantaAiMaterializeService.listFloors(scenario.id);
        const units = await plantaAiMaterializeService.listUnitsForScenario(scenario.id);
        if (cancelled) return;
        setRealFloors(floors);
        setRealUnits(units);
        setSelectedFloorNumber(floors[0]?.floor_number ?? null);
      } catch (err) {
        console.error('[FloorViewerTab] Falha ao carregar unidades materializadas:', err);
        if (!cancelled) { setRealFloors([]); setRealUnits([]); setSelectedFloorNumber(null); }
      }
    }
    loadReal();
    return () => { cancelled = true; };
  }, [scenario?.id, scenario?.materialized_at]);

  const hasReal = realFloors.length > 0;
  const selectedFloor = hasReal
    ? (realFloors.find(f => f.floor_number === selectedFloorNumber) ?? realFloors[0])
    : null;

  // Converte as plant_units do pavimento selecionado no formato que o canvas desenha.
  const realUnitCells: RealUnitCell[] = useMemo(() => {
    if (!selectedFloor) return [];
    return realUnits
      .filter(u => u.floor_id === selectedFloor.id)
      .map(u => {
        const g = (u.geometry_json || {}) as any;
        return {
          code: u.unit_code || '—',
          area: u.private_area || 0,
          x: g.x ?? 0, y: g.y ?? 0, width: g.width ?? 5, height: g.height ?? 5,
          color: g.color || '#bfdbfe',
        };
      });
  }, [selectedFloor, realUnits]);

  // Geometria do prédio: quando há dado real, usa o que foi congelado no pavimento (garante que
  // os retângulos das unidades encaixem na pegada), senão o envelope paramétrico.
  const floorGeo = (selectedFloor?.geometry_json || {}) as any;
  const realBuildingWidth = hasReal ? (floorGeo.buildingWidth ?? geometry?.buildingWidth) : geometry?.buildingWidth;
  const realBuildingDepth = hasReal ? (floorGeo.buildingDepth ?? geometry?.buildingDepth) : geometry?.buildingDepth;
  const realCore = hasReal ? floorGeo.core : undefined;

  // Pavimentos reais para o 3D: todos os andares (não só o selecionado), cada um com suas
  // unidades exatas, para o viewer empilhar em vez de repetir a grade paramétrica.
  const real3DFloors = useMemo(() => {
    if (!hasReal) return undefined;
    return realFloors
      .slice()
      .sort((a, b) => a.floor_number - b.floor_number)
      .map(f => ({
        floorNumber: f.floor_number,
        units: realUnits
          .filter(u => u.floor_id === f.id)
          .map(u => {
            const g = (u.geometry_json || {}) as any;
            return { code: u.unit_code || '—', x: g.x ?? 0, y: g.y ?? 0, width: g.width ?? 5, height: g.height ?? 5, color: g.color || '#bfdbfe' };
          }),
      }));
  }, [hasReal, realFloors, realUnits]);
  const real3DCore = hasReal ? ((realFloors[0]?.geometry_json || {}) as any).core : undefined;

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
            <p className="text-xs text-gray-500 font-medium">
              {hasReal ? 'Unidades reais materializadas (2D e 3D)' : 'Visualizador Paramétrico 2D / 3D'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Seletor de pavimento — só quando há unidades reais materializadas */}
          {hasReal && (viewMode === '2d' || viewMode === 'split') && (
            <select
              value={selectedFloorNumber ?? ''}
              onChange={(e) => setSelectedFloorNumber(Number(e.target.value))}
              className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm outline-none cursor-pointer"
              title="Pavimento a exibir"
            >
              {realFloors.map(f => (
                <option key={f.id} value={f.floor_number}>
                  {f.floor_type} — {f.floor_number}º ({realUnits.filter(u => u.floor_id === f.id).length} un.)
                </option>
              ))}
            </select>
          )}

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
      </div>

      {/* Content */}
      <div className="flex-1 flex bg-gray-50 p-6 overflow-hidden gap-6">
          {/* Left panel - Structure Tree */}
          <div className="w-1/3 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 font-semibold text-gray-700 text-sm">
              Estrutura Volumétrica
            </div>
            <div className="p-4 overflow-y-auto space-y-4 text-sm">
              {hasReal && selectedFloor ? (
                <>
                  <div className="font-medium text-gray-800 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    {selectedFloor.floor_type} — {selectedFloor.floor_number}º pavimento
                  </div>
                  <div className="pl-6 text-gray-600 space-y-2">
                    {realUnitCells.length === 0 && (
                      <p className="text-gray-400">Sem unidades neste pavimento.</p>
                    )}
                    {realUnitCells.map((u) => (
                      <div key={u.code} className="flex items-center justify-between gap-2">
                        <span className="truncate">{u.code}</span>
                        <span className="text-xs bg-gray-100 px-2 rounded-full font-mono shrink-0">{Math.round(u.area)} m²</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-emerald-600 font-medium pt-2 border-t border-gray-100">
                    ✓ Áreas e códigos reais de Torres &amp; Unidades
                  </p>
                </>
              ) : (
                <>
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
                  {scenario.materialized_at ? (
                    <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                      Cenário paramétrico (sem unidades reais materializadas).
                    </p>
                  ) : (
                    <div className="font-medium text-gray-800 flex items-center gap-2 opacity-50">
                      <Layers className="w-4 h-4 text-gray-400" />
                      Subsolos (Opcional)
                    </div>
                  )}
                </>
              )}
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
                  buildingWidth={realBuildingWidth}
                  buildingDepth={realBuildingDepth}
                  unitsPerFloor={scenario.units_per_floor}
                  privateAreaPerUnit={(scenario.total_units || 0) > 0 ? (scenario.total_private_area || 0) / (scenario.total_units || 1) : 0}
                  terrainWidth={geometry?.terrainWidth}
                  terrainDepth={geometry?.terrainDepth}
                  leftSetback={geometry?.leftSetback}
                  frontSetback={geometry?.frontSetback}
                  minRightSetback={rules?.right_setback || 1.5}
                  minRearSetback={rules?.rear_setback || 3}
                  isRotated={true}
                  realUnits={hasReal ? realUnitCells : undefined}
                  realCore={realCore}
                  onToggleFullscreen={viewMode === '2d' ? toggleFullscreen : undefined}
                  isFullscreen={isFullscreen}
                />
              </div>
            )}

            {(viewMode === '3d' || viewMode === 'split') && (
              <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} h-full`}>
                <Suspense fallback={<Viewer3DFallback />}>
                  <Building3DViewer
                    buildingWidth={realBuildingWidth}
                    buildingDepth={realBuildingDepth}
                    unitsPerFloor={scenario.units_per_floor}
                    terrainWidth={geometry?.terrainWidth}
                    terrainDepth={geometry?.terrainDepth}
                    leftSetback={geometry?.leftSetback}
                    frontSetback={geometry?.frontSetback}
                    minRightSetback={rules?.right_setback || 1.5}
                    minRearSetback={rules?.rear_setback || 3}
                    floorsCount={hasReal ? realFloors.length : (scenario.floors_count || 1)}
                    realFloors={real3DFloors}
                    realCore={real3DCore}
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
