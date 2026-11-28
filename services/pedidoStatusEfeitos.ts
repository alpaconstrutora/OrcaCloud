/**
 * O que acontece quando o STATUS de um pedido de compra muda — aviso ao
 * fornecedor, parcelas a pagar e processos — com as dependências INJETADAS.
 *
 * Saiu de `orderService.updateOrder` em 27/11/2026 (docs/planos/2026-11-27-recebimento-mobile.md,
 * Fase 1) para rodar com o MESMO código no navegador (`updateOrder` injeta os
 * serviços de sempre — os testes continuam espionando `financialService`,
 * `processService`, `notificationService`…) e na Edge `pedido-recebimento`
 * (injeta `efeitosComBanco(admin, …)`), que grava o recebimento do celular.
 *
 * Tudo aqui é best-effort, como sempre foi: falha de aviso, de financeiro ou de
 * processo é registrada e NUNCA derruba a mudança de status. O resultado do
 * financeiro volta para quem chamou poder dizer "título não gerado: sem nota".
 *
 * O WhatsApp de "Enviado" NÃO mora aqui (continua em `updateOrder`): o
 * recebimento nunca muda para "Enviado".
 *
 * Imports só de módulos puros, com `.ts` explícito (o Deno não resolve sem).
 */
import type { ResultadoSyncPedido } from './pedidoFinanceiroMotor.ts';

/** O pedido como `updateOrder` o relê depois de gravar (só o que os efeitos usam). */
export interface PedidoDosEfeitos {
    id: string;
    number: string | null;
    supplier_id?: string | null;
    organization_id?: string | null;
    empresa_id?: string | null;
    project_id?: string | null;
}

export interface EntradaDoLog {
    orderId?: string;
    channel: 'email';
    recipient?: string;
    subject?: string;
    body?: string;
    status: 'sent' | 'failed';
    error?: string;
    metadata?: Record<string, unknown>;
}

export interface DepsDosEfeitos {
    /** E-mail do fornecedor (cadastro), ou null. */
    emailDoFornecedor(supplierId: string): Promise<string | null>;
    /** Grava o aviso na central de notificações (`notifications`). */
    notificar(aviso: { recipientEmail: string; title: string; message: string; link: string; type: 'status_change' }): Promise<void>;
    /** `notification_log` — nunca lança. */
    registrarLog(entrada: EntradaDoLog): Promise<void> | void;
    financeiro: { syncOrderToFinance(orderId: string): Promise<ResultadoSyncPedido> };
    processos: { triggerEvent(orgId: string, eventKey: string, ctx: Record<string, unknown>): Promise<unknown> };
    /** Org da empresa (fallback de pedido antigo sem organization_id). */
    orgDaEmpresa(empresaId: string): Promise<string | null>;
    textos: {
        assunto(p: { orderNumber: string; newStatus: string }): string;
        corpo(p: { orderNumber: string; newStatus: string }): string;
    };
}

/** O que os efeitos fizeram — o financeiro volta inteiro para a tela poder explicar. */
export interface ResultadoDosEfeitos {
    financeiro?: ResultadoSyncPedido | { falhou: string };
}

/** Status que geram parcelas a pagar (no FOB, "Entregue" é a retirada). */
export const STATUS_QUE_GERAM_PARCELAS = ['Entregue', 'Recebido', 'Divergência'] as const;

export function criarEfeitosDoStatus(deps: DepsDosEfeitos) {
    return {
        /**
         * @param opcoes.avisarFornecedor false = não reenvia o aviso (reenvio de um
         *        recebimento que já tinha sido gravado).
         */
        async aplicar(pedido: PedidoDosEfeitos, status: string, opcoes: { avisarFornecedor?: boolean } = {}): Promise<ResultadoDosEfeitos> {
            const resultado: ResultadoDosEfeitos = {};

            // 1. Aviso ao fornecedor.
            if (opcoes.avisarFornecedor !== false) {
                try {
                    if (pedido.supplier_id) {
                        const email = await deps.emailDoFornecedor(pedido.supplier_id);
                        if (email) {
                            const subject = deps.textos.assunto({ orderNumber: pedido.number || '', newStatus: status });
                            const body    = deps.textos.corpo({ orderNumber: pedido.number || '', newStatus: status });
                            await deps.notificar({
                                recipientEmail: email,
                                title: subject,
                                message: body,
                                link: `/supplier-portal?tab=orders&order=${pedido.id}`,
                                type: 'status_change',
                            });
                            await deps.registrarLog({
                                orderId: pedido.id, channel: 'email', recipient: email, subject, body,
                                status: 'sent', metadata: { status },
                            });
                        }
                    }
                } catch (notifyErr: unknown) {
                    const notifyError = notifyErr instanceof Error ? notifyErr : new Error(String(notifyErr));
                    console.error('[NOTIFICATION SYSTEM] Failed to trigger notification:', notifyError.message);
                    await deps.registrarLog({
                        orderId: pedido.id, channel: 'email', status: 'failed',
                        error: notifyError.message, metadata: { status },
                    });
                }
            }

            // 2. Parcelas a pagar (Entregue, Recebido, Divergência).
            if ((STATUS_QUE_GERAM_PARCELAS as readonly string[]).includes(status)) {
                try {
                    resultado.financeiro = await deps.financeiro.syncOrderToFinance(pedido.id);
                } catch (finError) {
                    console.error('[ORDER SERVICE] Financial sync failed:', finError);
                    resultado.financeiro = { falhou: finError instanceof Error ? finError.message : String(finError) };
                }
            }

            // 2b. Costura P2P — processos (EVENTO) de Recebido/Divergência, na org DO PEDIDO
            // (docs/planos/2026-09-28-torre-p2p-processos.md, Passo 1.1); a da empresa só
            // para pedido antigo sem organization_id.
            if (status === 'Recebido' || status === 'Divergência') {
                try {
                    const eventKey = status === 'Recebido' ? 'purchase_order.received' : 'purchase_order.divergence';
                    const orgId = pedido.organization_id
                        ?? (pedido.empresa_id ? await deps.orgDaEmpresa(pedido.empresa_id) : null);
                    if (orgId) {
                        await deps.processos.triggerEvent(orgId, eventKey, {
                            title: `Pedido ${pedido.number} — ${status}`,
                            purchaseOrderId: pedido.id,
                            supplierId: pedido.supplier_id ?? undefined,
                            projectId: pedido.project_id ?? undefined,
                        });
                    }
                } catch (procError) {
                    console.error('[ORDER SERVICE] Process trigger failed:', procError);
                }
            }

            return resultado;
        },
    };
}

/**
 * As dependências feitas só com o cliente do banco — o que a Edge Function usa
 * (service role). O navegador NÃO usa isto: injeta os serviços de sempre.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function depsComBanco(db: { from: (t: string) => any }, extra: Pick<DepsDosEfeitos, 'financeiro' | 'processos' | 'textos'>): DepsDosEfeitos {
    return {
        async emailDoFornecedor(supplierId) {
            const { data } = await db.from('suppliers').select('email').eq('id', supplierId).maybeSingle();
            return (data?.email as string | undefined) || null;
        },
        async notificar(aviso) {
            const { error } = await db.from('notifications').insert({
                recipient_email: aviso.recipientEmail, title: aviso.title, message: aviso.message,
                link: aviso.link, type: aviso.type, organization_id: null,
            });
            if (error) throw error;
        },
        async registrarLog(e) {
            try {
                await db.from('notification_log').insert({
                    order_id: e.orderId ?? null, channel: e.channel, recipient: e.recipient ?? null,
                    subject: e.subject ?? null, body: e.body ?? null, status: e.status,
                    error: e.error ?? null, metadata: e.metadata ?? null,
                });
            } catch (err) {
                console.error('[NOTIFICATION LOG] Failed to write log entry:', err);
            }
        },
        async orgDaEmpresa(empresaId) {
            const { data } = await db.from('companies').select('org_id').eq('id', empresaId).maybeSingle();
            return (data?.org_id as string | undefined) ?? null;
        },
        ...extra,
    };
}
