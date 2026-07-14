// components/empreendimento/CommonAreaEditor.tsx
import React from 'react';
import { Plus, Loader2, Trees } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import Button from '../ui/Button';
import ActionIconButton from '../ui/ActionIconButton';
import {
  EmpreendimentoCommonArea, CommonAreaCategory, EmpreendimentoCommonAreaInsert,
} from '../../types';

interface Props {
  empreendimentoId: string;
}

const CATEGORY_LABELS: Record<CommonAreaCategory, string> = {
  LAZER: 'Lazer',
  COMUM: 'Comum',
  TECNICA: 'Técnica',
  CIRCULACAO: 'Circulação',
  GARAGEM: 'Garagem',
  OUTRO: 'Outro',
};

export const CommonAreaEditor: React.FC<Props> = ({ empreendimentoId }) => {
  const [areas, setAreas] = React.useState<EmpreendimentoCommonArea[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', category: 'LAZER' as CommonAreaCategory, area: '', floor: '', description: '' });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setAreas(await empreendimentoService.listCommonAreas(empreendimentoId));
    } catch (err) {
      console.error('[CommonAreaEditor] erro ao carregar áreas:', err);
    } finally {
      setLoading(false);
    }
  }, [empreendimentoId]);

  React.useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { alert('Informe o nome da área comum.'); return; }
    setSaving(true);
    try {
      const payload: EmpreendimentoCommonAreaInsert = {
        empreendimento_id: empreendimentoId,
        name: form.name.trim(),
        category: form.category,
        area: form.area ? Number(form.area) : undefined,
        floor: form.floor ? Number(form.floor) : undefined,
        description: form.description || undefined,
        is_vendavel: false,
      };
      await empreendimentoService.createCommonArea(payload);
      setForm({ name: '', category: 'LAZER', area: '', floor: '', description: '' });
      await load();
    } catch (err: any) {
      alert(`Erro ao adicionar área comum: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (area: EmpreendimentoCommonArea) => {
    if (!window.confirm(`Excluir a área "${area.name}"?`)) return;
    try {
      await empreendimentoService.deleteCommonArea(area.id);
      setAreas(prev => prev.filter(a => a.id !== area.id));
    } catch (err: any) {
      alert(`Erro ao excluir área: ${err.message}`);
    }
  };

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-blue-400';

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="bg-gray-50/60 border border-gray-100 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <input className={inputCls} placeholder="Nome (ex: Piscina)" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        <select className={inputCls} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as CommonAreaCategory }))}>
          {(Object.keys(CATEGORY_LABELS) as CommonAreaCategory[]).map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <input className={inputCls} placeholder="Área m²" type="number" step="0.01" value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} />
        <input className={inputCls} placeholder="Pav." type="number" value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} />
        <input className={inputCls} placeholder="Descrição" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
        <Button type="submit" disabled={saving} size="sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </Button>
      </form>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : areas.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Trees className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-xs font-semibold">Nenhuma área comum cadastrada.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {areas.map(a => (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-800 text-sm">{a.name}</h4>
                  <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">{CATEGORY_LABELS[a.category]}</span>
                </div>
                <p className="text-xs text-gray-400 font-medium mt-1">
                  {a.area != null ? `${a.area} m²` : 'sem área'}{a.floor != null ? ` · pav. ${a.floor}` : ''}
                </p>
                {a.description && <p className="text-xs text-gray-500 mt-1">{a.description}</p>}
              </div>
              <ActionIconButton kind="delete" onClick={() => handleDelete(a)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommonAreaEditor;
