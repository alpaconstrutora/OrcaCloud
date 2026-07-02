import React from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  LayoutDashboard,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Send,
  Target,
  UserRound,
} from 'lucide-react';
import { commercialService } from '../services/commercialService';
import { clientService } from '../services/clientService';
import { crmService } from '../services/crmService';
import {
  Client,
  CrmLeadSource,
  CrmOpportunity,
  CrmOpportunityKind,
  CrmPipelineStage,
  CrmPipelineStageId,
  CrmProposal,
  CrmTask,
  CrmTimelineEvent,
  Property,
  PropertyDeal,
  PropertyStatus,
} from '../types';

interface CommercialCrmCockpitProps {
  organizationId?: string;
}

interface LeadFormState {
  name: string;
  phone: string;
  email: string;
  company: string;
  title: string;
  kind: CrmOpportunityKind;
  source: CrmLeadSource;
  value: string;
  ownerName: string;
  propertyId: string;
  nextActionDate: string;
  temperature: CrmOpportunity['temperature'];
}

const PIPELINE: CrmPipelineStage[] = [
  { id: 'novo', label: 'Novo lead', order: 1 },
  { id: 'primeiro-contato', label: 'Primeiro contato', order: 2 },
  { id: 'qualificacao', label: 'Qualificacao', order: 3 },
  { id: 'visita', label: 'Visita', order: 4 },
  { id: 'proposta', label: 'Proposta', order: 5 },
  { id: 'negociacao', label: 'Negociacao', order: 6 },
  { id: 'contrato', label: 'Contrato', order: 7 },
  { id: 'ganho', label: 'Ganho', order: 8 },
  { id: 'perdido', label: 'Perdido', order: 9 },
];

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const nextActionInputValue = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setMinutes(0, 0, 0);
  return date.toISOString().slice(0, 16);
};

const defaultLeadForm = (): LeadFormState => ({
  name: '',
  phone: '',
  email: '',
  company: '',
  title: '',
  kind: 'VENDA_IMOVEL',
  source: 'WHATSAPP',
  value: '',
  ownerName: 'Comercial',
  propertyId: '',
  nextActionDate: nextActionInputValue(),
  temperature: 'morno',
});

const parseMoneyInput = (value: string) => Number(value.replace(/[^0-9,.]/g, '').replace(',', '.')) || 0;

const stageFromDeal = (deal: PropertyDeal): CrmPipelineStageId => {
  if (deal.status === 'COMPLETED') return 'ganho';
  if (deal.status === 'CANCELLED') return 'perdido';
  if (deal.status === 'CONTRATO' || deal.status === 'ASSINATURA') return 'contrato';
  if (deal.status === 'RESERVA' || deal.status === 'WAITING_PAYMENT') return 'negociacao';
  if (deal.status === 'PENDING') return 'proposta';
  return 'qualificacao';
};

const statusLabel = (status: PropertyStatus) => {
  switch (status) {
    case PropertyStatus.AVAILABLE: return 'Disponivel';
    case PropertyStatus.RESERVED: return 'Reservado';
    case PropertyStatus.SOLD: return 'Vendido';
    case PropertyStatus.RENTED: return 'Alugado';
    case PropertyStatus.EXCHANGED: return 'Permutado';
    default: return 'Bloqueado';
  }
};

const statusClass = (status: PropertyStatus) => {
  switch (status) {
    case PropertyStatus.AVAILABLE: return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case PropertyStatus.RESERVED: return 'border-amber-200 bg-amber-50 text-amber-700';
    case PropertyStatus.SOLD: return 'border-slate-300 bg-slate-100 text-slate-700';
    case PropertyStatus.RENTED: return 'border-blue-200 bg-blue-50 text-blue-700';
    case PropertyStatus.EXCHANGED: return 'border-violet-200 bg-violet-50 text-violet-700';
    default: return 'border-red-200 bg-red-50 text-red-700';
  }
};

const temperatureClass = (temperature: CrmOpportunity['temperature']) => {
  if (temperature === 'quente') return 'bg-red-50 text-red-700 border-red-200';
  if (temperature === 'morno') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

const fallbackOpportunities = (): CrmOpportunity[] => [
  {
    id: 'seed-1',
    title: 'Apto 302 - Residencial Aura',
    kind: 'VENDA_IMOVEL',
    contact: { id: 'contact-1', name: 'Joao Silva', email: 'joao@email.com', phone: '(35) 99999-0101' },
    source: 'WHATSAPP',
    stage_id: 'proposta',
    temperature: 'quente',
    value: 420000,
    property_name: 'Apto 302',
    building_name: 'Residencial Aura',
    owner_name: 'Carlos',
    next_action_at: addDays(0),
    created_at: addDays(-6),
    updated_at: addDays(-1),
  },
  {
    id: 'seed-2',
    title: 'Sala comercial - Centro Cambui',
    kind: 'LOCACAO',
    contact: { id: 'contact-2', name: 'Ana Martins', phone: '(35) 98888-0202' },
    source: 'INDICACAO',
    stage_id: 'visita',
    temperature: 'morno',
    value: 6800,
    property_name: 'Sala 04',
    building_name: 'Centro Empresarial Cambui',
    owner_name: 'Marina',
    next_action_at: addDays(1),
    created_at: addDays(-4),
    updated_at: addDays(-1),
  },
  {
    id: 'seed-3',
    title: 'Investidor SPE - Loteamento',
    kind: 'INVESTIMENTO',
    contact: { id: 'contact-3', name: 'Fundo Horizonte', company: 'Fundo Horizonte' },
    source: 'INTERNO',
    stage_id: 'negociacao',
    temperature: 'quente',
    value: 1200000,
    owner_name: 'Diretoria',
    next_action_at: addDays(2),
    created_at: addDays(-12),
    updated_at: addDays(-2),
  },
];

const CommercialCrmCockpit: React.FC<CommercialCrmCockpitProps> = ({ organizationId }) => {
  const [properties, setProperties] = React.useState<Property[]>([]);
  const [deals, setDeals] = React.useState<PropertyDeal[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [crmOpportunities, setCrmOpportunities] = React.useState<CrmOpportunity[]>([]);
  const [crmTasks, setCrmTasks] = React.useState<CrmTask[]>([]);
  const [crmProposals, setCrmProposals] = React.useState<CrmProposal[]>([]);
  const [crmTimelineEvents, setCrmTimelineEvents] = React.useState<CrmTimelineEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeView, setActiveView] = React.useState<'dashboard' | 'funil' | 'espelho' | 'propostas'>('dashboard');
  const [query, setQuery] = React.useState('');
  const [selectedOpportunityId, setSelectedOpportunityId] = React.useState<string | null>(null);
  const [stageOverrides, setStageOverrides] = React.useState<Record<string, CrmPipelineStageId>>({});
  const [localProposals, setLocalProposals] = React.useState<CrmProposal[]>([]);
  const [localTimelineEvents, setLocalTimelineEvents] = React.useState<CrmTimelineEvent[]>([]);
  const [activitySubmitting, setActivitySubmitting] = React.useState<string | null>(null);
  const [leadModalOpen, setLeadModalOpen] = React.useState(false);
  const [leadForm, setLeadForm] = React.useState<LeadFormState>(() => defaultLeadForm());
  const [leadSubmitting, setLeadSubmitting] = React.useState(false);
  const [leadError, setLeadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      commercialService.listProperties(organizationId),
      commercialService.listDeals(),
      clientService.listClients(),
      crmService.listOpportunities(organizationId),
      crmService.listTasks(organizationId),
      crmService.listProposals(organizationId),
      crmService.listTimelineEvents(organizationId),
    ])
      .then(([propertiesData, dealsData, clientsData, crmOpportunityData, crmTaskData, crmProposalData, crmTimelineData]) => {
        if (!mounted) return;
        setProperties(propertiesData);
        setDeals(dealsData.filter(deal => !organizationId || deal.organization_id === organizationId || propertiesData.some(p => p.id === deal.property_id)));
        setClients(clientsData);
        setCrmOpportunities(crmOpportunityData);
        setCrmTasks(crmTaskData);
        setCrmProposals(crmProposalData);
        setCrmTimelineEvents(crmTimelineData);
      })
      .catch(error => {
        console.error('[CommercialCrmCockpit] load error', error);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [organizationId]);

  const opportunities = React.useMemo<CrmOpportunity[]>(() => {
    const byProperty = new Map(properties.map(property => [property.id, property]));
    const byClient = new Map(clients.map(client => [client.id, client]));
    if (crmOpportunities.length > 0) return crmOpportunities.map(item => ({
      ...item,
      stage_id: stageOverrides[item.id] || item.stage_id,
    }));

    const mapped = deals.map((deal, index) => {
      const property = byProperty.get(deal.property_id);
      const parent = property?.parent_id ? byProperty.get(property.parent_id) : undefined;
      const client = byClient.get(deal.client_id);
      const baseStage = stageFromDeal(deal);
      const stage = stageOverrides[deal.id] || baseStage;
      const contactName = client?.name || `Lead comercial ${index + 1}`;
      const value = Number(deal.value || property?.current_price || property?.price || 0);
      return {
        id: deal.id,
        title: property ? `${property.name} - ${deal.type === 'RENTAL' ? 'Locacao' : deal.type === 'SERVICE' ? 'Servico' : 'Venda'}` : `Oportunidade ${index + 1}`,
        kind: deal.type === 'RENTAL' ? 'LOCACAO' : deal.type === 'SERVICE' ? 'SERVICO' : 'VENDA_IMOVEL',
        contact: {
          id: client?.id || `client-${deal.id}`,
          name: contactName,
          email: client?.email,
          phone: client?.phone,
          document: (client as { document?: string } | undefined)?.document,
        },
        source: 'INTERNO',
        stage_id: stage,
        temperature: value >= 500000 || stage === 'proposta' || stage === 'negociacao' ? 'quente' : value >= 150000 ? 'morno' : 'frio',
        value,
        property_id: property?.id,
        property_name: property?.name,
        building_name: parent?.name || property?.block,
        owner_name: deal.broker_name || 'Comercial',
        next_action_at: stage === 'ganho' || stage === 'perdido' ? undefined : addDays(index % 3),
        loss_reason: stage === 'perdido' ? deal.cancellation_reason || 'Motivo nao informado' : undefined,
        created_at: deal.created_at || deal.date,
        updated_at: deal.date,
      } satisfies CrmOpportunity;
    });

    return mapped.length > 0 ? mapped : fallbackOpportunities();
  }, [clients, crmOpportunities, deals, properties, stageOverrides]);

  const filteredOpportunities = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return opportunities;
    return opportunities.filter(item => [
      item.title,
      item.contact.name,
      item.property_name,
      item.building_name,
      item.owner_name,
      item.source,
    ].some(value => String(value || '').toLowerCase().includes(term)));
  }, [opportunities, query]);

  const tasks = React.useMemo<CrmTask[]>(() => {
    if (crmTasks.length > 0) {
      return crmTasks.map(task => ({
        ...task,
        status: task.status === 'CONCLUIDA' ? task.status : new Date(task.due_at).getTime() < Date.now() - 1000 * 60 * 60 ? 'ATRASADA' : task.status,
      }));
    }

    return opportunities
      .filter(item => item.next_action_at && item.stage_id !== 'ganho' && item.stage_id !== 'perdido')
      .map(item => {
        const due = new Date(item.next_action_at || '');
        const isLate = due.getTime() < Date.now() - 1000 * 60 * 60;
        return {
          id: `task-${item.id}`,
          opportunity_id: item.id,
          type: item.stage_id === 'proposta' ? 'PROPOSTA' : item.stage_id === 'visita' ? 'VISITA' : 'RETORNO',
          title: item.stage_id === 'proposta' ? 'Retornar proposta' : item.stage_id === 'visita' ? 'Confirmar visita' : 'Proxima acao comercial',
          due_at: item.next_action_at || '',
          status: isLate ? 'ATRASADA' : 'PENDENTE',
        };
      });
  }, [crmTasks, opportunities]);

  const proposals = React.useMemo<CrmProposal[]>(() => {
    if (crmProposals.length > 0) return [...crmProposals, ...localProposals];

    const generated = opportunities
      .filter(item => ['proposta', 'negociacao', 'contrato', 'ganho'].includes(item.stage_id))
      .map((item, index) => ({
        id: `proposal-${item.id}`,
        opportunity_id: item.id,
        version: 1,
        value: item.value,
        discount_pct: item.temperature === 'quente' ? 2 : 0,
        expires_at: addDays(7 + index),
        status: item.stage_id === 'ganho' ? 'ACEITA' : item.stage_id === 'contrato' ? 'ENVIADA' : 'RASCUNHO',
      } satisfies CrmProposal));
    const ids = new Set(generated.map(item => item.id));
    return [...generated, ...localProposals.filter(item => !ids.has(item.id))];
  }, [crmProposals, localProposals, opportunities]);

  const selectedOpportunity = opportunities.find(item => item.id === selectedOpportunityId) || filteredOpportunities[0];

  const selectedTimelineEvents = React.useMemo(() => {
    if (!selectedOpportunity) return [];
    return [...crmTimelineEvents, ...localTimelineEvents]
      .filter(item => item.opportunity_id === selectedOpportunity.id)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [crmTimelineEvents, localTimelineEvents, selectedOpportunity]);

  const stats = React.useMemo(() => {
    const open = opportunities.filter(item => !['ganho', 'perdido'].includes(item.stage_id));
    const won = opportunities.filter(item => item.stage_id === 'ganho');
    const totalOpen = open.reduce((sum, item) => sum + item.value, 0);
    const wonValue = won.reduce((sum, item) => sum + item.value, 0);
    const lateTasks = tasks.filter(item => item.status === 'ATRASADA').length;
    return { openCount: open.length, totalOpen, wonValue, lateTasks, proposals: proposals.length };
  }, [opportunities, proposals.length, tasks]);

  const units = React.useMemo(() => properties.filter(property => property.type !== 'BUILDING'), [properties]);
  const buildings = React.useMemo(() => properties.filter(property => property.type === 'BUILDING'), [properties]);

  const updateLeadForm = <K extends keyof LeadFormState>(key: K, value: LeadFormState[K]) => {
    setLeadForm(prev => ({ ...prev, [key]: value }));
    setLeadError(null);
  };

  const closeLeadModal = () => {
    if (leadSubmitting) return;
    setLeadModalOpen(false);
    setLeadError(null);
  };

  const createProposal = async (opportunity: CrmOpportunity) => {
    const version = proposals.filter(item => item.opportunity_id === opportunity.id).length + 1;

    if (organizationId && opportunity.organization_id) {
      try {
        const saved = await crmService.createProposal({
          organization_id: organizationId,
          opportunity_id: opportunity.id,
          value: opportunity.value,
          discount_pct: 0,
          expires_at: addDays(7),
          status: 'RASCUNHO',
        });
        setCrmProposals(prev => [saved, ...prev]);
        const updated = await crmService.updateOpportunity(opportunity.id, { stage_id: 'proposta' });
        setCrmOpportunities(prev => prev.map(item => item.id === updated.id ? updated : item));
        await crmService.createTimelineEvent({
          organization_id: organizationId,
          opportunity_id: opportunity.id,
          title: 'Proposta criada',
          description: `Proposta v${saved.version} criada no cockpit comercial.`,
        });
      } catch (error) {
        console.error('[CommercialCrmCockpit] create proposal error', error);
      }
      setActiveView('propostas');
      setSelectedOpportunityId(opportunity.id);
      return;
    }

    setLocalProposals(prev => [...prev, {
      id: `local-${opportunity.id}-${Date.now()}`,
      opportunity_id: opportunity.id,
      version,
      value: opportunity.value,
      discount_pct: 0,
      expires_at: addDays(7),
      status: 'RASCUNHO',
    }]);
    setStageOverrides(prev => ({ ...prev, [opportunity.id]: 'proposta' }));
    setActiveView('propostas');
    setSelectedOpportunityId(opportunity.id);
  };

  const moveOpportunity = async (opportunityId: string, stageId: CrmPipelineStageId) => {
    setStageOverrides(prev => ({ ...prev, [opportunityId]: stageId }));
    const target = crmOpportunities.find(item => item.id === opportunityId);
    if (!target) return;

    try {
      const updated = await crmService.updateOpportunity(opportunityId, {
        stage_id: stageId,
        loss_reason: stageId === 'perdido' ? target.loss_reason || 'Motivo a classificar' : undefined,
      });
      setCrmOpportunities(prev => prev.map(item => item.id === updated.id ? updated : item));
      if (organizationId) {
        const event = await crmService.createTimelineEvent({
          organization_id: organizationId,
          opportunity_id: opportunityId,
          title: 'Etapa alterada',
          description: `Oportunidade movida para ${PIPELINE.find(stage => stage.id === stageId)?.label || stageId}.`,
        });
        setCrmTimelineEvents(prev => [event, ...prev]);
      }
    } catch (error) {
      console.error('[CommercialCrmCockpit] move opportunity error', error);
    }
  };

  const registerActivity = async (opportunity: CrmOpportunity, type: 'WHATSAPP' | 'LIGACAO') => {
    const key = `${opportunity.id}-${type}`;
    if (activitySubmitting) return;

    const label = type === 'WHATSAPP' ? 'WhatsApp' : 'ligacao';
    const note = window.prompt(`Resumo do contato por ${label}`, 'Contato realizado. Retornar em 1 dia.');
    if (note === null) return;

    setActivitySubmitting(key);
    const nextActionAt = addDays(1);
    const shouldAdvance = opportunity.stage_id === 'novo';
    const eventTitle = type === 'WHATSAPP' ? 'WhatsApp registrado' : 'Ligacao registrada';
    const description = note.trim() || `Contato por ${label} registrado no cockpit comercial.`;

    if (!organizationId || !opportunity.organization_id) {
      const event: CrmTimelineEvent = {
        id: `local-event-${Date.now()}`,
        opportunity_id: opportunity.id,
        at: new Date().toISOString(),
        title: eventTitle,
        description,
      };
      const task: CrmTask = {
        id: `local-task-${Date.now()}`,
        opportunity_id: opportunity.id,
        type,
        title: `Retornar ${opportunity.contact.name}`,
        due_at: nextActionAt,
        status: 'PENDENTE',
      };
      setLocalTimelineEvents(prev => [event, ...prev]);
      setCrmTasks(prev => [task, ...prev]);
      if (shouldAdvance) setStageOverrides(prev => ({ ...prev, [opportunity.id]: 'primeiro-contato' }));
      setActivitySubmitting(null);
      return;
    }

    try {
      const [event, task, updated] = await Promise.all([
        crmService.createTimelineEvent({
          organization_id: organizationId,
          opportunity_id: opportunity.id,
          title: eventTitle,
          description,
        }),
        crmService.createTask({
          organization_id: organizationId,
          opportunity_id: opportunity.id,
          type,
          title: `Retornar ${opportunity.contact.name}`,
          due_at: nextActionAt,
          status: 'PENDENTE',
        }),
        shouldAdvance
          ? crmService.updateOpportunity(opportunity.id, { stage_id: 'primeiro-contato', next_action_at: nextActionAt })
          : crmService.updateOpportunity(opportunity.id, { next_action_at: nextActionAt }),
      ]);
      setCrmTimelineEvents(prev => [event, ...prev]);
      setCrmTasks(prev => [task, ...prev]);
      setCrmOpportunities(prev => prev.map(item => item.id === updated.id ? updated : item));
    } catch (error) {
      console.error('[CommercialCrmCockpit] register activity error', error);
      alert('Nao foi possivel registrar a atividade. Tente novamente.');
    } finally {
      setActivitySubmitting(null);
    }
  };

  const submitLeadForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (leadSubmitting) return;

    const name = leadForm.name.trim();
    const title = leadForm.title.trim() || 'Nova oportunidade comercial';
    const value = parseMoneyInput(leadForm.value);
    const nextActionAt = leadForm.nextActionDate ? new Date(leadForm.nextActionDate).toISOString() : addDays(1);
    const selectedProperty = units.find(unit => unit.id === leadForm.propertyId);
    const parent = selectedProperty?.parent_id ? properties.find(property => property.id === selectedProperty.parent_id) : undefined;

    if (!name) {
      setLeadError('Informe o nome do lead.');
      return;
    }

    setLeadSubmitting(true);
    setLeadError(null);

    const baseOpportunity = {
      title,
      kind: leadForm.kind,
      source: leadForm.source,
      stage_id: 'novo' as CrmPipelineStageId,
      temperature: leadForm.temperature,
      value,
      property_id: selectedProperty?.id,
      property_name: selectedProperty?.name,
      building_name: parent?.name || selectedProperty?.block,
      owner_name: leadForm.ownerName.trim() || 'Comercial',
      next_action_at: nextActionAt,
    };

    if (!organizationId) {
      const localOpportunity: CrmOpportunity = {
        id: `local-${Date.now()}`,
        ...baseOpportunity,
        contact: {
          id: `contact-${Date.now()}`,
          name,
          phone: leadForm.phone.trim() || undefined,
          email: leadForm.email.trim() || undefined,
          company: leadForm.company.trim() || undefined,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setCrmOpportunities(prev => [localOpportunity, ...prev]);
      setSelectedOpportunityId(localOpportunity.id);
      setActiveView('funil');
      setLeadForm(defaultLeadForm());
      setLeadModalOpen(false);
      setLeadSubmitting(false);
      return;
    }

    try {
      const contact = await crmService.createContact({
        organization_id: organizationId,
        name,
        phone: leadForm.phone.trim() || undefined,
        email: leadForm.email.trim() || undefined,
        company: leadForm.company.trim() || undefined,
      });
      const opportunity = await crmService.createOpportunity({
        organization_id: organizationId,
        contact_id: contact.id,
        contact,
        ...baseOpportunity,
      });
      const task = await crmService.createTask({
        organization_id: organizationId,
        opportunity_id: opportunity.id,
        type: leadForm.source === 'WHATSAPP' ? 'WHATSAPP' : 'RETORNO',
        title: 'Primeiro contato obrigatorio',
        due_at: nextActionAt,
        status: 'PENDENTE',
      });
      await crmService.createTimelineEvent({
        organization_id: organizationId,
        opportunity_id: opportunity.id,
        title: 'Lead criado',
        description: `Lead criado via ${leadForm.source}.`,
      });
      setCrmOpportunities(prev => [opportunity, ...prev]);
      setCrmTasks(prev => [task, ...prev]);
      setSelectedOpportunityId(opportunity.id);
      setActiveView('funil');
      setLeadForm(defaultLeadForm());
      setLeadModalOpen(false);
    } catch (error) {
      console.error('[CommercialCrmCockpit] create lead error', error);
      setLeadError('Nao foi possivel criar o lead. Verifique os dados e tente novamente.');
    } finally {
      setLeadSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center bg-white border border-slate-200 rounded-lg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 text-slate-900">
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-700">
              <Target className="h-4 w-4" /> CRM comercial OPURA
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Cockpit de receita futura</h1>
            <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
              MVP operacional para controlar lead, oportunidade, unidade, proposta e proxima acao em um unico fluxo.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-[260px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar lead, unidade ou responsavel"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>
            <button onClick={() => setLeadModalOpen(true)} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-black uppercase tracking-widest text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Novo lead
            </button>
          </div>
        </div>
      </section>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 rounded-t-lg">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'funil', label: 'Funil', icon: BarChart3 },
          { id: 'espelho', label: 'Espelho', icon: Building2 },
          { id: 'propostas', label: 'Propostas', icon: FileText },
        ].map(item => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id as typeof activeView)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-black uppercase tracking-widest transition-colors ${active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
            >
              <Icon className="h-4 w-4" /> {item.label}
            </button>
          );
        })}
      </nav>

      {activeView === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {[
              { label: 'Oportunidades abertas', value: stats.openCount, icon: Target },
              { label: 'VGV em negociacao', value: currency.format(stats.totalOpen), icon: BarChart3 },
              { label: 'VGV ganho', value: currency.format(stats.wonValue), icon: CheckCircle2 },
              { label: 'Propostas', value: stats.proposals, icon: FileText },
              { label: 'Follow-ups atrasados', value: stats.lateTasks, icon: AlertTriangle },
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="bg-white border border-slate-200 rounded-lg p-4">
                  <Icon className="h-5 w-5 text-blue-600" />
                  <div className="mt-4 text-xs font-black uppercase tracking-widest text-slate-400">{item.label}</div>
                  <div className="mt-1 text-xl font-black text-slate-950">{item.value}</div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
            <section className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">Funil resumido</h2>
                <Filter className="h-4 w-4 text-slate-400" />
              </div>
              <div className="space-y-3">
                {PIPELINE.filter(stage => !['ganho', 'perdido'].includes(stage.id)).map(stage => {
                  const stageItems = opportunities.filter(item => item.stage_id === stage.id);
                  const stageValue = stageItems.reduce((sum, item) => sum + item.value, 0);
                  const pct = stats.totalOpen > 0 ? Math.max(4, (stageValue / stats.totalOpen) * 100) : 0;
                  return (
                    <div key={stage.id} className="grid grid-cols-[150px_1fr_120px] items-center gap-3 text-sm">
                      <span className="font-black text-slate-700">{stage.label}</span>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-right font-mono font-black text-slate-900">{currency.format(stageValue)}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4">
              <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-800">Atividades criticas</h2>
              <div className="space-y-2">
                {tasks.slice(0, 6).map(task => {
                  const opportunity = opportunities.find(item => item.id === task.opportunity_id);
                  return (
                    <button key={task.id} onClick={() => setSelectedOpportunityId(task.opportunity_id)} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50">
                      {task.status === 'ATRASADA' ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <Clock3 className="h-4 w-4 text-amber-600" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-slate-900">{task.title}</span>
                        <span className="block truncate text-xs font-semibold text-slate-500">{opportunity?.contact.name} - {opportunity?.property_name || opportunity?.title}</span>
                      </span>
                      <span className="text-xs font-black text-slate-500">{shortDate.format(new Date(task.due_at))}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}

      {activeView === 'funil' && (
        <div className="grid min-h-[560px] grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
          <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-3">
            <div className="grid min-w-[1120px] grid-cols-7 gap-3">
              {PIPELINE.filter(stage => !['ganho', 'perdido'].includes(stage.id)).map(stage => {
                const stageItems = filteredOpportunities.filter(item => item.stage_id === stage.id);
                return (
                  <div key={stage.id} className="rounded-lg bg-slate-50 p-2">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-xs font-black uppercase tracking-widest text-slate-600">{stage.label}</span>
                      <span className="rounded-md bg-white px-2 py-1 text-xs font-black text-slate-500">{stageItems.length}</span>
                    </div>
                    <div className="space-y-2">
                      {stageItems.map(item => (
                        <button key={item.id} onClick={() => setSelectedOpportunityId(item.id)} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-blue-300">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-black text-slate-950">{item.contact.name}</span>
                            <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${temperatureClass(item.temperature)}`}>{item.temperature}</span>
                          </div>
                          <div className="mt-2 text-xs font-semibold text-slate-500">{item.property_name || item.title}</div>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="font-mono text-sm font-black text-slate-900">{currency.format(item.value)}</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.owner_name}</span>
                          </div>
                          <div className="mt-3 flex gap-1">
                            <button type="button" onClick={(event) => { event.stopPropagation(); createProposal(item); }} className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-blue-700">Proposta</button>
                            <button type="button" onClick={(event) => { event.stopPropagation(); moveOpportunity(item.id, 'perdido'); }} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">Perdido</button>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="rounded-lg border border-slate-200 bg-white p-4">
            {selectedOpportunity ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-widest text-blue-700">Detalhe da oportunidade</div>
                  <h2 className="mt-1 text-xl font-black text-slate-950">{selectedOpportunity.contact.name}</h2>
                  <p className="text-sm font-semibold text-slate-500">{selectedOpportunity.title}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3"><span className="block text-xs font-black uppercase text-slate-400">Valor</span><strong>{currency.format(selectedOpportunity.value)}</strong></div>
                  <div className="rounded-lg bg-slate-50 p-3"><span className="block text-xs font-black uppercase text-slate-400">Origem</span><strong>{selectedOpportunity.source}</strong></div>
                </div>
                <div className="space-y-2">
                  <button disabled={activitySubmitting === `${selectedOpportunity.id}-WHATSAPP`} onClick={() => registerActivity(selectedOpportunity, 'WHATSAPP')} className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"><MessageSquare className="h-4 w-4 text-emerald-600" /> Registrar WhatsApp</button>
                  <button disabled={activitySubmitting === `${selectedOpportunity.id}-LIGACAO`} onClick={() => registerActivity(selectedOpportunity, 'LIGACAO')} className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"><Phone className="h-4 w-4 text-blue-600" /> Registrar ligacao</button>
                  <button onClick={() => createProposal(selectedOpportunity)} className="flex w-full items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-black text-white hover:bg-blue-700"><FileText className="h-4 w-4" /> Criar proposta</button>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-black uppercase tracking-widest text-slate-500">Historico</div>
                    <CalendarClock className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="space-y-2">
                    {selectedTimelineEvents.slice(0, 5).map(event => (
                      <div key={event.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-black text-slate-900">{event.title}</span>
                          <span className="shrink-0 text-[10px] font-black uppercase text-slate-400">{shortDate.format(new Date(event.at))}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{event.description}</p>
                      </div>
                    ))}
                    {selectedTimelineEvents.length === 0 && <div className="rounded-lg bg-slate-50 p-3 text-xs font-bold text-slate-500">Nenhuma atividade registrada.</div>}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Mover etapa</div>
                  <div className="grid grid-cols-2 gap-2">
                    {PIPELINE.map(stage => (
                      <button key={stage.id} onClick={() => moveOpportunity(selectedOpportunity.id, stage.id)} className={`rounded-lg border px-2 py-2 text-xs font-black uppercase ${selectedOpportunity.stage_id === stage.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{stage.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            ) : <div className="text-sm font-semibold text-slate-500">Selecione uma oportunidade.</div>}
          </aside>
        </div>
      )}

      {activeView === 'espelho' && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Espelho comercial</h2>
              <p className="text-sm font-semibold text-slate-500">Controle visual de disponibilidade, reserva e venda por empreendimento.</p>
            </div>
            <div className="text-xs font-black uppercase tracking-widest text-slate-500">{units.length} unidades</div>
          </div>
          <div className="space-y-4">
            {(buildings.length ? buildings : [{ id: '__standalone', name: 'Unidades sem empreendimento' } as Property]).map(building => {
              const buildingUnits = building.id === '__standalone' ? units.filter(unit => !unit.parent_id) : units.filter(unit => unit.parent_id === building.id);
              if (!buildingUnits.length) return null;
              const vgv = buildingUnits.reduce((sum, unit) => sum + Number(unit.current_price || unit.price || 0), 0);
              return (
                <div key={building.id} className="border-t border-slate-200 pt-4 first:border-t-0 first:pt-0">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-black text-slate-900">{building.name}</h3>
                    <span className="text-sm font-black text-slate-600">VGV {currency.format(vgv)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-8">
                    {buildingUnits.map(unit => (
                      <button key={unit.id} className={`rounded-lg border p-3 text-left ${statusClass(unit.status)}`}>
                        <div className="truncate text-sm font-black">{unit.name}</div>
                        <div className="mt-1 text-xs font-bold opacity-80">{unit.block || 'Bloco unico'} - {unit.floor ? `${unit.floor} pav.` : 'terreo'}</div>
                        <div className="mt-2 font-mono text-xs font-black">{currency.format(unit.current_price || unit.price || 0)}</div>
                        <div className="mt-1 text-[10px] font-black uppercase tracking-widest">{statusLabel(unit.status)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {units.length === 0 && <div className="rounded-lg bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">Nenhuma unidade cadastrada no modulo comercial.</div>}
          </div>
        </section>
      )}

      {activeView === 'propostas' && (
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <div>
              <h2 className="text-lg font-black text-slate-950">Propostas comerciais</h2>
              <p className="text-sm font-semibold text-slate-500">Primeira camada de proposta com versao, validade e status.</p>
            </div>
            <Send className="h-5 w-5 text-blue-600" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-center">Desconto</th>
                  <th className="px-4 py-3">Validade</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {proposals.map(proposal => {
                  const opportunity = opportunities.find(item => item.id === proposal.opportunity_id);
                  return (
                    <tr key={proposal.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-black text-slate-900">{opportunity?.contact.name || 'Lead'}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-600">{opportunity?.property_name || opportunity?.title}</td>
                      <td className="px-4 py-4 text-right font-mono font-black text-slate-900">{currency.format(proposal.value)}</td>
                      <td className="px-4 py-4 text-center font-black text-slate-600">{proposal.discount_pct}%</td>
                      <td className="px-4 py-4 text-sm font-bold text-slate-600">{shortDate.format(new Date(proposal.expires_at))}</td>
                      <td className="px-4 py-4"><span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-black uppercase text-blue-700">{proposal.status}</span></td>
                      <td className="px-4 py-4 text-right">
                        <button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-50">PDF</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {proposals.length === 0 && (
            <div className="p-8 text-center text-sm font-semibold text-slate-500">Ainda nao ha propostas. Crie uma a partir do funil.</div>
          )}
        </section>
      )}

      {leadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">Novo lead comercial</h2>
                <p className="text-sm font-semibold text-slate-500">Cadastre contato, interesse e proxima acao em um unico fluxo.</p>
              </div>
              <button type="button" onClick={closeLeadModal} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black uppercase text-slate-600 hover:bg-slate-50">
                Fechar
              </button>
            </div>

            <form onSubmit={submitLeadForm} className="space-y-5 p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm font-bold text-slate-700">
                  <span>Nome do lead</span>
                  <input value={leadForm.name} onChange={(event) => updateLeadForm('name', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500" autoFocus />
                </label>
                <label className="space-y-1 text-sm font-bold text-slate-700">
                  <span>Empresa</span>
                  <input value={leadForm.company} onChange={(event) => updateLeadForm('company', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500" />
                </label>
                <label className="space-y-1 text-sm font-bold text-slate-700">
                  <span>Telefone / WhatsApp</span>
                  <input value={leadForm.phone} onChange={(event) => updateLeadForm('phone', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500" />
                </label>
                <label className="space-y-1 text-sm font-bold text-slate-700">
                  <span>E-mail</span>
                  <input type="email" value={leadForm.email} onChange={(event) => updateLeadForm('email', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500" />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm font-bold text-slate-700 md:col-span-2">
                  <span>Produto ou interesse</span>
                  <input value={leadForm.title} onChange={(event) => updateLeadForm('title', event.target.value)} placeholder="Ex.: Apto 302 - Residencial Aura" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500" />
                </label>
                <label className="space-y-1 text-sm font-bold text-slate-700">
                  <span>Unidade vinculada</span>
                  <select value={leadForm.propertyId} onChange={(event) => updateLeadForm('propertyId', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500">
                    <option value="">Sem unidade definida</option>
                    {units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-bold text-slate-700">
                  <span>Valor estimado</span>
                  <input value={leadForm.value} onChange={(event) => updateLeadForm('value', event.target.value)} placeholder="R$ 0" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500" />
                </label>
                <label className="space-y-1 text-sm font-bold text-slate-700">
                  <span>Tipo</span>
                  <select value={leadForm.kind} onChange={(event) => updateLeadForm('kind', event.target.value as CrmOpportunityKind)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500">
                    <option value="VENDA_IMOVEL">Venda de imovel</option>
                    <option value="LOCACAO">Locacao</option>
                    <option value="SERVICO">Servico</option>
                    <option value="INVESTIMENTO">Investimento</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm font-bold text-slate-700">
                  <span>Origem</span>
                  <select value={leadForm.source} onChange={(event) => updateLeadForm('source', event.target.value as CrmLeadSource)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500">
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="SITE">Site</option>
                    <option value="INDICACAO">Indicacao</option>
                    <option value="CORRETOR">Corretor</option>
                    <option value="PORTAL">Portal</option>
                    <option value="EVENTO">Evento</option>
                    <option value="INTERNO">Interno</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm font-bold text-slate-700">
                  <span>Temperatura</span>
                  <select value={leadForm.temperature} onChange={(event) => updateLeadForm('temperature', event.target.value as CrmOpportunity['temperature'])} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500">
                    <option value="frio">Frio</option>
                    <option value="morno">Morno</option>
                    <option value="quente">Quente</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm font-bold text-slate-700">
                  <span>Responsavel</span>
                  <input value={leadForm.ownerName} onChange={(event) => updateLeadForm('ownerName', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500" />
                </label>
                <label className="space-y-1 text-sm font-bold text-slate-700 md:col-span-2">
                  <span>Proxima acao</span>
                  <input type="datetime-local" value={leadForm.nextActionDate} onChange={(event) => updateLeadForm('nextActionDate', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500" />
                </label>
              </div>

              {leadError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{leadError}</div>}

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeLeadModal} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={leadSubmitting} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                  <Plus className="h-4 w-4" /> {leadSubmitting ? 'Salvando' : 'Criar lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommercialCrmCockpit;
