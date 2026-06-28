import React, { useEffect, useState } from 'react';
import { reformasService } from '../services/reformasService';
import { ReformaCronograma, ReformaCronogramaStatus } from '../types';
import { Calendar, CheckSquare, Clock, Plus, Trash2, Loader2, Play, Check } from 'lucide-react';

interface ReformasCronogramaProps {
  userId: string;
}

const ReformasCronograma: React.FC<ReformasCronogramaProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [reformaId, setReformaId] = useState('');
  const [cronograma, setCronograma] = useState<ReformaCronograma[]>([]);

  // Novo item
  const [tarefa, setTarefa] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [dataLimite, setDataLimite] = useState('');
  const [saving, setSaving] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);

  const loadData = async () => {
    const active = localStorage.getItem('opura_reformas_ativa');
    if (!active) {
      setLoading(false);
      return;
    }
    setReformaId(active);

    try {
      setLoading(true);
      const data = await reformasService.listCronogramaByReforma(active);
      setCronograma(data);
    } catch (err) {
      console.error('Erro ao buscar cronograma:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tarefa) return;

    try {
      setSaving(true);
      await reformasService.saveCronogramaItem({
        user_id: userId,
        reforma_id: reformaId,
        tarefa: tarefa.trim(),
        responsavel: responsavel.trim() || undefined,
        data_limite: dataLimite || undefined,
        status: 'PENDENTE'
      });

      setTarefa('');
      setResponsavel('');
      setDataLimite('');

      // Recarregar
      const updated = await reformasService.listCronogramaByReforma(reformaId);
      setCronograma(updated);
    } catch (err: any) {
      alert('Erro ao salvar etapa: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (itemId: string, newStatus: ReformaCronogramaStatus) => {
    const item = cronograma.find(c => c.id === itemId);
    if (!item) return;

    try {
      setSubmittingAction(itemId);
      await reformasService.saveCronogramaItem({
        ...item,
        status: newStatus
      });

      setCronograma(prev => prev.map(c => c.id === itemId ? { ...c, status: newStatus } : c));
    } catch (err: any) {
      alert('Erro ao atualizar status: ' + err.message);
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta etapa da reforma?')) return;

    try {
      setLoading(true);
      await reformasService.deleteCronogramaItem(id);
      const updated = await reformasService.listCronogramaByReforma(reformaId);
      setCronograma(updated);
    } catch (err: any) {
      alert('Erro ao excluir: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!reformaId) {
    return (
      <div className="text-center py-20 px-6">
        <CheckSquare className="w-12 h-12 text-slate-650 mx-auto mb-4" />
        <h3 className="text-sm font-bold text-slate-300">Selecione uma Reforma</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-[200px] mx-auto">Vá para o Painel e selecione ou cadastre uma reforma para visualizar o cronograma.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
        <Loader2 className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3 text-orange-500" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Etapas...</span>
      </div>
    );
  }

  const totalTasks = cronograma.length;
  const completedTasks = cronograma.filter(c => c.status === 'CONCLUIDO').length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-white tracking-tight">Etapas da Reforma</h1>
        <p className="text-xs font-semibold text-slate-400">Checklist e controle físico da obra</p>
      </div>

      {/* Barra de Progresso Geral */}
      {totalTasks > 0 && (
        <div className="bg-[#0D1224] p-4 border border-white/5 rounded-2xl space-y-2.5 shadow-xl">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-400">Progresso Físico Geral</span>
            <span className="font-black text-orange-500">{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-900 border border-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-600 to-amber-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider text-right">
            {completedTasks} de {totalTasks} etapas concluídas
          </p>
        </div>
      )}

      {/* Adicionar nova Etapa */}
      <form onSubmit={handleCreateItem} className="bg-[#0D1224] p-4 border border-white/5 rounded-2xl space-y-3.5 shadow-md">
        <span className="text-xs font-black uppercase tracking-widest text-orange-500 block">
          Adicionar Nova Etapa
        </span>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Nome da etapa (Ex: Pintura, Demolição, Pias)"
            value={tarefa}
            onChange={(e) => setTarefa(e.target.value)}
            className="w-full bg-[#070913] border border-white/5 rounded-xl px-3 py-2.5 text-form-input text-white outline-none focus:border-orange-500"
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Responsável (opcional)"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              className="w-full bg-[#070913] border border-white/5 rounded-xl px-3 py-2.5 text-form-input text-white outline-none focus:border-orange-500"
            />
            <input
              type="date"
              value={dataLimite}
              onChange={(e) => setDataLimite(e.target.value)}
              className="w-full bg-[#070913] border border-white/5 rounded-xl px-3 py-2.5 text-form-input text-white outline-none focus:border-orange-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 bg-gradient-to-tr from-orange-600 to-amber-500 text-white text-button font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Adicionar Etapa
        </button>
      </form>

      {/* Lista de Etapas */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Cronograma</h2>

        {cronograma.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-white/5 rounded-3xl bg-white/5 px-4 text-xs text-slate-500">
            Nenhuma etapa cadastrada para esta reforma ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {cronograma.map(item => {
              const isWorking = submittingAction === item.id;
              
              return (
                <div
                  key={item.id}
                  className={`bg-[#0D1224] border p-4 rounded-2xl flex items-center justify-between transition-all duration-200 ${
                    item.status === 'CONCLUIDO' 
                      ? 'border-emerald-500/10 bg-[#0D1224]/50 opacity-70' 
                      : 'border-white/5'
                  }`}
                >
                  <div className="space-y-1 max-w-[65%]">
                    <span className={`block font-bold text-xs text-white ${item.status === 'CONCLUIDO' ? 'line-through text-slate-500' : ''}`}>
                      {item.tarefa}
                    </span>
                    <div className="flex flex-wrap gap-2 text-[9px] font-semibold text-slate-400">
                      {item.responsavel && (
                        <span>👤 {item.responsavel}</span>
                      )}
                      {item.data_limite && (
                        <span className="flex items-center gap-1">
                          📅 {new Date(item.data_limite).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações Rápidas de Status */}
                  <div className="flex items-center gap-2">
                    {isWorking ? (
                      <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                    ) : (
                      <>
                        {item.status === 'PENDENTE' && (
                          <button
                            onClick={() => handleUpdateStatus(item.id, 'EM_ANDAMENTO')}
                            className="p-2 bg-white/5 hover:bg-orange-500/20 text-slate-400 hover:text-orange-400 border border-white/5 rounded-xl transition-all active:scale-95"
                            title="Iniciar Etapa"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.status === 'EM_ANDAMENTO' && (
                          <button
                            onClick={() => handleUpdateStatus(item.id, 'CONCLUIDO')}
                            className="p-2 bg-orange-500/10 hover:bg-emerald-500/20 text-orange-400 hover:text-emerald-400 border border-orange-500/20 rounded-xl transition-all active:scale-95"
                            title="Concluir Etapa"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.status === 'CONCLUIDO' && (
                          <button
                            onClick={() => handleUpdateStatus(item.id, 'PENDENTE')}
                            className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl transition-all active:scale-95"
                            title="Reiniciar Etapa"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-2 bg-white/5 hover:bg-rose-950/20 text-slate-400 hover:text-rose-500 border border-white/5 rounded-xl transition-colors"
                          title="Excluir Etapa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReformasCronograma;
