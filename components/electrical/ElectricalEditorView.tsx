import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Upload, Save, MousePointer2, Square, Loader2, Download, ZoomIn, ZoomOut, Maximize, Undo, Redo, X, Ruler, Edit3, CornerDownRight, Trash2, Plus, Minus } from 'lucide-react';
import Button from '../ui/Button';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Text, Group, Arc, Rect } from 'react-konva';
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
import { detectNewRooms } from '../../utils/geometry/roomDetection';

interface ElectricalEditorViewProps {
  organizationId: string;
  projectId: string;
  electricalProjectId: string;
  onBack: () => void;
}

export interface CanvasState {
  walls: OpuraElectricalWall[];
  rooms: OpuraElectricalRoom[];
  points: OpuraElectricalPoint[];
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
  const [elements, setElements] = useState<any[]>([]);

  // Undo/Redo State
  const [history, setHistory] = useState<CanvasState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoRef = useRef(false);
  
  const pushHistoryState = (newState: CanvasState) => {
    setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(newState);
        return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
  };

  const performUndoRedo = async (targetState: CanvasState) => {
    if (isUndoRedoRef.current) return;
    isUndoRedoRef.current = true;
    try {
        const currentWalls = walls;
        const currentRooms = rooms;
        const currentPoints = points;

        // Diff Walls
        const wallsToDelete = currentWalls.filter(w => !targetState.walls.find(x => x.id === w.id));
        const wallsToCreate = targetState.walls.filter(w => !currentWalls.find(x => x.id === w.id));
        const wallsToUpdate = targetState.walls.filter(w => {
            const o = currentWalls.find(x => x.id === w.id);
            return o && JSON.stringify(o.points) !== JSON.stringify(w.points);
        });

        // Diff Rooms
        const roomsToDelete = currentRooms.filter(r => !targetState.rooms.find(x => x.id === r.id));
        const roomsToCreate = targetState.rooms.filter(r => !currentRooms.find(x => x.id === r.id));
        const roomsToUpdate = targetState.rooms.filter(r => {
            const o = currentRooms.find(x => x.id === r.id);
            return o && JSON.stringify(o.polygonPoints) !== JSON.stringify(r.polygonPoints);
        });

        // Diff Points
        const pointsToDelete = currentPoints.filter(p => !targetState.points.find(x => x.id === p.id));
        const pointsToCreate = targetState.points.filter(p => !currentPoints.find(x => x.id === p.id));
        const pointsToUpdate = targetState.points.filter(p => {
            const o = currentPoints.find(x => x.id === p.id);
            return o && (o.canvasX !== p.canvasX || o.canvasY !== p.canvasY || o.pointType !== p.pointType);
        });

        // Update local state immediately
        setWalls(targetState.walls);
        setRooms(targetState.rooms);
        setPoints(targetState.points);

        // Execute API calls
        await Promise.all([
            ...wallsToDelete.map(w => electricalProjectService.deleteWall(w.id)),
            ...wallsToCreate.map(w => electricalProjectService.createWall(w)),
            ...wallsToUpdate.map(w => electricalProjectService.updateWall(w.id, { points: w.points })),
            
            ...roomsToDelete.map(r => electricalProjectService.deleteRoom(r.id)),
            ...roomsToCreate.map(r => electricalProjectService.createRoom(r)),
            ...roomsToUpdate.map(r => electricalProjectService.updateRoom(r.id, { polygonPoints: r.polygonPoints })),
            
            ...pointsToDelete.map(p => electricalProjectService.deletePoint(p.id)),
            ...pointsToCreate.map(p => electricalProjectService.createPoint(p)),
            ...pointsToUpdate.map(p => electricalProjectService.updatePoint(p.id, { canvasX: p.canvasX, canvasY: p.canvasY, pointType: p.pointType }))
        ]);
        
    } catch (err) {
        console.error("Erro durante Undo/Redo", err);
        showToast("Erro ao sincronizar histórico", "error");
    } finally {
        isUndoRedoRef.current = false;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (historyIndex > 0 && !isUndoRedoRef.current) {
                const targetIdx = historyIndex - 1;
                setHistoryIndex(targetIdx);
                performUndoRedo(history[targetIdx]);
            }
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            if (historyIndex < history.length - 1 && !isUndoRedoRef.current) {
                const targetIdx = historyIndex + 1;
                setHistoryIndex(targetIdx);
                performUndoRedo(history[targetIdx]);
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, historyIndex, walls, rooms, points]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  // Editor State
  const [viewMode, setViewMode] = useState<'drawing' | 'schedule' | 'takeoff'>('drawing');
  const [tool, setTool] = useState<string>('select');
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
  const [showRooms, setShowRooms] = useState(true);
  const [editingSegment, setEditingSegment] = useState<{wallId: string, index: number, lengthM: string} | null>(null);
  const [editingWallLengthValue, setEditingWallLengthValue] = useState<string>('');
  const wallPreviewRef = useRef<any>(null);
  
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [stageTransform, setStageTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 });
  const { showToast } = useToast();

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    
    // Initial size
    setDimensions({ 
      width: containerRef.current.offsetWidth, 
      height: containerRef.current.offsetHeight 
    });

    return () => observer.disconnect();
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
            setWalls(prev => {
                const newWalls = prev.filter(w => w.id !== selectedWallId);
                pushHistoryState({ walls: newWalls, rooms, points });
                return newWalls;
            });
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
      setElements([]);
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
          
          let initialPoints: OpuraElectricalPoint[] = [];
          if (r.length > 0) {
            initialPoints = await electricalProjectService.listPointsByRooms(r.map(room => room.id));
            setPoints(initialPoints);
          } else {
            setPoints([]);
          }
          
          setHistory([{ walls: w, rooms: r, points: initialPoints }]);
          setHistoryIndex(0);

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

  const getSnappedPosition = (pointerPosition: { x: number, y: number }) => {
    let snappedPos = { ...pointerPosition };
    
    // 1. Grid Snapping
    const baseGridPx = gridSizeCm > 0 && plan?.scaleFactor ? (gridSizeCm / 100) * plan.scaleFactor : 0;
    const scaledGridPx = baseGridPx * stageTransform.scale;
    if (gridSizeCm > 0 && scaledGridPx >= 5) {
      const wallHalfThickPx = (0.15 * (plan?.scaleFactor || 100)) / 2;
      snappedPos = {
        x: Math.round((pointerPosition.x - wallHalfThickPx) / baseGridPx) * baseGridPx + wallHalfThickPx,
        y: Math.round((pointerPosition.y - wallHalfThickPx) / baseGridPx) * baseGridPx + wallHalfThickPx
      };
    }

    // 2. Object Snapping (overrides grid if close to a vertex)
    const SNAP_THRESHOLD = 15 / stageTransform.scale;
    let closestDist = SNAP_THRESHOLD;
    
    const checkPoints = (pts: number[]) => {
      for (let i = 0; i < pts.length; i += 2) {
        const vx = pts[i];
        const vy = pts[i + 1];
        const dist = Math.sqrt(Math.pow(pointerPosition.x - vx, 2) + Math.pow(pointerPosition.y - vy, 2));
        if (dist < closestDist) {
          closestDist = dist;
          snappedPos = { x: vx, y: vy };
        }
      }
    };

    const checkSegments = (pts: number[]) => {
      for (let i = 0; i < pts.length - 2; i += 2) {
        const ax = pts[i], ay = pts[i+1];
        const bx = pts[i+2], by = pts[i+3];
        
        const dx = bx - ax;
        const dy = by - ay;
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared === 0) continue;
        
        let t = ((pointerPosition.x - ax) * dx + (pointerPosition.y - ay) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t));
        
        const projX = ax + t * dx;
        const projY = ay + t * dy;
        
        const dist = Math.sqrt(Math.pow(pointerPosition.x - projX, 2) + Math.pow(pointerPosition.y - projY, 2));
        if (dist < closestDist) {
          closestDist = dist;
          snappedPos = { x: projX, y: projY };
        }
      }
    };

    walls.forEach(w => {
      if (w.points) {
        checkSegments(w.points as number[]);
        checkPoints(w.points as number[]);
      }
    });
    
    return snappedPos;
  };

  const handleStageMouseDown = (e: any) => {
    if (tool === 'select' || isShiftDown) {
      setIsPanning(true);
      setLastPanPos({ x: e.evt.clientX, y: e.evt.clientY });
      return;
    }
    
    if (['draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t', 'draw_door', 'draw_window', 'draw_opening', 'draw_sliding_door', 'draw_double_door', 'draw_stairs'].includes(tool)) {
      const stage = e.target.getStage();
      const pointerPosition = stage.getRelativePointerPosition();
      if (pointerPosition) {
        const snappedPos = getSnappedPosition(pointerPosition);
        setCurrentWall([snappedPos.x, snappedPos.y]);
      }
    }
  };

  const handleStageMouseUp = (e: any) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (['draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t', 'draw_door', 'draw_window', 'draw_opening', 'draw_sliding_door', 'draw_double_door', 'draw_stairs'].includes(tool) && currentWall.length === 2) {
      const stage = e.target.getStage();
      const pointerPosition = stage.getRelativePointerPosition();
      if (pointerPosition) {
        const snappedPos = getSnappedPosition(pointerPosition);
        
        const startX = currentWall[0];
        const startY = currentWall[1];
        const endX = snappedPos.x;
        const endY = snappedPos.y;
        
        setCurrentWall([]);
        setCurrentPolygon([]);
        setTool('select');
        
        if (Math.abs(startX - endX) < 5 || Math.abs(startY - endY) < 5) return;
        
        if (['draw_door', 'draw_window', 'draw_opening', 'draw_sliding_door', 'draw_double_door', 'draw_stairs'].includes(tool)) {
          finishElement(tool, startX, startY, endX, endY);
        } else {
          finishWallShape(tool, startX, startY, endX, endY);
        }
      }
    }
  };

  const handleStageMouseLeave = (e: any) => {
    if (isPanning) {
      setIsPanning(false);
    }
  };

  const handleStageMouseMove = (e: any) => {
    if (isPanning) {
      const dx = e.evt.clientX - lastPanPos.x;
      const dy = e.evt.clientY - lastPanPos.y;
      setStageTransform(prev => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy
      }));
      setLastPanPos({ x: e.evt.clientX, y: e.evt.clientY });
      return;
    }

    if (['draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t', 'draw_door', 'draw_window', 'draw_opening', 'draw_sliding_door', 'draw_double_door', 'draw_stairs'].includes(tool) && currentWall.length === 2) {
      const stage = e.target.getStage();
      const pointerPosition = stage.getRelativePointerPosition();
      if (pointerPosition) {
        const snappedPos = getSnappedPosition(pointerPosition);
        const startX = currentWall[0];
        const startY = currentWall[1];
        // Preview polygon for the rect
        setCurrentPolygon([
          startX, startY,
          snappedPos.x, startY,
          snappedPos.x, snappedPos.y,
          startX, snappedPos.y,
          startX, startY
        ]);
      }
      return;
    }

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

    let snapPoint = getSnappedPosition(pointerPosition);

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
                pushHistoryState({ walls, rooms: updatedRooms, points });
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
    let snappedPos = getSnappedPosition(pointerPosition);

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

    if (['draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t', 'draw_door', 'draw_window', 'draw_opening', 'draw_sliding_door', 'draw_double_door', 'draw_stairs'].includes(tool)) {
      return; // handled by mousedown/mouseup
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
      const clickedRoom = rooms.find(r => r.polygonPoints && isPointInPolygon(snappedPos, r.polygonPoints));
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
              canvasX: snappedPos.x,
              canvasY: snappedPos.y
          });
          const newPoints = [...points, newPoint];
          setPoints(newPoints);
          pushHistoryState({ walls, rooms, points: newPoints });
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
      setRooms(prev => {
        const newRooms = [...prev, newRoom];
        pushHistoryState({ walls, rooms: newRooms, points });
        return newRooms;
      });
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar ambiente.');
    }
    
    setCurrentPolygon([]);
    setTool('select');
  };

  const handleAutoRoomDetection = async (currentWalls: OpuraElectricalWall[]) => {
    if (!plan) return;
    const newFaces = detectNewRooms(currentWalls, rooms);
    if (newFaces.length === 0) return;

    const ppm = plan.scaleFactor || 100;
    const newRoomsToCreate: OpuraElectricalRoom[] = [];

    for (let i = 0; i < newFaces.length; i++) {
        const pts = newFaces[i];
        let areaPx = 0;
        let perimeterPx = 0;
        for (let j = 0; j < pts.length - 2; j += 2) {
            const x1 = pts[j]; const y1 = pts[j+1];
            const x2 = pts[j+2]; const y2 = pts[j+3];
            areaPx += (x1 * y2 - x2 * y1);
            perimeterPx += Math.sqrt((x2-x1)**2 + (y2-y1)**2);
        }
        areaPx = Math.abs(areaPx / 2);
        const areaSqm = Number((areaPx / (ppm * ppm)).toFixed(2));
        const perimeterM = Number((perimeterPx / ppm).toFixed(2));

        try {
            const newRoom = await electricalProjectService.createRoom({
                organizationId: organizationId,
                planId: plan.id,
                name: `Ambiente ${rooms.length + newRoomsToCreate.length + 1}`,
                polygonPoints: pts,
                areaSqm,
                perimeterM
            });
            newRoomsToCreate.push(newRoom);
        } catch(err) {
            console.error("Erro ao auto-gerar ambiente:", err);
        }
    }

    if (newRoomsToCreate.length > 0) {
        setRooms(prev => {
            const newRooms = [...prev, ...newRoomsToCreate];
            // Fix history state with the new rooms
            pushHistoryState({ walls: currentWalls, rooms: newRooms, points });
            return newRooms;
        });
        showToast(`${newRoomsToCreate.length} ambiente(s) detectado(s) e criado(s) automaticamente!`, 'success');
    }
  };

  const finishWall = async (overridePts?: number[]) => {
    const rawPts = overridePts || currentWall;
    
    // Clean up consecutive duplicate points created by double-click events
    const pts: number[] = [];
    for (let i = 0; i < rawPts.length; i += 2) {
        if (pts.length > 0) {
            const lastX = pts[pts.length - 2];
            const lastY = pts[pts.length - 1];
            if (Math.abs(rawPts[i] - lastX) < 1 && Math.abs(rawPts[i+1] - lastY) < 1) {
                continue; // Skip duplicate
            }
        }
        pts.push(rawPts[i], rawPts[i+1]);
    }

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
      setWalls(prev => {
        const newWalls = [...prev, newWall];
        pushHistoryState({ walls: newWalls, rooms, points });
        handleAutoRoomDetection(newWalls);
        return newWalls;
      });
    } catch (error) {
      console.error(error);
      showToast('Erro ao salvar parede', 'error');
    }
    
    setCurrentWall([]);
    // Do not set tool to 'select', allow continuous drawing unless they hit Esc
  };

  const finishElement = async (elementType: string, x1: number, y1: number, x2: number, y2: number) => {
    if (!plan) return;
    
    // Convert generic tool name to DB type
    const typeMap: Record<string, string> = {
      'draw_door': 'door',
      'draw_window': 'window',
      'draw_opening': 'opening',
      'draw_sliding_door': 'sliding_door',
      'draw_double_door': 'double_door',
      'draw_stairs': 'stairs'
    };
    
    const dbType = typeMap[elementType];
    if (!dbType) return;

    try {
      const newElement = await electricalProjectService.createElement({
        organizationId: project?.organizationId || organizationId,
        planId: plan.id,
        type: dbType,
        points: [x1, y1, x2, y2]
      });
      
      setElements(prev => [...prev, newElement]);
      setCurrentWall([]);
    } catch (error: any) {
      console.error(error);
      const payload = { organizationId, planId: plan.id, type: dbType, points: [x1, y1, x2, y2] };
      alert('Erro ao salvar o elemento: ' + (error?.message || JSON.stringify(error)) + ' | Payload: ' + JSON.stringify(payload));
    }
  };

  const finishWallShape = async (shapeType: string, x1: number, y1: number, x2: number, y2: number) => {
    if (!plan) return;
    
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const W = maxX - minX;
    const H = maxY - minY;
    
    // Fallback se o tamanho for muito pequeno
    if (W < 10 || H < 10) {
        setCurrentWall([]);
        return;
    }

    const legW = W * 0.4;
    const legH = H * 0.4;

    let segments: number[][] = [];

    if (shapeType === 'draw_wall_rect') {
        segments = [
            [minX, minY, maxX, minY],
            [maxX, minY, maxX, maxY],
            [maxX, maxY, minX, maxY],
            [minX, maxY, minX, minY]
        ];
    } else if (shapeType === 'draw_wall_l') {
        segments = [
            [minX, minY, minX + legW, minY],
            [minX + legW, minY, minX + legW, maxY - legH],
            [minX + legW, maxY - legH, maxX, maxY - legH],
            [maxX, maxY - legH, maxX, maxY],
            [maxX, maxY, minX, maxY],
            [minX, maxY, minX, minY]
        ];
    } else if (shapeType === 'draw_wall_u') {
        segments = [
            [minX, minY, minX + legW, minY],
            [minX + legW, minY, minX + legW, maxY - legH],
            [minX + legW, maxY - legH, maxX - legW, maxY - legH],
            [maxX - legW, maxY - legH, maxX - legW, minY],
            [maxX - legW, minY, maxX, minY],
            [maxX, minY, maxX, maxY],
            [maxX, maxY, minX, maxY],
            [minX, maxY, minX, minY]
        ];
    } else if (shapeType === 'draw_wall_t') {
        const midL = minX + W / 2 - legW / 2;
        const midR = minX + W / 2 + legW / 2;
        segments = [
            [minX, minY, maxX, minY],
            [maxX, minY, maxX, minY + legH],
            [maxX, minY + legH, midR, minY + legH],
            [midR, minY + legH, midR, maxY],
            [midR, maxY, midL, maxY],
            [midL, maxY, midL, minY + legH],
            [midL, minY + legH, minX, minY + legH],
            [minX, minY + legH, minX, minY]
        ];
    }

    try {
        const wallPoints = segments;
        
        const newWalls = await Promise.all(wallPoints.map(pts => 
            electricalProjectService.createWall({
                organizationId: organizationId,
                planId: plan.id,
                points: pts,
                thicknessM: 0.15
            })
        ));
        
        let updatedWalls: OpuraElectricalWall[] = [];
        setWalls(prev => {
            updatedWalls = [...prev, ...newWalls];
            pushHistoryState({ walls: updatedWalls, rooms, points });
            return updatedWalls;
        });
        
        handleAutoRoomDetection(updatedWalls);
        
    } catch (err) {
        console.error(err);
        showToast('Erro ao salvar paredes do retângulo.', 'error');
    }
  };

  const handleRenameRoom = async (roomId: string, newName: string) => {
    try {
      const updated = await electricalProjectService.updateRoom(roomId, { name: newName });
      setRooms(prev => {
        const newRooms = prev.map(r => r.id === roomId ? updated : r);
        pushHistoryState({ walls, rooms: newRooms, points });
        return newRooms;
      });
      showToast('Nome do ambiente atualizado!', 'success');
    } catch(err) {
      console.error(err);
      showToast('Erro ao atualizar nome do ambiente.', 'error');
    }
  };

  const handleUpdateWallThickness = async (wallId: string, thicknessM: number) => {
    if (isNaN(thicknessM) || thicknessM <= 0) return;
    setWalls(prev => {
        const newWalls = prev.map(w => w.id === wallId ? { ...w, thicknessM } : w);
        pushHistoryState({ walls: newWalls, rooms, points });
        return newWalls;
    });
    try {
       await electricalProjectService.updateWall(wallId, { thicknessM });
    } catch(err) {
       console.error(err);
       showToast('Erro ao atualizar espessura', 'error');
    }
  };

  const handleUpdateWallHeight = async (wallId: string, heightM: number) => {
    if (isNaN(heightM) || heightM <= 0) return;
    setWalls(prev => {
        const newWalls = prev.map(w => w.id === wallId ? { ...w, heightM } : w);
        pushHistoryState({ walls: newWalls, rooms, points });
        return newWalls;
    });
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
      setWalls(prev => {
        const newWalls = prev.map(w => w.id === wall.id ? updatedWall : w);
        pushHistoryState({ walls: newWalls, rooms, points });
        handleAutoRoomDetection(newWalls);
        return newWalls;
      });
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

    // --- Vertex Welding Algorithm ---
    // Instead of only moving the selected wall, we propagate the movement 
    // to all connected points across all walls to preserve the shape geometry.
    const newWalls = JSON.parse(JSON.stringify(walls)) as OpuraElectricalWall[];
    const visited = new Set<string>();
    const wallsToUpdateMap = new Map<string, OpuraElectricalWall>();

    // Start by moving the SECOND point of the segment (x2, y2)
    const startPtIndex = startIndex + 2;
    const queue = [{ 
        wId: wall.id, 
        ptIdx: startPtIndex, 
        moveX: diffX, 
        moveY: diffY,
        origX: x2,
        origY: y2
    }];

    while(queue.length > 0) {
        const item = queue.shift()!;
        const { wId, ptIdx, moveX, moveY, origX, origY } = item;
        const stateId = `${wId}-${ptIdx}`;
        if (visited.has(stateId)) continue;
        visited.add(stateId);

        const w = newWalls.find(x => x.id === wId);
        if (!w) continue;
        const wPts = w.points as number[];
        
        // Move the point
        wPts[ptIdx] += moveX;
        wPts[ptIdx+1] += moveY;
        wallsToUpdateMap.set(wId, w);

        // 1. Check adjacent points in the SAME wall
        const checkAdjacent = (adjIndex: number) => {
            if (adjIndex >= 0 && adjIndex < wPts.length) {
                const adjId = `${wId}-${adjIndex}`;
                if (!visited.has(adjId)) {
                    const origWall = walls.find(x => x.id === wId)!;
                    const adjOrigX = origWall.points[adjIndex] as number;
                    const adjOrigY = origWall.points[adjIndex+1] as number;
                    
                    // Is segment vertical and movement horizontal?
                    const isVertical = Math.abs(origX - adjOrigX) < 1;
                    const isHorizMove = Math.abs(moveX) > 0 && Math.abs(moveY) < 1;
                    
                    // Is segment horizontal and movement vertical?
                    const isHorizontal = Math.abs(origY - adjOrigY) < 1;
                    const isVertMove = Math.abs(moveY) > 0 && Math.abs(moveX) < 1;
                    
                    if ((isVertical && isHorizMove) || (isHorizontal && isVertMove)) {
                        queue.push({
                            wId, ptIdx: adjIndex, moveX, moveY,
                            origX: adjOrigX, origY: adjOrigY
                        });
                    }
                }
            }
        };
        
        // If it's a closed wall, the "adjacent" point to the first is the second-to-last, etc.
        const isClosedWall = wPts.length >= 6 && Math.abs(wPts[0] - wPts[wPts.length - 2]) < 1 && Math.abs(wPts[1] - wPts[wPts.length - 1]) < 1;
        
        let prevIdx = ptIdx - 2;
        let nextIdx = ptIdx + 2;
        
        if (isClosedWall) {
            if (ptIdx === 0) prevIdx = wPts.length - 4; // Ignore the duplicate end point
            if (ptIdx === wPts.length - 2) nextIdx = 2; // Wrap around to second point
        }
        
        checkAdjacent(prevIdx);
        checkAdjacent(nextIdx);

        // 2. Find points in OTHER walls that share this exact original coordinate
        for (const otherWall of newWalls) {
            const origOtherWall = walls.find(x => x.id === otherWall.id)!;
            const otherPts = origOtherWall.points as number[];
            for (let i = 0; i < otherPts.length; i += 2) {
                if (otherWall.id === wId && i === ptIdx) continue;
                
                const px = otherPts[i];
                const py = otherPts[i+1];
                if (Math.abs(px - origX) < 1 && Math.abs(py - origY) < 1) {
                    const otherId = `${otherWall.id}-${i}`;
                    if (!visited.has(otherId)) {
                        queue.push({
                            wId: otherWall.id,
                            ptIdx: i,
                            moveX, moveY,
                            origX: px, origY: py
                        });
                    }
                }
            }
        }
    }

    const wallsToUpdate = Array.from(wallsToUpdateMap.values());
    
    // Ensure closed walls maintain their duplicate start/end points
    for (const w of wallsToUpdate) {
        const origW = walls.find(x => x.id === w.id)!;
        const origPts = origW.points as number[];
        const isClosed = origPts.length >= 6 && Math.abs(origPts[0] - origPts[origPts.length - 2]) < 1 && Math.abs(origPts[1] - origPts[origPts.length - 1]) < 1;
        if (isClosed) {
            const wPts = w.points as number[];
            wPts[wPts.length - 2] = wPts[0];
            wPts[wPts.length - 1] = wPts[1];
        }
    }

    // Update local state immediately for fast feedback
    setWalls(prev => {
        const newWalls = prev.map(w => {
            const updated = wallsToUpdate.find(x => x.id === w.id);
            return updated ? updated : w;
        });
        pushHistoryState({ walls: newWalls, rooms, points });
        handleAutoRoomDetection(newWalls);
        return newWalls;
    });

    try {
        await Promise.all(wallsToUpdate.map(w => 
            electricalProjectService.updateWall(w.id, { points: w.points })
        ));
        setEditingSegment(null);
    } catch (err) {
        console.error(err);
        showToast('Erro ao atualizar comprimento', 'error');
    }
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
                  setWalls(prev => {
                      const newWalls = prev.filter(w => w.id !== selectedWallId);
                      pushHistoryState({ walls: newWalls, rooms, points });
                      return newWalls;
                  });
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
          
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            {plan?.fileUrl && (
              <>
                <button
                  onClick={() => setShowBackground(!showBackground)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    showBackground ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {showBackground ? 'Ocultar Planta' : 'Mostrar Planta'}
                </button>
              </>
            )}
            
            <button
              onClick={() => setShowRooms(!showRooms)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${plan?.fileUrl ? 'ml-2' : ''} ${
                showRooms ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
            >
              {showRooms ? 'Ocultar Ambientes' : 'Mostrar Ambientes'}
            </button>
            
            {plan?.fileUrl && (
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
                className="px-2 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-2"
                title="Remover planta importada"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

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
          <Button 
            variant="primary" 
            className="rounded-[1rem]"
            onClick={() => showToast('Seu projeto é salvo automaticamente a cada alteração!', 'success')}
          >
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
                          onClick={() => { setTool('draw_wall_rect'); setCurrentPolygon([]); setCalibrationPoints([]); setCurrentWall([]); }}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                            tool === 'draw_wall_rect' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                          }`}
                          title="Parede (Retângulo)"
                        >
                          <Square className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setTool('draw_wall_l'); setCurrentPolygon([]); setCalibrationPoints([]); setCurrentWall([]); }}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                            tool === 'draw_wall_l' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                          }`}
                          title="Parede (Formato L)"
                        >
                          <div className="font-sans font-extrabold text-lg leading-none" style={{ transform: 'scale(1.2)' }}>L</div>
                        </button>
                        <button
                          onClick={() => { setTool('draw_wall_u'); setCurrentPolygon([]); setCalibrationPoints([]); setCurrentWall([]); }}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                            tool === 'draw_wall_u' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                          }`}
                          title="Parede (Formato U)"
                        >
                          <div className="font-sans font-extrabold text-lg leading-none" style={{ transform: 'scale(1.2)' }}>U</div>
                        </button>
                        <button
                          onClick={() => { setTool('draw_wall_t'); setCurrentPolygon([]); setCalibrationPoints([]); setCurrentWall([]); }}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                            tool === 'draw_wall_t' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                          }`}
                          title="Parede (Formato T)"
                        >
                          <div className="font-sans font-extrabold text-lg leading-none" style={{ transform: 'scale(1.2)' }}>T</div>
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
                        onClick={(e) => {
                          e.preventDefault();
                          if (historyIndex > 0 && !isUndoRedoRef.current) {
                            const newIdx = historyIndex - 1;
                            setHistoryIndex(newIdx);
                            performUndoRedo(history[newIdx]);
                          }
                        }}
                        disabled={historyIndex <= 0}
                        className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
                          historyIndex > 0 ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'
                        }`}
                        title="Desfazer (Ctrl+Z)"
                      >
                        <Undo className="w-5 h-5" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          if (historyIndex < history.length - 1 && !isUndoRedoRef.current) {
                            const newIdx = historyIndex + 1;
                            setHistoryIndex(newIdx);
                            performUndoRedo(history[newIdx]);
                          }
                        }}
                        disabled={historyIndex >= history.length - 1}
                        className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
                          historyIndex < history.length - 1 ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'
                        }`}
                        title="Refazer (Ctrl+Y)"
                      >
                        <Redo className="w-5 h-5" />
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
                        onMouseDown={handleStageMouseDown}
                        onMouseUp={handleStageMouseUp}
                        onMouseLeave={handleStageMouseLeave}
                        onClick={handleStageClick}
                        onMouseMove={handleStageMouseMove}
                        onDblClick={handleStageDblClick}
                          className={['draw_room', 'draw_wall', 'draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t', 'draw_door', 'draw_window', 'draw_opening', 'draw_sliding_door', 'draw_double_door', 'draw_stairs', 'add_point', 'calibrate'].includes(tool) ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}
                        >
                        <Layer>
                          {/* Imagem de Fundo */}
                          {imageObj && showBackground && <KonvaImage image={imageObj} />}
                          
                          {/* 1. Camada de Bordas (Outlines) */}
                          {walls.map(w => {
                            const widthPx = plan?.scaleFactor ? (w.thicknessM || 0.15) * plan.scaleFactor : 10;
                            const pts = w.points as number[];
                            const isClosed = pts.length >= 6 && Math.abs(pts[0] - pts[pts.length - 2]) < 1 && Math.abs(pts[1] - pts[pts.length - 1]) < 1;
                            return (
                                <Line 
                                  key={`outline-${w.id}`}
                                  points={w.points} 
                                  stroke={selectedWallId === w.id ? "#ef4444" : "#1e293b"} 
                                  strokeWidth={widthPx} 
                                  lineCap="square" 
                                  lineJoin="miter" 
                                  closed={isClosed}
                                />
                            );
                          })}

                          {/* Elementos Arquitetonicos */}
                          {elements.map(el => {
                            const pts = el.points as number[];
                            if (!pts || pts.length < 4) return null;
                            const [x1, y1, x2, y2] = pts;
                            const dx = x2 - x1;
                            const dy = y2 - y1;
                            const dist = Math.sqrt(dx*dx + dy*dy);
                            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                            
                            if (el.type === 'door') {
                              // Porta simples
                              return (
                                <Group key={`el-${el.id}`} x={x1} y={y1} rotation={angle}>
                                  <Line points={[0, 0, dist, 0]} stroke="#64748b" strokeWidth={3} />
                                  <Line points={[dist, 0, dist, -dist]} stroke="#64748b" strokeWidth={3} />
                                  <Arc x={dist} y={0} innerRadius={dist} outerRadius={dist} angle={90} rotation={180} stroke="#cbd5e1" strokeWidth={2} dash={[5, 5]} />
                                </Group>
                              );
                            }
                            if (el.type === 'window') {
                              return (
                                <Group key={`el-${el.id}`} x={x1} y={y1} rotation={angle}>
                                  <Rect x={0} y={-10} width={dist} height={20} stroke="#3b82f6" strokeWidth={2} fill="#eff6ff" />
                                  <Line points={[0, 0, dist, 0]} stroke="#3b82f6" strokeWidth={1} />
                                </Group>
                              );
                            }
                            if (el.type === 'opening') {
                              return (
                                <Line key={`el-${el.id}`} points={[x1, y1, x2, y2]} stroke="#cbd5e1" strokeWidth={15} dash={[10, 10]} />
                              );
                            }
                            if (el.type === 'stairs') {
                              // Multiple parallel lines
                              const steps = Math.floor(dist / 30);
                              const stepLines = [];
                              for (let i = 0; i <= steps; i++) {
                                const stepX = i * 30;
                                if (stepX <= dist) {
                                  stepLines.push(<Line key={`step-${i}`} points={[stepX, -40, stepX, 40]} stroke="#94a3b8" strokeWidth={2} />);
                                }
                              }
                              return (
                                <Group key={`el-${el.id}`} x={x1} y={y1} rotation={angle}>
                                  <Rect x={0} y={-40} width={dist} height={80} stroke="#64748b" strokeWidth={2} />
                                  {stepLines}
                                </Group>
                              );
                            }
                            return null;
                          })}
                          
                          {/* 2. Camada de Preenchimentos (Fills) */}
                          {walls.map(w => {
                            const widthPx = plan?.scaleFactor ? (w.thicknessM || 0.15) * plan.scaleFactor : 10;
                            const pts = w.points as number[];
                            const isClosed = pts.length >= 6 && Math.abs(pts[0] - pts[pts.length - 2]) < 1 && Math.abs(pts[1] - pts[pts.length - 1]) < 1;
                            return (
                                <Line 
                                  key={`fill-${w.id}`}
                                  points={w.points} 
                                  stroke="#ffffff" 
                                  strokeWidth={Math.max(1, widthPx - 4)} 
                                  lineCap="square" 
                                  lineJoin="miter" 
                                  closed={isClosed}
                                  onPointerDown={(e) => {
                                    if (tool === 'select') {
                                      e.cancelBubble = true;
                                      setSelectedWallId(w.id);
                                      setSelectedPointId(null);
                                      setSelectedPoint(null);
                                    }
                                  }}
                                  onMouseEnter={(e) => {
                                    if (tool === 'select') {
                                      const stage = e.target.getStage();
                                      if (stage) stage.container().style.cursor = 'pointer';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (tool === 'select') {
                                      const stage = e.target.getStage();
                                      if (stage) stage.container().style.cursor = 'default';
                                    }
                                  }}
                                />
                            );
                          })}
                          
                          {/* Removed preview from here to separate layer */}
                          
                          {showRooms && rooms.map((room) => {
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
                              <Group 
                                key={room.id}
                                onDblClick={(e) => {
                                  e.cancelBubble = true;
                                  if (tool === 'select') {
                                    const newName = prompt('Novo nome para o ambiente:', room.name);
                                    if (newName && newName !== room.name) {
                                      handleRenameRoom(room.id, newName);
                                    }
                                  }
                                }}
                                onMouseEnter={(e) => {
                                  if (tool === 'select') {
                                    const container = e.target.getStage()?.container();
                                    if (container) container.style.cursor = 'text';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (tool === 'select') {
                                    const container = e.target.getStage()?.container();
                                    if (container) container.style.cursor = 'default';
                                  }
                                }}
                              >
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
                                  strokeWidth={Math.max(1, (plan?.scaleFactor ? 0.15 * plan.scaleFactor : 10) - 4)} 
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
                      setPoints(prev => {
                          const newPoints = prev.map(p => p.id === selectedPointId ? updated : p);
                          pushHistoryState({ walls, rooms, points: newPoints });
                          return newPoints;
                      });
                  } catch (err) {
                      alert('Erro ao atualizar ponto.');
                  }
                }}
                onDelete={async () => {
                  try {
                      await electricalProjectService.deletePoint(selectedPointId);
                      setPoints(prev => {
                          const newPoints = prev.filter(p => p.id !== selectedPointId);
                          pushHistoryState({ walls, rooms, points: newPoints });
                          return newPoints;
                      });
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
                        setRooms(prev => {
                            const newRooms = prev.filter(r => r.id !== id);
                            pushHistoryState({ walls, rooms: newRooms, points });
                            return newRooms;
                        });
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
