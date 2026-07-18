import React from 'react';
import { OpuraCnoReduction } from '../types';
import { cnoService } from '../services/cnoService';
import { Plus, Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import { useConfirm } from './ui/confirm';

interface SeroReductionsManagerProps {
  organizationId: string;
  cnoRegistrationId: string;
  tipoObra: string | null;
}

export const SeroReductionsManager: React.FC<SeroReductionsManagerProps> = ({ organizationId, cnoRegistrationId, tipoObra }) => {
  const [reductions, setReductions] = React.useState<OpuraCnoReduction[]>([]);
  const [loading, setLoading] = React.useState(false);
  const confirm = useConfirm();

  const [form, setForm] = React.useState({
    nf_cnpj: '',
    nf_number: '',
    nf_date: '',
    nf_value: '',
    percent_used: '100'
  });

  const loadReductions = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await cnoService.listReductions(cnoRegistrationId);
      setReductions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [cnoRegistrationId]);

  React.useEffect(() => {
    loadReductions();
  }, [loadReductions]);

  const handleAdd = async () => {
    if (!form.nf_cnpj || !form.nf_number || !form.nf_date || !form.nf_value) return;
    setLoading(true);
    try {
      await cnoService.addReduction({
        organization_id: organizationId,
        cno_registration_id: cnoRegistrationId,
        nf_cnpj: form.nf_cnpj,
        nf_number: form.nf_number,
        nf_date: form.nf_date,
        nf_value: Number(form.nf_value)
      });
      setForm({ nf_cnpj: '', nf_number: '', nf_date: '', nf_value: '', percent_used: '100' });
      await loadReductions();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({ title: 'Excluir Nota', message: 'Remover nota de pré-moldado?', confirmLabel: 'Excluir', variant: 'danger' });
    if (!ok) return;
    setLoading(true);
    try {
      await cnoService.deleteReduction(id);
      await loadReductions();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalNFs = reductions.reduce((acc, curr) => acc + Number(curr.nf_value), 0);

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Pré-Moldados e Pré-Fabricados</h2>
          <p className="text-sm text-gray-500">Notas Fiscais para dedução de RMT (Aferição Indireta)</p>
        </div>
        {tipoObra !== 'alvenaria' && (
          <div className="bg-amber-50 text-amber-800 px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Redutor aplicável apenas para obras de Alvenaria.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">CNPJ Emissor</label>
          <input
            type="text"
            value={form.nf_cnpj}
            onChange={e => setForm(prev => ({ ...prev, nf_cnpj: e.target.value }))}
            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
            placeholder="00.000.000/0001-00"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Nº NF-e</label>
          <input
            type="text"
            value={form.nf_number}
            onChange={e => setForm(prev => ({ ...prev, nf_number: e.target.value }))}
            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
            placeholder="000123"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Data Emissão</label>
          <input
            type="date"
            value={form.nf_date}
            onChange={e => setForm(prev => ({ ...prev, nf_date: e.target.value }))}
            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Valor Total NF</label>
          <input
            type="number"
            value={form.nf_value}
            onChange={e => setForm(prev => ({ ...prev, nf_value: e.target.value }))}
            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
            placeholder="0.00"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={handleAdd}
            disabled={loading || tipoObra !== 'alvenaria'}
            className="w-full bg-indigo-600 text-white p-2 rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar Nota
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Fornecedor (CNPJ)</th>
              <th className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Número NF-e</th>
              <th className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Data Emissão</th>
              <th className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Valor Bruto</th>
              <th className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {reductions.map(red => (
              <tr key={red.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="py-3 px-4 text-sm font-medium text-gray-900">{red.nf_cnpj}</td>
                <td className="py-3 px-4 text-sm text-gray-600">NF: {red.nf_number}</td>
                <td className="py-3 px-4 text-sm text-gray-600">{new Date(red.nf_date).toLocaleDateString('pt-BR')}</td>
                <td className="py-3 px-4 text-sm font-bold text-gray-900 text-right">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(red.nf_value))}
                </td>
                <td className="py-3 px-4 text-right">
                  <button onClick={() => handleDelete(red.id)} className="text-gray-400 hover:text-red-600 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {reductions.length > 0 && (
              <tr className="bg-gray-50">
                <td colSpan={3} className="py-3 px-4 text-sm font-bold text-gray-700 text-right uppercase tracking-wider">
                  Total Declarado:
                </td>
                <td className="py-3 px-4 text-sm font-black text-indigo-600 text-right">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalNFs)}
                </td>
                <td></td>
              </tr>
            )}
            {reductions.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                  Nenhuma nota de pré-moldado cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
