import re

with open('components/electrical/ElectricalEditorView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_mouseup = """if (tool === 'draw_wall_rect' && currentWall.length === 2) {
      finishWallRect(currentWall[0], currentWall[1], snappedPos.x, snappedPos.y);
      return;
    }"""
new_mouseup = """if (['draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t'].includes(tool) && currentWall.length === 2) {
      finishWallShape(tool, currentWall[0], currentWall[1], snappedPos.x, snappedPos.y);
      return;
    }"""
content = content.replace(old_mouseup, new_mouseup)

old_mousedown = "if (tool === 'draw_wall_rect') {"
new_mousedown = "if (['draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t'].includes(tool)) {"
content = content.replace(old_mousedown, new_mousedown)

old_finish = """  const finishWallRect = async (x1: number, y1: number, x2: number, y2: number) => {
    if (!plan) return;
    
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    
    try {
        const wallPoints = [
            [minX, minY, maxX, minY],
            [maxX, minY, maxX, maxY],
            [maxX, maxY, minX, maxY],
            [minX, maxY, minX, minY]
        ];"""
new_finish = """  const finishWallShape = async (shapeType: string, x1: number, y1: number, x2: number, y2: number) => {
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
        const wallPoints = segments;"""
content = content.replace(old_finish, new_finish)

old_cursor = "className={tool === 'draw_room' || tool === 'draw_wall' || tool === 'draw_wall_rect' || tool === 'add_point' || tool === 'calibrate' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}"
new_cursor = "className={['draw_room', 'draw_wall', 'draw_wall_rect', 'draw_wall_l', 'draw_wall_u', 'draw_wall_t', 'add_point', 'calibrate'].includes(tool) ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}"
content = content.replace(old_cursor, new_cursor)

with open('components/electrical/ElectricalEditorView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
