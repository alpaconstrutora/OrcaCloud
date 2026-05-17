/**
 * Testes para o utilitário collectSettled.
 *
 * Cenários cobertos:
 *  1. Todos os promises resolvem — values corretos, failedLabels vazio
 *  2. Um promise rejeita — usa fallback na posição, registra label
 *  3. Múltiplos promises rejeitam — todos os fallbacks nas posições corretas
 *  4. Todos rejeitam — array só de fallbacks, todos os labels listados
 *  5. Ordem dos values preservada independente da ordem de resolução
 *  6. buildPartialFailureMessage com 0, 1 e N labels
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectSettled, buildPartialFailureMessage } from '../lib/collectSettled';

const ok = <T>(v: T) => Promise.resolve(v);
const fail = (msg: string) => Promise.reject(new Error(msg));

describe('collectSettled — todos resolvem', () => {
    it('retorna values corretos e failedLabels vazio', async () => {
        const result = await collectSettled([
            { label: 'a', promise: ok(1), fallback: -1 },
            { label: 'b', promise: ok(2), fallback: -2 },
            { label: 'c', promise: ok(3), fallback: -3 },
        ]);
        expect(result.values).toEqual([1, 2, 3]);
        expect(result.failedLabels).toEqual([]);
    });

    it('aceita tipos mistos (arrays, null, number)', async () => {
        const result = await collectSettled([
            { label: 'list',  promise: ok(['x', 'y']), fallback: [] as string[] },
            { label: 'count', promise: ok(42),          fallback: 0 },
            { label: 'obj',   promise: ok(null),        fallback: null },
        ]);
        expect(result.values[0]).toEqual(['x', 'y']);
        expect(result.values[1]).toBe(42);
        expect(result.values[2]).toBeNull();
        expect(result.failedLabels).toHaveLength(0);
    });
});

describe('collectSettled — falha parcial', () => {
    it('usa fallback na posição da falha e preserva o restante', async () => {
        const result = await collectSettled([
            { label: 'colaboradores', promise: ok(['emp1']),   fallback: [] as string[] },
            { label: 'equipes',       promise: fail('timeout'), fallback: [] as string[] },
            { label: 'custos',        promise: ok(99),          fallback: 0 },
        ]);
        expect(result.values[0]).toEqual(['emp1']);
        expect(result.values[1]).toEqual([]);        // fallback
        expect(result.values[2]).toBe(99);
        expect(result.failedLabels).toEqual(['equipes']);
    });

    it('registra o label correto quando o primeiro promise falha', async () => {
        const result = await collectSettled([
            { label: 'primeiro', promise: fail('err'), fallback: [] as never[] },
            { label: 'segundo',  promise: ok([1, 2]),  fallback: [] as number[] },
        ]);
        expect(result.failedLabels).toEqual(['primeiro']);
        expect(result.values[0]).toEqual([]);
        expect(result.values[1]).toEqual([1, 2]);
    });

    it('registra o label correto quando o último promise falha', async () => {
        const result = await collectSettled([
            { label: 'a', promise: ok('ok'), fallback: '' },
            { label: 'z', promise: fail('boom'), fallback: 'fallback' },
        ]);
        expect(result.failedLabels).toEqual(['z']);
        expect(result.values[1]).toBe('fallback');
    });

    it('suporta múltiplas falhas simultâneas', async () => {
        const result = await collectSettled([
            { label: 'x', promise: fail('e1'), fallback: -1 },
            { label: 'y', promise: ok(10),     fallback: 0 },
            { label: 'z', promise: fail('e2'), fallback: -2 },
        ]);
        expect(result.values).toEqual([-1, 10, -2]);
        expect(result.failedLabels).toEqual(['x', 'z']);
    });
});

describe('collectSettled — todos falham', () => {
    it('retorna só fallbacks e lista todos os labels', async () => {
        const result = await collectSettled([
            { label: 'a', promise: fail('e1'), fallback: 'FA' },
            { label: 'b', promise: fail('e2'), fallback: 'FB' },
            { label: 'c', promise: fail('e3'), fallback: 'FC' },
        ]);
        expect(result.values).toEqual(['FA', 'FB', 'FC']);
        expect(result.failedLabels).toEqual(['a', 'b', 'c']);
    });
});

describe('collectSettled — lista vazia', () => {
    it('retorna values vazio e failedLabels vazio', async () => {
        const result = await collectSettled([]);
        expect(result.values).toEqual([]);
        expect(result.failedLabels).toEqual([]);
    });
});

describe('collectSettled — ordem preservada', () => {
    it('garante que values[i] corresponde a tasks[i] mesmo com resolução fora de ordem', async () => {
        // slow resolve for position 0, fast for position 1
        const slow = new Promise<string>(res => setTimeout(() => res('slow'), 20));
        const fast = Promise.resolve('fast');
        const result = await collectSettled([
            { label: 'slow', promise: slow, fallback: '' },
            { label: 'fast', promise: fast, fallback: '' },
        ]);
        expect(result.values[0]).toBe('slow');
        expect(result.values[1]).toBe('fast');
    });
});

describe('collectSettled — console.error chamado ao falhar', () => {
    it('chama console.error para cada falha', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await collectSettled([
            { label: 'ops', promise: fail('boom'), fallback: null },
        ]);
        expect(spy).toHaveBeenCalledOnce();
        spy.mockRestore();
    });
});

describe('buildPartialFailureMessage', () => {
    it('retorna string vazia para lista vazia', () => {
        expect(buildPartialFailureMessage([])).toBe('');
    });

    it('mensagem singular para 1 label', () => {
        const msg = buildPartialFailureMessage(['colaboradores']);
        expect(msg).toContain('colaboradores');
        expect(msg).toContain('normalmente');
    });

    it('mensagem plural para 2+ labels — lista os nomes', () => {
        const msg = buildPartialFailureMessage(['equipes', 'custos', 'documentos']);
        expect(msg).toContain('equipes');
        expect(msg).toContain('custos');
        expect(msg).toContain('documentos');
        expect(msg).toContain('tente novamente');
    });

    it('mensagem singular não menciona os outros', () => {
        const msg = buildPartialFailureMessage(['folhas de pagamento']);
        expect(msg).not.toContain('tente novamente');
    });
});
