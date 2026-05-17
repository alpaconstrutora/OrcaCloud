/**
 * Testes para lib/queryKeys.ts e lib/queryClient.ts.
 *
 * Cobre:
 *  1. Estrutura e unicidade das chaves por orgId
 *  2. Hierarquia — prefixo ['labor'] invalida todas as subchaves de labor
 *  3. Comportamento do QueryClient: setQueryData, getQueryData, invalidateQueries
 *  4. staleTime correto nos STALE presets
 *  5. Defaults do queryClient singleton
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { laborKeys, orgKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

// ─── 1. Fábricas de chave ─────────────────────────────────────────────────────

describe('laborKeys — estrutura das chaves', () => {
    it('raiz é exatamente ["labor"]', () => {
        expect(laborKeys.all).toEqual(['labor']);
    });

    it('employees sem orgId usa "all" como fallback', () => {
        expect(laborKeys.employees()).toEqual(['labor', 'employees', 'all']);
    });

    it('employees com orgId específico inclui o orgId', () => {
        expect(laborKeys.employees('org-123')).toEqual(['labor', 'employees', 'org-123']);
    });

    it('chaves diferentes por orgId nunca colidem', () => {
        const k1 = JSON.stringify(laborKeys.employees('org-A'));
        const k2 = JSON.stringify(laborKeys.employees('org-B'));
        expect(k1).not.toBe(k2);
    });

    it('rubrics não depende de orgId', () => {
        expect(laborKeys.rubrics()).toEqual(['labor', 'rubrics']);
    });

    it('fiscalSettings inclui o ano', () => {
        expect(laborKeys.fiscalSettings(2026)).toEqual(['labor', 'fiscal', 2026]);
        expect(laborKeys.fiscalSettings(2027)).not.toEqual(laborKeys.fiscalSettings(2026));
    });

    it('payrollRuns inclui orgId e todos os filtros', () => {
        const key = laborKeys.payrollRuns('org-1', 'mensal', '2026-04-01', '2026-04-30');
        expect(key).toEqual(['labor', 'payrollRuns', 'org-1', 'mensal', '2026-04-01', '2026-04-30']);
    });

    it('payrollRuns com filtros omitidos usa string vazia como fallback', () => {
        const key = laborKeys.payrollRuns('org-1');
        expect(key).toEqual(['labor', 'payrollRuns', 'org-1', 'all', '', '']);
    });

    it('payrollEvents inclui orgId e runId', () => {
        expect(laborKeys.payrollEvents('org-1', 'run-99')).toEqual(['labor', 'payrollEvents', 'org-1', 'run-99']);
    });

    it('payrollResults inclui runId', () => {
        expect(laborKeys.payrollResults('run-42')).toEqual(['labor', 'payrollResults', 'run-42']);
    });
});

describe('orgKeys — estrutura das chaves', () => {
    it('raiz é ["organizations"]', () => {
        expect(orgKeys.all).toEqual(['organizations']);
    });

    it('list retorna ["organizations", "list"]', () => {
        expect(orgKeys.list()).toEqual(['organizations', 'list']);
    });
});

// ─── 2. Hierarquia de prefixo ─────────────────────────────────────────────────

describe('laborKeys — hierarquia e prefixos', () => {
    it('todas as chaves de labor começam com "labor"', () => {
        const keys = [
            laborKeys.employees('x'),
            laborKeys.teams('x'),
            laborKeys.timeEntries('x'),
            laborKeys.productivityLogs('x'),
            laborKeys.costSummary('x'),
            laborKeys.docAlerts('x'),
            laborKeys.documents('x'),
            laborKeys.rubrics(),
            laborKeys.fiscalSettings(2026),
            laborKeys.payrollRuns('x'),
            laborKeys.payrollResults('r'),
            laborKeys.payrollEvents('x', 'r'),
            laborKeys.payrollRubrics(),
        ];
        for (const key of keys) {
            expect(key[0]).toBe('labor');
        }
    });

    it('chaves de diferentes tipos não colidem mesmo com mesmo orgId', () => {
        const seen = new Set<string>();
        const keys = [
            laborKeys.employees('org-1'),
            laborKeys.teams('org-1'),
            laborKeys.timeEntries('org-1'),
            laborKeys.productivityLogs('org-1'),
            laborKeys.costSummary('org-1'),
            laborKeys.docAlerts('org-1'),
            laborKeys.documents('org-1'),
        ];
        for (const key of keys) {
            const serialized = JSON.stringify(key);
            expect(seen.has(serialized), `chave duplicada: ${serialized}`).toBe(false);
            seen.add(serialized);
        }
    });
});

// ─── 3. QueryClient — cache e invalidação ────────────────────────────────────

describe('QueryClient — comportamento de cache', () => {
    let qc: QueryClient;

    beforeEach(() => {
        qc = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
    });

    it('setQueryData / getQueryData funcionam corretamente', () => {
        const key = laborKeys.employees('org-1');
        qc.setQueryData(key, [{ id: 'emp-1', name: 'João' }]);
        expect(qc.getQueryData(key)).toEqual([{ id: 'emp-1', name: 'João' }]);
    });

    it('dados diferentes por orgId são isolados', () => {
        qc.setQueryData(laborKeys.employees('org-A'), [{ id: '1' }]);
        qc.setQueryData(laborKeys.employees('org-B'), [{ id: '2' }]);

        expect(qc.getQueryData(laborKeys.employees('org-A'))).toEqual([{ id: '1' }]);
        expect(qc.getQueryData(laborKeys.employees('org-B'))).toEqual([{ id: '2' }]);
    });

    it('invalidateQueries com prefixo ["labor"] marca TODAS as queries de labor como stale', async () => {
        qc.setQueryData(laborKeys.employees('org-1'), []);
        qc.setQueryData(laborKeys.teams('org-1'), []);
        qc.setQueryData(laborKeys.rubrics(), []);

        await qc.invalidateQueries({ queryKey: ['labor'] });

        expect(qc.getQueryState(laborKeys.employees('org-1'))?.isInvalidated).toBe(true);
        expect(qc.getQueryState(laborKeys.teams('org-1'))?.isInvalidated).toBe(true);
        expect(qc.getQueryState(laborKeys.rubrics())?.isInvalidated).toBe(true);
    });

    it('invalidateQueries com prefixo específico afeta apenas o tipo correto', async () => {
        qc.setQueryData(laborKeys.employees('org-1'), []);
        qc.setQueryData(laborKeys.teams('org-1'), []);

        await qc.invalidateQueries({ queryKey: ['labor', 'employees'] });

        expect(qc.getQueryState(laborKeys.employees('org-1'))?.isInvalidated).toBe(true);
        expect(qc.getQueryState(laborKeys.teams('org-1'))?.isInvalidated).toBeFalsy();
    });

    it('invalidateQueries por orgId invalida apenas o orgId afetado', async () => {
        qc.setQueryData(laborKeys.employees('org-A'), [{ id: '1' }]);
        qc.setQueryData(laborKeys.employees('org-B'), [{ id: '2' }]);

        await qc.invalidateQueries({ queryKey: laborKeys.employees('org-A') });

        expect(qc.getQueryState(laborKeys.employees('org-A'))?.isInvalidated).toBe(true);
        expect(qc.getQueryState(laborKeys.employees('org-B'))?.isInvalidated).toBeFalsy();
    });

    it('dados ficam disponíveis após invalidação (somente marcados como stale)', async () => {
        qc.setQueryData(laborKeys.rubrics(), [{ code: 'SALARIO' }]);
        await qc.invalidateQueries({ queryKey: laborKeys.rubrics() });

        // Invalidado, mas dado ainda está no cache
        expect(qc.getQueryData(laborKeys.rubrics())).toEqual([{ code: 'SALARIO' }]);
        expect(qc.getQueryState(laborKeys.rubrics())?.isInvalidated).toBe(true);
    });

    it('removeQueries apaga o dado do cache completamente', () => {
        qc.setQueryData(laborKeys.employees('org-1'), [{ id: '1' }]);
        qc.removeQueries({ queryKey: laborKeys.employees('org-1') });
        expect(qc.getQueryData(laborKeys.employees('org-1'))).toBeUndefined();
    });

    it('queries de tipos distintos não se afetam mutuamente', async () => {
        qc.setQueryData(laborKeys.payrollRuns('org-1'), [{ id: 'run-1' }]);
        qc.setQueryData(laborKeys.employees('org-1'), [{ id: 'emp-1' }]);

        await qc.invalidateQueries({ queryKey: ['labor', 'payrollRuns'] });

        expect(qc.getQueryState(laborKeys.payrollRuns('org-1'))?.isInvalidated).toBe(true);
        expect(qc.getQueryState(laborKeys.employees('org-1'))?.isInvalidated).toBeFalsy();
    });
});

// ─── 4. STALE presets ────────────────────────────────────────────────────────

describe('STALE — configurações de staleTime', () => {
    it('slow é maior que normal', () => {
        expect(STALE.slow).toBeGreaterThan(STALE.normal);
    });

    it('normal é maior que fast', () => {
        expect(STALE.normal).toBeGreaterThan(STALE.fast);
    });

    it('slow é 10 minutos em ms', () => {
        expect(STALE.slow).toBe(10 * 60 * 1000);
    });

    it('normal é 2 minutos em ms', () => {
        expect(STALE.normal).toBe(2 * 60 * 1000);
    });

    it('fast é 30 segundos em ms', () => {
        expect(STALE.fast).toBe(30 * 1000);
    });
});

// ─── 5. QueryClient singleton defaults ────────────────────────────────────────

describe('queryClient singleton — defaults', () => {
    it('pode ser importado como singleton', async () => {
        const { queryClient } = await import('../lib/queryClient');
        expect(queryClient).toBeDefined();
    });

    it('defaultOptions.queries.retry é 1', async () => {
        const { queryClient } = await import('../lib/queryClient');
        expect(queryClient.getDefaultOptions().queries?.retry).toBe(1);
    });

    it('defaultOptions.queries.refetchOnWindowFocus é false', async () => {
        const { queryClient } = await import('../lib/queryClient');
        expect(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
    });

    it('defaultOptions.queries.staleTime é 2 minutos', async () => {
        const { queryClient } = await import('../lib/queryClient');
        expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(STALE.normal);
    });
});
