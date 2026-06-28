import { supabase } from '../lib/supabase';
import {
  OrgRole,
  OrgFuncao,
  OrgFuncaoInsert,
  OrgRelationship,
  OrgRelationshipType,
  OrgAuthorityLimit,
  AuthorityFlowType,
  OrgDelegation,
  OrgRaciMatrix,
  OrgCommittee,
  OrgCommitteeMember,
  OrgSuccessionPlan,
  OrgSandboxScenario
} from '../types';

export const orgGovernanceService = {
  // ==========================================
  // FUNÇÕES (org_funcoes)
  // ==========================================
  async listFuncoes(companyId: string): Promise<OrgFuncao[]> {
    const { data, error } = await supabase
      .from('org_funcoes')
      .select('*')
      .eq('company_id', companyId)
      .order('nome');
    if (error) throw error;
    return data || [];
  },

  async saveFuncao(funcao: OrgFuncaoInsert & { id?: string }): Promise<OrgFuncao> {
    const payload = {
      company_id: funcao.company_id,
      nome: funcao.nome,
      descricao: funcao.descricao || null,
      categoria: funcao.categoria,
    };
    if (funcao.id) {
      const { data, error } = await supabase
        .from('org_funcoes')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', funcao.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await supabase
      .from('org_funcoes')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteFuncao(id: string): Promise<void> {
    const { error } = await supabase.from('org_funcoes').delete().eq('id', id);
    if (error) throw error;
  },

  // ==========================================
  // CARGOS (org_roles)
  // ==========================================
  async listRoles(companyId: string): Promise<OrgRole[]> {
    const { data, error } = await supabase
      .from('org_roles')
      .select('*')
      .eq('company_id', companyId)
      .order('nivel_hierarquico', { ascending: true })
      .order('nome', { ascending: true });

    if (error) {
      console.error('[OrgGovernanceService] Erro ao listar cargos:', error);
      throw new Error(`Erro ao listar cargos: ${error.message}`);
    }

    return data || [];
  },

  async saveRole(role: Omit<OrgRole, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<OrgRole> {
    const payload = {
      company_id: role.company_id,
      nome: role.nome,
      codigo: role.codigo || null,
      descricao: role.descricao || null,
      nivel_hierarquico: role.nivel_hierarquico,
      responsabilidades: role.responsabilidades || [],
      salario_minimo: role.salario_minimo ?? null,
      salario_maximo: role.salario_maximo ?? null,
      competencias: role.competencias || [],
      proximo_cargo_id: role.proximo_cargo_id || null,
      funcao_id: role.funcao_id || null,
    };

    let query;
    if (role.id) {
      query = supabase
        .from('org_roles')
        .update(payload)
        .eq('id', role.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('org_roles')
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[OrgGovernanceService] Erro ao salvar cargo:', error);
      throw new Error(`Erro ao salvar cargo: ${error.message}`);
    }

    return data;
  },

  async deleteRole(id: string): Promise<void> {
    const { error } = await supabase
      .from('org_roles')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[OrgGovernanceService] Erro ao deletar cargo:', error);
      throw new Error(`Erro ao deletar cargo: ${error.message}`);
    }
  },

  // ==========================================
  // RELACIONAMENTOS DINÂMICOS (org_relationships)
  // ==========================================
  async listRelationships(companyId: string, type?: OrgRelationshipType): Promise<OrgRelationship[]> {
    let query = supabase
      .from('org_relationships')
      .select('*')
      .eq('company_id', companyId);

    if (type) {
      query = query.eq('relationship_type', type);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[OrgGovernanceService] Erro ao listar relacionamentos:', error);
      throw new Error(`Erro ao listar relacionamentos: ${error.message}`);
    }

    return data || [];
  },

  async saveRelationship(rel: Omit<OrgRelationship, 'id' | 'created_at'> & { id?: string }): Promise<OrgRelationship> {
    const payload = {
      company_id: rel.company_id,
      relationship_type: rel.relationship_type,
      source_role_id: rel.source_role_id || null,
      target_role_id: rel.target_role_id || null,
      source_employee_id: rel.source_employee_id || null,
      target_employee_id: rel.target_employee_id || null,
      data_inicio: rel.data_inicio,
      data_fim: rel.data_fim || null
    };

    let query;
    if (rel.id) {
      query = supabase
        .from('org_relationships')
        .update(payload)
        .eq('id', rel.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('org_relationships')
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[OrgGovernanceService] Erro ao salvar relacionamento:', error);
      throw new Error(`Erro ao salvar relacionamento: ${error.message}`);
    }

    return data;
  },

  async deleteRelationship(id: string): Promise<void> {
    const { error } = await supabase
      .from('org_relationships')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[OrgGovernanceService] Erro ao deletar relacionamento:', error);
      throw new Error(`Erro ao deletar relacionamento: ${error.message}`);
    }
  },

  // ==========================================
  // LIMITES DE AUTORIDADE / ALÇADAS (org_authority_limits)
  // ==========================================
  async listAuthorityLimits(companyId: string, flowType?: AuthorityFlowType): Promise<OrgAuthorityLimit[]> {
    let query = supabase
      .from('org_authority_limits')
      .select('*')
      .eq('company_id', companyId);

    if (flowType) {
      query = query.eq('flow_type', flowType);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[OrgGovernanceService] Erro ao listar limites de autoridade:', error);
      throw new Error(`Erro ao listar limites de autoridade: ${error.message}`);
    }

    return data || [];
  },

  async saveAuthorityLimit(limit: Omit<OrgAuthorityLimit, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<OrgAuthorityLimit> {
    const payload = {
      company_id: limit.company_id,
      flow_type: limit.flow_type,
      role_id: limit.role_id || null,
      department_id: limit.department_id || null,
      employee_id: limit.employee_id || null,
      limite_minimo: limit.limite_minimo,
      limite_maximo: limit.limite_maximo,
      requer_dupla_assinatura: limit.requer_dupla_assinatura
    };

    let query;
    if (limit.id) {
      query = supabase
        .from('org_authority_limits')
        .update(payload)
        .eq('id', limit.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('org_authority_limits')
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[OrgGovernanceService] Erro ao salvar limite de autoridade:', error);
      throw new Error(`Erro ao salvar limite de autoridade: ${error.message}`);
    }

    return data;
  },

  async deleteAuthorityLimit(id: string): Promise<void> {
    const { error } = await supabase
      .from('org_authority_limits')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[OrgGovernanceService] Erro ao deletar limite de autoridade:', error);
      throw new Error(`Erro ao deletar limite de autoridade: ${error.message}`);
    }
  },

  // ==========================================
  // DELEGAÇÕES TEMPORÁRIAS (org_delegations)
  // ==========================================
  async listDelegations(companyId: string, status?: 'ativa' | 'expirada' | 'revogada'): Promise<OrgDelegation[]> {
    let query = supabase
      .from('org_delegations')
      .select('*')
      .eq('company_id', companyId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('data_inicio', { ascending: false });

    if (error) {
      console.error('[OrgGovernanceService] Erro ao listar delegações:', error);
      throw new Error(`Erro ao listar delegações: ${error.message}`);
    }

    return data || [];
  },

  async saveDelegation(delegation: Omit<OrgDelegation, 'id' | 'created_at'> & { id?: string }): Promise<OrgDelegation> {
    const payload = {
      company_id: delegation.company_id,
      delegator_employee_id: delegation.delegator_employee_id,
      delegatee_employee_id: delegation.delegatee_employee_id,
      flow_type: delegation.flow_type || null,
      limite_maximo: delegation.limite_maximo || null,
      data_inicio: delegation.data_inicio,
      data_fim: delegation.data_fim,
      status: delegation.status,
      motivo: delegation.motivo || null
    };

    let query;
    if (delegation.id) {
      query = supabase
        .from('org_delegations')
        .update(payload)
        .eq('id', delegation.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('org_delegations')
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[OrgGovernanceService] Erro ao salvar delegação:', error);
      throw new Error(`Erro ao salvar delegação: ${error.message}`);
    }

    return data;
  },

  async revokeDelegation(id: string): Promise<OrgDelegation> {
    const { data, error } = await supabase
      .from('org_delegations')
      .update({ status: 'revogada' })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[OrgGovernanceService] Erro ao revogar delegação:', error);
      throw new Error(`Erro ao revogar delegação: ${error.message}`);
    }

    return data;
  },

  async deleteDelegation(id: string): Promise<void> {
    const { error } = await supabase
      .from('org_delegations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[OrgGovernanceService] Erro ao deletar delegação:', error);
      throw new Error(`Erro ao deletar delegação: ${error.message}`);
    }
  },

  // ==========================================
  // MATRIZ RACI (org_raci_matrix)
  // ==========================================
  async listRaciMatrix(companyId: string, processo?: string): Promise<OrgRaciMatrix[]> {
    let query = supabase
      .from('org_raci_matrix')
      .select('*')
      .eq('company_id', companyId);

    if (processo) {
      query = query.eq('processo_nome', processo);
    }

    const { data, error } = await query.order('processo_nome', { ascending: true });

    if (error) {
      console.error('[OrgGovernanceService] Erro ao listar matriz RACI:', error);
      throw new Error(`Erro ao listar matriz RACI: ${error.message}`);
    }

    return data || [];
  },

  async saveRaciMatrix(raci: Omit<OrgRaciMatrix, 'id' | 'created_at'> & { id?: string }): Promise<OrgRaciMatrix> {
    const payload = {
      company_id: raci.company_id,
      processo_nome: raci.processo_nome,
      etapa_nome: raci.etapa_nome || null,
      role_type: raci.role_type,
      role_id: raci.role_id || null,
      department_id: raci.department_id || null,
      employee_id: raci.employee_id || null
    };

    let query;
    if (raci.id) {
      query = supabase
        .from('org_raci_matrix')
        .update(payload)
        .eq('id', raci.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('org_raci_matrix')
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[OrgGovernanceService] Erro ao salvar matriz RACI:', error);
      throw new Error(`Erro ao salvar matriz RACI: ${error.message}`);
    }

    return data;
  },

  async deleteRaciMatrix(id: string): Promise<void> {
    const { error } = await supabase
      .from('org_raci_matrix')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[OrgGovernanceService] Erro ao deletar registro RACI:', error);
      throw new Error(`Erro ao deletar registro RACI: ${error.message}`);
    }
  },

  // ==========================================
  // GESTÃO DE COMITÊS (org_committees)
  // ==========================================
  async listCommittees(companyId: string): Promise<OrgCommittee[]> {
    const { data, error } = await supabase
      .from('org_committees')
      .select('*')
      .eq('company_id', companyId)
      .order('nome', { ascending: true });

    if (error) {
      console.error('[OrgGovernanceService] Erro ao listar comitês:', error);
      throw new Error(`Erro ao listar comitês: ${error.message}`);
    }

    return data || [];
  },

  async saveCommittee(committee: Omit<OrgCommittee, 'id' | 'created_at'> & { id?: string }): Promise<OrgCommittee> {
    const payload = {
      company_id: committee.company_id,
      nome: committee.nome,
      descricao: committee.descricao || null,
      data_constituicao: committee.data_constituicao || null,
      data_encerramento: committee.data_encerramento || null,
      status: committee.status
    };

    let query;
    if (committee.id) {
      query = supabase
        .from('org_committees')
        .update(payload)
        .eq('id', committee.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('org_committees')
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[OrgGovernanceService] Erro ao salvar comitê:', error);
      throw new Error(`Erro ao salvar comitê: ${error.message}`);
    }

    return data;
  },

  async deleteCommittee(id: string): Promise<void> {
    const { error } = await supabase
      .from('org_committees')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[OrgGovernanceService] Erro ao deletar comitê:', error);
      throw new Error(`Erro ao deletar comitê: ${error.message}`);
    }
  },

  async listCommitteeMembers(committeeId: string): Promise<OrgCommitteeMember[]> {
    const { data, error } = await supabase
      .from('org_committee_members')
      .select('*')
      .eq('committee_id', committeeId)
      .order('data_inicio', { ascending: true });

    if (error) {
      console.error('[OrgGovernanceService] Erro ao listar membros do comitê:', error);
      throw new Error(`Erro ao listar membros do comitê: ${error.message}`);
    }

    return data || [];
  },

  async addCommitteeMember(member: Omit<OrgCommitteeMember, 'id' | 'created_at'>): Promise<OrgCommitteeMember> {
    const payload = {
      committee_id: member.committee_id,
      employee_id: member.employee_id,
      papel: member.papel,
      data_inicio: member.data_inicio,
      data_fim: member.data_fim || null
    };

    const { data, error } = await supabase
      .from('org_committee_members')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[OrgGovernanceService] Erro ao adicionar membro ao comitê:', error);
      throw new Error(`Erro ao adicionar membro ao comitê: ${error.message}`);
    }

    return data;
  },

  async removeCommitteeMember(id: string): Promise<void> {
    const { error } = await supabase
      .from('org_committee_members')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[OrgGovernanceService] Erro ao remover membro do comitê:', error);
      throw new Error(`Erro ao remover membro do comitê: ${error.message}`);
    }
  },

  // ==========================================
  // PLANOS DE SUCESSÃO (org_succession_plans)
  // ==========================================
  async listSuccessionPlans(companyId: string): Promise<OrgSuccessionPlan[]> {
    const { data, error } = await supabase
      .from('org_succession_plans')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[OrgGovernanceService] Erro ao listar planos de sucessão:', error);
      throw new Error(`Erro ao listar planos de sucessão: ${error.message}`);
    }

    return data || [];
  },

  async saveSuccessionPlan(plan: Omit<OrgSuccessionPlan, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<OrgSuccessionPlan> {
    const payload = {
      company_id: plan.company_id,
      target_role_id: plan.target_role_id,
      current_employee_id: plan.current_employee_id || null,
      successor_employee_id: plan.successor_employee_id,
      prontidao: plan.prontidao,
      risco_perda: plan.risco_perda,
      gap_competencias: plan.gap_competencias || [],
      plano_desenvolvimento: plan.plano_desenvolvimento || null
    };

    let query;
    if (plan.id) {
      query = supabase
        .from('org_succession_plans')
        .update(payload)
        .eq('id', plan.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('org_succession_plans')
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[OrgGovernanceService] Erro ao salvar plano de sucessão:', error);
      throw new Error(`Erro ao salvar plano de sucessão: ${error.message}`);
    }

    return data;
  },

  async deleteSuccessionPlan(id: string): Promise<void> {
    const { error } = await supabase
      .from('org_succession_plans')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[OrgGovernanceService] Erro ao deletar plano de sucessão:', error);
      throw new Error(`Erro ao deletar plano de sucessão: ${error.message}`);
    }
  },

  // ==========================================
  // MODO SANDBOX (org_sandbox_scenarios)
  // ==========================================
  async listSandboxScenarios(companyId: string): Promise<OrgSandboxScenario[]> {
    const { data, error } = await supabase
      .from('org_sandbox_scenarios')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[OrgGovernanceService] Erro ao listar cenários sandbox:', error);
      throw new Error(`Erro ao listar cenários sandbox: ${error.message}`);
    }

    return data || [];
  },

  async saveSandboxScenario(scenario: Omit<OrgSandboxScenario, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<OrgSandboxScenario> {
    const payload = {
      company_id: scenario.company_id,
      nome: scenario.nome,
      descricao: scenario.descricao || null,
      estrutura_dados: scenario.estrutura_dados,
      criador_email: scenario.criador_email,
      status: scenario.status
    };

    let query;
    if (scenario.id) {
      query = supabase
        .from('org_sandbox_scenarios')
        .update(payload)
        .eq('id', scenario.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('org_sandbox_scenarios')
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[OrgGovernanceService] Erro ao salvar cenário sandbox:', error);
      throw new Error(`Erro ao salvar cenário sandbox: ${error.message}`);
    }

    return data;
  },

  async approveSandboxScenario(id: string, approverEmail: string): Promise<OrgSandboxScenario> {
    const { data, error } = await supabase
      .from('org_sandbox_scenarios')
      .update({ status: 'aprovado', criador_email: approverEmail })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[OrgGovernanceService] Erro ao aprovar cenário sandbox:', error);
      throw new Error(`Erro ao aprovar cenário sandbox: ${error.message}`);
    }

    return data;
  },

  async deleteSandboxScenario(id: string): Promise<void> {
    const { error } = await supabase
      .from('org_sandbox_scenarios')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[OrgGovernanceService] Erro ao deletar cenário sandbox:', error);
      throw new Error(`Erro ao deletar cenário sandbox: ${error.message}`);
    }
  }
};
