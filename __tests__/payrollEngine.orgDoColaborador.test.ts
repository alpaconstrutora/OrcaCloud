import { describe, it, expect, vi, afterEach } from 'vitest';
import { payrollEngine } from '../services/payrollEngine';
import { laborService, type Employee } from '../services/laborService';
import { payrollService, type PayrollRun } from '../services/payrollService';
import { payrollValidationService } from '../services/payrollValidationService';

// Regra de produto (11/10/2026): a folha é gerada na organização DO
// COLABORADOR. `listEmployees(orgId)` devolve também os compartilhados de
// outras orgs — eles não podem entrar no ciclo de quem os recebeu.

const ALPA = 'org-alpa';
const GARDEN = 'org-garden';

const emp = (id: string, org_id: string, status = 'ATIVO') => ({ id, org_id, status } as unknown as Employee);

afterEach(() => vi.restoreAllMocks());

describe('runPayroll — só colaboradores da própria organização', () => {
    it('não calcula o compartilhado vindo de outra org', async () => {
        vi.spyOn(payrollService, 'createRun').mockResolvedValue({ id: 'run-1', org_id: ALPA } as PayrollRun);
        vi.spyOn(laborService, 'listEmployees').mockResolvedValue([
            emp('proprio', ALPA),
            emp('compartilhado-da-garden', GARDEN),
            emp('inativo', ALPA, 'INATIVO'),
        ]);
        vi.spyOn(payrollValidationService, 'validateRun').mockResolvedValue(undefined as never);
        const calc = vi.spyOn(payrollEngine, 'calculateEmployeePayroll').mockResolvedValue(undefined as never);

        await payrollEngine.runPayroll(ALPA, '2026-10-01', '2026-10-31');

        expect(calc.mock.calls.map(c => c[0])).toEqual(['proprio']);
    });
});
