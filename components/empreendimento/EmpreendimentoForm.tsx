// components/empreendimento/EmpreendimentoForm.tsx
import React from 'react';
import { X, Loader2, Building2 } from 'lucide-react';
import CityStateSelect from '../CityStateSelect';
import { empreendimentoService } from '../../services/empreendimentoService';
import { imovibService } from '../../services/imovibService';
import {
  Empreendimento, EmpreendimentoStatus, EmpreendimentoInsert, ImovibStudy,
} from '../../types';

interface Props {
  organizationId: string;
  editing?: Empreendimento | null;
  onClose: () => void;
  onSaved: (e: Empreendimento) => void;
}

const STATUS_OPTIONS: { value: EmpreendimentoStatus; label: string }[] = [
  { value: 'PLANEJAMENTO', label: 'Planejamento' },
  { value: 'LANCAMENTO', label: 'Lançamento' },
  { value: 'EM_OBRAS', label: 'Em Obras' },
  { value: 'ENTREGUE', label: 'Entregue' },
  { value: 'ENCERRADO', label: 'Encerrado' },
];

export const EmpreendimentoForm: React.FC<Props> = ({ organizationId, editing, onClose, onSaved }) => {
  const [saving, setSaving] = React.useState(false);
  const [studies, setStudies] = React.useState<ImovibStudy[]>([]);
  const [form, setForm] = React.useState({
    name: editing?.name ?? '',
    code: editing?.code ?? '',
    status: (editing?.status ?? 'PLANEJAMENTO') as EmpreendimentoStatus,
    imovib_study_id: editing?.imovib_study_id ?? '',
    spe_razao_social: editing?.spe_razao_social ?? '',
    spe_cnpj: editing?.spe_cnpj ?? '',
    spe_nome_fantasia: editing?.spe_nome_fantasia ?? '',
    developer_name: editing?.developer_name ?? '',
    manager: editing?.manager ?? '',
    launch_date: editing?.launch_date ?? '',
    expected_delivery_date: editing?.expected_delivery_date ?? '',
    terreno_street: editing?.terreno_street ?? '',
    terreno_number: editing?.terreno_number ?? '',
    terreno_neighborhood: editing?.terreno_neighborhood ?? '',
    terreno_city: editing?.terreno_city ?? '',
    terreno_state: editing?.terreno_state ?? '',
    terreno_zip_code: editing?.terreno_zip_code ?? '',
    terreno_area: editing?.terreno_area?.toString() ?? '',
    vgv_total: editing?.vgv_total?.toString() ?? '',
  });

  React.useEffect(() => {
    imovibService.getStudies(organizationId).then(setStudies).catch(() => setStudies([]));
  }, [organizationId]);

  const set = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { alert('Informe o nome do empreendimento.'); return; }
    setSaving(true);
    try {
      const payload: Partial<EmpreendimentoInsert> = {
        organization_id: organizationId,
        name: form.name.trim(),
        code: form.code || undefined,
        status: form.status,
        imovib_study_id: form.imovib_study_id || null,
        spe_razao_social: form.spe_razao_social || undefined,
        spe_cnpj: form.spe_cnpj || undefined,
        spe_nome_fantasia: form.spe_nome_fantasia || undefined,
        developer_name: form.developer_name || undefined,
        manager: form.manager || undefined,
        launch_date: form.launch_date || undefined,
        expected_delivery_date: form.expected_delivery_date || undefined,
        terreno_street: form.terreno_street || undefined,
        terreno_number: form.terreno_number || undefined,
        terreno_neighborhood: form.terreno_neighborhood || undefined,
        terreno_city: form.terreno_city || undefined,
        terreno_state: form.terreno_state || undefined,
        terreno_zip_code: form.terreno_zip_code || undefined,
        terreno_area: form.terreno_area ? Number(form.terreno_area) : undefined,
        vgv_total: form.vgv_total ? Number(form.vgv_total) : undefined,
      };

      const saved = editing
        ? await empreendimentoService.update(editing.id, payload)
        : await empreendimentoService.create(payload as EmpreendimentoInsert);
      onSaved(saved);
    } catch (err: any) {
      alert(`Erro ao salvar empreendimento: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-blue-400';
  const labelCls = 'text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 block';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            {editing ? 'Editar Empreendimento' : 'Novo Empreendimento'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Identificação */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>Nome *</label>
              <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Código</label>
              <input className={inputCls} value={form.code} onChange={e => set('code', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Estudo de Viabilidade (Imovib)</label>
              <select className={inputCls} value={form.imovib_study_id} onChange={e => set('imovib_study_id', e.target.value)}>
                <option value="">— Sem vínculo —</option>
                {studies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* SPE */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">SPE</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Razão Social</label>
                <input className={inputCls} value={form.spe_razao_social} onChange={e => set('spe_razao_social', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>CNPJ</label>
                <input className={inputCls} value={form.spe_cnpj} onChange={e => set('spe_cnpj', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Nome Fantasia</label>
                <input className={inputCls} value={form.spe_nome_fantasia} onChange={e => set('spe_nome_fantasia', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Incorporadora</label>
                  <input className={inputCls} value={form.developer_name} onChange={e => set('developer_name', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Gestor</label>
                  <input className={inputCls} value={form.manager} onChange={e => set('manager', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Terreno */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Terreno</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className={labelCls}>Logradouro</label>
                <input className={inputCls} value={form.terreno_street} onChange={e => set('terreno_street', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Número</label>
                <input className={inputCls} value={form.terreno_number} onChange={e => set('terreno_number', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Bairro</label>
                <input className={inputCls} value={form.terreno_neighborhood} onChange={e => set('terreno_neighborhood', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <CityStateSelect
                  cep={form.terreno_zip_code || undefined}
                  stateCode={form.terreno_state || undefined}
                  cityName={form.terreno_city || undefined}
                  onChange={({ cep, stateCode, cityName }) => setForm(prev => ({
                    ...prev,
                    terreno_zip_code: cep ?? '',
                    terreno_state: stateCode ?? '',
                    terreno_city: cityName ?? '',
                  }))}
                />
              </div>
              <div>
                <label className={labelCls}>Área do Terreno (m²)</label>
                <input type="number" step="0.01" className={inputCls} value={form.terreno_area} onChange={e => set('terreno_area', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Comercial / datas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>VGV Total (R$)</label>
              <input type="number" step="0.01" className={inputCls} value={form.vgv_total} onChange={e => set('vgv_total', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Lançamento</label>
              <input type="date" className={inputCls} value={form.launch_date} onChange={e => set('launch_date', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Previsão de Entrega</label>
              <input type="date" className={inputCls} value={form.expected_delivery_date} onChange={e => set('expected_delivery_date', e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-gray-600 font-bold text-xs uppercase tracking-widest hover:bg-gray-100 rounded-xl">Cancelar</button>
            <button type="submit" disabled={saving} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmpreendimentoForm;
