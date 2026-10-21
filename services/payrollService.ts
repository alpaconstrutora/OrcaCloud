import { supabase } from '../lib/supabase';
import { projectService } from './projectService';
import { validateAllocationTotal } from '../lib/validators';
import type { ProjectSettings } from '../types';
import { fetchAllPages, type RangeableQuery } from '../lib/supabasePaginate';
import {
    encargosPadrao, montarLinhasDaFolha, fatiasDoColaborador, custoPorDestino, formaDoTitulo,
    tituloDaFolhaPreservado, chaveContabil, vencimentoDia20, diaDoMesSeguinte, distribuirCentavos,
    type EncargosConfig, type EmpresaRegime, type ColaboradorDaFolha, type ItemDaFolha, type OpcoesDaFolha,
    type TerceiroTax,
} from '../utils/folhaFinanceiro';

// Alíquotas patronais (CPP, RAT×FAP, terceiros) moram em payroll_encargos_config
// desde 21/10/2026 — antes os terceiros ficavam no localStorage de quem clicava.
export type { TerceiroTax, EncargosConfig } from '../utils/folhaFinanceiro';


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
    /** Desconto que o empregador repassa a outra entidade (sindicato, pensão): vira título na folha. */
    repasse_terceiros?: boolean;
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
//   • tributos (FGTS, INSS, IRRF, CPP, RAT, terceiros) → o NOME do tributo
//     (`utils/folhaFinanceiro.formaDoTitulo`), desde 21/10/2026 — antes era um
//     título só, "INSS/FGTS", com todos os descontos dentro;
//   • repasses (contribuição assistencial…) → o nome da rubrica.
//
// ⚠️ NUNCA gravar `party_id` aqui: a coluna tem FK para `clients`
// (`internal_txs_party_id_fkey`, migration 20261219000003) e um `employee_id`
// ali estoura a constraint. O vínculo do colaborador fica só no `reference_id`.
//
// `party_type = 'TAX'` é o discriminador de `vw_commercial_tax_payables`
// (Tributos a Pagar). Desde 21/10/2026 os TRIBUTOS da folha o usam de propósito
// (pedido do usuário: FGTS e INSS em Tributos, agrupáveis em DARF) — e SÓ eles:
// salário e adiantamento são 'EMPLOYEE'; repasses e encargos de rubrica,
// 'GOVERNMENT'. Plano: docs/planos/2026-10-21-folha-encargos-em-tributos-a-pagar.md

/** Discriminador de contraparte das linhas de folha. */
export type PayrollPartyType = 'EMPLOYEE' | 'TAX' | 'GOVERNMENT';

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
    project_id?: string | null;
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
// As linhas agregadas (por obra e "Não Alocado") somam vários colaboradores,
// mas cada um entra pela SUA classificação: o custo é dividido por chave
// contábil antes de agregar (`utils/folhaFinanceiro.montarLinhasDaFolha`).

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

/** Item da folha com o colaborador (payroll_items). */
export interface ItemDaFolhaComColaborador {
    id: string;
    employee_id: string;
    code: string;
    type: string;
    amount: number;
}

/** O que `syncPayrollToFinance` devolve — a tela de Ciclos mostra. */
export interface ResultadoSyncFolha {
    success: true;
    /** Títulos gravados (novos ou regravados). */
    count: number;
    /** Títulos de cálculo antigo apagados. */
    removidos: number;
    /** Títulos não tocados: pagos, conciliados, cancelados, em DARF ou com Asaas. */
    preservados: number;
    avisos: string[];
    /** Total por tributo (TAX) ou categoria. */
    totais: Record<string, number>;
    encargos: EncargosConfig;
    rubricasIndividualizadas: string[];
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
        // ⚠️ Os títulos financeiros da folha vêm ANTES: apagar a folha e deixar os
        // lançamentos em Contas a Pagar cria órfãos que ninguém mais consegue explicar,
        // porque a origem deles deixou de existir. Foi o que aconteceu até 09/2026:
        // 16 títulos órfãos, R$ 6.814,90, de duas folhas apagadas — apareciam como
        // pendências reais e competiam por conciliação. Ver
        // `docs/planos/2026-09-05-titulos-duplicados-por-sincronizacao.md`.
        await this.cancelarTitulosDaFolha(id);

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

    /**
     * Cancela os lançamentos financeiros gerados por uma folha.
     *
     * Cancela, não apaga: o título pode já estar conciliado com o extrato, e nesse
     * caso apagar deixaria o vínculo apontando para o nada. Um título conciliado é
     * preservado como está e reportado — desfazer a conciliação é decisão de quem
     * está apagando a folha, não efeito colateral.
     *
     * O `reference_id` é `labor-{id da folha}-...` (ver as gravações em
     * `sincronizarFinanceiro`), por isso o filtro é por prefixo.
     */
    async cancelarTitulosDaFolha(runId: string): Promise<{ cancelados: number; conciliadosPreservados: number }> {
        const { data: titulos, error } = await supabase
            .from('internal_transactions')
            .select('id, status, business_status, darf_id')
            .in('source_system', ['LABOR', 'PROJECT'])
            .like('reference_id', `labor-${runId}-%`);
        if (error) throw error;
        if (!titulos || titulos.length === 0) return { cancelados: 0, conciliadosPreservados: 0 };

        const ids = titulos.map(t => t.id);
        const { data: vinculados } = await supabase
            .from('reconciliation_matches')
            .select('internal_transaction_id')
            .in('internal_transaction_id', ids);
        const conciliados = new Set((vinculados ?? []).map(v => v.internal_transaction_id));

        // Pago ou em DARF também fica: cancelar título pago sumiria com a saída de
        // caixa, e o banco recusa mexer em membro de DARF (desagrupe antes).
        const cancelaveis = titulos
            .filter(t => !conciliados.has(t.id) && !tituloDaFolhaPreservado(t))
            .map(t => t.id);
        if (cancelaveis.length > 0) {
            const { error: updErr } = await supabase
                .from('internal_transactions')
                .update({ status: 'CANCELLED' })
                .in('id', cancelaveis);
            if (updErr) throw updErr;
        }
        if (conciliados.size > 0) {
            console.warn(`[PAYROLL] ${conciliados.size} título(s) desta folha estão conciliados com o extrato e foram preservados.`);
        }
        return { cancelados: cancelaveis.length, conciliadosPreservados: conciliados.size };
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
            .select('code, name, type, incidence_inss, incidence_fgts, incidence_irrf, is_automatic, is_clt_mandatory, calculation_type, calculation_config, category, formula, active, lancamento_individualizado, dia_lancamento, repasse_terceiros')
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
            .select('code, name, type, incidence_inss, incidence_fgts, incidence_irrf, is_automatic, is_clt_mandatory, calculation_type, calculation_config, category, formula, active, lancamento_individualizado, dia_lancamento, repasse_terceiros')
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

    // ============================================================
    // FINANCEIRO DA FOLHA
    // ============================================================
    // Plano: docs/planos/2026-10-21-folha-encargos-em-tributos-a-pagar.md
    // O QUE vira título está em utils/folhaFinanceiro.ts (puro, testado). Aqui
    // só se carrega a folha e se grava, preservando o que já tem dinheiro ou
    // decisão do usuário em cima.

    /**
     * Alíquotas patronais da folha da organização (`payroll_encargos_config`).
     * Sem linha gravada, o padrão vem do regime da empresa matriz.
     */
    async getEncargosConfig(orgId: string): Promise<EncargosConfig> {
        const [cfgRes, empRes] = await Promise.all([
            supabase.from('payroll_encargos_config')
                .select('cpp_rate, rat_rate, fap, terceiros')
                .eq('organization_id', orgId)
                .maybeSingle(),
            supabase.from('companies')
                .select('regime_tributario, simples_anexo_iv, cprb')
                .eq('org_id', orgId)
                .eq('is_headquarters', true)
                .limit(1)
                .maybeSingle(),
        ]);
        if (cfgRes.error) throw cfgRes.error;
        const padrao = encargosPadrao(empRes.data as EmpresaRegime | null);
        const row = cfgRes.data as { cpp_rate: number; rat_rate: number; fap: number; terceiros: TerceiroTax[] | null } | null;
        if (!row) return padrao;
        return {
            cppRate: Number(row.cpp_rate),
            ratRate: Number(row.rat_rate),
            fap: Number(row.fap),
            terceiros: (row.terceiros ?? []).map(t => ({ code: String(t.code), name: String(t.name), rate: Number(t.rate) })),
            origem: 'salvo',
            motivo: null,
        };
    },

    async saveEncargosConfig(orgId: string, cfg: Pick<EncargosConfig, 'cppRate' | 'ratRate' | 'fap' | 'terceiros'>) {
        const { error } = await supabase.from('payroll_encargos_config').upsert({
            organization_id: orgId,
            cpp_rate: cfg.cppRate,
            rat_rate: cfg.ratRate,
            fap: cfg.fap,
            terceiros: cfg.terceiros,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' });
        if (error) throw error;
    },

    /** Apaga a configuração gravada: a org volta ao padrão do regime. */
    async resetEncargosConfig(orgId: string) {
        const { error } = await supabase.from('payroll_encargos_config').delete().eq('organization_id', orgId);
        if (error) throw error;
    },

    /** Itens da folha (todas as páginas — o PostgREST corta em 1000 em silêncio). */
    async listItemsDaFolha(runId: string): Promise<ItemDaFolhaComColaborador[]> {
        const { data, error } = await fetchAllPages<ItemDaFolhaComColaborador>(() =>
            supabase.from('payroll_items')
                .select('id, employee_id, code, type, amount')
                .eq('payroll_run_id', runId)
                .order('id') as unknown as RangeableQuery<ItemDaFolhaComColaborador>);
        if (error) throw error;
        return data;
    },

    /**
     * Tudo que o financeiro da folha precisa, no formato do cálculo puro:
     * colaboradores com itens, base do INSS e fatias (alocação em obra ×
     * rateio contábil), alíquotas da organização e rubricas.
     */
    async carregarFolhaParaFinanceiro(runId: string) {
        const run = await this.getRun(runId);
        const period = run.start_date.slice(0, 7);
        const results = await this.listResultsByRun(runId);
        const empIds = [...new Set(results.map(r => r.employee_id).filter(Boolean))] as string[];

        const [empRes, splitsByEmployee, allocByEmployee, itens, rubRes, cfg] = await Promise.all([
            empIds.length
                ? supabase.from('employees').select('id, name, cost_center_id, plano_de_contas_id').in('id', empIds)
                : Promise.resolve({ data: [], error: null }),
            this.listCostSplitsForEmployees(empIds, period),
            this.listAllocationsForEmployees(empIds, period),
            this.listItemsDaFolha(runId),
            supabase.from('rubrics').select('code, name, organization_id, lancamento_individualizado, dia_lancamento, repasse_terceiros'),
            this.getEncargosConfig(run.org_id),
        ]);
        if (empRes.error) throw empRes.error;
        if (rubRes.error) throw rubRes.error;

        type EmpRow = { id: string; name: string; cost_center_id?: string | null; plano_de_contas_id?: string | null };
        const empMap = new Map(((empRes.data || []) as EmpRow[]).map(e => [e.id, e]));

        // Rubrica por código: a da organização da folha vence a global, que vence
        // a de outra organização (mesma tolerância de antes, quando a busca não
        // filtrava organização).
        type RubRow = { code: string; name: string; organization_id: string | null; lancamento_individualizado: boolean | null; dia_lancamento: number | null; repasse_terceiros: boolean | null };
        const prioridade = (r: RubRow) => (r.organization_id === run.org_id ? 0 : r.organization_id == null ? 1 : 2);
        const rubricas = new Map<string, RubRow>();
        for (const r of (rubRes.data || []) as RubRow[]) {
            const atual = rubricas.get(r.code);
            if (!atual || prioridade(r) < prioridade(atual)) rubricas.set(r.code, r);
        }
        const opcoes: OpcoesDaFolha = {
            individualizados: new Set([...rubricas.values()].filter(r => r.lancamento_individualizado).map(r => r.code)),
            repasses: Object.fromEntries([...rubricas.values()].filter(r => r.repasse_terceiros).map(r => [r.code, r.name])),
            nomes: Object.fromEntries([...rubricas.values()].map(r => [r.code, r.name])),
        };

        const itensPorColab = new Map<string, ItemDaFolha[]>();
        for (const it of itens) {
            const lista = itensPorColab.get(it.employee_id) ?? [];
            lista.push({ code: it.code, type: it.type, amount: Number(it.amount) || 0 });
            itensPorColab.set(it.employee_id, lista);
        }

        const colabs: ColaboradorDaFolha[] = results.map(res => {
            const emp = empMap.get(res.employee_id);
            const alocacoes = (allocByEmployee[res.employee_id] || []).map(a => ({
                project_id: a.project_id, allocation_percent: a.allocation_percent, nome: a.worksite_name,
            }));
            return {
                employeeId: res.employee_id,
                nome: emp?.name || res.employee?.name || '',
                liquido: Number(res.net) || 0,
                bruto: Number(res.gross) || 0,
                baseInss: Number(res.base_inss ?? res.gross) || 0,
                custoEmpregador: Number(res.employer_cost) || 0,
                itens: itensPorColab.get(res.employee_id) ?? [],
                fatias: fatiasDoColaborador(alocacoes, resolvePayrollShares(run, emp, splitsByEmployee[res.employee_id])),
            };
        });

        return { run, period, colabs, cfg, rubricas, opcoes };
    },

    /**
     * Custo do empregador por obra (painel de custo da folha): bruto + FGTS e
     * encargos de rubrica + CPP + RAT + terceiros, pela alocação do mês.
     */
    async getWorksiteCostSummary(runId: string) {
        const { colabs, cfg } = await this.carregarFolhaParaFinanceiro(runId);
        const destinos = custoPorDestino(colabs, cfg);
        const naoAlocado = destinos.find(d => !d.destino);
        return {
            byWorksite: destinos.filter(d => d.destino).map(d => ({
                id: d.destino as string, name: d.destinoNome, cost: d.custo, employees: d.colaboradores,
            })),
            unallocated: naoAlocado?.custo ?? 0,
            unallocatedEmployees: naoAlocado?.colaboradores ?? [],
            total: Math.round(destinos.reduce((s, d) => s + d.custo, 0) * 100) / 100,
            encargos: cfg,
        };
    },

    /**
     * Grava o financeiro de uma folha: um título por encargo/retenção (FGTS,
     * INSS, IRRF, CPP, RAT, terceiros vão para Tributos a Pagar), salário,
     * repasses e rubricas individualizadas — por obra × chave contábil.
     *
     * Título pago, conciliado, cancelado à mão, em DARF ou com pagamento Asaas
     * NÃO é apagado nem regravado (`tituloDaFolhaPreservado`); se o novo
     * cálculo diverge dele, o retorno avisa. O resto é regravado pelo mesmo
     * `reference_id` (upsert) e o que sobrou de cálculo antigo é apagado.
     */
    async syncPayrollToFinance(runId: string): Promise<ResultadoSyncFolha> {
        const { run, period, colabs, cfg, rubricas, opcoes } = await this.carregarFolhaParaFinanceiro(runId);
        const [year, month] = period.split('-');
        const formattedPeriod = `${month}/${year}`;
        const venc20 = vencimentoDia20(period);
        const venc05 = diaDoMesSeguinte(period, 5);
        const prefixo = `labor-${runId}-`;
        const refSeguro = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]/g, '_');

        const desejados = new Map<string, InternalTransaction>();
        const guardar = (tx: InternalTransaction) => {
            const ja = desejados.get(tx.reference_id);
            if (ja) ja.amount = Math.round((ja.amount + tx.amount) * 100) / 100;
            else desejados.set(tx.reference_id, tx);
        };

        // 1. Salário, tributos e repasses por destino × chave contábil. O sufixo
        //    `-cls-` só aparece quando o destino tem mais de uma chave — quem não
        //    rateia mantém o reference_id de sempre.
        const linhas = montarLinhasDaFolha(colabs, cfg, opcoes);
        const chavesPorDestino = new Map<string, Set<string>>();
        for (const l of linhas) {
            const d = l.destino ?? 'unallocated';
            if (!chavesPorDestino.has(d)) chavesPorDestino.set(d, new Set());
            chavesPorDestino.get(d)!.add(chaveContabil(l));
        }
        for (const l of linhas) {
            const d = l.destino ?? 'unallocated';
            const sufixo = chavesPorDestino.get(d)!.size > 1 ? `-cls-${chaveContabil(l)}` : '';
            const forma = formaDoTitulo(l.tipo, opcoes.nomes);
            const onde = l.destino ? l.destinoNome : 'Custo Administrativo (Não Alocado)';
            guardar({
                organization_id: run.org_id,
                source_system: 'LABOR',
                reference_id: `${prefixo}${d}-${refSeguro(l.tipo)}${sufixo}`,
                transaction_date: run.end_date,
                due_date: forma.vencimento === 'dia20' ? venc20 : venc05,
                amount: l.valor,
                direction: 'DEBIT',
                description: `${forma.rotulo} - ${onde} - Folha ${formattedPeriod}`,
                category: forma.category,
                status: 'PENDING',
                business_status: 'PREVISTO',
                project_id: l.destino,
                party_name: forma.party_type === 'EMPLOYEE' ? credorDeColaboradores(l.colaboradores) : forma.party_name,
                party_type: forma.party_type,
                cost_center_id: l.cost_center_id,
                plano_de_contas_id: l.plano_de_contas_id,
            });
        }

        // 2. Rubricas individualizadas (adiantamento…): um título por
        //    colaborador e fatia, na data da rubrica — que é também o vencimento.
        const ultimoDia = new Date(Number(year), Number(month), 0).getDate();
        for (const c of colabs) {
            const porCodigo = new Map<string, number>();
            for (const it of c.itens) {
                if (!rubricas.get(it.code)?.lancamento_individualizado) continue;
                porCodigo.set(it.code, (porCodigo.get(it.code) || 0) + Math.abs(it.amount || 0));
            }
            const fatias = c.fatias.filter(f => f.share > 0);
            for (const [code, valor] of porCodigo) {
                if (valor <= 0 || fatias.length === 0) continue;
                const rub = rubricas.get(code)!;
                const data = rub.dia_lancamento
                    ? `${year}-${month}-${String(Math.min(rub.dia_lancamento, ultimoDia)).padStart(2, '0')}`
                    : run.end_date;
                const centavos = distribuirCentavos(Math.round(valor * 100), fatias.map(f => f.share));
                fatias.forEach((f, i) => {
                    if (centavos[i] <= 0) return;
                    const mesmoDestino = fatias.filter(g => g.destino === f.destino).length;
                    const sufixo = mesmoDestino > 1 ? `-cls-${chaveContabil(f)}` : '';
                    const onde = f.destino ? ` - ${f.destinoNome}` : ' (Não Alocado)';
                    guardar({
                        organization_id: run.org_id,
                        source_system: 'LABOR',
                        reference_id: `${prefixo}indiv-${code}-${c.employeeId}${f.destino ? `-${f.destino}` : ''}${sufixo}`,
                        transaction_date: data,
                        due_date: data,
                        amount: centavos[i] / 100,
                        direction: 'DEBIT',
                        description: `${rub.name} - ${c.nome}${onde} - Folha ${formattedPeriod}`,
                        category: rub.name,
                        status: 'PENDING',
                        business_status: 'PREVISTO',
                        project_id: f.destino,
                        party_name: c.nome,
                        party_type: 'EMPLOYEE',
                        cost_center_id: f.cost_center_id,
                        plano_de_contas_id: f.plano_de_contas_id,
                    });
                });
            }
        }

        // 3. O que já existe desta folha, e o que não pode ser tocado.
        // 'PROJECT' também: o espelho da obra rebaixava título da folha para
        // 'PROJECT' (financialSyncService, corrigido em 21/10/2026). O prefixo
        // `labor-{folha}-` é só da folha, qualquer que seja a origem gravada.
        const { data: existentesRaw, error: eEx } = await supabase
            .from('internal_transactions')
            .select('id, reference_id, description, amount, status, business_status, darf_id, project_id')
            .eq('organization_id', run.org_id)
            .in('source_system', ['LABOR', 'PROJECT'])
            .like('reference_id', `${prefixo}%`);
        if (eEx) throw new Error(`Não foi possível ler os títulos atuais da folha: ${eEx.message}`);
        type Existente = { id: string; reference_id: string; description: string | null; amount: number; status: string | null; business_status: string | null; darf_id: string | null; project_id: string | null };
        const existentes = (existentesRaw || []) as Existente[];
        const conciliados = new Set<string>();
        const comAsaas = new Set<string>();
        for (let i = 0; i < existentes.length; i += 80) {
            const ids = existentes.slice(i, i + 80).map(e => e.id);
            const [conc, asaas] = await Promise.all([
                supabase.from('reconciliation_matches').select('internal_transaction_id').in('internal_transaction_id', ids),
                supabase.from('supplier_payments').select('transaction_id').in('transaction_id', ids),
            ]);
            if (conc.error) throw new Error(`Não foi possível conferir a conciliação dos títulos da folha: ${conc.error.message}`);
            if (asaas.error) throw new Error(`Não foi possível conferir os pagamentos Asaas da folha: ${asaas.error.message}`);
            (conc.data || []).forEach((m: { internal_transaction_id: string }) => conciliados.add(m.internal_transaction_id));
            (asaas.data || []).forEach((p: { transaction_id: string }) => comAsaas.add(p.transaction_id));
        }
        const preservados = new Map<string, Existente>();
        for (const e of existentes) {
            if (tituloDaFolhaPreservado({ ...e, conciliado: conciliados.has(e.id), pagamentoAsaas: comAsaas.has(e.id) })) {
                preservados.set(e.reference_id, e);
            }
        }

        const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const avisos: string[] = [];
        for (const [ref, tx] of desejados) {
            const p = preservados.get(ref);
            if (p && p.status !== 'CANCELLED' && Math.abs((p.amount || 0) - tx.amount) >= 0.01) {
                avisos.push(`${tx.description}: mantido em ${brl(p.amount)} (pago, conciliado ou em DARF); o novo cálculo dá ${brl(tx.amount)}.`);
            }
        }
        for (const [ref, p] of preservados) {
            if (!desejados.has(ref) && p.status !== 'CANCELLED') {
                avisos.push(`Título de cálculo antigo mantido por estar pago, conciliado ou em DARF: ${p.description ?? ref} (${brl(p.amount)}). Confira se não se soma aos títulos novos.`);
            }
        }

        // 4. Grava (upsert pelo reference_id) e só DEPOIS apaga o que sobrou de
        //    cálculo antigo: se a gravação falhar, nada some.
        const aGravar = [...desejados.values()].filter(tx => !preservados.has(tx.reference_id));
        if (aGravar.length > 0) {
            const { error } = await supabase
                .from('internal_transactions')
                .upsert(aGravar, { onConflict: 'organization_id,reference_id,entry_type' });
            if (error) throw new Error(`Erro ao gravar os títulos da folha: ${error.message}`);
        }
        const obsoletos = existentes.filter(e => !preservados.has(e.reference_id) && !desejados.has(e.reference_id));
        for (let i = 0; i < obsoletos.length; i += 80) {
            const { error } = await supabase
                .from('internal_transactions')
                .delete()
                .in('id', obsoletos.slice(i, i + 80).map(e => e.id));
            if (error) throw new Error(`Os títulos novos foram gravados, mas os antigos não puderam ser apagados: ${error.message}`);
        }

        // 5. Espelho dentro de `project.settings.financialInfo` de cada obra
        //    (a conciliação ainda o lê). Falha aqui não desfaz o financeiro.
        const obrasAntigas = existentes.map(e => e.project_id).filter((id): id is string => !!id);
        await this.espelharFolhaNasObras(run, prefixo, [...desejados.values()], obrasAntigas).catch((err: unknown) => {
            avisos.push(`Espelho nas obras não atualizado: ${err instanceof Error ? err.message : String(err)}`);
        });

        const totais: Record<string, number> = {};
        for (const tx of desejados.values()) {
            const chave = (tx.party_type === 'TAX' && tx.party_name) || tx.category;
            totais[chave] = Math.round(((totais[chave] || 0) + tx.amount) * 100) / 100;
        }
        return {
            success: true,
            count: aGravar.length,
            removidos: obsoletos.length,
            preservados: preservados.size,
            avisos,
            totais,
            encargos: cfg,
            rubricasIndividualizadas: [...opcoes.individualizados],
        };
    },

    /**
     * Atualiza o espelho legado `settings.financialInfo.transactions` das obras da
     * folha (só exibição: `financialSyncService` não o materializa mais). Obras que
     * tinham linha desta folha e não têm mais também são limpas.
     */
    async espelharFolhaNasObras(run: PayrollRun, prefixo: string, txs: InternalTransaction[], obrasAntigas: string[] = []) {
        const porObra = new Map<string, InternalTransaction[]>();
        for (const obra of obrasAntigas) porObra.set(obra, []);
        for (const tx of txs) {
            if (!tx.project_id) continue;
            porObra.set(tx.project_id, [...(porObra.get(tx.project_id) ?? []), tx]);
        }
        if (porObra.size === 0) return;
        const [ccs, pcs] = await Promise.all([
            this.listCostCenters(run.org_id).catch(() => [] as { id: string; name: string }[]),
            this.listPlanoContas(run.org_id).catch(() => [] as { id: string; name: string }[]),
        ]);
        const falhas: string[] = [];
        await Promise.all([...porObra.entries()].map(async ([obraId, lista]) => {
            const project = await projectService.loadProject(obraId);
            if (!project) return;
            const settings = project.settings as ProjectSettings;
            const info = settings.financialInfo || { totalValue: 0, paymentMethod: 'Variavel', installments: [], transactions: [] };
            const mantidas = ((info.transactions as ProjectFinancialTx[]) || []).filter(t => {
                const id = String(t.id || '');
                return !(id.startsWith(prefixo) && id.includes(obraId));
            });
            const novas: ProjectFinancialTx[] = lista.map(tx => ({
                id: tx.reference_id,
                date: tx.transaction_date,
                type: 'EXPENSE',
                category: tx.category,
                description: tx.description,
                value: tx.amount,
                status: 'PENDING',
                notes: `Folha ID: ${run.id}`,
                costCenter: ccs.find(c => c.id === tx.cost_center_id)?.name ?? '',
                chartOfAccounts: pcs.find(p => p.id === tx.plano_de_contas_id)?.name ?? '',
            }));
            try {
                await projectService.saveProject({
                    ...project,
                    settings: { ...settings, financialInfo: { ...info, transactions: [...novas, ...mantidas] } },
                });
            } catch (err: unknown) {
                falhas.push(`${obraId}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }));
        if (falhas.length) throw new Error(falhas.join('; '));
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
            // parent_id: o CostCenterSelect monta o accordion grupo → filho com ele.
            .select('id, name, code, project_id, parent_id');
        if (orgId && orgId !== 'all') query = query.eq('organization_id', orgId);
        const { data, error } = await query.order('code');
        if (error) throw error;
        return (data || []) as { id: string; name: string; code?: string; project_id?: string | null; parent_id?: string | null }[];
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
