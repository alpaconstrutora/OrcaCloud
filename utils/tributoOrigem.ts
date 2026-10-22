// De onde veio um tributo em Tributos a Pagar? — base do filtro e da coluna "Origem".
//
// Plano: docs/planos/2026-10-22-tributos-filtro-de-origem.md
// SEM imports de serviço (puro — Vitest sem mock).
//
// Antes, a coluna "Origem" mostrava `category` ("Impostos s/ Receita", "Encargos
// Patronais", "Pró-labore"…): uma CATEGORIA contábil, não a fonte. Folha e
// pró-labore entraram em Tributos em 21–22/10/2026 e a lista passou a misturar
// quatro fontes sem como separar uma da outra. A fonte vem de `source_system` e
// de `reference_id`:
//
//   LABOR                      → Folha        (labor-{folha}-…-fgts|inss|cpp|rat|terceiros)
//   PROLABORE                  → Pró-labore   (prolabore-{folha}-inss|cpp|irrf)
//   COMMERCIAL + reference_id  → Comercial    (tax-{negócio}-{parcela}-{tributo})
//   COMMERCIAL sem reference_id→ Manual       (lançado à mão na própria tela)

export type OrigemTributo = 'FOLHA' | 'PROLABORE' | 'COMERCIAL' | 'MANUAL';

export const ORIGEM_TRIBUTO_LABEL: Record<OrigemTributo, string> = {
    FOLHA: 'Folha',
    PROLABORE: 'Pró-labore',
    COMERCIAL: 'Comercial',
    MANUAL: 'Manual',
};

/** Todas as origens, na ordem em que o filtro as lista. */
export const ORIGENS_TRIBUTO = Object.keys(ORIGEM_TRIBUTO_LABEL) as OrigemTributo[];

export function origemDoTributo(t: { source_system?: string | null; reference_id?: string | null }): OrigemTributo {
    if (t.source_system === 'LABOR') return 'FOLHA';
    if (t.source_system === 'PROLABORE') return 'PROLABORE';
    return (t.reference_id ?? '').trim() === '' ? 'MANUAL' : 'COMERCIAL';
}

/**
 * Seleção salva no navegador → origens válidas, sem repetir. Valor corrompido ou
 * de uma versão antiga (ou lista vazia) volta para "todas": recorte vazio seria
 * tela vazia sem explicação.
 */
export function origensSelecionadas(salvo: unknown): OrigemTributo[] {
    if (!Array.isArray(salvo)) return [...ORIGENS_TRIBUTO];
    const validas = ORIGENS_TRIBUTO.filter(o => salvo.includes(o));
    return validas.length > 0 ? validas : [...ORIGENS_TRIBUTO];
}

/** Aplica o recorte. Com todas as origens marcadas devolve a própria lista (mesma referência). */
export function filtrarPorOrigem<T extends { source_system?: string | null; reference_id?: string | null }>(
    linhas: T[],
    selecionadas: readonly OrigemTributo[],
): T[] {
    if (selecionadas.length >= ORIGENS_TRIBUTO.length) return linhas;
    return linhas.filter(l => selecionadas.includes(origemDoTributo(l)));
}
