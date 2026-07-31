import re

file_path = 'components/electrical/ElectricalEditorView.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add ConduitRenderer Import
import_str = "import ConduitRenderer from './ConduitRenderer';\n"
if "import ConduitRenderer" not in content:
    content = content.replace("import PointPropertiesSidebar from './PointPropertiesSidebar';", "import PointPropertiesSidebar from './PointPropertiesSidebar';\n" + import_str)

# 2. Add conduits render block right before {points.map(p => {
conduit_render_block = """
                            {/* Eletrodutos */}
                            {conduits.map(c => (
                              <ConduitRenderer 
                                key={c.id} 
                                conduit={c} 
                                points={points} 
                                isSelected={selectedConduitId === c.id} 
                                onSelect={(e) => {
                                  if (tool === 'select') {
                                    e.cancelBubble = true;
                                    setSelectedConduitId(c.id);
                                    setSelectedPointId(null);
                                    setSelectedWallId(null);
                                  }
                                }} 
                                scaleFactor={plan?.scaleFactor || 100} 
                              />
                            ))}
                            
                            {/* Eletroduto Preview */}
                            {tool === 'draw_conduit' && drawingConduitSource && (
                                <Line 
                                  ref={wallPreviewRef}
                                  points={[]}
                                  stroke="#f59e0b" // amber-500
                                  strokeWidth={2}
                                  dash={[5, 5]}
                                />
                            )}
"""
if "ConduitRenderer" not in content.split("{/* Pontos Elétricos */}")[0] and "{/* Pontos Elétricos */}" in content:
    content = content.replace("{/* Pontos Elétricos */}", conduit_render_block + "\n                            {/* Pontos Elétricos */}")
elif "ConduitRenderer" not in content:
    # Let's search for points.map and insert before it
    content = content.replace("{points.map(p => {", conduit_render_block + "\n                            {points.map(p => {")

# 3. Handle point click to draw conduit
# We need to find the point onClick handler.
old_point_click = """                                        onPointerDown={(e) => {
                                          if (tool === 'select') {
                                            e.cancelBubble = true;
                                            setSelectedPointId(p.id);
                                            setSelectedPoint(p);
                                            setSelectedWallId(null);
                                          }
                                        }}"""

new_point_click = """                                        onPointerDown={async (e) => {
                                          if (tool === 'select') {
                                            e.cancelBubble = true;
                                            setSelectedPointId(p.id);
                                            setSelectedPoint(p);
                                            setSelectedWallId(null);
                                            setSelectedConduitId(null);
                                          } else if (tool === 'draw_conduit') {
                                            e.cancelBubble = true;
                                            if (!drawingConduitSource) {
                                              setDrawingConduitSource(p.id);
                                            } else if (drawingConduitSource !== p.id) {
                                              try {
                                                const nc = await electricalProjectService.createConduit(plan!.id, drawingConduitSource, p.id);
                                                const newConduits = [...conduits, nc];
                                                setConduits(newConduits);
                                                pushHistoryState({ conduits: newConduits });
                                                setDrawingConduitSource(null);
                                                showToast('Eletroduto criado!');
                                              } catch(err) {
                                                showToast('Erro ao criar eletroduto', 'error');
                                              }
                                            }
                                          }
                                        }}"""
content = content.replace(old_point_click, new_point_click)

# 4. Handle stage click to cancel draw_conduit or select
old_stage_click = """        if (tool === 'select') {
          setSelectedWallId(null);
          setSelectedPointId(null);
          setSelectedPoint(null);
        } else if (tool === 'add_point' && selectedToolboxItem) {"""

new_stage_click = """        if (tool === 'select') {
          setSelectedWallId(null);
          setSelectedPointId(null);
          setSelectedPoint(null);
          setSelectedConduitId(null);
        } else if (tool === 'draw_conduit') {
          // Clique no vazio cancela a seleção
          setDrawingConduitSource(null);
        } else if (tool === 'add_point' && selectedToolboxItem) {"""
content = content.replace(old_stage_click, new_stage_click)

# 5. Handle mouse move to update preview
# wallPreviewRef is reused for conduit preview
old_mouse_move = """        if (tool === 'draw_wall' && currentWall.length > 0 && wallPreviewRef.current) {
          const pos = stage.getRelativePointerPosition();
          if (pos) {
            let pts = [...currentWall];
            const isRectOrL = ['draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t'].includes(tool);"""

new_mouse_move = """        if (tool === 'draw_conduit' && drawingConduitSource && wallPreviewRef.current) {
          const pos = stage.getRelativePointerPosition();
          if (pos) {
             const source = points.find(p => p.id === drawingConduitSource);
             if (source && source.canvasX != null && source.canvasY != null && plan) {
               const sx = source.canvasX * plan.scaleFactor;
               const sy = source.canvasY * plan.scaleFactor;
               const tx = pos.x;
               const ty = pos.y;
               
               const dx = tx - sx;
               const dy = ty - sy;
               const length = Math.sqrt(dx*dx + dy*dy);
               if (length > 0) {
                 const nx = -dy / length;
                 const ny = dx / length;
                 const offset = length * 0.15;
                 const cx = sx + dx/2 + nx * offset;
                 const cy = sy + dy/2 + ny * offset;
                 
                 const previewLine = wallPreviewRef.current as any;
                 previewLine.points([sx, sy, cx, cy, tx, ty]);
                 previewLine.tension(0.5);
               }
             }
          }
        } else if (tool === 'draw_wall' && currentWall.length > 0 && wallPreviewRef.current) {
          const pos = stage.getRelativePointerPosition();
          if (pos) {
            let pts = [...currentWall];
            const isRectOrL = ['draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t'].includes(tool);"""
content = content.replace(old_mouse_move, new_mouse_move)


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch 2 script executed!")
