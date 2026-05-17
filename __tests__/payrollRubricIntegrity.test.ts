/**
 * Testes de integridade referencial entre payrollEngine e tabela rubrics.
 *
 * Garante que:
 *  1. Todo código gerado pelo engine existe em SYSTEM_RUBRIC_CODES (= seed do banco)
 *  2. DESC_ADIANT_13 (dedução do 13º) é encontrado nas rubricas e processado sem erros
 *  3. OUTROS (fallback de eventos manuais) é uma rubrica válida
 *  4. finaliseWithRubrics não silencia descontos com rubrica conhecida
 *  5. Proventos sem rubrica são tributados (fail-safe); descontos sem rubrica são ignorados
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { payrollEngine } from '../services/payrollEngine';
import { SYSTEM_RUBRIC_CODES, SYSTEM_RUBRIC_CODE_SET } from '../lib/systemRubricCodes';
import type { PayrollRubric, PayrollItem } from '../services/payrollService';
import type { INSSBracket, IRRFBracket, FGTSConfig } from '../services/fiscalService';

// ─── Mock do Supabase (evita conexão real) ────────────────────────────────────
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

// ─── Fixtures de Rubricas ─────────────────────────────────────────────────────

const makeRubric = (
    code: string,
    type: 'provento' | 'desconto' | 'encargo',
    opts: Partial<PayrollRubric> = {}
): PayrollRubric => ({
    code,
    name: code,
    type,
    incidence_inss: type === 'provento',
    incidence_fgts: type === 'provento',
    incidence_irrf: type === 'provento',
    is_automatic: false,
    active: true,
    ...opts,
});

// Rubricas completas — espelha o seed do banco + novas rubricas da migration
const ALL_RUBRICS: PayrollRubric[] = [
    makeRubric('SALARIO',        'provento', { incidence_inss: true,  incidence_fgts: true,  incidence_irrf: true,  is_automatic: true }),
    makeRubric('SALDO_SALARIO',  'provento', { incidence_inss: true,  incidence_fgts: true,  incidence_irrf: true,  is_automatic: true }),
    makeRubric('HE50',           'provento', { incidence_inss: true,  incidence_fgts: true,  incidence_irrf: true }),
    makeRubric('HE100',          'provento', { incidence_inss: true,  incidence_fgts: true,  incidence_irrf: true }),
    makeRubric('AD_NOTURNO',     'provento', { incidence_inss: true,  incidence_fgts: true,  incidence_irrf: true }),
    makeRubric('FERIAS',         'provento', { incidence_inss: true,  incidence_fgts: true,  incidence_irrf: true,  is_automatic: true }),
    makeRubric('FERIAS_TERCO',   'provento', { incidence_inss: true,  incidence_fgts: true,  incidence_irrf: true,  is_automatic: true }),
    makeRubric('DECIMO',         'provento', { incidence_inss: true,  incidence_fgts: true,  incidence_irrf: true,  is_automatic: true }),
    makeRubric('BONUS',          'provento', { incidence_inss: true,  incidence_fgts: true,  incidence_irrf: true }),
    // Descontos
    makeRubric('INSS',           'desconto', { incidence_inss: false, incidence_fgts: false, incidence_irrf: false, is_automatic: true }),
    makeRubric('IRRF',           'desconto', { incidence_inss: false, incidence_fgts: false, incidence_irrf: false, is_automatic: true }),
    makeRubric('DESC_ADIANT_13', 'desconto', { incidence_inss: false, incidence_fgts: false, incidence_irrf: false, is_automatic: true }),
    makeRubric('OUTROS',         'desconto', { incidence_inss: false, incidence_fgts: false, incidence_irrf: false }),
    // Encargos
    makeRubric('FGTS',           'encargo',  { incidence_inss: false, incidence_fgts: false, incidence_irrf: false, is_automatic: true }),
    makeRubric('FGTS_MULTA',     'encargo',  { incidence_inss: false, incidence_fgts: false, incidence_irrf: false, is_automatic: true }),
    makeRubric('ADIANTAMENTO',   'desconto', { incidence_inss: false, incidence_fgts: false, incidence_irrf: false }),
];

const RUBRIC_CODE_SET = new Set(ALL_RUBRICS.map(r => r.code));

// ─── Fixtures de Faixas Fiscais ───────────────────────────────────────────────

const INSS_BRACKETS: INSSBracket[] = [
    { min_value: 0, max_value: 1412, rate: 0.075, deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 1412, max_value: 2666.68, rate: 0.09, deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 2666.68, max_value: 4000.03, rate: 0.12, deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 4000.03, max_value: 7786.02, rate: 0.14, deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
];

const IRRF_BRACKETS: IRRFBracket[] = [
    { min_value: 0, max_value: 2112, rate: 0, deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 2112, max_value: 2826.65, rate: 0.075, deduction: 158.40, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 2826.65, max_value: 3751.05, rate: 0.15, deduction: 370.40, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 3751.05, max_value: 4664.68, rate: 0.225, deduction: 651.73, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 4664.68, max_value: null, rate: 0.275, deduction: 884.96, valid_from: '2024-01-01', valid_to: '2024-12-31' },
];

const FGTS_CONFIG: FGTSConfig = { rate: 0.08, valid_from: '2024-01-01', valid_to: null };

// ─── Contexto mínimo para finaliseWithRubrics ─────────────────────────────────

const makeCtx = (overrides: Partial<any> = {}) => ({
    employee: { id: 'emp-test', base_salary: 3000, contract_type: 'CLT', hire_date: null },
    run: { id: 'run-test', start_date: '2024-01-01', end_date: '2024-01-31', type: 'mensal' },
    inssBrackets: INSS_BRACKETS,
    irrfBrackets: IRRF_BRACKETS,
    fgtsConfig: FGTS_CONFIG,
    rubrics: ALL_RUBRICS,
    timeEntries: [],
    events: [],
    allocations: [],
    linkedRubricCodes: [],
    ...overrides,
});

// ─── Helper: chama finaliseWithRubrics capturando os itens ────────────────────

async function runFinalise(
    initialItems: Omit<PayrollItem, 'payroll_run_id' | 'employee_id'>[],
    ctxOverrides: Partial<any> = {}
) {
    const capturedItems: any[] = [];

    const spy = vi.spyOn(payrollEngine, 'persistResults').mockImplementationOnce(
        async (_ctx, items) => {
            capturedItems.push(...items);
            return { items, result: {} as any };
        }
    );

    await payrollEngine.finaliseWithRubrics(makeCtx(ctxOverrides), initialItems as any);
    spy.mockRestore();

    return capturedItems;
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('SYSTEM_RUBRIC_CODES — completude do conjunto canônico', () => {
    it('contém todos os códigos hardcoded usados pelo engine (sem fallback)', () => {
        const engineHardcoded = [
            'SALARIO', 'HE50', 'FERIAS', 'FERIAS_TERCO',
            'DECIMO', 'DESC_ADIANT_13', 'SALDO_SALARIO',
            'INSS', 'IRRF', 'FGTS',
            'BONUS', 'OUTROS',
        ];
        for (const code of engineHardcoded) {
            expect(SYSTEM_RUBRIC_CODE_SET.has(code),
                `Código '${code}' usado pelo engine mas ausente de SYSTEM_RUBRIC_CODES`
            ).toBe(true);
        }
    });

    it('DESC_ADIANT_13 está no conjunto — rubrica da dedução do 13º', () => {
        expect(SYSTEM_RUBRIC_CODE_SET.has('DESC_ADIANT_13')).toBe(true);
    });

    it('OUTROS está no conjunto — rubrica de fallback para eventos sem código', () => {
        expect(SYSTEM_RUBRIC_CODE_SET.has('OUTROS')).toBe(true);
    });
});

describe('finaliseWithRubrics — integridade dos códigos gerados', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('13º salário 2ª parcela: todos os itens têm códigos presentes nas rubricas', async () => {
        const items = await runFinalise([
            { code: 'DECIMO',         type: 'provento', amount: 5000, base_amount: 5000, reference: 1.0 },
            { code: 'DESC_ADIANT_13', type: 'desconto', amount: 2500, base_amount: 2500, reference: 1.0 },
        ]);

        const outputCodes = items.map((i: any) => i.code);
        expect(outputCodes).toContain('DECIMO');
        expect(outputCodes).toContain('DESC_ADIANT_13');
        expect(outputCodes).toContain('INSS');
        expect(outputCodes).toContain('FGTS');

        for (const code of outputCodes) {
            expect(RUBRIC_CODE_SET.has(code),
                `Código '${code}' no output não existe nas rubricas do banco`
            ).toBe(true);
        }
    });

    it('férias: FERIAS + FERIAS_TERCO + tributos — todos os códigos presentes', async () => {
        const items = await runFinalise([
            { code: 'FERIAS',       type: 'provento', amount: 3000, base_amount: 3000, reference: 30 },
            { code: 'FERIAS_TERCO', type: 'provento', amount: 1000, base_amount: 3000, reference: 0.33 },
        ]);

        const outputCodes = items.map((i: any) => i.code);
        expect(outputCodes).toContain('FERIAS');
        expect(outputCodes).toContain('FERIAS_TERCO');
        expect(outputCodes).toContain('INSS');
        expect(outputCodes).toContain('FGTS');

        for (const code of outputCodes) {
            expect(RUBRIC_CODE_SET.has(code),
                `Código '${code}' não está nas rubricas`
            ).toBe(true);
        }
    });

    it('rescisão: SALDO_SALARIO + FERIAS + DECIMO — todos os códigos presentes', async () => {
        const items = await runFinalise([
            { code: 'SALDO_SALARIO', type: 'provento', amount: 3000, base_amount: 3000, reference: 30 },
            { code: 'FERIAS',        type: 'provento', amount: 3000, base_amount: 3000, reference: 30 },
            { code: 'DECIMO',        type: 'provento', amount: 1500, base_amount: 3000, reference: 6 },
        ]);

        const outputCodes = items.map((i: any) => i.code);
        expect(outputCodes).toContain('SALDO_SALARIO');
        expect(outputCodes).toContain('INSS');
        expect(outputCodes).toContain('FGTS');

        for (const code of outputCodes) {
            expect(RUBRIC_CODE_SET.has(code)).toBe(true);
        }
    });

    it('evento manual sem rubric_code (provento) → fallback BONUS deve estar nas rubricas', async () => {
        // Simula o fallback que o engine aplica antes de chamar finaliseWithRubrics
        const items = await runFinalise([
            { code: 'BONUS', type: 'provento', amount: 500, base_amount: 500, origin: 'manual' },
        ]);
        const outputCodes = items.map((i: any) => i.code);
        expect(outputCodes).toContain('BONUS');
        expect(RUBRIC_CODE_SET.has('BONUS')).toBe(true);
    });

    it('evento manual sem rubric_code (desconto) → fallback OUTROS deve estar nas rubricas', async () => {
        const items = await runFinalise([
            { code: 'OUTROS', type: 'desconto', amount: 200, base_amount: 200, origin: 'manual' },
        ]);
        const outputCodes = items.map((i: any) => i.code);
        expect(outputCodes).toContain('OUTROS');
        expect(RUBRIC_CODE_SET.has('OUTROS')).toBe(true);
    });
});

describe('finaliseWithRubrics — base tributária com DESC_ADIANT_13', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('DECIMO (incidence_inss=true) contribui para base INSS; DESC_ADIANT_13 (incidence_inss=false) não reduz base', async () => {
        // DECIMO = R$ 6.000 → incide INSS
        // DESC_ADIANT_13 = R$ 3.000 (desconto) → NÃO incide (dedução só reduz líquido)
        // Base INSS esperada = 6.000 (não 3.000)
        const items = await runFinalise([
            { code: 'DECIMO',         type: 'provento', amount: 6000, base_amount: 6000 },
            { code: 'DESC_ADIANT_13', type: 'desconto', amount: 3000, base_amount: 3000 },
        ]);

        const inssItem = items.find((i: any) => i.code === 'INSS');
        expect(inssItem).toBeDefined();
        // base_inss deve ser 6000 (DECIMO), não 3000 (6000 - 3000)
        expect(inssItem!.base_amount).toBeCloseTo(6000, 0);
    });

    it('DESC_ADIANT_13 não deve gerar erro mesmo com rubrica registrada (sem código órfão)', async () => {
        const items = await runFinalise([
            { code: 'DECIMO',         type: 'provento', amount: 5000, base_amount: 5000 },
            { code: 'DESC_ADIANT_13', type: 'desconto', amount: 2500, base_amount: 2500 },
        ]);

        // O item DESC_ADIANT_13 deve aparecer nos itens persistidos
        const deducaoItem = items.find((i: any) => i.code === 'DESC_ADIANT_13');
        expect(deducaoItem).toBeDefined();
        expect(deducaoItem!.amount).toBe(2500);
    });
});

describe('finaliseWithRubrics — comportamento fail-safe com códigos desconhecidos', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('provento sem rubrica → assume incidência total (fail-safe conservador)', async () => {
        // Rubrica 'CODIGO_DESCONHECIDO' não existe no contexto
        const ctxSemRubrica = { rubrics: ALL_RUBRICS.filter(r => r.code !== 'BONUS') };
        const items = await runFinalise([
            { code: 'BONUS', type: 'provento', amount: 1000, base_amount: 1000 },
        ], ctxSemRubrica);

        const inssItem = items.find((i: any) => i.code === 'INSS');
        expect(inssItem).toBeDefined();
        // INSS deve incidir sobre 1000 (comportamento fail-safe para provento sem rubrica)
        expect(inssItem!.base_amount).toBeCloseTo(1000, 0);
    });

    it('desconto sem rubrica → NÃO altera base tributária (proteção contra abatimento indevido)', async () => {
        // Remove OUTROS das rubricas para simular código órfão
        const ctxSemOthers = { rubrics: ALL_RUBRICS.filter(r => r.code !== 'OUTROS') };

        // Só tem um desconto órfão — nenhum provento para gerar INSS
        const items = await runFinalise([
            { code: 'OUTROS', type: 'desconto', amount: 500, base_amount: 500 },
        ], ctxSemOthers);

        // Sem proventos, INSS deve ser 0 (desconto órfão não afeta base)
        const inssItem = items.find((i: any) => i.code === 'INSS');
        expect(inssItem).toBeUndefined();
    });
});

describe('Invariante geral — nenhum item gerado tem código fora de SYSTEM_RUBRIC_CODES', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('todos os tipos de folha produzem apenas códigos canônicos', async () => {
        const scenarios = [
            // Mensal (simplificado — sem rubrica automática, só tributos)
            [{ code: 'SALARIO', type: 'provento', amount: 3000, base_amount: 3000 }],
            // Férias
            [
                { code: 'FERIAS', type: 'provento', amount: 3000, base_amount: 3000, reference: 30 },
                { code: 'FERIAS_TERCO', type: 'provento', amount: 1000, base_amount: 3000, reference: 0.33 },
            ],
            // 13º 1ª parcela
            [{ code: 'DECIMO', type: 'provento', amount: 1500, base_amount: 3000, reference: 0.5 }],
            // 13º 2ª parcela
            [
                { code: 'DECIMO', type: 'provento', amount: 3000, base_amount: 3000, reference: 1.0 },
                { code: 'DESC_ADIANT_13', type: 'desconto', amount: 1500, base_amount: 1500, reference: 1.0 },
            ],
            // Rescisão
            [
                { code: 'SALDO_SALARIO', type: 'provento', amount: 3000, base_amount: 3000 },
                { code: 'FERIAS', type: 'provento', amount: 3000, base_amount: 3000 },
                { code: 'DECIMO', type: 'provento', amount: 1500, base_amount: 3000 },
            ],
            // Evento manual — fallback
            [
                { code: 'BONUS', type: 'provento', amount: 500, base_amount: 500, origin: 'manual' },
                { code: 'OUTROS', type: 'desconto', amount: 100, base_amount: 100, origin: 'manual' },
            ],
        ];

        for (const initialItems of scenarios) {
            const items = await runFinalise(initialItems as any);
            for (const item of items) {
                expect(
                    SYSTEM_RUBRIC_CODE_SET.has(item.code),
                    `Código '${item.code}' no output não está em SYSTEM_RUBRIC_CODES`
                ).toBe(true);
            }
        }
    });
});
