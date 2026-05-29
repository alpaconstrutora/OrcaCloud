import { payrollService, PayrollRun, PayrollItem, PayrollResult, PayrollRubric, PayrollEvent, EmployeeAllocation } from './payrollService';
import { laborService, Employee, TimeEntry } from './laborService';
import { payrollValidationService } from './payrollValidationService';
import { fiscalService, INSSBracket, IRRFBracket, FGTSConfig } from './fiscalService';
import { calculateINSS as calcINSS, calculateIRRF as calcIRRF } from '../lib/payrollCalc';

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
}

export const payrollEngine = {
    /**
     * Executa a folha em lote para todas as organizações com funcionários ativos
     */
    async runBulkPayroll(startDate: string, endDate: string, type: PayrollRun['type'] = 'mensal', subtype?: string) {
        const orgIds = await laborService.listOrgsWithActiveEmployees();
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
    async runPayroll(orgId: string, startDate: string, endDate: string, type: PayrollRun['type'] = 'mensal', subtype?: string, existingRunId?: string) {
        if (!orgId || orgId.trim() === '') {
            throw new Error('ID de Organização é obrigatório para gerar folha.');
        }

        // 1. Criar ou Usar Run Existente
        let run: PayrollRun;
        if (existingRunId) {
            run = await payrollService.getRun(existingRunId);
            await payrollService.updateRunStatus(existingRunId, 'PROCESSANDO');
        } else {
            run = await payrollService.createRun({
                org_id: orgId,
                start_date: startDate,
                end_date: endDate,
                status: 'PROCESSANDO',
                type,
                subtype
            });
        }

        // 2. Obter Colaboradores Ativos
        const employees = await laborService.listEmployees(orgId);
        const activeEmployees = employees.filter(e => e.status === 'ATIVO');

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
        
        let baseSalary = employee.base_salary || 0;
        let referenceDays = 30; // Padrão comercial
        
        // Verifica se é o mês de admissão
        if (employee.hire_date) {
            const hireDate = new Date(employee.hire_date);
            const runStartDate = new Date(run.start_date);
            const runEndDate = new Date(run.end_date);
            
            // Usar apenas a data para a comparação, ignorando timezone
            const hDate = new Date(hireDate.getUTCFullYear(), hireDate.getUTCMonth(), hireDate.getUTCDate());
            const sDate = new Date(runStartDate.getUTCFullYear(), runStartDate.getUTCMonth(), runStartDate.getUTCDate());
            const eDate = new Date(runEndDate.getUTCFullYear(), runEndDate.getUTCMonth(), runEndDate.getUTCDate());
            
            if (hDate > sDate && hDate <= eDate) {
                // Cálculo de dias trabalhados no mês da admissão (padrão CLT: mês = 30 dias)
                // CLT normaliza todos os meses para 30 dias; o dia 31 vale como dia 30.
                const dayOfAdmission = hDate.getDate();
                const dayOfAdmissionCLT = Math.min(dayOfAdmission, 30);
                const workedDays = 30 - dayOfAdmissionCLT + 1; // Sempre ≤ 30

                referenceDays = workedDays;
                baseSalary = (baseSalary / 30) * referenceDays;
            }
        }

        // O valor da hora extra continua sendo calculado sobre o salário integral
        const hourly_rate = (employee.base_salary || 0) / 220;
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
        // - Individual: is_automatic = true AND code is in linkedRubricCodes
        const automaticRubrics = rubrics.filter(r => {
            if (!r.active) return false;
            
            // Nível 1: Global (Mandatário CLT)
            if (r.is_clt_mandatory && employee.contract_type === 'CLT') return true;

            // Nível 2: Individual (Vinculado via Ficha do Colaborador)
            if (r.is_automatic && ctx.linkedRubricCodes.includes(r.code)) return true;

            return false;
        });

        // 3. Process Automatic Rubrics
        // Filter out automatic rubrics if a manual event for the same code exists
        const manualCodes = new Set(events.map(e => e.rubric_code || e.code));

        const sortedRubrics = [
            ...automaticRubrics.filter(r => r.calculation_type !== 'percentage' && !manualCodes.has(r.code)),
            ...automaticRubrics.filter(r => r.calculation_type === 'percentage' && !manualCodes.has(r.code))
        ];

        sortedRubrics.forEach(rubric => {
            const result = this.calculateRubricValue(rubric, baseValues, hourly_rate, timeEntries);
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
     * FOLHA DE FÉRIAS
     */
    async processVacation(ctx: PayrollContext) {
        const { employee } = ctx;
        const items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[] = [];

        const basicVacation = employee.base_salary || 0;
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

        const fullAmount = employee.base_salary || 0;

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
        const salary = employee.base_salary || 0;

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

        const irrfBase = base_irrf - inss;
        const runYear = parseInt(ctx.run.start_date.slice(0, 4), 10);
        const rawIrrf = this.calculateIRRF(irrfBase, ctx.irrfBrackets);
        const irrf = runYear >= 2026 ? this.applyIRRFReducer(rawIrrf, irrfBase) : rawIrrf;
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

    async persistResults(ctx: PayrollContext, items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[], gross: number, discounts: number, charges: number, bases: { base_inss: number, base_fgts: number, base_irrf: number }) {
        const result: Omit<PayrollResult, 'payroll_run_id' | 'employee_id'> = {
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

        const [employee, inssBrackets, irrfBrackets, fgtsConfig, rubrics, timeEntries, allocations, linkedRubricCodes] = await Promise.all([
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
            payrollService.getEmployeeRecurringRubrics(employeeId)
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
            linkedRubricCodes
        };
    },

    // IN RFB 2.216/2024 — redutor mensal IRRF 2026+
    // Base ≤ R$5.000: imposto zerado; R$5.000,01–R$7.350: redução proporcional linear.
    // Âncora: IRRF exato em R$5.000 = 5000×27,5% − 908,73 = R$466,27.
    applyIRRFReducer(irrf: number, base: number): number {
        if (base <= 5000) return 0;
        if (base > 7350) return irrf;
        const reducer = 466.27 * (7350 - base) / 2350;
        return Math.max(0, irrf - reducer);
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
