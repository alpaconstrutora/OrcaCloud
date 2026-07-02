// components/empreendimento/FloorEditor.tsx
// Cadastro de pavimentos template (Frente B). Modelo: template + materialização.
// Cada linha = um "tipo de andar" com nome, tipo, nº inicial, repetições e un./pav.
// O botão "Gerar Unidades" expande os templates nos andares reais via generateUnitsFromFloors.
import React from 'react';
import { Plus, Trash2, Loader2, Layers, Zap, Edit, Check, X } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import Button from '../ui/Button';
import { EmpreendimentoTower, EmpreendimentoFloor, EmpreendimentoFloorInsert, FloorTipo } from '../../types';

interface Props {
  tower: EmpreendimentoTower;
  onUnitsRegenerated?: () => void;
}

const TIPO_OPTIONS: { value: FloorTipo; label: string }[] = [
  { value: 'SUBSOLO',   label: 'Subsolo' },
  { value: 'TERREO',    label: 'Térreo' },
  { value: 'MEZANINO',  label: 'Mezanino' },
  { value: 'TIPO',      label: 'Pavimento Tipo' },
  { value: 'COBERTURA', label: 'Cobertura' },
  { value: 'TECNICO',   label: 'Técnico' },
  { value: 'GARAGEM',   label: 'Garagem' },
  { value: 'OUTRO',     label: 'Outro' },
];

const TIPO_STYLE: Record<FloorTipo, string> = {
  SUBSOLO:   'bg-slate-500/10 text-slate-600',
  TERREO:    'bg-emerald-500/10 text-emerald-600',
  MEZANINO:  'bg-teal-500/10 text-teal-600',
  TIPO:      'bg-blue-500/10 text-blue-600',
  COBERTURA: 'bg-violet-500/10 text-violet-600',
  TECNICO:   'bg-orange-500/10 text-orange-600',
  GARAGEM:   'bg-gray-500/10 text-gray-600',
  OUTRO:     'bg-rose-500/10 text-rose-600',
};

const emptyForm = () => ({
  name: '', tipo: 'TIPO' as FloorTipo,
  floor_number: '', repeat_count: '1', units_per_floor: '', prefix: '',
});

export const FloorEditor: React.FC<Props> = ({ tower, onUnitsRegenerated }) => {
  const [floors, setFloors] = React.useState<EmpreendimentoFloor[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState(emptyForm());

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setFloors(await empreendimentoService.listFloors(tower.id)); }
    catch (err) { console.error('[FloorEditor] erro ao carregar:', err); }
    finally { setLoading(false); }
  }, [tower.id]);

  React.useEffect(() => { load(); }, [load]);

  const totalAndares = floors.reduce((s, f) => s + f.repeat_count, 0);
  const totalUnidades = floors.reduce((s, f) =>
    s + f.repeat_count * (f.units_per_floor ?? tower.units_per_floor ?? 1), 0);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { alert('Informe o nome do pavimento.'); return; }
    if (!form.floor_number) { alert('Informe o número inicial do pavimento.'); return; }
    setSaving(true);
    try {
      const payload: EmpreendimentoFloorInsert = {
        tower_id: tower.id,
        name: form.name.trim(),
        tipo: form.tipo,
        floor_number: Number(form.floor_number),
        repeat_count: Number(form.repeat_count) || 1,
        units_per_floor: form.units_per_floor ? Number(form.units_per_floor) : undefined,
        prefix: form.prefix || undefined,
        sort_order: floors.length,
      };
      await empreendimentoService.createFloor(payload);
      setForm(emptyForm());
      await load();
    } catch (err: any) {
      alert(`Erro ao adicionar pavimento: ${err.message}`);
    } finally { setSaving(false); }
  };

  const startEdit = (f: EmpreendimentoFloor) => {
    setEditingId(f.id);
    setEditForm({
      name: f.name,
      tipo: f.tipo,
      floor_number: String(f.floor_number),
      repeat_count: String(f.repeat_count),
      units_per_floor: f.units_per_floor != null ? String(f.units_per_floor) : '',
      prefix: f.prefix ?? '',
    });
  };

  const handleSaveEdit = async (f: EmpreendimentoFloor) => {
    if (!editForm.name.trim()) { alert('Informe o nome do pavimento.'); return; }
    try {
      await empreendimentoService.updateFloor(f.id, {
        name: editForm.name.trim(),
        tipo: editForm.tipo,
        floor_number: Number(editForm.floor_number),
        repeat_count: Number(editForm.repeat_count) || 1,
        units_per_floor: editForm.units_per_floor ? Number(editForm.units_per_floor) : undefined,
        prefix: editForm.prefix || undefined,
      });
      setEditingId(null);
      await load();
    } catch (err: any) {
      alert(`Erro ao salvar pavimento: ${err.message}`);
    }
  };

  const handleDelete = async (f: EmpreendimentoFloor) => {
    if (!window.confirm(`Excluir o pavimento "${f.name}"? As unidades vinculadas a ele perdem a referência de pavimento (não são excluídas).`)) return;
    try {
      await empreendimentoService.deleteFloor(f.id);
      setFloors(prev => prev.filter(x => x.id !== f.id));
    } catch (err: any) {
      alert(`Erro ao excluir pavimento: ${err.message}`);
    }
  };

  const handleGenerate = async () => {
    if (!floors.length) { alert('Cadastre ao menos um pavimento antes de gerar unidades.'); return; }
    const msg = `Gerar ${totalUnidades} unidades para "${tower.name}"?\n\nATENÇÃO: as unidades existentes serão excluídas e recriadas a partir dos pavimentos.`;
    if (!window.confirm(msg)) return;
    setGenerating(true);
    try {
      await empreendimentoService.deleteUnitsByTower(tower.id);
      await empreendimentoService.generateUnitsFromFloors(tower);
      onUnitsRegenerated?.();
    } catch (err: any) {
      alert(`Erro ao gerar unidades: ${err.message}`);
    } finally { setGenerating(false); }
  };

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-blue-400 bg-white';
  const editCls  = 'px-2 py-1 border border-blue-200 rounded-lg text-xs font-medium outline-none focus:border-blue-400 bg-white';

  // Preview do nomes dos andares para a linha em edição / adição
  const previewRange = (startStr: string, repeatStr: string, tipo: FloorTipo) => {
    const s = Number(startStr);
    const r = Number(repeatStr) || 1;
    if (!startStr) return null;
    if (r === 1) return labelFloor(s, tipo);
    return `${labelFloor(s, tipo)} → ${labelFloor(s + r - 1, tipo)}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> Pavimentos
        </h4>
        {floors.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-gray-400 font-semibold">
            <span>{totalAndares} andares · {totalUnidades} unidades</span>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              size="sm"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Gerar Unidades ({totalUnidades})
            </Button>
          </div>
        )}
      </div>

      {/* Formulário de adição */}
      <form onSubmit={handleAdd} className="bg-blue-50/40 border border-blue-100 rounded-2xl p-3 grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Nome *</label>
          <input className={inputCls + ' w-full'} placeholder="ex: Pavimento Tipo" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Tipo *</label>
          <select className={inputCls + ' w-full'} value={form.tipo}
            onChange={e => setForm(p => ({ ...p, tipo: e.target.value as FloorTipo }))}>
            {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Nº Inicial *</label>
          <input className={inputCls + ' w-full'} type="number" placeholder="ex: 1" value={form.floor_number}
            onChange={e => setForm(p => ({ ...p, floor_number: e.target.value }))} />
        </div>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Repete</label>
          <input className={inputCls + ' w-full'} type="number" min="1" placeholder="1" value={form.repeat_count}
            onChange={e => setForm(p => ({ ...p, repeat_count: e.target.value }))} />
        </div>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Un./Pav.</label>
          <input className={inputCls + ' w-full'} type="number" min="1" placeholder="—" value={form.units_per_floor}
            onChange={e => setForm(p => ({ ...p, units_per_floor: e.target.value }))} />
        </div>
        <Button type="submit" disabled={saving} size="sm">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </Button>
      </form>

      {/* Lista de pavimentos */}
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
      ) : floors.length === 0 ? (
        <p className="text-center text-xs text-gray-400 py-4">Nenhum pavimento cadastrado. Adicione acima para estruturar os andares da torre.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider bg-gray-50/50">
                <th className="py-2.5 px-4">Nome</th>
                <th className="py-2.5 px-4">Tipo</th>
                <th className="py-2.5 px-4">Nº Ini.</th>
                <th className="py-2.5 px-4">Repete</th>
                <th className="py-2.5 px-4">Un./Pav.</th>
                <th className="py-2.5 px-4">Andares</th>
                <th className="py-2.5 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {floors.map(f => {
                const isEd = editingId === f.id;
                const upf = f.units_per_floor ?? tower.units_per_floor;
                const rangeStr = f.repeat_count === 1
                  ? labelFloor(f.floor_number, f.tipo)
                  : `${labelFloor(f.floor_number, f.tipo)} → ${labelFloor(f.floor_number + f.repeat_count - 1, f.tipo)}`;
                return (
                  <tr key={f.id} className={`border-b border-gray-50 ${isEd ? 'bg-blue-50/30' : 'hover:bg-gray-50/40'}`}>
                    {isEd ? (
                      <>
                        <td className="py-2 px-3"><input className={editCls + ' w-full'} value={editForm.name}
                          onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} autoFocus /></td>
                        <td className="py-2 px-3">
                          <select className={editCls + ' w-full'} value={editForm.tipo}
                            onChange={e => setEditForm(p => ({ ...p, tipo: e.target.value as FloorTipo }))}>
                            {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-3"><input className={editCls + ' w-16'} type="number" value={editForm.floor_number}
                          onChange={e => setEditForm(p => ({ ...p, floor_number: e.target.value }))} /></td>
                        <td className="py-2 px-3"><input className={editCls + ' w-16'} type="number" min="1" value={editForm.repeat_count}
                          onChange={e => setEditForm(p => ({ ...p, repeat_count: e.target.value }))} /></td>
                        <td className="py-2 px-3"><input className={editCls + ' w-16'} type="number" min="1" value={editForm.units_per_floor}
                          onChange={e => setEditForm(p => ({ ...p, units_per_floor: e.target.value }))} /></td>
                        <td className="py-2 px-3 text-gray-400 italic text-xs">
                          {previewRange(editForm.floor_number, editForm.repeat_count, editForm.tipo)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleSaveEdit(f)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 px-4 font-bold text-gray-800">{f.name}</td>
                        <td className="py-2.5 px-4">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${TIPO_STYLE[f.tipo]}`}>
                            {TIPO_OPTIONS.find(o => o.value === f.tipo)?.label ?? f.tipo}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-gray-500 font-mono">{f.floor_number}</td>
                        <td className="py-2.5 px-4 text-gray-500">
                          {f.repeat_count > 1 ? <span className="font-bold text-blue-600">{f.repeat_count}×</span> : '1×'}
                        </td>
                        <td className="py-2.5 px-4 text-gray-500">{upf != null ? upf : <span className="text-gray-300">—</span>}</td>
                        <td className="py-2.5 px-4 text-gray-500 text-xs font-mono">{rangeStr}</td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => startEdit(f)} className="p-1.5 hover:bg-blue-50 text-blue-500 rounded-lg" title="Editar"><Edit className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDelete(f)} className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {floors.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50/70 font-bold text-xs text-gray-600">
                  <td className="py-2.5 px-4" colSpan={3}>
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Total</span>
                  </td>
                  <td className="py-2.5 px-4 text-blue-600">{totalAndares} andares</td>
                  <td className="py-2.5 px-4" colSpan={3}>{totalUnidades} unidades</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

// Formata o número do andar em label legível
function labelFloor(num: number, tipo: FloorTipo): string {
  if (tipo === 'SUBSOLO') return num < 0 ? `S${Math.abs(num)}` : `S${num}`;
  if (tipo === 'TERREO') return 'TÉR';
  if (tipo === 'MEZANINO') return 'MEZ';
  if (tipo === 'COBERTURA') return num === 1 ? 'COB' : `COB ${num}`;
  if (tipo === 'TECNICO') return `TEC ${num}`;
  if (tipo === 'GARAGEM') return `G${num}`;
  return String(num);
}

export default FloorEditor;
