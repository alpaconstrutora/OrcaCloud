import re

with open('components/electrical/PointToolbox.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Tool type inside PointToolbox
type_old = "tool: 'select' | 'draw_room' | 'add_point' | 'calibrate' | 'draw_wall' | 'draw_wall_rect' | 'draw_wall_l' | 'draw_wall_u' | 'draw_wall_t';"
type_new = "tool: 'select' | 'draw_room' | 'add_point' | 'calibrate' | 'draw_wall' | 'draw_wall_rect' | 'draw_wall_l' | 'draw_wall_u' | 'draw_wall_t' | 'draw_door' | 'draw_window' | 'draw_opening' | 'draw_sliding_door' | 'draw_double_door' | 'draw_stairs';"
content = content.replace(type_old, type_new)

type_old_set = "setTool: (tool: 'select' | 'draw_room' | 'add_point' | 'calibrate' | 'draw_wall' | 'draw_wall_rect' | 'draw_wall_l' | 'draw_wall_u' | 'draw_wall_t') => void;"
type_new_set = "setTool: (tool: 'select' | 'draw_room' | 'add_point' | 'calibrate' | 'draw_wall' | 'draw_wall_rect' | 'draw_wall_l' | 'draw_wall_u' | 'draw_wall_t' | 'draw_door' | 'draw_window' | 'draw_opening' | 'draw_sliding_door' | 'draw_double_door' | 'draw_stairs') => void;"
content = content.replace(type_old_set, type_new_set)

# 2. Add imports for new icons
imports_old = "import { Zap, Triangle, Square, Circle, Plus, Router } from 'lucide-react';"
imports_new = "import { Zap, Triangle, Square, Circle, Plus, Router, DoorClosed, LayoutPanelTop, Blinds, ArrowRightLeft, AlignVerticalSpaceAround, ArrowUpToLine } from 'lucide-react';"
content = content.replace(imports_old, imports_new)

# 3. Add Architectural Elements UI
arch_ui = """

            {/* Architectural Elements */}
            <div className="pt-2 border-t border-slate-200 mt-2">
                <div className="text-xs font-bold text-slate-400 uppercase mb-2 px-1">Arquitetura</div>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => { setTool('draw_door'); onSelectToolboxItem(null); }}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${tool === 'draw_door' ? 'bg-blue-100 text-blue-600 border border-blue-200 shadow-inner' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                        title="Desenhar Porta"
                    >
                        <DoorClosed className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => { setTool('draw_window'); onSelectToolboxItem(null); }}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${tool === 'draw_window' ? 'bg-blue-100 text-blue-600 border border-blue-200 shadow-inner' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                        title="Desenhar Janela"
                    >
                        <LayoutPanelTop className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => { setTool('draw_opening'); onSelectToolboxItem(null); }}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${tool === 'draw_opening' ? 'bg-blue-100 text-blue-600 border border-blue-200 shadow-inner' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                        title="Desenhar Vão/Abertura"
                    >
                        <AlignVerticalSpaceAround className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => { setTool('draw_sliding_door'); onSelectToolboxItem(null); }}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${tool === 'draw_sliding_door' ? 'bg-blue-100 text-blue-600 border border-blue-200 shadow-inner' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                        title="Porta de Correr"
                    >
                        <ArrowRightLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => { setTool('draw_stairs'); onSelectToolboxItem(null); }}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${tool === 'draw_stairs' ? 'bg-blue-100 text-blue-600 border border-blue-200 shadow-inner' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                        title="Desenhar Escada"
                    >
                        <ArrowUpToLine className="w-5 h-5" />
                    </button>
                </div>
            </div>
"""

insert_pos = content.find("</div>\n        </div>\n    );\n}")
if insert_pos != -1:
    content = content[:insert_pos] + arch_ui + content[insert_pos:]

with open('components/electrical/PointToolbox.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
