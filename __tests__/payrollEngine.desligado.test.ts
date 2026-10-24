import { describe, it, expect, vi, afterEach } from 'vitest';
import { payrollEngine, participaDaFolha, saiDaFolha } from '../services/payrollEngine';
import { laborService, type Employee } from '../services/laborService';
import { payrollService, type PayrollRun } from '../services/payrollService';
import { payrollValidationService } from '../services/payrollValidationService';

// Casos reais (22/10/2026):
//  • Clovis desligado em 31/05/2026 seguia nas folhas de 06, 07 e 09/2026;
//  • Iago, admissão 01/11/2026, tinha folha desde 04/2026.
// Quem entra na folha é decidido pelas DATAS contra o período — o status de
// hoje não basta: o mês da rescisão ainda é devido, e um desligamento lançado
// com atraso tem de tirar o colaborador dos meses seguintes. E ao reprocessar,
// quem saiu perde os itens antigos (antes ficavam lá).

const ORG = 'org-garden';

const emp = (id: string, status: string, termination_date?: string, hire_date?: string, org_id: string = ORG) =>
    ({ id, org_id, status, termination_date, hire_date } as unknown as Employee);

const JUN = ['2026-06-01', '2026-06-30'] as const;

afterEach(() => vi.restoreAllMocks());

describe('participaDaFolha', () => {
    it('ativo sem datas entra', () => {
        expect(participaDaFolha(emp('a', 'ATIVO'), ...JUN)).toBe(true);
    });

    it('desligado no próprio mês entra (rescisão é devida)', () => {
        expect(participaDaFolha(emp('a', 'DESLIGADO', '2026-05-31'), '2026-05-01', '2026-05-31')).toBe(true);
    });

    it('desligado antes do início do período não entra', () => {
        expect(participaDaFolha(emp('a', 'DESLIGADO', '2026-05-31'), ...JUN)).toBe(false);
    });

    it('data de desligamento vale mesmo com status ainda ATIVO', () => {
        expect(participaDaFolha(emp('a', 'ATIVO', '2026-05-31'), ...JUN)).toBe(false);
    });

    it('desligado sem data não entra', () => {
        expect(participaDaFolha(emp('a', 'DESLIGADO'), ...JUN)).toBe(false);
    });

    it('inativo e afastado continuam fora', () => {
        expect(participaDaFolha(emp('a', 'INATIVO'), ...JUN)).toBe(false);
        expect(participaDaFolha(emp('a', 'AFASTADO'), ...JUN)).toBe(false);
    });

    it('admitido depois do fim do período não entra', () => {
        expect(participaDaFolha(emp('a', 'ATIVO', undefined, '2026-11-01'), ...JUN)).toBe(false);
    });

    it('admitido dentro do período entra', () => {
        expect(participaDaFolha(emp('a', 'ATIVO', undefined, '2026-06-30'), ...JUN)).toBe(true);
        expect(participaDaFolha(emp('a', 'ATIVO', undefined, '2026-06-15'), ...JUN)).toBe(true);
    });

    it('aceita datas com hora', () => {
        expect(participaDaFolha(emp('a', 'DESLIGADO', '2026-05-31T00:00:00'), '2026-06-01T00:00:00', '2026-06-30T00:00:00')).toBe(false);
        expect(participaDaFolha(emp('a', 'ATIVO', undefined, '2026-07-01T00:00:00'), '2026-06-01', '2026-06-30T00:00:00')).toBe(false);
    });
});

describe('saiDaFolha', () => {
    it('inativo, desligado antes e não admitido saem; afastado não', () => {
        expect(saiDaFolha(emp('a', 'INATIVO'), ...JUN)).toBe(true);
        expect(saiDaFolha(emp('a', 'DESLIGADO', '2026-05-31'), ...JUN)).toBe(true);
        expect(saiDaFolha(emp('a', 'ATIVO', undefined, '2026-11-01'), ...JUN)).toBe(true);
        expect(saiDaFolha(emp('a', 'AFASTADO'), ...JUN)).toBe(false);
        expect(saiDaFolha(emp('a', 'ATIVO'), ...JUN)).toBe(false);
    });
});

describe('runPayroll — desligados, inativos e não admitidos', () => {
    const preparar = (lista: Employee[], comResultado: string[] = []) => {
        vi.spyOn(payrollService, 'createRun').mockResolvedValue({ id: 'run-1', org_id: ORG } as PayrollRun);
        vi.spyOn(payrollService, 'listResultsByRun').mockResolvedValue(
            comResultado.map(employee_id => ({ employee_id })) as never);
        vi.spyOn(payrollService, 'getRun').mockResolvedValue({ id: 'run-existente', org_id: ORG } as PayrollRun);
        vi.spyOn(payrollService, 'updateRunStatus').mockResolvedValue(undefined as never);
        vi.spyOn(laborService, 'listEmployees').mockResolvedValue(lista);
        vi.spyOn(payrollValidationService, 'validateRun').mockResolvedValue(undefined as never);
        const remover = vi.spyOn(payrollService, 'removeEmployeesFromRun').mockResolvedValue(undefined);
        const calc = vi.spyOn(payrollEngine, 'calculateEmployeePayroll').mockResolvedValue(undefined as never);
        return { remover, calc };
    };

    it('calcula o desligado no mês da rescisão e não nos seguintes', async () => {
        const { calc } = preparar([emp('ativo', 'ATIVO'), emp('desligado-em-maio', 'DESLIGADO', '2026-05-31')]);

        await payrollEngine.runPayroll(ORG, '2026-05-01', '2026-05-31');
        expect(calc.mock.calls.map(c => c[0])).toEqual(['ativo', 'desligado-em-maio']);

        calc.mockClear();
        await payrollEngine.runPayroll(ORG, ...JUN);
        expect(calc.mock.calls.map(c => c[0])).toEqual(['ativo']);
    });

    it('ao reprocessar, tira da folha quem saiu e preserva o afastado', async () => {
        const { remover, calc } = preparar([
            emp('ativo', 'ATIVO'),
            emp('inativo', 'INATIVO'),
            emp('nao-admitido', 'ATIVO', undefined, '2026-11-01'),
            emp('afastado', 'AFASTADO'),
        ]);

        await payrollEngine.runPayroll(ORG, ...JUN, 'mensal', undefined, 'run-existente');

        expect(calc.mock.calls.map(c => c[0])).toEqual(['ativo']);
        expect(remover).toHaveBeenCalledWith('run-existente', ['inativo', 'nao-admitido']);
    });

    // Caso real (24/10/2026): o Rogério é registrado na Garden, mas tinha resultado em 11 folhas da
    // Alpa (geradas quando a folha ainda incluía compartilhados). Reprocessar a Alpa não o tirava: a
    // limpeza só olhava quem é DA org. Regra do usuário: "a folha é gerada apenas em uma organização.
    // Apenas na organizacao que ele é registrado" — o custo vai para outra pela aba Alocações.
    it('ao reprocessar, tira quem tem resultado na folha mas é registrado em outra organização', async () => {
        const { remover, calc } = preparar(
            [
                emp('ativo', 'ATIVO'),
                emp('afastado', 'AFASTADO'),
                // compartilhado com esta org (vem no listEmployees), mas registrado em outra
                emp('compartilhado', 'ATIVO', undefined, undefined, 'org-alpa'),
            ],
            // 'rogerio' nem vem no listEmployees: foi para outra org e não é compartilhado
            ['ativo', 'afastado', 'compartilhado', 'rogerio'],
        );

        await payrollEngine.runPayroll(ORG, ...JUN, 'mensal', undefined, 'run-existente');

        expect(calc.mock.calls.map(c => c[0])).toEqual(['ativo']);
        expect(remover).toHaveBeenCalledTimes(1);
        expect(remover.mock.calls[0][0]).toBe('run-existente');
        expect([...remover.mock.calls[0][1]].sort()).toEqual(['compartilhado', 'rogerio']);
    });

    it('folha nova não chama a limpeza', async () => {
        const { remover } = preparar([emp('inativo', 'INATIVO')]);
        await payrollEngine.runPayroll(ORG, ...JUN);
        expect(remover).not.toHaveBeenCalled();
    });
});
