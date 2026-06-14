import React from 'react';
import { officesService } from '../services/officesService';
import { OfficesLead, OfficesLeadStatus } from '../types';
import {
  Briefcase, Trash2, Plus, Sparkles, User,
  MessageSquare, Phone, DollarSign, Activity, ChevronRight
} from 'lucide-react';

interface OfficesCRMProps {
  userId: string;
}

const STAGES: { id: OfficesLeadStatus; label: string; dot: string; chip: string }[] = [
  { id: 'BRIEFING',   label: 'Briefing / Contato',   dot: '#64748B', chip: 'bg-slate-100 text-slate-500' },
  { id: 'PROPOSTA',   label: 'Proposta Enviada',      dot: '#D47A55', chip: 'bg-[#D47A55]/10 text-[#D47A55]' },
  { id: 'CONTRATADO', label: 'Contratado (Fechado)',  dot: '#16A34A', chip: 'bg-emerald-50 text-emerald-600' },
  { id: 'PERDIDO',    label: 'Perdido',               dot: '#94A3B8', chip: 'bg-slate-100 text-slate-400' }
];

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

const OfficesCRM: React.FC<OfficesCRMProps> = ({ userId }) => {
  const [loading, setLoading] = React.useState(true);
  const [leads, setLeads] = React.useState<OfficesLead[]>([]);
  const [editingLead, setEditingLead] = React.useState<Partial<OfficesLead> | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

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

  React.useEffect(() => { loadLeads(); }, [loadLeads]);

  const handleCriarProjeto = async (lead: OfficesLead) => {
    if (!confirm(`Deseja criar um novo projeto no escritório para "${lead.nome_cliente}"?`)) return;
    try {
      setLoading(true);
      await officesService.createProjectFromLead(lead.id, lead.nome_cliente, lead.valor_estimado, userId);
      alert('Projeto criado com sucesso! O cronograma inicial e o fluxo financeiro foram atrelados ao projeto.');
      loadLeads();
    } catch (err: any) {
      console.error(err);
      alert('Erro ao criar projeto: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setEditingLead(null);
    setNomeCliente(''); setContato(''); setBriefing(''); setValorEstimado(''); setStatus('BRIEFING');
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
    if (!nomeCliente) { alert('Por favor, informe o nome do cliente.'); return; }
    try {
      setLoading(true);
      await officesService.saveLead({
        id: editingLead?.id,
        user_id: userId,
        nome_cliente: nomeCliente,
        contato: contato || undefined,
        briefing: briefing || undefined,
        valor_estimado: Number(valorEstimado || 0),
        status
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
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px] bg-[#F3F7F9]">
        <div className="w-8 h-8 border-4 border-[#D47A55] border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carregando CRM...</span>
      </div>
    );
  }

  // Totais rápidos
  const totalPipeline = leads.filter(l => l.status !== 'PERDIDO').reduce((s, l) => s + Number(l.valor_estimado || 0), 0);
  const totalContratado = leads.filter(l => l.status === 'CONTRATADO').reduce((s, l) => s + Number(l.valor_estimado || 0), 0);

  return (
    <div className="p-6 space-y-6 bg-[#F3F7F9] text-slate-700 min-h-screen pb-24">

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Funil Comercial</h1>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1.5">ÒPURA Offices / CRM & Prospecção</p>
        </div>
        <button
          onClick={handleOpenNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-[#D47A55]/20 hover:shadow-[#D47A55]/30 active:scale-[0.98] transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Novo Lead
        </button>
      </div>

      {/* ── KPIs rápidos ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total de Leads',  value: String(leads.length),       sub: 'oportunidades',   color: 'text-slate-800' },
          { label: 'Pipeline Ativo',  value: BRL(totalPipeline),         sub: 'excl. perdidos',  color: 'text-[#D47A55]' },
          { label: 'Contratado',      value: BRL(totalContratado),       sub: 'contratos fechados', color: 'text-emerald-600' },
          { label: 'Conversão',       value: leads.length ? `${Math.round((leads.filter(l=>l.status==='CONTRATADO').length/leads.length)*100)}%` : '0%', sub: 'briefing → contrato', color: 'text-slate-800' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-200/50 p-4 rounded-[20px] shadow-[0_4px_20px_rgb(0,0,0,0.03)]">
            <span className="block text-[8.5px] font-black uppercase tracking-widest text-slate-400">{k.label}</span>
            <span className={`block text-lg font-black mt-1.5 ${k.color}`}>{k.value}</span>
            <span className="block text-[8.5px] text-slate-400 font-medium mt-0.5">{k.sub}</span>
          </div>
        ))}
      </div>

      {/* ── Pipeline por estágio ─────────────────────────────────────────── */}
      <div className="space-y-5">
        {STAGES.map(stage => {
          const stageLeads = leads.filter(l => l.status === stage.id);
          return (
            <div key={stage.id} className="space-y-3">
              {/* Cabeçalho do estágio */}
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full" style={{ background: stage.dot }} />
                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${stage.chip}`}>
                  {stage.label}
                </span>
                <span className="text-[9px] font-black text-slate-400">({stageLeads.length})</span>
                {stageLeads.length > 0 && (
                  <span className="text-[9px] font-black text-slate-400 ml-auto">
                    {BRL(stageLeads.reduce((s, l) => s + Number(l.valor_estimado || 0), 0))}
                  </span>
                )}
              </div>

              {stageLeads.length === 0 ? (
                <div className="text-center py-5 border border-dashed border-slate-200 rounded-[20px] text-[10px] text-slate-400 bg-white/60">
                  Nenhum lead nesta etapa.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {stageLeads.map(l => (
                    <div
                      key={l.id}
                      onClick={() => handleOpenEdit(l)}
                      className="bg-white border border-slate-200/50 p-4 rounded-[20px] flex flex-col gap-3 hover:border-[#D47A55]/30 hover:shadow-[0_8px_25px_rgb(0,0,0,0.06)] cursor-pointer transition-all shadow-[0_4px_16px_rgb(0,0,0,0.03)] group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 shrink-0 rounded-xl bg-[#D47A55]/10 flex items-center justify-center font-black text-[#D47A55] text-xs">
                            {(l.nome_cliente || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="font-black text-sm text-slate-800 group-hover:text-[#D47A55] transition-colors truncate">
                            {l.nome_cliente}
                          </span>
                        </div>
                        <span className="font-black text-[#D47A55] text-xs shrink-0">{BRL(l.valor_estimado)}</span>
                      </div>

                      {l.briefing && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 font-medium leading-relaxed">{l.briefing}</p>
                      )}

                      {l.contato && (
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                          <Phone className="w-3 h-3 text-[#D47A55]" />
                          <span>{l.contato}</span>
                        </div>
                      )}

                      {l.status === 'CONTRATADO' && (
                        <div className="pt-2 border-t border-slate-100 flex justify-end">
                          {l.briefing?.includes('(Projeto Gerado)') ? (
                            <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                              Projeto Ativo
                            </span>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); handleCriarProjeto(l); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:shadow-md active:scale-95 transition-all"
                            >
                              <Briefcase className="w-3 h-3" /> Criar Projeto
                            </button>
                          )}
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

      {/* ── Modal Cadastro/Edição ─────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSave}
            className="bg-white border border-slate-200/60 rounded-[28px] p-6 w-full max-w-sm space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[#D47A55] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                {editingLead ? 'Editar Cadastro' : 'Novo Lead / Oportunidade'}
              </span>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 text-xl hover:text-slate-700">×</button>
            </div>

            <div className="space-y-3.5">
              {[
                { label: 'Cliente', icon: User, placeholder: 'Nome completo do lead', value: nomeCliente, setter: setNomeCliente, type: 'text', required: true },
                { label: 'Contato (Telefone / Email)', icon: Phone, placeholder: '(11) 98888-8888 ou joao@email.com', value: contato, setter: setContato, type: 'text', required: false },
                { label: 'Valor Estimado do Contrato (R$)', icon: DollarSign, placeholder: '0', value: valorEstimado, setter: setValorEstimado, type: 'number', required: false },
              ].map(f => (
                <div key={f.label} className="space-y-1">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">{f.label}</label>
                  <div className="relative">
                    <f.icon className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-300" />
                    <input
                      type={f.type}
                      placeholder={f.placeholder}
                      value={f.value}
                      onChange={e => f.setter(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-700 outline-none focus:border-[#D47A55] focus:bg-white transition-colors font-medium"
                      required={f.required}
                    />
                  </div>
                </div>
              ))}

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Status do Funil</label>
                <div className="relative">
                  <Activity className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-300" />
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as OfficesLeadStatus)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-700 outline-none focus:border-[#D47A55] font-medium"
                  >
                    {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Briefing / Detalhes do Projeto</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3.5 top-3 w-4 h-4 text-slate-300" />
                  <textarea
                    rows={3}
                    placeholder="Descreva o que o cliente busca..."
                    value={briefing}
                    onChange={e => setBriefing(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-700 outline-none focus:border-[#D47A55] resize-none font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              {editingLead && (
                <button
                  type="button"
                  onClick={() => handleDelete(editingLead.id!)}
                  className="py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-500 font-bold text-xs rounded-xl border border-red-100 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Deletar
                </button>
              )}
              <button
                type="submit"
                className="flex-1 py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md active:scale-95 transition-all"
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
