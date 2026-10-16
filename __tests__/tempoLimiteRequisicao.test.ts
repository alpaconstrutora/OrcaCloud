/**
 * Corte de tempo do fetch do client Supabase (16/10/2026).
 *
 * Os 20 s existem para o banco/PostgREST travado. Edge Function tem prazo
 * próprio no servidor (o gateway corta em 150 s) e algumas trabalham mais que
 * 20 s de propósito — a busca por período da captura levou 32 s, terminou certa
 * no servidor e o navegador mostrou "Failed to send a request to the Edge Function".
 */
import { describe, it, expect } from 'vitest';
import {
    tempoLimiteDaRequisicao,
    REQUEST_TIMEOUT_MS,
    EDGE_FUNCTION_TIMEOUT_MS,
} from '../lib/tempoLimiteRequisicao';

const BASE = 'https://exemplo.supabase.co';

describe('tempoLimiteDaRequisicao', () => {
    it('Edge Function: 150 s, em string, URL ou Request', () => {
        expect(EDGE_FUNCTION_TIMEOUT_MS).toBe(150_000);
        expect(tempoLimiteDaRequisicao(`${BASE}/functions/v1/email-capture-sync`)).toBe(EDGE_FUNCTION_TIMEOUT_MS);
        expect(tempoLimiteDaRequisicao(new URL(`${BASE}/functions/v1/planta-ia`))).toBe(EDGE_FUNCTION_TIMEOUT_MS);
        expect(tempoLimiteDaRequisicao(new Request(`${BASE}/functions/v1/doc-gen-ia`))).toBe(EDGE_FUNCTION_TIMEOUT_MS);
    });

    it('banco, RPC, auth e storage continuam com 20 s', () => {
        expect(REQUEST_TIMEOUT_MS).toBe(20_000);
        for (const caminho of ['/rest/v1/boletos?select=id', '/rest/v1/rpc/fn_x', '/auth/v1/token', '/storage/v1/object/boletos/a.pdf']) {
            expect(tempoLimiteDaRequisicao(`${BASE}${caminho}`)).toBe(REQUEST_TIMEOUT_MS);
        }
    });

    it('"functions" fora do caminho da API não engana', () => {
        expect(tempoLimiteDaRequisicao(`${BASE}/rest/v1/functions_log?select=id`)).toBe(REQUEST_TIMEOUT_MS);
        expect(tempoLimiteDaRequisicao(`${BASE}/storage/v1/object/docs/functions/v1/x.pdf`)).toBe(REQUEST_TIMEOUT_MS);
    });
});
