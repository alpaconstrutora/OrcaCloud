/**
 * `saveAllocations` — o payload da RPC precisa ser um ARRAY, não uma string.
 *
 * Origem (2026-08-24): o service mandava `JSON.stringify(...)` num parâmetro
 * declarado `JSONB` (migration 20260706000007). O Postgres recebia um escalar
 * jsonb (`'"[]"'`) e `jsonb_array_length` estourava com
 * `22023 cannot get array length of a scalar` — NENHUM salvamento de alocação
 * funcionava, e a tela só dizia "Falha ao salvar a alocação" porque descartava
 * o erro do PostgREST. Confirmado contra o banco antes da correção:
 * string → HTTP 400/22023; array → HTTP 204.
 *
 * O teste trava o formato do payload, que é o que o banco enxerga.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null });
    return { supabase: { rpc: mockRpc, from: vi.fn() }, __mocks: { mockRpc } };
});

import { payrollService } from '../services/payrollService';
import * as supabaseModule from '../lib/supabase';

const { mockRpc } = (supabaseModule as unknown as { __mocks: { mockRpc: ReturnType<typeof vi.fn> } }).__mocks;

describe('payrollService.saveAllocations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRpc.mockResolvedValue({ error: null });
    });

    it('manda p_allocations como ARRAY — string vira escalar jsonb e quebra a RPC', async () => {
        await payrollService.saveAllocations('emp-1', '2026-08', [
            { employee_id: 'emp-1', project_id: 'obra-a', allocation_percent: 60 },
            { employee_id: 'emp-1', project_id: 'obra-b', allocation_percent: 40 },
        ]);

        expect(mockRpc).toHaveBeenCalledTimes(1);
        const [fn, args] = mockRpc.mock.calls[0];
        expect(fn).toBe('upsert_employee_allocations');
        expect(Array.isArray(args.p_allocations)).toBe(true);
        expect(typeof args.p_allocations).not.toBe('string');
    });

    it('envia só project_id e allocation_percent, na ordem recebida', async () => {
        await payrollService.saveAllocations('emp-1', '2026-08', [
            { employee_id: 'emp-1', project_id: 'obra-a', allocation_percent: 70 },
            { employee_id: 'emp-1', project_id: 'obra-b', allocation_percent: 30 },
        ]);

        const [, args] = mockRpc.mock.calls[0];
        expect(args.p_employee_id).toBe('emp-1');
        expect(args.p_period).toBe('2026-08');
        expect(args.p_allocations).toEqual([
            { project_id: 'obra-a', allocation_percent: 70 },
            { project_id: 'obra-b', allocation_percent: 30 },
        ]);
    });

    it('lista vazia continua chamando a RPC — é assim que se apaga o mês', async () => {
        await payrollService.saveAllocations('emp-1', '2026-08', []);
        const [, args] = mockRpc.mock.calls[0];
        expect(args.p_allocations).toEqual([]);
    });

    it('acima de 100% nem chega ao banco', async () => {
        await expect(payrollService.saveAllocations('emp-1', '2026-08', [
            { employee_id: 'emp-1', project_id: 'obra-a', allocation_percent: 80 },
            { employee_id: 'emp-1', project_id: 'obra-b', allocation_percent: 40 },
        ])).rejects.toThrow(/ultrapassa 100%/);
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it('propaga o erro do PostgREST em vez de engolir', async () => {
        mockRpc.mockResolvedValue({ error: { message: 'cannot get array length of a scalar', code: '22023' } });
        await expect(payrollService.saveAllocations('emp-1', '2026-08', [
            { employee_id: 'emp-1', project_id: 'obra-a', allocation_percent: 100 },
        ])).rejects.toMatchObject({ code: '22023' });
    });
});
