import { supabase } from '../lib/supabase';

// ── TYPES ─────────────────────────────────────────────────────────────────────

export type JobStatus = 'ABERTA' | 'PAUSADA' | 'FECHADA' | 'CANCELADA';
export type JobPrioridade = 'URGENTE' | 'ALTA' | 'NORMAL' | 'BAIXA';
export type CandidateStage =
    | 'RECEBIDO' | 'TRIAGEM' | 'ENTREVISTA_RH' | 'ENTREVISTA_TECNICA'
    | 'TESTE' | 'PROPOSTA' | 'APROVADO' | 'CONTRATADO' | 'REPROVADO' | 'DESISTIU';
export type CandidateOrigem =
    | 'INDICACAO' | 'SITE' | 'LINKEDIN' | 'WHATSAPP'
    | 'IFOOD_JOBS' | 'CATHO' | 'INFOJOBS' | 'OUTROS';
export type InterviewTipo =
    | 'TRIAGEM' | 'ENTREVISTA_RH' | 'ENTREVISTA_TECNICA'
    | 'TESTE' | 'FEEDBACK' | 'PROPOSTA' | 'CONTATO';

export interface JobOpening {
    id: string;
    org_id: string;
    titulo: string;
    descricao?: string;
    requisitos?: string;
    cargo: string;
    project_id?: string;
    project_name?: string;
    tipo_contrato: string;
    salario_min?: number;
    salario_max?: number;
    quantidade: number;
    prioridade: JobPrioridade;
    responsavel_id?: string;
    responsavel_nome?: string;
    data_abertura: string;
    data_limite?: string;
    status: JobStatus;
    notas?: string;
    candidates_count?: number;
    created_at?: string;
    updated_at?: string;
}

export interface Candidate {
    id: string;
    org_id: string;
    job_id: string;
    job_titulo?: string;
    nome: string;
    email?: string;
    telefone?: string;
    cpf?: string;
    endereco?: string;
    origem: CandidateOrigem;
    curriculo_url?: string;
    foto_url?: string;
    stage: CandidateStage;
    nota_curriculo?: number;
    nota_entrevista?: number;
    nota_tecnica?: number;
    nota_final?: number;
    pretensao_salarial?: number;
    disponibilidade?: string;
    experiencia_anos?: number;
    observacoes?: string;
    banco_talentos: boolean;
    employee_id?: string;
    data_contratacao?: string;
    created_at?: string;
    updated_at?: string;
    interviews?: InterviewRecord[];
}

export interface InterviewRecord {
    id: string;
    org_id: string;
    candidate_id: string;
    tipo: InterviewTipo;
    data_hora: string;
    entrevistador?: string;
    canal: string;
    duracao_min?: number;
    notas?: string;
    nota?: number;
    proxima_etapa?: string;
    created_by?: string;
    created_at?: string;
}

export interface PortalToken {
    id: string;
    org_id: string;
    employee_id: string;
    employee_name?: string;
    token: string;
    expires_at: string;
    last_used_at?: string;
    is_active: boolean;
    created_at?: string;
}

export interface PortalEmployeeSummary {
    employee: {
        id: string; name: string; role: string; status: string;
        hire_date?: string; avatar_url?: string; matricula?: string;
    };
    ferias_saldo: number;
    pontos_pendentes: number;
    treinamentos_vencendo: number;
    ausencias_mes: number;
}

// ── SERVICE ───────────────────────────────────────────────────────────────────

export const atsService = {

    // ── JOB OPENINGS ──────────────────────────────────────

    async listJobs(orgId: string, status?: JobStatus): Promise<JobOpening[]> {
        let query = supabase
            .from('job_openings')
            .select(`
                *,
                responsavel:employees!responsavel_id(name),
                candidates_count:candidates(count)
            `)
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
        if (status) query = query.eq('status', status);
        const { data, error } = await query;
        if (error) throw error;
        type JRow = JobOpening & { responsavel?: { name: string }; candidates_count?: { count: number }[] };
        return (data || [] as JRow[]).map((r: JRow) => ({
            ...r,
            responsavel_nome: r.responsavel?.name,
            candidates_count: (r.candidates_count as unknown as { count: number }[])?.[0]?.count ?? 0,
        }));
    },

    async createJob(job: Omit<JobOpening, 'id' | 'created_at' | 'updated_at' | 'responsavel_nome' | 'candidates_count'>): Promise<JobOpening> {
        const { data, error } = await supabase.from('job_openings').insert(job).select().single();
        if (error) throw error;
        return data;
    },

    async updateJob(id: string, updates: Partial<JobOpening>): Promise<JobOpening> {
        const { id: _id, created_at: _ca, updated_at: _ua, responsavel_nome: _rn, candidates_count: _cc, ...clean } = updates;
        const { data, error } = await supabase.from('job_openings').update(clean).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async deleteJob(id: string): Promise<void> {
        const { error } = await supabase.from('job_openings').update({ status: 'CANCELADA' }).eq('id', id);
        if (error) throw error;
    },

    // ── CANDIDATES ────────────────────────────────────────

    async listCandidates(orgId: string, filters?: {
        jobId?: string;
        stage?: CandidateStage;
        bancTalentos?: boolean;
        search?: string;
    }): Promise<Candidate[]> {
        let query = supabase
            .from('candidates')
            .select(`*, job:job_openings!job_id(titulo)`)
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
        if (filters?.jobId)       query = query.eq('job_id', filters.jobId);
        if (filters?.stage)       query = query.eq('stage', filters.stage);
        if (filters?.bancTalentos) query = query.eq('banco_talentos', true);
        const { data, error } = await query;
        if (error) throw error;
        type CRow = Candidate & { job?: { titulo: string } };
        let result = (data || [] as CRow[]).map((r: CRow) => ({ ...r, job_titulo: r.job?.titulo }));
        if (filters?.search) {
            const s = filters.search.toLowerCase();
            result = result.filter(c => c.nome.toLowerCase().includes(s) || (c.email || '').toLowerCase().includes(s) || (c.telefone || '').includes(s));
        }
        return result;
    },

    async createCandidate(candidate: Omit<Candidate, 'id' | 'nota_final' | 'created_at' | 'updated_at' | 'job_titulo' | 'interviews'>): Promise<Candidate> {
        const { data, error } = await supabase.from('candidates').insert(candidate).select().single();
        if (error) throw error;
        return data;
    },

    async updateCandidateStage(id: string, stage: CandidateStage): Promise<void> {
        const { error } = await supabase.from('candidates').update({ stage }).eq('id', id);
        if (error) throw error;
    },

    async updateCandidate(id: string, updates: Partial<Candidate>): Promise<Candidate> {
        const { id: _id, nota_final: _nf, created_at: _ca, updated_at: _ua, job_titulo: _jt, interviews: _iv, ...clean } = updates;
        const { data, error } = await supabase.from('candidates').update(clean).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async deleteCandidate(id: string): Promise<void> {
        const { error } = await supabase.from('candidates').delete().eq('id', id);
        if (error) throw error;
    },

    async hireCandidate(candidateId: string, hireDate: string): Promise<string> {
        const { data, error } = await supabase.rpc('hire_candidate', {
            p_candidate_id: candidateId,
            p_hire_date: hireDate,
        });
        if (error) throw error;
        return data as string;
    },

    // ── INTERVIEWS ────────────────────────────────────────

    async listInterviews(candidateId: string): Promise<InterviewRecord[]> {
        const { data, error } = await supabase
            .from('interview_records')
            .select('*')
            .eq('candidate_id', candidateId)
            .order('data_hora', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createInterview(interview: Omit<InterviewRecord, 'id' | 'created_at'>): Promise<InterviewRecord> {
        const { data, error } = await supabase.from('interview_records').insert(interview).select().single();
        if (error) throw error;
        return data;
    },

    async deleteInterview(id: string): Promise<void> {
        const { error } = await supabase.from('interview_records').delete().eq('id', id);
        if (error) throw error;
    },

    // ── PORTAL TOKENS ─────────────────────────────────────

    async listPortalTokens(orgId: string): Promise<PortalToken[]> {
        const { data, error } = await supabase
            .from('portal_tokens')
            .select(`*, employee:employees!employee_id(name)`)
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        type PTRow = PortalToken & { employee?: { name: string } };
        return (data || [] as PTRow[]).map((r: PTRow) => ({ ...r, employee_name: r.employee?.name }));
    },

    async generatePortalToken(employeeId: string, orgId: string): Promise<string> {
        const { data, error } = await supabase.rpc('portal_generate_token', {
            p_employee_id: employeeId,
            p_org_id: orgId,
        });
        if (error) throw error;
        return data as string;
    },

    async revokePortalToken(tokenId: string): Promise<void> {
        const { error } = await supabase.from('portal_tokens').update({ is_active: false }).eq('id', tokenId);
        if (error) throw error;
    },

    async validatePortalToken(token: string): Promise<{ valid: boolean; employee_id?: string; org_id?: string; name?: string; role?: string; error?: string }> {
        const { data, error } = await supabase.rpc('portal_validate_token', { p_token: token });
        if (error) throw error;
        return data;
    },

    async getPortalSummary(employeeId: string): Promise<PortalEmployeeSummary> {
        const { data, error } = await supabase.rpc('portal_employee_summary', { p_employee_id: employeeId });
        if (error) throw error;
        return data as PortalEmployeeSummary;
    },
};
