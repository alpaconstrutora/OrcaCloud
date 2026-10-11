/**
 * Abrir um chamado de Pós-Obra & Garantia a partir de OUTRA tela (ficha da
 * SC, detalhe do contrato) — 2026-10-11, Fase 3 da ligação com Suprimentos.
 *
 * A navegação do app é estado, não URL: o id atravessa por sessionStorage e é
 * consumido uma vez quando o módulo de garantia carrega os chamados (mesmo
 * molde de `pedirEdicaoDaSolicitacao`, SolicitacoesCompraList.tsx).
 */
const CHAVE = 'garantia:abrir-chamado';

export function pedirAberturaDoChamado(id: string): void {
    try { sessionStorage.setItem(CHAVE, id); } catch { /* sem storage: abre na lista */ }
}

/** Devolve o id pedido (e o esquece) — `null` se não há pedido. */
export function consumirAberturaDoChamado(): string | null {
    try {
        const id = sessionStorage.getItem(CHAVE);
        if (id) sessionStorage.removeItem(CHAVE);
        return id;
    } catch {
        return null;
    }
}
