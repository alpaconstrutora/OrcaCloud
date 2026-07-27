import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Upload, Save, MousePointer2, Square, Loader2, Download } from 'lucide-react';
import Button from '../ui/Button';
import { Stage, Layer, Image as KonvaImage, Line, Circle } from 'react-konva';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { electricalProjectService } from '../../services/electricalProjectService';
import { exportElectricalService } from '../../services/exportElectricalService';
import RoomSidebar from './RoomSidebar';
import PointToolbox, { ElectricalPointType, POINT_TYPES } from './PointToolbox';
import PointPropertiesSidebar from './PointPropertiesSidebar';
import LoadScheduleView from './LoadScheduleView';
import { ElectricalTakeoffView } from './ElectricalTakeoffView';
import { OpuraElectricalProject, OpuraElectricalVersion, OpuraElectricalPlan, OpuraElectricalRoom, OpuraElectricalPoint } from '../../types/electrical';

interface ElectricalEditorViewProps {
  organizationId: string;
  projectId: string;
  electricalProjectId: string;
  onBack: () => void;
}

const ElectricalEditorView: React.FC<ElectricalEditorViewProps> = ({ organizationId, projectId, electricalProjectId, onBack }) => {
  const [project, setProject] = useState<OpuraElectricalProject | null>(null);
  const [version, setVersion] = useState<OpuraElectricalVersion | null>(null);
  const [plan, setPlan] = useState<OpuraElectricalPlan | null>(null);
  const [rooms, setRooms] = useState<OpuraElectricalRoom[]>([]);
  const [points, setPoints] = useState<OpuraElectricalPoint[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  // Editor State
  const [viewMode, setViewMode] = useState<'drawing' | 'schedule' | 'takeoff'>('drawing');
  const [tool, setTool] = useState<'select' | 'draw_room' | 'add_point'>('select');
  const [currentPolygon, setCurrentPolygon] = useState<number[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedToolboxItem, setSelectedToolboxItem] = useState<ElectricalPointType | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<OpuraElectricalPoint | null>(null);
  
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    loadData();
  }, [electricalProjectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const proj = await electricalProjectService.getProjectById(electricalProjectId);
      setProject(proj);

      const versions = await electricalProjectService.listVersions(electricalProjectId);
      if (versions.length > 0) {
        setVersion(versions[0]); // Pega a mais recente
        
        const p = await electricalProjectService.getPlanByVersion(versions[0].id);
        setPlan(p);
        
        if (p) {
          const r = await electricalProjectService.listRoomsByPlan(p.id);
          setRooms(r);
          
          if (r.length > 0) {
            const pts = await electricalProjectService.listPointsByRooms(r.map(room => room.id));
            setPoints(pts);
          }

          if (p.fileUrl) {
            loadImage(p.fileUrl);
          }
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadImage = (url: string) => {
    const img = new window.Image();
    img.src = url;
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      setImageObj(img);
      setStageSize({ width: img.width, height: img.height });
    };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !version) return;

    setUploading(true);
    try {
      const url = await electricalProjectService.uploadPlanImage(file, organizationId);
      
      if (plan) {
        const updatedPlan = await electricalProjectService.updatePlan(plan.id, { fileUrl: url });
        setPlan(updatedPlan);
      } else {
        const newPlan = await electricalProjectService.createPlan({
          organizationId: organizationId,
          versionId: version.id,
          fileUrl: url,
          floorName: 'Térreo'
        });
        setPlan(newPlan);
      }
      loadImage(url);
    } catch (err) {
      console.error(err);
      alert('Erro ao fazer upload da planta.');
    } finally {
      setUploading(false);
    }
  };

  const handleExportPDF = () => {
    if (stageRef.current) {
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
      exportElectricalService.generatePlanPDF(dataUrl, project?.name || 'Projeto');
    }
  };

  const handleExportDXF = () => {
    exportElectricalService.generateDXF(rooms, points, project?.name || 'Projeto');
  };

  const isPointInPolygon = (point: {x: number, y: number}, polygon: number[]) => {
    let isInside = false;
    for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
      const xi = polygon[i], yi = polygon[i+1];
      const xj = polygon[j], yj = polygon[j+1];
      const intersect = ((yi > point.y) !== (yj > point.y))
          && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) isInside = !isInside;
    }
    return isInside;
  };

  const handleStageClick = async (e: any) => {
    // Get click position relative to stage
    const stage = e.target.getStage();
    const pointerPosition = stage.getRelativePointerPosition();
    if (!pointerPosition) return;

    if (tool === 'draw_room') {
      setCurrentPolygon([...currentPolygon, pointerPosition.x, pointerPosition.y]);
      return;
    }

    if (tool === 'add_point' && selectedToolboxItem) {
      const clickedRoom = rooms.find(r => r.polygonPoints && isPointInPolygon(pointerPosition, r.polygonPoints));
      if (!clickedRoom) {
          alert('Você deve clicar dentro de um ambiente demarcado para inserir o ponto.');
          return;
      }

      const pointDef = POINT_TYPES.find(p => p.id === selectedToolboxItem);
      if (!pointDef) return;

      try {
          const newPoint = await electricalProjectService.createPoint({
              organizationId: organizationId,
              roomId: clickedRoom.id,
              pointType: selectedToolboxItem,
              powerW: pointDef.defaultPower,
              heightM: pointDef.defaultHeight,
              voltage: 0,
              canvasX: pointerPosition.x,
              canvasY: pointerPosition.y
          });
          setPoints([...points, newPoint]);
          setTool('select');
          setSelectedToolboxItem(null);
          setSelectedPointId(newPoint.id);
      } catch (error) {
          console.error(error);
          alert('Erro ao inserir ponto.');
      }
      return;
    }

    if (tool === 'select') {
      if (e.target === stage || e.target.getClassName() === 'Image') {
         setSelectedPointId(null);
      }
    }
  };

  const finishPolygon = async () => {
    if (currentPolygon.length < 6) {
      alert('Um ambiente precisa ter no mínimo 3 pontos (6 coordenadas).');
      setCurrentPolygon([]);
      return;
    }
    
    if (!plan) return;

    const roomName = prompt('Nome do Ambiente (ex: Quarto 1):');
    if (!roomName) {
      setCurrentPolygon([]);
      return;
    }

    try {
      const newRoom = await electricalProjectService.createRoom({
        organizationId: organizationId,
        planId: plan.id,
        name: roomName,
        polygonPoints: currentPolygon
      });
      setRooms([...rooms, newRoom]);
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar ambiente.');
    }
    
    setCurrentPolygon([]);
    setTool('select');
  };

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top Bar */}
      <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="secondary" size="sm" onClick={onBack} className="text-slate-500 rounded-[1rem]">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">{project?.name || 'Projeto Elétrico'}</h1>
            <p className="text-xs text-slate-500">Versão {version?.versionNumber || 1} • {plan?.floorName || 'Planta sem nome'}</p>
          </div>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('drawing')}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              viewMode === 'drawing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Planta
          </button>
          <button
            onClick={() => setViewMode('schedule')}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              viewMode === 'schedule' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Quadro de Cargas
          </button>
          <button
            onClick={() => setViewMode('takeoff')}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              viewMode === 'takeoff' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Orçamento
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="cursor-pointer inline-flex items-center justify-center rounded-xl font-black uppercase tracking-widest transition-all active:scale-95 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 h-9 px-4 text-sm gap-2">
            <Upload className="w-4 h-4 mr-2 text-slate-500" />
            Planta
            <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
          </label>
          <Button variant="secondary" className="rounded-[1rem]" onClick={handleExportDXF}>
            <Download className="w-4 h-4 mr-2" />
            DXF
          </Button>
          <Button variant="secondary" className="rounded-[1rem]" onClick={handleExportPDF}>
            <Download className="w-4 h-4 mr-2" />
            PDF (Prancha)
          </Button>
          <Button variant="primary" className="rounded-[1rem]">
            <Save className="w-4 h-4 mr-2" />
            Salvar
          </Button>
        </div>
      </div>

      {viewMode === 'schedule' && (
        <LoadScheduleView 
          versionId={version!.id} 
          points={points} 
        />
      )}

      {viewMode === 'takeoff' && (
        <ElectricalTakeoffView version={version!} organizationId={project!.organizationId} />
      )}

      {viewMode === 'drawing' && (
        /* Workspace area */
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar (Toolbox) */}
          {plan?.fileUrl && (
            <PointToolbox 
              selectedToolboxItem={selectedToolboxItem}
              onSelectToolboxItem={setSelectedToolboxItem}
              tool={tool}
              setTool={setTool}
            />
          )}

          {/* CANVAS AREA */}
          <div className="flex-1 bg-slate-100 relative overflow-hidden" ref={containerRef}>
            {!plan?.fileUrl && !uploading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center p-8 bg-white/50 rounded-2xl border border-dashed border-slate-300">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                  <p className="font-bold text-slate-600">Nenhuma planta carregada</p>
                  <p className="text-sm text-slate-500">Faça o upload de uma imagem (PNG/JPG) no menu superior.</p>
                </div>
              </div>
            )}

            {plan?.fileUrl && imageObj && (
              <TransformWrapper
                initialScale={1}
                minScale={0.1}
                maxScale={5}
                disabled={tool !== 'select'}
                wheel={{ step: 0.1 }}
              >
                {({ zoomIn, zoomOut, resetTransform, ...rest }) => (
                  <React.Fragment>
                    <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                      <Stage 
                        ref={stageRef}
                        width={stageSize.width} 
                        height={stageSize.height}
                        onClick={handleStageClick}
                        className={tool === 'draw_room' || tool === 'add_point' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}
                      >
                        <Layer>
                          {/* Imagem de Fundo */}
                          <KonvaImage image={imageObj} />
                          
                          {/* Ambientes já criados */}
                          {rooms.map((room) => {
                            const pts = room.polygonPoints as number[];
                            if (!pts || pts.length < 6) return null;
                            return (
                              <Line
                                key={room.id}
                                points={pts}
                                fill="rgba(59, 130, 246, 0.2)"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                closed
                                tension={0}
                              />
                            );
                          })}

                          {/* Polígono atual (em desenho) */}
                          {currentPolygon.length > 0 && (
                            <Line
                              points={currentPolygon}
                              stroke="#ef4444"
                              strokeWidth={3}
                              closed={false}
                              tension={0}
                            />
                          )}
                          {currentPolygon.length > 0 && (
                             <Circle 
                              x={currentPolygon[0]} 
                              y={currentPolygon[1]} 
                              radius={6} 
                              fill="#ef4444" 
                              onClick={finishPolygon}
                              onMouseEnter={(e) => {
                                const container = e.target.getStage()?.container();
                                if (container) container.style.cursor = 'pointer';
                              }}
                              onMouseLeave={(e) => {
                                const container = e.target.getStage()?.container();
                                if (container) container.style.cursor = 'crosshair';
                              }}
                             />
                          )}

                          {/* Pontos Elétricos */}
                          {points.map(pt => {
                            const def = POINT_TYPES.find(d => d.id === pt.pointType);
                            const isSelected = selectedPointId === pt.id;
                            return (
                              <Circle
                                 key={pt.id}
                                 x={pt.canvasX || 0}
                                 y={pt.canvasY || 0}
                                 radius={isSelected ? 10 : 8}
                                 fill={def?.color || '#94a3b8'}
                                 stroke={isSelected ? '#2563eb' : 'white'}
                                 strokeWidth={2}
                                 shadowColor="black"
                                 shadowBlur={5}
                                 shadowOpacity={0.2}
                                 onMouseEnter={(e) => {
                                   const container = e.target.getStage()?.container();
                                   if (container) container.style.cursor = 'pointer';
                                 }}
                                 onMouseLeave={(e) => {
                                   const container = e.target.getStage()?.container();
                                   if (container) container.style.cursor = (tool === 'draw_room' || tool === 'add_point') ? 'crosshair' : 'grab';
                                 }}
                                 onClick={(e) => {
                                   e.cancelBubble = true;
                                   if (tool === 'select') {
                                     setSelectedPointId(pt.id);
                                   }
                                 }}
                              />
                            );
                          })}
                        </Layer>
                      </Stage>
                    </TransformComponent>
                  </React.Fragment>
                )}
              </TransformWrapper>
            )}

            {/* Dica para fechar o polígono */}
            {tool === 'draw_room' && currentPolygon.length > 0 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm shadow-xl animate-fade-in-up">
                Clique no ponto inicial (vermelho) para fechar o ambiente.
              </div>
            )}
          </div>

          {/* RIGHT SIDEBAR (ROOMS OR PROPERTIES) */}
          <div className="w-80 bg-white border-l border-slate-200 shadow-xl z-10 flex flex-col">
            {selectedPointId && points.find(p => p.id === selectedPointId) ? (
              <PointPropertiesSidebar
                point={points.find(p => p.id === selectedPointId)!}
                versionId={version!.id}
                organizationId={organizationId}
                onUpdate={async (updates) => {
                  try {
                      const updated = await electricalProjectService.updatePoint(selectedPointId, updates);
                      setPoints(points.map(p => p.id === selectedPointId ? updated : p));
                  } catch (err) {
                      alert('Erro ao atualizar ponto.');
                  }
                }}
                onDelete={async () => {
                  try {
                      await electricalProjectService.deletePoint(selectedPointId);
                      setPoints(points.filter(p => p.id !== selectedPointId));
                      setSelectedPointId(null);
                  } catch (err) {
                      alert('Erro ao deletar ponto.');
                  }
                }}
                onClose={() => setSelectedPointId(null)}
              />
            ) : (
              <RoomSidebar 
                rooms={rooms}
                onDeleteRoom={async (id) => {
                  try {
                    await electricalProjectService.deleteRoom(id);
                    setRooms(rooms.filter(r => r.id !== id));
                  } catch (e) {
                    alert('Erro ao deletar.');
                  }
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ElectricalEditorView;
