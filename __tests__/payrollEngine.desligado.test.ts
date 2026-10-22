import { describe, it, expect, vi, afterEach } from 'vitest';
import { payrollEngine, participaDaFolha } from '../services/payrollEngine';
import { laborService, type Employee } from '../services/laborService';
import { payrollService, type PayrollRun } from '../services/payrollService';
import { payrollValidationService } from '../services/payrollValidationService';

// Caso real (22/10/2026): Clovis desligado em 31/05/2026 seguia nas folhas de
// 06, 07 e 09/2026. Quem entra na folha é decidido pela DATA de desligamento
// contra o período — o status de hoje não serve: o mês da rescisão ainda é
// devido, e um desligamento lançado com atraso tem de tirar o colaborador dos
// meses seguintes.

const ORG = 'org-garden';

const emp = (id: string, status: string, termination_date?: string) =>
    ({ id, org_id: ORG, status, termination_date } as unknown as Employee);

afterEach(() => vi.restoreAllMocks());

describe('participaDaFolha', () => {
    it('ativo sem data de desligamento entra', () => {
        expect(participaDaFolha(emp('a', 'ATIVO'), '2026-06-01')).toBe(true);
    });

    it('desligado no próprio mês entra (rescisão é devida)', () => {
        expect(participaDaFolha(emp('a', 'DESLIGADO', '2026-05-31'), '2026-05-01')).toBe(true);
    });

    it('desligado antes do início do período não entra', () => {
        expect(participaDaFolha(emp('a', 'DESLIGADO', '2026-05-31'), '2026-06-01')).toBe(false);
    });

    it('data de desligamento vale mesmo com status ainda ATIVO', () => {
        expect(participaDaFolha(emp('a', 'ATIVO', '2026-05-31'), '2026-06-01')).toBe(false);
    });

    it('desligado sem data não entra', () => {
        expect(participaDaFolha(emp('a', 'DESLIGADO'), '2026-06-01')).toBe(false);
    });

    it('inativo e afastado continuam fora', () => {
        expect(participaDaFolha(emp('a', 'INATIVO'), '2026-06-01')).toBe(false);
        expect(participaDaFolha(emp('a', 'AFASTADO'), '2026-06-01')).toBe(false);
    });

    it('aceita datas com hora', () => {
        expect(participaDaFolha(emp('a', 'DESLIGADO', '2026-05-31T00:00:00'), '2026-06-01T00:00:00')).toBe(false);
    });
});

describe('runPayroll — desligados', () => {
    it('calcula o desligado no mês da rescisão e não nos seguintes', async () => {
        vi.spyOn(payrollService, 'createRun').mockResolvedValue({ id: 'run-1', org_id: ORG } as PayrollRun);
        vi.spyOn(laborService, 'listEmployees').mockResolvedValue([
            emp('ativo', 'ATIVO'),
            emp('desligado-em-maio', 'DESLIGADO', '2026-05-31'),
        ]);
        vi.spyOn(payrollValidationService, 'validateRun').mockResolvedValue(undefined as never);
        const calc = vi.spyOn(payrollEngine, 'calculateEmployeePayroll').mockResolvedValue(undefined as never);

        await payrollEngine.runPayroll(ORG, '2026-05-01', '2026-05-31');
        expect(calc.mock.calls.map(c => c[0])).toEqual(['ativo', 'desligado-em-maio']);

        calc.mockClear();
        await payrollEngine.runPayroll(ORG, '2026-06-01', '2026-06-30');
        expect(calc.mock.calls.map(c => c[0])).toEqual(['ativo']);
    });
});
