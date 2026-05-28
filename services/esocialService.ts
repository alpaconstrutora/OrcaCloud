import { supabase } from '../lib/supabase';

// ── TYPES ─────────────────────────────────────────────────────────────────────

export type EsocialStatus = 'GERADO' | 'ASSINADO' | 'AGUARDANDO' | 'PROCESSADO' | 'ERRO' | 'CANCELADO' | 'EXCLUIDO';
export type EsocialGrupo = 'TABELAS' | 'NAO_PERIODICOS' | 'PERIODICOS' | 'FECHAMENTO';
export type BatchStatus = 'ABERTO' | 'TRANSMITINDO' | 'AGUARDANDO' | 'PROCESSADO' | 'ERRO';
export type CertStatus = 'NAO_CONFIGURADO' | 'VALIDO' | 'EXPIRADO' | 'INVALIDO';

export interface EsocialConfig {
    id?: string;
    org_id: string;
    ambiente: 'PRODUCAO' | 'PRODUCAO_RESTRITA';
    versao_schema: string;
    tipo_inscricao: 1 | 2;
    nr_inscricao: string;
    cert_serial?: string;
    cert_validade?: string;
    cert_status: CertStatus;
    transmissao_automatica: boolean;
    horario_transmissao?: string;
    ativo: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface EsocialEvent {
    id: string;
    org_id: string;
    tipo_evento: string;
    grupo: EsocialGrupo;
    entidade?: string;
    entidade_id?: string;
    per_apur?: string;
    xml_gerado?: string;
    xml_hash?: string;
    protocolo?: string;
    recibo?: string;
    status: EsocialStatus;
    retorno_codigo?: string;
    retorno_descricao?: string;
    gerado_em: string;
    assinado_em?: string;
    transmitido_em?: string;
    processado_em?: string;
    created_at?: string;
    updated_at?: string;
}

export interface EsocialBatch {
    id: string;
    org_id: string;
    numero_lote?: string;
    grupo: EsocialGrupo;
    per_apur?: string;
    total_eventos: number;
    eventos_ok: number;
    eventos_erro: number;
    status: BatchStatus;
    protocolo_envio?: string;
    retorno_codigo?: string;
    retorno_descricao?: string;
    transmitido_em?: string;
    processado_em?: string;
    created_at?: string;
    updated_at?: string;
}

export interface EsocialPendingAlert {
    id: string;
    org_id: string;
    tipo_evento: string;
    titulo: string;
    descricao?: string;
    entidade?: string;
    entidade_id?: string;
    prioridade: 'CRITICA' | 'ALTA' | 'NORMAL' | 'BAIXA';
    prazo?: string;
    resolvida: boolean;
    resolvida_em?: string;
    created_at?: string;
}

export interface EsocialDashboard {
    pendentes: number;
    erros: number;
    aguardando: number;
    processados_mes: number;
    alertas_abertos: number;
}

export interface EsocialStatusPanel {
    org_id: string;
    tipo_evento: string;
    grupo: EsocialGrupo;
    status: EsocialStatus;
    total: number;
    mais_antigo?: string;
    mais_recente?: string;
    total_erros: number;
    total_ok: number;
}

// Catálogo dos principais eventos (referência para UX)
export const ESOCIAL_EVENTOS_CATALOG: Record<string, { desc: string; grupo: EsocialGrupo }> = {
    'S-1000': { desc: 'Informações do Empregador',      grupo: 'TABELAS' },
    'S-1005': { desc: 'Tabela de Estabelecimentos',     grupo: 'TABELAS' },
    'S-1010': { desc: 'Tabela de Rubricas',             grupo: 'TABELAS' },
    'S-1020': { desc: 'Tabela de Lotações',             grupo: 'TABELAS' },
    'S-1070': { desc: 'Tabela de Processos Adm/Jud',    grupo: 'TABELAS' },
    'S-2200': { desc: 'Admissão de Trabalhador',        grupo: 'NAO_PERIODICOS' },
    'S-2205': { desc: 'Alt. Cadastro do Trabalhador',   grupo: 'NAO_PERIODICOS' },
    'S-2206': { desc: 'Alt. Contrato de Trabalho',      grupo: 'NAO_PERIODICOS' },
    'S-2210': { desc: 'Comunicação de Acidente',        grupo: 'NAO_PERIODICOS' },
    'S-2220': { desc: 'Monitor. Saúde do Trabalhador',  grupo: 'NAO_PERIODICOS' },
    'S-2230': { desc: 'Afastamento Temporário',         grupo: 'NAO_PERIODICOS' },
    'S-2240': { desc: 'Condições Ambientais',           grupo: 'NAO_PERIODICOS' },
    'S-2299': { desc: 'Desligamento',                   grupo: 'NAO_PERIODICOS' },
    'S-2300': { desc: 'Trabalhador Sem Vínculo',        grupo: 'NAO_PERIODICOS' },
    'S-1200': { desc: 'Remuneração do Trabalhador',     grupo: 'PERIODICOS' },
    'S-1210': { desc: 'Pagamentos de Rendimentos',      grupo: 'PERIODICOS' },
    'S-1280': { desc: 'Informações Complementares',     grupo: 'PERIODICOS' },
    'S-1299': { desc: 'Fechamento dos Periódicos',      grupo: 'FECHAMENTO' },
    'S-1300': { desc: 'Contribuição Patronal',          grupo: 'PERIODICOS' },
};

// ── SERVICE ───────────────────────────────────────────────────────────────────

export const esocialService = {

    // CONFIG
    async getConfig(orgId: string): Promise<EsocialConfig | null> {
        const { data, error } = await supabase
            .from('esocial_config')
            .select('*')
            .eq('org_id', orgId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async upsertConfig(config: EsocialConfig): Promise<void> {
        const { error } = await supabase
            .from('esocial_config')
            .upsert({ ...config, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
        if (error) throw error;
    },

    // DASHBOARD (RPC)
    async getDashboard(orgId: string): Promise<EsocialDashboard> {
        const { data, error } = await supabase.rpc('esocial_get_dashboard', { p_org_id: orgId });
        if (error) throw error;
        return data;
    },

    // EVENTOS
    async getEvents(orgId: string, filters?: { status?: EsocialStatus; grupo?: EsocialGrupo; tipo?: string }): Promise<EsocialEvent[]> {
        let q = supabase
            .from('esocial_events')
            .select('*')
            .eq('org_id', orgId)
            .order('gerado_em', { ascending: false })
            .limit(200);
        if (filters?.status) q = q.eq('status', filters.status);
        if (filters?.grupo)  q = q.eq('grupo', filters.grupo);
        if (filters?.tipo)   q = q.eq('tipo_evento', filters.tipo);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    },

    async getStatusPanel(orgId: string): Promise<EsocialStatusPanel[]> {
        const { data, error } = await supabase
            .from('vw_esocial_status_panel')
            .select('*')
            .eq('org_id', orgId)
            .order('tipo_evento');
        if (error) throw error;
        return data || [];
    },

    async updateEventStatus(id: string, status: EsocialStatus, extra?: { protocolo?: string; recibo?: string; retorno_codigo?: string; retorno_descricao?: string }): Promise<void> {
        const patch: any = { status, updated_at: new Date().toISOString() };
        if (status === 'ASSINADO')    patch.assinado_em    = new Date().toISOString();
        if (status === 'AGUARDANDO')  patch.transmitido_em = new Date().toISOString();
        if (status === 'PROCESSADO')  patch.processado_em  = new Date().toISOString();
        if (extra) Object.assign(patch, extra);
        const { error } = await supabase.from('esocial_events').update(patch).eq('id', id);
        if (error) throw error;
    },

    async cancelEvent(id: string): Promise<void> {
        const { error } = await supabase
            .from('esocial_events')
            .update({ status: 'CANCELADO', updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async createEvent(orgId: string, tipoEvento: string, extra?: { entidade?: string; entidade_id?: string; per_apur?: string }): Promise<EsocialEvent> {
        const catalog = ESOCIAL_EVENTOS_CATALOG[tipoEvento];
        const { data, error } = await supabase
            .from('esocial_events')
            .insert({
                org_id: orgId,
                tipo_evento: tipoEvento,
                grupo: catalog?.grupo ?? 'NAO_PERIODICOS',
                status: 'GERADO',
                ...extra,
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // RPC: S-2200 automático a partir de employee
    async generateS2200(employeeId: string): Promise<{ event_id: string; tipo_evento: string }> {
        const { data, error } = await supabase.rpc('esocial_generate_s2200', { p_employee_id: employeeId });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        return data;
    },

    // LOTES
    async getBatches(orgId: string): Promise<EsocialBatch[]> {
        const { data, error } = await supabase
            .from('esocial_batches')
            .select('*')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return data || [];
    },

    async createBatch(orgId: string, grupo: EsocialGrupo, perApur?: string): Promise<{ batch_id: string; total_eventos: number }> {
        const { data, error } = await supabase.rpc('esocial_create_batch', {
            p_org_id: orgId,
            p_grupo: grupo,
            p_per_apur: perApur ?? null,
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        return data;
    },

    async updateBatchStatus(id: string, status: BatchStatus, extra?: { protocolo_envio?: string; retorno_codigo?: string; retorno_descricao?: string }): Promise<void> {
        const patch: any = { status, updated_at: new Date().toISOString() };
        if (status === 'AGUARDANDO') patch.transmitido_em = new Date().toISOString();
        if (status === 'PROCESSADO') patch.processado_em  = new Date().toISOString();
        if (extra) Object.assign(patch, extra);
        const { error } = await supabase.from('esocial_batches').update(patch).eq('id', id);
        if (error) throw error;
    },

    // ALERTAS
    async getAlerts(orgId: string): Promise<EsocialPendingAlert[]> {
        const { data, error } = await supabase
            .from('esocial_pending_alerts')
            .select('*')
            .eq('org_id', orgId)
            .eq('resolvida', false)
            .order('prioridade')
            .order('prazo', { nullsFirst: false });
        if (error) throw error;
        return data || [];
    },

    async resolveAlert(id: string): Promise<void> {
        const { error } = await supabase
            .from('esocial_pending_alerts')
            .update({ resolvida: true, resolvida_em: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async createAlert(alert: Omit<EsocialPendingAlert, 'id' | 'resolvida' | 'created_at'>): Promise<void> {
        const { error } = await supabase.from('esocial_pending_alerts').insert({ ...alert, resolvida: false });
        if (error) throw error;
    },
};
