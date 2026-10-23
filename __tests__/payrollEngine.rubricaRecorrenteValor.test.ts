import { describe, it, expect, vi, afterEach } from 'vitest';
import { payrollEngine, type PayrollContext } from '../services/payrollEngine';
import { payrollService, type PayrollRubric, type PayrollEvent } from '../services/payrollService';
import type { Employee } from '../services/laborService';
import type { ValorRecorrente } from '../lib/payrollRubricaRecorrente';

// 23/10/2026: o drawer de rubricas recorrentes do colaborador mostrava 11 de 33
// rubricas — o motor só lançava vínculo de rubrica "Automática", e o vínculo não
// tinha valor. Agora qualquer rubrica (exceto as que a folha já calcula) entra
// com o valor do colaborador: R$/mês ou % do salário da competência.

const rubrica = (code: string, extra: Partial<PayrollRubric> = {}): PayrollRubric => ({
    code, name: code, type: 'provento', calculation_type: 'manual',
    incidence_inss: true, incidence_fgts: true, incidence_irrf: true,
    is_automatic: false, is_clt_mandatory: false, active: true, ...extra,
});

const SALARIO = rubrica('SALARIO', { is_automatic: true, is_clt_mandatory: true, category: 'base' });
const GRATIFICACAO = rubrica('GRATIFICACAO');
const ADIANTAMENTO = rubrica('ADIANTAMENTO', { type: 'desconto', is_automatic: true, calculation_type: 'percentage', calculation_config: { base: 'SALARIO', percentage: 0.4 } });
const FGTS = rubrica('FGTS', { type: 'encargo', is_automatic: true, category: 'tax' });

const ctx = (
    linked: string[],
    valores: Record<string, ValorRecorrente> = {},
    events: Partial<PayrollEvent>[] = [],
): PayrollContext => ({
    employee: { id: 'emp-1', org_id: 'org-1', name: 'Ana', base_salary: 3000, status: 'ATIVO', contract_type: 'CLT', role: 'Servente', hourly_cost: 0, hire_date: '2025-01-01' } as Employee,
    run: { id: 'run-1', org_id: 'org-1', start_date: '2026-09-01', end_date: '2026-09-30', status: 'PROCESSANDO', type: 'mensal' } as PayrollContext['run'],
    inssBrackets: [], irrfBrackets: [], fgtsConfig: null,
    rubrics: [SALARIO, GRATIFICACAO, ADIANTAMENTO, FGTS],
    timeEntries: [], events: events as PayrollEvent[], allocations: [],
    linkedRubricCodes: linked,
    linkedRubricValues: valores,
    salaryHistory: [],
});

async function itens(c: PayrollContext) {
    let salvos: { code: string; amount: number; reference?: unknown; origin?: string }[] = [];
    vi.spyOn(payrollService, 'savePayrollData').mockImplementation(async (_run, _emp, items) => {
        salvos = items as typeof salvos;
    });
    await payrollEngine.processMonthly(c);
    return salvos;
}

afterEach(() => vi.restoreAllMocks());

describe('rubrica recorrente do colaborador com valor', () => {
    it('manual com R$ 500 do colaborador entra todo mês com 500', async () => {
        const g = (await itens(ctx(['GRATIFICACAO'], { GRATIFICACAO: { valor_tipo: 'fixo', valor: 500 } }))).filter(i => i.code === 'GRATIFICACAO');
        expect(g).toHaveLength(1);
        expect(g[0].amount).toBe(500);
    });

    it('manual sem valor não lança nada (como antes)', async () => {
        expect((await itens(ctx(['GRATIFICACAO']))).some(i => i.code === 'GRATIFICACAO')).toBe(false);
    });

    it('10% do salário de 3.000,00 = 300,00', async () => {
        const g = (await itens(ctx(['GRATIFICACAO'], { GRATIFICACAO: { valor_tipo: 'percentual', valor: 10 } }))).find(i => i.code === 'GRATIFICACAO');
        expect(g?.amount).toBe(300);
        expect(g?.reference).toBe(0.1);
    });

    it('rubrica de cálculo próprio sem valor segue a rubrica (Adiantamento 40%)', async () => {
        const a = (await itens(ctx(['ADIANTAMENTO']))).find(i => i.code === 'ADIANTAMENTO');
        expect(a?.amount).toBe(1200);
    });

    it('valor do colaborador substitui o cálculo da rubrica', async () => {
        const a = (await itens(ctx(['ADIANTAMENTO'], { ADIANTAMENTO: { valor_tipo: 'fixo', valor: 800 } }))).find(i => i.code === 'ADIANTAMENTO');
        expect(a?.amount).toBe(800);
    });

    it('evento manual do mesmo código no mês substitui o recorrente', async () => {
        const g = (await itens(ctx(
            ['GRATIFICACAO'],
            { GRATIFICACAO: { valor_tipo: 'fixo', valor: 500 } },
            [{ id: 'ev-1', employee_id: 'emp-1', rubric_code: 'GRATIFICACAO', type: 'provento', amount: 200 }],
        ))).filter(i => i.code === 'GRATIFICACAO');
        expect(g.map(i => i.amount)).toEqual([200]);
    });

    it('FGTS vinculado (a folha calcula) não vira item com o valor do vínculo', async () => {
        const f = (await itens(ctx(['FGTS'], { FGTS: { valor_tipo: 'fixo', valor: 999 } }))).filter(i => i.code === 'FGTS');
        expect(f.some(i => i.amount === 999)).toBe(false);
    });
});
