import { supabase } from '../lib/supabase';
import { projectService } from './projectService';
import { validateAllocationTotal } from '../lib/validators';
import type { ProjectSettings } from '../types';

// Contribuições de Terceiros (taxas parafiscais) — alíquotas incidentes sobre a folha bruta
export interface TerceiroTax { code: string; name: string; rate: number }

export const TERCEIROS_TAXES_DEFAULT: TerceiroTax[] = [
    { code: '1170', name: 'Salário Educação', rate: 0.025 },
    { code: '1176', name: 'INCRA',            rate: 0.002 },
    { code: '1191', name: 'SENAC',            rate: 0.010 },
    { code: '1196', name: 'SESC',             rate: 0.015 },
    { code: '1200', name: 'SEBRAE',           rate: 0.006 },
];

export function getOrgTerceirosTaxes(orgId: string): TerceiroTax[] {
    try {
        const raw = localStorage.getItem(`terceiros_taxes_${orgId}`);
        if (raw) {
            const parsed = JSON.parse(raw) as TerceiroTax[];
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch { /* ignore */ }
    return TERCEIROS_TAXES_DEFAULT.map(t => ({ ...t }));
}

export function saveOrgTerceirosTaxes(orgId: string, taxes: TerceiroTax[]): void {
    localStorage.setItem(`terceiros_taxes_${orgId}`, JSON.stringify(taxes));
}

const TERCEIROS_TAXES = TERCEIROS_TAXES_DEFAULT; // alias interno para uso em getWorksiteCostSummary (usa default)

// ============================================================
// TIPOS DE FOLHA
// ============================================================

export type PayrollStatus = 'RASCUNHO' | 'PROCESSANDO' | 'FECHADO';
export type RubricType = 'provento' | 'desconto' | 'encargo' | 'informativa';
export type CalculationType = 'manual' | 'fixed' | 'percentage' | 'formula';

export interface CalculationConfig {
    amount?: number;
    percentage?: number;
    base?: string;
}

export interface ValidationLog {
    rule: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
    details?: Record<string, unknown>;
}

export interface PayrollRubric {
    code: string;
    name: string;
    type: RubricType;
    incidence_inss: boolean;
    incidence_fgts: boolean;
    incidence_irrf: boolean;
    is_automatic: boolean;
    is_clt_mandatory?: boolean;   // coluna ausente no DB — tratada como false quando undefined
    calculation_type?: CalculationType;
    calculation_config?: CalculationConfig;
    category?: string;
    formula?: string;
    active: boolean;
    lancamento_individualizado?: boolean; // gera parcela separada no financeiro por funcionário
    dia_lancamento?: number;              // dia do mês (1–28) para vencimento do lançamento individual
}

export interface PayrollRun {
    id: string;
    org_id: string;
    start_date: string;
    end_date: string;
    status: string;
    type: 'mensal' | 'ferias' | 'decimo_terceiro' | 'rescisao';
    subtype?: string;
    vacation_start?: string;
    vacation_end?: string;
    termination_reason?: string;
    validation_logs?: ValidationLog[];
    created_at?: string;
}

export interface PayrollItem {
    id?: string;
    payroll_run_id: string;
    employee_id: string;
    code: string;
    type: string;
    amount: number;
    base_amount: number;
    reference?: number | string; // PRD 3.4
    origin?: string;
}

export interface PayrollAuditLog {
    id?: string;
    org_id: string;
    user_email: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    entity_type: 'RUBRIC' | 'EVENT' | 'FISCAL_BRACKET' | 'PAYROLL_RUN';
    entity_id: string;
    old_data?: unknown;
    new_data?: unknown;
    description?: string;
    created_at?: string;
}

// Resultado de folha com join do colaborador
export interface PayrollResultWithEmployee extends PayrollResult {
    employee?: {
        name: string;
        role: string;
        cpf: string;
        base_salary: number;
        hourly_cost: number;
        org_id: string;
    };
}

// Transação interna para tabela internal_transactions
interface InternalTransaction {
    organization_id: string;
    source_system: 'LABOR';
    reference_id: string;
    transaction_date: string;
    amount: number;
    direction: 'DEBIT' | 'CREDIT';
    description: string;
    category: string;
    status: 'PENDING' | 'PAID';
}

// Lançamento financeiro interno a projetos (settings.financialInfo.transactions)
interface ProjectFinancialTx {
    id: string;
    date: string;
    type: string;
    category: string;
    description: string;
    value: number;
    status: string;
    notes?: string;
    costCenter?: string;
    chartOfAccounts?: string;
}

export interface PayrollResult {
    id?: string;
    payroll_run_id: string;
    employee_id: string;
    gross: number;
    discounts: number;
    net: number;
    employer_cost: number;
    base_inss?: number;
    base_fgts?: number;
    base_irrf?: number;
}

export interface Worksite {
    id: string;
    org_id?: string;
    name: string;
}

export interface EmployeeAllocation {
    id: string;
    employee_id: string;
    project_id: string;
    allocation_percent: number;
    reference_period: string; // YYYY-MM
    worksite_name?: string; // join
}

export interface PayrollEvent {
    id?: string;
    org_id: string;
    employee_id: string;
    payroll_run_id: string | null;
    code?: string; // Legado/Curto (ex: BONUS)
    rubric_code?: string; // Oficial (ex: rubrics.code)
    type: RubricType;
    amount: number;
    description: string;
    reference_date: string; // Coluna real no banco: reference_date
    date?: string; // Para compatibilidade no frontend
    is_recurring?: boolean;
    origin?: string;
    unit?: 'days' | 'hours' | 'fixed';
    quantity?: number;
}

export interface FiscalRange {
    id: string;
    type: 'INSS' | 'IRRF';
    year: number;
    min_value: number;
    max_value?: number;
    rate: number;
    deduction: number;
}

// ============================================================
// SERVIÇO DE APOIO
// ============================================================

export const payrollService = {
    // --- Ciclos de Folha ---
    async listRuns(orgId?: string, type?: string, startDate?: string, endDate?: string) {
        let query = supabase
            .from('payroll_runs')
            .select('*');
            
        if (orgId && orgId !== 'all' && orgId !== '') {
            query = query.eq('org_id', orgId);
        }
            
        if (type && type !== 'all') query = query.eq('type', type);

        if (startDate) {
            query = query.gte('start_date', startDate);
        }

        if (endDate) {
            query = query.lte('end_date', endDate);
        }
        
        const { data, error } = await query.order('start_date', { ascending: false });

        if (error) throw error;
        return data as PayrollRun[];
    },

    async getRun(id: string) {
        const { data, error } = await supabase
            .from('payroll_runs')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data as PayrollRun;
    },

    async createRun(run: Omit<PayrollRun, 'id' | 'created_at'>) {
        const { data, error } = await supabase
            .from('payroll_runs')
            .insert({
                ...run,
                status: run.status || 'RASCUNHO'
            })
            .select()
            .single();

        if (error) throw error;
        return data as PayrollRun;
    },

    async updateRunStatus(id: string, status: string) {
        try {
            // Atualização simples de status para garantir compatibilidade com o schema
            const { error } = await supabase
                .from('payroll_runs')
                .update({ status })
                .eq('id', id);
                
            if (error) {
                console.error('[payrollService] Erro ao atualizar status da folha:', error);
            }
        } catch (err) {
            console.error('[payrollService] Falha crítica em updateRunStatus:', err);
        }
    },

    async deleteRun(id: string) {
        // Limpeza em paralelo (ambas as colunas v1/v2 para compatibilidade)
        await Promise.all([
            supabase.from('payroll_items').delete().eq('payroll_run_id', id),
            supabase.from('payroll_items').delete().eq('run_id', id),
            supabase.from('payroll_results').delete().eq('payroll_run_id', id),
            supabase.from('payroll_results').delete().eq('run_id', id),
            supabase.from('payroll_events').delete().eq('payroll_run_id', id),
        ]);

        const { error } = await supabase.from('payroll_runs').delete().eq('id', id);
        if (error) throw error;
    },

    async duplicateRun(id: string) {
        // 1. Obter a folha original
        const original = await this.getRun(id);

        // 2. Criar nova folha (como rascunho)
        const { id: oldId, created_at, ...rest } = original as PayrollRun;
        const newRun = await this.createRun({
            ...rest,
            status: 'RASCUNHO'
        });

        // 3. Duplicar eventos manuais vinculados
        const events = await this.listEvents(original.org_id, id);
        if (events.length > 0) {
            const newEvents = events.map(({ id: _, ...e }) => ({
                ...e,
                payroll_run_id: newRun.id
            }));
            await supabase.from('payroll_events').insert(newEvents);
        }

        return newRun;
    },

    // --- Rubricas ---
    async listRubrics(includeInactive: boolean = false) {
        let query = supabase
            .from('rubrics')
            .select('*')
            .order('code');
            
        if (!includeInactive) {
            query = query.eq('active', true);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as PayrollRubric[];
    },

    async getRubric(code: string) {
        const { data, error } = await supabase
            .from('rubrics')
            .select('*')
            .eq('code', code)
            .single();

        if (error) throw error;
        return data as PayrollRubric;
    },

    async createRubric(rubric: PayrollRubric) {
        const { data, error } = await supabase
            .from('rubrics')
            .insert(rubric)
            .select()
            .single();
        if (error) throw error;

        await this.logAction({
            org_id: 'SYSTEM',
            action: 'CREATE',
            entity_type: 'RUBRIC',
            entity_id: rubric.code,
            new_data: rubric,
            description: `Rubrica ${rubric.code} criada.`
        });
        
        return data as PayrollRubric;
    },

    async updateRubric(code: string, rubric: Partial<PayrollRubric>) {
        const { data: oldData } = await supabase.from('rubrics').select('*').eq('code', code).single();

        const { data, error } = await supabase
            .from('rubrics')
            .update(rubric)
            .eq('code', code)
            .select()
            .single();
        if (error) throw error;

        await this.logAction({
            org_id: 'SYSTEM',
            action: 'UPDATE',
            entity_type: 'RUBRIC',
            entity_id: code,
            old_data: oldData,
            new_data: rubric,
            description: `Rubrica ${code} atualizada.`
        });
        
        return data as PayrollRubric;
    },

    async getEmployeeRecurringRubrics(employeeId: string): Promise<string[]> {
        const { data, error } = await supabase
            .from('employee_automatic_rubrics')
            .select('rubric_code')
            .eq('employee_id', employeeId);
        
        if (error) throw error;
        return (data || []).map(r => r.rubric_code);
    },

    async updateEmployeeRecurringRubrics(employeeId: string, rubricCodes: string[], orgId: string): Promise<void> {
        if (!employeeId) throw new Error('ID do colaborador é obrigatório para vincular rubricas.');

        // RPC atômica: DELETE + INSERT em uma transação — evita colaborador sem rubricas
        const { error } = await supabase.rpc('update_employee_rubrics', {
            p_employee_id: employeeId,
            p_rubric_codes: rubricCodes,
            p_org_id: orgId,
        });

        if (error) throw error;
    },

    async deleteRubric(code: string) {
        // Regra de segurança: Não permitimos deletar se houver uso (PRD 16.1)
        const used = await this.isRubricUsed(code);
        if (used) throw new Error('Não é possível excluir esta rubrica pois ela já possui lançamentos vinculados (Folhas ou Eventos).');

        const { data: oldData } = await supabase.from('rubrics').select('*').eq('code', code).single();

        const { error } = await supabase
            .from('rubrics')
            .delete()
            .eq('code', code);
        if (error) throw error;

        await this.logAction({
            org_id: 'SYSTEM',
            action: 'DELETE',
            entity_type: 'RUBRIC',
            entity_id: code,
            old_data: oldData,
            description: `Rubrica ${code} excluída.`
        });
    },

    async isRubricUsed(code: string): Promise<boolean> {
        // Verificar uso em itens de folha (payroll_items)
        // Nota: No banco payroll_items.rubric_id é UUID. No PRD rubric.code é string.
        // Precisamos primeiro pegar o ID da rubrica.
        const rubric = await this.getRubric(code);
        if (!rubric) return false;

        const [items, events] = await Promise.all([
            supabase.from('payroll_items').select('id', { count: 'exact', head: true }).eq('code', code),
            supabase.from('payroll_events').select('id', { count: 'exact', head: true }).eq('rubric_code', code)
        ]);

        return (items.count || 0) > 0 || (events.count || 0) > 0;
    },

    // --- Tabelas Fiscais ---
    async listFiscalRanges(year: number = 2024) {
        const { data, error } = await supabase
            .from('payroll_fiscal_ranges')
            .select('*')
            .eq('year', year)
            .order('min_value');

        if (error) throw error;
        return data as FiscalRange[];
    },

    // --- Totais por ciclo (para listagem) ---
    async getRunsTotals(runIds: string[]): Promise<Record<string, number>> {
        if (runIds.length === 0) return {};
        const { data, error } = await supabase
            .from('payroll_results')
            .select('payroll_run_id, employer_cost')
            .in('payroll_run_id', runIds);
        if (error) throw error;
        const totals: Record<string, number> = {};
        for (const row of (data || [])) {
            totals[row.payroll_run_id] = (totals[row.payroll_run_id] || 0) + (row.employer_cost || 0);
        }
        return totals;
    },

    // --- Resultados e Itens ---
    async listResultsByRun(runId: string) {
        const { data, error } = await supabase
            .from('payroll_results')
            .select(`
                *,
                employee:employee_id(name, role, cpf, base_salary, hourly_cost, org_id)
            `)
            .eq('payroll_run_id', runId)
            .order('employee_id');

        if (error) throw error;
        return data as PayrollResultWithEmployee[];
    },

    async getPayrollResult(runId: string, employeeId: string) {
        const { data, error } = await supabase
            .from('payroll_results')
            .select(`
                *,
                employee:employee_id(*)
            `)
            .eq('payroll_run_id', runId)
            .eq('employee_id', employeeId)
            .single();

        if (error) throw error;
        return data as PayrollResultWithEmployee;
    },

    async getEmployeeItems(runId: string, employeeId: string) {
        // Tenta buscar por payroll_run_id (V2)
        const { data: v2, error: e2 } = await supabase
            .from('payroll_items')
            .select('*')
            .eq('payroll_run_id', runId)
            .eq('employee_id', employeeId);

        if (!e2 && v2 && v2.length > 0) return v2;

        // Fallback para run_id (V1)
        const { data: v1, error: e1 } = await supabase
            .from('payroll_items')
            .select('*')
            .eq('run_id', runId)
            .eq('employee_id', employeeId);

        if (e1 && e2) throw e2; // Se os dois derem erro de coluna
        return v1 || [];
    },

    async getFirstDecimoPaidAmount(employeeId: string, year: number): Promise<number | null> {
        const { data } = await supabase
            .from('payroll_items')
            .select('amount, payroll_runs!inner(type, subtype, start_date)')
            .eq('employee_id', employeeId)
            .eq('code', 'DECIMO')
            .gte('payroll_runs.start_date', `${year}-01-01`)
            .lt('payroll_runs.start_date', `${year + 1}-01-01`)
            .in('payroll_runs.subtype', ['1_parcela', '1'])
            .limit(1)
            .maybeSingle();
        return (data as { amount: number } | null)?.amount ?? null;
    },

    async savePayrollData(
        runId: string,
        employee_id: string,
        items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[],
        result: Omit<PayrollResult, 'payroll_run_id' | 'employee_id'>,
    ) {
        // 1. Limpar itens anteriores (Usa APENAS a coluna válida no seu banco)
        const { error: delError } = await supabase
            .from('payroll_items')
            .delete()
            .eq('payroll_run_id', runId)
            .eq('employee_id', employee_id);

        if (delError) throw delError;

        // 2. Inserir itens
        const itemsToInsert = items.map((item) => ({
            payroll_run_id: runId,
            employee_id: employee_id,
            code: item.code,
            type: String(item.type || 'provento').toLowerCase(),
            amount: Math.round((item.amount || 0) * 100) / 100,
            base_amount: Math.round((item.base_amount || 0) * 100) / 100,
            reference: item.reference || null
        }));

        const { error: itemsError } = await supabase
            .from('payroll_items')
            .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        // 3. Atualizar/Inserir resultado (Incluindo bases de cálculo após abatimentos)
        const resultToUpsert = {
            payroll_run_id: runId,
            employee_id: employee_id,
            gross: Math.round((result.gross || 0) * 100) / 100,
            discounts: Math.round((result.discounts || 0) * 100) / 100,
            net: Math.round((result.net || 0) * 100) / 100,
            employer_cost: Math.round((result.employer_cost || 0) * 100) / 100,
            base_inss: result.base_inss ?? result.gross,
            base_fgts: result.base_fgts ?? result.gross,
            base_irrf: result.base_irrf ?? result.gross
        };

        const { error: resError } = await supabase
            .from('payroll_results')
            .upsert(resultToUpsert, { onConflict: 'payroll_run_id,employee_id' });

        if (resError) throw resError;
    },

    // --- Obras e Alocações ---

    async listAllocations(employeeId: string, period?: string): Promise<EmployeeAllocation[]> {
        const currentPeriod = period || new Date().toISOString().slice(0, 7);
        
        const { data, error } = await supabase
            .from('employee_allocations')
            .select('*, worksite:project_id(name)')
            .eq('employee_id', employeeId)
            .eq('reference_period', currentPeriod);
        
        if (error) throw error;
        return (data || []).map((a: EmployeeAllocation & { worksite?: { name: string } }) => ({
            ...a,
            worksite_name: a.worksite?.name
        })) as EmployeeAllocation[];
    },

    async saveAllocations(employeeId: string, period: string, allocations: Omit<EmployeeAllocation, 'id' | 'created_at' | 'reference_period'>[]) {
        const { valid, total } = validateAllocationTotal(allocations);
        if (!valid) throw new Error(`Alocação total (${total.toFixed(1)}%) ultrapassa 100%. Corrija antes de salvar.`);

        // RPC atômica: DELETE + INSERT em uma transação — evita estado inconsistente
        const { error } = await supabase.rpc('upsert_employee_allocations', {
            p_employee_id: employeeId,
            p_period: period,
            p_allocations: JSON.stringify(allocations.map(a => ({
                project_id: a.project_id,
                allocation_percent: a.allocation_percent,
            }))),
        });

        if (error) throw error;
    },

    async listWorksites(orgId?: string): Promise<Worksite[]> {
        // Usar o projectService centralizado com includeOrphans=true 
        // para garantir a mesma visibilidade do restante do sistema.
        const data = await projectService.listProjects(undefined, orgId, true);
        return (data || []).map(p => ({ id: p.id, name: p.name }));
    },

    async listEvents(orgId: string, runId?: string) {
        let query = supabase.from('payroll_events').select('*');
        if (orgId && orgId !== 'all') query = query.eq('org_id', orgId);
        if (runId) query = query.eq('payroll_run_id', runId);
        
        const { data, error } = await query;
        if (error) throw error;
        return data as PayrollEvent[];
    },

    async listEventsByPeriod(employeeId: string, start: string, end: string, currentRunId?: string) {
        let query = supabase
            .from('payroll_events')
            .select('*')
            .eq('employee_id', employeeId)
            .gte('reference_date', start)
            .lte('reference_date', end);

        if (currentRunId) {
            query = query.or(`payroll_run_id.is.null,payroll_run_id.eq.${currentRunId}`);
        } else {
            query = query.is('payroll_run_id', null);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as PayrollEvent[];
    },

    async saveEvent(event: Omit<PayrollEvent, 'id'>) {
        // Mapeamento para garantir compatibilidade com o banco de dados
        const dbEvent = {
            org_id: event.org_id,
            employee_id: event.employee_id,
            payroll_run_id: event.payroll_run_id,
            code: event.code || event.rubric_code, // Usa rubric_code como fallback para 'code'
            rubric_code: event.rubric_code,
            type: event.type,
            amount: event.amount,
            description: event.description,
            reference_date: event.reference_date || event.date || new Date().toISOString().split('T')[0],
            is_recurring: event.is_recurring || false,
            origin: event.origin || 'manual',
            unit: event.unit || 'fixed',
            quantity: event.quantity || 0
        };

        const { data, error } = await supabase
            .from('payroll_events')
            .insert(dbEvent)
            .select()
            .single();
        if (error) throw error;
        return data as PayrollEvent;
    },

    async deleteEvent(id: string) {
        const { error } = await supabase.from('payroll_events').delete().eq('id', id);
        if (error) throw error;
    },

    async updateEvent(id: string, event: Partial<PayrollEvent>) {
        const { data: oldData } = await supabase.from('payroll_events').select('*').eq('id', id).single();

        const { data, error } = await supabase
            .from('payroll_events')
            .update(event)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;

        if (data) {
            await this.logAction({
                org_id: data.org_id,
                action: 'UPDATE',
                entity_type: 'EVENT',
                entity_id: id,
                old_data: oldData,
                new_data: event,
                description: `Evento de folha atualizado para colaborador ID: ${data.employee_id}`
            });
        }
        return data as PayrollEvent;
    },

    async getWorksiteCostSummary(runId: string) {
        // 1. Obter detalhes da folha para saber o período
        const run = await this.getRun(runId);
        const period = run.start_date.slice(0, 7);

        // 2. Obter todos os resultados da folha + nomes dos colaboradores
        const results = await this.listResultsByRun(runId);
        const empIds = results.map(r => r.employee_id).filter(Boolean);
        const { data: empRows } = await supabase.from('employees').select('id, name').in('id', empIds);
        const empNameMap: Record<string, string> = Object.fromEntries((empRows || []).map((e: { id: string; name: string }) => [e.id, e.name]));

        // 3. Carregar TODAS as alocações do período em uma única query (resolve N+1)
        const { data: allocRows } = await supabase
            .from('employee_allocations')
            .select('*, worksite:project_id(name)')
            .in('employee_id', empIds)
            .eq('reference_period', period);

        const allocByEmployee: Record<string, EmployeeAllocation[]> = {};
        (allocRows || []).forEach((a: EmployeeAllocation & { worksite?: { name: string } }) => {
            if (!allocByEmployee[a.employee_id]) allocByEmployee[a.employee_id] = [];
            allocByEmployee[a.employee_id].push({ ...a, worksite_name: a.worksite?.name });
        });

        const summary: Record<string, { id: string, name: string, cost: number, netSalary: number, encargos: number, gross: number, contribuicoes: number, employees: string[] }> = {};
        let unallocatedCost = 0;
        let unallocatedNetSalary = 0;
        let unallocatedEncargos = 0;
        let unallocatedGross = 0;
        let unallocatedContribuicoes = 0;

        for (const res of results) {
            const allocations = allocByEmployee[res.employee_id] ?? [];
            const employerCost = res.employer_cost || 0;
            const netSalary = res.net || 0;
            const grossSalary = res.gross || 0;
            const encargos = Math.max(0, employerCost - netSalary);
            const contribuicoes = Math.round(grossSalary * 0.058 * 100) / 100;
            const empName = empNameMap[res.employee_id] || '';

            if (allocations.length === 0) {
                unallocatedCost += employerCost;
                unallocatedNetSalary += netSalary;
                unallocatedEncargos += encargos;
                unallocatedGross += grossSalary;
                unallocatedContribuicoes += contribuicoes;
                continue;
            }

            let allocatedToWorksites = 0;
            for (const alloc of allocations) {
                const worksiteId = alloc.project_id;
                const worksiteName = alloc.worksite_name || 'Obra Desconhecida';
                const pct = alloc.allocation_percent / 100;

                if (!summary[worksiteId]) summary[worksiteId] = { id: worksiteId, name: worksiteName, cost: 0, netSalary: 0, encargos: 0, gross: 0, contribuicoes: 0, employees: [] };
                summary[worksiteId].cost += employerCost * pct;
                summary[worksiteId].netSalary += netSalary * pct;
                summary[worksiteId].encargos += encargos * pct;
                summary[worksiteId].gross += grossSalary * pct;
                summary[worksiteId].contribuicoes += contribuicoes * pct;
                if (empName && !summary[worksiteId].employees.includes(empName)) {
                    summary[worksiteId].employees.push(empName);
                }
                allocatedToWorksites += alloc.allocation_percent;
            }

            if (allocatedToWorksites < 100) {
                const unallocPct = (100 - allocatedToWorksites) / 100;
                unallocatedCost += employerCost * unallocPct;
                unallocatedNetSalary += netSalary * unallocPct;
                unallocatedEncargos += encargos * unallocPct;
                unallocatedGross += grossSalary * unallocPct;
                unallocatedContribuicoes += contribuicoes * unallocPct;
            }
        }

        return {
            byWorksite: Object.values(summary),
            unallocated: unallocatedCost,
            unallocatedNetSalary,
            unallocatedEncargos,
            unallocatedGross,
            unallocatedContribuicoes,
            total: results.reduce((s: number, r: PayrollResultWithEmployee) => s + (r.employer_cost || 0), 0)
        };
    },

    async syncPayrollToFinance(runId: string) {
        console.log(`[PAYROLL-SYNC] Iniciando sincronização da folha ${runId} com financeiro`);

        // 1. Obter detalhes da folha
        const run = await this.getRun(runId);
        const period = run.start_date.slice(0, 7); // YYYY-MM
        const [year, month] = period.split('-');
        const formattedPeriod = `${month}/${year}`;

        // 2. Obter resumo de custos por obra
        const summary = await this.getWorksiteCostSummary(runId);
        const orgTerceirosTaxes = getOrgTerceirosTaxes(run.org_id);
        console.log(`[PAYROLL-SYNC] Resumo: ${summary.byWorksite.length} obras, custo total=${summary.total}`);

        // 2.1 Limpeza global: remove TODOS os lançamentos antigos desta folha em TODOS os projetos
        // (cobre casos de mudança de alocação onde o projeto antigo não recebe o cleanup padrão)
        const laborPrefix = `labor-${runId}-`;
        try {
            const { data: allProjects } = await supabase
                .from('projects')
                .select('id, settings')
                .filter('settings->>organizationId', 'eq', run.org_id);
            if (allProjects && allProjects.length > 0) {
                for (const proj of allProjects) {
                    const settings = proj.settings as ProjectSettings;
                    const info = settings?.financialInfo;
                    if (!info?.transactions?.length) continue;
                    const cleaned = (info.transactions as ProjectFinancialTx[]).filter(t => !String(t.id || '').startsWith(laborPrefix));
                    if (cleaned.length < info.transactions.length) {
                        await supabase
                            .from('projects')
                            .update({ settings: { ...settings, financialInfo: { ...info, transactions: cleaned } } })
                            .eq('id', proj.id);
                        console.log(`[PAYROLL-SYNC] Limpeza: removidas ${info.transactions.length - cleaned.length} entradas antigas do projeto ${proj.id}`);
                    }
                }
            }
            // Limpa também internal_transactions para esta folha
            await supabase
                .from('internal_transactions')
                .delete()
                .eq('organization_id', run.org_id)
                .eq('source_system', 'LABOR')
                .like('reference_id', `${laborPrefix}%`);
            console.log(`[PAYROLL-SYNC] Limpeza global concluída`);
        } catch (cleanErr: unknown) {
            const msg = cleanErr instanceof Error ? cleanErr.message : String(cleanErr);
            console.warn(`[PAYROLL-SYNC] Aviso na limpeza global: ${msg}`);
        }

        // Helper: busca itens de payroll com fallback V1(run_id) → V2(payroll_run_id)
        const fetchPayrollItems = async (selectFields: string, codes: string[]): Promise<PayrollItem[]> => {
            const { data: v2, error: e2 } = await supabase
                .from('payroll_items')
                .select(selectFields)
                .eq('payroll_run_id', runId)
                .in('code', codes);
            if (!e2 && v2 && v2.length > 0) return v2 as unknown as PayrollItem[];
            const { data: v1 } = await supabase
                .from('payroll_items')
                .select(selectFields)
                .eq('run_id', runId)
                .in('code', codes);
            return (v1 || []) as unknown as PayrollItem[];
        };

        // Buscar rubricas com lançamento individualizado (filtro server-side)
        const { data: rubricasIndivRaw } = await supabase
            .from('rubrics')
            .select('code, name, dia_lancamento')
            .eq('lancamento_individualizado', true);
        const rubricasIndiv = (rubricasIndivRaw || []) as Array<{ code: string; name: string; dia_lancamento: number | null }>;
        console.log(`[PAYROLL-SYNC] Rubricas individualizadas: ${rubricasIndiv.map(r => r.code).join(', ') || 'nenhuma'}`);

        const internalTxs: InternalTransaction[] = [];
        const errors: string[] = [];

        // Acumuladores de dedução — preenchidos no passo 4 e consumidos no passo 3
        const deductionByWorksite: Record<string, number> = {};
        let deductionUnallocated = 0;

        // 4. Lançamentos individualizados (roda PRIMEIRO para acumular deduções)
        if (rubricasIndiv.length > 0) {
            const indivItems = await fetchPayrollItems('employee_id, code, amount', rubricasIndiv.map(r => r.code));
            console.log(`[PAYROLL-SYNC] Itens individualizados encontrados: ${indivItems.length}`);

            if (indivItems.length > 0) {
                const empIds = [...new Set(indivItems.map(i => i.employee_id))];
                const { data: empRows } = await supabase
                    .from('employees')
                    .select('id, name')
                    .in('id', empIds as string[]);
                const empMap: Record<string, string> = Object.fromEntries(
                    (empRows || []).map((e: { id: string; name: string }) => [e.id, e.name])
                );

                const [runYear, runMonth] = run.start_date.slice(0, 7).split('-');

                for (const item of indivItems) {
                    const rubric = rubricasIndiv.find(r => r.code === item.code);
                    const absAmount = Math.abs(item.amount || 0);
                    if (!rubric || absAmount <= 0) continue;

                    const txDate = rubric.dia_lancamento
                        ? `${runYear}-${runMonth}-${String(rubric.dia_lancamento).padStart(2, '0')}`
                        : run.end_date;
                    const empName = empMap[item.employee_id] || item.employee_id;
                    const empAllocations = await this.listAllocations(item.employee_id, period);

                    if (empAllocations.length > 0) {
                        for (const alloc of empAllocations) {
                            if ((alloc.allocation_percent || 0) <= 0) continue;
                            const allocAmount = Math.round((absAmount * (alloc.allocation_percent / 100)) * 100) / 100;
                            if (allocAmount <= 0) continue;

                            // Acumula dedução para ser usada no passo 3
                            deductionByWorksite[alloc.project_id] = (deductionByWorksite[alloc.project_id] || 0) + allocAmount;

                            const refId = `labor-${runId}-indiv-${item.code}-${item.employee_id}-${alloc.project_id}`;
                            const worksiteName = alloc.worksite_name || '';
                            const description = worksiteName
                                ? `${rubric.name} - ${empName} - ${worksiteName} - Folha ${formattedPeriod}`
                                : `${rubric.name} - ${empName} - Folha ${formattedPeriod}`;

                            try {
                                const project = await projectService.loadProject(alloc.project_id);
                                if (project) {
                                    const settings = project.settings as ProjectSettings;
                                    const info = settings.financialInfo || { totalValue: 0, paymentMethod: 'Variavel', installments: [], transactions: [] };
                                    const filtered = (info.transactions as ProjectFinancialTx[] || []).filter(t => t.id !== refId);
                                    await projectService.saveProject({
                                        ...project,
                                        settings: {
                                            ...settings,
                                            financialInfo: {
                                                ...info,
                                                transactions: [{
                                                    id: refId,
                                                    date: txDate,
                                                    type: 'EXPENSE',
                                                    category: 'Folha de Pagamento',
                                                    description,
                                                    value: allocAmount,
                                                    status: 'PENDING',
                                                    notes: `Parcela individualizada — ${rubric.name}. Folha ID: ${runId}`
                                                }, ...filtered]
                                            }
                                        }
                                    });
                                }
                            } catch (projErr: unknown) {
                                const errMsg = projErr instanceof Error ? projErr.message : String(projErr);
                                const msg = `Erro ao salvar ${rubric.name} em ${alloc.project_id}: ${errMsg}`;
                                console.error(`[PAYROLL-SYNC] ${msg}`);
                                errors.push(msg);
                            }

                            internalTxs.push({
                                organization_id:  run.org_id,
                                source_system:    'LABOR',
                                reference_id:     refId,
                                transaction_date: txDate,
                                amount:           allocAmount,
                                direction:        'DEBIT',
                                description,
                                category:         rubric.name,
                                status:           'PENDING'
                            });
                        }
                    } else {
                        // Sem alocação — acumula como não-alocado
                        deductionUnallocated += absAmount;
                        const refId = `labor-${runId}-indiv-${item.code}-${item.employee_id}`;
                        internalTxs.push({
                            organization_id:  run.org_id,
                            source_system:    'LABOR',
                            reference_id:     refId,
                            transaction_date: txDate,
                            amount:           absAmount,
                            direction:        'DEBIT',
                            description:      `${rubric.name} - ${empName} (Não Alocado) - Folha ${formattedPeriod}`,
                            category:         rubric.name,
                            status:           'PENDING'
                        });
                    }
                }
            }
        }

        console.log('[PAYROLL-SYNC] Deduções acumuladas por obra:', deductionByWorksite, '| Não alocado:', deductionUnallocated);

        // 3. Processar custos por obra — gera três lançamentos separados: salário, encargos e contribuições de terceiros
        for (const worksite of summary.byWorksite) {
            const deduction = deductionByWorksite[worksite.id] || 0;
            // Deduções (ex: adiantamentos) saem do salário líquido
            const netSalaryCost     = Math.max(0, Math.round((worksite.netSalary - deduction) * 100) / 100);
            const encargosCost      = Math.max(0, Math.round(worksite.encargos * 100) / 100);
            const contribuicoesCost = Math.max(0, Math.round(worksite.contribuicoes * 100) / 100);
            console.log(`[PAYROLL-SYNC] Obra ${worksite.name}: salário=${netSalaryCost}, encargos=${encargosCost}, contribuições=${contribuicoesCost}, dedução=${deduction}`);
            if (netSalaryCost <= 0 && encargosCost <= 0 && contribuicoesCost <= 0) continue;

            try {
                const project = await projectService.loadProject(worksite.id);
                if (!project) {
                    console.warn(`[PAYROLL-SYNC] Projeto ${worksite.id} não encontrado`);
                    continue;
                }

                const settings = project.settings as ProjectSettings;
                const info = settings.financialInfo || { totalValue: 0, paymentMethod: 'Variavel', installments: [], transactions: [] };
                const empLabel = worksite.employees?.length ? worksite.employees.join(', ') : '';

                const refIdSalario  = `labor-${runId}-${worksite.id}-salario`;
                const refIdEncargos = `labor-${runId}-${worksite.id}-encargos`;
                const oldRefId      = `labor-${runId}-${worksite.id}`; // referência legada (entrada única)

                // Remove entradas anteriores desta folha para esta obra (entrada única legada + separadas)
                const worksitePrefix = `labor-${runId}-${worksite.id}-`;
                const filteredTransactions = (info.transactions as ProjectFinancialTx[] || []).filter(t =>
                    t.id !== oldRefId && !String(t.id || '').startsWith(worksitePrefix)
                );

                const newTransactions: ProjectFinancialTx[] = [];
                if (netSalaryCost > 0) {
                    const descSalario = empLabel
                        ? `Salários - ${empLabel} - ${worksite.name} - Folha ${formattedPeriod}`
                        : `Salários - ${worksite.name} - Folha ${formattedPeriod}`;
                    newTransactions.push({
                        id: refIdSalario,
                        date: run.end_date,
                        type: 'EXPENSE',
                        category: 'Folha de Pagamento',
                        description: descSalario,
                        value: netSalaryCost,
                        status: 'PENDING',
                        notes: `Salário líquido dos colaboradores. Folha ID: ${runId}`
                    });
                    internalTxs.push({
                        organization_id: run.org_id,
                        source_system: 'LABOR',
                        reference_id: refIdSalario,
                        transaction_date: run.end_date,
                        amount: netSalaryCost,
                        direction: 'DEBIT',
                        description: descSalario,
                        category: 'Folha de Pagamento',
                        status: 'PENDING'
                    });
                }
                if (encargosCost > 0) {
                    const descEncargos = `Encargos Patronais - ${worksite.name} - Folha ${formattedPeriod}`;
                    newTransactions.push({
                        id: refIdEncargos,
                        date: run.end_date,
                        type: 'EXPENSE',
                        category: 'Encargos Patronais',
                        description: descEncargos,
                        value: encargosCost,
                        status: 'PENDING',
                        notes: `Encargos patronais (FGTS e demais). Folha ID: ${runId}`
                    });
                    internalTxs.push({
                        organization_id: run.org_id,
                        source_system: 'LABOR',
                        reference_id: refIdEncargos,
                        transaction_date: run.end_date,
                        amount: encargosCost,
                        direction: 'DEBIT',
                        description: descEncargos,
                        category: 'Encargos Patronais',
                        status: 'PENDING'
                    });
                }
                for (const tax of orgTerceirosTaxes) {
                    const taxCost = Math.max(0, Math.round(worksite.gross * tax.rate * 100) / 100);
                    if (taxCost <= 0) continue;
                    const refIdTax = `labor-${runId}-${worksite.id}-terceiros-${tax.code}`;
                    const descTax = `${tax.name} (${(tax.rate * 100).toFixed(1)}%) - ${worksite.name} - Folha ${formattedPeriod}`;
                    newTransactions.push({
                        id: refIdTax,
                        date: run.end_date,
                        type: 'EXPENSE',
                        category: 'Contribuições de Terceiros',
                        description: descTax,
                        value: taxCost,
                        status: 'PENDING',
                        notes: `Contribuição de terceiros — código ${tax.code}. Folha ID: ${runId}`
                    });
                    internalTxs.push({
                        organization_id: run.org_id,
                        source_system: 'LABOR',
                        reference_id: refIdTax,
                        transaction_date: run.end_date,
                        amount: taxCost,
                        direction: 'DEBIT',
                        description: descTax,
                        category: 'Contribuições de Terceiros',
                        status: 'PENDING'
                    });
                }

                await projectService.saveProject({
                    ...project,
                    settings: {
                        ...settings,
                        financialInfo: {
                            ...info,
                            transactions: [...newTransactions, ...filteredTransactions]
                        }
                    }
                });
                console.log(`[PAYROLL-SYNC] Obra ${worksite.name}: salário=${netSalaryCost} | encargos=${encargosCost} | contribuições=${contribuicoesCost}`);
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                const msg = `Erro ao sincronizar obra ${worksite.name}: ${errMsg}`;
                console.error(`[PAYROLL-SYNC] ${msg}`);
                errors.push(msg);
            }
        }

        // 3.b. Custos não alocados — separados em salário, encargos e contribuições individuais
        const netSalarioUnallocated  = Math.max(0, Math.round((summary.unallocatedNetSalary - deductionUnallocated) * 100) / 100);
        const netEncargosUnallocated = Math.max(0, Math.round(summary.unallocatedEncargos * 100) / 100);
        const unallocatedGross       = summary.unallocatedGross || 0;

        if (netSalarioUnallocated > 0) {
            internalTxs.push({
                organization_id: run.org_id,
                source_system: 'LABOR',
                reference_id: `labor-${runId}-unallocated-salario`,
                transaction_date: run.end_date,
                amount: netSalarioUnallocated,
                direction: 'DEBIT',
                description: `Salários - Custo Administrativo (Não Alocado) - Folha ${formattedPeriod}`,
                category: 'Folha de Pagamento',
                status: 'PENDING'
            });
        }
        if (netEncargosUnallocated > 0) {
            internalTxs.push({
                organization_id: run.org_id,
                source_system: 'LABOR',
                reference_id: `labor-${runId}-unallocated-encargos`,
                transaction_date: run.end_date,
                amount: netEncargosUnallocated,
                direction: 'DEBIT',
                description: `Encargos Patronais - Custo Administrativo (Não Alocado) - Folha ${formattedPeriod}`,
                category: 'Encargos Patronais',
                status: 'PENDING'
            });
        }
        for (const tax of orgTerceirosTaxes) {
            const taxCostUnalloc = Math.max(0, Math.round(unallocatedGross * tax.rate * 100) / 100);
            if (taxCostUnalloc <= 0) continue;
            internalTxs.push({
                organization_id: run.org_id,
                source_system: 'LABOR',
                reference_id: `labor-${runId}-unallocated-terceiros-${tax.code}`,
                transaction_date: run.end_date,
                amount: taxCostUnalloc,
                direction: 'DEBIT',
                description: `${tax.name} (${(tax.rate * 100).toFixed(1)}%) - Custo Adm. (Não Alocado) - Folha ${formattedPeriod}`,
                category: 'Contribuições de Terceiros',
                status: 'PENDING'
            });
        }

        // 5. Upsert na tabela centralizada internal_transactions
        if (internalTxs.length > 0) {
            const { error } = await supabase
                .from('internal_transactions')
                .upsert(internalTxs, { onConflict: 'organization_id,reference_id' });
            if (error) {
                console.error('[PAYROLL-SYNC] Erro no upsert de internal_transactions:', error);
                errors.push(`Erro interno_transactions: ${error.message}`);
            } else {
                console.log(`[PAYROLL-SYNC] Sincronizados ${internalTxs.length} registros`);
            }
        }

        if (errors.length > 0) throw new Error(errors.join('\n'));
        return {
            success: true,
            count: internalTxs.length,
            deductions: deductionByWorksite,
            rubricasEncontradas: rubricasIndiv.map(r => r.code),
            worksites: summary.byWorksite.map(w => ({
                name: w.name,
                grossCost: w.cost,
                deduction: deductionByWorksite[w.id] || 0,
                netSalary: Math.max(0, Math.round((w.netSalary - (deductionByWorksite[w.id] || 0)) * 100) / 100),
                encargos: Math.max(0, Math.round(w.encargos * 100) / 100),
                contribuicoes: Math.max(0, Math.round(w.contribuicoes * 100) / 100)
            }))
        };
    },

    // --- AUDIT LOGS ---
    async logAction(log: Omit<PayrollAuditLog, 'id' | 'created_at' | 'user_email'>) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const userEmail = user?.email || 'sistema@orcacloud.com';
            
            await supabase.from('payroll_audit_logs').insert([{
                ...log,
                user_email: userEmail
            }]);
        } catch (err) {
            console.warn('Falha ao registrar log de auditoria:', err);
        }
    },

    async listAuditLogs(orgId: string, entity_type?: string, entity_id?: string) {
        let query = supabase.from('payroll_audit_logs').select('*').eq('org_id', orgId);
        if (entity_type) query = query.eq('entity_type', entity_type);
        if (entity_id) query = query.eq('entity_id', entity_id);
        
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        return data as PayrollAuditLog[];
    },

    /**
     * Retorna o resultado (custo) do funcionário na última folha FECHADA da organização.
     * Usado na tela de Alocações para lançar custos reais após o fechamento.
     */
    async getLatestClosedResultForEmployee(orgId: string, employeeId: string, period?: string) {
        // 1. Buscar a última folha FECHADA da org (opcionalmente filtrando por período YYYY-MM)
        let runsQuery = supabase
            .from('payroll_runs')
            .select('id, start_date, end_date, type')
            .eq('org_id', orgId)
            .eq('status', 'FECHADO')
            .order('end_date', { ascending: false });

        if (period) {
            const [y, m] = period.split('-');
            const firstDay = `${y}-${m}-01`;
            const lastDay = new Date(Number(y), Number(m), 0).toISOString().split('T')[0];
            runsQuery = runsQuery.gte('start_date', firstDay).lte('end_date', lastDay);
        }

        const { data: runs, error: runErr } = await runsQuery.limit(1);
        if (runErr) throw runErr;
        if (!runs || runs.length === 0) return null;

        const run = runs[0];

        // 2. Buscar resultado do funcionário nessa folha
        const { data: result, error: resErr } = await supabase
            .from('payroll_results')
            .select('*')
            .eq('payroll_run_id', run.id)
            .eq('employee_id', employeeId)
            .single();

        if (resErr || !result) return null;

        return {
            run_id: run.id,
            run_period: run.start_date.slice(0, 7),
            run_type: run.type,
            gross: result.gross as number,
            discounts: result.discounts as number,
            net: result.net as number,
            employer_cost: result.employer_cost as number,
        };
    },

    /** Lista centros de custo da organização */
    async listCostCenters(orgId: string) {
        const { data, error } = await supabase
            .from('cost_centers')
            .select('id, name, code')
            .eq('organization_id', orgId)
            .order('name');
        if (error) throw error;
        return (data || []) as { id: string; name: string; code?: string }[];
    },

    /** Lista plano de contas (chart of accounts) da organização */
    async listChartOfAccounts(orgId: string) {
        const { data, error } = await supabase
            .from('chart_of_accounts')
            .select('id, name, code, type')
            .eq('organization_id', orgId)
            .order('code');
        if (error) throw error;
        return (data || []) as { id: string; name: string; code: string; type?: string }[];
    },

    /**
     * Sincroniza manualmente o custo de UM funcionário para os projetos designados,
     * aplicando centro de custo e plano de pagamento.
     */
    async syncEmployeeToFinance(
        runId: string,
        employeeId: string,
        employeeName: string,
        totalCost: number,
        allocations: { project_id: string, allocation_percent: number }[],
        costCenterName: string,
        chartOfAccountsName: string,
        individualizadoLancamentos?: { rubricCode: string; rubricName: string; amount: number; txDate: string }[],
        netSalary?: number,
        encargoCostCenterName?: string,
        encargoChartOfAccountsName?: string,
        grossSalary?: number,
        terceiroCostCenterName?: string,
        terceiroChartOfAccountsName?: string
    ) {
        // 1. Obter meta-dados da folha
        const run = await this.getRun(runId);
        const period = run.start_date.slice(0, 7);
        const [year, month] = period.split('-');
        const formattedPeriod = `${month}/${year}`;

        const salaryTotal     = netSalary ?? totalCost;
        const encargosTotal   = Math.max(0, totalCost - salaryTotal);
        const orgTerceirosTaxes = getOrgTerceirosTaxes(run.org_id);
        const terceiroTotalRate = orgTerceirosTaxes.reduce((s, t) => s + t.rate, 0);
        const contribuicoesTotal = grossSalary ? Math.max(0, Math.round(grossSalary * terceiroTotalRate * 100) / 100) : 0;

        const internalTxs: InternalTransaction[] = [];

        // 2. Iterar sobre alocações — gera dois lançamentos por obra: salário e encargos
        for (const alloc of allocations) {
            const percent = alloc.allocation_percent || 0;
            if (percent <= 0) continue;

            const pct = percent / 100;
            const salaryCost       = Math.round(salaryTotal      * pct * 100) / 100;
            const encargosCost     = Math.round(encargosTotal    * pct * 100) / 100;
            const contribuicoesCost = Math.round(contribuicoesTotal * pct * 100) / 100;
            if (salaryCost <= 0 && encargosCost <= 0 && contribuicoesCost <= 0) continue;

            try {
                const project = await projectService.loadProject(alloc.project_id);
                if (!project) continue;

                const settings = project.settings as ProjectSettings;
                const info = settings.financialInfo || { totalValue: 0, paymentMethod: 'Variavel', installments: [], transactions: [] };

                const oldRefId         = `labor-${runId}-${alloc.project_id}-${employeeId}`;
                const empPrefix        = `labor-${runId}-${alloc.project_id}-${employeeId}-`;
                const refIdSalario     = `labor-${runId}-${alloc.project_id}-${employeeId}-salario`;
                const refIdEncargos    = `labor-${runId}-${alloc.project_id}-${employeeId}-encargos`;

                const filteredTransactions = (info.transactions as ProjectFinancialTx[] || []).filter(t =>
                    t.id !== oldRefId && !String(t.id || '').startsWith(empPrefix)
                );

                const newTransactions: ProjectFinancialTx[] = [];

                if (salaryCost > 0) {
                    const desc = `Salários - ${employeeName} - Folha ${formattedPeriod}`;
                    newTransactions.push({
                        id: refIdSalario,
                        date: run.end_date,
                        type: 'EXPENSE',
                        category: 'Folha de Pagamento',
                        description: desc,
                        value: salaryCost,
                        status: 'PENDING',
                        notes: `Salário líquido. Funcionário: ${employeeName}`,
                        costCenter: costCenterName,
                        chartOfAccounts: chartOfAccountsName
                    });
                    internalTxs.push({
                        organization_id: run.org_id,
                        source_system: 'LABOR',
                        reference_id: refIdSalario,
                        transaction_date: run.end_date,
                        amount: salaryCost,
                        direction: 'DEBIT',
                        description: desc,
                        category: 'Folha de Pagamento',
                        status: 'PENDING'
                    });
                }

                if (encargosCost > 0) {
                    const desc = `Encargos Patronais - ${employeeName} - Folha ${formattedPeriod}`;
                    newTransactions.push({
                        id: refIdEncargos,
                        date: run.end_date,
                        type: 'EXPENSE',
                        category: 'Encargos Patronais',
                        description: desc,
                        value: encargosCost,
                        status: 'PENDING',
                        notes: `Encargos patronais (FGTS e demais). Funcionário: ${employeeName}`,
                        costCenter: encargoCostCenterName || costCenterName,
                        chartOfAccounts: encargoChartOfAccountsName || chartOfAccountsName
                    });
                    internalTxs.push({
                        organization_id: run.org_id,
                        source_system: 'LABOR',
                        reference_id: refIdEncargos,
                        transaction_date: run.end_date,
                        amount: encargosCost,
                        direction: 'DEBIT',
                        description: desc,
                        category: 'Encargos Patronais',
                        status: 'PENDING'
                    });
                }

                for (const tax of orgTerceirosTaxes) {
                    const grossPct = grossSalary ? Math.round(grossSalary * pct * 100) / 100 : 0;
                    const taxCost = Math.max(0, Math.round(grossPct * tax.rate * 100) / 100);
                    if (taxCost <= 0) continue;
                    const refIdTax = `labor-${runId}-${alloc.project_id}-${employeeId}-terceiros-${tax.code}`;
                    const desc = `${tax.name} (${(tax.rate * 100).toFixed(1)}%) - ${employeeName} - Folha ${formattedPeriod}`;
                    newTransactions.push({
                        id: refIdTax,
                        date: run.end_date,
                        type: 'EXPENSE',
                        category: 'Contribuições de Terceiros',
                        description: desc,
                        value: taxCost,
                        status: 'PENDING',
                        notes: `Contribuição de terceiros — código ${tax.code}. Funcionário: ${employeeName}`,
                        costCenter: terceiroCostCenterName || encargoCostCenterName || costCenterName,
                        chartOfAccounts: terceiroChartOfAccountsName || encargoChartOfAccountsName || chartOfAccountsName
                    });
                    internalTxs.push({
                        organization_id: run.org_id,
                        source_system: 'LABOR',
                        reference_id: refIdTax,
                        transaction_date: run.end_date,
                        amount: taxCost,
                        direction: 'DEBIT',
                        description: desc,
                        category: 'Contribuições de Terceiros',
                        status: 'PENDING'
                    });
                }

                await projectService.saveProject({
                    ...project,
                    settings: {
                        ...settings,
                        financialInfo: {
                            ...info,
                            transactions: [...newTransactions, ...filteredTransactions]
                        }
                    }
                });

            } catch (err) {
                console.error(`[EMP-SYNC] Erro ao processar projeto ${alloc.project_id}:`, err);
            }
        }

        // 3. Lançamentos individualizados (ex: ADIANTAMENTO) com data específica
        if (individualizadoLancamentos && individualizadoLancamentos.length > 0) {
            for (const lc of individualizadoLancamentos) {
                if (lc.amount <= 0) continue;
                const refId = `labor-${runId}-indiv-${lc.rubricCode}-${employeeId}`;
                internalTxs.push({
                    organization_id:  run.org_id,
                    source_system:    'LABOR',
                    reference_id:     refId,
                    transaction_date: lc.txDate,
                    amount:           lc.amount,
                    direction:        'DEBIT',
                    description:      `${lc.rubricName} - ${employeeName} - Folha ${formattedPeriod}`,
                    category:         'Folha de Pagamento',
                    status:           'PENDING'
                });
            }
        }

        // 4. Salvar na internal_transactions
        if (internalTxs.length > 0) {
            const { error } = await supabase
                .from('internal_transactions')
                .upsert(internalTxs, { onConflict: 'organization_id,reference_id' });
            if (error) console.error('[EMP-SYNC] Erro no upsert centralizado:', error);
        }

        return { success: true };
    },

    async listIndividualizadoItemsForEmployee(runId: string, employeeId: string): Promise<{ code: string; name: string; amount: number; dia_lancamento: number | null }[]> {
        const { data: items, error } = await supabase
            .from('payroll_items')
            .select('code, amount')
            .eq('payroll_run_id', runId)
            .eq('employee_id', employeeId);

        if (error || !items || items.length === 0) return [];

        const rubrics = await this.listRubrics();
        const indivRubrics = rubrics.filter(r => r.lancamento_individualizado);

        return items
            .filter(i => indivRubrics.some(r => r.code === i.code))
            .map(i => {
                const rubric = indivRubrics.find(r => r.code === i.code)!;
                return {
                    code:           i.code,
                    name:           rubric.name,
                    amount:         i.amount,
                    dia_lancamento: rubric.dia_lancamento ?? null
                };
            });
    }
};
