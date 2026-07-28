import re

with open('components/electrical/ElectricalEditorView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Locate the button for draw_wall_rect
old_buttons = """                        <button
                          onClick={() => { setTool('draw_wall_rect'); setCurrentPolygon([]); setCalibrationPoints([]); setCurrentWall([]); }}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                            tool === 'draw_wall_rect' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                          }`}
                          title="Desenhar Parede em Retângulo (Arrastar)"
                        >
                          <Square className="w-4 h-4" />
                        </button>"""

new_buttons = """                        <button
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
                        </button>"""

if old_buttons in content:
    content = content.replace(old_buttons, new_buttons)
else:
    print("Could not find the button for draw_wall_rect.")

with open('components/electrical/ElectricalEditorView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
