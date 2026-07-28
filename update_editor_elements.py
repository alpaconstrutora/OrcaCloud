import re

with open('components/electrical/ElectricalEditorView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Tool type
type_old = "type Tool = 'select' | 'draw_room' | 'add_point' | 'calibrate' | 'draw_wall' | 'draw_wall_rect' | 'draw_wall_l' | 'draw_wall_u' | 'draw_wall_t';"
type_new = "type Tool = 'select' | 'draw_room' | 'add_point' | 'calibrate' | 'draw_wall' | 'draw_wall_rect' | 'draw_wall_l' | 'draw_wall_u' | 'draw_wall_t' | 'draw_door' | 'draw_window' | 'draw_opening' | 'draw_sliding_door' | 'draw_double_door' | 'draw_stairs';"
content = content.replace(type_old, type_new)

# 2. Add elements state
state_old = "const [points, setPoints] = useState<OpuraElectricalPoint[]>([]);"
state_new = """const [points, setPoints] = useState<OpuraElectricalPoint[]>([]);
  const [elements, setElements] = useState<any[]>([]);"""
content = content.replace(state_old, state_new)

# 3. Add to loadActiveLayerData
load_old = """const fetchedPoints = await electricalProjectService.listPointsByPlan(activePlanId);
        setPoints(fetchedPoints);"""
load_new = """const fetchedPoints = await electricalProjectService.listPointsByPlan(activePlanId);
        setPoints(fetchedPoints);
        const fetchedElements = await electricalProjectService.listElementsByPlan(activePlanId);
        setElements(fetchedElements);"""
content = content.replace(load_old, load_new)

# 4. Add to clear state in loadActiveLayerData
clear_old = """setWalls([]);
      setRooms([]);
      setPoints([]);"""
clear_new = """setWalls([]);
      setRooms([]);
      setPoints([]);
      setElements([]);"""
content = content.replace(clear_old, clear_new)

# 5. Handle mouse up for new tools
mouseup_old = """if (['draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t'].includes(tool) && currentWall.length === 2) {
      finishWallShape(tool, currentWall[0], currentWall[1], snappedPos.x, snappedPos.y);
      return;
    }"""
mouseup_new = """if (['draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t'].includes(tool) && currentWall.length === 2) {
      finishWallShape(tool, currentWall[0], currentWall[1], snappedPos.x, snappedPos.y);
      return;
    }

    if (['draw_door', 'draw_window', 'draw_opening', 'draw_sliding_door', 'draw_double_door', 'draw_stairs'].includes(tool) && currentWall.length === 2) {
      finishElement(tool, currentWall[0], currentWall[1], snappedPos.x, snappedPos.y);
      return;
    }"""
content = content.replace(mouseup_old, mouseup_new)

# 6. Handle mouse down for new tools
mousedown_old = "if (['draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t'].includes(tool)) {"
mousedown_new = "if (['draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t', 'draw_door', 'draw_window', 'draw_opening', 'draw_sliding_door', 'draw_double_door', 'draw_stairs'].includes(tool)) {"
content = content.replace(mousedown_old, mousedown_new)

# 7. Add finishElement function
finish_shape_func = """const finishWallShape = async (shapeType: string, x1: number, y1: number, x2: number, y2: number) => {"""
finish_element_code = """const finishElement = async (elementType: string, x1: number, y1: number, x2: number, y2: number) => {
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
        organizationId: organizationId,
        planId: plan.id,
        type: dbType,
        points: [x1, y1, x2, y2]
      });
      
      setElements(prev => [...prev, newElement]);
      setCurrentWall([]);
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar o elemento.');
    }
  };

  """
content = content.replace(finish_shape_func, finish_element_code + finish_shape_func)

# 8. Render elements inside <Layer>
layer_end = "{/* 2. Camada de Preenchimentos (Fills) */}"
render_elements = """{/* Elementos Arquitetonicos */}
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
                          
                          """
content = content.replace(layer_end, render_elements + layer_end)

# 9. Cursor classes
cursor_old = "['draw_room', 'draw_wall', 'draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t', 'add_point', 'calibrate']"
cursor_new = "['draw_room', 'draw_wall', 'draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t', 'draw_door', 'draw_window', 'draw_opening', 'draw_sliding_door', 'draw_double_door', 'draw_stairs', 'add_point', 'calibrate']"
content = content.replace(cursor_old, cursor_new)

with open('components/electrical/ElectricalEditorView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
