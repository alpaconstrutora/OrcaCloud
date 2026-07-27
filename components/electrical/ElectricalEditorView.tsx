import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Upload, Save, MousePointer2, Square, Loader2 } from 'lucide-react';
import Button from '../ui/Button';
import { Stage, Layer, Image as KonvaImage, Line, Circle } from 'react-konva';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { electricalProjectService } from '../../services/electricalProjectService';
import RoomSidebar from './RoomSidebar';
import { OpuraElectricalProject, OpuraElectricalVersion, OpuraElectricalPlan, OpuraElectricalRoom } from '../../types/electrical';

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
  
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  // Editor State
  const [tool, setTool] = useState<'select' | 'draw_room'>('select');
  const [currentPolygon, setCurrentPolygon] = useState<number[]>([]);
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

  const handleStageClick = (e: any) => {
    if (tool !== 'draw_room') return;

    // Get click position relative to stage
    const stage = e.target.getStage();
    const pointerPosition = stage.getRelativePointerPosition();
    if (!pointerPosition) return;

    // Adiciona x e y ao array atual do polígono
    setCurrentPolygon([...currentPolygon, pointerPosition.x, pointerPosition.y]);
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
    <div className="h-full flex flex-col bg-slate-50">
      {/* HEADER */}
      <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-slate-800">{project?.name || 'Projeto Sem Nome'}</h1>
            <p className="text-xs text-slate-500">Versão {version?.versionNumber} • {plan?.floorName || 'Sem pavimento definido'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {plan?.fileUrl && (
            <div className="bg-slate-100 p-1 rounded-lg flex gap-1 mr-4">
              <button 
                onClick={() => setTool('select')}
                className={`p-2 rounded-md flex items-center gap-2 text-sm font-medium transition-colors ${tool === 'select' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                <MousePointer2 className="w-4 h-4" /> Navegar
              </button>
              <button 
                onClick={() => setTool('draw_room')}
                className={`p-2 rounded-md flex items-center gap-2 text-sm font-medium transition-colors ${tool === 'draw_room' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                <Square className="w-4 h-4" /> Marcar Ambiente
              </button>
            </div>
          )}
          
          <div className="relative">
            <Button variant="secondary" className="flex items-center gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {plan?.fileUrl ? 'Trocar Planta' : 'Upload Planta'}
            </Button>
            <input 
              type="file" 
              accept="image/png, image/jpeg" 
              className="absolute inset-0 opacity-0 cursor-pointer" 
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
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
                      width={stageSize.width} 
                      height={stageSize.height}
                      onClick={handleStageClick}
                      className={tool === 'draw_room' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}
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

        {/* RIGHT SIDEBAR (ROOMS) */}
        <div className="w-80 bg-white border-l border-slate-200 shadow-xl z-10">
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
        </div>
      </div>
    </div>
  );
};

export default ElectricalEditorView;
