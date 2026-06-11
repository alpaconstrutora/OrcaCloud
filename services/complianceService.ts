import { supabase } from '../lib/supabase';
import { 
  CompliancePhysicalLocation, 
  ComplianceRule, 
  ComplianceChecklist, 
  ComplianceEvidence 
} from '../types';

export const complianceService = {
  // ==========================================
  // ESPAÇOS FÍSICOS (SEGREGAÇÃO OPERACIONAL)
  // ==========================================
  async listPhysicalLocations(orgId?: string): Promise<CompliancePhysicalLocation[]> {
    let query = supabase.from('compliance_physical_locations').select('*');
    
    if (orgId) {
      query = query.eq('org_id', orgId);
    }
    
    query = query.order('name', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('[ComplianceService] Erro ao listar locais físicos:', error);
      throw new Error(`Erro ao listar locais físicos: ${error.message}`);
    }

    return data || [];
  },

  async savePhysicalLocation(location: Omit<CompliancePhysicalLocation, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<CompliancePhysicalLocation> {
    const payload = {
      org_id: location.org_id,
      company_id: location.company_id,
      name: location.name,
      type: location.type,
      coordinates: location.coordinates || null,
      status: location.status
    };

    let query;
    if (location.id) {
      query = supabase
        .from('compliance_physical_locations')
        .update(payload)
        .eq('id', location.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('compliance_physical_locations')
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ComplianceService] Erro ao salvar local físico:', error);
      throw new Error(`Erro ao salvar local físico: ${error.message}`);
    }

    return data;
  },

  async deletePhysicalLocation(id: string): Promise<void> {
    const { error } = await supabase
      .from('compliance_physical_locations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[ComplianceService] Erro ao deletar local físico:', error);
      throw new Error(`Erro ao deletar local físico: ${error.message}`);
    }
  },

  // ==========================================
  // REGRAS DE COMPLIANCE
  // ==========================================
  async listRules(orgId?: string): Promise<ComplianceRule[]> {
    let query = supabase.from('compliance_rules').select('*');
    
    if (orgId) {
      query = query.eq('org_id', orgId);
    }
    
    query = query.order('name', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('[ComplianceService] Erro ao listar regras de compliance:', error);
      throw new Error(`Erro ao listar regras de compliance: ${error.message}`);
    }

    return data || [];
  },

  async saveRule(rule: Omit<ComplianceRule, 'id' | 'created_at'> & { id?: string }): Promise<ComplianceRule> {
    const payload = {
      org_id: rule.org_id,
      name: rule.name,
      description: rule.description,
      category: rule.category,
      metric_threshold: rule.metric_threshold,
      recurrence_days: rule.recurrence_days
    };

    let query;
    if (rule.id) {
      query = supabase
        .from('compliance_rules')
        .update(payload)
        .eq('id', rule.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('compliance_rules')
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ComplianceService] Erro ao salvar regra:', error);
      throw new Error(`Erro ao salvar regra: ${error.message}`);
    }

    return data;
  },

  async deleteRule(id: string): Promise<void> {
    const { error } = await supabase
      .from('compliance_rules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[ComplianceService] Erro ao deletar regra:', error);
      throw new Error(`Erro ao deletar regra: ${error.message}`);
    }
  },

  // ==========================================
  // CHECKLISTS
  // ==========================================
  async listChecklists(orgId?: string, companyId?: string): Promise<(ComplianceChecklist & { compliance_rules?: ComplianceRule })[]> {
    let query = supabase
      .from('compliance_checklists')
      .select('*, compliance_rules(*)');
    
    if (orgId) {
      query = query.eq('org_id', orgId);
    }
    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    
    query = query.order('due_date', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('[ComplianceService] Erro ao listar checklists:', error);
      throw new Error(`Erro ao listar checklists: ${error.message}`);
    }

    return data || [];
  },

  async saveChecklist(checklist: Omit<ComplianceChecklist, 'id' | 'created_at'> & { id?: string }): Promise<ComplianceChecklist> {
    const payload = {
      org_id: checklist.org_id,
      company_id: checklist.company_id,
      rule_id: checklist.rule_id,
      title: checklist.title,
      status: checklist.status,
      due_date: checklist.due_date,
      completed_at: checklist.completed_at || null,
      completed_by: checklist.completed_by || null,
      notes: checklist.notes
    };

    let query;
    if (checklist.id) {
      query = supabase
        .from('compliance_checklists')
        .update(payload)
        .eq('id', checklist.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('compliance_checklists')
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ComplianceService] Erro ao salvar checklist:', error);
      throw new Error(`Erro ao salvar checklist: ${error.message}`);
    }

    return data;
  },

  async deleteChecklist(id: string): Promise<void> {
    const { error } = await supabase
      .from('compliance_checklists')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[ComplianceService] Erro ao deletar checklist:', error);
      throw new Error(`Erro ao deletar checklist: ${error.message}`);
    }
  },

  // ==========================================
  // EVIDÊNCIAS
  // ==========================================
  async listEvidences(orgId?: string, checklistId?: string): Promise<ComplianceEvidence[]> {
    let query = supabase.from('compliance_evidences').select('*');
    
    if (orgId) {
      query = query.eq('org_id', orgId);
    }
    if (checklistId) {
      query = query.eq('checklist_id', checklistId);
    }
    
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('[ComplianceService] Erro ao listar evidências:', error);
      throw new Error(`Erro ao listar evidências: ${error.message}`);
    }

    return data || [];
  },

  async saveEvidence(evidence: Omit<ComplianceEvidence, 'id' | 'created_at'> & { id?: string }): Promise<ComplianceEvidence> {
    const payload = {
      org_id: evidence.org_id,
      company_id: evidence.company_id,
      checklist_id: evidence.checklist_id,
      operation_type: evidence.operation_type,
      document_ref: evidence.document_ref || null,
      operator_email: evidence.operator_email,
      evidence_url: evidence.evidence_url,
      file_hash: evidence.file_hash || null,
      latitude: evidence.latitude || null,
      longitude: evidence.longitude || null,
      captured_at: evidence.captured_at
    };

    let query;
    if (evidence.id) {
      query = supabase
        .from('compliance_evidences')
        .update(payload)
        .eq('id', evidence.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('compliance_evidences')
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ComplianceService] Erro ao salvar evidência:', error);
      throw new Error(`Erro ao salvar evidência: ${error.message}`);
    }

    return data;
  },

  async deleteEvidence(id: string): Promise<void> {
    const { error } = await supabase
      .from('compliance_evidences')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[ComplianceService] Erro ao deletar evidência:', error);
      throw new Error(`Erro ao deletar evidência: ${error.message}`);
    }
  },

  // ==========================================
  // STORAGE UPLOAD
  // ==========================================
  async uploadEvidenceFile(file: File, orgId: string): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${orgId}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data, error } = await supabase.storage
      .from('compliance-evidences')
      .upload(filePath, file);

    if (error) {
      console.error('[ComplianceService] Erro no upload de evidência:', error);
      throw new Error(`Erro ao enviar arquivo de evidência: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('compliance-evidences')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }
};
