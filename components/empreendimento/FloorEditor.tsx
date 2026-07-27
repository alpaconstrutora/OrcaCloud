// components/empreendimento/FloorEditor.tsx
// Cadastro de pavimentos template (Frente B). Modelo: template + materialização.
// Cada linha = um "tipo de andar" com nome, tipo, nº inicial, repetições e un./pav.
// O botão "Gerar Unidades" expande os templates nos andares reais via generateUnitsFromFloors.
import React from 'react';
import { Plus, Loader2, Layers, Zap, Check, X, AlertCircle } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
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

// Texto colorido, sem pílula/fundo/uppercase (ui_ux_guia_unificado.md §8).
const TIPO_STYLE: Record<FloorTipo, string> = {
  SUBSOLO:   'text-slate-600',
  TERREO:    'text-emerald-600',
  MEZANINO:  'text-teal-600',
  TIPO:      'text-blue-600',
  COBERTURA: 'text-violet-600',
  TECNICO:   'text-orange-600',
  GARAGEM:   'text-gray-600',
  OUTRO:     'text-rose-600',
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
  const confirm = useConfirm();
  const [notice, setNotice] = React.useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotice({ msg, type });
    setTimeout(() => setNotice(null), 4500);
  };

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
    if (!form.name.trim()) { notify('Informe o nome do pavimento.', 'error'); return; }
    if (!form.floor_number) { notify('Informe o número inicial do pavimento.', 'error'); return; }
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
      notify(`Erro ao adicionar pavimento: ${err.message}`, 'error');
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
    if (!editForm.name.trim()) { notify('Informe o nome do pavimento.', 'error'); return; }
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
      notify(`Erro ao salvar pavimento: ${err.message}`, 'error');
    }
  };

  const handleDelete = async (f: EmpreendimentoFloor) => {
    const ok = await confirm({
      title: `Excluir "${f.name}"?`,
      message: 'As unidades vinculadas a ele perdem a referência de pavimento (não são excluídas).',
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await empreendimentoService.deleteFloor(f.id);
      setFloors(prev => prev.filter(x => x.id !== f.id));
    } catch (err: any) {
      notify(`Erro ao excluir pavimento: ${err.message}`, 'error');
    }
  };

  const handleGenerate = async () => {
    if (!floors.length) { notify('Cadastre ao menos um pavimento antes de gerar unidades.', 'error'); return; }
    const ok = await confirm({
      title: `Gerar ${totalUnidades} unidades para "${tower.name}"?`,
      message: 'Atenção: as unidades existentes serão excluídas e recriadas a partir dos pavimentos.',
      confirmLabel: 'Gerar',
      variant: 'warning',
    });
    if (!ok) return;
    setGenerating(true);
    try {
      await empreendimentoService.deleteUnitsByTower(tower.id);
      await empreendimentoService.generateUnitsFromFloors(tower);
      onUnitsRegenerated?.();
    } catch (err: any) {
      notify(`Erro ao gerar unidades: ${err.message}`, 'error');
    } finally { setGenerating(false); }
  };

  const inputCls = 'h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white transition-all';
  const editCls  = 'px-2 py-1 border border-blue-200 rounded-[6px] text-xs font-medium outline-none focus:border-blue-400 bg-white';

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
        <h4 className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> Pavimentos
        </h4>
        {floors.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-gray-400 font-semibold">
            <span>{totalAndares} andares · {totalUnidades} unidades</span>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 h-8 px-3 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-xs transition-all active:scale-95 disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Gerar unidades ({totalUnidades})
            </button>
          </div>
        )}
      </div>

      {/* Formulário de adição */}
      <form onSubmit={handleAdd} className="bg-blue-50/40 border border-blue-100 rounded-[10px] p-3 grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Nome *</label>
          <input className={inputCls + ' w-full'} placeholder="ex: Pavimento Tipo" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Tipo *</label>
          <select className={inputCls + ' w-full'} value={form.tipo}
            onChange={e => setForm(p => ({ ...p, tipo: e.target.value as FloorTipo }))}>
            {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Nº inicial *</label>
          <input className={inputCls + ' w-full'} type="number" placeholder="ex: 1" value={form.floor_number}
            onChange={e => setForm(p => ({ ...p, floor_number: e.target.value }))} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Repete</label>
          <input className={inputCls + ' w-full'} type="number" min="1" placeholder="1" value={form.repeat_count}
            onChange={e => setForm(p => ({ ...p, repeat_count: e.target.value }))} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Un./pav.</label>
          <input className={inputCls + ' w-full'} type="number" min="1" placeholder="—" value={form.units_per_floor}
            onChange={e => setForm(p => ({ ...p, units_per_floor: e.target.value }))} />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Adicionar
        </button>
      </form>

      {/* Lista de pavimentos */}
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
      ) : floors.length === 0 ? (
        <p className="text-center text-xs text-gray-400 py-4">Nenhum pavimento cadastrado. Adicione acima para estruturar os andares da torre.</p>
      ) : (
        <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 font-semibold bg-gray-50/50">
                <th className="py-2.5 px-4">Nome</th>
                <th className="py-2.5 px-4">Tipo</th>
                <th className="py-2.5 px-4">Nº inicial</th>
                <th className="py-2.5 px-4">Repete</th>
                <th className="py-2.5 px-4">Un./pav.</th>
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
                            <button onClick={() => handleSaveEdit(f)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-[6px]"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-[6px]"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 px-4 font-normal text-gray-800">{f.name}</td>
                        <td className="py-2.5 px-4">
                          <span className={`text-xs font-normal ${TIPO_STYLE[f.tipo]}`}>
                            {TIPO_OPTIONS.find(o => o.value === f.tipo)?.label ?? f.tipo}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-gray-500 font-normal">{f.floor_number}</td>
                        <td className="py-2.5 px-4 text-gray-500 font-normal">
                          {f.repeat_count > 1 ? <span className="text-blue-600">{f.repeat_count}×</span> : '1×'}
                        </td>
                        <td className="py-2.5 px-4 text-gray-500 font-normal">{upf != null ? upf : <span className="text-gray-300">—</span>}</td>
                        <td className="py-2.5 px-4 text-gray-500 text-xs font-normal">{rangeStr}</td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <ActionIconButton kind="edit" size="sm" onClick={() => startEdit(f)} />
                            <ActionIconButton kind="delete" size="sm" onClick={() => handleDelete(f)} />
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
                    <span className="text-[10px] font-semibold text-gray-400">Total</span>
                  </td>
                  <td className="py-2.5 px-4 text-blue-600">{totalAndares} andares</td>
                  <td className="py-2.5 px-4" colSpan={3}>{totalUnidades} unidades</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

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
