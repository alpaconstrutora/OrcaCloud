import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Upload, Save, MousePointer2, Square, Loader2, Download, ZoomIn, ZoomOut, Maximize, Undo, X, Ruler, Edit3, CornerDownRight, Trash2, Plus, Minus } from 'lucide-react';
import Button from '../ui/Button';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Text, Group } from 'react-konva';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { electricalProjectService } from '../../services/electricalProjectService';
import { exportElectricalService } from '../../services/exportElectricalService';
import RoomSidebar from './RoomSidebar';
import PlanSidebar from './PlanSidebar';
import PointToolbox, { ElectricalPointType, POINT_TYPES } from './PointToolbox';
import PointPropertiesSidebar from './PointPropertiesSidebar';
import LoadScheduleView from './LoadScheduleView';
import { convertPdfToImage } from '../../utils/pdfToImage';
import { ElectricalTakeoffView } from './ElectricalTakeoffView';
import { useToast } from '../../hooks/useToast';
import { OpuraElectricalProject, OpuraElectricalVersion, OpuraElectricalPlan, OpuraElectricalRoom, OpuraElectricalPoint, OpuraElectricalWall } from '../../types/electrical';

interface ElectricalEditorViewProps {
  organizationId: string;
  projectId: string;
  electricalProjectId: string;
  onBack: () => void;
}

const ElectricalEditorView: React.FC<ElectricalEditorViewProps> = ({ organizationId, projectId, electricalProjectId, onBack }) => {
  const [project, setProject] = useState<OpuraElectricalProject | null>(null);
  const [version, setVersion] = useState<OpuraElectricalVersion | null>(null);
  const [plans, setPlans] = useState<OpuraElectricalPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  
  const plan = plans.find(p => p.id === activePlanId) || null;
  const [rooms, setRooms] = useState<OpuraElectricalRoom[]>([]);
  const [walls, setWalls] = useState<OpuraElectricalWall[]>([]);
  const [points, setPoints] = useState<OpuraElectricalPoint[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  // Editor State
  const [viewMode, setViewMode] = useState<'drawing' | 'schedule' | 'takeoff'>('drawing');
  const [tool, setTool] = useState<'select' | 'draw_room' | 'add_point' | 'calibrate' | 'draw_wall'>('select');
  const [currentPolygon, setCurrentPolygon] = useState<number[]>([]);
  const [currentWall, setCurrentWall] = useState<number[]>([]);
  const [calibrationPoints, setCalibrationPoints] = useState<number[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedToolboxItem, setSelectedToolboxItem] = useState<ElectricalPointType | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<OpuraElectricalPoint | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [isShiftDown, setIsShiftDown] = useState(false);
  const [isOrthoMode, setIsOrthoMode] = useState(true);
  const [gridSizeCm, setGridSizeCm] = useState<number>(10);
  const [showBackground, setShowBackground] = useState(true);
  const [editingSegment, setEditingSegment] = useState<{wallId: string, index: number, lengthM: string} | null>(null);
  const [editingWallLengthValue, setEditingWallLengthValue] = useState<string>('');
  const wallPreviewRef = useRef<any>(null);
  
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [stageTransform, setStageTransform] = useState({ scale: 1, x: 0, y: 0 });
  const { showToast } = useToast();

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
    }
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadData();
  }, [electricalProjectId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftDown(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftDown(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const handleKey = async (e: KeyboardEvent) => {
      // Prevent deleting if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedWallId) {
          e.preventDefault();
          try {
            await electricalProjectService.deleteWall(selectedWallId);
            setWalls(prev => prev.filter(w => w.id !== selectedWallId));
            setSelectedWallId(null);
            showToast('Parede excluída');
          } catch(err) {
            showToast('Erro ao excluir parede', 'error');
          }
        }
      }

      if (tool === 'draw_wall' && (e.key === 'Enter' || e.key === 'Escape')) {
        finishWall();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [tool, currentWall, plan, organizationId, selectedWallId]);

  useEffect(() => {
    if (selectedWallId) {
      const wall = walls.find(w => w.id === selectedWallId);
      if (wall) {
        const pts = wall.points as number[];
        if (pts && pts.length >= 4) {
          let totalPx = 0;
          for (let i = 0; i < pts.length - 2; i += 2) {
            const x1 = pts[i], y1 = pts[i+1];
            const x2 = pts[i+2], y2 = pts[i+3];
            totalPx += Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2));
          }
          setEditingWallLengthValue((totalPx / (plan?.scaleFactor || 100)).toFixed(2));
        }
      }
    } else {
      setEditingWallLengthValue('');
    }
  }, [selectedWallId, walls, plan?.scaleFactor]);

  const loadData = async () => {
    setLoading(true);
    try {
      const proj = await electricalProjectService.getProjectById(electricalProjectId);
      setProject(proj);

      const versions = await electricalProjectService.listVersions(electricalProjectId);
      if (versions.length > 0) {
        setVersion(versions[0]);
        
        const fetchedPlans = await electricalProjectService.listPlansByVersion(versions[0].id);
        setPlans(fetchedPlans);
        
        if (fetchedPlans.length > 0) {
          setActivePlanId(fetchedPlans[0].id);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activePlanId) {
      setWalls([]);
      setRooms([]);
      setPoints([]);
      setImageObj(null);
      return;
    }

    const loadActiveLayerData = async () => {
      setLoading(true);
      try {
        const p = plans.find(p => p.id === activePlanId);
        if (p) {
          const w = await electricalProjectService.listWallsByPlan(p.id);
          setWalls(w);

          const r = await electricalProjectService.listRoomsByPlan(p.id);
          setRooms(r);
          
          if (r.length > 0) {
            const pts = await electricalProjectService.listPointsByRooms(r.map(room => room.id));
            setPoints(pts);
          } else {
            setPoints([]);
          }

          if (p.fileUrl) {
            loadImage(p.fileUrl);
          } else {
            setImageObj(null);
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadActiveLayerData();
  }, [activePlanId]);

  const loadImage = (url: string) => {
    const img = new window.Image();
    img.src = url;
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      setImageObj(img);
    };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file || !version) return;

    setUploading(true);
    try {
      if (file.type === 'application/pdf') {
        showToast('Convertendo PDF para imagem de fundo...');
        file = await convertPdfToImage(file);
      }

      const url = await electricalProjectService.uploadPlanImage(file, organizationId);
      const newPlan = await electricalProjectService.createPlan({
        organizationId,
        versionId: version.id,
        fileUrl: url,
        floorName: `Planta ${plans.length + 1}`,
        scaleFactor: 100
      });
      
      setPlans([...plans, newPlan]);
      setActivePlanId(newPlan.id);
      showToast('Nova planta importada com sucesso!');

    } catch (error) {
      console.error(error);
      showToast('Erro ao fazer upload da planta', 'error');
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

  const handleStageMouseMove = (e: any) => {
    if (tool !== 'draw_wall' || currentWall.length === 0) return;
    const stage = e.target.getStage();
    const pointerPosition = stage.getRelativePointerPosition();
    if (pointerPosition && wallPreviewRef.current) {
      let nextPos = pointerPosition;
      if (isOrthoMode && currentWall.length >= 2) {
        const lastX = currentWall[currentWall.length - 2];
        const lastY = currentWall[currentWall.length - 1];
        const dx = Math.abs(pointerPosition.x - lastX);
        const dy = Math.abs(pointerPosition.y - lastY);
        if (dx > dy) {
          nextPos = { x: pointerPosition.x, y: lastY };
        } else {
          nextPos = { x: lastX, y: pointerPosition.y };
        }
      }

      const newPoints = [...currentWall, nextPos.x, nextPos.y];
      
      if (typeof wallPreviewRef.current.points === 'function') {
        // Fallback for single line (just in case)
        wallPreviewRef.current.points(newPoints);
      } else {
        // Group of lines
        const children = wallPreviewRef.current.getChildren();
        children.forEach((child: any) => {
          if (child.getClassName() === 'Line') {
            child.points(newPoints);
          }
        });
      }
      
      wallPreviewRef.current.getLayer().batchDraw();
    }
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    
    const scaleBy = 1.1;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    if (newScale < 0.1 || newScale > 20) return;

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    
    setStageTransform({ scale: newScale, x: newPos.x, y: newPos.y });
  };

  const handleDragMove = (e: any) => {
    if (e.target === stageRef.current) {
      setStageTransform(prev => ({ ...prev, x: e.target.x(), y: e.target.y() }));
    }
  };

  const zoomIn = () => setStageTransform(prev => ({ ...prev, scale: Math.min(20, prev.scale * 1.2) }));
  const zoomOut = () => setStageTransform(prev => ({ ...prev, scale: Math.max(0.1, prev.scale / 1.2) }));
  const resetTransform = () => setStageTransform({ scale: 1, x: 0, y: 0 });

  const handleStageDblClick = (e: any) => {
    e.cancelBubble = true;
    
    const stage = e.target.getStage();
    const pointerPosition = stage.getRelativePointerPosition();
    if (!pointerPosition) return;

    const ppm = plan?.scaleFactor || 100;
    const baseGridPx = (gridSizeCm / 100) * ppm;
    const scaledGridPx = baseGridPx * stageTransform.scale;
    
    let snapPoint = pointerPosition;
    if (gridSizeCm > 0 && scaledGridPx >= 5) {
      snapPoint = {
        x: Math.round(pointerPosition.x / baseGridPx) * baseGridPx,
        y: Math.round(pointerPosition.y / baseGridPx) * baseGridPx
      };
    }

    if (tool === 'draw_wall') {
      if (isOrthoMode && currentWall.length >= 2) {
        const lastX = currentWall[currentWall.length - 2];
        const lastY = currentWall[currentWall.length - 1];
        if (Math.abs(snapPoint.x - lastX) > Math.abs(snapPoint.y - lastY)) {
          snapPoint.y = lastY;
        } else {
          snapPoint.x = lastX;
        }
      }
      finishWall([...currentWall, snapPoint.x, snapPoint.y]);
    } else if (tool === 'draw_room') {
      if (isOrthoMode && currentPolygon.length >= 2) {
        const lastX = currentPolygon[currentPolygon.length - 2];
        const lastY = currentPolygon[currentPolygon.length - 1];
        if (Math.abs(snapPoint.x - lastX) > Math.abs(snapPoint.y - lastY)) {
          snapPoint.y = lastY;
        } else {
          snapPoint.x = lastX;
        }
      }
      finishPolygon([...currentPolygon, snapPoint.x, snapPoint.y]);
    }
  };

  const handleStageClick = async (e: any) => {
    if (isShiftDown) return; // Prevent clicks while panning

    const stage = e.target.getStage();
    const pointerPosition = stage.getRelativePointerPosition();
    if (!pointerPosition) return;

    if (tool === 'calibrate') {
      const newPoints = [...calibrationPoints, pointerPosition.x, pointerPosition.y];
      setCalibrationPoints(newPoints);
      
      if (newPoints.length === 4) {
        // Two points collected
        const dx = newPoints[2] - newPoints[0];
        const dy = newPoints[3] - newPoints[1];
        const pxDistance = Math.sqrt(dx * dx + dy * dy);
        
        setTimeout(async () => {
          const realDistanceStr = prompt('Qual a distância real em metros entre esses dois pontos? (ex: 0.80)');
          if (realDistanceStr) {
            const realDistance = parseFloat(realDistanceStr.replace(',', '.'));
            if (!isNaN(realDistance) && realDistance > 0 && plan) {
              const newScaleFactor = pxDistance / realDistance;
              
              try {
                // Update Plan
                const updatedPlan = await electricalProjectService.updatePlan(plan.id, { scaleFactor: newScaleFactor });
                setPlans(plans.map(p => p.id === plan.id ? updatedPlan : p));
                
                // Recalculate Rooms
                const updatedRooms = [];
                for (const room of rooms) {
                  const pts = room.polygonPoints as number[];
                  if (!pts || pts.length < 6) {
                    updatedRooms.push(room);
                    continue;
                  }
                  
                  let areaPx = 0;
                  let perimeterPx = 0;
                  for (let i = 0; i < pts.length; i += 2) {
                    const x1 = pts[i];
                    const y1 = pts[i + 1];
                    const x2 = pts[(i + 2) % pts.length];
                    const y2 = pts[(i + 3) % pts.length];
                    areaPx += (x1 * y2 - x2 * y1);
                    perimeterPx += Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
                  }
                  areaPx = Math.abs(areaPx / 2);
                  
                  const areaSqm = Number((areaPx / (newScaleFactor * newScaleFactor)).toFixed(2));
                  const perimeterM = Number((perimeterPx / newScaleFactor).toFixed(2));
                  
                  const updatedRoom = await electricalProjectService.updateRoom(room.id, { areaSqm, perimeterM });
                  updatedRooms.push(updatedRoom);
                }
                
                setRooms(updatedRooms);
                showToast('Escala calibrada e ambientes recalculados com sucesso!', 'success');
              } catch (err) {
                console.error(err);
                showToast('Erro ao calibrar escala.', 'error');
              }
            }
          }
          setCalibrationPoints([]);
          setTool('select');
        }, 100);
      }
      return;
    }

    const ppm = plan?.scaleFactor || 100;
    const baseGridPx = (gridSizeCm / 100) * ppm;
    const scaledGridPx = baseGridPx * stageTransform.scale;
    
    let snappedPos = pointerPosition;
    if (gridSizeCm > 0 && scaledGridPx >= 5) {
      snappedPos = {
        x: Math.round(pointerPosition.x / baseGridPx) * baseGridPx,
        y: Math.round(pointerPosition.y / baseGridPx) * baseGridPx
      };
    }

    if (isOrthoMode) {
      if (tool === 'draw_wall' && currentWall.length >= 2) {
        const lastX = currentWall[currentWall.length - 2];
        const lastY = currentWall[currentWall.length - 1];
        snappedPos = Math.abs(pointerPosition.x - lastX) > Math.abs(pointerPosition.y - lastY) 
          ? { x: snappedPos.x, y: lastY } : { x: lastX, y: snappedPos.y };
      } else if (tool === 'draw_room' && currentPolygon.length >= 2) {
        const lastX = currentPolygon[currentPolygon.length - 2];
        const lastY = currentPolygon[currentPolygon.length - 1];
        snappedPos = Math.abs(pointerPosition.x - lastX) > Math.abs(pointerPosition.y - lastY) 
          ? { x: snappedPos.x, y: lastY } : { x: lastX, y: snappedPos.y };
      }
    }

    if (tool === 'draw_wall') {
      setCurrentWall([...currentWall, snappedPos.x, snappedPos.y]);
      return;
    }

    if (tool === 'draw_room') {
      setCurrentPolygon([...currentPolygon, snappedPos.x, snappedPos.y]);
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
        setSelectedPoint(null);
        setSelectedWallId(null);
      }
      return;
    }
  };

  const finishPolygon = async (overridePts?: number[]) => {
    const pts = overridePts || currentPolygon;
    if (pts.length < 6) {
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

    // Calcula Área e Perímetro em Pixels
    let areaPx = 0;
    let perimeterPx = 0;
    // const pts = currentPolygon; // replaced by param
    for (let i = 0; i < pts.length; i += 2) {
      const x1 = pts[i];
      const y1 = pts[i + 1];
      const x2 = pts[(i + 2) % pts.length];
      const y2 = pts[(i + 3) % pts.length];
      
      areaPx += (x1 * y2 - x2 * y1);
      perimeterPx += Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    }
    areaPx = Math.abs(areaPx / 2);

    // Converte para metros usando scaleFactor (Pixels Por Metro). Assume 100 PPM como fallback.
    const ppm = plan.scaleFactor || 100;
    const areaSqm = areaPx / (ppm * ppm);
    const perimeterM = perimeterPx / ppm;

    try {
      const newRoom = await electricalProjectService.createRoom({
        organizationId: organizationId,
        planId: plan.id,
        name: roomName,
        polygonPoints: pts,
        areaSqm: Number(areaSqm.toFixed(2)),
        perimeterM: Number(perimeterM.toFixed(2))
      });
      setRooms(prev => [...prev, newRoom]);
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar ambiente.');
    }
    
    setCurrentPolygon([]);
    setTool('select');
  };

  const finishWall = async (overridePts?: number[]) => {
    const pts = overridePts || currentWall;
    if (pts.length < 4) {
      setCurrentWall([]);
      setTool('select');
      return;
    }
    if (!plan) return;

    try {
      const newWall = await electricalProjectService.createWall({
        organizationId: organizationId,
        planId: plan.id,
        points: pts,
        thicknessM: 0.15
      });
      setWalls(prev => [...prev, newWall]);
    } catch (error) {
      console.error(error);
      showToast('Erro ao salvar parede', 'error');
    }
    
    setCurrentWall([]);
    // Do not set tool to 'select', allow continuous drawing unless they hit Esc
  };

  const handleUpdateWallThickness = async (wallId: string, thicknessM: number) => {
    if (isNaN(thicknessM) || thicknessM <= 0) return;
    setWalls(prev => prev.map(w => w.id === wallId ? { ...w, thicknessM } : w));
    try {
       await electricalProjectService.updateWall(wallId, { thicknessM });
    } catch(err) {
       console.error(err);
       showToast('Erro ao atualizar espessura', 'error');
    }
  };

  const handleUpdateWallHeight = async (wallId: string, heightM: number) => {
    if (isNaN(heightM) || heightM <= 0) return;
    setWalls(prev => prev.map(w => w.id === wallId ? { ...w, heightM } : w));
    try {
       await electricalProjectService.updateWall(wallId, { heightM });
    } catch(err) {
       console.error(err);
       showToast('Erro ao atualizar altura', 'error');
    }
  };

  const getWallTotalLength = (wall: OpuraElectricalWall) => {
    const pts = wall.points as number[];
    if (!pts || pts.length < 4) return 0;
    let totalPx = 0;
    for (let i = 0; i < pts.length - 2; i += 2) {
      const x1 = pts[i], y1 = pts[i+1];
      const x2 = pts[i+2], y2 = pts[i+3];
      totalPx += Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2));
    }
    return totalPx / (plan?.scaleFactor || 100);
  };

  const handleUpdateWallTotalLength = async (wallId: string, newLengthM: number) => {
    if (isNaN(newLengthM) || newLengthM <= 0) return;
    const wall = walls.find(w => w.id === wallId);
    if (!wall || !plan) return;
    
    const currentLengthM = getWallTotalLength(wall);
    if (currentLengthM === 0) return;
    
    const ratio = newLengthM / currentLengthM;
    const pts = [...(wall.points as number[])];
    const originX = pts[0];
    const originY = pts[1];
    
    for (let i = 2; i < pts.length; i += 2) {
      const dx = pts[i] - originX;
      const dy = pts[i+1] - originY;
      pts[i] = originX + dx * ratio;
      pts[i+1] = originY + dy * ratio;
    }
    
    // Update local state immediately for fast feedback
    setWalls(walls.map(w => w.id === wall.id ? { ...w, points: pts } : w));

    try {
      const updatedWall = await electricalProjectService.updateWall(wall.id, { points: pts });
      setWalls(prev => prev.map(w => w.id === wall.id ? updatedWall : w));
    } catch (err) {
      console.error(err);
      showToast('Erro ao atualizar comprimento', 'error');
    }
  };

  const handleSegmentLengthSave = async (wallId: string, startIndex: number, newLengthStr: string) => {
    const newLengthM = parseFloat(newLengthStr.replace(',', '.'));
    if (isNaN(newLengthM) || newLengthM <= 0) {
        setEditingSegment(null);
        return;
    }
    const wall = walls.find(w => w.id === wallId);
    if (!wall || !plan) return;

    const pts = [...(wall.points as number[])];
    const x1 = pts[startIndex];
    const y1 = pts[startIndex + 1];
    const x2 = pts[startIndex + 2];
    const y2 = pts[startIndex + 3];

    const dx = x2 - x1;
    const dy = y2 - y1;
    const currentLengthPx = Math.sqrt(dx*dx + dy*dy);
    if (currentLengthPx === 0) {
        setEditingSegment(null);
        return;
    }

    const newLengthPx = newLengthM * (plan.scaleFactor || 100);
    const ratio = newLengthPx / currentLengthPx;

    const newDx = dx * ratio;
    const newDy = dy * ratio;

    const diffX = (x1 + newDx) - x2;
    const diffY = (y1 + newDy) - y2;

    const numPoints = pts.length / 2;
    const isClosed = numPoints >= 4 && Math.abs(pts[0] - pts[pts.length - 2]) < 1 && Math.abs(pts[1] - pts[pts.length - 1]) < 1;
    
    let p1 = (startIndex / 2) + 1;
    let p2 = p1 + 1;
    
    const indicesToMove = new Set<number>();
    indicesToMove.add(p1);
    
    if (isClosed) {
       if (p2 >= numPoints) p2 = p2 % (numPoints - 1);
       indicesToMove.add(p2);
       
       if (indicesToMove.has(0)) indicesToMove.add(numPoints - 1);
       if (indicesToMove.has(numPoints - 1)) indicesToMove.add(0);
    } else {
       if (p2 < numPoints) indicesToMove.add(p2);
    }

    for (const idx of indicesToMove) {
        pts[idx * 2] += diffX;
        pts[idx * 2 + 1] += diffY;
    }

    // Update local state immediately
    setWalls(walls.map(w => w.id === wall.id ? { ...w, points: pts } : w));

    try {
        const updatedWall = await electricalProjectService.updateWall(wall.id, { points: pts });
        setWalls(walls.map(w => w.id === wall.id ? updatedWall : w));
        showToast('Tamanho ajustado', 'success');
    } catch (err) {
        showToast('Erro ao atualizar parede', 'error');
    }
    setEditingSegment(null);
  };

  const renderWallLabels = () => {
    if (!selectedWallId || !plan) return null;
    const wall = walls.find(w => w.id === selectedWallId);
    if (!wall) return null;
    const pts = wall.points as number[];
    if (!pts || pts.length < 4) return null;

    const segments = [];
    for (let i = 0; i < pts.length - 2; i += 2) {
        const x1 = pts[i], y1 = pts[i+1];
        const x2 = pts[i+2], y2 = pts[i+3];
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        const posPx = {
          x: midX * stageTransform.scale + stageTransform.x,
          y: midY * stageTransform.scale + stageTransform.y
        };
        
        const lengthPx = Math.sqrt(Math.pow(x2-x1,2) + Math.pow(y2-y1,2));
        const lengthM = lengthPx / (plan.scaleFactor || 100);

        const isEditing = editingSegment?.wallId === wall.id && editingSegment?.index === i;

        segments.push(
            <div 
                key={i}
                className="absolute z-50 flex items-center justify-center pointer-events-auto"
                style={{ left: posPx.x, top: posPx.y, transform: 'translate(-50%, -50%)' }}
            >
                {isEditing ? (
                    <div className="bg-white border-2 border-blue-500 rounded p-1 shadow-lg flex items-center" onClick={e => e.stopPropagation()}>
                        <input 
                            autoFocus
                            type="text"
                            value={editingSegment.lengthM}
                            onChange={e => setEditingSegment({...editingSegment, lengthM: e.target.value})}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleSegmentLengthSave(wall.id, i, editingSegment.lengthM);
                                if (e.key === 'Escape') setEditingSegment(null);
                            }}
                            onBlur={() => handleSegmentLengthSave(wall.id, i, editingSegment.lengthM)}
                            className="w-16 outline-none text-center text-sm font-bold"
                        />
                        <span className="text-xs text-slate-500 ml-1">m</span>
                    </div>
                ) : (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setEditingSegment({ wallId: wall.id, index: i, lengthM: lengthM.toFixed(2) }); }}
                        className="bg-blue-600 text-white px-2 py-0.5 rounded shadow text-xs font-bold hover:bg-blue-700 transition-colors"
                    >
                        {lengthM.toFixed(2)}m
                    </button>
                )}
            </div>
        );
    }
    return segments;
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
          {selectedWallId && (
            <button
              onClick={async () => {
                try {
                  await electricalProjectService.deleteWall(selectedWallId);
                  setWalls(walls.filter(w => w.id !== selectedWallId));
                  setSelectedWallId(null);
                  showToast('Parede excluída com sucesso');
                } catch (e) {
                  showToast('Erro ao excluir parede', 'error');
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Parede
            </button>
          )}
          
          {plan?.fileUrl && (
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setShowBackground(!showBackground)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  showBackground ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                }`}
              >
                {showBackground ? 'Ocultar Planta' : 'Mostrar Planta'}
              </button>
              <button
                onClick={async () => {
                  if (confirm('Tem certeza que deseja remover a planta de fundo? Os elementos desenhados não serão perdidos.')) {
                    try {
                      await electricalProjectService.updatePlan(plan.id, { fileUrl: null });
                      setPlans(plans.map(p => p.id === plan.id ? { ...p, fileUrl: null } : p));
                      setImageObj(null);
                      showToast('Planta removida.');
                    } catch(e) {
                      showToast('Erro ao remover', 'error');
                    }
                  }
                }}
                className="px-2 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Remover planta importada"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <label className="cursor-pointer inline-flex items-center justify-center rounded-xl font-black uppercase tracking-widest transition-all active:scale-95 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 h-9 px-4 text-sm gap-2">
            <Upload className="w-4 h-4 mr-2 text-slate-500" />
            {plan?.fileUrl ? 'Trocar Planta' : 'Importar Planta'}
            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
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
          {plan && (
            <PointToolbox 
              selectedToolboxItem={selectedToolboxItem}
              onSelectToolboxItem={setSelectedToolboxItem}
              tool={tool}
              setTool={setTool}
            />
          )}

          {/* CANVAS AREA */}
          <div className="flex-1 bg-slate-100 relative overflow-hidden" ref={containerRef}>
            {!plan && !uploading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center p-8 bg-white/50 rounded-2xl border border-dashed border-slate-300">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                  <p className="font-bold text-slate-600">Nenhum pavimento selecionado</p>
                  <p className="text-sm text-slate-500">Crie ou selecione um pavimento no menu lateral.</p>
                </div>
              </div>
            )}

            {plan && (
              <React.Fragment>
                {(() => {
                  const s = stageTransform.scale;
                  const px = stageTransform.x;
                  const py = stageTransform.y;
                  
                  const ppm = plan?.scaleFactor || 100;
                  const baseGridPx = (gridSizeCm / 100) * ppm;
                  const scaledGridPx = baseGridPx * s;

                  return (
                  <React.Fragment>
                    {/* Infinite Crisp CSS Grid */}
                    {gridSizeCm > 0 && scaledGridPx >= 5 && (
                      <div 
                        className="absolute inset-0 pointer-events-none opacity-[0.15] z-0"
                        style={{
                          backgroundImage: `
                            linear-gradient(to right, #000 1px, transparent 1px),
                            linear-gradient(to bottom, #000 1px, transparent 1px)
                          `,
                          backgroundSize: `${scaledGridPx}px ${scaledGridPx}px`,
                          backgroundPosition: `${px}px ${py}px`
                        }}
                      />
                    )}
                    
                    <div className="absolute bottom-6 left-6 flex items-center gap-1 bg-white p-1.5 rounded-xl shadow-lg border border-slate-200 z-10 text-xs">
                      <button 
                        onClick={() => setGridSizeCm(prev => Math.max(0, prev - 1))}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Diminuir Grid"
                      ><Minus className="w-4 h-4" /></button>
                      <button 
                        onClick={() => setGridSizeCm(prev => prev + 1)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Aumentar Grid"
                      ><Plus className="w-4 h-4" /></button>
                      <div className="px-2 font-bold text-slate-700 min-w-[120px] flex items-center border-l border-slate-200 ml-1 pl-2">
                        <span className="mr-1">Grid:</span>
                        <input 
                          type="number"
                          min="0"
                          step="1"
                          value={gridSizeCm || ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setGridSizeCm(isNaN(val) ? 0 : val);
                          }}
                          className="w-12 px-1 py-0.5 text-center border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                        <span className="ml-1 text-slate-500 font-normal">cm</span>
                      </div>
                    </div>

                    {selectedWallId && tool === 'select' && (
                      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white p-2 rounded-xl shadow-lg border border-slate-200 z-10">
                        <div className="px-3 text-sm font-medium text-slate-600 border-r border-slate-200">
                          Parede Selecionada
                        </div>
                        <div className="flex items-center gap-2 px-2">
                          <span className="text-sm text-slate-500">Espessura:</span>
                          <input 
                             type="number"
                             step="0.01"
                             min="0.01"
                             value={walls.find(w => w.id === selectedWallId)?.thicknessM || 0.15}
                             onChange={(e) => handleUpdateWallThickness(selectedWallId, parseFloat(e.target.value))}
                             className="w-16 px-2 py-1 text-sm border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                          />
                          <span className="text-sm text-slate-500">m</span>
                        </div>
                        <div className="flex items-center gap-2 px-2 border-l border-slate-200">
                          <span className="text-sm text-slate-500">Altura:</span>
                          <input 
                             type="number"
                             step="0.01"
                             min="0.01"
                             value={walls.find(w => w.id === selectedWallId)?.heightM || 2.80}
                             onChange={(e) => handleUpdateWallHeight(selectedWallId, parseFloat(e.target.value))}
                             className="w-16 px-2 py-1 text-sm border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                          />
                          <span className="text-sm text-slate-500">m</span>
                        </div>
                        {walls.find(w => w.id === selectedWallId)?.points?.length === 4 && (
                          <div className="flex items-center gap-2 px-2 border-l border-slate-200">
                            <span className="text-sm text-slate-500">Comprimento:</span>
                            <input 
                               type="number"
                               step="0.01"
                               min="0.01"
                               value={editingWallLengthValue}
                               onChange={(e) => setEditingWallLengthValue(e.target.value)}
                               onBlur={(e) => handleUpdateWallTotalLength(selectedWallId, parseFloat(e.target.value))}
                               onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateWallTotalLength(selectedWallId, parseFloat((e.target as HTMLInputElement).value));
                               }}
                               className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all bg-yellow-50"
                               title="Digite e aperte Enter para aplicar"
                            />
                            <span className="text-sm text-slate-500">m</span>
                          </div>
                        )}
                        <button
                          onClick={() => setSelectedWallId(null)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
                          title="Deselecionar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white p-2 rounded-xl shadow-lg border border-slate-200 z-10">
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                          onClick={() => { setTool('select'); setCurrentPolygon([]); setCalibrationPoints([]); }}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                            tool === 'select' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <MousePointer2 className="w-4 h-4" />
                          Mover
                        </button>
                        <button
                          onClick={() => { setTool('draw_room'); setCurrentPolygon([]); setCalibrationPoints([]); }}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                            tool === 'draw_room' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <Square className="w-4 h-4" />
                          Desenhar Ambiente
                        </button>
                        <button
                          onClick={() => { setTool('draw_wall'); setCurrentPolygon([]); setCalibrationPoints([]); setCurrentWall([]); }}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                            tool === 'draw_wall' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <Edit3 className="w-4 h-4" />
                          Desenhar Parede
                        </button>
                        <button
                          onClick={() => { setTool('calibrate'); setCurrentPolygon([]); setCalibrationPoints([]); setCurrentWall([]); }}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                            tool === 'calibrate' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                          }`}
                          title="Calibrar escala da planta"
                        >
                          <Ruler className="w-4 h-4" />
                          Calibrar Escala
                        </button>
                      </div>
                      
                      <button
                        onClick={() => setIsOrthoMode(!isOrthoMode)}
                        className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
                          isOrthoMode ? 'bg-blue-100 text-blue-700 shadow-sm border border-blue-200' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-transparent'
                        }`}
                        title="Modo Ortogonal (90 graus)"
                      >
                        <CornerDownRight className="w-5 h-5" />
                      </button>
                      <div className="w-px h-6 bg-slate-300 mx-1"></div>

                      <button 
                        onClick={zoomOut} 
                        className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Reduzir Zoom"
                      >
                        <ZoomOut className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => resetTransform()} 
                        className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Ajustar à Tela"
                      >
                        <Maximize className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={zoomIn} 
                        className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Aumentar Zoom"
                      >
                        <ZoomIn className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="absolute inset-0">
                      <Stage 
                        ref={stageRef}
                        width={dimensions.width || 800} 
                        height={dimensions.height || 600}
                        scaleX={s}
                        scaleY={s}
                        x={px}
                        y={py}
                        onWheel={handleWheel}
                        draggable={tool === 'select' || isShiftDown}
                        onDragMove={handleDragMove}
                        onClick={handleStageClick}
                        onMouseMove={handleStageMouseMove}
                        onDblClick={handleStageDblClick}
                          className={tool === 'draw_room' || tool === 'draw_wall' || tool === 'add_point' || tool === 'calibrate' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}
                        >
                        <Layer>
                          {/* Imagem de Fundo */}
                          {imageObj && showBackground && <KonvaImage image={imageObj} />}
                          
                          {/* Walls */}
                          {walls.map(w => {
                            const widthPx = plan?.scaleFactor ? (w.thicknessM || 0.15) * plan.scaleFactor : 10;
                            return (
                              <Group 
                                key={w.id}
                                onClick={(e) => {
                                  if (tool === 'select') {
                                    e.cancelBubble = true;
                                    setSelectedWallId(w.id);
                                    setSelectedPointId(null);
                                    setSelectedPoint(null);
                                  }
                                }}
                              >
                                <Line 
                                  points={w.points} 
                                  stroke={selectedWallId === w.id ? "#ef4444" : "#1e293b"} 
                                  strokeWidth={widthPx} 
                                  lineCap="square" 
                                  lineJoin="miter" 
                                />
                                <Line 
                                  points={w.points} 
                                  stroke="#ffffff" 
                                  strokeWidth={Math.max(1, widthPx - 2)} 
                                  lineCap="square" 
                                  lineJoin="miter" 
                                />
                              </Group>
                            );
                          })}
                          
                          {/* Removed preview from here to separate layer */}
                          
                          {rooms.map((room) => {
                            const pts = room.polygonPoints as number[];
                            if (!pts || pts.length < 6) return null;
                            
                            // Calcula centro da bounding box para colocar o texto
                            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                            for (let i = 0; i < pts.length; i += 2) {
                              if (pts[i] < minX) minX = pts[i];
                              if (pts[i] > maxX) maxX = pts[i];
                              if (pts[i + 1] < minY) minY = pts[i + 1];
                              if (pts[i + 1] > maxY) maxY = pts[i + 1];
                            }
                            const centerX = minX + (maxX - minX) / 2;
                            const centerY = minY + (maxY - minY) / 2;

                            return (
                              <Group key={room.id}>
                                <Line
                                  points={pts}
                                  fill="rgba(59, 130, 246, 0.2)"
                                  stroke="#3b82f6"
                                  strokeWidth={2}
                                  closed
                                  tension={0}
                                />
                                <Text
                                  x={centerX - 50}
                                  y={centerY - 20}
                                  text={`${room.name}\n${room.areaSqm || 0} m² | ${room.perimeterM || 0} m`}
                                  fontSize={14}
                                  fill="#1e40af"
                                  fontStyle="bold"
                                  align="center"
                                  width={100}
                                />
                              </Group>
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
                              onClick={() => finishPolygon()}
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
                          {/* Pontos de calibração */}
                          {calibrationPoints.length >= 2 && (
                            <Group>
                              <Circle
                                x={calibrationPoints[0]}
                                y={calibrationPoints[1]}
                                radius={4}
                                fill="#f59e0b"
                              />
                              {calibrationPoints.length === 4 && (
                                <>
                                  <Circle
                                    x={calibrationPoints[2]}
                                    y={calibrationPoints[3]}
                                    radius={4}
                                    fill="#f59e0b"
                                  />
                                  <Line
                                    points={calibrationPoints}
                                    stroke="#f59e0b"
                                    strokeWidth={2}
                                    dash={[5, 5]}
                                  />
                                </>
                              )}
                            </Group>
                          )}
                        </Layer>
                        <Layer>
                          {/* Current Wall Preview */}
                          {tool === 'draw_wall' && currentWall.length > 0 && (
                             <Group ref={wallPreviewRef} listening={false}>
                               <Line 
                                  points={currentWall} 
                                  stroke="#3b82f6" 
                                  strokeWidth={plan?.scaleFactor ? 0.15 * plan.scaleFactor : 10} 
                                  opacity={0.6} 
                                  lineCap="square" 
                                  lineJoin="miter" 
                               />
                               <Line 
                                  points={currentWall} 
                                  stroke="#ffffff" 
                                  strokeWidth={Math.max(1, (plan?.scaleFactor ? 0.15 * plan.scaleFactor : 10) - 2)} 
                                  opacity={0.6} 
                                  lineCap="square" 
                                  lineJoin="miter" 
                               />
                             </Group>
                          )}
                        </Layer>
                      </Stage>
                      {renderWallLabels()}
                    </div>
                  </React.Fragment>
                  );
                })()}
              </React.Fragment>
            )}

            {/* Dica para fechar o polígono */}
            {tool === 'draw_room' && currentPolygon.length > 0 && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white p-2 rounded-xl shadow-lg border border-slate-200 z-10">
                <div className="px-3 text-sm font-medium text-slate-600 border-r border-slate-200">
                  Desenhando Sala...
                </div>
                <button
                  onClick={() => {
                    const newPolygon = [...currentPolygon];
                    newPolygon.splice(-2, 2); // Remove last x,y pair
                    setCurrentPolygon(newPolygon);
                  }}
                  className="px-3 py-1.5 flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Desfazer último ponto"
                >
                  <Undo className="w-4 h-4" /> Desfazer
                </button>
                <button
                  onClick={() => {
                    setCurrentPolygon([]);
                    setTool('select');
                  }}
                  className="px-3 py-1.5 flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Cancelar"
                >
                  <X className="w-4 h-4" /> Cancelar
                </button>
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
              <div className="flex flex-col h-full overflow-hidden">
                <PlanSidebar
                  plans={plans}
                  activePlanId={activePlanId}
                  onSelectPlan={setActivePlanId}
                  onCreateEmptyPlan={async () => {
                    try {
                      if (!version) {
                        showToast('Aguarde o carregamento do projeto.', 'error');
                        return;
                      }
                      if (!organizationId) {
                        showToast('Erro de organização.', 'error');
                        return;
                      }
                      
                      const newPlan = await electricalProjectService.createPlan({
                        organizationId,
                        versionId: version.id,
                        fileUrl: null, // empty layer
                        floorName: `Camada Vazia ${plans.length + 1}`,
                        scaleFactor: 100
                      });
                      setPlans([...plans, newPlan]);
                      setActivePlanId(newPlan.id);
                      showToast('Camada vazia criada com sucesso!', 'success');
                    } catch (e: any) {
                      console.error('Create empty plan error:', e);
                      showToast(`Erro ao criar camada: ${e.message}`, 'error');
                    }
                  }}
                  onDeletePlan={async (id) => {
                    try {
                      await electricalProjectService.deletePlan(id);
                      const newPlans = plans.filter(p => p.id !== id);
                      setPlans(newPlans);
                      if (activePlanId === id) setActivePlanId(newPlans[0]?.id || null);
                    } catch (error) {
                       alert('Erro ao excluir plano.');
                    }
                  }}
                  onRenamePlan={async (id, newName) => {
                    try {
                       const updated = await electricalProjectService.updatePlan(id, { floorName: newName });
                       setPlans(plans.map(p => p.id === id ? updated : p));
                    } catch(e) {
                       alert('Erro ao renomear.');
                    }
                  }}
                />
                <div className="flex-1 overflow-hidden">
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
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ElectricalEditorView;
