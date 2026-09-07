/**
 * Quem está lendo o pedido de compra — a única pergunta que decide o que o
 * detalhe do pedido (`SupplyChainOrderDetails`) mostra.
 *
 * ── Por que isto existe como função, e não como um `!portalToken` inline ──
 *
 * O fornecedor tem DUAS portas de entrada:
 *
 *   1. link público, com token (`App.tsx` → `SupplierDashboard portalToken=...`);
 *   2. sessão normal no app, sem token nenhum (`AppRouter`, quando
 *      `currentProfile.group === ProfileGroup.SUPPLIER`).
 *
 * Enquanto os cortes da tela eram escritos `!portalToken`, a porta 2 caía no
 * ramo do COMPRADOR: o fornecedor logado recebia o formulário de edição do
 * pedido, o painel de 3-Way Match e as dimensões contábeis do comprador (conta
 * de pagamento, centro de custo, plano de contas). O gate cobria metade dos
 * fornecedores, e a metade que escapava não dava erro — entregava dado demais,
 * calada. Um `!portalToken` também parece correto na revisão, o que é
 * exatamente o que o fez sobreviver.
 *
 * A regra: `portalToken` responde "por onde os dados entram"; `perfil` responde
 * "o que aparece". Nunca troque um pelo outro.
 */
export interface ContextoDoPedido {
    /** Presente = veio pelo link público. Token implica fornecedor. */
    portalToken?: string;
    /** Declarado por quem renderiza. Ausente = app interno = comprador. */
    perfil?: 'comprador' | 'fornecedor';
}

/**
 * `true` só para o time de compras. Governa tudo que é ferramenta interna:
 * formulário de edição do pedido, 3-Way Match, dimensões contábeis, resolução
 * de divergência, WhatsApp, automação, duplicar e excluir.
 */
export function ehCompradorDoPedido(ctx: ContextoDoPedido): boolean {
    if (ctx.portalToken) return false;
    return (ctx.perfil ?? 'comprador') === 'comprador';
}
