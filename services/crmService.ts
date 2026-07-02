import { supabase } from '../lib/supabase';
import { CrmContact, CrmOpportunity, CrmProposal, CrmTask, CrmTimelineEvent } from '../types';

const isMissingCrmTable = (error: unknown) => {
  const err = error as { code?: string; message?: string } | null;
  return err?.code === '42P01' || String(err?.message || '').includes('crm_');
};

const mapOpportunity = (row: Record<string, unknown>): CrmOpportunity => {
  const contactRow = (row.contact || row.crm_contacts || {}) as Partial<CrmContact>;
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : undefined,
    contact_id: row.contact_id ? String(row.contact_id) : undefined,
    title: String(row.title || ''),
    kind: row.kind as CrmOpportunity['kind'],
    contact: {
      id: String(contactRow.id || row.contact_id || ''),
      organization_id: contactRow.organization_id,
      name: String(contactRow.name || 'Lead sem contato'),
      email: contactRow.email,
      phone: contactRow.phone,
      company: contactRow.company,
      document: contactRow.document,
    },
    source: row.source as CrmOpportunity['source'],
    stage_id: row.stage_id as CrmOpportunity['stage_id'],
    temperature: row.temperature as CrmOpportunity['temperature'],
    value: Number(row.value || 0),
    property_id: row.property_id ? String(row.property_id) : undefined,
    property_name: row.property_name ? String(row.property_name) : undefined,
    building_name: row.building_name ? String(row.building_name) : undefined,
    owner_name: row.owner_name ? String(row.owner_name) : undefined,
    next_action_at: row.next_action_at ? String(row.next_action_at) : undefined,
    loss_reason: row.loss_reason ? String(row.loss_reason) : undefined,
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
};

const stripId = <T extends { id?: string }>(payload: Partial<T>) => {
  const { id, ...rest } = payload;
  return rest;
};

export const crmService = {
  async listOpportunities(organizationId?: string): Promise<CrmOpportunity[]> {
    if (!organizationId) return [];

    const { data, error } = await supabase
      .from('crm_opportunities')
      .select('*, contact:crm_contacts(id, organization_id, name, email, phone, company, document)')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false });

    if (error) {
      if (isMissingCrmTable(error)) return [];
      console.error('[CRM SERVICE] listOpportunities error:', error);
      throw error;
    }

    return (data || []).map(row => mapOpportunity(row as Record<string, unknown>));
  },

  async listTasks(organizationId?: string): Promise<CrmTask[]> {
    if (!organizationId) return [];
    const { data, error } = await supabase
      .from('crm_tasks')
      .select('id, organization_id, opportunity_id, type, title, due_at, status, created_at, updated_at')
      .eq('organization_id', organizationId)
      .order('due_at', { ascending: true });

    if (error) {
      if (isMissingCrmTable(error)) return [];
      console.error('[CRM SERVICE] listTasks error:', error);
      throw error;
    }
    return (data || []) as CrmTask[];
  },

  async listProposals(organizationId?: string): Promise<CrmProposal[]> {
    if (!organizationId) return [];
    const { data, error } = await supabase
      .from('crm_proposals')
      .select('id, organization_id, opportunity_id, version, value, discount_pct, expires_at, status, created_at, updated_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingCrmTable(error)) return [];
      console.error('[CRM SERVICE] listProposals error:', error);
      throw error;
    }
    return (data || []) as CrmProposal[];
  },

  async listTimelineEvents(organizationId?: string): Promise<CrmTimelineEvent[]> {
    if (!organizationId) return [];
    const { data, error } = await supabase
      .from('crm_timeline_events')
      .select('id, organization_id, opportunity_id, at, title, description, created_at')
      .eq('organization_id', organizationId)
      .order('at', { ascending: false });

    if (error) {
      if (isMissingCrmTable(error)) return [];
      console.error('[CRM SERVICE] listTimelineEvents error:', error);
      throw error;
    }
    return (data || []) as CrmTimelineEvent[];
  },

  async createContact(contact: Partial<CrmContact> & { organization_id: string; name: string }) {
    const { data, error } = await supabase
      .from('crm_contacts')
      .insert(stripId(contact))
      .select('id, organization_id, name, email, phone, company, document, created_at, updated_at')
      .single();

    if (error) {
      console.error('[CRM SERVICE] createContact error:', error);
      throw error;
    }
    return data as CrmContact;
  },

  async createOpportunity(opportunity: Partial<CrmOpportunity> & { organization_id: string; title: string; contact_id?: string }) {
    const payload = {
      organization_id: opportunity.organization_id,
      contact_id: opportunity.contact_id,
      title: opportunity.title,
      kind: opportunity.kind || 'VENDA_IMOVEL',
      source: opportunity.source || 'INTERNO',
      stage_id: opportunity.stage_id || 'novo',
      temperature: opportunity.temperature || 'morno',
      value: opportunity.value || 0,
      property_id: opportunity.property_id,
      property_name: opportunity.property_name,
      building_name: opportunity.building_name,
      owner_name: opportunity.owner_name,
      next_action_at: opportunity.next_action_at,
      loss_reason: opportunity.loss_reason,
    };

    const { data, error } = await supabase
      .from('crm_opportunities')
      .insert(payload)
      .select('*, contact:crm_contacts(id, organization_id, name, email, phone, company, document)')
      .single();

    if (error) {
      console.error('[CRM SERVICE] createOpportunity error:', error);
      throw error;
    }
    return mapOpportunity(data as Record<string, unknown>);
  },

  async updateOpportunity(id: string, updates: Partial<CrmOpportunity>) {
    const payload = {
      title: updates.title,
      kind: updates.kind,
      source: updates.source,
      stage_id: updates.stage_id,
      temperature: updates.temperature,
      value: updates.value,
      property_id: updates.property_id,
      property_name: updates.property_name,
      building_name: updates.building_name,
      owner_name: updates.owner_name,
      next_action_at: updates.next_action_at,
      loss_reason: updates.loss_reason,
    };
    Object.keys(payload).forEach(key => {
      if (payload[key as keyof typeof payload] === undefined) delete payload[key as keyof typeof payload];
    });

    const { data, error } = await supabase
      .from('crm_opportunities')
      .update(payload)
      .eq('id', id)
      .select('*, contact:crm_contacts(id, organization_id, name, email, phone, company, document)')
      .single();

    if (error) {
      console.error('[CRM SERVICE] updateOpportunity error:', error);
      throw error;
    }
    return mapOpportunity(data as Record<string, unknown>);
  },

  async createTask(task: Partial<CrmTask> & { organization_id: string; opportunity_id: string; title: string; due_at: string }) {
    const { data, error } = await supabase
      .from('crm_tasks')
      .insert(stripId(task))
      .select('id, organization_id, opportunity_id, type, title, due_at, status, created_at, updated_at')
      .single();

    if (error) {
      console.error('[CRM SERVICE] createTask error:', error);
      throw error;
    }
    return data as CrmTask;
  },

  async createProposal(proposal: Partial<CrmProposal> & { organization_id: string; opportunity_id: string; value: number; expires_at: string }) {
    const { data: existing, error: countError } = await supabase
      .from('crm_proposals')
      .select('version')
      .eq('opportunity_id', proposal.opportunity_id)
      .order('version', { ascending: false })
      .limit(1);

    if (countError) {
      console.error('[CRM SERVICE] createProposal version error:', countError);
      throw countError;
    }

    const version = proposal.version || ((existing?.[0]?.version || 0) + 1);
    const { data, error } = await supabase
      .from('crm_proposals')
      .insert({ ...stripId(proposal), version })
      .select('id, organization_id, opportunity_id, version, value, discount_pct, expires_at, status, created_at, updated_at')
      .single();

    if (error) {
      console.error('[CRM SERVICE] createProposal error:', error);
      throw error;
    }
    return data as CrmProposal;
  },

  async createTimelineEvent(event: Partial<CrmTimelineEvent> & { organization_id: string; opportunity_id: string; title: string }) {
    const { data, error } = await supabase
      .from('crm_timeline_events')
      .insert(stripId(event))
      .select('id, organization_id, opportunity_id, at, title, description, created_at')
      .single();

    if (error) {
      console.error('[CRM SERVICE] createTimelineEvent error:', error);
      throw error;
    }
    return data as CrmTimelineEvent;
  },
};