/**
 * Endereço do marketplace público da organização (`organizations.slug`), plano
 * docs/planos/2026-11-22-endereco-do-marketplace.md.
 *
 * A vitrine aberta mora em `/m/<slug>` (App.tsx casa `[a-z0-9-]+`; `get_public_marketplace` procura por
 * `lower(slug)`). Por isso o endereço é sempre minúsculo, sem acento, só letras, números e hífen.
 */

/** "Garden Cambuhy SPE!" → "garden-cambuhy-spe". Vazio continua vazio. */
export function normalizarEnderecoDoMarketplace(texto: string): string {
    return (texto ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+/, '');
}

/** O que vai para o banco: sem hífen sobrando no fim; vazio = `null` (sem vitrine — e o UNIQUE aceita vários NULL). */
export function enderecoParaGravar(texto: string | null | undefined): string | null {
    const limpo = normalizarEnderecoDoMarketplace(texto ?? '').replace(/-+$/, '');
    return limpo || null;
}

/** URL completa da vitrine, ou `null` sem endereço. */
export function urlDoMarketplace(slug: string | null | undefined, origem: string): string | null {
    const s = enderecoParaGravar(slug);
    return s ? `${origem.replace(/\/+$/, '')}/m/${s}` : null;
}

/** Postgres 23505 no índice do endereço = outra organização já usa. */
export function ehEnderecoDoMarketplaceRepetido(err: unknown): boolean {
    const e = err as { code?: unknown; message?: unknown; details?: unknown } | null;
    return e?.code === '23505' && /organizations_slug_key/.test(`${e?.message ?? ''} ${e?.details ?? ''}`);
}
