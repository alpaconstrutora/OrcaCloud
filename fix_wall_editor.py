import re

file_path = r"c:\D\ORÇACLOUD\orçacloud-saas\components\electrical\ElectricalEditorView.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()


# 1. Update handleStageDblClick
dblclick_old = """  const handleStageDblClick = (e: any) => {
    if (tool === 'draw_wall') {
      finishWall();
    }
  };"""
dblclick_new = """  const handleStageDblClick = (e: any) => {
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
  };"""
content = content.replace(dblclick_old, dblclick_new)


# 2. Update finishPolygon
finish_poly_old = """  const finishPolygon = async () => {
    if (currentPolygon.length < 6) {"""
finish_poly_new = """  const finishPolygon = async (overridePts?: number[]) => {
    const pts = overridePts || currentPolygon;
    if (pts.length < 6) {"""
content = content.replace(finish_poly_old, finish_poly_new)

poly_var_old = """    const pts = currentPolygon;"""
poly_var_new = """    // const pts = currentPolygon; // replaced by param"""
content = content.replace(poly_var_old, poly_var_new)

poly_save_old = """        polygonPoints: currentPolygon,"""
poly_save_new = """        polygonPoints: pts,"""
content = content.replace(poly_save_old, poly_save_new)


# 3. Update finishWall
finish_wall_old = """  const finishWall = async () => {
    if (currentWall.length < 4) {"""
finish_wall_new = """  const finishWall = async (overridePts?: number[]) => {
    const pts = overridePts || currentWall;
    if (pts.length < 4) {"""
content = content.replace(finish_wall_old, finish_wall_new)

wall_save_old = """        points: currentWall,"""
wall_save_new = """        points: pts,"""
content = content.replace(wall_save_old, wall_save_new)


# 4. Add handleUpdateWallThickness
thickness_insert_old = """  const handleSegmentLengthSave = async (wallId: string, startIndex: number, newLengthStr: string) => {"""
thickness_insert_new = """  const handleUpdateWallThickness = async (wallId: string, thicknessM: number) => {
    if (isNaN(thicknessM) || thicknessM <= 0) return;
    setWalls(prev => prev.map(w => w.id === wallId ? { ...w, thicknessM } : w));
    try {
       await electricalProjectService.updateWall(wallId, { thicknessM });
    } catch(err) {
       console.error(err);
       showToast('Erro ao atualizar espessura', 'error');
    }
  };

  const handleSegmentLengthSave = async (wallId: string, startIndex: number, newLengthStr: string) => {"""
content = content.replace(thickness_insert_old, thickness_insert_new)


# 5. Add Thickness UI near toolbars
ui_insert_old = """                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white p-2 rounded-xl shadow-lg border border-slate-200 z-10">"""
ui_insert_new = """                    {selectedWallId && tool === 'select' && (
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
                        <button
                          onClick={() => setSelectedWallId(null)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
                          title="Deselecionar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white p-2 rounded-xl shadow-lg border border-slate-200 z-10">"""
content = content.replace(ui_insert_old, ui_insert_new)


with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done")
