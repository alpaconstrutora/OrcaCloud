import { describe, it, expect, vi, afterEach } from 'vitest';
import { payrollEngine, type PayrollContext } from '../services/payrollEngine';
import { payrollService, type PayrollRubric, type PayrollRun, type PayrollResult } from '../services/payrollService';
import type { Employee } from '../services/laborService';
import type { SalarioLancamento } from '../lib/payrollSalarioCompetencia';

// Caso real (22/10/2026): Rogério, dissídio 1.621,00 → 1.767,00 vigente em
// 03/08/2026, e a folha de 08 e 09/2026 saindo com 1.621,00 — o motor lia
// employees.base_salary em vez do Histórico Salarial.

const ROGERIO: SalarioLancamento[] = [
    { effective_date: '2025-08-15', previous_salary: 1621, new_salary: 1621, created_at: '2026-09-03T10:00:00Z' },
    { effective_date: '2026-08-03', previous_salary: 1621, new_salary: 1767, created_at: '2026-09-03T10:01:00Z' },
];

const salario: PayrollRubric = {
    code: 'SALARIO', name: 'Salário', type: 'provento', calculation_type: 'manual',
    incidence_inss: true, incidence_fgts: true, incidence_irrf: true,
    is_automatic: true, is_clt_mandatory: true, active: true,
};
const he50: PayrollRubric = {
    code: 'HE50', name: 'Hora extra 50%', type: 'provento', calculation_type: 'formula', formula: null,
    incidence_inss: true, incidence_fgts: true, incidence_irrf: true,
    is_automatic: false, is_clt_mandatory: true, active: true,
};

const ctxDe = (run: Partial<PayrollRun>, employee: Partial<Employee> = {}, salaryHistory = ROGERIO): PayrollContext => ({
    // Cadastro já no salário NOVO (como no banco hoje): a folha não pode usá-lo para trás.
    employee: { id: 'emp-rogerio', org_id: 'org-1', name: 'Rogério', base_salary: 1767, status: 'ATIVO', contract_type: 'CLT', role: 'Servente', hourly_cost: 0, hire_date: '2025-08-15', ...employee } as Employee,
    run: { id: 'run-1', org_id: 'org-1', start_date: '2026-08-01', end_date: '2026-08-31', status: 'PROCESSANDO', type: 'mensal', ...run } as PayrollRun,
    inssBrackets: [], irrfBrackets: [], fgtsConfig: null,
    rubrics: [salario, he50],
    timeEntries: [], events: [], allocations: [], linkedRubricCodes: [],
    salaryHistory,
});

function capturar() {
    const salvo: { items: { code: string; amount: number; reference?: unknown }[]; result?: Omit<PayrollResult, 'payroll_run_id' | 'employee_id'> } = { items: [] };
    vi.spyOn(payrollService, 'savePayrollData').mockImplementation(async (_run, _emp, items, result) => {
        salvo.items = items as typeof salvo.items;
        salvo.result = result;
    });
    return salvo;
}

afterEach(() => vi.restoreAllMocks());

describe('folha mensal pelo Histórico Salarial', () => {
    it('reajuste no meio do mês sai proporcional e o salário base gravado é o vigente no fim', async () => {
        const salvo = capturar();
        await payrollEngine.processMonthly(ctxDe({}));
        const s = salvo.items.find(i => i.code === 'SALARIO');
        expect(s?.amount).toBe(1757.27);
        expect(s?.reference).toBe(30);
        expect(salvo.result?.base_salary).toBe(1767);
    });

    it('competência anterior ao reajuste usa o salário antigo, mesmo com o cadastro já no novo', async () => {
        const salvo = capturar();
        await payrollEngine.processMonthly(ctxDe({ start_date: '2026-07-01', end_date: '2026-07-31' }));
        expect(salvo.items.find(i => i.code === 'SALARIO')?.amount).toBe(1621);
        expect(salvo.result?.base_salary).toBe(1621);
    });

    it('hora extra usa o salário da competência, não o de hoje', async () => {
        const salvo = capturar();
        const ctx = ctxDe({ start_date: '2026-07-01', end_date: '2026-07-31' });
        ctx.timeEntries = [{ id: 't', employee_id: 'emp-rogerio', date: '2026-07-10', hours_worked: 8, overtime_50: 10, overtime_100: 0, night_hours: 0, status: 'APROVADO' }];
        await payrollEngine.processMonthly(ctx);
        expect(salvo.items.find(i => i.code === 'HE50')?.amount).toBeCloseTo(10 * (1621 / 220) * 1.5, 2);
    });

    it('sem histórico continua no cadastro', async () => {
        const salvo = capturar();
        await payrollEngine.processMonthly(ctxDe({}, { base_salary: 2500 }, []));
        expect(salvo.items.find(i => i.code === 'SALARIO')?.amount).toBe(2500);
        expect(salvo.result?.base_salary).toBe(2500);
    });

    it('mês da admissão continua proporcional a partir dela', async () => {
        const salvo = capturar();
        await payrollEngine.processMonthly(ctxDe({}, { base_salary: 3000, hire_date: '2026-08-11' }, []));
        const s = salvo.items.find(i => i.code === 'SALARIO');
        expect(s?.amount).toBe(2000);
        expect(s?.reference).toBe(20);
    });
});

describe('demais tipos de folha pelo Histórico Salarial', () => {
    it('13º usa o salário vigente no fim do período', async () => {
        const salvo = capturar();
        await payrollEngine.processThirteenth(ctxDe({ type: 'decimo_terceiro', subtype: '1_parcela', start_date: '2026-07-01', end_date: '2026-07-31' }));
        expect(salvo.items.find(i => i.code === 'DECIMO')?.amount).toBe(810.5);
    });

    it('férias usam o salário vigente no início (concessão)', async () => {
        const salvo = capturar();
        await payrollEngine.processVacation(ctxDe({ type: 'ferias', start_date: '2026-08-01', end_date: '2026-08-30' }));
        expect(salvo.items.find(i => i.code === 'FERIAS')?.amount).toBe(1621);
    });
});
