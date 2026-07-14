import { supabase } from '../lib/supabase';
import {
  OpuraCnoRegistration,
  OpuraCnoRegistrationInsert,
  OpuraCnoRegistrationUpdate,
  OpuraCnoSimulation,
  OpuraCnoSimulationInsert,
  OpuraCnoSimulationUpdate,
  OpuraCnoDeduction,
  OpuraCnoDeductionInsert,
  OpuraCnoDeductionUpdate,
  OpuraCnoComplianceScore,
  OpuraCnoComplianceScoreInsert,
  OpuraCnoComplianceScoreUpdate,
  OpuraCnoDctfweb,
  OpuraCnoDctfwebInsert
} from '../types';

const DCTFWEB_COLUMNS =
  'id, organization_id, cno_registration_id, declaration_number, transmission_date, principal_amount, fine_amount, interest_amount, total_amount, status, created_at, updated_at';

export const cnoService = {
  // ==========================================
  // 1. CADASTRO DE CNO (opura_cno_registrations)
  // ==========================================

  async listRegistrations(organizationId?: string): Promise<OpuraCnoRegistration[]> {
    let query = supabase.from('opura_cno_registrations').select('*');

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('[CnoService] Erro ao listar cadastros de CNO:', error);
      throw new Error(`Erro ao listar cadastros de CNO: ${error.message}`);
    }

    return data || [];
  },

  async getRegistrationByProject(projectId: string): Promise<OpuraCnoRegistration | null> {
    const { data, error } = await supabase
      .from('opura_cno_registrations')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) {
      console.error('[CnoService] Erro ao buscar CNO do projeto:', error);
      throw new Error(`Erro ao buscar CNO do projeto: ${error.message}`);
    }

    return data;
  },

  async getRegistrationById(id: string): Promise<OpuraCnoRegistration | null> {
    const { data, error } = await supabase
      .from('opura_cno_registrations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[CnoService] Erro ao buscar CNO por ID:', error);
      throw new Error(`Erro ao buscar CNO por ID: ${error.message}`);
    }

    return data;
  },

  async createRegistration(registration: OpuraCnoRegistrationInsert): Promise<OpuraCnoRegistration> {
    const { data, error } = await supabase
      .from('opura_cno_registrations')
      .insert(registration)
      .select()
      .single();

    if (error) {
      console.error('[CnoService] Erro ao criar cadastro de CNO:', error);
      throw new Error(`Erro ao criar cadastro de CNO: ${error.message}`);
    }

    return data;
  },

  async updateRegistration(id: string, updates: OpuraCnoRegistrationUpdate): Promise<OpuraCnoRegistration> {
    const { data, error } = await supabase
      .from('opura_cno_registrations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[CnoService] Erro ao atualizar cadastro de CNO:', error);
      throw new Error(`Erro ao atualizar cadastro de CNO: ${error.message}`);
    }

    return data;
  },

  async deleteRegistration(id: string): Promise<void> {
    const { error } = await supabase
      .from('opura_cno_registrations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[CnoService] Erro ao deletar cadastro de CNO:', error);
      throw new Error(`Erro ao deletar cadastro de CNO: ${error.message}`);
    }
  },

  // ==========================================
  // 2. SIMULAÇÃO DE INSS (opura_cno_simulations)
  // ==========================================

  async listSimulations(projectId: string): Promise<OpuraCnoSimulation[]> {
    const { data, error } = await supabase
      .from('opura_cno_simulations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[CnoService] Erro ao listar simulações do projeto:', error);
      throw new Error(`Erro ao listar simulações do projeto: ${error.message}`);
    }

    return data || [];
  },

  async getSimulationById(id: string): Promise<OpuraCnoSimulation | null> {
    const { data, error } = await supabase
      .from('opura_cno_simulations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[CnoService] Erro ao buscar simulação por ID:', error);
      throw new Error(`Erro ao buscar simulação por ID: ${error.message}`);
    }

    return data;
  },

  async createSimulation(simulation: OpuraCnoSimulationInsert): Promise<OpuraCnoSimulation> {
    const { data, error } = await supabase
      .from('opura_cno_simulations')
      .insert(simulation)
      .select()
      .single();

    if (error) {
      console.error('[CnoService] Erro ao criar simulação de INSS:', error);
      throw new Error(`Erro ao criar simulação de INSS: ${error.message}`);
    }

    return data;
  },

  async updateSimulation(id: string, updates: OpuraCnoSimulationUpdate): Promise<OpuraCnoSimulation> {
    const { data, error } = await supabase
      .from('opura_cno_simulations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[CnoService] Erro ao atualizar simulação de INSS:', error);
      throw new Error(`Erro ao atualizar simulação de INSS: ${error.message}`);
    }

    return data;
  },

  async deleteSimulation(id: string): Promise<void> {
    const { error } = await supabase
      .from('opura_cno_simulations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[CnoService] Erro ao deletar simulação de INSS:', error);
      throw new Error(`Erro ao deletar simulação de INSS: ${error.message}`);
    }
  },

  // ==========================================
  // 3. DEDUÇÕES PREVIDENCIÁRIAS (opura_cno_deductions)
  // ==========================================

  async listDeductions(projectId: string): Promise<OpuraCnoDeduction[]> {
    const { data, error } = await supabase
      .from('opura_cno_deductions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[CnoService] Erro ao listar deduções do projeto:', error);
      throw new Error(`Erro ao listar deduções do projeto: ${error.message}`);
    }

    return data || [];
  },

  async getDeductionById(id: string): Promise<OpuraCnoDeduction | null> {
    const { data, error } = await supabase
      .from('opura_cno_deductions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[CnoService] Erro ao buscar dedução por ID:', error);
      throw new Error(`Erro ao buscar dedução por ID: ${error.message}`);
    }

    return data;
  },

  async createDeduction(deduction: OpuraCnoDeductionInsert): Promise<OpuraCnoDeduction> {
    const { data, error } = await supabase
      .from('opura_cno_deductions')
      .insert(deduction)
      .select()
      .single();

    if (error) {
      console.error('[CnoService] Erro ao criar dedução de CNO:', error);
      throw new Error(`Erro ao criar dedução de CNO: ${error.message}`);
    }

    return data;
  },

  async updateDeduction(id: string, updates: OpuraCnoDeductionUpdate): Promise<OpuraCnoDeduction> {
    const { data, error } = await supabase
      .from('opura_cno_deductions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[CnoService] Erro ao atualizar dedução de CNO:', error);
      throw new Error(`Erro ao atualizar dedução de CNO: ${error.message}`);
    }

    return data;
  },

  async deleteDeduction(id: string): Promise<void> {
    const { error } = await supabase
      .from('opura_cno_deductions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[CnoService] Erro ao deletar dedução de CNO:', error);
      throw new Error(`Erro ao deletar dedução de CNO: ${error.message}`);
    }
  },

  // ==========================================
  // 4. SCORE DE COMPLIANCE (opura_cno_compliance_score)
  // ==========================================

  async getComplianceScore(projectId: string): Promise<OpuraCnoComplianceScore | null> {
    const { data, error } = await supabase
      .from('opura_cno_compliance_score')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) {
      console.error('[CnoService] Erro ao buscar score de compliance do projeto:', error);
      throw new Error(`Erro ao buscar score de compliance: ${error.message}`);
    }

    return data;
  },

  async upsertComplianceScore(score: OpuraCnoComplianceScoreInsert): Promise<OpuraCnoComplianceScore> {
    const { data, error } = await supabase
      .from('opura_cno_compliance_score')
      .upsert(score, { onConflict: 'project_id' })
      .select()
      .single();

    if (error) {
      console.error('[CnoService] Erro ao salvar/atualizar score de compliance:', error);
      throw new Error(`Erro ao salvar score de compliance: ${error.message}`);
    }

    return data;
  },

  // ==========================================
  // 5. MOTOR DE CÁLCULO E INTELIGÊNCIA (Opção A)
  // ==========================================

  async calculateSimulation(params: {
    projectId: string;
    state: string;
    referenceDate: string;
    socialCharges: 'com_desoneracao' | 'sem_desoneracao';
    areaConstruida: number;
    padrao: 'baixo' | 'normal' | 'alto';
    metodoConstrutivo: 'convencional' | 'estrutura_metalica' | 'pre_moldado' | 'steel_frame' | 'drywall' | 'modular' | 'industrializada';
    regimeContratacao: 'empreitada_global' | 'equipe_propria' | 'empreitada_parcial' | 'turnkey' | 'bts';
  }): Promise<{
    custoEstimadoObra: number;
    baseCalculoMaoObra: number;
    inssPatronalEstimado: number;
    economiaMetodoConstrutivo: number;
    inssFinalEstimado: number;
    cubValor: number;
  }> {
    const { data: cubData, error: cubError } = await supabase
      .from('cub_parametric_data')
      .select('*')
      .eq('state', params.state)
      .eq('reference_date', params.referenceDate)
      .eq('social_charges', params.socialCharges)
      .maybeSingle();

    if (cubError) {
      console.error('[CnoService] Erro ao buscar dados do CUB:', cubError);
      throw new Error(`Erro ao buscar dados do CUB: ${cubError.message}`);
    }

    let cubValue = 2500; // fallback padrão nacional aproximado
    if (cubData) {
      if (params.padrao === 'baixo') {
        cubValue = Number(cubData.r1_b || cubData.pp_4_b || 2000);
      } else if (params.padrao === 'alto') {
        cubValue = Number(cubData.r1_a || cubData.r8_a || 3500);
      } else {
        cubValue = Number(cubData.r1_n || cubData.r8_n || 2600);
      }
    }

    const custoEstimadoObra = params.areaConstruida * cubValue;

    // Percentual padrão de mão de obra (Aferição SERO) - Padrão 40%
    const percentualMaoObra = 0.40;

    // Aplica redutores legais com base no método construtivo (IN RFB 2110)
    let redutorMetodoConstrutivo = 1.0; 
    if (['pre_moldado', 'industrializada', 'modular'].includes(params.metodoConstrutivo)) {
      redutorMetodoConstrutivo = 0.50; 
    } else if (['estrutura_metalica', 'steel_frame'].includes(params.metodoConstrutivo)) {
      redutorMetodoConstrutivo = 0.60; 
    } else if (params.metodoConstrutivo === 'drywall') {
      redutorMetodoConstrutivo = 0.85; 
    }

    const baseCalculoMaoObra = custoEstimadoObra * percentualMaoObra * redutorMetodoConstrutivo;

    // INSS Estimado = 36.8% (patronal 20% + RAT 3% + Terceiros 5.8% + Segurados 8%)
    const taxaInss = 0.368;
    const inssPatronalEstimado = custoEstimadoObra * percentualMaoObra * taxaInss; 
    const inssFinalEstimado = baseCalculoMaoObra * taxaInss;
    const economiaMetodoConstrutivo = inssPatronalEstimado - inssFinalEstimado;

    return {
      custoEstimadoObra,
      baseCalculoMaoObra,
      inssPatronalEstimado,
      economiaMetodoConstrutivo,
      inssFinalEstimado,
      cubValor: cubValue
    };
  },

  async scanAndAddMaterialDeductions(projectId: string, cnoRegistrationId: string): Promise<OpuraCnoDeduction[]> {
    const { data: registration, error: regError } = await supabase
      .from('opura_cno_registrations')
      .select('organization_id')
      .eq('id', cnoRegistrationId)
      .single();

    if (regError) {
      console.error('[CnoService] Erro ao buscar CNO para varredura:', regError);
      throw new Error(`Erro ao buscar CNO: ${regError.message}`);
    }

    const orgId = registration.organization_id;

    // Busca notas fiscais e cruza com itens
    const { data: nfeItems, error: itemsError } = await supabase
      .from('nfe_invoice_items')
      .select(`
        id,
        invoice_id,
        description,
        ncm,
        total_value,
        nfe_invoices!inner(id, organization_id, access_key, issuer_name, issue_date)
      `)
      .eq('nfe_invoices.organization_id', orgId);

    if (itemsError) {
      console.error('[CnoService] Erro ao buscar itens de NF-e para deduções:', itemsError);
      throw new Error(`Erro ao buscar itens de NF-e: ${itemsError.message}`);
    }

    const eligibleDeductions: OpuraCnoDeductionInsert[] = [];

    for (const item of nfeItems || []) {
      const descLower = item.description.toLowerCase();
      const isConcrete = 
        descLower.includes('concreto') || 
        descLower.includes('cimento') || 
        descLower.includes('argamassa') || 
        (item.ncm && ['32141010', '32149000', '25232910', '25239000'].some(n => item.ncm.startsWith(n)));

      if (isConcrete) {
        // Regra do SERO: Abatimento de 40% do valor bruto da nota fiscal de concreto usinado
        const valorAbatimento = Number(item.total_value) * 0.40;
        
        // Resolve a inferência de array do Supabase para a relação nfe_invoices
        const invoices = item.nfe_invoices as any;
        const invoice = Array.isArray(invoices) ? invoices[0] : invoices;
        const accessKey = invoice?.access_key || '';
        const issuerName = invoice?.issuer_name || '';

        eligibleDeductions.push({
          organization_id: orgId,
          project_id: projectId,
          cno_registration_id: cnoRegistrationId,
          source_type: 'nfe',
          nfe_invoice_id: item.invoice_id,
          contractor_measurement_id: null,
          description: `Abatimento Legal (40%) - NF-e ${accessKey.slice(-8)} (Emitente: ${issuerName})`,
          valor_base: Number(item.total_value),
          valor_abatimento: valorAbatimento,
          status_validacao: 'pendente',
          revisao_ia_check: true,
          revisao_ia_feedback: 'Identificado automaticamente via NCM/Descrição como concreto/massa abatível.'
        });
      }
    }

    const savedDeductions: OpuraCnoDeduction[] = [];

    for (const deduction of eligibleDeductions) {
      const { data, error } = await supabase
        .from('opura_cno_deductions')
        .insert(deduction)
        .select()
        .maybeSingle();

      if (error) {
        if (error.code === '23505') {
          continue; // Pula duplicatas da constraint UNIQUE
        }
        console.error('[CnoService] Erro ao gravar dedução no banco:', error);
      } else if (data) {
        savedDeductions.push(data);
      }
    }

    return savedDeductions;
  },

  async recalculateComplianceScore(projectId: string): Promise<OpuraCnoComplianceScore> {
    const registration = await this.getRegistrationByProject(projectId);
    
    let score = 100;
    let cnoRegular = true;
    let esocialAtualizado = true;
    let retencoesCorretas = true;
    let certidoesValidas = true;
    let recolhimentosCompativeis = true;

    // 1. CNO regular (CNO ativo)
    if (!registration || registration.status !== 'aberto') {
      score -= 20;
      cnoRegular = false;
    }

    // 2. eSocial atualizado (sem alertas pendentes de prioridade CRITICA ou ALTA)
    const { data: esocialAlerts, error: esocialError } = await supabase
      .from('esocial_pending_alerts')
      .select('id')
      .eq('resolvida', false)
      .in('prioridade', ['CRITICA', 'ALTA']);

    if (esocialError) {
      console.error('[CnoService] Erro ao verificar eSocial para score:', esocialError);
    } else if (esocialAlerts && esocialAlerts.length > 0) {
      score -= 20;
      esocialAtualizado = false;
    }

    // 3. Certidões de Terceiros (CNDs dos empreiteiros vigentes nas medições)
    const { data: expiredDocs, error: docsError } = await supabase
      .from('contractor_measurements')
      .select(`
        contractor_id,
        contractors!inner(
          id,
          contractor_documents(status, data_validade)
        )
      `)
      .eq('project_id', projectId)
      .eq('status', 'APROVADO');

    if (docsError) {
      console.error('[CnoService] Erro ao verificar certidões para score:', docsError);
    } else {
      let temCertidaoVencida = false;
      for (const cm of expiredDocs || []) {
        const docs = (cm.contractors as any)?.contractor_documents || [];
        if (docs.some((d: any) => d.status === 'VENCIDO' || (d.data_validade && new Date(d.data_validade) < new Date()))) {
          temCertidaoVencida = true;
          break;
        }
      }
      if (temCertidaoVencida) {
        score -= 20;
        certidoesValidas = false;
      }
    }

    // 4. Retenções de INSS corretas nas medições (verifica se há alguma medição ativa sem retenção calculada)
    const { data: measurements, error: measError } = await supabase
      .from('contractor_measurements')
      .select('valor_bruto, retencao_inss')
      .eq('project_id', projectId)
      .eq('status', 'APROVADO');

    if (measError) {
      console.error('[CnoService] Erro ao verificar medições para score:', measError);
    } else if (measurements && measurements.length > 0) {
      const temInconsistenciaRetencao = measurements.some(
        m => Number(m.valor_bruto) > 0 && Number(m.retencao_inss) === 0
      );
      if (temInconsistenciaRetencao) {
        score -= 20;
        retencoesCorretas = false;
      }
    }

    // 5. Compatibilidade de Recolhimento
    const simulations = await this.listSimulations(projectId);
    const activeSimulation = simulations.find(s => s.is_active);
    
    if (activeSimulation && activeSimulation.inss_estimado > 0) {
      const inssPrevisto = activeSimulation.inss_estimado;

      const totalRetidoMedicoes = measurements ? measurements.reduce((acc, m) => acc + Number(m.retencao_inss || 0), 0) : 0;

      const deductions = await this.listDeductions(projectId);
      const totalAbatidoMateriais = deductions
        .filter(d => d.status_validacao === 'aproveitado' || d.status_validacao === 'pendente')
        .reduce((acc, d) => acc + Number(d.valor_abatimento || 0), 0);

      const { data: timeEntries, error: teError } = await supabase
        .from('time_entries')
        .select('total_cost')
        .eq('project_id', projectId)
        .eq('status', 'APROVADO');

      const totalCustoFolhaPropria = teError || !timeEntries ? 0 : timeEntries.reduce((acc, te) => acc + Number(te.total_cost || 0), 0);
      const inssFolhaPropriaEstimado = totalCustoFolhaPropria * 0.368; 

      const totalRecolhidoEAbatido = totalRetidoMedicoes + totalAbatidoMateriais + inssFolhaPropriaEstimado;

      if (totalRecolhidoEAbatido < inssPrevisto * 0.85) {
        score -= 20;
        recolhimentosCompativeis = false;
      }
    }

    let statusColor: 'verde' | 'amarelo' | 'vermelho' = 'verde';
    if (score <= 50) {
      statusColor = 'vermelho';
    } else if (score <= 80) {
      statusColor = 'amarelo';
    }

    const { data: orgData } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single();

    const result = await this.upsertComplianceScore({
      organization_id: orgData?.organization_id || '',
      project_id: projectId,
      score,
      status_color: statusColor,
      cno_regular: cnoRegular,
      esocial_atualizado: esocialAtualizado,
      retencoes_corretas: retencoesCorretas,
      certidoes_validas: certidoesValidas,
      recolhimentos_compativeis: recolhimentosCompativeis,
      last_calculated_at: new Date().toISOString()
    });

    return result;
  },

  // ==========================================
  // 5. DCTFWeb / DARF (opura_cno_dctfweb)
  // ==========================================

  async listDctfweb(cnoRegistrationId: string): Promise<OpuraCnoDctfweb[]> {
    const { data, error } = await supabase
      .from('opura_cno_dctfweb')
      .select(DCTFWEB_COLUMNS)
      .eq('cno_registration_id', cnoRegistrationId)
      .order('transmission_date', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('[CnoService] Erro ao listar DCTFWeb:', error);
      throw new Error(`Erro ao listar DCTFWeb: ${error.message}`);
    }

    return (data as OpuraCnoDctfweb[]) || [];
  },

  async addDctfweb(declaration: OpuraCnoDctfwebInsert): Promise<OpuraCnoDctfweb> {
    const { data, error } = await supabase
      .from('opura_cno_dctfweb')
      .insert(declaration)
      .select(DCTFWEB_COLUMNS)
      .single();

    if (error) {
      console.error('[CnoService] Erro ao adicionar DCTFWeb:', error);
      throw new Error(`Erro ao adicionar DCTFWeb: ${error.message}`);
    }

    return data as OpuraCnoDctfweb;
  },

  async deleteDctfweb(id: string): Promise<void> {
    const { error } = await supabase
      .from('opura_cno_dctfweb')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[CnoService] Erro ao deletar DCTFWeb:', error);
      throw new Error(`Erro ao deletar DCTFWeb: ${error.message}`);
    }
  }
};
