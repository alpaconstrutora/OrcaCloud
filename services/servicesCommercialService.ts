import { supabase } from '../lib/supabase';

export type OpportunityStage = 'lead' | 'visit' | 'budget' | 'proposal' | 'won' | 'lost';
export type Priority = 'low' | 'medium' | 'high';

export interface ServiceOpportunity {
  id: string;
  organization_id: string;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  contact_whatsapp: string | null;
  city: string | null;
  work_type: string | null;
  estimated_area: number | null;
  estimated_value: number | null;
  scope_summary: string | null;
  stage: OpportunityStage;
  assigned_to: string | null;
  priority: Priority;
  origin_channel: string | null;
  lost_reason: string | null;
  won_at: string | null;
  lost_at: string | null;
  converted_project_id: string | null;
  converted_contract_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceBudget {
  id: string;
  opportunity_id: string;
  organization_id: string;
  subtotal: number;
  margin_pct: number;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items?: ServiceBudgetItem[];
}

export interface ServiceBudgetItem {
  id: string;
  budget_id: string;
  organization_id: string;
  position: number;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface ServiceProposal {
  id: string;
  opportunity_id: string;
  organization_id: string;
  budget_id: string | null;
  proposal_number: string;
  total_value: number;
  scope: string | null;
  payment_terms: string | null;
  delivery_term_days: number | null;
  valid_until: string | null;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  pdf_storage_path: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceVisit {
  id: string;
  opportunity_id: string;
  organization_id: string;
  scheduled_at: string | null;
  performed_at: string | null;
  performed_by: string | null;
  checklist: Array<{ item: string; ok: boolean; note: string }>;
  observations: string | null;
  latitude: number | null;
  longitude: number | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  photos?: ServiceVisitPhoto[];
}

export interface ServiceVisitPhoto {
  id: string;
  visit_id: string;
  organization_id: string;
  storage_path: string;
  caption: string | null;
  taken_at: string;
}

export interface ServiceOpportunityEvent {
  id: string;
  opportunity_id: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  payload: Record<string, unknown>;
  actor: string | null;
  created_at: string;
}

// ─── Opportunities ────────────────────────────────────────────────────────────

export const servicesCommercialService = {
  async listOpportunities(organizationId: string): Promise<ServiceOpportunity[]> {
    const { data, error } = await supabase
      .from('services_opportunities')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async getOpportunity(id: string): Promise<ServiceOpportunity | null> {
    const { data, error } = await supabase
      .from('services_opportunities')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async createOpportunity(
    payload: Omit<ServiceOpportunity, 'id' | 'created_at' | 'updated_at' | 'won_at' | 'lost_at' | 'converted_project_id' | 'converted_contract_id'>
  ): Promise<ServiceOpportunity> {
    const { data, error } = await supabase
      .from('services_opportunities')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateOpportunity(id: string, payload: Partial<ServiceOpportunity>): Promise<ServiceOpportunity> {
    const { data, error } = await supabase
      .from('services_opportunities')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async moveStage(id: string, stage: OpportunityStage, lostReason?: string): Promise<ServiceOpportunity> {
    const payload: Partial<ServiceOpportunity> = { stage };
    if (stage === 'lost' && lostReason) payload.lost_reason = lostReason;
    return servicesCommercialService.updateOpportunity(id, payload);
  },

  async deleteOpportunity(id: string): Promise<void> {
    const { error } = await supabase.from('services_opportunities').delete().eq('id', id);
    if (error) throw error;
  },

  async listEvents(opportunityId: string): Promise<ServiceOpportunityEvent[]> {
    const { data, error } = await supabase
      .from('services_opportunity_events')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  // ─── Visits ───────────────────────────────────────────────────────────────

  async getVisit(opportunityId: string): Promise<ServiceVisit | null> {
    const { data, error } = await supabase
      .from('services_visits')
      .select('*, photos:services_visit_photos(*)')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsertVisit(payload: Partial<ServiceVisit> & { opportunity_id: string; organization_id: string }): Promise<ServiceVisit> {
    const { data, error } = await supabase
      .from('services_visits')
      .upsert(payload, { onConflict: 'opportunity_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async addVisitPhoto(photo: Omit<ServiceVisitPhoto, 'id' | 'created_at'>): Promise<ServiceVisitPhoto> {
    const { data, error } = await supabase
      .from('services_visit_photos')
      .insert(photo)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async uploadVisitPhoto(orgId: string, visitId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop();
    const path = `${orgId}/${visitId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('services-visits').upload(path, file);
    if (error) throw error;
    return path;
  },

  // ─── Budgets ──────────────────────────────────────────────────────────────

  async getBudget(opportunityId: string): Promise<ServiceBudget | null> {
    const { data, error } = await supabase
      .from('services_budgets')
      .select('*, items:services_budget_items(*)')
      .eq('opportunity_id', opportunityId)
      .maybeSingle();
    if (error) throw error;
    if (data?.items) {
      data.items = data.items.sort((a: ServiceBudgetItem, b: ServiceBudgetItem) => a.position - b.position);
    }
    return data;
  },

  async upsertBudget(payload: Partial<ServiceBudget> & { opportunity_id: string; organization_id: string }): Promise<ServiceBudget> {
    const { data, error } = await supabase
      .from('services_budgets')
      .upsert(payload, { onConflict: 'opportunity_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async upsertBudgetItem(item: Partial<ServiceBudgetItem> & { budget_id: string; organization_id: string }): Promise<ServiceBudgetItem> {
    const { data, error } = await supabase
      .from('services_budget_items')
      .upsert(item)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteBudgetItem(id: string): Promise<void> {
    const { error } = await supabase.from('services_budget_items').delete().eq('id', id);
    if (error) throw error;
  },

  // ─── Proposals ────────────────────────────────────────────────────────────

  async getProposal(opportunityId: string): Promise<ServiceProposal | null> {
    const { data, error } = await supabase
      .from('services_proposals')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async createProposal(payload: Omit<ServiceProposal, 'id' | 'proposal_number' | 'created_at' | 'updated_at' | 'sent_at' | 'pdf_storage_path'>): Promise<ServiceProposal> {
    const { data, error } = await supabase
      .from('services_proposals')
      .insert({ ...payload, proposal_number: '' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateProposal(id: string, payload: Partial<ServiceProposal>): Promise<ServiceProposal> {
    const { data, error } = await supabase
      .from('services_proposals')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ─── Conversion result ────────────────────────────────────────────────────

  async getConversionResult(opp: ServiceOpportunity): Promise<{
    contractNumber: string | null;
    projectName: string | null;
    projectId: string | null;
    contractId: string | null;
  }> {
    const [contractResult, projectResult] = await Promise.all([
      opp.converted_contract_id
        ? supabase
            .from('services_contracts')
            .select('contract_number')
            .eq('id', opp.converted_contract_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
      opp.converted_project_id
        ? supabase
            .from('projects')
            .select('name')
            .eq('id', opp.converted_project_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);
    return {
      contractNumber: contractResult.data?.contract_number ?? null,
      projectName: projectResult.data?.name ?? null,
      projectId: opp.converted_project_id,
      contractId: opp.converted_contract_id,
    };
  },

  // ─── Dashboard KPIs ───────────────────────────────────────────────────────

  async getKPIs(organizationId: string) {
    const { data, error } = await supabase
      .from('services_opportunities')
      .select('stage, estimated_value, won_at, created_at')
      .eq('organization_id', organizationId);
    if (error) throw error;
    const all = data ?? [];
    const active = all.filter(o => !['won', 'lost'].includes(o.stage));
    const sent = all.filter(o => ['proposal', 'won'].includes(o.stage));
    const won = all.filter(o => o.stage === 'won');
    const closed = all.filter(o => ['won', 'lost'].includes(o.stage));
    const conversionRate = closed.length > 0 ? Math.round((won.length / closed.length) * 100) : 0;
    const inNegotiation = active.reduce((acc, o) => acc + (o.estimated_value ?? 0), 0);
    return { activeLeads: active.length, proposalsSent: sent.length, inNegotiation, conversionRate };
  },
};
