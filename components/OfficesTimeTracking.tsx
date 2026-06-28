import React from 'react';
import { officesService } from '../services/officesService';
import { supabase } from '../lib/supabase';
import { OfficesTimesheet } from '../types';
import { Clock, Trash2, Plus, Calendar, Briefcase, TrendingUp } from 'lucide-react';

interface OfficesTimeTrackingProps {
  userId: string;
}

const OfficesTimeTracking: React.FC<OfficesTimeTrackingProps> = ({ userId }) => {
  const [loading, setLoading] = React.useState(false);
  const [projetos, setProjetos] = React.useState<{ id: string; name: string }[]>([]);
  const [selectedProjetoId, setSelectedProjetoId] = React.useState('');
  const [timesheetEntries, setTimesheetEntries] = React.useState<OfficesTimesheet[]>([]);

  const [horas, setHoras] = React.useState('');
  const [descricaoAtividade, setDescricaoAtividade] = React.useState('');
  const [dataLancamento, setDataLancamento] = React.useState(new Date().toISOString().substring(0, 10));

  React.useEffect(() => {
    const fetchProjetos = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.from('projects').select('id, name').order('name', { ascending: true });
        if (error) throw error;
        setProjetos(data || []);
        if (data?.length) setSelectedProjetoId(data[0].id);
      } catch (err) {
        console.error('Erro ao buscar projetos:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProjetos();
  }, []);

  const loadHours = React.useCallback(async () => {
    if (!selectedProjetoId) return;
    try {
      setLoading(true);
      const data = await officesService.listTimesheetByProjeto(selectedProjetoId);
      setTimesheetEntries(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar horas do projeto.');
    } finally {
      setLoading(false);
    }
  }, [selectedProjetoId]);

  React.useEffect(() => { loadHours(); }, [loadHours]);

  const handleSaveHours = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!horas || Number(horas) <= 0 || !selectedProjetoId) {
      alert('Por favor, informe uma quantidade válida de horas e selecione um projeto.');
      return;
    }
    try {
      setLoading(true);
      await officesService.saveTimesheetEntry({
        user_id: userId,
        projeto_id: selectedProjetoId,
        horas: Number(horas),
        descricao_atividade: descricaoAtividade.trim() || undefined,
        data_lancamento: dataLancamento
      });
      setHoras('');
      setDescricaoAtividade('');
      setDataLancamento(new Date().toISOString().substring(0, 10));
      loadHours();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao salvar horas.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Deseja realmente excluir este lançamento de horas?')) return;
    try {
      setLoading(true);
      await officesService.deleteTimesheetEntry(id);
      loadHours();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir horas.');
    } finally {
      setLoading(false);
    }
  };

  const totalHorasProjeto = timesheetEntries.reduce((s, e) => s + Number(e.horas), 0);
  const projetoAtual = projetos.find(p => p.id === selectedProjetoId);

  return (
    <div className="p-6 space-y-6 bg-[#F3F7F9] text-slate-700 min-h-screen pb-24">

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Gestão de Horas</h1>
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1.5">ÒPURA Offices / Timesheet</p>
      </div>

      {/* ── KPIs do projeto selecionado ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200/50 p-4 rounded-[20px] shadow-[0_4px_16px_rgb(0,0,0,0.03)] col-span-1">
          <span className="block text-[8.5px] font-black uppercase tracking-widest text-slate-400">Total Horas</span>
          <span className="block text-2xl font-black text-slate-800 mt-1">{totalHorasProjeto}h</span>
          <span className="block text-[8.5px] text-slate-400 mt-0.5">{projetoAtual?.name || '—'}</span>
        </div>
        <div className="bg-white border border-slate-200/50 p-4 rounded-[20px] shadow-[0_4px_16px_rgb(0,0,0,0.03)]">
          <span className="block text-[8.5px] font-black uppercase tracking-widest text-slate-400">Lançamentos</span>
          <span className="block text-2xl font-black text-slate-800 mt-1">{timesheetEntries.length}</span>
          <span className="block text-[8.5px] text-slate-400 mt-0.5">registros</span>
        </div>
        <div className="bg-white border border-slate-200/50 p-4 rounded-[20px] shadow-[0_4px_16px_rgb(0,0,0,0.03)]">
          <span className="block text-[8.5px] font-black uppercase tracking-widest text-slate-400">Média / Lançamento</span>
          <span className="block text-2xl font-black text-[#D47A55] mt-1">
            {timesheetEntries.length ? (totalHorasProjeto / timesheetEntries.length).toFixed(1) : '0'}h
          </span>
          <span className="block text-[8.5px] text-slate-400 mt-0.5">por atividade</span>
        </div>
      </div>

      {/* ── Formulário de Lançamento ──────────────────────────────────────── */}
      <form onSubmit={handleSaveHours} className="bg-white border border-slate-200/50 p-5 rounded-[28px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#D47A55]/10 rounded-lg flex items-center justify-center">
            <Plus className="w-4 h-4 text-[#D47A55]" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-[#D47A55]">Lançar Nova Atividade</span>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Projeto</label>
            <div className="relative">
              <Briefcase className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-300" />
              <select
                value={selectedProjetoId}
                onChange={e => setSelectedProjetoId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-[#D47A55] font-medium"
              >
                {projetos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Tempo (Horas)</label>
              <div className="relative">
                <Clock className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-300" />
                <input
                  type="number" step="0.5" min="0.5" placeholder="Ex: 1.5 ou 4"
                  value={horas} onChange={e => setHoras(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-[#D47A55] font-medium"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Data da Atividade</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-300" />
                <input
                  type="date" value={dataLancamento} onChange={e => setDataLancamento(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-[#D47A55] font-medium"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Atividade Realizada</label>
            <input
              type="text" placeholder="Ex: Detalhamento de gesso no CAD ou Visita técnica à obra"
              value={descricaoAtividade} onChange={e => setDescricaoAtividade(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-[#D47A55] font-medium"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!selectedProjetoId || loading}
          className="w-full py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-md shadow-[#D47A55]/15 active:scale-[0.98] disabled:opacity-50 transition-all"
        >
          Registrar Horas
        </button>
      </form>

      {/* ── Tabela de Histórico ───────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/50 rounded-[28px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#D47A55]" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Histórico — {projetoAtual?.name || 'Projeto'}
            </h2>
          </div>
          <span className="text-[10px] font-black text-[#D47A55]">Total: {totalHorasProjeto}h</span>
        </div>

        {loading && timesheetEntries.length === 0 ? (
          <div className="flex flex-col items-center py-10">
            <div className="w-6 h-6 border-2 border-[#D47A55] border-t-transparent rounded-full animate-spin mb-2" />
            <span className="text-[10px] text-slate-400">Carregando histórico...</span>
          </div>
        ) : timesheetEntries.length === 0 ? (
          <div className="text-center py-12 text-[11px] text-slate-400">
            Nenhuma hora registrada para este projeto ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[8.5px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3">Atividade</th>
                  <th className="px-3 py-3 hidden sm:table-cell">Data</th>
                  <th className="px-3 py-3 text-right">Horas</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {timesheetEntries.map(entry => (
                  <tr key={entry.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors group">
                    <td className="px-5 py-3.5">
                      <span className="block text-xs font-black text-slate-700">{entry.descricao_atividade || 'Atividade geral'}</span>
                    </td>
                    <td className="px-3 py-3.5 text-[11px] text-slate-500 hidden sm:table-cell">
                      {new Date(entry.data_lancamento).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <span className="font-black text-[#D47A55] text-sm">{entry.horas}h</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="p-1.5 text-slate-300 hover:text-rose-400 rounded-lg hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficesTimeTracking;
