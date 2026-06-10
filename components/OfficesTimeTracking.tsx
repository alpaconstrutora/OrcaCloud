import React from 'react';
import { officesService } from '../services/officesService';
import { supabase } from '../lib/supabase';
import { OfficesTimesheet } from '../types';

interface OfficesTimeTrackingProps {
  userId: string;
}

const OfficesTimeTracking: React.FC<OfficesTimeTrackingProps> = ({ userId }) => {
  const [loading, setLoading] = React.useState(false);
  const [projetos, setProjetos] = React.useState<{ id: string; name: string }[]>([]);
  const [selectedProjetoId, setSelectedProjetoId] = React.useState('');
  const [timesheetEntries, setTimesheetEntries] = React.useState<OfficesTimesheet[]>([]);

  // Campos do formulário
  const [horas, setHoras] = React.useState('');
  const [descricaoAtividade, setDescricaoAtividade] = React.useState('');
  const [dataLancamento, setDataLancamento] = React.useState(new Date().toISOString().substring(0, 10));

  // Carregar projetos no início
  React.useEffect(() => {
    const fetchProjetos = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('projects')
          .select('id, name')
          .order('name', { ascending: true });

        if (error) throw error;
        setProjetos(data || []);
        if (data && data.length > 0) {
          setSelectedProjetoId(data[0].id);
        }
      } catch (err) {
        console.error('Erro ao buscar projetos:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProjetos();
  }, []);

  // Carregar lançamentos de horas do projeto selecionado
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

  React.useEffect(() => {
    loadHours();
  }, [loadHours]);

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

      // Limpar campos de entrada do form
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

  // Soma de horas lançadas no projeto selecionado
  const totalHorasProjeto = timesheetEntries.reduce((sum, entry) => sum + Number(entry.horas), 0);

  return (
    <div className="p-5 flex flex-col h-full space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-white tracking-tight">Timesheet / Horas Trabalhadas</h1>
        <p className="text-xs font-semibold text-slate-400">Controle e lançamento de horas em projetos</p>
      </div>

      {/* Lançador de Horas Form */}
      <form
        onSubmit={handleSaveHours}
        className="bg-slate-950/50 border border-slate-850 p-4 rounded-3xl space-y-4"
      >
        <span className="block text-[9px] font-black uppercase tracking-widest text-orange-500">Lançar Nova Atividade</span>
        
        <div className="space-y-3">
          {/* Seletor de Projeto */}
          <div className="space-y-1">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Projeto</label>
            <select
              value={selectedProjetoId}
              onChange={(e) => setSelectedProjetoId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-orange-500 mt-1"
            >
              {projetos.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Horas */}
            <div className="space-y-1">
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Tempo (Horas)</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                placeholder="Ex: 1.5 ou 4"
                value={horas}
                onChange={(e) => setHoras(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-orange-500 mt-1"
              />
            </div>

            {/* Data Lançamento */}
            <div className="space-y-1">
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Data da Atividade</label>
              <input
                type="date"
                value={dataLancamento}
                onChange={(e) => setDataLancamento(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-orange-500 mt-1"
              />
            </div>
          </div>

          {/* Descrição Atividade */}
          <div className="space-y-1">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Atividade Realizada</label>
            <input
              type="text"
              placeholder="Ex: Detalhamento de gesso no CAD ou Visita técnica à obra"
              value={descricaoAtividade}
              onChange={(e) => setDescricaoAtividade(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-orange-500 mt-1"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!selectedProjetoId || loading}
          className="w-full py-2.5 bg-gradient-to-tr from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-55"
        >
          ⏱️ Registrar Horas
        </button>
      </form>

      {/* Histórico do Projeto Selecionado */}
      <div className="space-y-3">
        <div className="flex justify-between items-center bg-slate-950 px-4 py-2.5 border border-slate-850 rounded-2xl">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400">Histórico do Projeto</span>
          {selectedProjetoId && (
            <span className="text-xs font-black text-orange-500">
              Total: {totalHorasProjeto}h trabalhadas
            </span>
          )}
        </div>

        {loading && timesheetEntries.length === 0 && (
          <div className="text-center py-6">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span className="text-xs text-slate-400">Carregando histórico...</span>
          </div>
        )}

        {!loading && timesheetEntries.length === 0 && selectedProjetoId && (
          <div className="text-center py-8 border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
            Nenhuma hora registrada para este projeto ainda.
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          {timesheetEntries.map(entry => (
            <div
              key={entry.id}
              className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl flex items-center justify-between"
            >
              <div className="space-y-1 max-w-[75%]">
                <span className="block font-black text-xs text-white">{entry.descricao_atividade || 'Atividade geral'}</span>
                <span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">
                  Data: {new Date(entry.data_lancamento).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-black text-orange-500 text-sm">{entry.horas}h</span>
                <button
                  onClick={() => handleDeleteEntry(entry.id)}
                  className="w-7 h-7 rounded-lg bg-red-950/40 border border-red-900/30 text-red-500 text-xs flex items-center justify-center hover:bg-red-900/30 transition-colors"
                  title="Excluir"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OfficesTimeTracking;
