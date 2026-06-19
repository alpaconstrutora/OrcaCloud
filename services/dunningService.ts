import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────

export interface DunningRule {
    id?: string;
    organization_id: string;
    name: string;
    days_offset: number;       // neg = antes do venc., pos = depois
    trigger_hour: number;      // 0–23 BRT
    channel: 'email';
    subject_template: string;
    body_template: string;
    is_active: boolean;
    sort_order: number;
    created_at?: string;
    updated_at?: string;
}

export interface DunningEvent {
    id: string;
    organization_id: string;
    transaction_id: string;
    rule_id: string;
    channel: string;
    recipient_email?: string;
    party_name?: string;
    amount?: number;
    due_date?: string;
    status: 'sent' | 'failed' | 'skipped';
    error_message?: string;
    sent_at: string;
    // joined
    rule_name?: string;
}

export const DUNNING_VARS = [
    { key: '{{nome}}',        label: 'Nome do cliente' },
    { key: '{{valor}}',       label: 'Valor da parcela' },
    { key: '{{vencimento}}',  label: 'Data de vencimento' },
    { key: '{{descricao}}',   label: 'Descrição' },
    { key: '{{projeto}}',     label: 'Nome do projeto' },
    { key: '{{dias_atraso}}', label: 'Dias em atraso' },
];

export const DEFAULT_RULES: Omit<DunningRule, 'id' | 'organization_id' | 'created_at' | 'updated_at'>[] = [
    {
        name: 'Lembrete 7 dias antes',
        days_offset: -7,
        trigger_hour: 9,
        channel: 'email',
        subject_template: 'Lembrete: {{descricao}} vence em 7 dias',
        body_template: 'Olá {{nome}},<br><br>Este é um lembrete amigável: a parcela <strong>{{descricao}}</strong> no valor de <strong>{{valor}}</strong> vence em <strong>{{vencimento}}</strong> (em 7 dias).<br><br>Qualquer dúvida, entre em contato.<br><br>Att,<br>Equipe ORÇACLOUD',
        is_active: true,
        sort_order: 10,
    },
    {
        name: 'Lembrete 1 dia antes',
        days_offset: -1,
        trigger_hour: 9,
        channel: 'email',
        subject_template: 'Atenção: {{descricao}} vence amanhã',
        body_template: 'Olá {{nome}},<br><br>A parcela <strong>{{descricao}}</strong> no valor de <strong>{{valor}}</strong> vence <strong>amanhã, {{vencimento}}</strong>.<br><br>Evite encargos realizando o pagamento até a data de vencimento.<br><br>Att,<br>Equipe ORÇACLOUD',
        is_active: true,
        sort_order: 20,
    },
    {
        name: 'Aviso no dia do vencimento',
        days_offset: 0,
        trigger_hour: 9,
        channel: 'email',
        subject_template: 'Hoje é o vencimento: {{descricao}}',
        body_template: 'Olá {{nome}},<br><br>A parcela <strong>{{descricao}}</strong> no valor de <strong>{{valor}}</strong> vence <strong>hoje, {{vencimento}}</strong>.<br><br>Realize o pagamento para evitar juros e multas.<br><br>Att,<br>Equipe ORÇACLOUD',
        is_active: false,
        sort_order: 30,
    },
    {
        name: '1ª Cobrança — 3 dias atraso',
        days_offset: 3,
        trigger_hour: 9,
        channel: 'email',
        subject_template: 'Pagamento em atraso: {{descricao}}',
        body_template: 'Olá {{nome}},<br><br>Identificamos que a parcela <strong>{{descricao}}</strong> no valor de <strong>{{valor}}</strong> com vencimento em <strong>{{vencimento}}</strong> está em aberto há {{dias_atraso}} dias.<br><br>Por favor, regularize o quanto antes para evitar maiores encargos.<br><br>Att,<br>Equipe ORÇACLOUD',
        is_active: true,
        sort_order: 40,
    },
    {
        name: '2ª Cobrança — 15 dias atraso',
        days_offset: 15,
        trigger_hour: 9,
        channel: 'email',
        subject_template: 'Pendência: {{descricao}} — {{dias_atraso}} dias em atraso',
        body_template: 'Olá {{nome}},<br><br>A parcela <strong>{{descricao}}</strong> ({{valor}}) está há <strong>{{dias_atraso}} dias em atraso</strong> desde {{vencimento}}.<br><br>Entre em contato para regularizar ou negociar condições de pagamento.<br><br>Att,<br>Equipe ORÇACLOUD',
        is_active: true,
        sort_order: 50,
    },
    {
        name: 'Último aviso — 30 dias atraso',
        days_offset: 30,
        trigger_hour: 9,
        channel: 'email',
        subject_template: 'URGENTE: {{descricao}} — {{dias_atraso}} dias em atraso',
        body_template: 'Olá {{nome}},<br><br>A parcela <strong>{{descricao}}</strong> ({{valor}}) está há <strong>{{dias_atraso}} dias</strong> sem pagamento.<br><br>Este é o último aviso automático. Por favor, entre em contato imediatamente para regularizar sua situação.<br><br>Att,<br>Equipe ORÇACLOUD',
        is_active: true,
        sort_order: 60,
    },
];

// ── Service ───────────────────────────────────────────────────

const RULE_COLS = 'id,organization_id,name,days_offset,trigger_hour,channel,subject_template,body_template,is_active,sort_order,created_at,updated_at';
const EVENT_COLS = 'id,organization_id,transaction_id,rule_id,channel,recipient_email,party_name,amount,due_date,status,error_message,sent_at';

export const dunningService = {

    // ── Rules CRUD ────────────────────────────────────────────

    async listRules(organizationId: string): Promise<DunningRule[]> {
        const { data, error } = await supabase
            .from('dunning_rules')
            .select(RULE_COLS)
            .eq('organization_id', organizationId)
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return (data || []) as DunningRule[];
    },

    async upsertRule(rule: DunningRule): Promise<DunningRule> {
        const payload = {
            organization_id:  rule.organization_id,
            name:             rule.name,
            days_offset:      rule.days_offset,
            trigger_hour:     rule.trigger_hour,
            channel:          rule.channel,
            subject_template: rule.subject_template,
            body_template:    rule.body_template,
            is_active:        rule.is_active,
            sort_order:       rule.sort_order,
        };
        const { data, error } = rule.id
            ? await supabase.from('dunning_rules').update(payload).eq('id', rule.id).select(RULE_COLS).single()
            : await supabase.from('dunning_rules').insert(payload).select(RULE_COLS).single();
        if (error) throw error;
        return data as DunningRule;
    },

    async deleteRule(id: string): Promise<void> {
        const { error } = await supabase.from('dunning_rules').delete().eq('id', id);
        if (error) throw error;
    },

    async seedDefaults(organizationId: string): Promise<void> {
        const rows = DEFAULT_RULES.map(r => ({ ...r, organization_id: organizationId }));
        const { error } = await supabase.from('dunning_rules').insert(rows);
        if (error) throw error;
    },

    // ── Events ────────────────────────────────────────────────

    async listEvents(
        organizationId: string,
        filters?: { status?: string; dateFrom?: string; dateTo?: string; limit?: number },
    ): Promise<DunningEvent[]> {
        let q = supabase
            .from('dunning_events')
            .select(EVENT_COLS)
            .eq('organization_id', organizationId)
            .order('sent_at', { ascending: false })
            .limit(filters?.limit ?? 200);
        if (filters?.status) q = q.eq('status', filters.status);
        if (filters?.dateFrom) q = q.gte('sent_at', filters.dateFrom);
        if (filters?.dateTo)   q = q.lte('sent_at', filters.dateTo + 'T23:59:59');
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as DunningEvent[];
    },

    // ── Manual trigger (chama a Edge Function) ────────────────

    async triggerManual(organizationId: string): Promise<{ totalSent: number; totalSkipped: number; totalFailed: number }> {
        const { data, error } = await supabase.functions.invoke('dunning-notifier', {
            body: { organization_id: organizationId },
        });
        if (error) throw error;
        return data as { totalSent: number; totalSkipped: number; totalFailed: number };
    },
};
