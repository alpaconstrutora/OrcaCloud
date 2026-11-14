/**
 * Que arquivo vira boleto na Importação em Lote — puro.
 * Plano: docs/planos/2026-11-13-boletos-a-pagar-dez-pedidos.md (item 3).
 */
/** PDF ou imagem — o mesmo que a captura de 1 boleto aceita (até 13/11/2026 o lote descartava
 *  imagem em silêncio). Imagem não tem texto: entra em rascunho para conferir valor e vencimento. */
export function aceitoNoLote(f: { type: string; name: string }): boolean {
    const nome = f.name.toLowerCase();
    return f.type === 'application/pdf' || nome.endsWith('.pdf')
        || f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/.test(nome);
}
