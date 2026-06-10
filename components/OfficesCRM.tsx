import React from 'react';
import { officesService } from '../services/officesService';
import { OfficesLead, OfficesLeadStatus } from '../types';

interface OfficesCRMProps {
  userId: string;
}

const STAGES: { id: OfficesLeadStatus; label: string; color: string }[] = [
  { id: 'BRIEFING', label: 'Briefing / Contato', color: 'bg-slate-700/50 text-slate-300 border-slate-700' },
  { id: 'PROPOSTA', label: 'Proposta Enviada', color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  { id: 'CONTRATADO', label: 'Contratado (Fechado)', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { id: 'PERDIDO', label: 'Perdido', color: 'bg-red-500/10 text-red-400 border-red-500/30' }
];

const OfficesCRM: React.FC<OfficesCRMProps> = ({ userId }) => {
  const [loading, setLoading] = React.useState(true);
  const [leads, setLeads] = React.useState<OfficesLead[]>([]);
  const [editingLead, setEditingLead] = React.useState<Partial<OfficesLead> | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // Estados dos campos do formulário
  const [nomeCliente, setNomeCliente] = React.useState('');
  const [contato, setContato] = React.useState('');
  const [briefing, setBriefing] = React.useState('');
  const [valorEstimado, setValorEstimado] = React.useState('');
  const [status, setStatus] = React.useState<OfficesLeadStatus>('BRIEFING');

  const loadLeads = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await officesService.listLeads(userId);
      setLeads(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar leads do CRM.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const handleOpenNew = () => {
    setEditingLead(null);
    setNomeCliente('');
    setContato('');
    setBriefing('');
    setValorEstimado('');
    setStatus('BRIEFING');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (lead: OfficesLead) => {
    setEditingLead(lead);
    setNomeCliente(lead.nome_cliente);
    setContato(lead.contato || '');
    setBriefing(lead.briefing || '');
    setValorEstimado(lead.valor_estimado.toString());
    setStatus(lead.status);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeCliente) {
      alert('Por favor, informe o nome do cliente.');
      return;
    }

    try {
      setLoading(true);
      await officesService.saveLead({
        id: editingLead?.id,
        user_id: userId,
        nome_cliente: nomeCliente,
        contato: contato || undefined,
        briefing: briefing || undefined,
        valor_estimado: Number(valorEstimado || 0),
        status: status
      });

      setIsModalOpen(false);
      loadLeads();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao salvar o lead.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente deletar este lead e todo o briefing?')) return;
    try {
      setLoading(true);
      await officesService.deleteLead(id);
      setIsModalOpen(false);
      loadLeads();
    } catch (err) {
      console.error(err);
      alert('Erro ao deletar lead.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando CRM...</span>
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">CRM & Prospecção</h1>
          <p className="text-xs font-semibold text-slate-400">Gestão de contatos e briefing de projetos</p>
        </div>
        <button
          onClick={handleOpenNew}
          className="px-4 py-2 bg-gradient-to-tr from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-orange-950/20 active:scale-95"
        >
          + Novo Lead
        </button>
      </div>

      {/* Pipeline / Grid de Cards */}
      <div className="space-y-6">
        {STAGES.map(stage => {
          const stageLeads = leads.filter(l => l.status === stage.id);
          return (
            <div key={stage.id} className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${stage.color}`}>
                  {stage.label}
                </span>
                <span className="text-xs text-slate-500 font-bold">({stageLeads.length})</span>
              </div>

              {stageLeads.length === 0 ? (
                <div className="text-[10px] text-slate-600 py-3 px-4 border border-slate-850 rounded-2xl bg-slate-950/20 italic">
                  Nenhum projeto nesta etapa do funil.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {stageLeads.map(l => (
                    <div
                      key={l.id}
                      onClick={() => handleOpenEdit(l)}
                      className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl flex flex-col gap-2 hover:bg-slate-950/80 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-black text-sm text-white">{l.nome_cliente}</span>
                        <span className="font-bold text-slate-300 text-xs">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(l.valor_estimado)}
                        </span>
                      </div>
                      {l.briefing && (
                        <p className="text-xs text-slate-400 line-clamp-2">{l.briefing}</p>
                      )}
                      {l.contato && (
                        <span className="text-[9px] font-bold text-slate-500">📞 {l.contato}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal de Cadastro/Edição de Lead */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form
            onSubmit={handleSave}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-orange-500">
                {editingLead ? 'Editar Lead' : 'Novo Lead / Oportunidade'}
              </span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 text-lg hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              {/* Nome do Cliente */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Cliente</label>
                <input
                  type="text"
                  placeholder="Nome completo do lead"
                  value={nomeCliente}
                  onChange={(e) => setNomeCliente(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                />
              </div>

              {/* Contato */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Contato (Telefone / Email)</label>
                <input
                  type="text"
                  placeholder="Ex: (11) 98888-8888 ou joao@email.com"
                  value={contato}
                  onChange={(e) => setContato(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                />
              </div>

              {/* Valor Estimado */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Valor Estimado do Contrato (R$)</label>
                <input
                  type="number"
                  placeholder="0,00"
                  value={valorEstimado}
                  onChange={(e) => setValorEstimado(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                />
              </div>

              {/* Etapa do Funil */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Status do Funil</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as OfficesLeadStatus)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                >
                  {STAGES.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Notas de Briefing */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Briefing / Detalhes do Projeto</label>
                <textarea
                  rows={3}
                  placeholder="Descreva o que o cliente busca (Ex: Reforma de cozinha de 12m2, estilo industrial, mobiliário planejado em MDF preto...)"
                  value={briefing}
                  onChange={(e) => setBriefing(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              {editingLead && (
                <button
                  type="button"
                  onClick={() => handleDelete(editingLead.id!)}
                  className="py-2.5 px-4 bg-red-950/50 hover:bg-red-900/40 text-red-400 font-bold text-xs rounded-xl border border-red-900/30 transition-colors"
                >
                  🗑️ Excluir
                </button>
              )}
              <button
                type="submit"
                className="flex-1 py-2.5 bg-gradient-to-tr from-orange-600 to-amber-500 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95"
              >
                💾 Salvar Lead
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default OfficesCRM;
