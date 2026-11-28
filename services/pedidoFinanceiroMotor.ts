/**
 * Parcelas a pagar de um pedido de compra — o produtor que era
 * `financialService.syncOrderToFinance`, com o cliente do banco INJETADO.
 *
 * Saiu do `financialService` em 27/11/2026 (docs/planos/2026-11-27-recebimento-mobile.md,
 * Fase 1) para rodar em DOIS lugares com o MESMO código: no navegador (o
 * `financialService` delega para cá com o cliente da sessão) e na Edge Function
 * `pedido-recebimento` (cliente com service role), que grava o recebimento do
 * celular — inclusive do link `/celular`, que não tem login. Mesmo molde de
 * `services/processMotor.ts` e `services/documentNumbering/motor.ts`.
 *
 * Uma diferença de propósito em relação ao código antigo: a obra NÃO é mais
 * regravada inteira (`projectService.saveProject` reenviava `settings` e
 * `budget` lidos no começo — no servidor, uma cópia velha sobrescreveria
 * cronograma/WBS de quem editou no meio). As parcelas do pedido são trocadas
 * de uma vez pela primitiva SQL `fn_obra_trocar_parcelas_do_pedido`, que mexe
 * só em `settings.financialInfo.transactions`, com a obra travada.
 *
 * Imports só de módulos puros, TODOS com `.ts` explícito (o Deno não resolve
 * import sem extensão).
 */
import { totalEfetivoDoPedido } from '../utils/pedidoItemValor.ts';
import { isSystemProject } from '../utils/systemProjects.ts';
import type { PurchaseOrderItem } from '../types/supplyChain.ts';

/** O mínimo do cliente do Supabase que o motor usa (estrutural, como em processMotor). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClienteDoBanco = { from: (tabela: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

/**
 * Início das `notes` de parcela de pedido gerada SEM nota fiscal (botão
 * "Gerar título a pagar"). É por ela que o sync automático reconhece e mantém
 * essas parcelas quando a nota chega depois. Não mude o texto sem migrar as
 * parcelas existentes.
 */
export const MARCA_PARCELA_SEM_NOTA = 'Gerado sem nota fiscal';

/** O que o sync fez: gerou N parcelas, ou por que não gerou. */
export type ResultadoSyncPedido =
    | { gerou: number }
    | { pulou: 'pedido-nao-encontrado' | 'status' | 'sem-nota' | 'titulo-da-nota' | 'sem-obra' | 'ja-pago' | 'gerado-sem-nota'; motivo: string };

/** Lançamento do JSON da obra (`settings.financialInfo.transactions`) — só os campos que o sync lê e grava. */
export interface ParcelaDaObra {
    id: string;
    date: string;
    type: 'INCOME' | 'EXPENSE';
    category: string;
    description: string;
    value: number;
    status: string;
    supplier?: string;
    supplierId?: string;
    orderId?: string;
    bankAccount?: string;
    costCenter?: string;
    chartOfAccounts?: string;
    notes?: string;
}

/** Campos de `internal_transactions` que o JSON da obra não carrega (ver `financialService.addTransaction`). */
export interface OpcoesDoRazao {
    sourceSystem?: string;
    referenceId?: string;
    partyType?: 'SUPPLIER' | 'CLIENT' | null;
    partyName?: string | null;
    supplierId?: string | null;
    purchaseOrderId?: string | null;
}

/**
 * A linha de `internal_transactions` que espelha um lançamento do JSON da obra.
 * Função pura — a MESMA usada por `financialService.addTransaction` (os outros
 * produtores) e por este motor. `due_date` e `business_status` são obrigatórios
 * de fato: as views derivam VENCIDO deles.
 */
export function linhaDoRazao(
    tx: Pick<ParcelaDaObra, 'id' | 'date' | 'type' | 'value' | 'description' | 'category' | 'status' | 'supplier'>,
    obra: { organizationId: string | null | undefined; projectId: string | null },
    sync?: OpcoesDoRazao,
): Record<string, unknown> {
    const txDate = tx.date.split('T')[0];
    return {
        organization_id: obra.organizationId,
        source_system: sync?.sourceSystem || 'PROJECT',
        reference_id: sync?.referenceId || tx.id,
        project_id: obra.projectId,
        transaction_date: txDate,
        due_date: txDate,
        amount: tx.value,
        direction: tx.type === 'INCOME' ? 'CREDIT' : 'DEBIT',
        description: tx.description,
        category: tx.category,
        entity_name: sync?.partyName || tx.supplier || null,
        party_type: sync?.partyType ?? null,
        party_name: sync?.partyName || tx.supplier || null,
        supplier_id: sync?.supplierId ?? null,
        purchase_order_id: sync?.purchaseOrderId ?? null,
        status: tx.status === 'PAID' ? 'CONCILIATED' : 'PENDING',
        business_status: tx.status === 'PAID' ? 'PAGO' : 'PREVISTO',
        /* Nasce conciliado => nasce com a data da baixa. A trigger
           `trg_payment_date_na_baixa` (20270909000002) é BEFORE UPDATE e
           não pega INSERT. */
        payment_date: tx.status === 'PAID' ? txDate : null,
    };
}

type PedidoDoBanco = {
    id: string; number: string; status: string; supplier_id?: string; project_id?: string; items: PurchaseOrderItem[];
    actual_delivery_date?: string; delivery_date?: string; payment_method?: string; payment_term_type?: string;
    payment_installments?: number; payment_days?: number; bank_account?: string; cost_center?: string; chart_of_accounts?: string;
};

type ObraDoBanco = {
    id: string; name: string | null; organization_id: string | null;
    s_org: string | null; s_is_system: string | null; s_name: string | null;
    transacoes: ParcelaDaObra[] | null;
};

export function criarFinanceiroDoPedido(db: ClienteDoBanco) {
    return {
        /**
         * Gera as parcelas a pagar do pedido na obra (JSON) e no razão
         * (`internal_transactions`). Regras (inalteradas desde 19/10/2026):
         * só depois da entrega; só com nota fiscal, salvo `permitirSemNota`
         * (botão "Gerar título a pagar"); nunca por cima do título lançado pela
         * nota; nunca regera parcela já paga; mantém as geradas sem nota.
         */
        async syncOrderToFinance(orderId: string, opcoes: { permitirSemNota?: boolean } = {}): Promise<ResultadoSyncPedido> {
            const { data: orderRaw, error: orderError } = await db
                .from('purchase_orders')
                .select('id, number, status, supplier_id, project_id, items, actual_delivery_date, delivery_date, payment_method, payment_term_type, payment_installments, payment_days, bank_account, cost_center, chart_of_accounts')
                .eq('id', orderId)
                .single();

            if (orderError || !orderRaw) {
                console.error('[FINANCIAL] Order not found for sync:', orderId);
                return { pulou: 'pedido-nao-encontrado', motivo: 'Pedido não encontrado.' };
            }
            const order = orderRaw as PedidoDoBanco;

            let supplierName = 'Fornecedor não identificado';
            if (order.supplier_id) {
                const { data: supplier } = await db
                    .from('suppliers')
                    .select('name')
                    .eq('id', order.supplier_id)
                    .single();
                if (supplier) supplierName = supplier.name;
            }

            const allowedStatuses = ['Entregue', 'Recebido', 'Divergência'];
            if (!allowedStatuses.includes(order.status)) {
                return { pulou: 'status', motivo: `O pedido está "${order.status}". As parcelas são geradas depois da entrega (no FOB, da retirada).` };
            }

            const { data: notasRaw, error: notasErr } = await db
                .from('invoices')
                .select('id, file_name')
                .eq('order_id', orderId)
                .order('created_at', { ascending: false });
            if (notasErr) throw notasErr;
            const notas = (notasRaw ?? []) as { id: string; file_name: string | null }[];
            if (notas.length === 0 && !opcoes.permitirSemNota) {
                return { pulou: 'sem-nota', motivo: 'O pedido não tem nota fiscal vinculada.' };
            }

            // Trava contra cobrança em dobro: a nota já lançou o título (Fiscal › Criar título).
            const { data: tituloDaNota, error: tituloErr } = await db
                .from('internal_transactions')
                .select('id')
                .eq('purchase_order_id', orderId)
                .eq('source_system', 'NFE')
                .eq('direction', 'DEBIT')
                .neq('status', 'CANCELLED')
                .limit(1);
            if (tituloErr) throw tituloErr;
            if (tituloDaNota && tituloDaNota.length > 0) {
                return { pulou: 'titulo-da-nota', motivo: 'A nota fiscal deste pedido já lançou o título a pagar; as parcelas do pedido não são geradas por cima.' };
            }

            if (!order.project_id) return { pulou: 'sem-obra', motivo: 'O pedido não tem obra — as parcelas moram no financeiro da obra.' };
            const projectId = order.project_id;
            // Só as chaves que o sync lê — `settings` inteiro pesa centenas de KB.
            const { data: obraRaw } = await db
                .from('projects')
                .select('id, name, organization_id, s_org:settings->>organizationId, s_is_system:settings->>isSystemProject, s_name:settings->>name, transacoes:settings->financialInfo->transactions')
                .eq('id', projectId)
                .maybeSingle();
            if (!obraRaw) return { pulou: 'sem-obra', motivo: 'Não foi possível abrir a obra do pedido.' };
            const obra = obraRaw as ObraDoBanco;
            const transacoes = Array.isArray(obra.transacoes) ? obra.transacoes : [];

            const orderTransactions = transacoes.filter(t => t.orderId === orderId);
            if (orderTransactions.length > 0) {
                const hasStartedPayment = orderTransactions.some(t => t.status !== 'PENDING' && t.status !== 'CANCELLED');
                if (hasStartedPayment) {
                    return { pulou: 'ja-pago', motivo: 'O pedido já tem parcela paga ou em pagamento; nada foi regerado.' };
                }
                const geradasSemNota = orderTransactions.some(t => String(t.notes ?? '').startsWith(MARCA_PARCELA_SEM_NOTA));
                if (geradasSemNota && !opcoes.permitirSemNota) {
                    return { pulou: 'gerado-sem-nota', motivo: 'As parcelas foram geradas sem nota fiscal e foram mantidas.' };
                }
            }

            const total = totalEfetivoDoPedido(order.items);
            const baseDate = order.actual_delivery_date || order.delivery_date || new Date().toISOString();
            const paymentMethod = order.payment_method || 'Não inf.';
            const termType = order.payment_term_type || 'Vista';
            const installmentsCount = termType === 'Parcelado' ? (order.payment_installments || 1) : 1;
            const intervalDays = order.payment_days || 30;
            const baseInstallment = Math.round((total / installmentsCount) * 100) / 100;

            const novas: ParcelaDaObra[] = [];
            for (let i = 0; i < installmentsCount; i++) {
                const installmentValue = i === installmentsCount - 1
                    ? Math.round((total - baseInstallment * (installmentsCount - 1)) * 100) / 100
                    : baseInstallment;
                const dueDate = new Date(baseDate);
                dueDate.setDate(dueDate.getDate() + intervalDays * (i + 1));
                const installmentDesc = installmentsCount > 1
                    ? `Pedido ${order.number} (${i + 1}/${installmentsCount})`
                    : `Pedido ${order.number}`;
                novas.push({
                    id: crypto.randomUUID(),
                    date: dueDate.toISOString(),
                    type: 'EXPENSE',
                    category: 'Material',
                    description: `Pagamento PO - ${installmentDesc}`,
                    value: installmentValue,
                    status: 'PENDING',
                    supplier: supplierName,
                    supplierId: order.supplier_id ?? undefined,
                    orderId,
                    bankAccount: order.bank_account,
                    costCenter: order.cost_center,
                    chartOfAccounts: order.chart_of_accounts,
                    notes: notas.length > 0
                        ? `Gerado da entrega. Método: ${paymentMethod}. NFe: ${notas[0].file_name}`
                        : `${MARCA_PARCELA_SEM_NOTA} (Suprimentos › Pedido). Método: ${paymentMethod}.`,
                });
            }

            // JSON da obra: tira as parcelas do pedido e põe as novas no começo,
            // numa operação só. A última parcela fica na frente, como quando cada
            // uma era acrescentada no início da lista.
            const { error: trocaErr } = await db.rpc('fn_obra_trocar_parcelas_do_pedido', {
                p_project: projectId,
                p_order: orderId,
                p_novas: [...novas].reverse(),
            });
            if (trocaErr) throw trocaErr;

            if (orderTransactions.length > 0) {
                const { error: limpezaErr } = await db
                    .from('internal_transactions')
                    .delete()
                    .eq('purchase_order_id', orderId)
                    .eq('status', 'PENDING');
                if (limpezaErr) console.error('[FINANCIAL] Falha ao limpar parcelas antigas do razão:', limpezaErr);
            }

            const obraDoRazao = {
                organizationId: obra.s_org || obra.organization_id,
                projectId: isSystemProject({ name: obra.name, settings: { isSystemProject: obra.s_is_system === 'true', name: obra.s_name } }) ? null : projectId,
            };
            const linhas = novas.map(tx => linhaDoRazao(tx, obraDoRazao, {
                sourceSystem: 'PURCHASE_ORDER',
                partyType: 'SUPPLIER',
                partyName: supplierName,
                supplierId: order.supplier_id ?? null,
                purchaseOrderId: orderId,
            }));
            const { error: razaoErr } = await db.from('internal_transactions').insert(linhas);
            if (razaoErr) console.error('[FINANCIAL-SYNC] Failed to sync to internal_transactions:', razaoErr);

            return { gerou: installmentsCount };
        },
    };
}
