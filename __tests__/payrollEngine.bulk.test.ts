import { describe, it, expect, vi, afterEach } from 'vitest';
import { payrollEngine } from '../services/payrollEngine';
import { laborService } from '../services/laborService';
import { payrollService, type PayrollRun } from '../services/payrollService';

// Lote em "Todas": a lista de orgs vem do `org_id` dos colaboradores VISÍVEIS,
// e isso inclui os compartilhados de outras organizações. Caso real
// (11/10/2026): fornecedor membro só da Alpa via Iago/Clovis, da Garden,
// compartilhados com a Alpa — o lote tentava abrir ciclo na Garden, levava
// 42501 e abortava inteiro.

const ALPA = 'org-alpa';
const GARDEN = 'org-garden';

function preparar() {
    vi.spyOn(laborService, 'listOrgsWithActiveEmployees').mockResolvedValue([ALPA, GARDEN]);
    vi.spyOn(payrollService, 'listRuns').mockResolvedValue([]);
    return vi.spyOn(payrollEngine, 'runPayroll').mockImplementation(
        async (orgId: string) => ({ id: `run-${orgId}`, org_id: orgId } as PayrollRun),
    );
}

afterEach(() => vi.restoreAllMocks());

describe('runBulkPayroll — só nas orgs em que o usuário pode gravar', () => {
    it('não abre ciclo na org de origem de colaborador compartilhado', async () => {
        const runPayroll = preparar();
        const runs = await payrollEngine.runBulkPayroll('2026-10-01', '2026-10-31', 'mensal', undefined, [ALPA]);
        expect(runPayroll.mock.calls.map(c => c[0])).toEqual([ALPA]);
        expect(runs.map(r => r.org_id)).toEqual([ALPA]);
    });

    it('membro das duas: gera nas duas (comportamento do admin não muda)', async () => {
        const runPayroll = preparar();
        await payrollEngine.runBulkPayroll('2026-10-01', '2026-10-31', 'mensal', undefined, [ALPA, GARDEN]);
        expect(runPayroll.mock.calls.map(c => c[0])).toEqual([ALPA, GARDEN]);
    });

    it('sem lista de orgs graváveis: mantém o comportamento antigo', async () => {
        const runPayroll = preparar();
        await payrollEngine.runBulkPayroll('2026-10-01', '2026-10-31');
        expect(runPayroll).toHaveBeenCalledTimes(2);
    });

    it('nenhuma org gravável com colaborador: explica, em vez de 42501', async () => {
        const runPayroll = preparar();
        await expect(
            payrollEngine.runBulkPayroll('2026-10-01', '2026-10-31', 'mensal', undefined, ['org-outra']),
        ).rejects.toThrow(/^Nenhuma organização/);
        expect(runPayroll).not.toHaveBeenCalled();
    });
});
