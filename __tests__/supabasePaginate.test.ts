/**
 * `fetchAllPages` — item 1.1 do plano de conciliação bancária.
 *
 * O PostgREST devolve no máximo 1000 linhas por requisição. O motor de conciliação
 * pedia `.limit(5000)` e recebia 1000 sem erro — e pontuava ~17% do extrato de uma
 * conta com 5.797 pendentes. Este teste prova que o helper continua pedindo páginas
 * até uma vir incompleta, e para na primeira falha sem perder o que já veio.
 */
import { describe, it, expect } from 'vitest';
import { fetchAllPages, type RangeableQuery } from '../lib/supabasePaginate';

function consultaFalsa<T>(linhas: T[], falharNaPagina?: number): () => RangeableQuery<T> {
    let chamadas = 0;
    return () => {
        const q = {
            range: (from: number, to: number) => {
                chamadas++;
                if (falharNaPagina && chamadas === falharNaPagina) {
                    return Promise.resolve({ data: null, error: new Error('boom') });
                }
                return Promise.resolve({ data: linhas.slice(from, to + 1), error: null });
            },
            then: () => { throw new Error('a consulta não deve ser aguardada sem range()'); },
        };
        return q as unknown as RangeableQuery<T>;
    };
}

describe('fetchAllPages', () => {
    it('junta 3 páginas (1000 + 1000 + 37) e devolve as 2037 linhas', async () => {
        const linhas = Array.from({ length: 2037 }, (_, i) => ({ id: i }));
        const { data, error } = await fetchAllPages(consultaFalsa(linhas));
        expect(error).toBeNull();
        expect(data).toHaveLength(2037);
        expect(data[0]).toEqual({ id: 0 });
        expect(data[2036]).toEqual({ id: 2036 });
    });

    it('quando o total é múltiplo exato da página, faz uma requisição a mais e para na vazia', async () => {
        const linhas = Array.from({ length: 2000 }, (_, i) => ({ id: i }));
        const { data } = await fetchAllPages(consultaFalsa(linhas));
        expect(data).toHaveLength(2000);
    });

    it('conjunto vazio devolve [] sem erro', async () => {
        const { data, error } = await fetchAllPages(consultaFalsa<{ id: number }>([]));
        expect(data).toEqual([]);
        expect(error).toBeNull();
    });

    it('erro no meio devolve o erro e o que já tinha vindo', async () => {
        const linhas = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
        const { data, error } = await fetchAllPages(consultaFalsa(linhas, 2));
        expect(error).toBeInstanceOf(Error);
        expect(data).toHaveLength(1000);
    });

    it('respeita pageSize customizado', async () => {
        const linhas = Array.from({ length: 25 }, (_, i) => ({ id: i }));
        const { data } = await fetchAllPages(consultaFalsa(linhas), 10);
        expect(data).toHaveLength(25);
    });
});
