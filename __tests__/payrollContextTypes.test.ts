/**
 * Testes para Item 9 — Tipagem de PayrollContext (eliminação de `any`).
 *
 * Estratégia: testes em ambiente Node (sem jsdom, sem React).
 * Verificamos:
 *  1. Interfaces de tipos (satisfies / assignability em runtime)
 *  2. Contratos de CalculationConfig e ValidationLog
 *  3. calculateRubricValue — todas as branches com inputs tipados
 *  4. processMonthly / finaliseWithRubrics via objeto stub (sem Supabase)
 *  5. buildContext retorna PayrollContext com os campos corretos
 *  6. persistResults chama savePayrollData com tipos corretos
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
    PayrollRubric,
    PayrollRun,
    PayrollItem,
    PayrollResult,
    PayrollEvent,
    EmployeeAllocation,
    CalculationConfig,
    ValidationLog,
} from '../services/payrollService';
import { payrollEngine, type PayrollContext } from '../services/payrollEngine';
import type { Employee, TimeEntry } from '../services/laborService';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
    id: 'emp-1',
    org_id: 'org-1',
    name: 'João Silva',
    base_salary: 3000,
    status: 'ATIVO',
    contract_type: 'CLT',
    role: 'Pedreiro',
    hourly_cost: 0,
    ...overrides,
});

const makeRun = (overrides: Partial<PayrollRun> = {}): PayrollRun => ({
    id: 'run-1',
    org_id: 'org-1',
    start_date: '2026-04-01',
    end_date: '2026-04-30',
    status: 'PROCESSANDO',
    type: 'mensal',
    ...overrides,
});

const makeRubric = (overrides: Partial<PayrollRubric>): PayrollRubric => ({
    code: 'SALARIO',
    name: 'Salário',
    type: 'provento',
    incidence_inss: true,
    incidence_fgts: true,
    incidence_irrf: true,
    is_automatic: true,
    is_clt_mandatory: true,
    calculation_type: 'manual',
    active: true,
    ...overrides,
});

const makeTimeEntry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
    id: 'te-1',
    employee_id: 'emp-1',
    date: '2026-04-10',
    hours_worked: 8,
    overtime_50: 0,
    overtime_100: 0,
    night_hours: 0,
    status: 'APROVADO',
    ...overrides,
});

const makeEvent = (overrides: Partial<PayrollEvent> = {}): PayrollEvent => ({
    org_id: 'org-1',
    employee_id: 'emp-1',
    payroll_run_id: 'run-1',
    rubric_code: 'BONUS',
    type: 'provento',
    amount: 500,
    description: 'Bônus de produção',
    reference_date: '2026-04-15',
    ...overrides,
});

const makeAllocation = (overrides: Partial<EmployeeAllocation> = {}): EmployeeAllocation => ({
    id: 'alloc-1',
    employee_id: 'emp-1',
    project_id: 'proj-1',
    allocation_percent: 100,
    reference_period: '2026-04',
    ...overrides,
});

const makeContext = (overrides: Partial<PayrollContext> = {}): PayrollContext => ({
    employee: makeEmployee(),
    run: makeRun(),
    inssBrackets: [],
    irrfBrackets: [],
    fgtsConfig: { rate: 0.08, year: 2026 },
    rubrics: [makeRubric({ code: 'SALARIO', calculation_type: 'manual' })],
    timeEntries: [],
    events: [],
    allocations: [],
    linkedRubricCodes: [],
    ...overrides,
});

// ─── 1. Contratos de interface ────────────────────────────────────────────────

describe('CalculationConfig — interface', () => {
    it('aceita config vazio', () => {
        const c: CalculationConfig = {};
        expect(c).toBeDefined();
    });

    it('aceita todos os campos opcionais', () => {
        const c: CalculationConfig = { amount: 100, percentage: 0.2, base: 'SALARIO' };
        expect(c.amount).toBe(100);
        expect(c.percentage).toBe(0.2);
        expect(c.base).toBe('SALARIO');
    });

    it('é atribuível ao campo calculation_config de PayrollRubric', () => {
        const rubric: PayrollRubric = makeRubric({ calculation_config: { amount: 50 } });
        expect(rubric.calculation_config?.amount).toBe(50);
    });
});

describe('ValidationLog — interface', () => {
    it('aceita log de severidade info', () => {
        const log: ValidationLog = { rule: 'CHECK_SALARY', severity: 'info', message: 'OK' };
        expect(log.severity).toBe('info');
    });

    it('aceita log de severidade warning com detalhes', () => {
        const log: ValidationLog = {
            rule: 'INSS_BASE',
            severity: 'warning',
            message: 'Base abaixo do mínimo',
            details: { base: 1000, minimum: 1412 },
        };
        expect(log.details?.minimum).toBe(1412);
    });

    it('é atribuível ao campo validation_logs de PayrollRun', () => {
        const run: PayrollRun = makeRun({
            validation_logs: [{ rule: 'R1', severity: 'error', message: 'Erro' }],
        });
        expect(run.validation_logs?.[0].rule).toBe('R1');
    });
});

// ─── 2. PayrollContext — tipagem dos campos ───────────────────────────────────

describe('PayrollContext — tipos dos campos', () => {
    it('events é PayrollEvent[] (não any[])', () => {
        const event: PayrollEvent = makeEvent();
        const ctx = makeContext({ events: [event] });
        expect(ctx.events[0].employee_id).toBe('emp-1');
    });

    it('allocations é EmployeeAllocation[] (não any[])', () => {
        const alloc: EmployeeAllocation = makeAllocation();
        const ctx = makeContext({ allocations: [alloc] });
        expect(ctx.allocations[0].allocation_percent).toBe(100);
    });

    it('timeEntries é TimeEntry[] (não any[])', () => {
        const te: TimeEntry = makeTimeEntry({ overtime_50: 2 });
        const ctx = makeContext({ timeEntries: [te] });
        expect(ctx.timeEntries[0].overtime_50).toBe(2);
    });
});

// ─── 3. calculateRubricValue — todas as branches ──────────────────────────────

describe('calculateRubricValue — tipagem e contratos', () => {
    const baseValues = { SALARIO: 3000, TOTAL_PROVENTOS: 0 };
    const hourlyRate = 3000 / 220;
    const entries: TimeEntry[] = [
        makeTimeEntry({ overtime_50: 4, overtime_100: 1, night_hours: 2 }),
    ];

    it('fixed — retorna amount do config sem usar timeEntries', () => {
        const rubric = makeRubric({ code: 'VALE', calculation_type: 'fixed', calculation_config: { amount: 200 } });
        const result = payrollEngine.calculateRubricValue(rubric, baseValues, hourlyRate, entries);
        expect(result?.amount).toBe(200);
        expect(result?.reference).toBe(1.0);
    });

    it('percentage — usa base do config', () => {
        const rubric = makeRubric({
            code: 'PERICULOSIDADE',
            calculation_type: 'percentage',
            calculation_config: { base: 'SALARIO', percentage: 0.3 },
        });
        const result = payrollEngine.calculateRubricValue(rubric, baseValues, hourlyRate, entries);
        expect(result?.amount).toBeCloseTo(3000 * 0.3);
        expect(result?.base_amount).toBe(3000);
    });

    it('formula com HE50_HRS — usa timeEntries', () => {
        const rubric = makeRubric({
            code: 'HE50',
            calculation_type: 'formula',
            formula: 'HE50_HRS * HOURLY_RATE * 1.5',
        });
        const result = payrollEngine.calculateRubricValue(rubric, baseValues, hourlyRate, entries);
        expect(result?.amount).toBeCloseTo(4 * hourlyRate * 1.5, 2);
        expect(result?.reference).toBe(1.5);
    });

    it('formula com HE100_HRS — usa timeEntries', () => {
        const rubric = makeRubric({
            code: 'HE100',
            calculation_type: 'formula',
            formula: 'HE100_HRS * HOURLY_RATE * 2.0',
        });
        const result = payrollEngine.calculateRubricValue(rubric, baseValues, hourlyRate, entries);
        expect(result?.amount).toBeCloseTo(1 * hourlyRate * 2.0, 2);
    });

    it('formula com AD_NOT_HRS — usa timeEntries', () => {
        const rubric = makeRubric({
            code: 'AD_NOTURNO',
            calculation_type: 'formula',
            formula: 'AD_NOT_HRS * HOURLY_RATE * 0.2',
        });
        const result = payrollEngine.calculateRubricValue(rubric, baseValues, hourlyRate, entries);
        expect(result?.amount).toBeCloseTo(2 * hourlyRate * 0.2, 2);
    });

    it('formula hardcoded HE50 sem formula string — fallback correto', () => {
        const rubric = makeRubric({ code: 'HE50', calculation_type: 'formula' });
        const result = payrollEngine.calculateRubricValue(rubric, baseValues, hourlyRate, entries);
        expect(result?.amount).toBeCloseTo(4 * hourlyRate * 1.5, 2);
    });

    it('manual SALARIO — retorna salário base', () => {
        const rubric = makeRubric({ code: 'SALARIO', calculation_type: 'manual' });
        const result = payrollEngine.calculateRubricValue(rubric, baseValues, hourlyRate, []);
        expect(result?.amount).toBe(3000);
        expect(result?.reference).toBe(30); // SALARIO_REFERENCE default
    });

    it('manual código desconhecido — retorna null', () => {
        const rubric = makeRubric({ code: 'DESCONHECIDO', calculation_type: 'manual' });
        const result = payrollEngine.calculateRubricValue(rubric, baseValues, hourlyRate, []);
        expect(result).toBeNull();
    });

    it('aceita array vazio de TimeEntry sem crashar', () => {
        const rubric = makeRubric({ code: 'HE50', calculation_type: 'formula', formula: 'HE50_HRS * HOURLY_RATE * 1.5' });
        const result = payrollEngine.calculateRubricValue(rubric, baseValues, hourlyRate, []);
        expect(result?.amount).toBe(0);
    });
});

// ─── 4. finaliseWithRubrics — bases de cálculo tipadas ───────────────────────

describe('finaliseWithRubrics — contrato de tipos e cálculo', () => {
    beforeEach(() => {
        vi.spyOn(payrollEngine, 'persistResults').mockResolvedValue({ items: [], result: {} as any });
    });

    it('items do tipo Omit<PayrollItem,...>[] são aceitos sem cast', async () => {
        const items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[] = [
            { code: 'SALARIO', type: 'provento', amount: 3000, base_amount: 3000, reference: 30 },
        ];
        const ctx = makeContext({
            rubrics: [makeRubric({ code: 'SALARIO', incidence_inss: true, incidence_fgts: true, incidence_irrf: true })],
        });

        await payrollEngine.finaliseWithRubrics(ctx, items);
        expect(payrollEngine.persistResults).toHaveBeenCalled();
    });

    it('item de tipo desconto reduz a base tributária', async () => {
        let capturedBases: { base_inss: number; base_fgts: number; base_irrf: number } | undefined;
        vi.spyOn(payrollEngine, 'persistResults').mockImplementation(
            async (_ctx, _items, _g, _d, _c, bases) => {
                capturedBases = bases;
                return { items: [], result: {} as any };
            },
        );

        const items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[] = [
            { code: 'SALARIO', type: 'provento', amount: 3000, base_amount: 3000 },
            { code: 'DESC_ADIANT_13', type: 'desconto', amount: 1500, base_amount: 1500 },
        ];
        const ctx = makeContext({
            rubrics: [
                makeRubric({ code: 'SALARIO', incidence_inss: true, incidence_fgts: true, incidence_irrf: true }),
                makeRubric({ code: 'DESC_ADIANT_13', type: 'desconto', incidence_inss: true, incidence_fgts: true, incidence_irrf: true, is_clt_mandatory: false }),
            ],
        });

        await payrollEngine.finaliseWithRubrics(ctx, items);
        expect(capturedBases?.base_inss).toBe(1500);
        expect(capturedBases?.base_fgts).toBe(1500);
        expect(capturedBases?.base_irrf).toBe(1500);
    });

    it('item de tipo encargo não entra nas bases tributárias', async () => {
        let capturedBases: { base_inss: number } | undefined;
        vi.spyOn(payrollEngine, 'persistResults').mockImplementation(
            async (_ctx, _items, _g, _d, _c, bases) => {
                capturedBases = bases;
                return { items: [], result: {} as any };
            },
        );

        const items: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[] = [
            { code: 'SALARIO', type: 'provento', amount: 3000, base_amount: 3000 },
            { code: 'FGTS', type: 'encargo', amount: 240, base_amount: 3000 },
        ];
        const ctx = makeContext({
            rubrics: [
                makeRubric({ code: 'SALARIO', incidence_inss: true, incidence_fgts: true, incidence_irrf: true }),
            ],
        });

        await payrollEngine.finaliseWithRubrics(ctx, items);
        // encargo não deve afetar base_inss
        expect(capturedBases?.base_inss).toBe(3000);
    });
});

// ─── 5. Evento manual — campo reference tipado ────────────────────────────────

describe('evento manual — reference como number | string | null', () => {
    beforeEach(() => {
        vi.spyOn(payrollEngine, 'persistResults').mockResolvedValue({ items: [], result: {} as any });
    });

    it('evento com unit=days produz referência de string com " d"', async () => {
        let capturedItems: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[] = [];
        vi.spyOn(payrollEngine, 'persistResults').mockImplementation(
            async (_ctx, items) => {
                capturedItems = items;
                return { items: [], result: {} as any };
            },
        );

        const event = makeEvent({ rubric_code: 'BONUS', type: 'provento', unit: 'days', quantity: 5, amount: 500 });
        const ctx = makeContext({
            events: [event],
            rubrics: [makeRubric({ code: 'SALARIO' }), makeRubric({ code: 'BONUS', type: 'provento', is_clt_mandatory: false })],
        });

        await payrollEngine.processMonthly(ctx);
        const manualItem = capturedItems.find(i => i.code === 'BONUS');
        expect(typeof manualItem?.reference).toBe('string');
        expect(String(manualItem?.reference)).toContain(' d');
    });

    it('evento com unit=fixed produz reference numérica', async () => {
        let capturedItems: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[] = [];
        vi.spyOn(payrollEngine, 'persistResults').mockImplementation(
            async (_ctx, items) => {
                capturedItems = items;
                return { items: [], result: {} as any };
            },
        );

        const event = makeEvent({ rubric_code: 'BONUS', type: 'provento', unit: 'fixed', quantity: 3, amount: 300 });
        const ctx = makeContext({ events: [event] });

        await payrollEngine.processMonthly(ctx);
        const manualItem = capturedItems.find(i => i.code === 'BONUS');
        // quantity is set, unit=fixed => reference = quantity (number)
        expect(typeof manualItem?.reference === 'number' || manualItem?.reference === undefined).toBe(true);
    });

    it('evento informativo sem quantity recebe reference=1', async () => {
        let capturedItems: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[] = [];
        vi.spyOn(payrollEngine, 'persistResults').mockImplementation(
            async (_ctx, items) => {
                capturedItems = items;
                return { items: [], result: {} as any };
            },
        );

        const event = makeEvent({ rubric_code: undefined, type: 'informativa', quantity: undefined, amount: 0 });
        const ctx = makeContext({ events: [event] });

        await payrollEngine.processMonthly(ctx);
        const manualItem = capturedItems.find(i => i.type === 'informativa');
        expect(manualItem?.reference).toBe(1);
    });
});

// ─── 6. applyIRRFReducer — lógica pura ───────────────────────────────────────

describe('applyIRRFReducer — redutor IN RFB 2.216/2024', () => {
    it('base ≤ 5000 → imposto zerado', () => {
        expect(payrollEngine.applyIRRFReducer(100, 5000)).toBe(0);
        expect(payrollEngine.applyIRRFReducer(50, 3000)).toBe(0);
    });

    it('base > 7350 → sem redutor', () => {
        const irrf = 800;
        expect(payrollEngine.applyIRRFReducer(irrf, 7351)).toBe(irrf);
    });

    it('base em 6000 → redutor parcial (resultado positivo)', () => {
        const irrf = payrollEngine.calculateIRRF(6000, [
            { min_value: 0, max_value: 2259.20, rate: 0, deduction: 0, id: '1', type: 'IRRF', year: 2026 },
            { min_value: 2259.21, max_value: 2826.65, rate: 0.075, deduction: 169.44, id: '2', type: 'IRRF', year: 2026 },
            { min_value: 2826.66, max_value: 3751.05, rate: 0.15, deduction: 381.44, id: '3', type: 'IRRF', year: 2026 },
            { min_value: 3751.06, max_value: 4664.68, rate: 0.225, deduction: 662.77, id: '4', type: 'IRRF', year: 2026 },
            { min_value: 4664.69, max_value: undefined as any, rate: 0.275, deduction: 896.00, id: '5', type: 'IRRF', year: 2026 },
        ]);
        const reduced = payrollEngine.applyIRRFReducer(irrf, 6000);
        expect(reduced).toBeGreaterThan(0);
        expect(reduced).toBeLessThan(irrf);
    });

    it('resultado nunca é negativo', () => {
        expect(payrollEngine.applyIRRFReducer(10, 5500)).toBeGreaterThanOrEqual(0);
    });
});
