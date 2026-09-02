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

// orgId null = "Todas as organizações": devolve o default, sem chave de storage.
export function getOrgTerceirosTaxes(orgId: string | null): TerceiroTax[] {
    if (!orgId) return TERCEIROS_TAXES_DEFAULT.map(t => ({ ...t }));
    try {
        const raw = localStorage.getItem(`terceiros_taxes_${orgId}`);
        if (raw) {
            const parsed = JSON.parse(raw) as TerceiroTax[];
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch { /* ignore */ }
    return TERCEIROS_TAXES_DEFAULT.map(t => ({ ...t }));
}

export function saveOrgTerceirosTaxes(orgId: string | null, taxes: TerceiroTax[]): void {
    if (!orgId) return;   // sem org específica não há onde gravar (REGRA #5, exceção 4)
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
    type: 'mensal' | 'adiantamento' | 'ferias' | 'decimo_terceiro' | 'rescisao';
    subtype?: string;
    vacation_start?: string;
    vacation_end?: string;
    termination_reason?: string;
    validation_logs?: ValidationLog[];
    /* Classificação contábil PADRÃO do ciclo (migration
       aplicar_20270914000004). Herdada por todas as linhas financeiras da
       folha; o colaborador pode sobrepor (employees.cost_center_id /
       .plano_de_contas_id) nas linhas que são dele. Ver "CLASSIFICAÇÃO
       CONTÁBIL DAS LINHAS DE FOLHA" abaixo. */
    cost_center_id?: string | null;
    plano_de_contas_id?: string | null;
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

// ============================================================
// CREDOR DAS LINHAS DE FOLHA (coluna Credor de Contas a Pagar)
// ============================================================
// Até 2026-08-23 nenhum dos pontos de inserção em `internal_transactions`
// deste arquivo gravava `party_name`/`entity_name`. Como a coluna Credor de
// Contas a Pagar sai de `party_name || entity_name`
// (`payableService.payableParty`), TODA linha com origem "Folha" aparecia com
// travessão — foi assim que o usuário achou o bug, filtrando Origem = Folha.
//
// A regra de produto (definida em 2026-08-23) separa DUAS naturezas, porque
// nem toda linha de folha tem o colaborador como credor:
//
//   • salário, adiantamento e rubricas individualizadas → o COLABORADOR;
//   • encargos patronais → o órgão arrecadador (`CREDOR_ENCARGOS`);
//   • contribuições de terceiros → a ENTIDADE da rubrica (SESI, SENAI,
//     INCRA…), que já vem em `TerceiroTax.name`.
//
// ⚠️ NUNCA gravar `party_id` aqui: a coluna tem FK para `clients`
// (`internal_txs_party_id_fkey`, migration 20261219000003) e um `employee_id`
// ali estoura a constraint. O vínculo do colaborador fica só no `reference_id`.
//
// ⚠️ `party_type` NÃO pode ser 'TAX' nem para encargos: esse valor é o
// discriminador exclusivo de `vw_commercial_tax_payables`
// (migration 20270824000010, `WHERE it.party_type = 'TAX'`) e a folha inteira
// vazaria para a tela de Tributos a Pagar.

/** Credor institucional dos encargos patronais (INSS + FGTS). */
export const CREDOR_ENCARGOS = 'INSS/FGTS';

/** Discriminador de contraparte das linhas de folha. Ver aviso sobre 'TAX'. */
export type PayrollPartyType = 'EMPLOYEE' | 'GOVERNMENT';

/**
 * Credor de uma linha AGREGADA (custo por obra, custo não alocado), que
 * envolve vários colaboradores de uma vez: lista os nomes e resume o excedente
 * em "(+N)" para a célula não estourar. Sem nome nenhum — folha antiga sem
 * alocação resolvida — cai num rótulo genérico, que ainda é melhor que vazio.
 */
export function credorDeColaboradores(nomes: string[]): string {
    const limpos = [...new Set(nomes.filter(Boolean))];
    if (limpos.length === 0) return 'Folha de Pagamento';
    if (limpos.length <= 3) return limpos.join(', ');
    return `${limpos.slice(0, 3).join(', ')} (+${limpos.length - 3})`;
}

// Transação interna para tabela internal_transactions
interface InternalTransaction {
    organization_id: string;
    source_system: 'LABOR';
    reference_id: string;
    transaction_date: string;
    due_date?: string;
    amount: number;
    direction: 'DEBIT' | 'CREDIT';
    description: string;
    category: string;
    status: 'PENDING' | 'PAID';
    business_status?: string;
    project_id?: string;
    /* Credor exibido em Contas a Pagar. A coluna sai de
       `party_name || entity_name` (payableService.payableParty) — sem isto a
       célula Credor de TODA linha de folha cai no travessão. Ver a seção
       "CREDOR DAS LINHAS DE FOLHA" acima. */
    party_name?: string;
    party_type?: PayrollPartyType;
    /* Dimensões contábeis — ver "CLASSIFICAÇÃO CONTÁBIL DAS LINHAS DE FOLHA".
       Emitidas SEMPRE (mesmo como null) em todas as linhas do mesmo upsert: o
       PostgREST monta o comando pela UNIÃO das chaves do array, então uma linha
       sem a chave receberia o default e não o valor pretendido. */
    cost_center_id?: string | null;
    plano_de_contas_id?: string | null;
}

// ============================================================
// CLASSIFICAÇÃO CONTÁBIL DAS LINHAS DE FOLHA
// ============================================================
// Até 2026-08-23 nenhuma linha de folha em `internal_transactions` tinha
// Centro de Custo nem Plano de Contas — as duas colunas vinham vazias em Contas
// a Pagar com Origem = "Folha", pelo mesmo motivo do Credor: o produtor nunca
// as gravou. Migration `aplicar_20270914000004` criou as colunas de origem.
//
// As duas dimensões são DIFERENTES e não se misturam (nem com Categoria
// Financeira, que é `financial_categories` e continua sendo o campo `category`):
//   Centro de Custo → cost_centers_v2 → internal_transactions.cost_center_id
//   Plano de Contas → plano_de_contas → internal_transactions.plano_de_contas_id
//
// A REGRA DE HERANÇA (definida pelo usuário em 2026-08-23):
//   • o colaborador (`employees.*`), quando preenchido, VENCE;
//   • senão vale o ciclo de folha (`payroll_runs.*`);
//   • nenhum dos dois → null, como antes.
//
// ⚠️ O override do colaborador só alcança linha que TEM um colaborador:
// rubricas individualizadas e `syncEmployeeToFinance`. As linhas agregadas por
// obra e as de "Custo Administrativo (Não Alocado)" somam vários colaboradores
// numa transação só — nelas vale sempre a classificação do ciclo.

/** Classificação contábil resolvida para uma linha de folha. */
export interface PayrollClassification {
    cost_center_id: string | null;
    plano_de_contas_id: string | null;
}

/** Herança colaborador → ciclo, aplicada campo a campo. */
export function resolvePayrollClassification(
    run: Pick<PayrollRun, 'cost_center_id' | 'plano_de_contas_id'>,
    employee?: { cost_center_id?: string | null; plano_de_contas_id?: string | null } | null,
): PayrollClassification {
    return {
        cost_center_id:     employee?.cost_center_id     ?? run.cost_center_id     ?? null,
        plano_de_contas_id: employee?.plano_de_contas_id ?? run.plano_de_contas_id ?? null,
    };
}

// ============================================================
// RATEIO CONTÁBIL DO COLABORADOR (employee_cost_splits)
// ============================================================
// Migration `aplicar_20270914000005`. Dentro de um mês, o colaborador pode
// apropriar o custo em mais de um Centro de Custo / Plano de Contas — caso
// relatado pelo usuário em 2026-08-23, que a classificação única não cobria.
//
// É INDEPENDENTE do rateio de obra (`employee_allocations`), por decisão do
// usuário: alguém 100% numa obra ainda pode dividir o custo entre dois centros
// de custo. Na prática as duas dimensões se MULTIPLICAM na hora de gerar
// lançamento: (obra × chave contábil).
//
// A herança vira uma escada de 4 degraus, e o rateio é o degrau mais alto:
//   splits do mês → colaborador → ciclo → null

/** Uma fatia do custo do colaborador no mês. */
export interface EmployeeCostSplit {
    id?: string;
    org_id?: string;
    employee_id: string;
    reference_period: string;   // 'YYYY-MM'
    cost_center_id: string | null;
    plano_de_contas_id: string | null;
    percent: number;
}

/** Classificação + a fatia do custo que cabe a ela. */
export interface PayrollClassificationShare extends PayrollClassification {
    /** 0–1 (e não 0–100): já pronto para multiplicar por valor. */
    share: number;
}

/**
 * Rateio efetivo do colaborador, com a herança aplicada.
 *
 * Sem rateio no mês, devolve UMA fatia de 100% com a classificação herdada —
 * o comportamento anterior, intacto. Com rateio somando menos de 100%, o resto
 * NÃO fica sem classificação: vira uma fatia final com a herança. É o que
 * impede que um 95% digitado errado apague 5% do custo da contabilidade.
 *
 * Fatia sem nenhuma das duas dimensões é ignorada (a constraint do banco já
 * barra, mas dado antigo/importado pode chegar assim).
 */
export function resolvePayrollShares(
    run: Pick<PayrollRun, 'cost_center_id' | 'plano_de_contas_id'>,
    employee?: { cost_center_id?: string | null; plano_de_contas_id?: string | null } | null,
    splits?: EmployeeCostSplit[] | null,
): PayrollClassificationShare[] {
    const herdado = resolvePayrollClassification(run, employee);
    const validos = (splits || []).filter(s =>
        (s.cost_center_id || s.plano_de_contas_id) && (s.percent || 0) > 0
    );

    if (validos.length === 0) return [{ ...herdado, share: 1 }];

    const somaPercent = validos.reduce((s, x) => s + x.percent, 0);
    // Acima de 100 o rateio está errado, mas gerar lançamento a mais é pior que
    // normalizar: proporcionaliza para fechar exatamente o custo real.
    const escala = somaPercent > 100 ? 100 / somaPercent : 1;

    const fatias: PayrollClassificationShare[] = validos.map(s => ({
        cost_center_id:     s.cost_center_id     ?? null,
        plano_de_contas_id: s.plano_de_contas_id ?? null,
        share:              (s.percent * escala) / 100,
    }));

    const resto = 100 - Math.min(somaPercent, 100);
    if (resto > 0.001) fatias.push({ ...herdado, share: resto / 100 });

    return fatias;
}

/**
 * Custo de uma obra (ou do não alocado) sob UMA chave contábil. É o que vira um
 * lançamento em `internal_transactions`: com rateio, a mesma obra passa a ter
 * um balde por Centro de Custo × Plano de Contas.
 */
export interface WorksiteClassBucket extends PayrollClassification {
    cost: number;
    netSalary: number;
    encargos: number;
    gross: number;
    contribuicoes: number;
    /** Nomes dos colaboradores — viram o Credor da linha agregada. */
    employees: string[];
}

export interface WorksiteCostEntry {
    id: string;
    name: string;
    cost: number;
    netSalary: number;
    encargos: number;
    gross: number;
    contribuicoes: number;
    employees: string[];
    /** Quebra contábil da obra. Sem rateio, tem exatamente uma entrada. */
    byClass: Record<string, WorksiteClassBucket>;
}

/** Chave estável da classificação, para agrupar e compor `reference_id`. */
export function classificationKey(c: PayrollClassification): string {
    return `${c.cost_center_id ?? 'none'}-${c.plano_de_contas_id ?? 'none'}`;
}

/**
 * Sufixo do `reference_id` da fatia. Com UMA fatia (o caso de quem não rateia,
 * que é a maioria) devolve string vazia: o `reference_id` continua idêntico ao
 * que a folha sempre gerou, e nada muda para as folhas existentes. Só quando há
 * rateio de verdade o id ganha a chave contábil, porque aí a mesma obra tem
 * mais de uma linha e elas precisam de chaves distintas no upsert
 * (`organization_id, reference_id, entry_type`).
 */
export function sufixoDaFatia(shares: PayrollClassificationShare[], fatia: PayrollClassification): string {
    return shares.length <= 1 ? '' : `-cls-${classificationKey(fatia)}`;
}

/**
 * Divide um valor entre as fatias sem perder centavo: arredonda cada uma e
 * joga a diferença acumulada na MAIOR fatia. Sem isto, 3 fatias de 33,33% de
 * R$ 100,00 lançariam R$ 99,99 no financeiro — e a folha deixaria de bater com
 * o total dos lançamentos, que é o critério de conferência do módulo.
 */
export function dividirValor(total: number, shares: PayrollClassificationShare[]): number[] {
    if (shares.length === 0) return [];
    if (shares.length === 1) return [Math.round(total * 100) / 100];

    const valores = shares.map(s => Math.round(total * s.share * 100) / 100);
    const soma = valores.reduce((a, b) => a + b, 0);
    const diferenca = Math.round((total - soma) * 100) / 100;
    if (diferenca !== 0) {
        let maior = 0;
        for (let i = 1; i < shares.length; i++) if (shares[i].share > shares[maior].share) maior = i;
        valores[maior] = Math.round((valores[maior] + diferenca) * 100) / 100;
    }
    return valores;
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
    async listRuns(orgId?: string | null, type?: string, startDate?: string, endDate?: string) {
        let query = supabase
            .from('payroll_runs')
            .select('id, org_id, start_date, end_date, status, type, subtype, vacation_start, vacation_end, termination_reason, validation_logs, cost_center_id, plano_de_contas_id, created_at');

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
            .select('id, org_id, start_date, end_date, status, type, subtype, vacation_start, vacation_end, termination_reason, validation_logs, cost_center_id, plano_de_contas_id, created_at')
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

    /**
     * Grava a classificação contábil PADRÃO do ciclo (Centro de Custo e Plano
     * de Contas). `null` limpa o campo — por isso o objeto é montado com o que
     * veio, e não com `|| undefined`, que deixaria o "limpar" sem efeito.
     */
    async updateRunClassification(
        id: string,
        classification: { cost_center_id?: string | null; plano_de_contas_id?: string | null },
    ) {
        const patch: Record<string, string | null> = {};
        if ('cost_center_id' in classification)     patch.cost_center_id     = classification.cost_center_id ?? null;
        if ('plano_de_contas_id' in classification) patch.plano_de_contas_id = classification.plano_de_contas_id ?? null;
        if (Object.keys(patch).length === 0) return;

        const { error } = await supabase.from('payroll_runs').update(patch).eq('id', id);
        if (error) throw error;
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
            .select('code, name, type, incidence_inss, incidence_fgts, incidence_irrf, is_automatic, is_clt_mandatory, calculation_type, calculation_config, category, formula, active, lancamento_individualizado, dia_lancamento')
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
            .select('code, name, type, incidence_inss, incidence_fgts, incidence_irrf, is_automatic, is_clt_mandatory, calculation_type, calculation_config, category, formula, active, lancamento_individualizado, dia_lancamento')
            .eq('code', code)
            .single();

        if (error) throw error;
        return data as PayrollRubric;
    },

    /**
     * Cria uma rubrica de folha.
     *
     * `organizationId` é obrigatório desde 2026-09-02: `rubrics` ganhou dono
     * (achado C1-06) e a policy de INSERT exige `is_org_member(organization_id)`.
     * As rubricas obrigatórias da CLT continuam com `organization_id` NULL —
     * são seed do sistema e se criam por migration, não pela tela.
     */
    async createRubric(rubric: PayrollRubric, organizationId: string) {
        const { data, error } = await supabase
            .from('rubrics')
            .insert({ ...rubric, organization_id: organizationId })
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
            .select('id, type, year, min_value, max_value, rate, deduction')
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
        // Usa maybeSingle para não lançar erro com 0 ou >1 linhas (duplicatas V1/V2).
        // Tenta payroll_run_id (V2) primeiro, depois run_id (V1) como fallback.
        const { data: v2 } = await supabase
            .from('payroll_results')
            .select('*, employee:employee_id(*)')
            .eq('payroll_run_id', runId)
            .eq('employee_id', employeeId)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (v2) return v2 as PayrollResultWithEmployee;

        const { data: v1, error: e1 } = await supabase
            .from('payroll_results')
            .select('*, employee:employee_id(*)')
            .eq('run_id', runId)
            .eq('employee_id', employeeId)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (e1) throw e1;
        return v1 as PayrollResultWithEmployee | null;
    },

    async getEmployeeItems(runId: string, employeeId: string) {
        // Tenta buscar por payroll_run_id (V2)
        const { data: v2, error: e2 } = await supabase
            .from('payroll_items')
            .select('id, payroll_run_id, employee_id, code, type, amount, base_amount, reference, origin')
            .eq('payroll_run_id', runId)
            .eq('employee_id', employeeId);

        if (!e2 && v2 && v2.length > 0) return v2;

        // Fallback para run_id (V1)
        const { data: v1, error: e1 } = await supabase
            .from('payroll_items')
            .select('id, payroll_run_id, employee_id, code, type, amount, base_amount, reference, origin')
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

        // Supabase retorna 400 em .insert([]); só insere se houver itens.
        // Sem este guard, uma folha sem itens lança erro e o resultado nunca é
        // persistido, deixando o ciclo órfão (getPayrollResult.single() falha).
        if (itemsToInsert.length > 0) {
            const { error: itemsError } = await supabase
                .from('payroll_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;
        }

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
        //
        // ⚠️ O array vai CRU, sem `JSON.stringify`. O parâmetro é `JSONB`
        // (migration 20260706000007) e uma string chega ao Postgres como escalar
        // jsonb (`'"[]"'`), onde `jsonb_array_length` estoura com
        // `22023 cannot get array length of a scalar`. Era o que acontecia até
        // 2026-08-24: NENHUM salvamento de alocação funcionava, e a tela só
        // dizia "Falha ao salvar" porque engolia o erro do PostgREST.
        // Confirmado contra o banco: com string → 400/22023; com array → 204.
        const { error } = await supabase.rpc('upsert_employee_allocations', {
            p_employee_id: employeeId,
            p_period: period,
            p_allocations: allocations.map(a => ({
                project_id: a.project_id,
                allocation_percent: a.allocation_percent,
            })),
        });

        if (error) throw error;
    },

    /**
     * Grava, em UMA query, a alocação automática de vários colaboradores —
     * a que a aba Alocações deriva do centro de custo vinculado a uma obra.
     *
     * Não usa a RPC `upsert_employee_allocations` de propósito: ela é por
     * colaborador (DELETE + INSERT) e a tela chegaria a fazer uma chamada por
     * linha da lista. Aqui não há o que apagar — o chamador só manda quem está
     * SEM nenhuma alocação no mês, então um INSERT em lote basta e nunca
     * sobrescreve o que alguém definiu à mão.
     */
    async insertAutoAllocations(
        period: string,
        itens: Array<{ employee_id: string; project_id: string; allocation_percent: number }>,
    ) {
        if (itens.length === 0) return;
        // `ignoreDuplicates` vira ON CONFLICT DO NOTHING sobre
        // `employee_allocations_unique_period` (employee_id, project_id,
        // reference_period): uma linha que outra sessão acabou de gravar não
        // derruba o lote inteiro, e nada existente é sobrescrito.
        const { error } = await supabase
            .from('employee_allocations')
            .upsert(
                itens.map(i => ({
                    employee_id: i.employee_id,
                    project_id: i.project_id,
                    allocation_percent: i.allocation_percent,
                    reference_period: period,
                })),
                { onConflict: 'employee_id,project_id,reference_period', ignoreDuplicates: true },
            );
        if (error) throw error;
    },

    /**
     * Alocações de VÁRIOS colaboradores num mês, em uma query só.
     *
     * A tela de Alocações lista todo mundo do mês; chamar `listAllocations` por
     * linha seria um N+1 proporcional ao número de colaboradores.
     */
    async listAllocationsForEmployees(employeeIds: string[], period: string): Promise<Record<string, EmployeeAllocation[]>> {
        if (employeeIds.length === 0) return {};
        const { data, error } = await supabase
            .from('employee_allocations')
            .select('*, worksite:project_id(name)')
            .in('employee_id', employeeIds)
            .eq('reference_period', period);
        if (error) throw error;
        const porColaborador: Record<string, EmployeeAllocation[]> = {};
        (data || []).forEach((a: EmployeeAllocation & { worksite?: { name: string } }) => {
            (porColaborador[a.employee_id] ||= []).push({ ...a, worksite_name: a.worksite?.name });
        });
        return porColaborador;
    },

    /**
     * Custo da folha FECHADA do mês para vários colaboradores, em duas queries
     * (as folhas do período + os resultados delas). Mesma finalidade do
     * `getClosedResultsForEmployee`, que continua servindo o detalhe de UM
     * colaborador.
     */
    async listClosedResultsForEmployees(
        orgId: string | null | undefined,
        employeeIds: string[],
        period: string,
    ): Promise<Record<string, { gross: number; net: number; employer_cost: number; run_id: string }>> {
        if (employeeIds.length === 0) return {};
        const [y, m] = period.split('-');
        const firstDay = `${y}-${m}-01`;
        const lastDay = new Date(Number(y), Number(m), 0).toISOString().split('T')[0];

        let runsQuery = supabase
            .from('payroll_runs')
            .select('id, type, start_date')
            .eq('status', 'FECHADO')
            .in('type', ['mensal', 'adiantamento'])
            .gte('start_date', firstDay)
            .lte('end_date', lastDay);
        if (orgId && orgId !== 'all') runsQuery = runsQuery.eq('org_id', orgId);

        const { data: runs, error: runErr } = await runsQuery;
        if (runErr) throw runErr;
        if (!runs || runs.length === 0) return {};

        // A folha mensal manda; adiantamento só entra se não houver mensal.
        const mensal = runs.filter((r: { type: string }) => r.type === 'mensal');
        const escolhidas = (mensal.length > 0 ? mensal : runs) as Array<{ id: string }>;

        const { data: results, error: resErr } = await supabase
            .from('payroll_results')
            .select('employee_id, payroll_run_id, gross, net, employer_cost')
            .in('payroll_run_id', escolhidas.map(r => r.id))
            .in('employee_id', employeeIds);
        if (resErr) throw resErr;

        const porColaborador: Record<string, { gross: number; net: number; employer_cost: number; run_id: string }> = {};
        for (const r of (results || []) as Array<{ employee_id: string; payroll_run_id: string; gross: number; net: number; employer_cost: number }>) {
            porColaborador[r.employee_id] = {
                gross: r.gross, net: r.net, employer_cost: r.employer_cost, run_id: r.payroll_run_id,
            };
        }
        return porColaborador;
    },

    // ── Rateio contábil do colaborador (employee_cost_splits) ───────────────
    // Ver "RATEIO CONTÁBIL DO COLABORADOR" no topo. Independente do rateio de
    // obra acima — as duas telas dividem o mesmo `reference_period` ('YYYY-MM')
    // e nada mais.

    async listCostSplits(employeeId: string, period?: string): Promise<EmployeeCostSplit[]> {
        const currentPeriod = period || new Date().toISOString().slice(0, 7);
        const { data, error } = await supabase
            .from('employee_cost_splits')
            .select('id, org_id, employee_id, reference_period, cost_center_id, plano_de_contas_id, percent')
            .eq('employee_id', employeeId)
            .eq('reference_period', currentPeriod)
            .order('percent', { ascending: false });
        if (error) throw error;
        return (data || []) as EmployeeCostSplit[];
    },

    /**
     * Competência mais recente que TEM rateio contábil, entre estes
     * colaboradores. A tela de Alocações abre no mês corrente; sem isto, um
     * rateio cadastrado em outro mês fica invisível e parece que não salvou —
     * foi o que aconteceu em 2026-08-24 (o único rateio era de 2026-06).
     */
    async ultimaCompetenciaComRateio(employeeIds: string[]): Promise<string | null> {
        if (employeeIds.length === 0) return null;
        const { data, error } = await supabase
            .from('employee_cost_splits')
            .select('reference_period')
            .in('employee_id', employeeIds)
            .order('reference_period', { ascending: false })
            .limit(1);
        if (error) throw error;
        return (data?.[0] as { reference_period: string } | undefined)?.reference_period ?? null;
    },

    /** Rateio de VÁRIOS colaboradores num mês — usado pela sincronização da folha. */
    async listCostSplitsForEmployees(employeeIds: string[], period: string): Promise<Record<string, EmployeeCostSplit[]>> {
        if (employeeIds.length === 0) return {};
        const { data, error } = await supabase
            .from('employee_cost_splits')
            .select('id, org_id, employee_id, reference_period, cost_center_id, plano_de_contas_id, percent')
            .in('employee_id', employeeIds)
            .eq('reference_period', period);
        if (error) throw error;
        const porColaborador: Record<string, EmployeeCostSplit[]> = {};
        for (const linha of (data || []) as EmployeeCostSplit[]) {
            (porColaborador[linha.employee_id] ||= []).push(linha);
        }
        return porColaborador;
    },

    /**
     * Substitui o rateio do colaborador no mês (DELETE + INSERT).
     *
     * Lista vazia apaga o rateio — é assim que se volta para a classificação
     * única do colaborador. Não é RPC atômica como `saveAllocations` porque
     * não existe RPC para esta tabela; o DELETE só roda se o INSERT tiver o
     * que gravar, e a ordem inversa (insert antes do delete) esbarraria no
     * índice único.
     */
    async saveCostSplits(
        employeeId: string,
        orgId: string,
        period: string,
        splits: Array<Pick<EmployeeCostSplit, 'cost_center_id' | 'plano_de_contas_id' | 'percent'>>,
    ) {
        const limpos = splits.filter(s => (s.cost_center_id || s.plano_de_contas_id) && (s.percent || 0) > 0);
        const total = limpos.reduce((s, x) => s + x.percent, 0);
        if (total > 100.001) {
            throw new Error(`Rateio total (${total.toFixed(1)}%) ultrapassa 100%. Corrija antes de salvar.`);
        }

        const { error: delErr } = await supabase
            .from('employee_cost_splits')
            .delete()
            .eq('employee_id', employeeId)
            .eq('reference_period', period);
        if (delErr) throw delErr;

        if (limpos.length === 0) return;

        const { error: insErr } = await supabase
            .from('employee_cost_splits')
            .insert(limpos.map(s => ({
                org_id:             orgId,
                employee_id:        employeeId,
                reference_period:   period,
                cost_center_id:     s.cost_center_id ?? null,
                plano_de_contas_id: s.plano_de_contas_id ?? null,
                percent:            s.percent,
            })));
        if (insErr) throw insErr;
    },

    async listWorksites(orgId?: string | null): Promise<Worksite[]> {
        // 'ALL' preserva o comportamento: o filtro abaixo aceita projeto SEM
        // classificação como obra (`!cls || cls === 'OBRA'`), o que DIVERGE de
        // TRATAR_SEM_CLASSIFICACAO_COMO_OBRA=false. Mudar isso aqui tiraria obra
        // legada da alocação de folha — decisão de produto, não refactor.
        const data = await projectService.listProjects({ organizationId: orgId, includeOrphans: true, classifications: 'ALL' });
        return (data || [])
            .filter(p => {
                const cls = (p.settings as { classification?: string } | null)?.classification;
                return !cls || cls === 'OBRA';
            })
            .map(p => ({ id: p.id, name: p.name }));
    },

    async listEvents(orgId: string | null, runId?: string) {
        let query = supabase.from('payroll_events').select('id, org_id, employee_id, payroll_run_id, code, rubric_code, type, amount, description, reference_date, is_recurring, origin, unit, quantity, approval_status');
        if (orgId && orgId !== 'all') query = query.eq('org_id', orgId);
        if (runId) query = query.eq('payroll_run_id', runId);

        const { data, error } = await query;
        if (error) throw error;
        return data as PayrollEvent[];
    },

    async listEventsByPeriod(employeeId: string, start: string, end: string, currentRunId?: string) {
        let query = supabase
            .from('payroll_events')
            .select('id, org_id, employee_id, payroll_run_id, code, rubric_code, type, amount, description, reference_date, is_recurring, origin, unit, quantity, approval_status')
            .eq('employee_id', employeeId)
            .gte('reference_date', start)
            .lte('reference_date', end);

        if (currentRunId) {
            query = query.or(`payroll_run_id.is.null,payroll_run_id.eq.${currentRunId}`);
        } else {
            query = query.is('payroll_run_id', null);
        }

        // Incentivos pendentes/rejeitados não entram na folha (só aprovados ou legados/nulos)
        query = query.or('approval_status.is.null,approval_status.eq.APROVADO');

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
        const { data: oldData } = await supabase.from('payroll_events').select('id, org_id, employee_id, payroll_run_id, code, rubric_code, type, amount, description, reference_date, is_recurring, origin, unit, quantity, approval_status').eq('id', id).single();

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
        //    (com a classificação contábil de cada um — ver passo 3.b)
        const results = await this.listResultsByRun(runId);
        const empIds = results.map(r => r.employee_id).filter(Boolean);
        const { data: empRows } = await supabase
            .from('employees')
            .select('id, name, cost_center_id, plano_de_contas_id')
            .in('id', empIds);
        type EmpClassRow = { id: string; name: string; cost_center_id?: string | null; plano_de_contas_id?: string | null };
        const empNameMap: Record<string, string> = Object.fromEntries((empRows || []).map((e: EmpClassRow) => [e.id, e.name]));
        const empClassMap: Record<string, EmpClassRow> = Object.fromEntries((empRows || []).map((e: EmpClassRow) => [e.id, e]));

        // 2.b. Rateio contábil do mês (employee_cost_splits). Vazio para quem
        // não rateia — aí `resolvePayrollShares` devolve uma fatia única com a
        // herança colaborador → ciclo, e o resultado é idêntico ao de antes.
        const splitsByEmployee = await this.listCostSplitsForEmployees(empIds, period).catch(() => ({} as Record<string, EmployeeCostSplit[]>));

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

        // Cada obra guarda o total (como sempre) E a quebra por chave contábil
        // (`byClass`), que é o que a sincronização financeira usa para gerar um
        // lançamento por (obra × Centro de Custo × Plano de Contas). Sem rateio
        // em lugar nenhum, `byClass` tem exatamente uma entrada e o resultado é
        // o mesmo de antes.
        const summary: Record<string, WorksiteCostEntry> = {};
        const unallocatedByClass: Record<string, WorksiteClassBucket> = {};

        const bucketDe = (alvo: Record<string, WorksiteClassBucket>, cls: PayrollClassification): WorksiteClassBucket => {
            const chave = classificationKey(cls);
            return (alvo[chave] ||= {
                cost_center_id: cls.cost_center_id,
                plano_de_contas_id: cls.plano_de_contas_id,
                cost: 0, netSalary: 0, encargos: 0, gross: 0, contribuicoes: 0, employees: [],
            });
        };

        let unallocatedCost = 0;
        let unallocatedNetSalary = 0;
        let unallocatedEncargos = 0;
        let unallocatedGross = 0;
        let unallocatedContribuicoes = 0;
        /* Quem compõe o custo não alocado — mesma finalidade de
           `summary[worksiteId].employees`: dar credor à linha agregada de
           "Custo Administrativo (Não Alocado)" em Contas a Pagar. */
        const unallocatedEmployees: string[] = [];

        for (const res of results) {
            const allocations = allocByEmployee[res.employee_id] ?? [];
            const employerCost = res.employer_cost || 0;
            const netSalary = res.net || 0;
            const grossSalary = res.gross || 0;
            const encargos = Math.max(0, employerCost - netSalary);
            const contribuicoes = Math.round(grossSalary * 0.058 * 100) / 100;
            const empName = empNameMap[res.employee_id] || '';

            // Fatias contábeis DESTE colaborador no mês: rateio → colaborador →
            // ciclo. Multiplicam-se com o rateio de obra logo abaixo.
            const shares = resolvePayrollShares(run, empClassMap[res.employee_id], splitsByEmployee[res.employee_id]);

            const acumular = (alvo: Record<string, WorksiteClassBucket>, pct: number) => {
                for (const fatia of shares) {
                    const b = bucketDe(alvo, fatia);
                    const f = pct * fatia.share;
                    b.cost          += employerCost  * f;
                    b.netSalary     += netSalary     * f;
                    b.encargos      += encargos      * f;
                    b.gross         += grossSalary   * f;
                    b.contribuicoes += contribuicoes * f;
                    if (empName && !b.employees.includes(empName)) b.employees.push(empName);
                }
            };

            if (allocations.length === 0) {
                unallocatedCost += employerCost;
                unallocatedNetSalary += netSalary;
                unallocatedEncargos += encargos;
                unallocatedGross += grossSalary;
                unallocatedContribuicoes += contribuicoes;
                acumular(unallocatedByClass, 1);
                if (empName && !unallocatedEmployees.includes(empName)) unallocatedEmployees.push(empName);
                continue;
            }

            let allocatedToWorksites = 0;
            for (const alloc of allocations) {
                const worksiteId = alloc.project_id;
                const worksiteName = alloc.worksite_name || 'Obra Desconhecida';
                const pct = alloc.allocation_percent / 100;

                if (!summary[worksiteId]) summary[worksiteId] = { id: worksiteId, name: worksiteName, cost: 0, netSalary: 0, encargos: 0, gross: 0, contribuicoes: 0, employees: [], byClass: {} };
                acumular(summary[worksiteId].byClass, pct);
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
                acumular(unallocatedByClass, unallocPct);
                unallocatedCost += employerCost * unallocPct;
                unallocatedNetSalary += netSalary * unallocPct;
                unallocatedEncargos += encargos * unallocPct;
                unallocatedGross += grossSalary * unallocPct;
                unallocatedContribuicoes += contribuicoes * unallocPct;
                if (empName && !unallocatedEmployees.includes(empName)) unallocatedEmployees.push(empName);
            }
        }

        return {
            byWorksite: Object.values(summary),
            unallocated: unallocatedCost,
            unallocatedNetSalary,
            unallocatedEncargos,
            unallocatedGross,
            unallocatedContribuicoes,
            unallocatedEmployees,
            unallocatedByClass,
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

        // Data de vencimento estimada para AP: dia 5 do mês seguinte à competência
        const paymentDueDate = (() => {
            const nextMonth = Number(month) === 12 ? 1 : Number(month) + 1;
            const nextYear  = Number(month) === 12 ? Number(year) + 1 : Number(year);
            return `${nextYear}-${String(nextMonth).padStart(2, '0')}-05`;
        })();

        // 1.b. Nomes dos dois cadastros contábeis, para o espelho dentro de
        // `project.settings.financialInfo` (que guarda NOME, não id). A
        // classificação em si não é mais resolvida aqui: cada linha vem com a
        // sua, já rateada, de `getWorksiteCostSummary().byClass`.
        // Ver "CLASSIFICAÇÃO CONTÁBIL DAS LINHAS DE FOLHA" e "RATEIO CONTÁBIL".
        const [costCenterList, planoContasList] = await Promise.all([
            this.listCostCenters(run.org_id).catch(() => [] as { id: string; name: string }[]),
            this.listPlanoContas(run.org_id).catch(() => [] as { id: string; name: string }[]),
        ]);
        const nomeDaClassificacao = (cls: PayrollClassification) => ({
            costCenter:      costCenterList.find(c => c.id === cls.cost_center_id)?.name ?? '',
            chartOfAccounts: planoContasList.find(p => p.id === cls.plano_de_contas_id)?.name ?? '',
        });
        // 2. Obter resumo de custos por obra
        const summary = await this.getWorksiteCostSummary(runId);
        const orgTerceirosTaxes = getOrgTerceirosTaxes(run.org_id);
        console.log(`[PAYROLL-SYNC] Resumo: ${summary.byWorksite.length} obras, custo total=${summary.total}`);

        // 2.1 Limpeza: remove lançamentos anteriores desta folha em internal_transactions.
        // O worksite loop abaixo cuida do cleanup no project.settings por obra individualmente.
        const laborPrefix = `labor-${runId}-`;
        try {
            await supabase
                .from('internal_transactions')
                .delete()
                .eq('organization_id', run.org_id)
                .eq('source_system', 'LABOR')
                .like('reference_id', `${laborPrefix}%`);
            console.log(`[PAYROLL-SYNC] Limpeza de internal_transactions concluída`);
        } catch (cleanErr: unknown) {
            const msg = cleanErr instanceof Error ? cleanErr.message : String(cleanErr);
            console.warn(`[PAYROLL-SYNC] Aviso na limpeza: ${msg}`);
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
        // Com rateio contábil, a dedução do adiantamento tem de ser abatida da
        // MESMA chave contábil onde ele foi lançado — senão o salário de um
        // centro de custo pagaria o adiantamento de outro.
        const deductionByWorksiteClass: Record<string, Record<string, number>> = {};
        const deductionUnallocatedByClass: Record<string, number> = {};

        // 4. Lançamentos individualizados (roda PRIMEIRO para acumular deduções)
        if (rubricasIndiv.length > 0) {
            const indivItems = await fetchPayrollItems('employee_id, code, amount', rubricasIndiv.map(r => r.code));
            console.log(`[PAYROLL-SYNC] Itens individualizados encontrados: ${indivItems.length}`);

            if (indivItems.length > 0) {
                const empIds = [...new Set(indivItems.map(i => i.employee_id))];
                const [{ data: empRows }, ...allocResults] = await Promise.all([
                    // cost_center_id/plano_de_contas_id: o OVERRIDE do
                    // colaborador sobre a classificação do ciclo — só vale aqui
                    // e no syncEmployeeToFinance, onde a linha é de UM
                    // colaborador.
                    supabase.from('employees').select('id, name, cost_center_id, plano_de_contas_id').in('id', empIds as string[]),
                    ...empIds.map(id => this.listAllocations(id, period)),
                ]);
                type EmpRow = { id: string; name: string; cost_center_id?: string | null; plano_de_contas_id?: string | null };
                const empMap: Record<string, string> = Object.fromEntries(
                    (empRows || []).map((e: EmpRow) => [e.id, e.name])
                );
                const empClassMap: Record<string, EmpRow> = Object.fromEntries(
                    (empRows || []).map((e: EmpRow) => [e.id, e])
                );
                const allocByEmpId: Record<string, Awaited<ReturnType<typeof this.listAllocations>>> = {};
                empIds.forEach((id, idx) => { allocByEmpId[id] = allocResults[idx] as Awaited<ReturnType<typeof this.listAllocations>>; });

                // Rateio contábil do mês: a rubrica individualizada segue as
                // mesmas fatias do colaborador (é custo dele).
                const splitsIndiv = await this.listCostSplitsForEmployees(empIds as string[], period)
                    .catch(() => ({} as Record<string, EmployeeCostSplit[]>));

                const [runYear, runMonth] = run.start_date.slice(0, 7).split('-');

                // Coleta updates de project.settings para executar em paralelo
                type IndivProjectUpdate = { projectId: string; refId: string; txEntry: ProjectFinancialTx };
                const indivProjectUpdates: IndivProjectUpdate[] = [];

                for (const item of indivItems) {
                    const rubric = rubricasIndiv.find(r => r.code === item.code);
                    const absAmount = Math.abs(item.amount || 0);
                    if (!rubric || absAmount <= 0) continue;

                    const txDate = rubric.dia_lancamento
                        ? `${runYear}-${runMonth}-${String(rubric.dia_lancamento).padStart(2, '0')}`
                        : run.end_date;
                    const empName = empMap[item.employee_id] || item.employee_id;
                    const empAllocations = allocByEmpId[item.employee_id] || [];
                    const itemShares = resolvePayrollShares(run, empClassMap[item.employee_id], splitsIndiv[item.employee_id]);

                    if (empAllocations.length > 0) {
                        for (const alloc of empAllocations) {
                            if ((alloc.allocation_percent || 0) <= 0) continue;
                            const allocAmount = Math.round((absAmount * (alloc.allocation_percent / 100)) * 100) / 100;
                            if (allocAmount <= 0) continue;

                            // Acumula dedução para ser usada no passo 3
                            deductionByWorksite[alloc.project_id] = (deductionByWorksite[alloc.project_id] || 0) + allocAmount;

                            const worksiteName = alloc.worksite_name || '';
                            const description = worksiteName
                                ? `${rubric.name} - ${empName} - ${worksiteName} - Folha ${formattedPeriod}`
                                : `${rubric.name} - ${empName} - Folha ${formattedPeriod}`;

                            // Uma linha por fatia contábil. Sem rateio é uma só,
                            // com o reference_id de sempre.
                            const valores = dividirValor(allocAmount, itemShares);
                            itemShares.forEach((fatia, i) => {
                                const valor = valores[i];
                                if (valor <= 0) return;
                                const refId = `labor-${runId}-indiv-${item.code}-${item.employee_id}-${alloc.project_id}${sufixoDaFatia(itemShares, fatia)}`;
                                const chave = classificationKey(fatia);
                                (deductionByWorksiteClass[alloc.project_id] ||= {});
                                deductionByWorksiteClass[alloc.project_id][chave] =
                                    (deductionByWorksiteClass[alloc.project_id][chave] || 0) + valor;

                                indivProjectUpdates.push({
                                    projectId: alloc.project_id,
                                    refId,
                                    txEntry: {
                                        id: refId,
                                        date: txDate,
                                        type: 'EXPENSE',
                                        category: 'Folha de Pagamento',
                                        description,
                                        value: valor,
                                        status: 'PENDING',
                                        notes: `Parcela individualizada — ${rubric.name}. Folha ID: ${runId}`,
                                        ...nomeDaClassificacao(fatia),
                                    },
                                });

                                internalTxs.push({
                                    organization_id:  run.org_id,
                                    source_system:    'LABOR',
                                    reference_id:     refId,
                                    transaction_date: txDate,
                                    amount:           valor,
                                    direction:        'DEBIT',
                                    description,
                                    category:         rubric.name,
                                    status:           'PENDING',
                                    project_id:       alloc.project_id,
                                    party_name:       empName,
                                    party_type:       'EMPLOYEE',
                                    cost_center_id:     fatia.cost_center_id,
                                    plano_de_contas_id: fatia.plano_de_contas_id,
                                });
                            });
                        }
                    } else {
                        // Sem alocação — acumula como não-alocado
                        deductionUnallocated += absAmount;
                        const valores = dividirValor(absAmount, itemShares);
                        itemShares.forEach((fatia, i) => {
                            const valor = valores[i];
                            if (valor <= 0) return;
                            const chave = classificationKey(fatia);
                            deductionUnallocatedByClass[chave] = (deductionUnallocatedByClass[chave] || 0) + valor;
                            const refId = `labor-${runId}-indiv-${item.code}-${item.employee_id}${sufixoDaFatia(itemShares, fatia)}`;
                            internalTxs.push({
                                organization_id:  run.org_id,
                                source_system:    'LABOR',
                                reference_id:     refId,
                                transaction_date: txDate,
                                amount:           valor,
                                direction:        'DEBIT',
                                description:      `${rubric.name} - ${empName} (Não Alocado) - Folha ${formattedPeriod}`,
                                category:         rubric.name,
                                status:           'PENDING',
                                party_name:       empName,
                                party_type:       'EMPLOYEE',
                                cost_center_id:     fatia.cost_center_id,
                                plano_de_contas_id: fatia.plano_de_contas_id,
                            });
                        });
                    }
                }

                // Aplica updates de project.settings em paralelo (1 load+save por projeto único)
                if (indivProjectUpdates.length > 0) {
                    const uniqueIndivProjectIds = [...new Set(indivProjectUpdates.map(u => u.projectId))];
                    const indivProjects = await Promise.all(uniqueIndivProjectIds.map(id => projectService.loadProject(id)));
                    const indivProjectMap: Record<string, typeof indivProjects[0]> = {};
                    uniqueIndivProjectIds.forEach((id, idx) => { indivProjectMap[id] = indivProjects[idx]; });

                    await Promise.all(uniqueIndivProjectIds.map(async (projectId) => {
                        const project = indivProjectMap[projectId];
                        if (!project) return;
                        const settings = project.settings as ProjectSettings;
                        const info = settings.financialInfo || { totalValue: 0, paymentMethod: 'Variavel', installments: [], transactions: [] };
                        const updatesForProject = indivProjectUpdates.filter(u => u.projectId === projectId);
                        const refIdsToRemove = new Set(updatesForProject.map(u => u.refId));
                        const filtered = (info.transactions as ProjectFinancialTx[] || []).filter(t => !refIdsToRemove.has(t.id as string));
                        try {
                            await projectService.saveProject({
                                ...project,
                                settings: {
                                    ...settings,
                                    financialInfo: { ...info, transactions: [...updatesForProject.map(u => u.txEntry), ...filtered] }
                                }
                            });
                        } catch (projErr: unknown) {
                            const errMsg = projErr instanceof Error ? projErr.message : String(projErr);
                            errors.push(`Erro ao salvar lançamentos individualizados em ${projectId}: ${errMsg}`);
                        }
                    }));
                }
            }
        }

        console.log('[PAYROLL-SYNC] Deduções acumuladas por obra:', deductionByWorksite, '| Não alocado:', deductionUnallocated);

        // 3. Processar custos por obra — gera três lançamentos separados: salário, encargos e contribuições de terceiros
        // Filtra obras com custo > 0 e pré-carrega todos os projetos em paralelo
        type WorksiteEntry = { worksite: typeof summary.byWorksite[0]; netSalaryCost: number; encargosCost: number };
        const activeWorksites: WorksiteEntry[] = summary.byWorksite.map(worksite => {
            const deduction = deductionByWorksite[worksite.id] || 0;
            return {
                worksite,
                netSalaryCost: Math.max(0, Math.round((worksite.netSalary - deduction) * 100) / 100),
                encargosCost:  Math.max(0, Math.round(worksite.encargos * 100) / 100),
            };
        }).filter(e => e.netSalaryCost > 0 || e.encargosCost > 0 ||
            orgTerceirosTaxes.some(t => Math.round(e.worksite.gross * t.rate * 100) / 100 > 0));

        // Carrega todos os projetos em paralelo
        const worksiteProjects = await Promise.all(activeWorksites.map(e => projectService.loadProject(e.worksite.id)));

        // Coleta internalTxs e newTransactions por projeto (síncrono)
        type WorksiteSavePayload = { project: Awaited<ReturnType<typeof projectService.loadProject>>; newTransactions: ProjectFinancialTx[]; filteredTransactions: ProjectFinancialTx[] };
        const worksiteSavePayloads: WorksiteSavePayload[] = [];

        for (let wi = 0; wi < activeWorksites.length; wi++) {
            const { worksite, netSalaryCost, encargosCost } = activeWorksites[wi];
            const contribuicoesCost = Math.max(0, Math.round(worksite.contribuicoes * 100) / 100);
            const project = worksiteProjects[wi];
            if (!project) {
                console.warn(`[PAYROLL-SYNC] Projeto ${worksite.id} não encontrado`);
                continue;
            }

            const settings = project.settings as ProjectSettings;
            const info = settings.financialInfo || { totalValue: 0, paymentMethod: 'Variavel', installments: [], transactions: [] };
            const empLabel = worksite.employees?.length ? worksite.employees.join(', ') : '';

            const refIdSalario  = `labor-${runId}-${worksite.id}-salario`;
            const refIdEncargos = `labor-${runId}-${worksite.id}-encargos`;
            const oldRefId      = `labor-${runId}-${worksite.id}`;
            const worksitePrefix = `labor-${runId}-${worksite.id}-`;
            const filteredTransactions = (info.transactions as ProjectFinancialTx[] || []).filter(t =>
                t.id !== oldRefId && !String(t.id || '').startsWith(worksitePrefix)
            );

            const newTransactions: ProjectFinancialTx[] = [];

            // Uma passada por CHAVE CONTÁBIL da obra. Sem rateio em ninguém,
            // `byClass` tem uma entrada só, `sufixoDoBucket` é vazio e os
            // reference_id saem idênticos aos de antes desta feature.
            const buckets = Object.values(worksite.byClass);
            const multiplo = buckets.length > 1;
            const sufixoDoBucket = (b: WorksiteClassBucket) => (multiplo ? `-cls-${classificationKey(b)}` : '');
            const deducaoDaChave = deductionByWorksiteClass[worksite.id] || {};

            for (const bucket of buckets) {
                const bucketClass: PayrollClassification = {
                    cost_center_id: bucket.cost_center_id,
                    plano_de_contas_id: bucket.plano_de_contas_id,
                };
                const bucketNames = nomeDaClassificacao(bucketClass);
                const sufixo = sufixoDoBucket(bucket);
                const empLabelBucket = bucket.employees?.length ? bucket.employees.join(', ') : empLabel;

                const bucketSalario = Math.max(0, Math.round(
                    (bucket.netSalary - (deducaoDaChave[classificationKey(bucket)] || 0)) * 100) / 100);
                const bucketEncargos = Math.max(0, Math.round(bucket.encargos * 100) / 100);

                if (bucketSalario > 0) {
                    const refId = `${refIdSalario}${sufixo}`;
                    const descSalario = empLabelBucket
                        ? `Salários - ${empLabelBucket} - ${worksite.name} - Folha ${formattedPeriod}`
                        : `Salários - ${worksite.name} - Folha ${formattedPeriod}`;
                    newTransactions.push({
                        id: refId, date: run.end_date, type: 'EXPENSE',
                        category: 'Folha de Pagamento', description: descSalario,
                        value: bucketSalario, status: 'PENDING',
                        notes: `Salário líquido dos colaboradores. Folha ID: ${runId}`,
                        ...bucketNames,
                    });
                    internalTxs.push({
                        organization_id: run.org_id, source_system: 'LABOR', reference_id: refId,
                        transaction_date: run.end_date, amount: bucketSalario, direction: 'DEBIT',
                        description: descSalario, category: 'Folha de Pagamento', status: 'PENDING',
                        project_id: worksite.id,
                        party_name: credorDeColaboradores(bucket.employees || []),
                        party_type: 'EMPLOYEE',
                        ...bucketClass,
                    });
                }

                if (bucketEncargos > 0) {
                    const refId = `${refIdEncargos}${sufixo}`;
                    const descEncargos = `Encargos Patronais - ${worksite.name} - Folha ${formattedPeriod}`;
                    newTransactions.push({
                        id: refId, date: run.end_date, type: 'EXPENSE',
                        category: 'Encargos Patronais', description: descEncargos,
                        value: bucketEncargos, status: 'PENDING',
                        notes: `Encargos patronais (FGTS e demais). Folha ID: ${runId}`,
                        ...bucketNames,
                    });
                    internalTxs.push({
                        organization_id: run.org_id, source_system: 'LABOR', reference_id: refId,
                        transaction_date: run.end_date, amount: bucketEncargos, direction: 'DEBIT',
                        description: descEncargos, category: 'Encargos Patronais', status: 'PENDING',
                        project_id: worksite.id,
                        party_name: CREDOR_ENCARGOS,
                        party_type: 'GOVERNMENT',
                        ...bucketClass,
                    });
                }

                for (const tax of orgTerceirosTaxes) {
                    const taxCost = Math.max(0, Math.round(bucket.gross * tax.rate * 100) / 100);
                    if (taxCost <= 0) continue;
                    const refIdTax = `labor-${runId}-${worksite.id}-terceiros-${tax.code}${sufixo}`;
                    const descTax = `${tax.name} (${(tax.rate * 100).toFixed(1)}%) - ${worksite.name} - Folha ${formattedPeriod}`;
                    newTransactions.push({
                        id: refIdTax, date: run.end_date, type: 'EXPENSE',
                        category: 'Contribuições de Terceiros', description: descTax,
                        value: taxCost, status: 'PENDING',
                        notes: `Contribuição de terceiros — código ${tax.code}. Folha ID: ${runId}`,
                        ...bucketNames,
                    });
                    internalTxs.push({
                        organization_id: run.org_id, source_system: 'LABOR', reference_id: refIdTax,
                        transaction_date: run.end_date, amount: taxCost, direction: 'DEBIT',
                        description: descTax, category: 'Contribuições de Terceiros', status: 'PENDING',
                        project_id: worksite.id,
                        party_name: tax.name,
                        party_type: 'GOVERNMENT',
                        ...bucketClass,
                    });
                }
            }
            console.log(`[PAYROLL-SYNC] Obra ${worksite.name}: salário=${netSalaryCost} | encargos=${encargosCost} | contribuições=${contribuicoesCost}`);
            worksiteSavePayloads.push({ project, newTransactions, filteredTransactions });
        }

        // Salva todos os projetos em paralelo
        await Promise.all(worksiteSavePayloads.map(async ({ project, newTransactions, filteredTransactions }) => {
            const settings = project!.settings as ProjectSettings;
            const info = settings.financialInfo || { totalValue: 0, paymentMethod: 'Variavel', installments: [], transactions: [] };
            try {
                await projectService.saveProject({
                    ...project!,
                    settings: { ...settings, financialInfo: { ...info, transactions: [...newTransactions, ...filteredTransactions] } }
                });
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                errors.push(`Erro ao salvar projeto ${project!.id}: ${errMsg}`);
            }
        }));

        // 3.b. Custos não alocados — mesma quebra por chave contábil da 3.
        const unallocBuckets = Object.values(summary.unallocatedByClass || {});
        const unallocMultiplo = unallocBuckets.length > 1;

        for (const bucket of unallocBuckets) {
            const bucketClass: PayrollClassification = {
                cost_center_id: bucket.cost_center_id,
                plano_de_contas_id: bucket.plano_de_contas_id,
            };
            const chave  = classificationKey(bucket);
            const sufixo = unallocMultiplo ? `-cls-${chave}` : '';

            const salarioUnalloc = Math.max(0, Math.round(
                (bucket.netSalary - (deductionUnallocatedByClass[chave] || 0)) * 100) / 100);
            const encargosUnalloc = Math.max(0, Math.round(bucket.encargos * 100) / 100);

            if (salarioUnalloc > 0) {
                internalTxs.push({
                    organization_id: run.org_id,
                    source_system: 'LABOR',
                    reference_id: `labor-${runId}-unallocated-salario${sufixo}`,
                    transaction_date: run.end_date,
                    amount: salarioUnalloc,
                    direction: 'DEBIT',
                    description: `Salários - Custo Administrativo (Não Alocado) - Folha ${formattedPeriod}`,
                    category: 'Folha de Pagamento',
                    status: 'PENDING',
                    party_name: credorDeColaboradores(bucket.employees?.length ? bucket.employees : (summary.unallocatedEmployees || [])),
                    party_type: 'EMPLOYEE',
                    ...bucketClass,
                });
            }
            if (encargosUnalloc > 0) {
                internalTxs.push({
                    organization_id: run.org_id,
                    source_system: 'LABOR',
                    reference_id: `labor-${runId}-unallocated-encargos${sufixo}`,
                    transaction_date: run.end_date,
                    amount: encargosUnalloc,
                    direction: 'DEBIT',
                    description: `Encargos Patronais - Custo Administrativo (Não Alocado) - Folha ${formattedPeriod}`,
                    category: 'Encargos Patronais',
                    status: 'PENDING',
                    party_name: CREDOR_ENCARGOS,
                    party_type: 'GOVERNMENT',
                    ...bucketClass,
                });
            }
            for (const tax of orgTerceirosTaxes) {
                const taxCostUnalloc = Math.max(0, Math.round(bucket.gross * tax.rate * 100) / 100);
                if (taxCostUnalloc <= 0) continue;
                internalTxs.push({
                    organization_id: run.org_id,
                    source_system: 'LABOR',
                    reference_id: `labor-${runId}-unallocated-terceiros-${tax.code}${sufixo}`,
                    transaction_date: run.end_date,
                    amount: taxCostUnalloc,
                    direction: 'DEBIT',
                    description: `${tax.name} (${(tax.rate * 100).toFixed(1)}%) - Custo Adm. (Não Alocado) - Folha ${formattedPeriod}`,
                    category: 'Contribuições de Terceiros',
                    status: 'PENDING',
                    party_name: tax.name,
                    party_type: 'GOVERNMENT',
                    ...bucketClass,
                });
            }
        }

        // 5. Upsert na tabela centralizada internal_transactions
        if (internalTxs.length > 0) {
            // Enriquece com campos de AP: due_date e business_status
            // cost_center_id/plano_de_contas_id entram SEMPRE, mesmo null: o
            // PostgREST monta o upsert pela união das chaves do array, e uma
            // linha sem a chave receberia o default em vez do valor pretendido.
            const enrichedTxs = internalTxs.map(tx => ({
                ...tx,
                due_date:           tx.due_date        ?? paymentDueDate,
                business_status:    tx.business_status ?? 'PREVISTO',
                cost_center_id:     tx.cost_center_id     ?? null,
                plano_de_contas_id: tx.plano_de_contas_id ?? null,
            }));
            const { error } = await supabase
                .from('internal_transactions')
                .upsert(enrichedTxs, { onConflict: 'organization_id,reference_id,entry_type' });
            if (error) {
                console.error('[PAYROLL-SYNC] Erro no upsert de internal_transactions:', error);
                errors.push(`Erro interno_transactions: ${error.message}`);
            } else {
                console.log(`[PAYROLL-SYNC] Sincronizados ${enrichedTxs.length} registros (due_date=${paymentDueDate})`);
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
            const userEmail = user?.email || 'sistema@opura.com';
            
            await supabase.from('payroll_audit_logs').insert([{
                ...log,
                user_email: userEmail
            }]);
        } catch (err) {
            console.warn('Falha ao registrar log de auditoria:', err);
        }
    },

    async listAuditLogs(orgId: string | null, entity_type?: string, entity_id?: string) {
        let query = supabase.from('payroll_audit_logs').select('id, org_id, user_email, action, entity_type, entity_id, old_data, new_data, description, created_at');
        if (orgId && orgId !== 'all') query = query.eq('org_id', orgId);
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
    async getLatestClosedResultForEmployee(orgId: string | null, employeeId: string, period?: string) {
        const results = await this.getClosedResultsForEmployee(orgId, employeeId, period);
        return results.find(r => r.run_type === 'mensal') ?? results[0] ?? null;
    },

    // orgId ausente/'' /'all' = "Todas as organizações" (REGRA #5): não filtra por org.
    async getClosedResultsForEmployee(orgId: string | null | undefined, employeeId: string, period?: string) {
        let runsQuery = supabase
            .from('payroll_runs')
            .select('id, start_date, end_date, type')
            .eq('status', 'FECHADO')
            .in('type', ['mensal', 'adiantamento'])
            .order('end_date', { ascending: false });

        if (orgId && orgId !== 'all') runsQuery = runsQuery.eq('org_id', orgId);

        if (period) {
            const [y, m] = period.split('-');
            const firstDay = `${y}-${m}-01`;
            const lastDay = new Date(Number(y), Number(m), 0).toISOString().split('T')[0];
            runsQuery = runsQuery.gte('start_date', firstDay).lte('end_date', lastDay);
        }

        const { data: runs, error: runErr } = await runsQuery;
        if (runErr) throw runErr;
        if (!runs || runs.length === 0) return [];

        const results = await Promise.all(
            runs.map(async run => {
                const { data: result } = await supabase
                    .from('payroll_results')
                    .select('gross, discounts, net, employer_cost')
                    .eq('payroll_run_id', run.id)
                    .eq('employee_id', employeeId)
                    .maybeSingle();
                if (!result) return null;
                return {
                    run_id: run.id,
                    run_period: run.start_date.slice(0, 7),
                    run_type: run.type as string,
                    gross: result.gross as number,
                    discounts: result.discounts as number,
                    net: result.net as number,
                    employer_cost: result.employer_cost as number,
                };
            })
        );

        return results.filter(Boolean) as {
            run_id: string; run_period: string; run_type: string;
            gross: number; discounts: number; net: number; employer_cost: number;
        }[];
    },

    /** Lista centros de custo da organização (cost_centers_v2 — módulo dedicado "Centro de Custo") */
    // orgId ausente/'' /'all' = "Todas as organizações" (REGRA #5): não filtra —
    // a RLS recorta o que o usuário pode ver. Filtrar com '' fazia o PostgREST
    // devolver 22P02 (invalid input syntax for type uuid) e derrubar a aba inteira.
    //
    // ⚠️ O 'all' NÃO é hipotético: `LaborModule.tsx:494` passa `orgId ?? 'all'`
    // para a tela de folha (lá 'all' significa "processar todas as empresas"),
    // e esse valor desce até aqui. Sem a tolerância, os selects de Centro de
    // Custo da folha e do colaborador nascem vazios.
    // `project_id` é a obra vinculada ao centro de custo (migration
    // 20270907000000). A aba Alocações usa isso para alocar o colaborador na
    // obra sozinha — ver `derivarAlocacaoPorCentroDeCusto`.
    async listCostCenters(orgId?: string | null) {
        let query = supabase
            .from('cost_centers_v2')
            .select('id, name, code, project_id');
        if (orgId && orgId !== 'all') query = query.eq('organization_id', orgId);
        const { data, error } = await query.order('code');
        if (error) throw error;
        return (data || []) as { id: string; name: string; code?: string; project_id?: string | null }[];
    },

    /**
     * Lista o Plano de Contas da organização (`plano_de_contas`, módulo
     * dedicado em Minha Organização). Dimensão DIFERENTE de Centro de Custo
     * (`listCostCenters` acima) e de Categoria Financeira
     * (`listChartOfAccounts` abaixo) — não misturar os três.
     * Mesma regra de org do `listCostCenters` (REGRA #5).
     */
    async listPlanoContas(orgId?: string | null) {
        let query = supabase
            .from('plano_de_contas')
            .select('id, name, code');
        if (orgId && orgId !== 'all') query = query.eq('organization_id', orgId);
        const { data, error } = await query.order('code');
        if (error) throw error;
        return (data || []) as { id: string; name: string; code?: string }[];
    },

    /** Lista categorias financeiras (substitui chart_of_accounts — aposentado jun/2026) */
    async listChartOfAccounts(_orgId?: string | null) {
        const { data, error } = await supabase
            .from('financial_categories')
            .select('id, name')
            .order('name');
        if (error) throw error;
        return (data || []) as { id: string; name: string; code?: string; type?: string }[];
    },

    /**
     * Sincroniza manualmente o custo de UM funcionário para os projetos
     * designados, classificando os lançamentos pelo rateio contábil do mês.
     *
     * Até 2026-08-23 esta função recebia SEIS nomes de Centro de Custo/Plano
     * escolhidos na hora, na tela de Alocações, e guardados em `localStorage`.
     * Eram uma fonte de verdade paralela: o mesmo colaborador podia ser lançado
     * com classificações diferentes dependendo de quem clicou e de qual
     * navegador. Agora a classificação sai de `resolvePayrollShares`
     * (rateio do mês → colaborador → ciclo), que está no banco.
     */
    async syncEmployeeToFinance(
        runId: string,
        employeeId: string,
        employeeName: string,
        totalCost: number,
        allocations: { project_id: string, allocation_percent: number }[],
        individualizadoLancamentos?: { rubricCode: string; rubricName: string; amount: number; txDate: string }[],
        netSalary?: number,
        grossSalary?: number,
    ) {
        // 1. Obter meta-dados da folha
        const run = await this.getRun(runId);
        const period = run.start_date.slice(0, 7);
        const [year, month] = period.split('-');
        const formattedPeriod = `${month}/${year}`;

        // Classificação contábil da linha: rateio do mês → colaborador → ciclo.
        // Aqui TODA linha é de um colaborador só, então tanto o override quanto
        // o rateio dele valem sempre. Ver "CLASSIFICAÇÃO CONTÁBIL DAS LINHAS DE
        // FOLHA" e "RATEIO CONTÁBIL DO COLABORADOR".
        const { data: empClassRow } = await supabase
            .from('employees')
            .select('cost_center_id, plano_de_contas_id')
            .eq('id', employeeId)
            .maybeSingle();
        const empSplits = await this.listCostSplits(employeeId, period).catch(() => [] as EmployeeCostSplit[]);
        const empShares = resolvePayrollShares(
            run,
            empClassRow as { cost_center_id?: string | null; plano_de_contas_id?: string | null } | null,
            empSplits,
        );
        // Fatia principal — usada só para resolver o NOME no espelho do projeto,
        // que tem um campo de texto só e não comporta rateio.
        const empClass: PayrollClassification = {
            cost_center_id: empShares[0]?.cost_center_id ?? null,
            plano_de_contas_id: empShares[0]?.plano_de_contas_id ?? null,
        };

        // Nomes só para o espelho dentro de `project.settings.financialInfo`,
        // que guarda TEXTO. O que a tela de Alocações mandou continua tendo
        // precedência; a herança (e o rateio) só preenchem o que veio vazio.
        const [ccListEmp, pcListEmp] = await Promise.all([
            this.listCostCenters(run.org_id).catch(() => [] as { id: string; name: string }[]),
            this.listPlanoContas(run.org_id).catch(() => [] as { id: string; name: string }[]),
        ]);
        const nomeDaFatia = (cls: PayrollClassification) => ({
            costCenter:      ccListEmp.find(c => c.id === cls.cost_center_id)?.name ?? '',
            chartOfAccounts: pcListEmp.find(p => p.id === cls.plano_de_contas_id)?.name ?? '',
        });
        const nomesPrincipais      = nomeDaFatia(empClass);
        const costCenterLabel      = nomesPrincipais.costCenter;
        const chartOfAccountsLabel = nomesPrincipais.chartOfAccounts;

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

                // Cada valor da obra é dividido pelas fatias contábeis do
                // colaborador. Sem rateio há uma fatia só, o sufixo é vazio e
                // os reference_id saem idênticos aos de antes.
                if (salaryCost > 0) {
                    const desc = `Salários - ${employeeName} - Folha ${formattedPeriod}`;
                    const valores = dividirValor(salaryCost, empShares);
                    empShares.forEach((fatia, i) => {
                        const valor = valores[i];
                        if (valor <= 0) return;
                        const refId = `${refIdSalario}${sufixoDaFatia(empShares, fatia)}`;
                        const nomes = nomeDaFatia(fatia);
                        newTransactions.push({
                            id: refId,
                            date: run.end_date,
                            type: 'EXPENSE',
                            category: 'Folha de Pagamento',
                            description: desc,
                            value: valor,
                            status: 'PENDING',
                            notes: `Salário líquido. Funcionário: ${employeeName}`,
                            costCenter: nomes.costCenter || costCenterLabel,
                            chartOfAccounts: nomes.chartOfAccounts || chartOfAccountsLabel
                        });
                        internalTxs.push({
                            organization_id: run.org_id,
                            source_system: 'LABOR',
                            reference_id: refId,
                            transaction_date: run.end_date,
                            amount: valor,
                            direction: 'DEBIT',
                            description: desc,
                            category: 'Folha de Pagamento',
                            status: 'PENDING',
                            party_name: employeeName,
                            party_type: 'EMPLOYEE',
                            cost_center_id:     fatia.cost_center_id,
                            plano_de_contas_id: fatia.plano_de_contas_id,
                        });
                    });
                }

                if (encargosCost > 0) {
                    const desc = `Encargos Patronais - ${employeeName} - Folha ${formattedPeriod}`;
                    const valores = dividirValor(encargosCost, empShares);
                    empShares.forEach((fatia, i) => {
                        const valor = valores[i];
                        if (valor <= 0) return;
                        const refId = `${refIdEncargos}${sufixoDaFatia(empShares, fatia)}`;
                        const nomes = nomeDaFatia(fatia);
                        newTransactions.push({
                            id: refId,
                            date: run.end_date,
                            type: 'EXPENSE',
                            category: 'Encargos Patronais',
                            description: desc,
                            value: valor,
                            status: 'PENDING',
                            notes: `Encargos patronais (FGTS e demais). Funcionário: ${employeeName}`,
                            costCenter: nomes.costCenter || costCenterLabel,
                            chartOfAccounts: nomes.chartOfAccounts || chartOfAccountsLabel
                        });
                        internalTxs.push({
                            organization_id: run.org_id,
                            source_system: 'LABOR',
                            reference_id: refId,
                            transaction_date: run.end_date,
                            amount: valor,
                            direction: 'DEBIT',
                            description: desc,
                            category: 'Encargos Patronais',
                            status: 'PENDING',
                            party_name: CREDOR_ENCARGOS,
                            party_type: 'GOVERNMENT',
                            cost_center_id:     fatia.cost_center_id,
                            plano_de_contas_id: fatia.plano_de_contas_id,
                        });
                    });
                }

                for (const tax of orgTerceirosTaxes) {
                    const grossPct = grossSalary ? Math.round(grossSalary * pct * 100) / 100 : 0;
                    const taxCost = Math.max(0, Math.round(grossPct * tax.rate * 100) / 100);
                    if (taxCost <= 0) continue;
                    const desc = `${tax.name} (${(tax.rate * 100).toFixed(1)}%) - ${employeeName} - Folha ${formattedPeriod}`;
                    const valores = dividirValor(taxCost, empShares);
                    empShares.forEach((fatia, i) => {
                        const valor = valores[i];
                        if (valor <= 0) return;
                        const refIdTax = `labor-${runId}-${alloc.project_id}-${employeeId}-terceiros-${tax.code}${sufixoDaFatia(empShares, fatia)}`;
                        const nomes = nomeDaFatia(fatia);
                        newTransactions.push({
                            id: refIdTax,
                            date: run.end_date,
                            type: 'EXPENSE',
                            category: 'Contribuições de Terceiros',
                            description: desc,
                            value: valor,
                            status: 'PENDING',
                            notes: `Contribuição de terceiros — código ${tax.code}. Funcionário: ${employeeName}`,
                            costCenter: nomes.costCenter || costCenterLabel,
                            chartOfAccounts: nomes.chartOfAccounts || chartOfAccountsLabel
                        });
                        internalTxs.push({
                            organization_id: run.org_id,
                            source_system: 'LABOR',
                            reference_id: refIdTax,
                            transaction_date: run.end_date,
                            amount: valor,
                            direction: 'DEBIT',
                            description: desc,
                            category: 'Contribuições de Terceiros',
                            status: 'PENDING',
                            party_name: tax.name,
                            party_type: 'GOVERNMENT',
                            cost_center_id:     fatia.cost_center_id,
                            plano_de_contas_id: fatia.plano_de_contas_id,
                        });
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
                const valores = dividirValor(lc.amount, empShares);
                empShares.forEach((fatia, i) => {
                    const valor = valores[i];
                    if (valor <= 0) return;
                    const refId = `labor-${runId}-indiv-${lc.rubricCode}-${employeeId}${sufixoDaFatia(empShares, fatia)}`;
                    internalTxs.push({
                        organization_id:  run.org_id,
                        source_system:    'LABOR',
                        reference_id:     refId,
                        transaction_date: lc.txDate,
                        amount:           valor,
                        direction:        'DEBIT',
                        description:      `${lc.rubricName} - ${employeeName} - Folha ${formattedPeriod}`,
                        category:         'Folha de Pagamento',
                        status:           'PENDING',
                        party_name:       employeeName,
                        party_type:       'EMPLOYEE',
                        cost_center_id:     fatia.cost_center_id,
                        plano_de_contas_id: fatia.plano_de_contas_id,
                    });
                });
            }
        }

        // 4. Salvar na internal_transactions
        if (internalTxs.length > 0) {
            // As duas dimensões entram em todas as linhas, mesmo null — o
            // upsert do PostgREST usa a união das chaves do array.
            const classified = internalTxs.map(tx => ({
                ...tx,
                cost_center_id:     tx.cost_center_id     ?? null,
                plano_de_contas_id: tx.plano_de_contas_id ?? null,
            }));
            const { error } = await supabase
                .from('internal_transactions')
                .upsert(classified, { onConflict: 'organization_id,reference_id,entry_type' });
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
