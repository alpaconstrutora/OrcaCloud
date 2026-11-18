import { describe, it, expect, vi, beforeEach } from 'vitest';

// Histórico de rubrica (payroll_audit_logs): até 18/11/2026 toda alteração ia para
// org_id = 'SYSTEM', que a policy deixava qualquer usuário logado ler — o histórico das
// rubricas de uma organização aparecia para todas. Agora o registro vai para a org DONA da
// rubrica; 'SYSTEM' só para rubrica global (dona NULL). A RLS (migration
// aplicar_20271118911100) recorta a leitura.

const ORG = '00000000-0000-4000-8000-00000000000a';

vi.mock('../lib/supabase', () => {
    const estado = {
        inseridos: {} as Record<string, unknown[]>,
        linha: {} as Record<string, unknown>,
        filtros: [] as [string, string, unknown][],
    };
    const from = vi.fn((tabela: string) => {
        const b: any = {};
        for (const m of ['select', 'update', 'delete', 'order', 'in', 'not', 'limit']) b[m] = vi.fn(() => b);
        b.eq = vi.fn((col: string, val: unknown) => { estado.filtros.push([tabela, col, val]); return b; });
        b.insert = vi.fn((rows: unknown) => {
            (estado.inseridos[tabela] ??= []).push(...(Array.isArray(rows) ? rows : [rows]));
            return b;
        });
        b.single = vi.fn(async () => ({ data: estado.linha[tabela] ?? null, error: null }));
        b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
        return b;
    });
    return {
        supabase: {
            from,
            rpc: vi.fn(),
            auth: { getUser: vi.fn(async () => ({ data: { user: { email: 'ana@exemplo.com' } } })) },
        },
        __estado: estado,
    };
});

import { payrollService, orgDoLogDaRubrica } from '../services/payrollService';
import * as supabaseModule from '../lib/supabase';

const estado = (supabaseModule as any).__estado as {
    inseridos: Record<string, any[]>;
    linha: Record<string, unknown>;
    filtros: [string, string, unknown][];
};

const rubrica = { code: 'BONUS_X', name: 'Bônus X', type: 'provento' } as any;

describe('histórico de rubrica vai para a organização dona', () => {
    beforeEach(() => {
        estado.inseridos = {};
        estado.linha = {};
        estado.filtros = [];
    });

    it('orgDoLogDaRubrica: dona da rubrica; sem dona (global) = SYSTEM', () => {
        expect(orgDoLogDaRubrica(ORG)).toBe(ORG);
        expect(orgDoLogDaRubrica(null)).toBe('SYSTEM');
        expect(orgDoLogDaRubrica(undefined)).toBe('SYSTEM');
    });

    it('criar rubrica: o registro vai para a org em que ela foi criada, não para SYSTEM', async () => {
        estado.linha.rubrics = { ...rubrica, organization_id: ORG };
        await payrollService.createRubric(rubrica, ORG);
        expect(estado.inseridos.payroll_audit_logs).toEqual([
            expect.objectContaining({ org_id: ORG, action: 'CREATE', entity_type: 'RUBRIC', entity_id: 'BONUS_X', user_email: 'ana@exemplo.com' }),
        ]);
    });

    it('editar rubrica: o registro vai para a org dona lida antes da alteração', async () => {
        estado.linha.rubrics = { ...rubrica, organization_id: ORG };
        await payrollService.updateRubric('BONUS_X', { name: 'Bônus X2' });
        expect(estado.inseridos.payroll_audit_logs).toEqual([
            expect.objectContaining({ org_id: ORG, action: 'UPDATE', entity_id: 'BONUS_X' }),
        ]);
    });

    it('excluir rubrica: o registro vai para a org dona (lida antes de apagar)', async () => {
        estado.linha.rubrics = { ...rubrica, organization_id: ORG };
        vi.spyOn(payrollService, 'isRubricUsed').mockResolvedValue(false);
        await payrollService.deleteRubric('BONUS_X');
        expect(estado.inseridos.payroll_audit_logs).toEqual([
            expect.objectContaining({ org_id: ORG, action: 'DELETE', entity_id: 'BONUS_X' }),
        ]);
    });

    it('rubrica global (dona NULL): continua em SYSTEM', async () => {
        estado.linha.rubrics = { ...rubrica, organization_id: null };
        await payrollService.updateRubric('BONUS_X', { name: 'Bônus X2' });
        expect(estado.inseridos.payroll_audit_logs?.[0]?.org_id).toBe('SYSTEM');
    });

    it('ler o histórico sem org (null) não filtra org_id — a RLS recorta', async () => {
        await payrollService.listAuditLogs(null, 'RUBRIC', 'BONUS_X');
        const cols = estado.filtros.filter(([t]) => t === 'payroll_audit_logs').map(([, c]) => c);
        expect(cols).toEqual(['entity_type', 'entity_id']);
    });
});
