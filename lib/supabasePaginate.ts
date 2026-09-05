/**
 * Paginação exaustiva sobre o PostgREST.
 *
 * O PostgREST devolve no máximo 1000 linhas por requisição (max-rows do projeto).
 * Qualquer `.limit(N)` com N > 1000 vira um teto SILENCIOSO: a consulta não erra,
 * só devolve as 1000 primeiras — e, sem ordenação, um subconjunto arbitrário.
 *
 * Foi assim que o motor de conciliação bancária (`runMatchingEngine`) pontuava
 * ~17% do extrato de uma conta com 5.797 pendentes enquanto pedia `.limit(5000)`.
 * A aba Extrato já tinha resolvido o mesmo problema com esta função (ela nasceu
 * dentro de `BankReconciliation.tsx`); agora vive aqui para o service usá-la.
 *
 * Regras de uso:
 *  - `buildQuery` deve devolver a consulta SEM `.range()`/`.limit()`; a função
 *    aplica o `.range()` de cada página.
 *  - A consulta precisa de ordenação DETERMINÍSTICA entre páginas (ex.:
 *    `.order('transaction_date').order('id')`). Só o campo visível empata e o
 *    Postgres não garante ordem estável: linhas repetem ou somem entre páginas.
 */

export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: unknown };

export interface RangeableQuery<T> extends PromiseLike<PageResult<T>> {
    range: (from: number, to: number) => PromiseLike<PageResult<T>>;
}

export async function fetchAllPages<T>(
    buildQuery: () => RangeableQuery<T>,
    pageSize: number = PAGE_SIZE,
): Promise<{ data: T[]; error: unknown }> {
    const all: T[] = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1);
        if (error) return { data: all, error };
        const page = data || [];
        all.push(...page);
        if (page.length < pageSize) break;
    }
    return { data: all, error: null };
}
