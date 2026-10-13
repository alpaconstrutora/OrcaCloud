// utils/catalogoNome.ts — nome de marca/modelo: normalização e comparação
//
// O banco guarda `name` já normalizado (CHECK: sem espaço sobrando, ≤ 100) e a
// chave `name_key = lower(name)` (UNIQUE por org/marca). Estas funções são o
// lado do cliente da mesma regra — e acrescentam o que o UNIQUE não pega: o
// acento. "Mitsubíshi" e "Mitsubishi" são chaves diferentes no banco; a tela
// precisa mostrar a existente em vez de oferecer cadastrar a duplicata.

/** Limite do banco: opura_assets.brand/model são VARCHAR(100). */
export const NOME_CATALOGO_MAX = 100;

/** Trim + espaços colapsados + corte em 100 — o que o CHECK do banco exige. */
export function normalizarNome(nome: string | null | undefined): string {
    return (nome ?? '').replace(/\s+/g, ' ').trim().slice(0, NOME_CATALOGO_MAX).trim();
}

/** Mesma chave do banco (`name_key`). */
export function chaveNome(nome: string | null | undefined): string {
    return normalizarNome(nome).toLowerCase();
}

/** Chave de busca: sem maiúsculas e sem acento (mesma `norm` de StockItemSelect). */
export function chaveBusca(texto: string | null | undefined): string {
    return (texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Item da lista cujo nome é o digitado, ignorando maiúsculas e acento. */
export function acharPorNome<T extends { name: string }>(lista: readonly T[], digitado: string): T | undefined {
    const alvo = chaveBusca(digitado);
    if (!alvo) return undefined;
    return lista.find(i => chaveBusca(i.name) === alvo);
}

/** "Cadastrar 'X'" só aparece se há texto e nenhum item equivalente já existe. */
export function deveOferecerCadastro(lista: readonly { name: string }[], digitado: string): boolean {
    return normalizarNome(digitado) !== '' && !acharPorNome(lista, digitado);
}

/** Filtra por trecho (sem acento), no máximo `limite` resultados. */
export function filtrarPorNome<T>(lista: readonly T[], digitado: string, texto: (i: T) => string, limite = 50): T[] {
    const q = chaveBusca(digitado);
    const pool = q ? lista.filter(i => chaveBusca(texto(i)).includes(q)) : lista;
    return pool.slice(0, limite);
}
