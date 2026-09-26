/**
 * Destino do `link` de uma notificação (`notifications.link`), para
 * `App.tsx › handleNavigate`.
 *
 * Os avisos financeiros (`fn_notif_recibo_disponivel`, pagamento próximo /
 * em atraso — migration 20270919000002) gravam `/contas-a-receber?tx=<id>` e
 * `/contas-a-pagar?tx=<id>`. Até 26/09/2026 o `?tx=` era descartado: o clique
 * abria a lista e o usuário tinha de procurar o título. Agora vira o deep-link
 * do store (`navigateToFocus`), que as duas telas consomem pelo `viewFocus`.
 */
const FOCO_POR_VIEW: Record<string, string> = {
    'contas-a-receber': 'CONTA_RECEBER',
    'contas-a-pagar': 'CONTA_PAGAR',
};

export interface DestinoDoLink {
    view: string;
    foco?: { ref: string; source: string };
}

/** `null` quando o link não é uma rota interna `/view[?query]`. */
export function destinoDoLinkDeNotificacao(link: string): DestinoDoLink | null {
    if (!link.startsWith('/')) return null;
    const [caminho, query = ''] = link.substring(1).split('?');
    if (!caminho) return null;
    const tx = new URLSearchParams(query).get('tx');
    const source = FOCO_POR_VIEW[caminho];
    return tx && source ? { view: caminho, foco: { ref: tx, source } } : { view: caminho };
}
