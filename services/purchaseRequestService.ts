import { supabase } from '../lib/supabase';
import { approvalService, type RoleLabels } from './approvalService';
import { quotationService } from './quotationService';
import { orderService } from './orderService';
import { notificationService } from './notificationService';
import { generatePurchaseRequestNumber } from './purchaseRequestNumberingService';
import type {
    PurchaseRequest, PurchaseRequestDraft, PurchaseRequestItem, PurchaseRequestBudgetRef,
} from '../types/purchaseRequest';
import type { ApprovalStatus, ApprovalStep } from '../types/financial';
import {
    itensParaCotacao, itensParaPedido, motivoNaoConverter, motivoNaoEditar,
    motivoRascunhoInvalido, totalEstimado,
} from '../utils/solicitacaoCompra';

/**
 * Suprimentos › Solicitações de Compra.
 * Plano: docs/planos/2026-09-26-suprimentos-solicitacoes-compra.md
 *
 * Única camada que fala com `purchase_requests` / `purchase_request_items`.
 * Regras de "pode / não pode" vêm de utils/solicitacaoCompra.ts; a trava
 * definitiva é do banco (fn_purchase_requests_guard / _items_guard).
 */

const SELECT_SC = `
    *,
    projects(name),
    purchase_request_items(
        *,
        quotation_requests(number),
        purchase_orders(number)
    )
`;

const DEFAULT_LABELS: RoleLabels = { level1_label: 'Gestor', level2_label: 'Financeiro/Diretoria' };

/** 'YYYY-MM-DD' no fuso LOCAL — toISOString() cairia no dia seguinte à noite (UTC). */
function diaLocalDaquiA(dias: number): string {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Row = Record<string, any>;

function mapItem(r: Row): PurchaseRequestItem {
    return {
        id: r.id,
        requestId: r.request_id,
        position: r.position ?? 0,
        source: r.source,
        inputCode: r.input_code,
        description: r.description,
        unit: r.unit,
        quantity: Number(r.quantity),
        estimatedUnitPrice: Number(r.estimated_unit_price ?? 0),
        needDate: r.need_date,
        notes: r.notes,
        stockItemId: r.stock_item_id,
        procurementPlanItemId: r.procurement_plan_item_id,
        budgetRef: (r.budget_ref ?? null) as PurchaseRequestBudgetRef | null,
        quotationRequestId: r.quotation_request_id,
        quotationNumber: r.quotation_requests?.number ?? null,
        purchaseOrderId: r.purchase_order_id,
        purchaseOrderNumber: r.purchase_orders?.number ?? null,
        cancelledAt: r.cancelled_at,
    };
}

function mapRequest(r: Row): PurchaseRequest {
    const items = ((r.purchase_request_items ?? []) as Row[])
        .map(mapItem)
        .sort((a, b) => a.position - b.position);
    return {
        id: r.id,
        organizationId: r.organization_id,
        projectId: r.project_id,
        projectName: r.projects?.name,
        number: r.number,
        title: r.title,
        justification: r.justification,
        needDate: r.need_date,
        priority: r.priority,
        costCenterId: r.cost_center_id,
        planoDeContasId: r.plano_de_contas_id,
        requestedBy: r.requested_by,
        requestedByName: r.requested_by_name,
        requestedByEmail: r.requested_by_email,
        estimatedTotal: Number(r.estimated_total ?? 0),
        approvalStatus: (r.approval_status ?? 'RASCUNHO') as ApprovalStatus,
        approvalChain: (r.approval_chain ?? []) as ApprovalStep[],
        approvalRequiredLevels: (r.approval_required_levels ?? 1) as 1 | 2,
        cancelledAt: r.cancelled_at,
        cancelReason: r.cancel_reason,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        items,
    };
}

function itemToRow(requestId: string, i: PurchaseRequestItem, position: number): Row {
    return {
        id: i.id ?? crypto.randomUUID(),
        request_id: requestId,
        position,
        source: i.source,
        input_code: i.inputCode || null,
        description: i.description.trim(),
        unit: i.unit.trim() || 'un',
        quantity: Number(i.quantity),
        estimated_unit_price: Number(i.estimatedUnitPrice) || 0,
        need_date: i.needDate || null,
        notes: i.notes || null,
        stock_item_id: i.stockItemId || null,
        procurement_plan_item_id: i.procurementPlanItemId || null,
        budget_ref: i.budgetRef ?? null,
    };
}

function headerFromDraft(d: PurchaseRequestDraft): Row {
    return {
        project_id: d.projectId,
        title: d.title.trim(),
        justification: d.justification?.trim() || null,
        need_date: d.needDate || null,
        priority: d.priority,
        cost_center_id: d.costCenterId || null,
        plano_de_contas_id: d.planoDeContasId || null,
        estimated_total: totalEstimado(d.items),
    };
}

async function usuarioAtual(): Promise<{ id?: string; email?: string; name?: string }> {
    const { data } = await supabase.auth.getUser();
    const u = data?.user;
    const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
    const name = (meta.full_name ?? meta.name ?? meta.nome) as string | undefined;
    return { id: u?.id, email: u?.email ?? undefined, name: name || u?.email || undefined };
}

async function avisarSolicitante(sc: PurchaseRequest, aprovada: boolean, motivo?: string) {
    if (!sc.requestedByEmail) return;
    const numero = sc.number ?? sc.title;
    try {
        await notificationService.sendNotification({
            recipientEmail: sc.requestedByEmail,
            title: aprovada ? `Solicitação ${numero} aprovada` : `Solicitação ${numero} reprovada`,
            message: aprovada
                ? `"${sc.title}" foi aprovada e já pode virar cotação ou pedido.`
                : `"${sc.title}" foi reprovada.${motivo ? ` Motivo: ${motivo}` : ''} Ajuste e reenvie.`,
            link: '/supplies-solicitacoes',
            type: 'solicitacao_compra_decidida',
            organizationId: sc.organizationId,
        });
    } catch (err) {
        // A decisão já foi gravada; aviso que falha não pode desfazê-la.
        console.error('[purchaseRequestService] notificação ao solicitante falhou:', err);
    }
}

export const purchaseRequestService = {
    /** `organizationId` null = "Todas" — a RLS recorta (REGRA #5). */
    async list(organizationId: string | null): Promise<PurchaseRequest[]> {
        let q = supabase.from('purchase_requests').select(SELECT_SC).order('created_at', { ascending: false });
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map(mapRequest);
    },

    async get(id: string): Promise<PurchaseRequest> {
        const { data, error } = await supabase.from('purchase_requests').select(SELECT_SC).eq('id', id).single();
        if (error) throw error;
        return mapRequest(data);
    },

    /**
     * Cria em RASCUNHO. A organização é a DONA DA OBRA — quem chama não
     * escolhe (REGRA #5, item 5); o trigger do banco confere de novo.
     */
    async create(draft: PurchaseRequestDraft): Promise<PurchaseRequest> {
        const invalido = motivoRascunhoInvalido(draft);
        if (invalido) throw new Error(invalido);

        const { data: proj, error: pErr } = await supabase
            .from('projects').select('organization_id').eq('id', draft.projectId).single();
        if (pErr) throw pErr;
        const organizationId = proj?.organization_id as string | undefined;
        if (!organizationId) throw new Error('A obra selecionada não está vinculada a uma organização.');

        const number = await generatePurchaseRequestNumber(organizationId, draft.projectId);
        const user = await usuarioAtual();

        const { data: header, error } = await supabase
            .from('purchase_requests')
            .insert({
                ...headerFromDraft(draft),
                organization_id: organizationId,
                number,
                requested_by: user.id ?? null,
                requested_by_name: user.name ?? null,
                requested_by_email: user.email ?? null,
            })
            .select('id')
            .single();
        if (error) throw error;

        const rows = draft.items.map((i, idx) => itemToRow(header.id, { ...i, id: undefined }, idx));
        const { error: iErr } = await supabase.from('purchase_request_items').insert(rows);
        if (iErr) {
            // Rascunho sem itens não serve para nada — desfaz o cabeçalho.
            await supabase.from('purchase_requests').delete().eq('id', header.id);
            throw iErr;
        }
        return this.get(header.id);
    },

    /**
     * Grava rascunho ou reprovada. Ordem pensada para falha parcial: primeiro
     * upsert (nada se perde), depois apaga só os itens removidos.
     */
    async update(id: string, draft: PurchaseRequestDraft): Promise<PurchaseRequest> {
        const atual = await this.get(id);
        const bloqueio = motivoNaoEditar(atual) ?? motivoRascunhoInvalido(draft);
        if (bloqueio) throw new Error(bloqueio);

        const { error } = await supabase.from('purchase_requests').update(headerFromDraft(draft)).eq('id', id);
        if (error) throw error;

        const rows = draft.items.map((i, idx) => itemToRow(id, i, idx));
        const { error: uErr } = await supabase.from('purchase_request_items').upsert(rows);
        if (uErr) throw uErr;

        const mantidos = new Set(rows.map(r => r.id as string));
        const removidos = atual.items.map(i => i.id!).filter(x => x && !mantidos.has(x));
        if (removidos.length) {
            const { error: dErr } = await supabase.from('purchase_request_items').delete().in('id', removidos);
            if (dErr) throw dErr;
        }
        return this.get(id);
    },

    /** Só rascunho (o banco recusa o resto — §6.3: o que entrou no fluxo se cancela). */
    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('purchase_requests').delete().eq('id', id);
        if (error) throw error;
    },

    async cancel(id: string, reason: string): Promise<void> {
        const { error } = await supabase
            .from('purchase_requests')
            .update({ cancelled_at: new Date().toISOString(), cancel_reason: reason.trim() || null })
            .eq('id', id)
            .is('cancelled_at', null);
        if (error) throw error;
    },

    // ─── Aprovação (motor unificado — approvalService) ─────────────────────
    // `semFaixa: 'exigir1'`: toda SC pede ao menos o nível 1, inclusive sem
    // preço (valor 0). Com 'liberar' (o do pedido) a SC sem preço se
    // autoaprovaria. Por isso a fila lista SC PENDENTE sem exigir faixa
    // (aplicar_20270926000131_fila_aprovacao_solicitacao_compra.sql).

    async submitForApproval(id: string): Promise<void> {
        const sc = await this.get(id);
        const bloqueio = motivoNaoEditar(sc) ?? motivoRascunhoInvalido({ ...sc });
        if (bloqueio) throw new Error(bloqueio);
        await approvalService.submit('purchase_request', id, {}, {
            organizationId: sc.organizationId,
            amount: sc.estimatedTotal,
            semFaixa: 'exigir1',
        });
    },

    async approve(id: string, level: 1 | 2, approvedBy: string, labels: RoleLabels = DEFAULT_LABELS, notes?: string): Promise<void> {
        const row = await approvalService.approve('purchase_request', id, level, approvedBy, labels, notes);
        if (row?.approval_status === 'APROVADO') await avisarSolicitante(await this.get(id), true);
    },

    async reject(id: string, rejectedBy: string, reason: string): Promise<void> {
        await approvalService.reject('purchase_request', id, rejectedBy, reason);
        await avisarSolicitante(await this.get(id), false, reason);
    },

    // ─── Conversão ─────────────────────────────────────────────────────────
    // Mesmo molde de procurementService.generateQuotationFromItems /
    // generateOrderFromItems: cria pelo serviço de domínio e marca a origem.
    // Não é atômico; se o vínculo falhar, a mensagem diz o número já criado
    // para ninguém gerar outra cotação/pedido por cima.

    async generateQuotation(
        requestId: string, itemIds: string[], opts: { deadline?: string } = {},
    ): Promise<{ quotationId: string; quotationNumber: string }> {
        const sc = await this.get(requestId);
        const itens = sc.items.filter(i => i.id && itemIds.includes(i.id));
        const bloqueio = motivoNaoConverter(sc, itens);
        if (bloqueio) throw new Error(bloqueio);

        const qr = await quotationService.createRequest({
            projectId: sc.projectId,
            title: `${sc.number ?? 'SC'} — ${sc.title}`,
            description: [`Gerada a partir da solicitação ${sc.number ?? ''}.`.replace(' .', '.'), sc.justification]
                .filter(Boolean).join('\n'),
            deadline: opts.deadline || diaLocalDaquiA(7),
            status: 'Aberta',
            items: itensParaCotacao(itens),
            invitedSupplierIds: [],
        });

        await this.vincular(itens, { quotation_request_id: qr.id }, { status: 'quoted', generated_quotation_id: qr.id },
            `Cotação ${qr.number}`);
        return { quotationId: qr.id, quotationNumber: qr.number };
    },

    async generateOrder(
        requestId: string, itemIds: string[], supplierId: string, opts: { deliveryDate?: string } = {},
    ): Promise<{ orderId: string; orderNumber: string }> {
        if (!supplierId) throw new Error('Selecione o fornecedor do pedido.');
        const sc = await this.get(requestId);
        const itens = sc.items.filter(i => i.id && itemIds.includes(i.id));
        const bloqueio = motivoNaoConverter(sc, itens);
        if (bloqueio) throw new Error(bloqueio);

        const order = await orderService.createOrder({
            projectId: sc.projectId,
            supplierId,
            deliveryDate: opts.deliveryDate || sc.needDate || diaLocalDaquiA(14),
            status: 'Rascunho',
            costCenterId: sc.costCenterId ?? undefined,
            planoDeContasId: sc.planoDeContasId ?? undefined,
            notes: `Gerado a partir da solicitação ${sc.number ?? sc.title}.`,
            items: itensParaPedido(itens),
        });

        await this.vincular(itens, { purchase_order_id: order.id }, { status: 'ordered', generated_order_id: order.id },
            `Pedido ${order.number ?? ''}`);
        return { orderId: order.id, orderNumber: order.number ?? '' };
    },

    /** Marca os itens da SC e, para os que vieram do Plano, a linha do plano. */
    async vincular(itens: PurchaseRequestItem[], naSc: Row, noPlano: Row, criado: string): Promise<void> {
        const ids = itens.map(i => i.id!);
        const { error } = await supabase.from('purchase_request_items').update(naSc).in('id', ids);
        if (error) {
            throw new Error(`${criado} foi criado, mas não consegui vincular os itens à solicitação (${error.message}). ` +
                `Não gere outro — confira ${criado} antes.`);
        }
        const doPlano = itens.map(i => i.procurementPlanItemId).filter((x): x is string => !!x);
        if (doPlano.length) {
            const { error: pErr } = await supabase.from('procurement_plan_items').update(noPlano).in('id', doPlano);
            if (pErr) console.error('[purchaseRequestService] plano de aquisições não atualizado:', pErr);
        }
    },

    // ─── Origens de item ───────────────────────────────────────────────────

    /** Linhas do Plano já presas a uma SC não cancelada — o seletor não as oferece de novo. */
    async planItemIdsEmUso(projectId: string): Promise<Set<string>> {
        const { data, error } = await supabase
            .from('purchase_request_items')
            .select('procurement_plan_item_id, cancelled_at, purchase_requests!inner(project_id, cancelled_at)')
            .eq('purchase_requests.project_id', projectId)
            .is('purchase_requests.cancelled_at', null)
            .is('cancelled_at', null)
            .not('procurement_plan_item_id', 'is', null);
        if (error) throw error;
        return new Set((data ?? []).map((r: Row) => r.procurement_plan_item_id as string));
    },
};
