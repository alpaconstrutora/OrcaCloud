import { supabase } from '../lib/supabase';
import { validateDocumentFile } from '../lib/mimeValidation';

// ============================================================
// TIPOS LOCAIS
// ============================================================

export type ContractType = 'CLT' | 'PJ' | 'DIARISTA' | 'EMPREITEIRO' | 'ESTAGIARIO';
export type EmployeeStatus = 'ATIVO' | 'INATIVO' | 'AFASTADO' | 'DESLIGADO';
export type TimeEntryStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO';
export type TeamStatus = 'ATIVA' | 'INATIVA';
export type DocumentCategory = 'ASO' | 'NR' | 'IDENTIDADE' | 'CONTRATO' | 'TREINAMENTO' | 'OUTROS';
export type DocumentStatus = 'ATIVO' | 'VENCIDO' | 'PENDENTE';
// ── SPRINT 7 TYPES ─────────────────────────────────────────

export interface QrCodeObra {
    id: string;
    org_id: string;
    project_id?: string;
    project_name?: string;
    token: string;
    label?: string;
    is_active: boolean;
    expires_at?: string;
    scan_count: number;
    created_at?: string;
}

export interface TimeBankEntry {
    id: string;
    org_id: string;
    employee_id: string;
    employee_name?: string;
    time_entry_id?: string;
    tipo: 'CREDITO' | 'DEBITO' | 'AJUSTE' | 'COMPENSACAO';
    horas: number;
    descricao?: string;
    referencia_data?: string;
    created_by?: string;
    created_at?: string;
}

export interface TimeBankBalance {
    id: string;
    org_id: string;
    employee_id: string;
    employee_name?: string;
    saldo_horas: number;
    limite_maximo: number;
    limite_negativo: number;
    updated_at?: string;
}

// ── SPRINT 8 TYPES ─────────────────────────────────────────

export type AccidentTipo = 'TIPICO' | 'TRAJETO' | 'DOENCA_OCUPACIONAL' | 'QUASE_ACIDENTE';
export type AccidentGravidade = 'SEM_AFASTAMENTO' | 'COM_AFASTAMENTO' | 'INCAPACIDADE_PERMANENTE' | 'OBITO';

export interface Accident {
    id: string;
    org_id: string;
    employee_id: string;
    employee_name?: string;
    project_id?: string;
    project_name?: string;
    data_acidente: string;
    hora_acidente?: string;
    tipo: AccidentTipo;
    gravidade: AccidentGravidade;
    local_acidente?: string;
    descricao: string;
    causa_provavel?: string;
    parte_corpo?: string;
    agente_causador?: string;
    cat_numero?: string;
    cat_emitida: boolean;
    cat_data_emissao?: string;
    cat_url?: string;
    dias_afastamento: number;
    data_retorno?: string;
    investigacao_realizada: boolean;
    medidas_corretivas?: string;
    responsavel?: string;
    horas_trabalhadas_acumuladas?: number;
    status: 'ABERTO' | 'INVESTIGANDO' | 'FECHADO';
    created_at?: string;
    updated_at?: string;
}

export interface SstChecklist {
    id: string;
    org_id: string;
    project_id?: string;
    project_name?: string;
    responsavel_id?: string;
    responsavel_nome?: string;
    nome_checklist: string;
    nr_referencia?: string;
    data_aplicacao: string;
    itens: { id: string; descricao: string; conforme: boolean | null; observacao?: string; foto_url?: string }[];
    conformidade_pct?: number;
    status: 'PENDENTE' | 'CONCLUIDO' | 'REPROVADO';
    observacoes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface RiskAssessment {
    id: string;
    org_id: string;
    project_id?: string;
    project_name?: string;
    tipo: 'APR' | 'PGR' | 'PPRA' | 'LTCAT' | 'OUTROS';
    titulo: string;
    data_avaliacao: string;
    proxima_revisao?: string;
    responsavel_tecnico?: string;
    registro_profissional?: string;
    riscos: { perigo: string; fonte?: string; fator_risco?: string; probabilidade: number; severidade: number; nivel_risco?: number; medidas_controle?: string[]; status?: string }[];
    status: 'VIGENTE' | 'REVISAO' | 'ARQUIVADO';
    documento_url?: string;
    created_at?: string;
    updated_at?: string;
}

export interface SstIndicators {
    ano: number;
    total_acidentes: number;
    com_afastamento: number;
    obitos: number;
    dias_perdidos: number;
    hh_trabalhadas: number;
    tfca: number;
    tgca: number;
}

// ── SPRINT 9 TYPES ─────────────────────────────────────────

export type ContractorTipo = 'EMPREITEIRO' | 'SUBEMPREITEIRO' | 'FORNECEDOR_SERVICO' | 'COOPERATIVA' | 'MEI' | 'AUTONOMO';

export interface Contractor {
    id: string;
    org_id: string;
    razao_social: string;
    nome_fantasia?: string;
    cnpj?: string;
    cpf?: string;
    tipo: ContractorTipo;
    especialidade?: string;
    contato_nome?: string;
    contato_telefone?: string;
    contato_email?: string;
    endereco?: string;
    banco_nome?: string;
    banco_agencia?: string;
    banco_conta?: string;
    banco_pix?: string;
    retencao_inss_pct: number;
    retencao_iss_pct: number;
    retencao_irrf_pct: number;
    contrato_inicio?: string;
    contrato_fim?: string;
    valor_contrato?: number;
    status: 'ATIVO' | 'INATIVO' | 'SUSPENSO';
    notas?: string;
    created_at?: string;
    updated_at?: string;
}

export interface ContractorDocument {
    id: string;
    org_id: string;
    contractor_id: string;
    contractor_name?: string;
    categoria: 'CND_FEDERAL' | 'CND_ESTADUAL' | 'CND_MUNICIPAL' | 'CRF_FGTS' | 'CND_TRABALHISTA' | 'CONTRATO' | 'ALVARA' | 'ISO' | 'OUTROS';
    titulo: string;
    file_url?: string;
    data_emissao?: string;
    data_validade?: string;
    status: 'VIGENTE' | 'VENCIDO' | 'PENDENTE';
    notas?: string;
    created_at?: string;
    updated_at?: string;
}

export interface ContractorMeasurement {
    id: string;
    org_id: string;
    contractor_id: string;
    contractor_name?: string;
    project_id?: string;
    project_name?: string;
    numero_medicao: number;
    periodo_inicio: string;
    periodo_fim: string;
    descricao?: string;
    valor_bruto: number;
    retencao_inss: number;
    retencao_iss: number;
    retencao_irrf: number;
    outras_retencoes: number;
    valor_liquido?: number;
    status: 'PENDENTE' | 'APROVADO' | 'PAGO' | 'CONTESTADO';
    data_aprovacao?: string;
    data_pagamento?: string;
    nota_fiscal?: string;
    nf_url?: string;
    comprovante_url?: string;
    notas?: string;
    created_at?: string;
    updated_at?: string;
}

// ── SPRINT 10 TYPES ────────────────────────────────────────

export interface LaborDiaryEntry {
    id: string;
    org_id: string;
    project_id?: string;
    project_name?: string;
    team_id?: string;
    team_name?: string;
    encarregado_id?: string;
    encarregado_nome?: string;
    data: string;
    turno: 'MANHA' | 'TARDE' | 'NOITE' | 'INTEGRAL';
    condicao_tempo: 'BOM' | 'NUBLADO' | 'CHUVA' | 'CHUVA_FORTE';
    efetivo: number;
    total_hh: number;
    atividades?: string;
    ocorrencias?: string;
    foto_urls: string[];
    status: 'ABERTO' | 'FECHADO';
    batch_generated: boolean;
    workers?: LaborDiaryWorker[];
    created_at?: string;
    updated_at?: string;
}

export interface LaborDiaryWorker {
    id: string;
    diary_entry_id: string;
    employee_id: string;
    employee_name?: string;
    horas_trabalhadas: number;
    horas_extras: number;
    presente: boolean;
    observacao?: string;
}

export type TerminationTipo =
    | 'DEMISSAO_SEM_JUSTA_CAUSA'
    | 'DEMISSAO_COM_JUSTA_CAUSA'
    | 'PEDIDO_DEMISSAO'
    | 'ACORDO_MUTUO'
    | 'TERMINO_CONTRATO'
    | 'APOSENTADORIA'
    | 'FALECIMENTO'
    | 'OUTROS';

export type AvisoPrevioTipo = 'TRABALHADO' | 'INDENIZADO' | 'DISPENSADO';

export interface TerminationRecord {
    id: string;
    org_id: string;
    employee_id: string;
    employee_name?: string;
    employee_role?: string;
    termination_date: string;
    tipo: TerminationTipo;
    motivo?: string;
    aviso_previo_tipo?: AvisoPrevioTipo;
    aviso_previo_inicio?: string;
    aviso_previo_fim?: string;
    checklist: string[];
    entrevista_realizada: boolean;
    entrevista_motivo_real?: string;
    entrevista_pontos?: string;
    entrevista_recontrataria?: boolean;
    payroll_run_id?: string;
    epis_devolvidos: boolean;
    acessos_bloqueados: boolean;
    processed_by?: string;
    status: 'RASCUNHO' | 'CONCLUIDO';
    created_at?: string;
    updated_at?: string;
}

export type AbsenceTipo =
    | 'FERIAS'
    | 'ATESTADO'
    | 'FALTA'
    | 'LICENCA_MATERNIDADE'
    | 'LICENCA_PATERNIDADE'
    | 'LICENCA_MEDICA'
    | 'AFASTAMENTO_INSS'
    | 'SUSPENSAO'
    | 'OUTROS';

export type AbsenceStatus = 'SOLICITADO' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
export type VacationBalanceStatus = 'ABERTO' | 'PARCIAL' | 'GOZADO' | 'VENCIDO';

export interface Absence {
    id: string;
    org_id: string;
    employee_id: string;
    employee_name?: string;
    tipo: AbsenceTipo;
    data_inicio: string;
    data_fim: string;
    dias?: number;
    status: AbsenceStatus;
    motivo?: string;
    atestado_url?: string;
    approved_by?: string;
    approved_at?: string;
    rejection_reason?: string;
    vacation_period_start?: string;
    vacation_period_end?: string;
    payroll_run_id?: string;
    created_by?: string;
    created_at?: string;
    updated_at?: string;
}

export interface VacationBalance {
    id: string;
    org_id: string;
    employee_id: string;
    employee_name?: string;
    periodo_inicio: string;
    periodo_fim: string;
    dias_direito: number;
    dias_gozados: number;
    dias_vendidos: number;
    dias_restantes?: number;
    status: VacationBalanceStatus;
    vencimento?: string;
    created_at?: string;
    updated_at?: string;
}

export type TrainingCategoria =
    | 'NR_OBRIGATORIA' | 'INTEGRACAO' | 'DDS'
    | 'QUALIDADE' | 'LIDERANCA' | 'TECNICO' | 'OUTROS';

export interface TrainingCourse {
    id: string;
    org_id: string;
    nome: string;
    descricao?: string;
    nr_referencia?: string;
    categoria: TrainingCategoria;
    carga_horaria: number;
    validade_meses?: number;
    instrutor?: string;
    is_obrigatorio: boolean;
    roles_obrigatorios: string[];
    status: 'ATIVO' | 'INATIVO';
    created_at?: string;
    updated_at?: string;
}

export interface EmployeeTraining {
    id: string;
    org_id: string;
    employee_id: string;
    employee_name?: string;
    course_id: string;
    course_nome?: string;
    nr_referencia?: string;
    data_realizacao: string;
    data_validade?: string;
    instrutor?: string;
    local?: string;
    carga_horaria?: number;
    certificado_url?: string;
    nota?: number;
    aprovado: boolean;
    status: 'ATIVO' | 'VENCIDO' | 'PENDENTE';
    observacoes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface RhKpis {
    headcount: { total: number; ativos: number; afastados: number; em_ferias: number };
    periodo: { admitidos: number; desligados: number; turnover_pct: number };
    custos: { custo_mes: number; horas_extras: number };
    qualidade: { absenteismo_pct: number };
    alertas: {
        treinamentos_vencendo: number;
        docs_vencendo: number;
        epis_estoque_baixo: number;
        ferias_vencendo: number;
    };
}

export type EpiCategoria =
    | 'PROTECAO_CABECA'
    | 'PROTECAO_OLHOS_FACE'
    | 'PROTECAO_AUDITIVA'
    | 'PROTECAO_RESPIRATORIA'
    | 'PROTECAO_TRONCO'
    | 'PROTECAO_MEMBROS_SUPERIORES'
    | 'PROTECAO_MEMBROS_INFERIORES'
    | 'PROTECAO_QUEDAS'
    | 'OUTROS';
export type EpiStatus = 'ATIVO' | 'INATIVO';

export interface Employee {
    id: string;
    org_id: string;
    empresa_id?: string;
    name: string;
    cpf?: string;
    phone?: string;
    email?: string;
    contract_type: ContractType;
    role: string;
    daily_cost: number;
    hourly_cost: number;
    base_salary: number;
    status: EmployeeStatus;
    hire_date?: string;
    termination_date?: string;
    termination_reason?: string;
    notes?: string;
    avatar_url?: string;
    admission_checklist?: string[];
    created_at?: string;
    updated_at?: string;

    // Ficha de Registro
    father_name?: string;
    mother_name?: string;
    birth_date?: string;
    birth_place?: string;
    nationality?: string;
    marital_status?: string;
    rg_number?: string;
    rg_issuing_agency?: string;
    rg_issue_date?: string;
    ctps_number?: string;
    ctps_series?: string;
    ctps_issue_date?: string;
    ctps_uf?: string;
    military_doc?: string;
    military_category?: string;
    ethnicity?: string;
    gender?: string;
    education_level?: string;
    is_disabled?: boolean;
    voter_title_number?: string;
    voter_title_zone?: string;
    voter_title_section?: string;
    cbo?: string;
    residential_phone?: string;
    address_street?: string;
    address_number?: string;
    address_complement?: string;
    address_neighborhood?: string;
    address_city?: string;
    address_uf?: string;
    address_zip_code?: string;

    // Sprint 1: campos novos
    matricula?: string;
    departamento?: string;
    centro_custo?: string;
    sindicato?: string;
    jornada_horas_semana?: number;
    contract_type_extra?: string;
    // CNH
    cnh_numero?: string;
    cnh_categoria?: string;
    cnh_validade?: string;
    // Dependentes
    num_dependentes?: number;
    dependentes?: { nome: string; nascimento?: string; parentesco?: string }[];
    // Dados bancários
    banco_codigo?: string;
    banco_nome?: string;
    banco_agencia?: string;
    banco_conta?: string;
    banco_conta_tipo?: 'corrente' | 'poupanca';
    banco_pix?: string;

    // joins
    allocations?: EmployeeAllocation[];
}

// ── EPI TYPES ──────────────────────────────────────────────

export interface EpiCatalogItem {
    id: string;
    org_id: string;
    nome: string;
    descricao?: string;
    ca?: string;
    ca_validade?: string;
    unidade: string;
    estoque_atual: number;
    estoque_minimo: number;
    custo_unitario: number;
    fornecedor?: string;
    categoria: EpiCategoria;
    status: EpiStatus;
    created_at?: string;
    updated_at?: string;
}

export interface EpiDelivery {
    id: string;
    org_id: string;
    epi_id: string;
    epi_nome?: string; // join
    employee_id: string;
    employee_name?: string; // join
    project_id?: string;
    project_name?: string;
    quantidade: number;
    delivered_at: string;
    returned_at?: string;
    motivo?: string;
    assinatura_url?: string;
    is_returned: boolean;
    notes?: string;
    created_at?: string;
}

export interface EmployeeAllocation {
    id: string;
    employee_id: string;
    project_id?: string;
    project_name?: string;
    start_date: string;
    end_date?: string;
    is_active: boolean;
}

export interface LaborTeam {
    id: string;
    org_id: string;
    name: string;
    foreman_employee_id?: string;
    foreman_name?: string; // join
    project_id?: string;
    project_name?: string;
    description?: string;
    status: TeamStatus;
    created_at?: string;
    members?: Employee[];
}

export interface TimeEntry {
    id: string;
    employee_id: string;
    employee_name?: string; // join
    project_id?: string;
    project_name?: string;
    team_id?: string;
    date: string;
    hours_worked: number;
    overtime_hours: number;
    overtime_50: number;
    overtime_100: number;
    total_hours: number;
    night_hours: number;
    hourly_rate: number;
    total_cost?: number; // gerado pelo banco
    status: TimeEntryStatus;
    approved_by?: string;
    approved_at?: string;
    notes?: string;
    created_at?: string;
}

export interface ProductivityLog {
    id: string;
    employee_id?: string;
    employee_name?: string;
    team_id?: string;
    team_name?: string;
    project_id?: string;
    project_name?: string;
    phase?: string;
    activity_description: string;
    unit: string;
    planned_qty: number;
    actual_qty: number;
    hours_spent: number;
    man_hour_per_unit?: number;
    productivity_pct?: number;
    date: string;
    notes?: string;
    created_at?: string;
}

export interface LaborCostSummary {
    totalHours: number;
    totalOvertimeHours: number;
    totalCost: number;
    byEmployee: { employee_id: string; name: string; hours: number; cost: number }[];
    byProject: { project_name: string; hours: number; cost: number }[];
    byTeam: { team_id: string; name: string; hours: number; cost: number }[];
}

export interface EmployeeDocument {
    id: string;
    employee_id: string;
    employee_name?: string;
    org_id: string;
    category: DocumentCategory;
    title: string;
    file_url: string;
    expiry_date?: string;
    notes?: string;
    status: DocumentStatus;
    created_at?: string;
    updated_at?: string;
}

// ============================================================
// SERVICE
// ============================================================

export const laborService = {

    // ── EMPLOYEES ──────────────────────────────────────────

    async listEmployees(orgId?: string, empresaId?: string): Promise<Employee[]> {
        let query = supabase
            .from('employees')
            .select(`
                *,
                allocations:employee_allocations(*)
            `);

        if (empresaId) {
            query = query.eq('empresa_id', empresaId);
        } else if (orgId && orgId !== 'all') {
            query = query.eq('org_id', orgId);
        }

        const { data, error } = await query.order('name');
        if (error) throw error;
        return data || [];
    },

    async listOrgsWithActiveEmployees(): Promise<string[]> {
        const { data, error } = await supabase
            .from('employees')
            .select('org_id')
            .eq('status', 'ATIVO');
        if (error) throw error;
        // Saneamento: remove IDs nulos, vazios ou apenas com espaços
        return Array.from(new Set((data || []).map(e => e.org_id).filter(id => id && id.trim() !== '')));
    },

    async getEmployeeById(id: string): Promise<Employee> {
        const { data, error } = await supabase
            .from('employees')
            .select('*, allocations:employee_allocations(*)')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data as Employee;
    },

    async createEmployee(employee: Omit<Employee, 'id' | 'created_at' | 'updated_at'>): Promise<Employee> {
        const payload = { ...employee, cnh_categoria: employee.cnh_categoria || null };
        const { data, error } = await supabase
            .from('employees')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee> {
        // Strip computed/join fields before sending to DB
        const { id: _id, created_at: _ca, updated_at: _ua, ...cleanUpdates } =
            updates as Partial<Employee> & { allocations?: unknown };
        if ('cnh_categoria' in cleanUpdates) {
            cleanUpdates.cnh_categoria = cleanUpdates.cnh_categoria || null;
        }
        const { data, error } = await supabase
            .from('employees')
            .update(cleanUpdates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteEmployee(id: string): Promise<void> {
        const { error } = await supabase
            .from('employees')
            .update({ status: 'DESLIGADO' })
            .eq('id', id);
        if (error) throw error;
    },

    async removeEmployee(id: string): Promise<void> {
        const { error } = await supabase
            .from('employees')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // ── ALLOCATIONS ────────────────────────────────────────

    async addAllocation(allocation: Omit<EmployeeAllocation, 'id'>): Promise<EmployeeAllocation> {
        const { data, error } = await supabase
            .from('employee_allocations')
            .insert(allocation)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async removeAllocation(id: string): Promise<void> {
        const { error } = await supabase
            .from('employee_allocations')
            .update({ is_active: false })
            .eq('id', id);
        if (error) throw error;
    },

    // ── TEAMS ──────────────────────────────────────────────

    async listTeams(orgId?: string, empresaId?: string): Promise<LaborTeam[]> {
        if (!orgId && !empresaId) return [];
        let query = supabase
            .from('labor_teams')
            .select(`
                *,
                members:team_members(
                    employee:employees(*)
                )
            `);

        if (empresaId) {
            query = query.eq('empresa_id', empresaId);
        } else if (orgId) {
            query = query.eq('org_id', orgId);
        }
        const { data, error } = await query.order('name');
        if (error) throw error;

        type TeamJoin = Omit<LaborTeam, 'members'> & { members?: Array<{ employee: Employee }> };
        return (data as unknown as TeamJoin[] || []).map(t => ({
            ...t,
            members: (t.members || []).map(m => m.employee).filter(Boolean) as Employee[],
        }));
    },

    async createTeam(team: Omit<LaborTeam, 'id' | 'created_at' | 'members' | 'foreman_name'>): Promise<LaborTeam> {
        const cleanTeam = team;
        const { data, error } = await supabase
            .from('labor_teams')
            .insert(cleanTeam)
            .select()
            .single();
        if (error) throw error;
        return { ...data, members: [] };
    },

    async updateTeam(id: string, updates: Partial<LaborTeam>): Promise<LaborTeam> {
        const { id: _id, members: _members, foreman_name: _fn, ...clean } = updates;
        const { data, error } = await supabase
            .from('labor_teams')
            .update(clean)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteTeam(id: string): Promise<void> {
        const { error } = await supabase
            .from('labor_teams')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    async addTeamMember(teamId: string, employeeId: string): Promise<void> {
        const { error } = await supabase
            .from('team_members')
            .upsert({ team_id: teamId, employee_id: employeeId }, { onConflict: 'team_id,employee_id' });
        if (error) throw error;
    },

    async removeTeamMember(teamId: string, employeeId: string): Promise<void> {
        const { error } = await supabase
            .from('team_members')
            .delete()
            .eq('team_id', teamId)
            .eq('employee_id', employeeId);
        if (error) throw error;
    },

    // ── TIME ENTRIES ───────────────────────────────────────

    async listTimeEntries(filters: {
        orgId?: string;
        projectId?: string;
        employeeId?: string;
        status?: TimeEntryStatus;
        dateStart?: string;
        dateEnd?: string;
    }): Promise<TimeEntry[]> {
        let query = supabase
            .from('time_entries')
            .select(`
                *,
                employee:employees!employee_id(name, role, org_id)
            `)
            .order('date', { ascending: false });

        if (filters.projectId) query = query.eq('project_id', filters.projectId);
        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.dateStart) query = query.gte('date', filters.dateStart);
        if (filters.dateEnd) query = query.lte('date', filters.dateEnd);

        const { data, error } = await query;
        if (error) throw error;

        // Filtrar por org_id via join
        const orgData = (data || []).filter((e: TimeEntry & { employee?: { name: string; org_id: string } }) => !filters.orgId || e.employee?.org_id === filters.orgId);
        return orgData.map(e => ({
            ...e,
            employee_name: e.employee?.name,
        })) as TimeEntry[];
    },

    async createTimeEntry(entry: Omit<TimeEntry, 'id' | 'total_cost' | 'created_at' | 'employee_name'>): Promise<TimeEntry> {
        const clean = entry;
        const { data, error } = await supabase
            .from('time_entries')
            .insert(clean)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry> {
        const { id: _id, total_cost: _tc, employee_name: _en, ...clean } = updates;
        const { data, error } = await supabase
            .from('time_entries')
            .update(clean)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async approveTimeEntry(id: string, approvedBy: string): Promise<void> {
        const { error } = await supabase
            .from('time_entries')
            .update({ status: 'APROVADO', approved_by: approvedBy, approved_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async rejectTimeEntry(id: string, approvedBy: string): Promise<void> {
        const { error } = await supabase
            .from('time_entries')
            .update({ status: 'REJEITADO', approved_by: approvedBy, approved_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async deleteTimeEntry(id: string): Promise<void> {
        const { error } = await supabase.from('time_entries').delete().eq('id', id);
        if (error) throw error;
    },

    // ── PRODUCTIVITY ───────────────────────────────────────

    async listProductivityLogs(filters: {
        orgId?: string;
        projectId?: string;
        teamId?: string;
        dateStart?: string;
        dateEnd?: string;
    }): Promise<ProductivityLog[]> {
        let query = supabase
            .from('productivity_logs')
            .select(`
                *,
                employee:employees!employee_id(name, org_id),
                team:labor_teams!team_id(name)
            `)
            .order('date', { ascending: false });

        if (filters.projectId) query = query.eq('project_id', filters.projectId);
        if (filters.teamId) query = query.eq('team_id', filters.teamId);
        if (filters.dateStart) query = query.gte('date', filters.dateStart);
        if (filters.dateEnd) query = query.lte('date', filters.dateEnd);

        const { data, error } = await query;
        if (error) throw error;

        type ProdRow = ProductivityLog & { employee?: { name: string; org_id: string }; team?: { name: string } };
        const orgData = (data || []).filter((e: ProdRow) => !filters.orgId || e.employee?.org_id === filters.orgId);

        return orgData.map((p: ProdRow) => ({
            ...p,
            employee_name: p.employee?.name,
            team_name: p.team?.name,
        })) as ProductivityLog[];
    },

    async createProductivityLog(log: Omit<ProductivityLog, 'id' | 'man_hour_per_unit' | 'productivity_pct' | 'created_at' | 'employee_name' | 'team_name'>): Promise<ProductivityLog> {
        const clean = log;
        const { data, error } = await supabase
            .from('productivity_logs')
            .insert(clean)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteProductivityLog(id: string): Promise<void> {
        const { error } = await supabase.from('productivity_logs').delete().eq('id', id);
        if (error) throw error;
    },

    // ── COST SUMMARY ───────────────────────────────────────

    async getCostSummary(orgId?: string, filters?: {
        projectId?: string;
        dateStart?: string;
        dateEnd?: string;
    }): Promise<LaborCostSummary> {
        let query = supabase
            .from('time_entries')
            .select(`
                hours_worked, overtime_hours, total_cost, project_name,
                employee:employees!employee_id(id, name, org_id),
                team:labor_teams!team_id(id, name)
            `)
            .eq('status', 'APROVADO');

        if (filters?.projectId) query = query.eq('project_id', filters.projectId);
        if (filters?.dateStart) query = query.gte('date', filters.dateStart);
        if (filters?.dateEnd) query = query.lte('date', filters.dateEnd);

        const { data, error } = await query;
        if (error) throw error;

        type CostEntry = { hours_worked: number; overtime_hours: number; total_cost: number; project_name?: string; employee?: { id: string; name: string; org_id: string }; team?: { id: string; name: string } };
        const entries = ((data as unknown as CostEntry[]) || []).filter(e => !orgId || e.employee?.org_id === orgId);

        const totalHours = entries.reduce((s, e) => s + (e.hours_worked || 0), 0);
        const totalOvertimeHours = entries.reduce((s, e) => s + (e.overtime_hours || 0), 0);
        const totalCost = entries.reduce((s, e) => s + (e.total_cost || 0), 0);

        const byEmployeeMap = new Map<string, { name: string; hours: number; cost: number }>();
        const byProjectMap = new Map<string, { hours: number; cost: number }>();
        const byTeamMap = new Map<string, { name: string; hours: number; cost: number }>();

        entries.forEach(e => {
            const empId = e.employee?.id || 'unknown';
            const empName = e.employee?.name || 'Desconhecido';
            const proj = e.project_name || 'Sem obra';
            const teamId = e.team?.id || '';
            const teamName = e.team?.name || '';

            const prev = byEmployeeMap.get(empId) || { name: empName, hours: 0, cost: 0 };
            byEmployeeMap.set(empId, { ...prev, hours: prev.hours + e.hours_worked, cost: prev.cost + (e.total_cost || 0) });

            const prevP = byProjectMap.get(proj) || { hours: 0, cost: 0 };
            byProjectMap.set(proj, { hours: prevP.hours + e.hours_worked, cost: prevP.cost + (e.total_cost || 0) });

            if (teamId) {
                const prevT = byTeamMap.get(teamId) || { name: teamName, hours: 0, cost: 0 };
                byTeamMap.set(teamId, { ...prevT, hours: prevT.hours + e.hours_worked, cost: prevT.cost + (e.total_cost || 0) });
            }
        });

        return {
            totalHours,
            totalOvertimeHours,
            totalCost,
            byEmployee: Array.from(byEmployeeMap.entries()).map(([employee_id, v]) => ({ employee_id, ...v })),
            byProject: Array.from(byProjectMap.entries()).map(([project_name, v]) => ({ project_name, ...v })),
            byTeam: Array.from(byTeamMap.entries()).map(([team_id, v]) => ({ team_id, ...v })),
        };
    },

    // ── DOCUMENTS ──────────────────────────────────────────

    async listDocuments(filters: { employeeId?: string; orgId?: string; category?: DocumentCategory }): Promise<EmployeeDocument[]> {
        let query = supabase
            .from('employee_documents')
            .select(`
                *,
                employee:employees!employee_id(name)
            `)
            .order('created_at', { ascending: false });

        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.orgId) query = query.eq('org_id', filters.orgId);
        if (filters.category) query = query.eq('category', filters.category);

        const { data, error } = await query;
        if (error) throw error;

        type DocRow = EmployeeDocument & { employee?: { name: string } };
        return (data || [] as DocRow[]).map((d: DocRow) => ({
            ...d,
            employee_name: d.employee?.name
        }));
    },

    async uploadDocument(
        doc: Omit<EmployeeDocument, 'id' | 'created_at' | 'updated_at' | 'file_url'>,
        file: File
    ): Promise<EmployeeDocument> {
        // 0. Validação de MIME type — guarda obrigatória no service layer
        const validation = validateDocumentFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // 1. Upload file to Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${doc.employee_id}/${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `labor-documents/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('organization-assets')
            .upload(filePath, file);

        if (uploadError) {
            console.error('[LaborService] Storage Upload Error:', uploadError);
            if (uploadError.message.includes('bucket_not_found')) {
                throw new Error('O bucket "organization-assets" não foi encontrado. Por favor, crie-o no painel do Supabase Storage.');
            }
            throw uploadError;
        }

        // 2. Insert metadata in Database
        // Defesa contra UUIDs vazios
        const insertData = {
            ...doc,
            file_url: filePath,
            org_id: doc.org_id || undefined,
            employee_id: doc.employee_id || undefined
        };

        const { data, error } = await supabase
            .from('employee_documents')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            console.error('[LaborService] Database Insert Error:', error);
            // Cleanup storage if database insert fails
            await supabase.storage.from('organization-assets').remove([filePath]);
            throw error;
        }

        return data;
    },

    async updateDocument(
        id: string,
        updates: Pick<EmployeeDocument, 'category' | 'title' | 'expiry_date' | 'notes'>
    ): Promise<EmployeeDocument> {
        const { data, error } = await supabase
            .from('employee_documents')
            .update({
                category: updates.category,
                title: updates.title,
                expiry_date: updates.expiry_date || null,
                notes: updates.notes
            })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteDocument(id: string, filePath: string): Promise<void> {
        // 1. Delete from Database
        const { error: dbError } = await supabase
            .from('employee_documents')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        // 2. Delete from Storage
        if (filePath) {
            await supabase.storage.from('organization-assets').remove([filePath]);
        }
    },

    async getDocumentsAlerts(orgId?: string): Promise<EmployeeDocument[]> {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextMonthStr = nextMonth.toISOString().split('T')[0];

        let query = supabase
            .from('employee_documents')
            .select(`
                *,
                employee:employees!employee_id(name)
            `)
            .lt('expiry_date', nextMonthStr)
            .order('expiry_date', { ascending: true });

        if (orgId) query = query.eq('org_id', orgId);

        const { data, error } = await query;
        if (error) throw error;

        type DocRow = EmployeeDocument & { employee?: { name: string } };
        return (data || [] as DocRow[]).map((d: DocRow) => ({
            ...d,
            employee_name: d.employee?.name
        }));
    },

    // ── MIGRATION ──────────────────────────────────────────

    async getLegacyWorkersCount(orgId?: string): Promise<number> {
        let query = supabase.from('organizations').select('resources');
        if (orgId) {
            query = query.eq('id', orgId);
        }
        
        const { data, error } = await query;
        if (error) return 0;
        
        let total = 0;
        (data as Array<{ resources?: { workers?: unknown[] } }>).forEach(org => {
            const workers = org.resources?.workers || [];
            total += workers.length;
        });
        return total;
    },

    // ── QR CODES (Sprint 7) ────────────────────────────────

    async listQrCodes(orgId: string): Promise<QrCodeObra[]> {
        const { data, error } = await supabase
            .from('qr_codes_obra').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createQrCode(qr: Omit<QrCodeObra, 'id' | 'token' | 'scan_count' | 'created_at'>): Promise<QrCodeObra> {
        const { data, error } = await supabase.from('qr_codes_obra').insert(qr).select().single();
        if (error) throw error;
        return data;
    },

    async toggleQrCode(id: string, isActive: boolean): Promise<void> {
        const { error } = await supabase.from('qr_codes_obra').update({ is_active: isActive }).eq('id', id);
        if (error) throw error;
    },

    async deleteQrCode(id: string): Promise<void> {
        const { error } = await supabase.from('qr_codes_obra').delete().eq('id', id);
        if (error) throw error;
    },

    async validateQrCheckin(token: string): Promise<{ valid: boolean; project_id?: string; project_name?: string; org_id?: string; label?: string; error?: string }> {
        const { data, error } = await supabase.rpc('qr_checkin', { p_token: token });
        if (error) throw error;
        return data;
    },

    // ── TIME BANK (Sprint 7) ───────────────────────────────

    async listTimeBankBalances(orgId: string, employeeId?: string): Promise<TimeBankBalance[]> {
        let query = supabase
            .from('time_bank')
            .select(`*, employee:employees!employee_id(name)`)
            .eq('org_id', orgId)
            .order('saldo_horas', { ascending: false });
        if (employeeId) query = query.eq('employee_id', employeeId);
        const { data, error } = await query;
        if (error) throw error;
        type TBRow = TimeBankBalance & { employee?: { name: string } };
        return (data || [] as TBRow[]).map((r: TBRow) => ({ ...r, employee_name: r.employee?.name }));
    },

    async listTimeBankEntries(orgId: string, employeeId?: string): Promise<TimeBankEntry[]> {
        let query = supabase
            .from('time_bank_entries')
            .select(`*, employee:employees!employee_id(name)`)
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
        if (employeeId) query = query.eq('employee_id', employeeId);
        const { data, error } = await query;
        if (error) throw error;
        type TBERow = TimeBankEntry & { employee?: { name: string } };
        return (data || [] as TBERow[]).map((r: TBERow) => ({ ...r, employee_name: r.employee?.name }));
    },

    async addTimeBankEntry(entry: Omit<TimeBankEntry, 'id' | 'created_at' | 'employee_name'>): Promise<TimeBankEntry> {
        const { data, error } = await supabase.from('time_bank_entries').insert(entry).select().single();
        if (error) throw error;
        return data;
    },

    // ── ACCIDENTS / SST (Sprint 8) ─────────────────────────

    async listAccidents(orgId: string, filters?: { projectId?: string; employeeId?: string }): Promise<Accident[]> {
        let query = supabase
            .from('accidents')
            .select(`*, employee:employees!employee_id(name)`)
            .eq('org_id', orgId)
            .order('data_acidente', { ascending: false });
        if (filters?.projectId)  query = query.eq('project_id', filters.projectId);
        if (filters?.employeeId) query = query.eq('employee_id', filters.employeeId);
        const { data, error } = await query;
        if (error) throw error;
        type ARow = Accident & { employee?: { name: string } };
        return (data || [] as ARow[]).map((r: ARow) => ({ ...r, employee_name: r.employee?.name }));
    },

    async createAccident(accident: Omit<Accident, 'id' | 'created_at' | 'updated_at' | 'employee_name'>): Promise<Accident> {
        const { data, error } = await supabase.from('accidents').insert(accident).select().single();
        if (error) throw error;
        return data;
    },

    async updateAccident(id: string, updates: Partial<Accident>): Promise<Accident> {
        const { id: _id, created_at: _ca, updated_at: _ua, employee_name: _en, ...clean } = updates;
        const { data, error } = await supabase.from('accidents').update(clean).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async deleteAccident(id: string): Promise<void> {
        const { error } = await supabase.from('accidents').delete().eq('id', id);
        if (error) throw error;
    },

    async getSstIndicators(orgId: string, year?: number): Promise<SstIndicators> {
        const { data, error } = await supabase.rpc('sst_indicators', {
            p_org_id: orgId,
            p_year: year || new Date().getFullYear(),
        });
        if (error) throw error;
        return data as SstIndicators;
    },

    async listSstChecklists(orgId: string, projectId?: string): Promise<SstChecklist[]> {
        let query = supabase
            .from('sst_checklists_obra')
            .select(`*, responsavel:employees!responsavel_id(name)`)
            .eq('org_id', orgId)
            .order('data_aplicacao', { ascending: false });
        if (projectId) query = query.eq('project_id', projectId);
        const { data, error } = await query;
        if (error) throw error;
        type SCRow = SstChecklist & { responsavel?: { name: string } };
        return (data || [] as SCRow[]).map((r: SCRow) => ({ ...r, responsavel_nome: r.responsavel?.name }));
    },

    async createSstChecklist(checklist: Omit<SstChecklist, 'id' | 'created_at' | 'updated_at' | 'responsavel_nome'>): Promise<SstChecklist> {
        const { data, error } = await supabase.from('sst_checklists_obra').insert(checklist).select().single();
        if (error) throw error;
        return data;
    },

    async updateSstChecklist(id: string, updates: Partial<SstChecklist>): Promise<SstChecklist> {
        const { id: _id, created_at: _ca, updated_at: _ua, responsavel_nome: _rn, ...clean } = updates;
        const { data, error } = await supabase.from('sst_checklists_obra').update(clean).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async listRiskAssessments(orgId: string, projectId?: string): Promise<RiskAssessment[]> {
        let query = supabase.from('risk_assessments').select('*').eq('org_id', orgId).order('data_avaliacao', { ascending: false });
        if (projectId) query = query.eq('project_id', projectId);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    async createRiskAssessment(ra: Omit<RiskAssessment, 'id' | 'created_at' | 'updated_at'>): Promise<RiskAssessment> {
        const { data, error } = await supabase.from('risk_assessments').insert(ra).select().single();
        if (error) throw error;
        return data;
    },

    async updateRiskAssessment(id: string, updates: Partial<RiskAssessment>): Promise<RiskAssessment> {
        const { id: _id, created_at: _ca, updated_at: _ua, ...clean } = updates;
        const { data, error } = await supabase.from('risk_assessments').update(clean).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    // ── CONTRACTORS (Sprint 9) ─────────────────────────────

    async listContractors(orgId: string): Promise<Contractor[]> {
        const { data, error } = await supabase.from('contractors').select('*').eq('org_id', orgId).order('razao_social');
        if (error) throw error;
        return data || [];
    },

    async createContractor(c: Omit<Contractor, 'id' | 'created_at' | 'updated_at'>): Promise<Contractor> {
        const { data, error } = await supabase.from('contractors').insert(c).select().single();
        if (error) throw error;
        return data;
    },

    async updateContractor(id: string, updates: Partial<Contractor>): Promise<Contractor> {
        const { id: _id, created_at: _ca, updated_at: _ua, ...clean } = updates;
        const { data, error } = await supabase.from('contractors').update(clean).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async deleteContractor(id: string): Promise<void> {
        const { error } = await supabase.from('contractors').update({ status: 'INATIVO' }).eq('id', id);
        if (error) throw error;
    },

    async listContractorDocuments(orgId: string, contractorId?: string): Promise<ContractorDocument[]> {
        let query = supabase
            .from('contractor_documents')
            .select(`*, contractor:contractors!contractor_id(razao_social)`)
            .eq('org_id', orgId)
            .order('data_validade', { ascending: true });
        if (contractorId) query = query.eq('contractor_id', contractorId);
        const { data, error } = await query;
        if (error) throw error;
        type CDRow = ContractorDocument & { contractor?: { razao_social: string } };
        return (data || [] as CDRow[]).map((r: CDRow) => ({ ...r, contractor_name: r.contractor?.razao_social }));
    },

    async createContractorDocument(doc: Omit<ContractorDocument, 'id' | 'created_at' | 'updated_at' | 'contractor_name'>): Promise<ContractorDocument> {
        const { data, error } = await supabase.from('contractor_documents').insert(doc).select().single();
        if (error) throw error;
        return data;
    },

    async getContractorDocumentAlerts(orgId: string): Promise<ContractorDocument[]> {
        const in30 = new Date(); in30.setDate(in30.getDate() + 30);
        const { data, error } = await supabase
            .from('contractor_documents')
            .select(`*, contractor:contractors!contractor_id(razao_social)`)
            .eq('org_id', orgId)
            .lte('data_validade', in30.toISOString().split('T')[0])
            .eq('status', 'VIGENTE')
            .order('data_validade');
        if (error) throw error;
        type CDRow = ContractorDocument & { contractor?: { razao_social: string } };
        return (data || [] as CDRow[]).map((r: CDRow) => ({ ...r, contractor_name: r.contractor?.razao_social }));
    },

    async listContractorMeasurements(orgId: string, contractorId?: string): Promise<ContractorMeasurement[]> {
        let query = supabase
            .from('contractor_measurements')
            .select(`*, contractor:contractors!contractor_id(razao_social)`)
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
        if (contractorId) query = query.eq('contractor_id', contractorId);
        const { data, error } = await query;
        if (error) throw error;
        type CMRow = ContractorMeasurement & { contractor?: { razao_social: string } };
        return (data || [] as CMRow[]).map((r: CMRow) => ({ ...r, contractor_name: r.contractor?.razao_social }));
    },

    async createContractorMeasurement(m: Omit<ContractorMeasurement, 'id' | 'valor_liquido' | 'created_at' | 'updated_at' | 'contractor_name'>): Promise<ContractorMeasurement> {
        const { data, error } = await supabase.from('contractor_measurements').insert(m).select().single();
        if (error) throw error;
        return data;
    },

    async updateContractorMeasurement(id: string, updates: Partial<ContractorMeasurement>): Promise<ContractorMeasurement> {
        const { id: _id, valor_liquido: _vl, created_at: _ca, updated_at: _ua, contractor_name: _cn, ...clean } = updates;
        const { data, error } = await supabase.from('contractor_measurements').update(clean).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    // ── LABOR DIARY (Sprint 10) ────────────────────────────

    async listLaborDiaryEntries(orgId: string, filters?: { projectId?: string; teamId?: string; dateStart?: string; dateEnd?: string }): Promise<LaborDiaryEntry[]> {
        let query = supabase
            .from('labor_diary_entries')
            .select(`
                *,
                team:labor_teams!team_id(name),
                encarregado:employees!encarregado_id(name),
                workers:labor_diary_workers(*, employee:employees!employee_id(name))
            `)
            .eq('org_id', orgId)
            .order('data', { ascending: false });
        if (filters?.projectId) query = query.eq('project_id', filters.projectId);
        if (filters?.teamId)    query = query.eq('team_id', filters.teamId);
        if (filters?.dateStart) query = query.gte('data', filters.dateStart);
        if (filters?.dateEnd)   query = query.lte('data', filters.dateEnd);
        const { data, error } = await query;
        if (error) throw error;

        type DIRow = LaborDiaryEntry & {
            team?: { name: string };
            encarregado?: { name: string };
            workers?: Array<LaborDiaryWorker & { employee?: { name: string } }>;
        };
        return (data || [] as DIRow[]).map((r: DIRow) => ({
            ...r,
            team_name: r.team?.name,
            encarregado_nome: r.encarregado?.name,
            workers: (r.workers || []).map((w: LaborDiaryWorker & { employee?: { name: string } }) => ({ ...w, employee_name: w.employee?.name })),
        }));
    },

    async createLaborDiaryEntry(entry: Omit<LaborDiaryEntry, 'id' | 'total_hh' | 'batch_generated' | 'created_at' | 'updated_at' | 'team_name' | 'encarregado_nome' | 'workers'>): Promise<LaborDiaryEntry> {
        const { data, error } = await supabase.from('labor_diary_entries').insert(entry).select().single();
        if (error) throw error;
        return data;
    },

    async updateLaborDiaryEntry(id: string, updates: Partial<LaborDiaryEntry>): Promise<LaborDiaryEntry> {
        const { id: _id, total_hh: _th, batch_generated: _bg, created_at: _ca, updated_at: _ua, team_name: _tn, encarregado_nome: _en, workers: _w, ...clean } = updates;
        const { data, error } = await supabase.from('labor_diary_entries').update(clean).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async setDiaryWorkers(diaryId: string, workers: Omit<LaborDiaryWorker, 'id' | 'diary_entry_id' | 'employee_name'>[]): Promise<void> {
        await supabase.from('labor_diary_workers').delete().eq('diary_entry_id', diaryId);
        if (workers.length === 0) return;
        const { error } = await supabase.from('labor_diary_workers')
            .insert(workers.map(w => ({ ...w, diary_entry_id: diaryId })));
        if (error) throw error;
    },

    async closeLaborDiary(diaryId: string): Promise<{ success: boolean; inserted: number; skipped: number; total_hh: number }> {
        const { data, error } = await supabase.rpc('close_labor_diary', { p_diary_id: diaryId });
        if (error) throw error;
        return data;
    },

    async deleteLaborDiaryEntry(id: string): Promise<void> {
        const { error } = await supabase.from('labor_diary_entries').delete().eq('id', id);
        if (error) throw error;
    },

    // ── TERMINATION ────────────────────────────────────────

    async listTerminations(orgId: string): Promise<TerminationRecord[]> {
        const { data, error } = await supabase
            .from('termination_records')
            .select(`*, employee:employees!employee_id(name, role)`)
            .eq('org_id', orgId)
            .order('termination_date', { ascending: false });
        if (error) throw error;
        type TRow = TerminationRecord & { employee?: { name: string; role: string } };
        return (data || [] as TRow[]).map((r: TRow) => ({
            ...r,
            employee_name: r.employee?.name,
            employee_role: r.employee?.role,
        }));
    },

    async getTerminationByEmployee(employeeId: string): Promise<TerminationRecord | null> {
        const { data, error } = await supabase
            .from('termination_records')
            .select('*')
            .eq('employee_id', employeeId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async createTermination(
        record: Omit<TerminationRecord, 'id' | 'created_at' | 'updated_at' | 'employee_name' | 'employee_role' | 'epis_devolvidos' | 'acessos_bloqueados'>
    ): Promise<TerminationRecord> {
        const { data, error } = await supabase
            .from('termination_records')
            .insert({ ...record, epis_devolvidos: false, acessos_bloqueados: false })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateTermination(id: string, updates: Partial<TerminationRecord>): Promise<TerminationRecord> {
        const { id: _id, created_at: _ca, updated_at: _ua, employee_name: _en, employee_role: _er, ...clean } = updates;
        const { data, error } = await supabase
            .from('termination_records')
            .update(clean)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async finalizeTermination(id: string, processedBy: string): Promise<TerminationRecord> {
        const { data, error } = await supabase
            .from('termination_records')
            .update({ status: 'CONCLUIDO', processed_by: processedBy })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteTermination(id: string): Promise<void> {
        const { error } = await supabase.from('termination_records').delete().eq('id', id);
        if (error) throw error;
    },

    // ── TRAININGS ──────────────────────────────────────────

    async listTrainingCourses(orgId: string): Promise<TrainingCourse[]> {
        const { data, error } = await supabase
            .from('training_courses')
            .select('*')
            .eq('org_id', orgId)
            .order('nome');
        if (error) throw error;
        return data || [];
    },

    async createTrainingCourse(course: Omit<TrainingCourse, 'id' | 'created_at' | 'updated_at'>): Promise<TrainingCourse> {
        const { data, error } = await supabase
            .from('training_courses')
            .insert(course)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateTrainingCourse(id: string, updates: Partial<TrainingCourse>): Promise<TrainingCourse> {
        const { id: _id, created_at: _ca, updated_at: _ua, ...clean } = updates;
        const { data, error } = await supabase
            .from('training_courses')
            .update(clean)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteTrainingCourse(id: string): Promise<void> {
        const { error } = await supabase
            .from('training_courses')
            .update({ status: 'INATIVO' })
            .eq('id', id);
        if (error) throw error;
    },

    async listEmployeeTrainings(filters: {
        orgId: string;
        employeeId?: string;
        courseId?: string;
        status?: EmployeeTraining['status'];
    }): Promise<EmployeeTraining[]> {
        let query = supabase
            .from('employee_trainings')
            .select(`
                *,
                employee:employees!employee_id(name),
                course:training_courses!course_id(nome, nr_referencia)
            `)
            .eq('org_id', filters.orgId)
            .order('data_realizacao', { ascending: false });

        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.courseId)   query = query.eq('course_id', filters.courseId);
        if (filters.status)     query = query.eq('status', filters.status);

        const { data, error } = await query;
        if (error) throw error;

        type ETRow = EmployeeTraining & {
            employee?: { name: string };
            course?: { nome: string; nr_referencia?: string };
        };
        return (data || [] as ETRow[]).map((r: ETRow) => ({
            ...r,
            employee_name: r.employee?.name,
            course_nome: r.course?.nome,
            nr_referencia: r.course?.nr_referencia,
        }));
    },

    async createEmployeeTraining(
        training: Omit<EmployeeTraining, 'id' | 'created_at' | 'updated_at' | 'employee_name' | 'course_nome' | 'nr_referencia'>
    ): Promise<EmployeeTraining> {
        const { data, error } = await supabase
            .from('employee_trainings')
            .insert(training)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async uploadTrainingCertificado(trainingId: string, orgId: string, file: File): Promise<string> {
        const validation = validateDocumentFile(file);
        if (!validation.valid) throw new Error(validation.error);

        const ext = file.name.split('.').pop();
        const path = `trainings/${orgId}/${trainingId}.${ext}`;
        const { error } = await supabase.storage
            .from('organization-assets')
            .upload(path, file, { upsert: true });
        if (error) throw error;
        await supabase.from('employee_trainings').update({ certificado_url: path }).eq('id', trainingId);
        return path;
    },

    async updateEmployeeTraining(id: string, updates: Partial<EmployeeTraining>): Promise<EmployeeTraining> {
        const { id: _id, created_at: _ca, updated_at: _ua, employee_name: _en, course_nome: _cn, nr_referencia: _nr, ...clean } = updates;
        const { data, error } = await supabase
            .from('employee_trainings')
            .update(clean)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteEmployeeTraining(id: string): Promise<void> {
        const { error } = await supabase.from('employee_trainings').delete().eq('id', id);
        if (error) throw error;
    },

    async getTrainingAlerts(orgId: string): Promise<EmployeeTraining[]> {
        const in30 = new Date();
        in30.setDate(in30.getDate() + 30);
        const { data, error } = await supabase
            .from('employee_trainings')
            .select(`
                *,
                employee:employees!employee_id(name),
                course:training_courses!course_id(nome, nr_referencia)
            `)
            .eq('org_id', orgId)
            .lte('data_validade', in30.toISOString().split('T')[0])
            .eq('status', 'ATIVO')
            .order('data_validade');
        if (error) throw error;
        type ETRow = EmployeeTraining & { employee?: { name: string }; course?: { nome: string; nr_referencia?: string } };
        return (data || [] as ETRow[]).map((r: ETRow) => ({
            ...r, employee_name: r.employee?.name, course_nome: r.course?.nome, nr_referencia: r.course?.nr_referencia,
        }));
    },

    // ── RH KPIS (Sprint 5) ─────────────────────────────────

    async getRhKpis(orgId: string, refDate?: string): Promise<RhKpis> {
        const { data, error } = await supabase.rpc('rh_kpis', {
            p_org_id: orgId,
            p_ref_date: refDate || new Date().toISOString().split('T')[0],
        });
        if (error) throw error;
        return data as RhKpis;
    },

    // ── ABSENCES ───────────────────────────────────────────

    async listAbsences(filters: {
        orgId: string;
        employeeId?: string;
        tipo?: AbsenceTipo;
        status?: AbsenceStatus;
        dateStart?: string;
        dateEnd?: string;
    }): Promise<Absence[]> {
        let query = supabase
            .from('absences')
            .select(`*, employee:employees!employee_id(name)`)
            .eq('org_id', filters.orgId)
            .order('data_inicio', { ascending: false });

        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.tipo)       query = query.eq('tipo', filters.tipo);
        if (filters.status)     query = query.eq('status', filters.status);
        if (filters.dateStart)  query = query.gte('data_inicio', filters.dateStart);
        if (filters.dateEnd)    query = query.lte('data_fim', filters.dateEnd);

        const { data, error } = await query;
        if (error) throw error;

        type AbsenceRow = Absence & { employee?: { name: string } };
        return (data || [] as AbsenceRow[]).map((a: AbsenceRow) => ({
            ...a,
            employee_name: a.employee?.name,
        }));
    },

    async createAbsence(absence: Omit<Absence, 'id' | 'dias' | 'created_at' | 'updated_at' | 'employee_name'>): Promise<Absence> {
        const { data, error } = await supabase
            .from('absences')
            .insert(absence)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async uploadAbsenceAtestado(absenceId: string, orgId: string, file: File): Promise<string> {
        const validation = validateDocumentFile(file);
        if (!validation.valid) throw new Error(validation.error);

        const ext = file.name.split('.').pop();
        const path = `absences/${orgId}/${absenceId}.${ext}`;

        const { error } = await supabase.storage
            .from('organization-assets')
            .upload(path, file, { upsert: true });
        if (error) throw error;

        await supabase.from('absences').update({ atestado_url: path }).eq('id', absenceId);
        return path;
    },

    async approveAbsence(id: string, approvedBy: string): Promise<void> {
        const { error } = await supabase
            .from('absences')
            .update({ status: 'APROVADO', approved_by: approvedBy, approved_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async rejectAbsence(id: string, approvedBy: string, reason?: string): Promise<void> {
        const { error } = await supabase
            .from('absences')
            .update({ status: 'REJEITADO', approved_by: approvedBy, approved_at: new Date().toISOString(), rejection_reason: reason || null })
            .eq('id', id);
        if (error) throw error;
    },

    async cancelAbsence(id: string): Promise<void> {
        const { error } = await supabase
            .from('absences')
            .update({ status: 'CANCELADO' })
            .eq('id', id);
        if (error) throw error;
    },

    async deleteAbsence(id: string): Promise<void> {
        const { error } = await supabase.from('absences').delete().eq('id', id);
        if (error) throw error;
    },

    // ── VACATION BALANCE ───────────────────────────────────

    async listVacationBalances(orgId: string, employeeId?: string): Promise<VacationBalance[]> {
        let query = supabase
            .from('vacation_balance')
            .select(`*, employee:employees!employee_id(name)`)
            .eq('org_id', orgId)
            .order('vencimento', { ascending: true });

        if (employeeId) query = query.eq('employee_id', employeeId);

        const { data, error } = await query;
        if (error) throw error;

        type VBRow = VacationBalance & { employee?: { name: string } };
        return (data || [] as VBRow[]).map((v: VBRow) => ({
            ...v,
            employee_name: v.employee?.name,
        }));
    },

    async createVacationPeriod(employeeId: string, orgId: string, periodoInicio: string): Promise<VacationBalance> {
        const { data, error } = await supabase.rpc('create_vacation_period', {
            p_employee_id: employeeId,
            p_org_id: orgId,
            p_hire_date: periodoInicio,
        });
        if (error) throw error;

        // Busca o registro criado
        const { data: record, error: fetchErr } = await supabase
            .from('vacation_balance')
            .select('*')
            .eq('employee_id', employeeId)
            .eq('periodo_inicio', periodoInicio)
            .single();
        if (fetchErr) throw fetchErr;
        return record;
    },

    async updateVacationBalance(id: string, updates: Pick<VacationBalance, 'dias_direito' | 'dias_gozados' | 'dias_vendidos' | 'status'>): Promise<VacationBalance> {
        const { data, error } = await supabase
            .from('vacation_balance')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getVacationAlerts(orgId: string): Promise<VacationBalance[]> {
        // Férias vencendo nos próximos 60 dias ou já vencidas com saldo
        const today = new Date().toISOString().split('T')[0];
        const in60 = new Date();
        in60.setDate(in60.getDate() + 60);
        const in60Str = in60.toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('vacation_balance')
            .select(`*, employee:employees!employee_id(name)`)
            .eq('org_id', orgId)
            .lte('vencimento', in60Str)
            .gt('dias_restantes', 0)
            .order('vencimento', { ascending: true });
        if (error) throw error;

        type VBRow = VacationBalance & { employee?: { name: string } };
        return (data || [] as VBRow[]).map((v: VBRow) => ({ ...v, employee_name: v.employee?.name }));
    },

    // ── EPI CATALOG ────────────────────────────────────────

    async listEpiCatalog(orgId: string): Promise<EpiCatalogItem[]> {
        const { data, error } = await supabase
            .from('epi_catalog')
            .select('*')
            .eq('org_id', orgId)
            .order('nome');
        if (error) throw error;
        return data || [];
    },

    async createEpiCatalogItem(item: Omit<EpiCatalogItem, 'id' | 'created_at' | 'updated_at'>): Promise<EpiCatalogItem> {
        const { data, error } = await supabase
            .from('epi_catalog')
            .insert(item)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateEpiCatalogItem(id: string, updates: Partial<EpiCatalogItem>): Promise<EpiCatalogItem> {
        const { id: _id, created_at: _ca, updated_at: _ua, epi_nome: _en, ...clean } = updates as Partial<EpiCatalogItem> & { epi_nome?: string };
        const { data, error } = await supabase
            .from('epi_catalog')
            .update(clean)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteEpiCatalogItem(id: string): Promise<void> {
        const { error } = await supabase
            .from('epi_catalog')
            .update({ status: 'INATIVO' })
            .eq('id', id);
        if (error) throw error;
    },

    // ── EPI DELIVERIES ─────────────────────────────────────

    async listEpiDeliveries(filters: {
        orgId: string;
        employeeId?: string;
        epiId?: string;
        includeReturned?: boolean;
    }): Promise<EpiDelivery[]> {
        let query = supabase
            .from('epi_deliveries')
            .select(`
                *,
                epi:epi_catalog!epi_id(nome),
                employee:employees!employee_id(name)
            `)
            .eq('org_id', filters.orgId)
            .order('delivered_at', { ascending: false });

        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.epiId) query = query.eq('epi_id', filters.epiId);
        if (!filters.includeReturned) query = query.eq('is_returned', false);

        const { data, error } = await query;
        if (error) throw error;

        type DeliveryRow = EpiDelivery & { epi?: { nome: string }; employee?: { name: string } };
        return (data || [] as DeliveryRow[]).map((d: DeliveryRow) => ({
            ...d,
            epi_nome: d.epi?.nome,
            employee_name: d.employee?.name,
        }));
    },

    async createEpiDelivery(delivery: Omit<EpiDelivery, 'id' | 'created_at' | 'epi_nome' | 'employee_name'>): Promise<EpiDelivery> {
        const { data, error } = await supabase
            .from('epi_deliveries')
            .insert(delivery)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async returnEpi(id: string, returnedAt?: string): Promise<void> {
        const { error } = await supabase
            .from('epi_deliveries')
            .update({
                is_returned: true,
                returned_at: returnedAt || new Date().toISOString().split('T')[0],
            })
            .eq('id', id);
        if (error) throw error;
    },

    async deleteEpiDelivery(id: string): Promise<void> {
        const { error } = await supabase.from('epi_deliveries').delete().eq('id', id);
        if (error) throw error;
    },

    async getEpiAlerts(orgId: string): Promise<{ lowStock: EpiCatalogItem[]; expiredCa: EpiCatalogItem[] }> {
        const { data, error } = await supabase
            .from('epi_catalog')
            .select('*')
            .eq('org_id', orgId)
            .eq('status', 'ATIVO');
        if (error) throw error;

        const items = data || [];
        const today = new Date().toISOString().split('T')[0];
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextMonthStr = nextMonth.toISOString().split('T')[0];

        return {
            lowStock: items.filter(i => i.estoque_atual <= i.estoque_minimo),
            expiredCa: items.filter(i => i.ca_validade && i.ca_validade <= nextMonthStr),
        };
    },

    // ── MIGRATION ──────────────────────────────────────────

    async migrateLegacyWorkers(orgId?: string): Promise<{ imported: number, skipped: number }> {
        let query = supabase.from('organizations').select('id, resources');
        if (orgId) {
            query = query.eq('id', orgId);
        }
        
        const { data: orgs, error: orgError } = await query;
        if (orgError || !orgs) throw orgError || new Error('Organização não encontrada');
        
        let totalImported = 0;
        let totalSkipped = 0;

        for (const org of orgs) {
            const legacyWorkers = org.resources?.workers || [];
            if (legacyWorkers.length === 0) continue;

            const currentOrgId = org.id;

            // Buscar funcionários existentes para evitar duplicados por nome
            const { data: existing } = await supabase
                .from('employees')
                .select('name')
                .eq('org_id', currentOrgId);
            
            const existingNames = new Set((existing || []).map(e => e.name.toLowerCase()));
            
            let imported = 0;
            let skipped = 0;

            for (const worker of legacyWorkers) {
                if (existingNames.has(worker.name.toLowerCase())) {
                    skipped++;
                    continue;
                }

                const newEmployee = {
                    org_id: currentOrgId,
                    name: worker.name,
                    role: worker.roleName || worker.roleId || 'Colaborador',
                    contract_type: 'CLT' as const, // Default
                    status: 'ATIVO' as const,
                    daily_cost: worker.baseSalary || 0, // Using daily_cost as mapped from baseSalary
                    notes: `Migrado do sistema legatário em ${new Date().toLocaleDateString('pt-BR')}.`,
                };

                const { error: insError } = await supabase.from('employees').insert(newEmployee);
                if (!insError) imported++;
                else console.error('Error migrating worker:', worker.name, insError);
            }

            // Limpar os recursos legatários após migração bem-sucedida
            if (imported > 0 || skipped > 0) {
                const updatedResources = { ...org.resources, workers: [] };
                await supabase
                    .from('organizations')
                    .update({ resources: updatedResources })
                    .eq('id', currentOrgId);
            }

            totalImported += imported;
            totalSkipped += skipped;
        }

        return { imported: totalImported, skipped: totalSkipped };
    }
};
