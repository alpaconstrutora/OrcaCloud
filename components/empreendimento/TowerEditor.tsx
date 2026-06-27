// components/empreendimento/TowerEditor.tsx
import React from 'react';
import { Plus, Trash2, Loader2, Building, Link2, HardHat, ChevronRight } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import { useStore } from '../../store/useStore';
import { EmpreendimentoTower, EmpreendimentoTowerInsert } from '../../types';
import UnitEditor from './UnitEditor';

interface Props {
  empreendimentoId: string;
  organizationId: string;
}

export const TowerEditor: React.FC<Props> = ({ empreendimentoId, organizationId }) => {
  const { projects } = useStore();
  const [towers, setTowers] = React.useState<EmpreendimentoTower[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ name: '', floors_count: '', units_per_floor: '' });

  // Obras da organização disponíveis para vínculo
  const orgProjects = React.useMemo(() => projects.filter(p => {
    const s: any = p.settings || {};
    return s.classification === 'OBRA' && (!organizationId || s.organizationId === organizationId);
  }), [projects, organizationId]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setTowers(await empreendimentoService.listTowers(empreendimentoId));
    } catch (err) {
      console.error('[TowerEditor] erro ao carregar torres:', err);
    } finally {
      setLoading(false);
    }
  }, [empreendimentoId]);

  React.useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { alert('Informe o nome da torre/bloco.'); return; }
    setSaving(true);
    try {
      const payload: EmpreendimentoTowerInsert = {
        empreendimento_id: empreendimentoId,
        name: form.name.trim(),
        floors_count: form.floors_count ? Number(form.floors_count) : undefined,
        units_per_floor: form.units_per_floor ? Number(form.units_per_floor) : undefined,
        sort_order: towers.length,
      };
      await empreendimentoService.createTower(payload);
      setForm({ name: '', floors_count: '', units_per_floor: '' });
      await load();
    } catch (err: any) {
      alert(`Erro ao adicionar torre: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tower: EmpreendimentoTower) => {
    if (!window.confirm(`Excluir a torre "${tower.name}" e todas as suas unidades?`)) return;
    try {
      await empreendimentoService.deleteTower(tower.id);
      setTowers(prev => prev.filter(t => t.id !== tower.id));
    } catch (err: any) {
      alert(`Erro ao excluir torre: ${err.message}`);
    }
  };

  const handleLinkObra = async (tower: EmpreendimentoTower, projectId: string) => {
    if (!projectId) return;
    if (orgProjects.some(p => p.id === projectId && towers.some(t => t.id !== tower.id && t.project_id === projectId))) {
      if (!window.confirm('Esta obra já está vinculada a outra torre. Deseja vincular mesmo assim?')) return;
    }
    try {
      await empreendimentoService.linkTowerToObra(tower.id, projectId);
      setTowers(prev => prev.map(t => t.id === tower.id ? { ...t, project_id: projectId } : t));
    } catch (err: any) {
      alert(`Erro ao vincular obra: ${err.message}`);
    }
  };

  const handleCreateObra = async (tower: EmpreendimentoTower) => {
    if (!organizationId) { alert('Selecione uma organização específica para criar a obra.'); return; }
    if (!window.confirm(`Criar uma nova obra para a torre "${tower.name}"?`)) return;
    try {
      const projectId = await empreendimentoService.createObraForTower(tower.id, organizationId, tower.name);
      setTowers(prev => prev.map(t => t.id === tower.id ? { ...t, project_id: projectId } : t));
      alert('Obra criada e vinculada com sucesso!');
    } catch (err: any) {
      alert(`Erro ao criar obra: ${err.message}`);
    }
  };

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-blue-400';

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="bg-gray-50/60 border border-gray-100 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <input className={inputCls} placeholder="Nome (ex: Torre A)" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        <input className={inputCls} placeholder="Nº pavimentos" type="number" value={form.floors_count} onChange={e => setForm(p => ({ ...p, floors_count: e.target.value }))} />
        <input className={inputCls} placeholder="Unid./pavimento" type="number" value={form.units_per_floor} onChange={e => setForm(p => ({ ...p, units_per_floor: e.target.value }))} />
        <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Torre
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : towers.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Building className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-xs font-semibold">Nenhuma torre/bloco cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {towers.map(tower => {
            const linkedObra = orgProjects.find(p => p.id === tower.project_id);
            const isOpen = expandedId === tower.id;
            return (
              <div key={tower.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <button onClick={() => setExpandedId(isOpen ? null : tower.id)} className="flex items-center gap-3 text-left flex-1">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                      <Building className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800 text-sm">{tower.name}</h4>
                      <p className="text-xs text-gray-400 font-medium">
                        {tower.floors_count ? `${tower.floors_count} pav.` : 'sem pavimentos'}
                        {tower.units_per_floor ? ` · ${tower.units_per_floor} un/pav` : ''}
                      </p>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {linkedObra ? (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 flex items-center gap-1.5">
                        <HardHat className="w-3.5 h-3.5" /> {linkedObra.name}
                      </span>
                    ) : (
                      <>
                        <select
                          defaultValue=""
                          onChange={e => handleLinkObra(tower, e.target.value)}
                          className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-[11px] font-bold text-gray-600 bg-white outline-none"
                        >
                          <option value="">Vincular obra…</option>
                          {orgProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button
                          onClick={() => handleCreateObra(tower)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                        >
                          <Link2 className="w-3.5 h-3.5" /> Criar Obra
                        </button>
                      </>
                    )}
                    <button onClick={() => handleDelete(tower)} className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50/30">
                    <UnitEditor tower={tower} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TowerEditor;
