import re

file_path = 'components/electrical/ElectricalEditorView.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add ConduitPropertiesSidebar Import
if "import ConduitPropertiesSidebar" not in content:
    content = content.replace("import PointPropertiesSidebar from './PointPropertiesSidebar';", "import PointPropertiesSidebar from './PointPropertiesSidebar';\nimport ConduitPropertiesSidebar from './ConduitPropertiesSidebar';")

# 2. Add ConduitPropertiesSidebar to the UI
# We need to find the Right Sidebar logic
# It currently is:
#             <div className="w-80 bg-white border-l border-slate-200 shadow-xl z-10 flex flex-col">
#               {selectedPointId && points.find(p => p.id === selectedPointId) ? (
#                 <PointPropertiesSidebar

old_sidebar = """            <div className="w-80 bg-white border-l border-slate-200 shadow-xl z-10 flex flex-col">
              {selectedPointId && points.find(p => p.id === selectedPointId) ? (
                <PointPropertiesSidebar"""

new_sidebar = """            <div className="w-80 bg-white border-l border-slate-200 shadow-xl z-10 flex flex-col">
              {selectedPointId && points.find(p => p.id === selectedPointId) ? (
                <PointPropertiesSidebar"""

# Wait, let's just replace the `{selectedPointId ...` with a nested ternary
old_sidebar_full = """            <div className="w-80 bg-white border-l border-slate-200 shadow-xl z-10 flex flex-col">
              {selectedPointId && points.find(p => p.id === selectedPointId) ? (
                <PointPropertiesSidebar"""

new_sidebar_full = """            <div className="w-80 bg-white border-l border-slate-200 shadow-xl z-10 flex flex-col">
              {selectedConduitId && conduits.find(c => c.id === selectedConduitId) ? (
                <ConduitPropertiesSidebar
                  conduit={conduits.find(c => c.id === selectedConduitId)!}
                  onUpdate={async (updates) => {
                    try {
                        const updated = await electricalProjectService.updateConduit(selectedConduitId, updates);
                        setConduits(prev => {
                            const newConduits = prev.map(c => c.id === selectedConduitId ? updated : c);
                            pushHistoryState({ conduits: newConduits });
                            return newConduits;
                        });
                        showToast('Eletroduto atualizado com sucesso!', 'success');
                    } catch (err) {
                        showToast('Erro ao atualizar eletroduto.', 'error');
                    }
                  }}
                  onDelete={async () => {
                    try {
                        await electricalProjectService.deleteConduit(selectedConduitId);
                        setConduits(prev => {
                            const newConduits = prev.filter(c => c.id !== selectedConduitId);
                            pushHistoryState({ conduits: newConduits });
                            return newConduits;
                        });
                        setSelectedConduitId(null);
                        showToast('Eletroduto excluído com sucesso!', 'success');
                    } catch (err) {
                        showToast('Erro ao excluir eletroduto.', 'error');
                    }
                  }}
                  onClose={() => setSelectedConduitId(null)}
                />
              ) : selectedPointId && points.find(p => p.id === selectedPointId) ? (
                <PointPropertiesSidebar"""

content = content.replace(old_sidebar_full, new_sidebar_full)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch 3 script executed!")
