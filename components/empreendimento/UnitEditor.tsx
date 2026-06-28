// components/empreendimento/UnitEditor.tsx
import React from 'react';
import { Plus, Trash2, Loader2, Layers, Edit, Copy, X, Check, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import {
  EmpreendimentoTower, EmpreendimentoUnit, UnitStatus, EmpreendimentoUnitInsert,
} from '../../types';

interface Props {
  tower: EmpreendimentoTower;
  onUnitsChange?: (towerId: string, units: EmpreendimentoUnit[]) => void;
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

const emptyForm = () => ({
  name: '', floor: '', typology: '', private_area: '', common_area: '', price: '', parking_spaces: '',
});

export const UnitEditor: React.FC<Props> = ({ tower, onUnitsChange }) => {
  const [units, setUnits] = React.useState<EmpreendimentoUnit[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm());

  // Edição inline
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState(emptyForm());

  // Geração automática
  const [genOpen, setGenOpen] = React.useState(false);
  const [genForm, setGenForm] = React.useState({
    floors_count: tower.floors_count?.toString() ?? '',
    units_per_floor: tower.units_per_floor?.toString() ?? '',
    start_floor: '1',
    prefix: '',
    typology: '',
    private_area: '',
    common_area: '',
    parking_spaces: '',
    price: '',
  });
  const [generating, setGenerating] = React.useState(false);

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

  React.useEffect(() => {
    onUnitsChange?.(tower.id, units);
  }, [units, tower.id, onUnitsChange]);

  const buildPayload = (f: typeof form): Omit<EmpreendimentoUnitInsert, 'tower_id' | 'name'> => {
    const priv = f.private_area ? Number(f.private_area) : undefined;
    const common = f.common_area ? Number(f.common_area) : undefined;
    return {
      floor: f.floor ? Number(f.floor) : undefined,
      typology: f.typology || undefined,
      private_area: priv,
      common_area: common,
      total_area: priv !== undefined || common !== undefined ? (priv ?? 0) + (common ?? 0) : undefined,
      price: f.price ? Number(f.price) : undefined,
      parking_spaces: f.parking_spaces ? Number(f.parking_spaces) : undefined,
      status: 'DISPONIVEL',
      is_vendavel: true,
    };
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { alert('Informe o nome/identificação da unidade.'); return; }
    setSaving(true);
    try {
      await empreendimentoService.createUnit({ tower_id: tower.id, name: form.name.trim(), ...buildPayload(form) });
      setForm(emptyForm());
      await load();
    } catch (err: any) {
      alert(`Erro ao adicionar unidade: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u: EmpreendimentoUnit) => {
    setEditingId(u.id);
    setEditForm({
      name: u.name,
      floor: u.floor?.toString() ?? '',
      typology: u.typology ?? '',
      private_area: u.private_area?.toString() ?? '',
      common_area: u.common_area?.toString() ?? '',
      price: u.price?.toString() ?? '',
      parking_spaces: u.parking_spaces?.toString() ?? '',
    });
  };

  const handleSaveEdit = async (u: EmpreendimentoUnit) => {
    if (!editForm.name.trim()) { alert('Informe o nome da unidade.'); return; }
    try {
      const priv = editForm.private_area ? Number(editForm.private_area) : undefined;
      const common = editForm.common_area ? Number(editForm.common_area) : undefined;
      const updated = {
        name: editForm.name.trim(),
        floor: editForm.floor ? Number(editForm.floor) : undefined,
        typology: editForm.typology || undefined,
        private_area: priv,
        common_area: common,
        total_area: priv !== undefined || common !== undefined ? (priv ?? 0) + (common ?? 0) : undefined,
        price: editForm.price ? Number(editForm.price) : undefined,
        parking_spaces: editForm.parking_spaces ? Number(editForm.parking_spaces) : undefined,
      };
      await empreendimentoService.updateUnit(u.id, updated);
      setUnits(prev => prev.map(x => x.id === u.id ? { ...x, ...updated } : x));
      setEditingId(null);
    } catch (err: any) {
      alert(`Erro ao salvar unidade: ${err.message}`);
    }
  };

  const handleDuplicate = async (u: EmpreendimentoUnit) => {
    try {
      const payload: EmpreendimentoUnitInsert = {
        tower_id: tower.id,
        name: `${u.name} (cópia)`,
        floor: u.floor ?? undefined,
        typology: u.typology ?? undefined,
        private_area: u.private_area ?? undefined,
        common_area: u.common_area ?? undefined,
        total_area: u.total_area ?? undefined,
        price: u.price ?? undefined,
        parking_spaces: u.parking_spaces ?? undefined,
        position_type: u.position_type ?? undefined,
        sun_orientation: u.sun_orientation ?? undefined,
        status: 'DISPONIVEL',
        is_vendavel: true,
        sort_order: units.length,
      };
      await empreendimentoService.createUnit(payload);
      await load();
    } catch (err: any) {
      alert(`Erro ao duplicar unidade: ${err.message}`);
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

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const floors = Number(genForm.floors_count);
    const perFloor = Number(genForm.units_per_floor);
    const startFloor = Number(genForm.start_floor);
    if (!floors || !perFloor) { alert('Informe número de pavimentos e unidades por pavimento.'); return; }
    if (floors > 100 || perFloor > 50) { alert('Valores muito grandes (máx 100 pav / 50 un/pav).'); return; }

    const total = floors * perFloor;
    if (!window.confirm(`Gerar ${total} unidades para a torre "${tower.name}"?`)) return;

    setGenerating(true);
    try {
      const toCreate: EmpreendimentoUnitInsert[] = [];
      for (let f = 0; f < floors; f++) {
        const floorNum = startFloor + f;
        for (let u = 1; u <= perFloor; u++) {
          const unitNum = String(u).padStart(2, '0');
          const priv = genForm.private_area ? Number(genForm.private_area) : undefined;
          const common = genForm.common_area ? Number(genForm.common_area) : undefined;
          const prefix = genForm.prefix ? `${genForm.prefix}-` : '';
          toCreate.push({
            tower_id: tower.id,
            name: `${prefix}${floorNum}${unitNum}`,
            floor: floorNum,
            typology: genForm.typology || undefined,
            private_area: priv,
            common_area: common,
            total_area: priv !== undefined || common !== undefined ? (priv ?? 0) + (common ?? 0) : undefined,
            price: genForm.price ? Number(genForm.price) : undefined,
            parking_spaces: genForm.parking_spaces ? Number(genForm.parking_spaces) : undefined,
            status: 'DISPONIVEL',
            is_vendavel: true,
            sort_order: units.length + toCreate.length,
          });
        }
      }
      await empreendimentoService.bulkUpsertUnits(toCreate);
      setGenOpen(false);
      await load();
    } catch (err: any) {
      alert(`Erro ao gerar unidades: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-blue-400';
  const editCls = 'px-2 py-1 border border-blue-200 rounded-lg text-xs font-medium outline-none focus:border-blue-400 bg-white w-full';

  const genTotal = (Number(genForm.floors_count) || 0) * (Number(genForm.units_per_floor) || 0);

  return (
    <div className="space-y-4">
      {/* Formulário de adição individual */}
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

      {/* Painel de geração automática */}
      <div className="border border-dashed border-blue-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setGenOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-blue-600 hover:bg-blue-50/50 transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
            <Zap className="w-4 h-4" /> Gerar Unidades Automaticamente
          </span>
          {genOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {genOpen && (
          <form onSubmit={handleGenerate} className="px-4 pb-4 space-y-4 border-t border-blue-100 pt-4 bg-blue-50/20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Nº Pavimentos *</label>
                <input type="number" min="1" className={inputCls + ' w-full'} value={genForm.floors_count}
                  onChange={e => setGenForm(p => ({ ...p, floors_count: e.target.value }))} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Unid./Pavimento *</label>
                <input type="number" min="1" className={inputCls + ' w-full'} value={genForm.units_per_floor}
                  onChange={e => setGenForm(p => ({ ...p, units_per_floor: e.target.value }))} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Pav. Inicial</label>
                <input type="number" min="0" className={inputCls + ' w-full'} value={genForm.start_floor}
                  onChange={e => setGenForm(p => ({ ...p, start_floor: e.target.value }))} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Prefixo (opcional)</label>
                <input className={inputCls + ' w-full'} placeholder="ex: A" value={genForm.prefix}
                  onChange={e => setGenForm(p => ({ ...p, prefix: e.target.value }))} />
              </div>
            </div>
            <div className="text-[10px] text-gray-500 font-medium">
              {genTotal > 0 ? (
                <>
                  Exemplo: <span className="font-bold text-gray-700">{genForm.prefix ? `${genForm.prefix}-` : ''}{genForm.start_floor || 1}01</span>
                  {' '}a{' '}
                  <span className="font-bold text-gray-700">
                    {genForm.prefix ? `${genForm.prefix}-` : ''}{(Number(genForm.start_floor) || 1) + (Number(genForm.floors_count) || 1) - 1}{String(Number(genForm.units_per_floor)).padStart(2, '0')}
                  </span>
                  {' '}— <span className="font-bold text-blue-600">{genTotal} unidades</span>
                </>
              ) : 'Preencha pavimentos e unidades/pav para ver o total.'}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Tipologia</label>
                <input className={inputCls + ' w-full'} placeholder="ex: 2 Quartos" value={genForm.typology}
                  onChange={e => setGenForm(p => ({ ...p, typology: e.target.value }))} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Área Privativa (m²)</label>
                <input type="number" step="0.01" className={inputCls + ' w-full'} value={genForm.private_area}
                  onChange={e => setGenForm(p => ({ ...p, private_area: e.target.value }))} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Vagas</label>
                <input type="number" className={inputCls + ' w-full'} value={genForm.parking_spaces}
                  onChange={e => setGenForm(p => ({ ...p, parking_spaces: e.target.value }))} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Preço Padrão (R$)</label>
                <input type="number" step="0.01" className={inputCls + ' w-full'} value={genForm.price}
                  onChange={e => setGenForm(p => ({ ...p, price: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={generating || genTotal === 0}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Gerar {genTotal > 0 ? `${genTotal} unidades` : 'Unidades'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Tabela de unidades */}
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
              {units.map(u => {
                const isEditingUnit = editingId === u.id;
                return (
                  <tr key={u.id} className={`border-b border-gray-50 ${isEditingUnit ? 'bg-blue-50/30' : 'hover:bg-gray-50/40'}`}>
                    {isEditingUnit ? (
                      <>
                        <td className="py-2 px-3"><input className={editCls} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} autoFocus /></td>
                        <td className="py-2 px-3"><input className={editCls} type="number" value={editForm.floor} onChange={e => setEditForm(p => ({ ...p, floor: e.target.value }))} /></td>
                        <td className="py-2 px-3"><input className={editCls} value={editForm.typology} onChange={e => setEditForm(p => ({ ...p, typology: e.target.value }))} /></td>
                        <td className="py-2 px-3"><input className={editCls} type="number" step="0.01" value={editForm.private_area} onChange={e => setEditForm(p => ({ ...p, private_area: e.target.value }))} /></td>
                        <td className="py-2 px-3"><input className={editCls} type="number" step="0.01" value={editForm.common_area} onChange={e => setEditForm(p => ({ ...p, common_area: e.target.value }))} /></td>
                        <td className="py-2 px-3"><input className={editCls} type="number" value={editForm.parking_spaces} onChange={e => setEditForm(p => ({ ...p, parking_spaces: e.target.value }))} /></td>
                        <td className="py-2 px-3"><input className={editCls} type="number" step="0.01" value={editForm.price} onChange={e => setEditForm(p => ({ ...p, price: e.target.value }))} /></td>
                        <td className="py-2 px-3">
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
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleSaveEdit(u)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
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
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => startEdit(u)} className="p-1.5 hover:bg-blue-50 text-blue-500 rounded-lg" title="Editar"><Edit className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDuplicate(u)} className="p-1.5 hover:bg-violet-50 text-violet-500 rounded-lg" title="Duplicar"><Copy className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDelete(u)} className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <TotalsRow units={units} />
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

const TotalsRow: React.FC<{ units: EmpreendimentoUnit[] }> = ({ units }) => {
  const totalPriv = units.reduce((s, u) => s + (u.private_area ?? 0), 0);
  const totalComum = units.reduce((s, u) => s + (u.common_area ?? 0), 0);
  const fmt = (v: number) => v > 0 ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—';
  return (
    <tr className="border-t-2 border-gray-200 bg-gray-50/70 font-bold text-xs text-gray-700">
      <td className="py-2.5 px-4" colSpan={3}>
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total ({units.length} unid.)</span>
      </td>
      <td className="py-2.5 px-4">{fmt(totalPriv)} m²</td>
      <td className="py-2.5 px-4">{fmt(totalComum)} m²</td>
      <td className="py-2.5 px-4" colSpan={4} />
    </tr>
  );
};

export default UnitEditor;
