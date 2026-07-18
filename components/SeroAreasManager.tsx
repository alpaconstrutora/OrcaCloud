import React from 'react';
import { OpuraCnoArea, OpuraCnoAreaInsert } from '../types';
import { cnoService } from '../services/cnoService';
import { Plus, Trash2, CheckCircle, RefreshCw } from 'lucide-react';
import { useConfirm } from './ui/confirm';

interface SeroAreasManagerProps {
  organizationId: string;
  cnoRegistrationId: string;
}

export const SeroAreasManager: React.FC<SeroAreasManagerProps> = ({ organizationId, cnoRegistrationId }) => {
  const [areas, setAreas] = React.useState<OpuraCnoArea[]>([]);
  const [loading, setLoading] = React.useState(false);
  const confirm = useConfirm();

  const [form, setForm] = React.useState({
    area_type: 'principal' as 'principal' | 'complementar',
    is_covered: true,
    total_area: ''
  });

  const loadAreas = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await cnoService.listAreas(cnoRegistrationId);
      setAreas(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [cnoRegistrationId]);

  React.useEffect(() => {
    loadAreas();
  }, [loadAreas]);

  const handleAdd = async () => {
    if (!form.total_area || Number(form.total_area) <= 0) return;
    setLoading(true);
    try {
      await cnoService.addArea({
        organization_id: organizationId,
        cno_registration_id: cnoRegistrationId,
        area_type: form.area_type,
        is_covered: form.area_type === 'principal' ? true : form.is_covered,
        total_area: Number(form.total_area)
      });
      setForm({ area_type: 'principal', is_covered: true, total_area: '' });
      await loadAreas();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({ title: 'Excluir Área', message: 'Tem certeza?', confirmLabel: 'Excluir', variant: 'danger' });
    if (!ok) return;
    setLoading(true);
    try {
      await cnoService.deleteArea(id);
      await loadAreas();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Áreas da Obra (Aferição Indireta)</h2>
      <p className="text-sm text-gray-500 mb-6">Cadastre as áreas principais e complementares da obra para calcular a Área Equivalente conforme o SERO.</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Tipo de Área</label>
          <select
            value={form.area_type}
            onChange={e => setForm(prev => ({ ...prev, area_type: e.target.value as 'principal' | 'complementar' }))}
            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
          >
            <option value="principal">Área Principal</option>
            <option value="complementar">Área Complementar</option>
          </select>
        </div>

        {form.area_type === 'complementar' && (
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Cobertura</label>
            <select
              value={form.is_covered ? 'sim' : 'nao'}
              onChange={e => setForm(prev => ({ ...prev, is_covered: e.target.value === 'sim' }))}
              className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
            >
              <option value="sim">Coberta (Redução 50%)</option>
              <option value="nao">Descoberta (Redução 75%)</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Área Total (m²)</label>
          <input
            type="number"
            value={form.total_area}
            onChange={e => setForm(prev => ({ ...prev, total_area: e.target.value }))}
            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
            placeholder="Ex: 150.50"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={handleAdd}
            disabled={loading}
            className="w-full bg-indigo-600 text-white p-2 rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar Área
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Tipo</th>
              <th className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Características</th>
              <th className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Metragem Real</th>
              <th className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Equivalência Sero</th>
              <th className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {areas.map(area => {
              let equivalente = Number(area.total_area);
              if (area.area_type === 'complementar') {
                equivalente = area.is_covered ? equivalente * 0.5 : equivalente * 0.25;
              }
              return (
                <tr key={area.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-3 px-4 text-sm font-medium text-gray-900 capitalize">{area.area_type}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {area.area_type === 'principal' ? '100% da área' : (area.is_covered ? 'Coberta (50%)' : 'Descoberta (25%)')}
                  </td>
                  <td className="py-3 px-4 text-sm font-bold text-gray-900">{Number(area.total_area).toFixed(2)} m²</td>
                  <td className="py-3 px-4 text-sm font-bold text-indigo-600">{equivalente.toFixed(2)} m²</td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => handleDelete(area.id)} className="text-gray-400 hover:text-red-600 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {areas.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                  Nenhuma área cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
