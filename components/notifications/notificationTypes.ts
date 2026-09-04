/**
 * Taxonomia de notificações — mapa único `type` (slug gravado no banco) → categoria.
 *
 * ## Por que este arquivo existe
 *
 * `public.notifications.type` é `text` livre, **sem CHECK e sem enum no banco**
 * (`20260215000011_notifications_and_chat.sql:10`). Cada produtor escolheu o
 * próprio slug: 7 services, 2 edge functions e 6 funções de cron.
 *
 * A tela, por outro lado, sempre filtrou por uma lista de 6 CATEGORIAS
 * (`sistema | financeiro | suprimentos | operacional | qualidade | fiscal`) e
 * comparava `n.type === categoria`. Como nenhum produtor grava esses valores
 * (a única coincidência é `operacional`, de `TaskForm.tsx`), o filtro por tipo
 * **não casava nada** e o badge caía sempre no fallback cinza. Medido no banco
 * remoto em 03/09/2026: `manutencao_vencimento` (28), `task_alert` (3),
 * `warning` (2) — zero linhas com qualquer um dos 6 rótulos da UI.
 *
 * Aqui os dois mundos se encontram: o slug continua livre na escrita, e a
 * leitura passa por `notifTypeMeta()`, que devolve a categoria, o rótulo em
 * português e a cor. Slug desconhecido não some da tela nem quebra o filtro —
 * cai em `sistema` com o próprio slug como rótulo.
 */

export type NotifCategory =
    | 'financeiro'
    | 'contratos'
    | 'suprimentos'
    | 'documentos'
    | 'operacional'
    | 'qualidade'
    | 'comercial'
    | 'sistema';

export interface NotifTypeMeta {
    /** Categoria usada pelo filtro e pela coluna "Tipo" da tabela. */
    category: NotifCategory;
    /** Rótulo do slug específico, em português. */
    label: string;
}

/** Rótulo e cor de texto de cada categoria (§8: texto colorido simples, sem pílula). */
export const CATEGORY_META: Record<NotifCategory, { label: string; textClass: string }> = {
    financeiro:  { label: 'Financeiro',  textClass: 'text-emerald-700' },
    contratos:   { label: 'Contratos',   textClass: 'text-indigo-700' },
    suprimentos: { label: 'Suprimentos', textClass: 'text-orange-700' },
    documentos:  { label: 'Documentos',  textClass: 'text-cyan-700' },
    operacional: { label: 'Operacional', textClass: 'text-blue-700' },
    qualidade:   { label: 'Qualidade',   textClass: 'text-purple-700' },
    comercial:   { label: 'Comercial',   textClass: 'text-rose-700' },
    sistema:     { label: 'Sistema',     textClass: 'text-gray-600' },
};

/**
 * Todo slug que o sistema grava hoje em `notifications.type`.
 *
 * Ao criar um produtor novo de notificação, acrescente o slug aqui — senão ele
 * aparece na tela como "Sistema" com o slug cru de rótulo (degrada, não quebra).
 */
export const NOTIF_TYPE_META: Record<string, NotifTypeMeta> = {
    // ── Financeiro — crons de 20270919000002 ────────────────────────────────
    pagamento_recibo:   { category: 'financeiro', label: 'Recibo disponível' },
    pagamento_proximo:  { category: 'financeiro', label: 'Vencimento próximo' },
    pagamento_atraso:   { category: 'financeiro', label: 'Pagamento em atraso' },

    // ── Contratos ───────────────────────────────────────────────────────────
    // `rental_renewal` é o slug histórico de LOCAÇÃO (20270827000003) e continua
    // como está para não reclassificar o que já foi emitido; os demais domínios
    // usam `contrato_vencimento`.
    rental_renewal:      { category: 'contratos', label: 'Renovação de locação' },
    contrato_vencimento: { category: 'contratos', label: 'Vencimento de contrato' },
    contrato_reajuste:   { category: 'contratos', label: 'Reajuste de contrato' },

    // ── Suprimentos ─────────────────────────────────────────────────────────
    status_change: { category: 'suprimentos', label: 'Mudança de status' },  // services/orderService.ts
    chat_message:  { category: 'suprimentos', label: 'Mensagem no pedido' }, // services/chatService.ts

    // ── Documentos (GED / ÒPURA Docs) ───────────────────────────────────────
    documento_compartilhado: { category: 'documentos', label: 'Documento compartilhado' },
    solicitacao_aprovacao:   { category: 'documentos', label: 'Aprovação solicitada' },
    documento_aprovado:      { category: 'documentos', label: 'Documento aprovado' },
    documento_rejeitado:     { category: 'documentos', label: 'Documento rejeitado' },
    vencimento_documento:    { category: 'documentos', label: 'Documento vencendo' },

    // ── Operacional ─────────────────────────────────────────────────────────
    operacional: { category: 'operacional', label: 'Operacional' },   // components/TaskForm.tsx
    task_alert:  { category: 'operacional', label: 'Lembrete de tarefa' },
    // Nasce no CRM de Serviços mas o destinatário é a Engenharia, que é quem
    // vai montar o orçamento — por isso `operacional`, não `comercial`.
    engineering_request: { category: 'operacional', label: 'Solicitação de orçamento' },

    // ── Qualidade / pós-obra ────────────────────────────────────────────────
    manutencao_vencimento: { category: 'qualidade', label: 'Manutenção vencendo' },
    garantia_fornecedor:   { category: 'qualidade', label: 'Garantia de fornecedor' },

    // ── Comercial ───────────────────────────────────────────────────────────
    broker_proposal: { category: 'comercial', label: 'Proposta de corretor' },

    // ── Sistema — severidade crua vinda dos alertas da Academia ─────────────
    error:   { category: 'sistema', label: 'Erro' },
    warning: { category: 'sistema', label: 'Aviso' },
};

/** Ordem das categorias no dropdown de filtro. */
export const CATEGORY_ORDER: NotifCategory[] = [
    'financeiro', 'contratos', 'suprimentos', 'documentos',
    'operacional', 'qualidade', 'comercial', 'sistema',
];

const FALLBACK: NotifTypeMeta = { category: 'sistema', label: 'Sistema' };

/**
 * Resolve o slug para categoria + rótulo. Slug desconhecido vira `sistema` com
 * o próprio slug de rótulo — visível na tela, filtrável, sem quebrar nada.
 */
export function notifTypeMeta(type?: string | null): NotifTypeMeta {
    if (!type) return FALLBACK;
    return NOTIF_TYPE_META[type] ?? { category: 'sistema', label: type };
}

/** Categoria de um slug — é por ela que o filtro da tela compara. */
export function notifCategory(type?: string | null): NotifCategory {
    return notifTypeMeta(type).category;
}
