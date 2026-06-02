import { supabase } from '../lib/supabase';
import { payrollService, PayrollRubric } from './payrollService';

// ============================================================
// Módulo Incentivos & Produtividade — camada sobre rubrics + payroll_events
// ============================================================

export type ApprovalStatus = 'RASCUNHO' | 'PENDENTE' | 'APROVADO' | 'REJEITADO';

export type IncentiveCategory =
    | 'ASSIDUIDADE' | 'PRODUTIVIDADE' | 'SEGURANCA' | 'PRAZO'
    | 'META_OBRA' | 'QUALIDADE' | 'RETENCAO' | 'GERAL';

export type RuleType = Exclude<IncentiveCategory, 'GERAL'>;
export type RuleScope = 'EMPLOYEE' | 'TEAM' | 'PROJECT';

export interface IncentiveEvent {
    id?: string;
    org_id: string;
    employee_id: string;
    employee_name?: string;
    rubric_code: string;
    type: 'provento';
    amount: number;
    description: string;
    reference_date: string;
    approval_status: ApprovalStatus;
    justification?: string | null;
    attachment_url?: string | null;
    requested_by?: string | null;
    approved_by?: string | null;
    approved_at?: string | null;
    rejection_reason?: string | null;
    team_id?: string | null;
    project_id?: string | null;
    incentive_batch_id?: string | null;
    source_rule_id?: string | null;
    created_at?: string;
}

export interface HabitualityFlag {
    employee_id: string;
    employee_name: string;
    rubric_code: string;
    rubric_name: string;
    months_paid: number;          // meses distintos com pagamento na janela
    window_months: number;
    avg_monthly_amount: number;
    is_habitual: boolean;
    /** Estimativa de reflexos anualizados se o valor virar verba fixa (FGTS+INSS patr.+13º+férias). */
    estimated_annual_reflexo: number;
}

export interface IncentiveRule {
    id?: string;
    org_id: string;
    name: string;
    rule_type: RuleType;
    scope: RuleScope;
    target_rubric_code: string;
    condition: Record<string, unknown>;
    amount?: number;
    formula?: string | null;
    project_id?: string | null;
    valid_from?: string | null;
    valid_to?: string | null;
    active: boolean;
    created_at?: string;
}

export interface RuleRunResult {
    created: number;
    skipped: number;
    details: { employee_id: string; employee_name: string; amount: number; reason: string }[];
}

export interface PerformanceRow {
    key: string;
    name: string;
    total: number;
    count: number;
    employees?: number;
}

// Fator de reflexo trabalhista estimado sobre verba habitual (anualizado):
//   FGTS 8% + INSS patronal/terceiros ~28,8% (sobre 13 incidências) + 13º (1/12) + férias+1/3 (1/12*1,333)
// Aproximação conservadora aplicada sobre 12 competências do bônus médio mensal.
const REFLEXO_FACTOR = 0.40;

async function currentUserId(): Promise<string | null> {
    try {
        const { data } = await supabase.auth.getUser();
        return data.user?.id ?? null;
    } catch {
        return null;
    }
}

export const incentiveService = {
    // ── Rubricas de incentivo ────────────────────────────────
    async listIncentiveRubrics(): Promise<PayrollRubric[]> {
        const { data, error } = await supabase
            .from('rubrics')
            .select('*')
            .eq('is_incentive', true)
            .eq('active', true)
            .order('code');
        if (error) throw error;
        return (data || []) as PayrollRubric[];
    },

    /** Cria/edita rubrica já marcada como incentivo (reusa o serviço de folha). */
    async upsertIncentiveRubric(rubric: PayrollRubric & { incentive_category?: string }, isNew: boolean) {
        const payload = { ...rubric, is_incentive: true, type: 'provento' as const };
        return isNew
            ? payrollService.createRubric(payload)
            : payrollService.updateRubric(rubric.code, payload);
    },

    async incentiveRubricCodes(): Promise<string[]> {
        const rubrics = await this.listIncentiveRubrics();
        return rubrics.map(r => r.code);
    },

    // ── Eventos de incentivo ─────────────────────────────────
    async listEvents(orgId: string, opts?: { status?: ApprovalStatus; start?: string; end?: string }): Promise<IncentiveEvent[]> {
        const codes = await this.incentiveRubricCodes();
        if (codes.length === 0) return [];

        let query = supabase
            .from('payroll_events')
            .select('*, employee:employee_id(name)')
            .eq('org_id', orgId)
            .in('rubric_code', codes)
            .order('reference_date', { ascending: false });

        if (opts?.status) query = query.eq('approval_status', opts.status);
        if (opts?.start) query = query.gte('reference_date', opts.start);
        if (opts?.end) query = query.lte('reference_date', opts.end);

        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map((e: Record<string, unknown>) => ({
            ...(e as unknown as IncentiveEvent),
            employee_name: (e.employee as { name?: string } | null)?.name,
        }));
    },

    /** Lançamento individual de incentivo (entra como PENDENTE). */
    async launchIndividual(input: {
        org_id: string;
        employee_id: string;
        rubric_code: string;
        amount: number;
        description: string;
        justification: string;
        reference_date?: string;
        project_id?: string | null;
        attachment_url?: string | null;
        source_rule_id?: string | null;
        batch_id?: string | null;
    }): Promise<IncentiveEvent> {
        const uid = await currentUserId();
        const row = {
            org_id: input.org_id,
            employee_id: input.employee_id,
            payroll_run_id: null,
            code: input.rubric_code,
            rubric_code: input.rubric_code,
            type: 'provento',
            amount: input.amount,
            description: input.description,
            reference_date: input.reference_date || new Date().toISOString().split('T')[0],
            origin: input.source_rule_id ? 'rule' : 'incentive',
            unit: 'fixed',
            quantity: 0,
            approval_status: 'PENDENTE',
            justification: input.justification,
            attachment_url: input.attachment_url ?? null,
            requested_by: uid,
            project_id: input.project_id ?? null,
            source_rule_id: input.source_rule_id ?? null,
            incentive_batch_id: input.batch_id ?? null,
        };
        const { data, error } = await supabase.from('payroll_events').insert(row).select().single();
        if (error) throw error;
        return data as IncentiveEvent;
    },

    /** Lançamento coletivo: 1 evento por membro da equipe, mesmo batch. */
    async launchCollective(input: {
        org_id: string;
        team_id: string;
        rubric_code: string;
        total_amount: number;
        mode: 'equal' | 'per_member';   // equal: rateia total; per_member: total = valor por pessoa
        description: string;
        justification: string;
        reference_date?: string;
        attachment_url?: string | null;
    }): Promise<{ count: number; batch_id: string }> {
        const { data: members, error: mErr } = await supabase
            .from('team_members')
            .select('employee_id')
            .eq('team_id', input.team_id);
        if (mErr) throw mErr;
        const ids = (members || []).map(m => m.employee_id);
        if (ids.length === 0) throw new Error('A equipe não possui membros para receber o incentivo.');

        const { data: team } = await supabase
            .from('labor_teams').select('project_id').eq('id', input.team_id).single();

        const batch_id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
        const perMember = input.mode === 'equal'
            ? Math.round((input.total_amount / ids.length) * 100) / 100
            : input.total_amount;

        for (const employee_id of ids) {
            await this.launchIndividual({
                org_id: input.org_id,
                employee_id,
                rubric_code: input.rubric_code,
                amount: perMember,
                description: input.description,
                justification: input.justification,
                reference_date: input.reference_date,
                project_id: (team as { project_id?: string } | null)?.project_id ?? null,
                attachment_url: input.attachment_url,
                batch_id,
            });
        }
        return { count: ids.length, batch_id };
    },

    async approveEvent(id: string): Promise<void> {
        const uid = await currentUserId();
        const { error } = await supabase
            .from('payroll_events')
            .update({ approval_status: 'APROVADO', approved_by: uid, approved_at: new Date().toISOString(), rejection_reason: null })
            .eq('id', id);
        if (error) throw error;
    },

    async rejectEvent(id: string, reason: string): Promise<void> {
        const uid = await currentUserId();
        const { error } = await supabase
            .from('payroll_events')
            .update({ approval_status: 'REJEITADO', approved_by: uid, approved_at: new Date().toISOString(), rejection_reason: reason })
            .eq('id', id);
        if (error) throw error;
    },

    async approveBatch(batchId: string): Promise<void> {
        const uid = await currentUserId();
        const { error } = await supabase
            .from('payroll_events')
            .update({ approval_status: 'APROVADO', approved_by: uid, approved_at: new Date().toISOString() })
            .eq('incentive_batch_id', batchId)
            .eq('approval_status', 'PENDENTE');
        if (error) throw error;
    },

    async deleteEvent(id: string): Promise<void> {
        await payrollService.deleteEvent(id);
    },

    // ── Guarda de Habitualidade (Sprint 2) ───────────────────
    async computeHabituality(orgId: string, windowMonths = 6, threshold = 3): Promise<HabitualityFlag[]> {
        const since = new Date();
        since.setMonth(since.getMonth() - (windowMonths - 1));
        const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-01`;

        const { data, error } = await supabase
            .from('vw_incentive_event_months')
            .select('*')
            .eq('org_id', orgId)
            .gte('month', sinceStr);
        if (error) throw error;

        const rubrics = await this.listIncentiveRubrics();
        const rubricName = new Map(rubrics.map(r => [r.code, r.name]));

        const empIds = [...new Set((data || []).map((r: Record<string, unknown>) => r.employee_id as string))];
        const nameMap = await this.employeeNames(empIds);

        const grouped = new Map<string, { months: Set<string>; total: number; employee_id: string; rubric_code: string }>();
        for (const row of (data || []) as Record<string, unknown>[]) {
            const key = `${row.employee_id}|${row.rubric_code}`;
            if (!grouped.has(key)) grouped.set(key, { months: new Set(), total: 0, employee_id: row.employee_id as string, rubric_code: row.rubric_code as string });
            const g = grouped.get(key)!;
            g.months.add(String(row.month));
            g.total += Number(row.total_amount || 0);
        }

        const flags: HabitualityFlag[] = [];
        for (const g of grouped.values()) {
            const monthsPaid = g.months.size;
            const avgMonthly = g.total / monthsPaid;
            flags.push({
                employee_id: g.employee_id,
                employee_name: nameMap.get(g.employee_id) || g.employee_id,
                rubric_code: g.rubric_code,
                rubric_name: rubricName.get(g.rubric_code) || g.rubric_code,
                months_paid: monthsPaid,
                window_months: windowMonths,
                avg_monthly_amount: Math.round(avgMonthly * 100) / 100,
                is_habitual: monthsPaid >= threshold,
                estimated_annual_reflexo: Math.round(avgMonthly * 12 * REFLEXO_FACTOR * 100) / 100,
            });
        }
        // habituais primeiro, depois por nº de meses
        return flags.sort((a, b) => Number(b.is_habitual) - Number(a.is_habitual) || b.months_paid - a.months_paid);
    },

    // ── Motor de Regras (Sprint 3) ───────────────────────────
    async listRules(orgId: string): Promise<IncentiveRule[]> {
        const { data, error } = await supabase
            .from('incentive_rules')
            .select('*')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []) as IncentiveRule[];
    },

    async saveRule(rule: IncentiveRule): Promise<IncentiveRule> {
        if (rule.id) {
            const { id, created_at, ...rest } = rule;
            const { data, error } = await supabase.from('incentive_rules').update(rest).eq('id', id).select().single();
            if (error) throw error;
            return data as IncentiveRule;
        }
        const uid = await currentUserId();
        const { data, error } = await supabase.from('incentive_rules').insert({ ...rule, created_by: uid }).select().single();
        if (error) throw error;
        return data as IncentiveRule;
    },

    async toggleRule(id: string, active: boolean): Promise<void> {
        const { error } = await supabase.from('incentive_rules').update({ active }).eq('id', id);
        if (error) throw error;
    },

    async deleteRule(id: string): Promise<void> {
        const { error } = await supabase.from('incentive_rules').delete().eq('id', id);
        if (error) throw error;
    },

    /**
     * Roda as regras ativas para a competência (mês/ano) e PROPÕE eventos PENDENTES.
     * Nunca paga automaticamente — tudo entra no fluxo de aprovação.
     * ASSIDUIDADE e PRODUTIVIDADE leem dados reais (time_entries/productivity_logs);
     * demais tipos aplicam valor fixo ao escopo (equipe/obra/colaboradores ativos).
     */
    async runRules(orgId: string, period: { month: number; year: number }, projectId?: string): Promise<RuleRunResult> {
        const rules = (await this.listRules(orgId)).filter(r => r.active);
        const monthStart = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
        const monthEnd = new Date(period.year, period.month, 0).toISOString().split('T')[0];
        const refDate = monthEnd;

        const result: RuleRunResult = { created: 0, skipped: 0, details: [] };

        // Eventos de incentivo já existentes na competência (evitar duplicar regra)
        const existing = await this.listEvents(orgId, { start: monthStart, end: monthEnd });
        const existsFor = (employeeId: string, rubricCode: string) =>
            existing.some(e => e.employee_id === employeeId && e.rubric_code === rubricCode);

        const employees = await this.activeEmployees(orgId);
        const nameMap = new Map(employees.map(e => [e.id, e.name]));

        for (const rule of rules) {
            const scopeProject = projectId || rule.project_id || null;
            const targets = await this.ruleTargets(orgId, rule, scopeProject);
            const proposals = await this.evaluateRule(orgId, rule, targets, { monthStart, monthEnd }, scopeProject);

            for (const p of proposals) {
                if (p.amount <= 0) { result.skipped++; continue; }
                if (existsFor(p.employee_id, rule.target_rubric_code)) {
                    result.skipped++;
                    result.details.push({ employee_id: p.employee_id, employee_name: nameMap.get(p.employee_id) || p.employee_id, amount: p.amount, reason: 'Já existe lançamento nesta competência' });
                    continue;
                }
                await this.launchIndividual({
                    org_id: orgId,
                    employee_id: p.employee_id,
                    rubric_code: rule.target_rubric_code,
                    amount: p.amount,
                    description: `${rule.name} (auto)`,
                    justification: p.reason,
                    reference_date: refDate,
                    project_id: scopeProject,
                    source_rule_id: rule.id ?? null,
                });
                result.created++;
                result.details.push({ employee_id: p.employee_id, employee_name: nameMap.get(p.employee_id) || p.employee_id, amount: p.amount, reason: p.reason });
            }
        }
        return result;
    },

    // ── Performance (Sprint 4) ───────────────────────────────
    async getPerformance(orgId: string, start: string, end: string): Promise<{ byEmployee: PerformanceRow[]; byProject: PerformanceRow[]; total: number }> {
        const events = (await this.listEvents(orgId, { start, end })).filter(e => e.approval_status === 'APROVADO');

        const empAgg = new Map<string, PerformanceRow>();
        const projIds = new Set<string>();
        for (const e of events) {
            const row = empAgg.get(e.employee_id) || { key: e.employee_id, name: e.employee_name || e.employee_id, total: 0, count: 0 };
            row.total += e.amount; row.count++;
            empAgg.set(e.employee_id, row);
            if (e.project_id) projIds.add(e.project_id);
        }

        const projNames = await this.projectNames([...projIds]);
        const projAgg = new Map<string, PerformanceRow>();
        for (const e of events) {
            const pid = e.project_id || '—';
            const row = projAgg.get(pid) || { key: pid, name: pid === '—' ? 'Sem obra' : (projNames.get(pid) || pid), total: 0, count: 0, employees: 0 };
            row.total += e.amount; row.count++;
            projAgg.set(pid, row);
        }

        const total = events.reduce((s, e) => s + e.amount, 0);
        return {
            byEmployee: [...empAgg.values()].sort((a, b) => b.total - a.total),
            byProject: [...projAgg.values()].sort((a, b) => b.total - a.total),
            total: Math.round(total * 100) / 100,
        };
    },

    /** Simulador: projeta bônus por produção (R$/unidade) numa obra/fase no período. */
    async simulate(input: { project_id: string; rate_per_unit: number; phase?: string; start: string; end: string }): Promise<{ total_qty: number; unit: string; projected_bonus: number; per_employee: { employee_id: string; name: string; qty: number; bonus: number }[] }> {
        let query = supabase
            .from('productivity_logs')
            .select('employee_id, actual_qty, unit, phase, date')
            .eq('project_id', input.project_id)
            .gte('date', input.start)
            .lte('date', input.end);
        if (input.phase) query = query.eq('phase', input.phase);

        const { data, error } = await query;
        if (error) throw error;

        const rows = (data || []) as { employee_id: string | null; actual_qty: number; unit: string }[];
        const unit = rows[0]?.unit || 'un';
        let totalQty = 0;
        const perEmp = new Map<string, number>();
        for (const r of rows) {
            totalQty += Number(r.actual_qty || 0);
            if (r.employee_id) perEmp.set(r.employee_id, (perEmp.get(r.employee_id) || 0) + Number(r.actual_qty || 0));
        }
        const nameMap = await this.employeeNames([...perEmp.keys()]);
        const perEmployee = [...perEmp.entries()].map(([id, qty]) => ({
            employee_id: id,
            name: nameMap.get(id) || id,
            qty: Math.round(qty * 1000) / 1000,
            bonus: Math.round(qty * input.rate_per_unit * 100) / 100,
        })).sort((a, b) => b.bonus - a.bonus);

        return {
            total_qty: Math.round(totalQty * 1000) / 1000,
            unit,
            projected_bonus: Math.round(totalQty * input.rate_per_unit * 100) / 100,
            per_employee: perEmployee,
        };
    },

    // ── Helpers internos ─────────────────────────────────────
    async activeEmployees(orgId: string): Promise<{ id: string; name: string }[]> {
        const { data, error } = await supabase
            .from('employees').select('id, name').eq('org_id', orgId).eq('status', 'ATIVO');
        if (error) throw error;
        return (data || []) as { id: string; name: string }[];
    },

    async employeeNames(ids: string[]): Promise<Map<string, string>> {
        if (ids.length === 0) return new Map();
        const { data } = await supabase.from('employees').select('id, name').in('id', ids);
        return new Map((data || []).map((e: { id: string; name: string }) => [e.id, e.name]));
    },

    async projectNames(ids: string[]): Promise<Map<string, string>> {
        if (ids.length === 0) return new Map();
        const { data } = await supabase.from('projects').select('id, name').in('id', ids);
        return new Map((data || []).map((p: { id: string; name: string }) => [p.id, p.name]));
    },

    /** Resolve os colaboradores-alvo de uma regra conforme o escopo. */
    async ruleTargets(orgId: string, rule: IncentiveRule, projectId: string | null): Promise<string[]> {
        if (rule.scope === 'TEAM') {
            let q = supabase.from('labor_teams').select('id').eq('org_id', orgId).eq('status', 'ATIVA');
            if (projectId) q = q.eq('project_id', projectId);
            const { data: teams } = await q;
            const teamIds = (teams || []).map(t => t.id);
            if (teamIds.length === 0) return [];
            const { data: members } = await supabase.from('team_members').select('employee_id').in('team_id', teamIds);
            return [...new Set((members || []).map(m => m.employee_id))];
        }
        if (rule.scope === 'PROJECT' && projectId) {
            const { data: allocs } = await supabase
                .from('employee_allocations').select('employee_id').eq('project_id', projectId).eq('is_active', true);
            return [...new Set((allocs || []).map(a => a.employee_id))];
        }
        // EMPLOYEE (todos ativos da org)
        return (await this.activeEmployees(orgId)).map(e => e.id);
    },

    /** Avalia uma regra para os alvos, retornando propostas {employee_id, amount, reason}. */
    async evaluateRule(
        orgId: string,
        rule: IncentiveRule,
        targets: string[],
        period: { monthStart: string; monthEnd: string },
        projectId: string | null = null,
    ): Promise<{ employee_id: string; amount: number; reason: string }[]> {
        if (targets.length === 0) return [];
        const cond = rule.condition || {};

        if (rule.rule_type === 'ASSIDUIDADE') {
            const minDays = Number(cond.min_days ?? 22);
            const maxFaltas = Number(cond.max_faltas ?? 0);
            const { data: entries } = await supabase
                .from('time_entries')
                .select('employee_id, date, hours_worked, status')
                .in('employee_id', targets)
                .gte('date', period.monthStart)
                .lte('date', period.monthEnd);

            const presentByEmp = new Map<string, Set<string>>();
            for (const e of (entries || []) as { employee_id: string; date: string; hours_worked: number; status: string }[]) {
                if ((e.hours_worked || 0) <= 0) continue;
                if (e.status && e.status === 'REJEITADO') continue;
                if (!presentByEmp.has(e.employee_id)) presentByEmp.set(e.employee_id, new Set());
                presentByEmp.get(e.employee_id)!.add(e.date);
            }
            return targets.map(id => {
                const present = presentByEmp.get(id)?.size ?? 0;
                const faltas = Math.max(0, minDays - present);
                const ok = present >= minDays && faltas <= maxFaltas;
                return { employee_id: id, amount: ok ? Number(rule.amount || 0) : 0, reason: ok ? `Assiduidade: ${present} dias presentes` : `Não elegível: ${present} dias (mín ${minDays})` };
            }).filter(p => p.amount > 0);
        }

        if (rule.rule_type === 'PRODUTIVIDADE') {
            const minPct = Number(cond.min_productivity_pct ?? 100);
            const ratePerUnit = Number(cond.rate_per_unit ?? 0);
            const { data: logs } = await supabase
                .from('productivity_logs')
                .select('employee_id, actual_qty, productivity_pct, date')
                .in('employee_id', targets)
                .gte('date', period.monthStart)
                .lte('date', period.monthEnd);

            const agg = new Map<string, { qty: number; pctSum: number; n: number }>();
            for (const l of (logs || []) as { employee_id: string | null; actual_qty: number; productivity_pct: number | null }[]) {
                if (!l.employee_id) continue;
                const a = agg.get(l.employee_id) || { qty: 0, pctSum: 0, n: 0 };
                a.qty += Number(l.actual_qty || 0);
                if (l.productivity_pct != null) { a.pctSum += Number(l.productivity_pct); a.n++; }
                agg.set(l.employee_id, a);
            }
            const out: { employee_id: string; amount: number; reason: string }[] = [];
            for (const [id, a] of agg.entries()) {
                const avgPct = a.n > 0 ? a.pctSum / a.n : 0;
                if (avgPct < minPct) continue;
                const amount = ratePerUnit > 0
                    ? Math.round(a.qty * ratePerUnit * 100) / 100
                    : Number(rule.amount || 0);
                if (amount > 0) out.push({ employee_id: id, amount, reason: `Produtividade ${avgPct.toFixed(0)}% • ${a.qty.toFixed(1)} un` });
            }
            return out;
        }

        if (rule.rule_type === 'SEGURANCA') {
            // Prêmio coletivo: ninguém recebe se houve acidente na janela "dias sem acidente".
            const dias = Number(cond.dias_sem_acidente ?? 60);
            const excludeNearMiss = cond.exclude_quase_acidente !== false; // padrão: ignora QUASE_ACIDENTE
            const windowStart = new Date(period.monthEnd);
            windowStart.setDate(windowStart.getDate() - dias);
            const windowStartStr = windowStart.toISOString().split('T')[0];

            let q = supabase
                .from('accidents')
                .select('id, tipo, data_acidente')
                .eq('org_id', orgId)
                .gte('data_acidente', windowStartStr)
                .lte('data_acidente', period.monthEnd);
            if (projectId) q = q.eq('project_id', projectId);
            if (excludeNearMiss) q = q.neq('tipo', 'QUASE_ACIDENTE');

            const { data: accidents } = await q;
            const count = (accidents || []).length;
            if (count > 0) return []; // streak quebrada — sem prêmio

            const fixed = Number(rule.amount || 0);
            if (fixed <= 0) return [];
            return targets.map(id => ({ employee_id: id, amount: fixed, reason: `${dias} dias sem acidente${projectId ? ' (na obra)' : ''}` }));
        }

        // PRAZO / META_OBRA / QUALIDADE / RETENCAO: valor fixo ao escopo (disparo manual)
        const fixed = Number(rule.amount || 0);
        return targets.map(id => ({ employee_id: id, amount: fixed, reason: `${rule.name} (valor fixo)` }));
    },
};
