import React from 'react';
import { officesService } from '../services/officesService';
import { OfficesLead, OfficesLeadStatus } from '../types';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import {
  Briefcase, Trash2, Plus, Sparkles, User,
  MessageSquare, Phone, DollarSign, Activity, GripVertical
} from 'lucide-react';

interface OfficesCRMProps {
  userId: string;
}

const STAGES: { id: OfficesLeadStatus; label: string; dot: string; header: string; count_chip: string }[] = [
  { id: 'BRIEFING',   label: 'Briefing',   dot: '#64748B', header: 'bg-slate-100 border-slate-200',      count_chip: 'bg-slate-200 text-slate-600' },
  { id: 'PROPOSTA',   label: 'Proposta',   dot: '#D47A55', header: 'bg-[#D47A55]/8 border-[#D47A55]/20', count_chip: 'bg-[#D47A55]/15 text-[#D47A55]' },
  { id: 'CONTRATADO', label: 'Contratado', dot: '#16A34A', header: 'bg-emerald-50 border-emerald-100',   count_chip: 'bg-emerald-100 text-emerald-700' },
  { id: 'PERDIDO',    label: 'Perdido',    dot: '#94A3B8', header: 'bg-slate-50 border-slate-200',       count_chip: 'bg-slate-100 text-slate-400' },
];

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

// ── Card arrastável ───────────────────────────────────────────────────────────
interface LeadCardProps {
  lead: OfficesLead;
  onClick: () => void;
  onCriarProjeto?: () => void;
  overlay?: boolean;
}

const LeadCard: React.FC<LeadCardProps> = ({ lead, onClick, onCriarProjeto, overlay }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0 : 1 }}
      className={`bg-white border border-slate-200/60 p-4 rounded-[18px] flex flex-col gap-2.5 shadow-[0_2px_10px_rgb(0,0,0,0.04)] transition-all group ${overlay ? 'rotate-1 shadow-xl scale-[1.02]' : 'hover:border-[#D47A55]/30 hover:shadow-[0_6px_20px_rgb(0,0,0,0.07)] cursor-pointer'}`}
    >
      {/* Grip + nome + valor */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Handle de drag */}
          <button
            {...attributes}
            {...listeners}
            className="shrink-0 p-0.5 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
          <div className="w-7 h-7 shrink-0 rounded-xl bg-[#D47A55]/10 flex items-center justify-center font-black text-[#D47A55] text-xs">
            {(lead.nome_cliente || '?').charAt(0).toUpperCase()}
          </div>
          <span
            onClick={onClick}
            className="font-black text-sm text-slate-800 group-hover:text-[#D47A55] transition-colors truncate cursor-pointer"
          >
            {lead.nome_cliente}
          </span>
        </div>
        <span className="font-black text-[#D47A55] text-xs shrink-0">{BRL(lead.valor_estimado)}</span>
      </div>

      {lead.briefing && (
        <p onClick={onClick} className="text-[11px] text-slate-500 line-clamp-2 font-medium leading-relaxed cursor-pointer pl-9">
          {lead.briefing}
        </p>
      )}

      {lead.contato && (
        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 pl-9">
          <Phone className="w-3 h-3 text-[#D47A55]" />
          <span>{lead.contato}</span>
        </div>
      )}

      {lead.status === 'CONTRATADO' && (
        <div className="pt-2 border-t border-slate-100 flex justify-end pl-9">
          {lead.briefing?.includes('(Projeto Gerado)') ? (
            <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
              Projeto Ativo
            </span>
          ) : onCriarProjeto ? (
            <button
              onClick={e => { e.stopPropagation(); onCriarProjeto(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white text-[9px] font-black uppercase tracking-widest rounded-xl active:scale-95 transition-all shadow-sm"
            >
              <Briefcase className="w-3 h-3" /> Criar Projeto
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
};

// ── Coluna droppable ──────────────────────────────────────────────────────────
interface KanbanColumnProps {
  stage: typeof STAGES[number];
  leads: OfficesLead[];
  onCardClick: (l: OfficesLead) => void;
  onCriarProjeto: (l: OfficesLead) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ stage, leads, onCardClick, onCriarProjeto }) => {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const total = leads.reduce((s, l) => s + Number(l.valor_estimado || 0), 0);

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      {/* Cabeçalho da coluna */}
      <div className={`flex items-center justify-between px-3.5 py-2.5 rounded-[16px] border mb-3 ${stage.header}`}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.dot }} />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">{stage.label}</span>
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${stage.count_chip}`}>{leads.length}</span>
        </div>
        {total > 0 && (
          <span className="text-[9px] font-black text-slate-500">{BRL(total)}</span>
        )}
      </div>

      {/* Área droppable */}
      <div
        ref={setNodeRef}
        className={`flex-1 flex flex-col gap-2.5 min-h-[120px] rounded-[16px] p-2 transition-colors ${isOver ? 'bg-[#D47A55]/5 ring-1 ring-[#D47A55]/20' : 'bg-transparent'}`}
      >
        {leads.map(l => (
          <LeadCard
            key={l.id}
            lead={l}
            onClick={() => onCardClick(l)}
            onCriarProjeto={l.status === 'CONTRATADO' ? () => onCriarProjeto(l) : undefined}
          />
        ))}
        {leads.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-8 border border-dashed border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest text-slate-300">
            Vazio
          </div>
        )}
      </div>
    </div>
  );
};

// ── Componente principal ──────────────────────────────────────────────────────
const OfficesCRM: React.FC<OfficesCRMProps> = ({ userId }) => {
  const [loading, setLoading] = React.useState(true);
  const [leads, setLeads] = React.useState<OfficesLead[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const [editingLead, setEditingLead] = React.useState<Partial<OfficesLead> | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const [nomeCliente, setNomeCliente] = React.useState('');
  const [contato, setContato] = React.useState('');
  const [briefing, setBriefing] = React.useState('');
  const [valorEstimado, setValorEstimado] = React.useState('');
  const [status, setStatus] = React.useState<OfficesLeadStatus>('BRIEFING');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const loadLeads = React.useCallback(async () => {
    try {
      setLoading(true);
      setLeads(await officesService.listLeads(userId));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => { loadLeads(); }, [loadLeads]);

  // Drag handlers
  const handleDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const lead = leads.find(l => l.id === active.id);
    const newStatus = over.id as OfficesLeadStatus;
    if (!lead || lead.status === newStatus) return;

    // Optimistic update
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l));
    try {
      await officesService.saveLead({ ...lead, status: newStatus });
    } catch {
      loadLeads(); // revert
    }
  };

  const handleCriarProjeto = async (lead: OfficesLead) => {
    if (!confirm(`Criar projeto para "${lead.nome_cliente}"?`)) return;
    try {
      setLoading(true);
      await officesService.createProjectFromLead(lead.id, lead.nome_cliente, lead.valor_estimado, userId);
      alert('Projeto criado! Cronograma e fluxo financeiro gerados. Veja na aba "Projetos".');
      loadLeads();
    } catch (err: any) {
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
    if (!nomeCliente) { alert('Informe o nome do cliente.'); return; }
    try {
      setLoading(true);
      await officesService.saveLead({ id: editingLead?.id, user_id: userId, nome_cliente: nomeCliente, contato: contato || undefined, briefing: briefing || undefined, valor_estimado: Number(valorEstimado || 0), status });
      setIsModalOpen(false);
      loadLeads();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deletar este lead?')) return;
    try {
      setLoading(true);
      await officesService.deleteLead(id);
      setIsModalOpen(false);
      loadLeads();
    } catch {
      alert('Erro ao deletar.');
    } finally {
      setLoading(false);
    }
  };

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null;

  if (loading && leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px] bg-[#F3F7F9]">
        <div className="w-8 h-8 border-4 border-[#D47A55] border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carregando CRM...</span>
      </div>
    );
  }

  const totalPipeline = leads.filter(l => l.status !== 'PERDIDO').reduce((s, l) => s + Number(l.valor_estimado || 0), 0);

  return (
    <div className="flex flex-col h-full bg-[#F3F7F9] min-h-screen pb-24">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Funil Comercial</h1>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1.5">
            ÒPURA Offices / CRM &nbsp;·&nbsp; {leads.length} leads &nbsp;·&nbsp; {BRL(totalPipeline)} em pipeline
          </p>
        </div>
        <button
          onClick={handleOpenNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-[#D47A55]/20 active:scale-[0.98] transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Novo Lead
        </button>
      </div>

      {/* ── Kanban Board ──────────────────────────────────────────────────── */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto px-6 pb-6 pt-1 flex-1 items-start">
          {STAGES.map(stage => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              leads={leads.filter(l => l.status === stage.id)}
              onCardClick={handleOpenEdit}
              onCriarProjeto={handleCriarProjeto}
            />
          ))}
        </div>

        {/* Card fantasma enquanto arrasta */}
        <DragOverlay dropAnimation={null}>
          {activeLead ? (
            <LeadCard lead={activeLead} onClick={() => {}} overlay />
          ) : null}
        </DragOverlay>
      </DndContext>

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
                {editingLead ? 'Editar Lead' : 'Novo Lead / Oportunidade'}
              </span>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 text-xl hover:text-slate-700">×</button>
            </div>

            <div className="space-y-3.5">
              {([
                { label: 'Cliente', icon: User, placeholder: 'Nome completo do lead', value: nomeCliente, setter: setNomeCliente, type: 'text', required: true },
                { label: 'Contato (Telefone / Email)', icon: Phone, placeholder: '(11) 98888-8888', value: contato, setter: setContato, type: 'text', required: false },
                { label: 'Valor Estimado (R$)', icon: DollarSign, placeholder: '0', value: valorEstimado, setter: setValorEstimado, type: 'number', required: false },
              ] as const).map(f => (
                <div key={f.label} className="space-y-1">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">{f.label}</label>
                  <div className="relative">
                    <f.icon className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-300" />
                    <input
                      type={f.type}
                      placeholder={f.placeholder}
                      value={f.value}
                      onChange={e => f.setter(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-[#D47A55] focus:bg-white transition-colors font-medium"
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-[#D47A55] font-medium"
                  >
                    {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Briefing / Detalhes</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3.5 top-3 w-4 h-4 text-slate-300" />
                  <textarea
                    rows={3}
                    placeholder="Descreva o que o cliente busca..."
                    value={briefing}
                    onChange={e => setBriefing(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-[#D47A55] resize-none font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              {editingLead && (
                <button
                  type="button"
                  onClick={() => handleDelete(editingLead.id!)}
                  className="py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-500 font-bold text-button rounded-xl border border-rose-100 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Deletar
                </button>
              )}
              <button type="submit" className="flex-1 py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-button uppercase tracking-widest rounded-xl shadow-md active:scale-95 transition-all">
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
