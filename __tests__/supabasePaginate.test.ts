/**
 * `fetchAllPages` — item 1.1 do plano de conciliação bancária.
 *
 * O PostgREST devolve no máximo 1000 linhas por requisição. O motor de conciliação
 * pedia `.limit(5000)` e recebia 1000 sem erro — e pontuava ~17% do extrato de uma
 * conta com 5.797 pendentes. Este teste prova que o helper continua pedindo páginas
 * até uma vir incompleta, e para na primeira falha sem perder o que já veio.
 */
import { describe, it, expect } from 'vitest';
import { fetchAllPages, fetchAllPagesParallel, type RangeableQuery } from '../lib/supabasePaginate';

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

/**
 * `fetchAllPagesParallel` — Contas a Pagar lento (docs/planos/2026-09-28-contas-a-pagar-lento.md).
 * 3 páginas de vw_payables em série levavam ~1 s; com a contagem ao lado da 1ª
 * página, as restantes saem juntas. O que não pode mudar é o RESULTADO: as
 * mesmas linhas que `fetchAllPages` traria, inclusive quando a contagem erra.
 */
function consultaComEspia<T>(linhas: () => T[]) {
    let emVoo = 0;
    const espia = { chamadas: [] as number[], maxEmVoo: 0 };
    const build = () => ({
        range: (from: number, to: number) => {
            espia.chamadas.push(from);
            emVoo++;
            espia.maxEmVoo = Math.max(espia.maxEmVoo, emVoo);
            return new Promise(res => setTimeout(() => {
                emVoo--;
                res({ data: linhas().slice(from, to + 1), error: null });
            }, 0));
        },
        then: () => { throw new Error('a consulta não deve ser aguardada sem range()'); },
    }) as unknown as RangeableQuery<T>;
    return { build, espia };
}

describe('fetchAllPagesParallel', () => {
    const contagem = (n: number | null, error: unknown = null) => () => Promise.resolve({ count: n, error });

    it('2.030 linhas: 1ª página e depois as outras duas JUNTAS, sem requisição a mais', async () => {
        const linhas = Array.from({ length: 2030 }, (_, i) => ({ id: i }));
        const { build, espia } = consultaComEspia(() => linhas);
        const { data, error } = await fetchAllPagesParallel(build, contagem(2030));
        expect(error).toBeNull();
        expect(data.map(r => r.id)).toEqual(linhas.map(r => r.id));
        expect(espia.chamadas).toEqual([0, 1000, 2000]);
        expect(espia.maxEmVoo).toBe(2);
    });

    it('menos de uma página: uma requisição só', async () => {
        const linhas = Array.from({ length: 300 }, (_, i) => ({ id: i }));
        const { build, espia } = consultaComEspia(() => linhas);
        const { data } = await fetchAllPagesParallel(build, contagem(300));
        expect(data).toHaveLength(300);
        expect(espia.chamadas).toEqual([0]);
    });

    it('contagem falhou: cai no caminho em série e traz tudo mesmo assim', async () => {
        const linhas = Array.from({ length: 2037 }, (_, i) => ({ id: i }));
        const { build, espia } = consultaComEspia(() => linhas);
        const { data, error } = await fetchAllPagesParallel(build, contagem(null, new Error('timeout')));
        expect(error).toBeNull();
        expect(data).toHaveLength(2037);
        expect(espia.maxEmVoo).toBe(1);
    });

    it('entrou título entre a contagem e a busca: a última página veio cheia, continua até vir incompleta', async () => {
        // A contagem disse 2000; quando as páginas foram buscadas já eram 2001.
        const linhas = Array.from({ length: 2001 }, (_, i) => ({ id: i }));
        const { build } = consultaComEspia(() => linhas);
        const { data } = await fetchAllPagesParallel(build, contagem(2000));
        expect(data).toHaveLength(2001);
        expect(data[2000]).toEqual({ id: 2000 });
    });

    it('erro numa página da 2ª rodada devolve o erro', async () => {
        let n = 0;
        const build = () => ({
            range: (from: number, to: number) => {
                n++;
                if (n === 3) return Promise.resolve({ data: null, error: new Error('boom') });
                return Promise.resolve({ data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })), error: null });
            },
        }) as unknown as RangeableQuery<{ id: number }>;
        const { error } = await fetchAllPagesParallel(build, contagem(3000));
        expect(error).toBeInstanceOf(Error);
    });
});
