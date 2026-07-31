import re

file_path = 'components/electrical/ElectricalEditorView.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "OpuraElectricalPoint, OpuraElectricalWall } from '../../types/electrical';",
    "OpuraElectricalPoint, OpuraElectricalWall, OpuraElectricalConduit, WireAnnotation } from '../../types/electrical';"
)

# 2. CanvasState
content = content.replace(
    "export interface CanvasState {\n  walls: OpuraElectricalWall[];\n  rooms: OpuraElectricalRoom[];\n  points: OpuraElectricalPoint[];\n}",
    "export interface CanvasState {\n  walls: OpuraElectricalWall[];\n  rooms: OpuraElectricalRoom[];\n  points: OpuraElectricalPoint[];\n  elements: any[];\n  conduits: OpuraElectricalConduit[];\n}"
)

# 3. State
content = content.replace(
    "const [elements, setElements] = useState<any[]>([]);\n\n  // Undo/Redo State",
    "const [elements, setElements] = useState<any[]>([]);\n  const [conduits, setConduits] = useState<OpuraElectricalConduit[]>([]);\n  const [drawingConduitSource, setDrawingConduitSource] = useState<string | null>(null);\n  const [selectedConduitId, setSelectedConduitId] = useState<string | null>(null);\n\n  // Undo/Redo State"
)

# 4. pushHistoryState
old_push = """  const pushHistoryState = (newState: CanvasState) => {
    isUndoRedoRef.current = false;
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      next.push(newState);
      // Keep only last 50 states to prevent memory issues
      if (next.length > 50) {
        return next.slice(next.length - 50);
      }
      return next;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  };"""

new_push = """  const pushHistoryState = (newState: Partial<CanvasState>) => {
    isUndoRedoRef.current = false;
    const fullState: CanvasState = {
      walls: newState.walls || walls,
      rooms: newState.rooms || rooms,
      points: newState.points || points,
      elements: newState.elements || elements,
      conduits: newState.conduits || conduits,
    };
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      next.push(fullState);
      // Keep only last 50 states to prevent memory issues
      if (next.length > 50) {
        return next.slice(next.length - 50);
      }
      return next;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  };"""
content = content.replace(old_push, new_push)

# 5. UndoRedo apply
old_undo = """  const performUndoRedo = (state: CanvasState) => {
    isUndoRedoRef.current = true;
    setWalls(state.walls);
    setRooms(state.rooms);
    setPoints(state.points);
    // Let the current effect finish, then reset flag
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 10);
  };"""

new_undo = """  const performUndoRedo = (state: CanvasState) => {
    isUndoRedoRef.current = true;
    setWalls(state.walls || []);
    setRooms(state.rooms || []);
    setPoints(state.points || []);
    setElements(state.elements || []);
    setConduits(state.conduits || []);
    // Let the current effect finish, then reset flag
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 10);
  };"""
content = content.replace(old_undo, new_undo)

# 6. loadActiveLayerData
old_load = """            let initialPoints: OpuraElectricalPoint[] = [];
            if (r.length > 0) {
              initialPoints = await electricalProjectService.listPointsByRooms(r.map(room => room.id));
              setPoints(initialPoints);
            } else {
              setPoints([]);
            }
            
            setHistory([{ walls: w, rooms: r, points: initialPoints }]);"""

new_load = """            let initialPoints: OpuraElectricalPoint[] = [];
            if (r.length > 0) {
              initialPoints = await electricalProjectService.listPointsByRooms(r.map(room => room.id));
              setPoints(initialPoints);
            } else {
              setPoints([]);
            }
            
            const e = await electricalProjectService.getElements(p.id);
            setElements(e || []);
            
            const c = await electricalProjectService.getConduitsByPlan(p.id);
            setConduits(c || []);
            
            setHistory([{ walls: w, rooms: r, points: initialPoints, elements: e || [], conduits: c || [] }]);"""
content = content.replace(old_load, new_load)

# 7. clear state on unmount or null plan
old_clear = """      if (!activePlanId) {
        setWalls([]);
        setRooms([]);
        setPoints([]);
        setElements([]);
        setImageObj(null);
        return;
      }"""

new_clear = """      if (!activePlanId) {
        setWalls([]);
        setRooms([]);
        setPoints([]);
        setElements([]);
        setConduits([]);
        setImageObj(null);
        return;
      }"""
content = content.replace(old_clear, new_clear)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch script executed!")
