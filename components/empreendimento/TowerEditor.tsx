// components/empreendimento/TowerEditor.tsx
//
// Torres & Unidades do Empreendimento. Usa o primitivo compartilhado <TorreCard> — a mesma
// casca visual da Viabilidade e (futuramente) do Planta IA. O miolo aqui é FloorEditor +
// UnitEditor (unidade individual real); nos outros módulos o miolo difere, a casca não.
import React from 'react';
import { Plus, Loader2, Building, Link2, HardHat, Check, X, BarChart2, AlertCircle } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import Button from '../ui/Button';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { useStore } from '../../store/useStore';
import { EmpreendimentoTower, EmpreendimentoTowerInsert, EmpreendimentoUnit } from '../../types';
import UnitEditor from './UnitEditor';
import FloorEditor from './FloorEditor';
import { TorreCard, TorreEmpty, TorreTotais, TorreTotalMetric } from '../torres/TorreCard';
import { isObra } from '../../utils/projectClassification';

interface Props {
  empreendimentoId: string;
  organizationId: string;
}

export const TowerEditor: React.FC<Props> = ({ empreendimentoId, organizationId }) => {
  const { projects } = useStore();
  const confirm = useConfirm();
  const [towers, setTowers] = React.useState<EmpreendimentoTower[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState({ name: '', floors_count: '', units_per_floor: '' });
  const [form, setForm] = React.useState({ name: '', floors_count: '', units_per_floor: '' });
  const [unitsByTower, setUnitsByTower] = React.useState<Record<string, EmpreendimentoUnit[]>>({});
  const [unitKeyByTower, setUnitKeyByTower] = React.useState<Record<string, number>>({});
  const [notice, setNotice] = React.useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotice({ msg, type });
    setTimeout(() => setNotice(null), 4000);
  };

  const handleUnitsChange = React.useCallback((towerId: string, units: EmpreendimentoUnit[]) => {
    setUnitsByTower(prev => ({ ...prev, [towerId]: units }));
  }, []);

  const handleUnitsRegenerated = React.useCallback((towerId: string) => {
    setUnitsByTower(prev => ({ ...prev, [towerId]: [] }));
    setUnitKeyByTower(prev => ({ ...prev, [towerId]: (prev[towerId] ?? 0) + 1 }));
  }, []);

  const orgProjects = React.useMemo(() => projects.filter(p => {
    const s: any = p.settings || {};
    return isObra({ settings: s }) && (!organizationId || s.organizationId === organizationId);
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
    if (!form.name.trim()) { notify('Informe o nome da torre/bloco.', 'error'); return; }
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
      notify(`Erro ao adicionar torre: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (tower: EmpreendimentoTower) => {
    setEditingId(tower.id);
    setEditForm({
      name: tower.name,
      floors_count: tower.floors_count?.toString() ?? '',
      units_per_floor: tower.units_per_floor?.toString() ?? '',
    });
  };

  const handleSaveEdit = async (tower: EmpreendimentoTower) => {
    if (!editForm.name.trim()) { notify('Informe o nome da torre.', 'error'); return; }
    try {
      await empreendimentoService.updateTower(tower.id, {
        name: editForm.name.trim(),
        floors_count: editForm.floors_count ? Number(editForm.floors_count) : undefined,
        units_per_floor: editForm.units_per_floor ? Number(editForm.units_per_floor) : undefined,
      });
      setTowers(prev => prev.map(t => t.id === tower.id ? {
        ...t,
        name: editForm.name.trim(),
        floors_count: editForm.floors_count ? Number(editForm.floors_count) : undefined,
        units_per_floor: editForm.units_per_floor ? Number(editForm.units_per_floor) : undefined,
      } : t));
      setEditingId(null);
    } catch (err: any) {
      notify(`Erro ao salvar torre: ${err.message}`, 'error');
    }
  };

  const handleDelete = async (tower: EmpreendimentoTower) => {
    const ok = await confirm({
      title: 'Excluir torre?',
      message: `A torre "${tower.name}" e todas as suas unidades serão excluídas. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await empreendimentoService.deleteTower(tower.id);
      setTowers(prev => prev.filter(t => t.id !== tower.id));
    } catch (err: any) {
      notify(`Erro ao excluir torre: ${err.message}`, 'error');
    }
  };

  const handleLinkObra = async (tower: EmpreendimentoTower, projectId: string) => {
    if (!projectId) return;
    if (orgProjects.some(p => p.id === projectId && towers.some(t => t.id !== tower.id && t.project_id === projectId))) {
      const ok = await confirm({
        title: 'Obra já vinculada',
        message: 'Esta obra já está vinculada a outra torre. Deseja vincular mesmo assim?',
        confirmLabel: 'Vincular',
        variant: 'warning',
      });
      if (!ok) return;
    }
    try {
      await empreendimentoService.linkTowerToObra(tower.id, projectId);
      setTowers(prev => prev.map(t => t.id === tower.id ? { ...t, project_id: projectId } : t));
    } catch (err: any) {
      notify(`Erro ao vincular obra: ${err.message}`, 'error');
    }
  };

  const handleCreateObra = async (tower: EmpreendimentoTower) => {
    if (!organizationId) { notify('Selecione uma organização específica para criar a obra.', 'error'); return; }
    const ok = await confirm({
      title: 'Criar obra?',
      message: `Uma nova obra será criada e vinculada à torre "${tower.name}".`,
      confirmLabel: 'Criar',
      variant: 'default',
    });
    if (!ok) return;
    try {
      const projectId = await empreendimentoService.createObraForTower(tower.id, organizationId, tower.name);
      setTowers(prev => prev.map(t => t.id === tower.id ? { ...t, project_id: projectId } : t));
      notify('Obra criada e vinculada com sucesso.');
    } catch (err: any) {
      notify(`Erro ao criar obra: ${err.message}`, 'error');
    }
  };

  const inputCls = 'h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all';
  const editInputCls = 'h-9 px-2.5 border border-gray-200 rounded-[6px] text-sm font-medium outline-none focus:border-blue-500 bg-white';
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="grid grid-cols-2 md:grid-cols-4 gap-2.5 items-center">
        <input className={inputCls} placeholder="Nome (ex: Torre A)" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        <input className={inputCls} placeholder="Nº pavimentos" type="number" value={form.floors_count} onChange={e => setForm(p => ({ ...p, floors_count: e.target.value }))} />
        <input className={inputCls} placeholder="Unid./pavimento" type="number" value={form.units_per_floor} onChange={e => setForm(p => ({ ...p, units_per_floor: e.target.value }))} />
        <Button type="submit" disabled={saving} size="sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Adicionar torre
        </Button>
      </form>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : towers.length === 0 ? (
        <TorreEmpty icon={Building} text="Nenhuma torre/bloco cadastrado." />
      ) : (
        <div className="space-y-2.5">
          {towers.map(tower => {
            const linkedObra = orgProjects.find(p => p.id === tower.project_id);
            const isOpen = expandedId === tower.id;
            const isEditing = editingId === tower.id;
            const towerUnits = unitsByTower[tower.id] ?? [];
            const towerPriv = towerUnits.reduce((s, u) => s + (u.private_area ?? 0), 0);
            const towerComum = towerUnits.reduce((s, u) => s + (u.common_area ?? 0), 0);

            const subtitle = (
              <>
                {tower.floors_count ? `${tower.floors_count} pav.` : 'sem pavimentos'}
                {tower.units_per_floor ? ` · ${tower.units_per_floor} un/pav` : ''}
                {towerUnits.length > 0 && (
                  <>
                    {' · '}<span className="text-gray-500">{towerUnits.length} unid.</span>
                    {towerPriv > 0 && <> · <span className="text-blue-500">{fmt(towerPriv)} m² priv.</span></>}
                    {towerComum > 0 && <> · <span className="text-violet-500">{fmt(towerComum)} m² comum</span></>}
                  </>
                )}
              </>
            );

            const editHeader = (
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <input className={editInputCls} placeholder="Nome da torre" value={editForm.name}
                  onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                <input className={`${editInputCls} w-28`} placeholder="Nº pav." type="number" value={editForm.floors_count}
                  onChange={e => setEditForm(p => ({ ...p, floors_count: e.target.value }))} />
                <input className={`${editInputCls} w-32`} placeholder="Un./pav." type="number" value={editForm.units_per_floor}
                  onChange={e => setEditForm(p => ({ ...p, units_per_floor: e.target.value }))} />
                <button onClick={() => handleSaveEdit(tower)} className="h-9 w-9 flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-[6px]">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditingId(null)} className="h-9 w-9 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-[6px]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            );

            const actions = (
              <>
                {linkedObra ? (
                  <span className="text-xs font-semibold px-2.5 h-9 inline-flex items-center rounded-[6px] bg-emerald-50 text-emerald-600 gap-1.5">
                    <HardHat className="w-3.5 h-3.5" /> {linkedObra.name}
                  </span>
                ) : (
                  <>
                    <select defaultValue="" onChange={e => handleLinkObra(tower, e.target.value)}
                      className="h-9 px-2.5 border border-gray-200 rounded-[6px] text-sm font-normal text-gray-600 bg-white outline-none">
                      <option value="">Vincular obra…</option>
                      {orgProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button onClick={() => handleCreateObra(tower)}
                      className="h-9 px-2.5 rounded-[6px] bg-blue-50 hover:bg-blue-100 text-blue-600 text-sm font-medium flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" /> Criar obra
                    </button>
                  </>
                )}
                <ActionIconButton kind="edit" title="Editar torre" onClick={() => startEdit(tower)} />
                <ActionIconButton kind="delete" onClick={() => handleDelete(tower)} />
              </>
            );

            return (
              <TorreCard
                key={tower.id}
                icon={Building}
                tint="blue"
                title={tower.name}
                subtitle={subtitle}
                actions={actions}
                headerOverride={isEditing ? editHeader : undefined}
                expandable
                isOpen={isOpen}
                onToggle={() => setExpandedId(isOpen ? null : tower.id)}
              >
                <div className="divide-y divide-gray-100">
                  <div className="p-4">
                    <FloorEditor tower={tower} onUnitsRegenerated={() => handleUnitsRegenerated(tower.id)} />
                  </div>
                  <div className="p-4">
                    <UnitEditor key={unitKeyByTower[tower.id] ?? 0} tower={tower} onUnitsChange={handleUnitsChange} />
                  </div>
                </div>
              </TorreCard>
            );
          })}
        </div>
      )}

      {/* Totais gerais — só quando há pelo menos 1 torre com unidades */}
      {Object.keys(unitsByTower).length > 0 && (() => {
        const allUnits = Object.values(unitsByTower).flat();
        if (allUnits.length === 0) return null;
        const totalPriv = allUnits.reduce((s, u) => s + (u.private_area ?? 0), 0);
        const totalComum = allUnits.reduce((s, u) => s + (u.common_area ?? 0), 0);
        const totalArea = totalPriv + totalComum;
        return (
          <TorreTotais>
            <div className="flex items-center gap-2 text-gray-500">
              <BarChart2 className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-black uppercase tracking-widest">Total geral</span>
            </div>
            <TorreTotalMetric label="Unidades" value={String(allUnits.length)} />
            <TorreTotalMetric label="Área privativa" value={totalPriv > 0 ? `${fmt(totalPriv)} m²` : '—'} color="text-blue-600" />
            <TorreTotalMetric label="Área comum" value={totalComum > 0 ? `${fmt(totalComum)} m²` : '—'} color="text-violet-600" />
            {totalArea > 0 && <TorreTotalMetric label="Área total" value={`${fmt(totalArea)} m²`} />}
          </TorreTotais>
        );
      })()}

      {notice && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
          notice.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" /> {notice.msg}
        </div>
      )}
    </div>
  );
};

export default TowerEditor;
