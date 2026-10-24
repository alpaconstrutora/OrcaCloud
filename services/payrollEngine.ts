import { payrollService, PayrollRun, PayrollItem, PayrollResult, PayrollRubric, PayrollEvent, EmployeeAllocation } from './payrollService';
import { laborService, Employee, TimeEntry } from './laborService';
import { payrollValidationService } from './payrollValidationService';
import { fiscalService, INSSBracket, IRRFBracket, FGTSConfig } from './fiscalService';
import { calculateINSS as calcINSS, calculateIRRF as calcIRRF, aplicarRedutorIRRF2026, calcularIrrfMensal } from '../lib/payrollCalc';
import { salarioNaData, salarioDoPeriodo, type SalarioLancamento } from '../lib/payrollSalarioCompetencia';
import { motivoBloqueioRecorrente, valorRecorrente, type ValorRecorrente } from '../lib/payrollRubricaRecorrente';

/**
 * Parser aritmético seguro — substitui new Function() / eval().
 * Suporta: +  -  *  /  ( )  números decimais e negativos unários.
 */
function safeEvalArithmetic(expr: string): number {
    const src = expr.replace(/[^0-9.+\-*/() ]/g, '').trim();
    let pos = 0;

    function skipSpaces() { while (pos < src.length && src[pos] === ' ') pos++; }

    function parseExpr(): number {
        let left = parseTerm();
        skipSpaces();
        while (pos < src.length && (src[pos] === '+' || src[pos] === '-')) {
            const op = src[pos++];
            const right = parseTerm();
            left = op === '+' ? left + right : left - right;
            skipSpaces();
        }
        return left;
    }

    function parseTerm(): number {
        let left = parseFactor();
        skipSpaces();
        while (pos < src.length && (src[pos] === '*' || src[pos] === '/')) {
            const op = src[pos++];
            const right = parseFactor();
            left = op === '*' ? left * right : right !== 0 ? left / right : 0;
            skipSpaces();
        }
        return left;
    }

    function parseFactor(): number {
        skipSpaces();
        if (src[pos] === '(') {
            pos++;
            const val = parseExpr();
            skipSpaces();
            if (src[pos] === ')') pos++;
            return val;
        }
        if (src[pos] === '-') { pos++; return -parseFactor(); }
        let num = '';
        while (pos < src.length && (src[pos] >= '0' && src[pos] <= '9' || src[pos] === '.')) num += src[pos++];
        skipSpaces();
        return num ? parseFloat(num) : 0;
    }

    try {
        const result = parseExpr();
        return isNaN(result) || !isFinite(result) ? 0 : result;
    } catch {
        return 0;
    }
}

export interface PayrollContext {
    employee: Employee;
    run: PayrollRun;
    inssBrackets: INSSBracket[];
    irrfBrackets: IRRFBracket[];
    fgtsConfig: FGTSConfig | null;
    rubrics: PayrollRubric[];
    timeEntries: TimeEntry[];
    events: PayrollEvent[];
    allocations: EmployeeAllocation[];
    linkedRubricCodes: string[];
    /** Valor do colaborador por código recorrente (R$ ou % do salário). Ausente =
     *  cálculo da própria rubrica, como era antes de 23/10/2026. */
    linkedRubricValues?: Record<string, ValorRecorrente>;
    /** Histórico Salarial do colaborador — o salário da folha sai daqui pela
     *  competência, não de `employee.base_salary` (que é o de hoje). Ausente
     *  ou vazio: vale o cadastro. */
    salaryHistory?: SalarioLancamento[];
}

/**
 * O colaborador entra na folha do período `startDate..endDate`?
 *
 * Decide pelas DATAS, não só pelo status de hoje: o mês da rescisão ainda é
 * devido (desligado em 31/05 entra na folha de 05), e um desligamento lançado
 * com atraso tem de tirá-lo dos meses seguintes mesmo que o cadastro ainda
 * diga ATIVO. Caso real (22/10/2026): Clovis, desligado em 31/05/2026, seguia
 * nas folhas de 06, 07 e 09/2026.
 *
 * Admissão depois do fim do período também tira (regra confirmada pelo
 * usuário em 22/10/2026, caso Iago: admissão 01/11/2026 e folha desde 04/2026).
 * Admissão vazia não tira ninguém.
 */
export function participaDaFolha(emp: Employee, startDate: string, endDate: string): boolean {
    const admissao = emp.hire_date?.split('T')[0];
    if (admissao && admissao > endDate.split('T')[0]) return false;
    const desligamento = emp.termination_date?.split('T')[0];
    if (desligamento && desligamento < startDate.split('T')[0]) return false;
    if (emp.status === 'ATIVO') return true;
    return emp.status === 'DESLIGADO' && !!desligamento;
}

/**
 * Ao reprocessar, quem não participa da folha perde os itens calculados antes.
 * Sem isto, `savePayrollData` só regrava quem é elegível e o inativado (ou
 * desligado, ou ainda não admitido) seguia na folha com os valores antigos.
 *
 * AFASTADO fica de fora da limpeza: o motor nunca o calcula, mas o que já
 * está lançado para ele (os 15 primeiros dias pagos pela empresa, por
 * exemplo) é decisão de quem fecha a folha, não efeito colateral.
 */
export function saiDaFolha(emp: Employee, startDate: string, endDate: string): boolean {
    return emp.status !== 'AFASTADO' && !participaDaFolha(emp, startDate, endDate);
}

export const payrollEngine = {
    /**
     * Executa a folha em lote para todas as organizações com funcionários ativos
     */
    // Sem classificação contábil aqui de propósito: Centro de Custo e Plano de
    // Contas são cadastros POR ORGANIZAÇÃO, e o lote cria uma folha em cada
    // uma. Um id escolhido na tela valeria só para a org dona dele e estouraria
    // a FK nas demais. Em lote, cada folha nasce sem classificação e recebe a
    // dela na tela de detalhes.
    //
    // `writableOrgIds`: organizações em que o usuário é MEMBRO. A lista de
    // colaboradores visíveis inclui os COMPARTILHADOS de outras orgs
    // (`employee_org_shares`), e o `org_id` deles é a org de origem — sem este
    // corte o lote tentava abrir ciclo lá, levava 42501 e abortava inteiro
    // (fornecedor membro só da Alpa, 11/10/2026). O compartilhado entra na
    // folha da org que o recebeu, via `listEmployees(orgId)`.
    async runBulkPayroll(
        startDate: string,
        endDate: string,
        type: PayrollRun['type'] = 'mensal',
        subtype?: string,
        writableOrgIds?: string[],
    ) {
        const visibleOrgIds = await laborService.listOrgsWithActiveEmployees();
        const orgIds = writableOrgIds
            ? visibleOrgIds.filter(id => writableOrgIds.includes(id))
            : visibleOrgIds;
        if (orgIds.length === 0) {
            throw new Error('Nenhuma organização com colaboradores ativos em que você possa gerar folha.');
        }
        const runs: PayrollRun[] = [];

        for (const orgId of orgIds) {
            // Verifica se já existe uma folha (rascunho) para esta org, período e tipo
            const existingRuns = await payrollService.listRuns(orgId, type);
            const duplicate = existingRuns.find(r =>
                r.start_date.split('T')[0] === startDate.split('T')[0] &&
                r.end_date.split('T')[0] === endDate.split('T')[0] &&
                r.subtype === subtype &&
                r.status !== 'FECHADO'
            );

            // Reprocessa a existente ou cria uma nova
            const run = await this.runPayroll(orgId, startDate, endDate, type, subtype, duplicate?.id);
            runs.push(run);
        }

        return runs;
    },

    /**
     * Executa a folha para todo um período
     */
    async runPayroll(
        orgId: string,
        startDate: string,
        endDate: string,
        type: PayrollRun['type'] = 'mensal',
        subtype?: string,
        existingRunId?: string,
        /* Centro de Custo e Plano de Contas PADRÃO do ciclo — herdados por
           todas as linhas financeiras da folha (ver payrollService,
           "CLASSIFICAÇÃO CONTÁBIL DAS LINHAS DE FOLHA"). Os dois ids têm de ser
           da MESMA organização da folha. */
        classification?: { cost_center_id?: string | null; plano_de_contas_id?: string | null },
    ) {
        if (!orgId || orgId.trim() === '') {
            throw new Error('ID de Organização é obrigatório para gerar folha.');
        }

        // 1. Criar ou Usar Run Existente
        let run: PayrollRun;
        if (existingRunId) {
            run = await payrollService.getRun(existingRunId);
            await payrollService.updateRunStatus(existingRunId, 'PROCESSANDO');
            // Reprocessar não pode apagar a classificação já definida: só grava
            // o que veio da tela.
            if (classification && (classification.cost_center_id || classification.plano_de_contas_id)) {
                await payrollService.updateRunClassification(existingRunId, classification);
                run = { ...run, ...classification };
            }
        } else {
            run = await payrollService.createRun({
                org_id: orgId,
                start_date: startDate,
                end_date: endDate,
                status: 'PROCESSANDO',
                type,
                subtype,
                cost_center_id:     classification?.cost_center_id     ?? null,
                plano_de_contas_id: classification?.plano_de_contas_id ?? null,
            });
        }

        // 2. Obter Colaboradores Ativos — SÓ os da própria organização.
        // `listEmployees(orgId)` traz também os COMPARTILHADOS de outras orgs
        // (`employee_org_shares`); regra de produto (11/10/2026): a folha é
        // gerada na organização DO COLABORADOR, não na de quem recebeu o
        // compartilhamento. Incluí-los aqui punha o mesmo colaborador na folha
        // das duas orgs no mesmo mês. Quem está no período: `participaDaFolha`.
        const employees = await laborService.listEmployees(orgId);
        const activeEmployees = employees.filter(e => e.org_id === orgId && participaDaFolha(e, startDate, endDate));

        if (existingRunId) {
            const saem = employees.filter(e => e.org_id === orgId && saiDaFolha(e, startDate, endDate)).map(e => e.id);
            // Também sai quem tem resultado nesta folha mas é REGISTRADO em outra
            // organização (compartilhado com esta, ou que mudou de org). Regra do
            // usuário (24/10/2026): a folha é gerada só na org em que o colaborador
            // é registrado; o custo vai para outra pela aba Alocações. Caso real:
            // o Rogério, da Garden, seguia em 11 folhas da Alpa geradas quando a
            // folha ainda incluía compartilhados — reprocessar não o tirava.
            const daOrg = new Set(employees.filter(e => e.org_id === orgId).map(e => e.id));
            const comResultado = await payrollService.listResultsByRun(run.id);
            const deOutraOrg = [...new Set(comResultado.map(r => r.employee_id))].filter(id => !daOrg.has(id));
            const tirar = [...saem, ...deOutraOrg];
            if (tirar.length > 0) await payrollService.removeEmployeesFromRun(run.id, tirar);
        }

        // 3. Processar em paralelo — allSettled para não abortar a folha se um colaborador falhar
        const results = await Promise.allSettled(
            activeEmployees.map(emp => this.calculateEmployeePayroll(emp.id, run.id))
        );
        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.error(`[payrollEngine] Falha ao processar colaborador ${activeEmployees[i].id}:`, r.reason);
            }
        });

        // 4. Rodar Validação Automática (Auditoria)
        try {
            await payrollValidationService.validateRun(run.id);
        } catch (vErr) {
            console.error('Erro na validação automática:', vErr);
        }

        return run;
    },

    async calculateEmployeePayroll(employeeId: string, runId: string) {
        const ctx = await this.buildContext(employeeId, runId);

        switch (ctx.run.type) {
            case 'adiantamento':
                return this.processAdvance(ctx);
            case 'ferias':
                return this.processVacation(ctx);
            case 'decimo_terceiro':
                return this.processThirteenth(ctx);
            case 'rescisao':
                return this.processTermination(ctx);
            default:
                return this.processMonthly(ctx);
        }
    },

    /**
     * FOLHA MENSAL PADRÃO
     */
    async processMonthly(ctx: PayrollContext) {
        const { employee, timeEntries, events, rubrics, run } = ctx;

        // Salário da COMPETÊNCIA pelo Histórico Salarial, dia a dia no mês CLT
        // de 30 dias: reajuste no meio do mês é proporcional, e o mês da
        // admissão conta só a partir dela.
        const periodo = salarioDoPeriodo(
            ctx.salaryHistory ?? [], employee.base_salary || 0,
            run.start_date, run.end_date, employee.hire_date,
        );
        const baseSalary = periodo.valor;
        const referenceDays = periodo.dias;

        // O valor da hora extra é calculado sobre o salário integral vigente no fim do período
        const hourly_rate = periodo.vigenteNoFim / 220;
        const items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[] = [];

        // 1. Map of base values for calculations
        // We'll calculate SALARIO first as it is a common base
        const baseValues: Record<string, number> = {
            'SALARIO': baseSalary,
            'SALARIO_REFERENCE': referenceDays,
            'HORAS_TRABALHADAS': timeEntries.reduce((s, e) => s + (Number(e.hours_worked) || 0), 0)
        };

        // 2. Identify Automatic Rubrics based on Hybrid Architecture
        // - Global: is_clt_mandatory = true AND employee is CLT
        // - Individual: code is in linkedRubricCodes (Colaborador › Folha de Pagamento).
        //   Desde 23/10/2026 qualquer rubrica pode ser recorrente, com o valor do
        //   colaborador; só não as que a folha já calcula (lib/payrollRubricaRecorrente).
        const valorDoColaborador = ctx.linkedRubricValues ?? {};
        const automaticRubrics = rubrics.filter(r => {
            if (!r.active) return false;

            // Nível 1: Global (Mandatário CLT)
            if (r.is_clt_mandatory && employee.contract_type === 'CLT') return true;

            // Nível 2: Individual (Vinculado via Ficha do Colaborador)
            if (ctx.linkedRubricCodes.includes(r.code) && !motivoBloqueioRecorrente(r)) return true;

            return false;
        });

        // 3. Process Automatic Rubrics
        // Filter out automatic rubrics if a manual event for the same code exists
        const manualCodes = new Set(events.map(e => e.rubric_code || e.code));

        // Percentual (da rubrica ou do colaborador) no 2º passe, sobre as bases já somadas.
        const percentual = (r: PayrollRubric) => {
            const v = valorDoColaborador[r.code];
            return v?.valor_tipo != null ? v.valor_tipo === 'percentual' : r.calculation_type === 'percentage';
        };
        const sortedRubrics = [
            ...automaticRubrics.filter(r => !percentual(r) && !manualCodes.has(r.code)),
            ...automaticRubrics.filter(r => percentual(r) && !manualCodes.has(r.code))
        ];

        sortedRubrics.forEach(rubric => {
            // O valor do colaborador manda; sem ele, o cálculo da rubrica (manual = nada).
            const doColaborador = ctx.linkedRubricCodes.includes(rubric.code) && !motivoBloqueioRecorrente(rubric)
                ? valorRecorrente(valorDoColaborador[rubric.code], baseValues['SALARIO'] || 0)
                : null;
            const result = doColaborador ?? this.calculateRubricValue(rubric, baseValues, hourly_rate, timeEntries);
            if (result && result.amount > 0) {
                items.push({
                    code: rubric.code,
                    type: rubric.type,
                    amount: result.amount,
                    base_amount: result.base_amount,
                    reference: result.reference
                });

                // Update baseValues for subsequent rubrics (e.g. TOTAL_PROVENTOS)
                if (rubric.type === 'provento') {
                    baseValues['TOTAL_PROVENTOS'] = (baseValues['TOTAL_PROVENTOS'] || 0) + result.amount;
                }
            }
        });

        // 4. EVENTOS MANUAIS (AVULSOS)
        events.forEach(e => {
            // Usamos e.rubric_code como código principal para satisfazer a FK no banco
            // Fallback para códigos pré-existentes na semente do banco (rubrics table)
            let finalCode = e.rubric_code;
            if (!finalCode) {
                if (e.type === 'provento') finalCode = 'BONUS';
                else if (e.type === 'desconto') finalCode = 'OUTROS';
                else finalCode = 'OUTROS'; // Fallback geral para informativas manuais
            }

            let reference: number | string | null = e.quantity ?? null;
            if (e.quantity && e.unit && e.unit !== 'fixed') {
                const suffix = e.unit === 'days' ? ' d' : ' h';
                reference = `${e.quantity.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${suffix}`;
            } else if (!e.quantity && e.type?.toLowerCase() === 'informativa') {
                reference = 1;
            }

            items.push({
                code: finalCode,
                type: String(e.type || 'informativa').toLowerCase(),
                amount: e.amount,
                base_amount: e.amount,
                reference: reference ?? undefined,
                origin: 'manual',
            });

            // Update TOTAL_PROVENTOS apenas se for provento
            if (String(e.type).toLowerCase() === 'provento') {
                baseValues['TOTAL_PROVENTOS'] = (baseValues['TOTAL_PROVENTOS'] || 0) + e.amount;
            }
        });

        console.log(`[payrollEngine] Itens gerados (Base + Manuais): ${items.length}`, items.map(i => i.code));
        return this.finaliseWithRubrics(ctx, items);
    },

    calculateRubricValue(rubric: PayrollRubric, baseValues: Record<string, number>, hourlyRate: number, timeEntries: TimeEntry[]) {
        const config = rubric.calculation_config || {};

        switch (rubric.calculation_type) {
            case 'fixed':
                return { amount: config.amount || 0, base_amount: config.amount || 0, reference: 1.0 };

            case 'percentage': {
                const baseKey = config.base || 'SALARIO';
                const baseValue = baseValues[baseKey] || 0;
                const percentage = config.percentage || 0;
                return {
                    amount: baseValue * percentage,
                    base_amount: baseValue,
                    reference: percentage
                };
            }

            case 'formula': {
                // PRD 35.4 Controlled Formula structure
                // Se existe uma formula customizada, tenta avaliar dinamicamente
                if (rubric.formula) {
                    try {
                        const ot50 = timeEntries.reduce((s, e) => s + (Number(e.overtime_50) || 0), 0);
                        const ot100 = timeEntries.reduce((s, e) => s + (Number(e.overtime_100) || 0), 0);
                        const night = timeEntries.reduce((s, e) => s + (Number(e.night_hours) || 0), 0);

                        // Preparar contexto de variáveis
                        const vars: Record<string, number> = {
                            SALARIO: baseValues['SALARIO'] || 0,
                            BASE: baseValues[config.base || 'SALARIO'] || (baseValues['SALARIO'] || 0),
                            PERC: config.percentage || 0,
                            VALOR: config.amount || 0,
                            HE50_HRS: ot50,
                            HE100_HRS: ot100,
                            AD_NOT_HRS: night,
                            HOURLY_RATE: hourlyRate
                        };

                        // Substituir variáveis na fórmula (Case Insensitive)
                        let expression = rubric.formula.toUpperCase();
                        Object.keys(vars).forEach(v => {
                            const regex = new RegExp(`\\b${v}\\b`, 'g');
                            expression = expression.replace(regex, String(vars[v]));
                        });

                        // Parser aritmético seguro — sem eval/new Function
                        const safeExpression = expression.replace(/[^0-9.+\-*/() ]/g, '');
                        const amount = safeEvalArithmetic(safeExpression);

                        if (typeof amount === 'number' && !isNaN(amount)) {
                            // Tentar deduzir o base_amount e reference para o holerite
                            let base_amount = vars.BASE;
                            let reference = amount / (base_amount || 1);

                            // Casos especiais de HE e AD_NOT para o holerite ficar bonito
                            if (rubric.formula.includes('HE50_HRS')) { base_amount = ot50; reference = 1.5; }
                            if (rubric.formula.includes('HE100_HRS')) { base_amount = ot100; reference = 2.0; }
                            if (rubric.formula.includes('AD_NOT_HRS')) { base_amount = night; reference = 0.2; }

                            return { amount, base_amount, reference };
                        }
                    } catch (err) {
                        console.error(`[payrollEngine] Falha ao avaliar fórmula da rubrica ${rubric.code}:`, err);
                    }
                }

                // Fallback para casos legados/hardcoded se a formula estiver em branco
                if (rubric.code === 'HE50') {
                    const ot50 = timeEntries.reduce((s, e) => s + (Number(e.overtime_50) || 0), 0);
                    return { amount: ot50 * hourlyRate * 1.5, base_amount: ot50, reference: 1.5 };
                }
                if (rubric.code === 'HE100') {
                    const ot100 = timeEntries.reduce((s, e) => s + (Number(e.overtime_100) || 0), 0);
                    return { amount: ot100 * hourlyRate * 2.0, base_amount: ot100, reference: 2.0 };
                }
                if (rubric.code === 'AD_NOTURNO') {
                    const night = timeEntries.reduce((s, e) => s + (Number(e.night_hours) || 0), 0);
                    return { amount: night * hourlyRate * 0.2, base_amount: night, reference: 0.2 };
                }
                return null;
            }

            case 'manual':
            default:
                // SALARIO base is manual/fixed by design in processMonthly if no config
                if (rubric.code === 'SALARIO') {
                    return { amount: baseValues['SALARIO'], base_amount: baseValues['SALARIO'], reference: baseValues['SALARIO_REFERENCE'] || 30 };
                }
                return null;
        }
    },

    /**
     * RECIBO DE ADIANTAMENTO
     * Usa a rubrica ADIANTAMENTO já configurada (percentual do salário, ex: 40%).
     * No recibo, o valor é exibido como provento (o que o colaborador recebe).
     * Sem INSS, IRRF ou FGTS — o adiantamento não tem incidência própria.
     */
    async processAdvance(ctx: PayrollContext) {
        const { rubrics } = ctx;
        const items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[] = [];

        const baseSalary = this.salarioBase(ctx);
        const hourly_rate = baseSalary / 220;
        const baseValues: Record<string, number> = { SALARIO: baseSalary, SALARIO_REFERENCE: 30 };

        const advRubric = rubrics.find(r => r.code === 'ADIANTAMENTO' && r.active);
        if (advRubric) {
            const result = this.calculateRubricValue(advRubric, baseValues, hourly_rate, []);
            if (result && result.amount > 0) {
                items.push({
                    code: 'ADIANTAMENTO',
                    type: 'provento',
                    amount: result.amount,
                    base_amount: result.base_amount,
                    reference: result.reference,
                });
            }
        }

        const gross = items.reduce((s, i) => s + i.amount, 0);
        return this.persistResults(ctx, items, gross, 0, 0, { base_inss: 0, base_fgts: 0, base_irrf: 0 });
    },

    /**
     * FOLHA DE FÉRIAS
     */
    async processVacation(ctx: PayrollContext) {
        const items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[] = [];

        const basicVacation = this.salarioBase(ctx);
        const third = basicVacation / 3;

        items.push({ code: 'FERIAS', type: 'provento', amount: basicVacation, base_amount: basicVacation, reference: 30 });
        items.push({ code: 'FERIAS_TERCO', type: 'provento', amount: third, base_amount: basicVacation, reference: 0.33 });

        return this.finaliseWithRubrics(ctx, items);
    },

    /**
     * FOLHA DE 13º SALÁRIO
     */
    async processThirteenth(ctx: PayrollContext) {
        const { employee, run } = ctx;
        const items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[] = [];
        const isFirstParcel = run.subtype === '1_parcela' || run.subtype === '1';

        const fullAmount = this.salarioBase(ctx);

        if (isFirstParcel) {
            const amount = Math.round(fullAmount * 0.5 * 100) / 100;
            items.push({ code: 'DECIMO', type: 'provento', amount, base_amount: fullAmount, reference: 0.5 });
            return this.finaliseWithRubrics(ctx, items);
        } else {
            // 2ª Parcela: valor integral com desconto do que foi pago na 1ª parcela.
            // Busca o valor real pago na 1ª parcela (relevante quando houve reajuste salarial).
            const year = parseInt(run.start_date.slice(0, 4), 10);
            const paidInFirst = await payrollService.getFirstDecimoPaidAmount(employee.id, year);
            const paid = paidInFirst ?? Math.round(fullAmount * 0.5 * 100) / 100;

            items.push({ code: 'DECIMO', type: 'provento', amount: fullAmount, base_amount: fullAmount, reference: 1.0 });
            items.push({ code: 'DESC_ADIANT_13', type: 'desconto', amount: paid, base_amount: paid, reference: 1.0 });

            return this.finaliseWithRubrics(ctx, items);
        }
    },

    /**
     * FOLHA DE RESCISÃO
     */
    async processTermination(ctx: PayrollContext) {
        const { employee, run } = ctx;
        const items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[] = [];
        const salary = this.salarioBase(ctx);

        // 13º proporcional: meses trabalhados no ANO da rescisão (CLT art. 3º Lei 4749/65)
        // Conta do início do ano (ou admissão se foi neste ano) até o mês da rescisão.
        // Regra dos 15 dias: se trabalhou ≥ 15 dias no mês, conta o mês inteiro.
        const termDate = new Date(run.end_date.slice(0, 10) + 'T12:00:00');
        const termYear = termDate.getFullYear();
        const yearStart = new Date(`${termYear}-01-01T12:00:00`);
        let countFrom = yearStart;
        if (employee.hire_date) {
            const hireDate = new Date(employee.hire_date.slice(0, 10) + 'T12:00:00');
            if (hireDate > yearStart) countFrom = hireDate;
        }
        const monthsRaw = termDate.getMonth() - countFrom.getMonth();
        const partialMonth = termDate.getDate() >= 15 ? 1 : 0;
        const monthsWorked = Math.max(0, Math.min(12, monthsRaw + partialMonth));

        // Verbas Rescisórias Base
        items.push({ code: 'SALDO_SALARIO', type: 'provento', amount: salary, base_amount: salary, reference: 30 });
        items.push({ code: 'FERIAS', type: 'provento', amount: salary, base_amount: salary, reference: 30 });
        items.push({ code: 'DECIMO', type: 'provento', amount: salary / 12 * monthsWorked, base_amount: salary, reference: monthsWorked });

        return this.finaliseWithRubrics(ctx, items);
    },

    /**
     * FINALIZAÇÃO BASEADA EM RUBRICAS (INSS, FGTS, IRRF)
     */
    async finaliseWithRubrics(ctx: PayrollContext, items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[]) {
        const { rubrics } = ctx;

        // 1. Calcular Bases de Cálculo
        let base_inss = 0;
        let base_fgts = 0;
        let base_irrf = 0;

        items.filter(i => ['provento', 'desconto'].includes(String(i.type).toLowerCase())).forEach(item => {
            const rubric = rubrics.find(r => r.code === item.code);
            const modifier = String(item.type).toLowerCase() === 'provento' ? 1 : -1;

            if (rubric) {
                if (rubric.incidence_inss) base_inss += (item.amount * modifier);
                if (rubric.incidence_fgts) base_fgts += (item.amount * modifier);
                if (rubric.incidence_irrf) base_irrf += (item.amount * modifier);
            } else if (String(item.type).toLowerCase() === 'provento') {
                // Se for provento não cadastrado, assumimos incidência total por segurança
                base_inss += item.amount;
                base_fgts += item.amount;
                base_irrf += item.amount;
            }
            // Diferente de proventos, descontos não cadastrados (manual sem rubric_code) 
            // não abatem a base automaticamente por segurança (precisa ser configurado).
        });

        // Garantir que as bases não sejam negativas
        base_inss = Math.max(0, base_inss);
        base_fgts = Math.max(0, base_fgts);
        base_irrf = Math.max(0, base_irrf);

        // 2. Realizar os descontos tributários baseados nas bases calculadas
        const inss = this.calculateINSS(base_inss, ctx.inssBrackets);
        if (inss > 0) {
            items.push({ code: 'INSS', type: 'desconto', amount: inss, base_amount: base_inss, reference: 0 });
        }

        // Lei 9.250: dedução = maior entre INSS (art. 4º) e o desconto simplificado
        // mensal (§ 2º); de 2026 em diante, redução do art. 3º-A sobre o rendimento
        // tributável (base_irrf), não sobre a base deduzida. Conta em lib/payrollCalc.
        if (ctx.irrfBrackets.length === 0) {
            console.warn('[payrollEngine] Cálculo de IRRF ignorado: Tabela de faixas está vazia!');
        }
        const { base: irrfBase, irrf } = calcularIrrfMensal(base_irrf, inss, ctx.irrfBrackets, ctx.run.start_date);
        if (irrf > 0) {
            items.push({ code: 'IRRF', type: 'desconto', amount: irrf, base_amount: irrfBase, reference: 0 });
        }

        // 3. Encargos da Empresa
        const fgtsRate = ctx.fgtsConfig?.rate || 0.08;
        // Truncamento em 2 casas decimais para o FGTS (Conforme auditoria: 153,79)
        const fgts = Math.floor(base_fgts * fgtsRate * 100) / 100;
        if (fgts > 0) {
            items.push({ code: 'FGTS', type: 'encargo', amount: fgts, base_amount: base_fgts, reference: fgtsRate });
        }

        // 4. Totais
        const gross = items.filter(i => i.type === 'provento').reduce((s, i) => s + i.amount, 0);
        const discounts = items.filter(i => i.type === 'desconto').reduce((s, i) => s + i.amount, 0);
        const charges = items.filter(i => i.type === 'encargo').reduce((s, i) => s + i.amount, 0);

        console.log(`[payrollEngine] Itens finais (Incluindo Tributos): ${items.length}`, items.map(i => i.code));
        return this.persistResults(ctx, items, gross, discounts, charges, { base_inss, base_fgts, base_irrf });
    },

    /**
     * Salário contratual do colaborador NA COMPETÊNCIA da folha, pelo Histórico
     * Salarial. Férias: o vigente no início (data da concessão); demais tipos:
     * o vigente no fim do período. É também o que se grava em
     * `payroll_results.base_salary` — folha fechada mantém o seu.
     */
    salarioBase(ctx: PayrollContext): number {
        const data = ctx.run.type === 'ferias' ? ctx.run.start_date : ctx.run.end_date;
        return salarioNaData(ctx.salaryHistory ?? [], ctx.employee.base_salary || 0, data);
    },

    async persistResults(ctx: PayrollContext, items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[], gross: number, discounts: number, charges: number, bases: { base_inss: number, base_fgts: number, base_irrf: number }) {
        const result: Omit<PayrollResult, 'payroll_run_id' | 'employee_id'> = {
            base_salary: Math.round(this.salarioBase(ctx) * 100) / 100,
            gross: Math.round(gross * 100) / 100,
            discounts: Math.round(discounts * 100) / 100,
            net: Math.round((gross - discounts) * 100) / 100,
            employer_cost: Math.round((gross + charges) * 100) / 100,
            base_inss: Math.round(bases.base_inss * 100) / 100,
            base_fgts: Math.round(bases.base_fgts * 100) / 100,
            base_irrf: Math.round(bases.base_irrf * 100) / 100
        };

        await payrollService.savePayrollData(ctx.run.id, ctx.employee.id, items, result);
        return { items, result };
    },

    async buildContext(employeeId: string, runId: string): Promise<PayrollContext> {
        const run = await payrollService.getRun(runId);
        const refDate = run.start_date; // Data de competência para buscar faixas fiscais

        const [employee, inssBrackets, irrfBrackets, fgtsConfig, rubrics, timeEntries, allocations, linkedRubrics, salaryHistory] = await Promise.all([
            laborService.getEmployeeById(employeeId),
            fiscalService.getINSSBrackets(refDate),
            fiscalService.getIRRFBrackets(refDate),
            fiscalService.getFGTSConfig(refDate),
            payrollService.listRubrics(),
            laborService.listTimeEntries({
                employeeId,
                dateStart: run.start_date,
                dateEnd: run.end_date,
                status: 'APROVADO'
            }),
            payrollService.listAllocations(employeeId),
            payrollService.getEmployeeRecurringRubrics(employeeId),
            laborService.listSalaryHistoryForPayroll(employeeId),
        ]);

        // Busca Ultra-Robusta: Prioriza RunID (Open Context) + Periodo Expandido
        let finalEvents: PayrollEvent[] = [];
        try {
            const startStr = run.start_date.split('T')[0];
            const endStr = run.end_date.split('T')[0];

            const dateObj = new Date(startStr);
            dateObj.setDate(dateObj.getDate() - 5);
            const expandedStart = dateObj.toISOString().split('T')[0];

            const [eventsByRun, eventsByPeriod] = await Promise.all([
                payrollService.listEvents('all', runId), // Usar 'all' para paridade com o Modal
                payrollService.listEventsByPeriod(employeeId, expandedStart, endStr, runId)
            ]);

            const merged = [
                ...(eventsByRun || []).filter((e) => e.employee_id === employeeId || e.payroll_run_id === runId),
                ...(eventsByPeriod || [])
            ];

            const uniqueMap = new Map();
            merged.forEach(e => {
                if (e.employee_id === employeeId) {
                    uniqueMap.set(e.id, e);
                }
            });
            finalEvents = Array.from(uniqueMap.values());

            console.log(`[payrollEngine] Contexto p/ ${employeeId}: ${finalEvents.length} eventos capturados.`);
        } catch (err) {
            console.error('[payrollEngine] Falha crítica ao carregar eventos:', err);
        }

        return {
            employee,
            run,
            inssBrackets,
            irrfBrackets,
            fgtsConfig,
            rubrics,
            timeEntries,
            events: finalEvents,
            allocations,
            linkedRubricCodes: linkedRubrics.map(l => l.code),
            linkedRubricValues: Object.fromEntries(linkedRubrics.map(l => [l.code, { valor_tipo: l.valor_tipo, valor: l.valor }])),
            salaryHistory,
        };
    },

    // Redução mensal 2026+ (Lei 9.250, art. 3º-A). O 2º argumento é o RENDIMENTO
    // tributável, não a base deduzida. A conta mora em lib/payrollCalc.
    applyIRRFReducer(irrf: number, rendimentosTributaveis: number): number {
        return aplicarRedutorIRRF2026(irrf, rendimentosTributaveis);
    },

    calculateINSS(base: number, brackets: INSSBracket[]) {
        if (brackets.length === 0) {
            console.warn('[payrollEngine] Cálculo de INSS ignorado: Tabela de faixas está vazia!');
            return 0;
        }
        return calcINSS(base, brackets);
    },

    calculateIRRF(base: number, brackets: IRRFBracket[]) {
        if (brackets.length === 0) {
            console.warn('[payrollEngine] Cálculo de IRRF ignorado: Tabela de faixas está vazia!');
            return 0;
        }
        return calcIRRF(base, brackets);
    }
};
