import React from 'react';
import { officesService } from '../services/officesService';
import { OfficesLead, OfficesLeadStatus } from '../types';
import { Briefcase, ArrowRight, Trash2, Plus, Sparkles, User, MessageSquare, Phone, DollarSign, Activity } from 'lucide-react';

interface OfficesCRMProps {
  userId: string;
}

const STAGES: { id: OfficesLeadStatus; label: string; color: string }[] = [
  { id: 'BRIEFING', label: 'Briefing / Contato', color: 'bg-[#1E2022] text-[#D47A55]/90 border-[#D47A55]/20' },
  { id: 'PROPOSTA', label: 'Proposta Enviada', color: 'bg-[#D47A55]/10 text-[#D47A55] border-[#D47A55]/30' },
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
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px] bg-[#121315]">
        <div className="w-8 h-8 border-4 border-[#D47A55] border-t-transparent rounded-full animate-spin mb-3 text-[#D47A55]" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Carregando CRM...</span>
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col h-full space-y-5 bg-[#121315] text-slate-100 min-h-screen pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">CRM & Prospecção</h1>
          <p className="text-xs font-semibold text-slate-400">Gestão de contatos e briefing de projetos</p>
        </div>
        <button
          onClick={handleOpenNew}
          className="px-4 py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] hover:from-[#e18b67] hover:to-[#d5734b] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Novo Lead
        </button>
      </div>

      {/* Pipeline / Grid de Cards */}
      <div className="space-y-6">
        {STAGES.map(stage => {
          const stageLeads = leads.filter(l => l.status === stage.id);
          return (
            <div key={stage.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${stage.color}`}>
                  {stage.label}
                </span>
                <span className="text-xs text-[#D47A55] font-black">({stageLeads.length})</span>
              </div>

              {stageLeads.length === 0 ? (
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 py-4 px-4 border border-white/5 rounded-[20px] bg-slate-900/10 italic text-center">
                  Nenhum projeto nesta etapa do funil.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {stageLeads.map(l => (
                    <div
                      key={l.id}
                      onClick={() => handleOpenEdit(l)}
                      className="bg-[#1E2022] border border-white/5 p-4 rounded-[24px] flex flex-col gap-2.5 hover:bg-[#25282A] hover:border-white/10 cursor-pointer transition-all shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-black text-sm text-white">{l.nome_cliente}</span>
                        <span className="font-black text-[#D47A55] text-xs">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(l.valor_estimado)}
                        </span>
                      </div>
                      {l.briefing && (
                        <p className="text-xs text-slate-400 line-clamp-2 font-medium">{l.briefing}</p>
                      )}
                      {l.contato && (
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500">
                          <Phone className="w-3 h-3 text-[#D47A55]" />
                          <span>{l.contato}</span>
                        </div>
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form
            onSubmit={handleSave}
            className="bg-[#17181A] border border-white/5 rounded-[28px] p-5 w-full max-w-sm space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[#D47A55] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                {editingLead ? 'Editar Cadastro' : 'Novo Lead / Oportunidade'}
              </span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 text-lg hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Nome do Cliente */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Cliente</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Nome completo do lead"
                    value={nomeCliente}
                    onChange={(e) => setNomeCliente(e.target.value)}
                    className="w-full bg-[#1E2022] border border-white/5 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white outline-none focus:border-[#D47A55] font-medium"
                    required
                  />
                </div>
              </div>

              {/* Contato */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Contato (Telefone / Email)</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Ex: (11) 98888-8888 ou joao@email.com"
                    value={contato}
                    onChange={(e) => setContato(e.target.value)}
                    className="w-full bg-[#1E2022] border border-white/5 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white outline-none focus:border-[#D47A55] font-medium"
                  />
                </div>
              </div>

              {/* Valor Estimado */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Valor Estimado do Contrato (R$)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="number"
                    placeholder="0,00"
                    value={valorEstimado}
                    onChange={(e) => setValorEstimado(e.target.value)}
                    className="w-full bg-[#1E2022] border border-white/5 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white outline-none focus:border-[#D47A55] font-medium"
                  />
                </div>
              </div>

              {/* Etapa do Funil */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Status do Funil</label>
                <div className="relative">
                  <Activity className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as OfficesLeadStatus)}
                    className="w-full bg-[#1E2022] border border-white/5 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white outline-none focus:border-[#D47A55] font-medium"
                  >
                    {STAGES.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notas de Briefing */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Briefing / Detalhes do Projeto</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <textarea
                    rows={3}
                    placeholder="Descreva o que o cliente busca..."
                    value={briefing}
                    onChange={(e) => setBriefing(e.target.value)}
                    className="w-full bg-[#1E2022] border border-white/5 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white outline-none focus:border-[#D47A55] resize-none font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              {editingLead && (
                <button
                  type="button"
                  onClick={() => handleDelete(editingLead.id!)}
                  className="py-2.5 px-4 bg-red-950/20 hover:bg-red-950/40 text-red-400 font-bold text-xs rounded-xl border border-red-900/30 transition-colors flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Deletar
                </button>
              )}
              <button
                type="submit"
                className="flex-1 py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
              >
                Salvar Lead
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default OfficesCRM;
