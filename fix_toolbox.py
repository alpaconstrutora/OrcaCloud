import re
with open('components/electrical/PointToolbox.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

arch_ui = """            </div>
            
            {/* Architectural Elements */}
            <div className="pt-4 border-t border-slate-200 mt-4">
                <div className="text-xs font-bold text-slate-400 uppercase mb-3 px-1">Arquitetura</div>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => { setTool('draw_door'); if(onSelectToolboxItem) onSelectToolboxItem(null); }}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${tool === 'draw_door' ? 'bg-blue-100 text-blue-600 border border-blue-200 shadow-inner' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                        title="Desenhar Porta"
                    >
                        <DoorClosed className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => { setTool('draw_window'); if(onSelectToolboxItem) onSelectToolboxItem(null); }}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${tool === 'draw_window' ? 'bg-blue-100 text-blue-600 border border-blue-200 shadow-inner' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                        title="Desenhar Janela"
                    >
                        <LayoutPanelTop className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => { setTool('draw_opening'); if(onSelectToolboxItem) onSelectToolboxItem(null); }}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${tool === 'draw_opening' ? 'bg-blue-100 text-blue-600 border border-blue-200 shadow-inner' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                        title="Desenhar Vão/Abertura"
                    >
                        <AlignVerticalSpaceAround className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => { setTool('draw_sliding_door'); if(onSelectToolboxItem) onSelectToolboxItem(null); }}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${tool === 'draw_sliding_door' ? 'bg-blue-100 text-blue-600 border border-blue-200 shadow-inner' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                        title="Porta de Correr"
                    >
                        <ArrowRightLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => { setTool('draw_stairs'); if(onSelectToolboxItem) onSelectToolboxItem(null); }}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${tool === 'draw_stairs' ? 'bg-blue-100 text-blue-600 border border-blue-200 shadow-inner' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                        title="Desenhar Escada"
                    >
                        <ArrowUpToLine className="w-5 h-5" />
                    </button>
                </div>
            </div>"""

if "Arquitetura" not in content:
    content = content.replace("</div>\n            \n            {tool === 'add_point'", arch_ui + "\n            \n            {tool === 'add_point'")
    
    with open('components/electrical/PointToolbox.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
