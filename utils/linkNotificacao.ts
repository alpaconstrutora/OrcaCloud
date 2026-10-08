/**
 * Destino do `link` de uma notificação (`notifications.link`), para
 * `App.tsx › handleNavigate`.
 *
 * Os avisos financeiros (`fn_notif_recibo_disponivel`, pagamento próximo /
 * em atraso — migration 20270919000002) gravam `/contas-a-receber?tx=<id>` e
 * `/contas-a-pagar?tx=<id>`. Até 26/09/2026 o `?tx=` era descartado: o clique
 * abria a lista e o usuário tinha de procurar o título. Agora vira o deep-link
 * do store (`navigateToFocus`), que as duas telas consomem pelo `viewFocus`.
 *
 * GED (07/10/2026): as notificações de aprovação gravavam `#/documentos?docId=`
 * — não começa com `/` (este resolvedor devolvia `null`) e `documentos` é a
 * Área do Cliente, não o GED. `documentService` passou a gravar
 * `/opura-docs?docId=<id>[&pending=true]`, e aqui isso vira o foco
 * `GED_DOCUMENTO` / `GED_DOCUMENTO_PENDENTE`, que `OpuraDocsModule` consome.
 */
const FOCO_POR_VIEW: Record<string, { param: string; source: string; sourcePendente?: string }> = {
    'contas-a-receber': { param: 'tx', source: 'CONTA_RECEBER' },
    'contas-a-pagar': { param: 'tx', source: 'CONTA_PAGAR' },
    'opura-docs': { param: 'docId', source: 'GED_DOCUMENTO', sourcePendente: 'GED_DOCUMENTO_PENDENTE' },
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
    const regra = FOCO_POR_VIEW[caminho];
    if (!regra) return { view: caminho };
    const params = new URLSearchParams(query);
    const ref = params.get(regra.param);
    if (!ref) return { view: caminho };
    const pendente = params.get('pending') === 'true' && regra.sourcePendente;
    return { view: caminho, foco: { ref, source: pendente ? regra.sourcePendente! : regra.source } };
}
