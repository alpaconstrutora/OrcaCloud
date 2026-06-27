// components/empreendimento/UnitEditor.tsx
import React from 'react';
import { Plus, Trash2, Loader2, Layers } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import {
  EmpreendimentoTower, EmpreendimentoUnit, UnitStatus, EmpreendimentoUnitInsert,
} from '../../types';

interface Props {
  tower: EmpreendimentoTower;
}

const STATUS_LABELS: Record<UnitStatus, string> = {
  DISPONIVEL: 'Disponível',
  RESERVADO: 'Reservado',
  PERMUTADO: 'Permutado',
  VENDIDO: 'Vendido',
};

const STATUS_STYLE: Record<UnitStatus, string> = {
  DISPONIVEL: 'bg-emerald-500/10 text-emerald-600',
  RESERVADO: 'bg-amber-500/10 text-amber-600',
  PERMUTADO: 'bg-violet-500/10 text-violet-600',
  VENDIDO: 'bg-blue-500/10 text-blue-600',
};

export const UnitEditor: React.FC<Props> = ({ tower }) => {
  const [units, setUnits] = React.useState<EmpreendimentoUnit[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '', floor: '', typology: '', private_area: '', common_area: '', price: '', parking_spaces: '',
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setUnits(await empreendimentoService.listUnits(tower.id));
    } catch (err) {
      console.error('[UnitEditor] erro ao carregar unidades:', err);
    } finally {
      setLoading(false);
    }
  }, [tower.id]);

  React.useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { alert('Informe o nome/identificação da unidade.'); return; }
    setSaving(true);
    try {
      const priv = form.private_area ? Number(form.private_area) : undefined;
      const common = form.common_area ? Number(form.common_area) : undefined;
      const payload: EmpreendimentoUnitInsert = {
        tower_id: tower.id,
        name: form.name.trim(),
        floor: form.floor ? Number(form.floor) : undefined,
        typology: form.typology || undefined,
        private_area: priv,
        common_area: common,
        total_area: priv !== undefined || common !== undefined ? (priv ?? 0) + (common ?? 0) : undefined,
        price: form.price ? Number(form.price) : undefined,
        parking_spaces: form.parking_spaces ? Number(form.parking_spaces) : undefined,
        status: 'DISPONIVEL',
        is_vendavel: true,
      };
      await empreendimentoService.createUnit(payload);
      setForm({ name: '', floor: '', typology: '', private_area: '', common_area: '', price: '', parking_spaces: '' });
      await load();
    } catch (err: any) {
      alert(`Erro ao adicionar unidade: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (unit: EmpreendimentoUnit, status: UnitStatus) => {
    try {
      await empreendimentoService.updateUnit(unit.id, { status });
      setUnits(prev => prev.map(u => u.id === unit.id ? { ...u, status } : u));
    } catch (err: any) {
      alert(`Erro ao atualizar status: ${err.message}`);
    }
  };

  const handleDelete = async (unit: EmpreendimentoUnit) => {
    if (!window.confirm(`Excluir a unidade "${unit.name}"?`)) return;
    try {
      await empreendimentoService.deleteUnit(unit.id);
      setUnits(prev => prev.filter(u => u.id !== unit.id));
    } catch (err: any) {
      alert(`Erro ao excluir unidade: ${err.message}`);
    }
  };

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-blue-400';

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="bg-gray-50/60 border border-gray-100 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-8 gap-3 items-end">
        <input className={inputCls} placeholder="Unidade (ex: 101)" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        <input className={inputCls} placeholder="Pav." type="number" value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} />
        <input className={inputCls} placeholder="Tipologia" value={form.typology} onChange={e => setForm(p => ({ ...p, typology: e.target.value }))} />
        <input className={inputCls} placeholder="Priv. m²" type="number" step="0.01" value={form.private_area} onChange={e => setForm(p => ({ ...p, private_area: e.target.value }))} />
        <input className={inputCls} placeholder="Comum m²" type="number" step="0.01" value={form.common_area} onChange={e => setForm(p => ({ ...p, common_area: e.target.value }))} />
        <input className={inputCls} placeholder="Vagas" type="number" value={form.parking_spaces} onChange={e => setForm(p => ({ ...p, parking_spaces: e.target.value }))} />
        <input className={inputCls} placeholder="Preço R$" type="number" step="0.01" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
        <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : units.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Layers className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-xs font-semibold">Nenhuma unidade cadastrada nesta torre.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider bg-gray-50/50">
                <th className="py-3 px-4">Unidade</th>
                <th className="py-3 px-4">Pav.</th>
                <th className="py-3 px-4">Tipologia</th>
                <th className="py-3 px-4">Priv. m²</th>
                <th className="py-3 px-4">Comum m²</th>
                <th className="py-3 px-4">Vagas</th>
                <th className="py-3 px-4">Preço</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {units.map(u => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/40">
                  <td className="py-3 px-4 font-bold text-gray-800">{u.name}</td>
                  <td className="py-3 px-4 text-gray-500">{u.floor ?? '—'}</td>
                  <td className="py-3 px-4 text-gray-500">{u.typology || '—'}</td>
                  <td className="py-3 px-4 text-gray-500">{u.private_area ?? '—'}</td>
                  <td className="py-3 px-4 text-gray-500">{u.common_area ?? '—'}</td>
                  <td className="py-3 px-4 text-gray-500">{u.parking_spaces ?? '—'}</td>
                  <td className="py-3 px-4 text-gray-700 font-semibold">{u.price != null ? `R$ ${u.price.toLocaleString('pt-BR')}` : '—'}</td>
                  <td className="py-3 px-4">
                    <select
                      value={u.status}
                      onChange={e => handleStatusChange(u, e.target.value as UnitStatus)}
                      className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border-none outline-none cursor-pointer ${STATUS_STYLE[u.status]}`}
                    >
                      {(Object.keys(STATUS_LABELS) as UnitStatus[]).map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button onClick={() => handleDelete(u)} className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default UnitEditor;
