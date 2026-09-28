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

/**
 * Mesmo resultado de `fetchAllPages`, em DUAS rodadas em vez de uma por página.
 *
 * Rodada 1: a 1ª página e a contagem (`countQuery`, tipicamente
 * `.select('id', { count: 'exact', head: true })` com os MESMOS filtros), juntas.
 * Rodada 2: todas as páginas restantes ao mesmo tempo.
 *
 * Por que a contagem é requisição à parte, e não `count: 'exact'` na 1ª página:
 * no PostgREST ela vira um segundo `count(*)` DENTRO da mesma consulta, e a 1ª
 * rodada passaria a custar as duas varreduras em série. Separada, ela corre em
 * paralelo e é mais barata (sem ordenação, uma coluna).
 *
 * A contagem ACELERA, não decide o que existe: se ela falhar, ou se a última
 * página vier cheia (entrou linha entre a contagem e a busca), o resto segue em
 * série até uma página vir incompleta — mesmo critério de `fetchAllPages`.
 *
 * Medido em Contas a Pagar (2.030 títulos, 28/09/2026): 3 páginas em série
 * levavam 558 + 289 + 176 ms — cada página refaz a varredura com RLS inteira,
 * porque a ordenação precisa de todas as linhas antes do OFFSET.
 */
export async function fetchAllPagesParallel<T>(
    buildQuery: () => RangeableQuery<T>,
    countQuery: () => PromiseLike<{ count: number | null; error: unknown }>,
    pageSize: number = PAGE_SIZE,
): Promise<{ data: T[]; error: unknown }> {
    const [first, counted] = await Promise.all([
        buildQuery().range(0, pageSize - 1),
        // Contagem que falha não derruba a tela: cai no caminho em série.
        Promise.resolve(countQuery()).then(r => (r.error ? null : r.count), () => null),
    ]);
    if (first.error) return { data: [], error: first.error };
    const all: T[] = [...(first.data || [])];
    if (all.length < pageSize) return { data: all, error: null };

    let from = pageSize;
    if (counted != null && counted > pageSize) {
        const froms: number[] = [];
        for (let f = pageSize; f < counted; f += pageSize) froms.push(f);
        const pages = await Promise.all(froms.map(f => buildQuery().range(f, f + pageSize - 1)));
        for (const p of pages) {
            if (p.error) return { data: all, error: p.error };
            all.push(...(p.data || []));
        }
        const last = pages[pages.length - 1].data || [];
        if (last.length < pageSize) return { data: all, error: null };
        from = froms[froms.length - 1] + pageSize;
    }

    for (; ; from += pageSize) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1);
        if (error) return { data: all, error };
        const page = data || [];
        all.push(...page);
        if (page.length < pageSize) break;
    }
    return { data: all, error: null };
}
