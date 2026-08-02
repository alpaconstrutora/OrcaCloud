import { supabase } from '../lib/supabase';
import { PaymentInstallment } from '../types';
import { isSystemProject } from '../utils/systemProjects';

/**
 * Parcelas de uma NEGOCIAÇÃO (Locação / Venda de Ativo) em Contas a Receber.
 *
 * ## Regra do módulo (decidida em 2026-08-02, depois de um modelo rejeitado)
 *
 * **Parcela existe ⟺ está em Contas a Receber.** Não há rascunho, plano ou
 * "parcela de proposta". A aba Parcelas da negociação é a lista de cobranças
 * reais, e `internal_transactions` é a única fonte.
 *
 * A tentativa anterior — uma tabela `deal_installments` com estado
 * "Não lançada" e um botão para publicar — foi descartada: criava duas
 * realidades para o mesmo dado, e o usuário precisava lembrar de um segundo
 * passo para que o cronograma virasse cobrança. Não repita esse desenho.
 *
 * ## O que continua valendo
 *
 * - **Salvar a negociação NÃO cria parcela.** Quem cria é o ato explícito de
 *   gerar (com confirmação). Foi a queixa que originou todo este trabalho.
 * - **REGRA #2 (CLAUDE.md, escrita):** parcela de comercial não tem obra.
 *   `project_id` só é carimbado quando o negócio aponta para uma obra REAL;
 *   o vault "Gestão Comercial" é projeto de sistema e vai como null.
 * - **REGRA #5:** leitura aceita organização nula ("Todas as organizações");
 *   quem filtra é a RLS.
 */

/** Uma parcela como a aba Parcelas a enxerga (linha de `internal_transactions`). */
export interface DealReceivable {
    id: string;
    reference_id: string | null;
    transaction_date: string;
    amount: number;
    status: string;
    business_status?: string | null;
    description: string | null;
    original_amount?: number | null;
    discount_type?: string | null;
    discount_amount?: number | null;
    installment_type?: string | null;
    payment_type?: string | null;
}

const COLS = 'id, reference_id, transaction_date, due_date, amount, status, business_status, '
    + 'description, original_amount, discount_type, discount_amount, installment_type, payment_type';

/** Dinheiro que já entrou — nunca é apagado nem reescrito por esta camada. */
const liquidada = (r: { status?: string | null; business_status?: string | null }) =>
    r.status === 'CONCILIATED' || ['RECEBIDO', 'PAGO'].includes(r.business_status || '');

export interface GerarResultado {
    criadas: number;
    refeitas: number;
    preservadas: { description: string; motivo: 'recebida' }[];
}

export const dealReceivablesService = {

    /**
     * Parcelas desta negociação. O filtro por prefixo do `reference_id` é o mesmo
     * padrão que `commercialFinanceService.deleteDealInstallments` já usa para
     * achar as linhas de um negócio — `tx-{dealId}-custom-p{n}`, `tx-{dealId}-dp`
     * e o legado `tx-{dealId}-p{i}`.
     */
    async listByDeal(dealId: string, organizationId?: string | null): Promise<DealReceivable[]> {
        if (!dealId) return [];
        let q = supabase
            .from('internal_transactions')
            .select(COLS)
            .eq('direction', 'CREDIT')
            .like('reference_id', `tx-${dealId}-%`);
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) { console.error('[DEAL-RECEIVABLES] listByDeal:', error); throw error; }
        return ((data || []) as unknown as DealReceivable[])
            .sort((a, b) => (a.transaction_date || '').localeCompare(b.transaction_date || ''));
    },

    /**
     * Cria/refaz as parcelas da negociação em Contas a Receber a partir do
     * cronograma montado na tela. Idempotente: o upsert casa por
     * (organization_id, reference_id, entry_type), então regerar não duplica.
     *
     * Parcela já recebida/conciliada NUNCA é tocada — é preservada e devolvida
     * NOMEADA em `preservadas`, para o aviso dizer qual foi.
     */
    async gerar(
        dealId: string,
        organizationId: string,
        parcelas: PaymentInstallment[],
        entrada: number,
        header: {
            dealType?: 'SALE' | 'RENTAL' | 'SERVICE';
            date?: string;
            costCenterId?: string | null;
            planoDeContasId?: string | null;
            downPaymentPaymentType?: string | null;
            downPaymentInstallmentType?: string | null;
            downPaymentNotes?: string | null;
        } = {},
    ): Promise<GerarResultado> {
        const res: GerarResultado = { criadas: 0, refeitas: 0, preservadas: [] };
        if (!dealId || !organizationId) return res;

        const ctx = await this.contexto(dealId, organizationId);
        const existentes = await this.listByDeal(dealId, organizationId);
        const rotulo = header.dealType === 'SALE' ? 'Venda' : 'Aluguel';

        const linhas: Record<string, unknown>[] = [];
        const refsDesejadas = new Set<string>();

        const monta = (ref: string, due: string, valor: number, extra: Record<string, unknown>) => {
            refsDesejadas.add(ref);
            linhas.push({
                organization_id: organizationId,
                source_system: ctx.sourceSystem,
                reference_id: ref,
                project_id: ctx.projectId,   // REGRA #2 — null quando é vault
                transaction_date: due,
                due_date: due,
                amount: Number((valor || 0).toFixed(2)),
                direction: 'CREDIT',
                entity_name: ctx.clientName,
                party_name: ctx.clientName,
                party_id: ctx.clientId,
                party_type: 'CLIENT',
                cost_center_id: header.costCenterId ?? null,
                plano_de_contas_id: header.planoDeContasId ?? null,
                status: 'PENDING',
                business_status: 'PREVISTO',
                ...extra,
            });
        };

        if ((entrada || 0) > 0) {
            monta(`tx-${dealId}-dp`, header.date || new Date().toISOString().split('T')[0], entrada, {
                description: `Receita: ${rotulo} - Sinal (Entrada)`,
                installment_type: header.downPaymentInstallmentType || 'ENTRADA',
                payment_type: header.downPaymentPaymentType || null,
            });
        }

        parcelas.forEach((p, i) => {
            monta(`tx-${dealId}-custom-p${i + 1}`, p.dueDate, p.value, {
                description: p.description || `Parcela ${i + 1}/${parcelas.length}`,
                original_amount: p.originalValue ?? null,
                discount_type: p.discountType ?? null,
                discount_amount: p.discountAmount ?? null,
                installment_type: p.installmentType || 'MENSAL',
                payment_type: p.paymentType || null,
            });
        });

        // Recebidas ficam de fora do upsert (não se reescreve cobrança paga) e
        // suas referências saem da lista de desejadas, para não serem apagadas.
        const recebidasPorRef = new Map(
            existentes.filter(liquidada).map(e => [e.reference_id || '', e]));
        const payload = linhas.filter(l => !recebidasPorRef.has(l.reference_id as string));
        for (const [, e] of recebidasPorRef) {
            if (refsDesejadas.has(e.reference_id || '')) {
                res.preservadas.push({ description: e.description || 'parcela', motivo: 'recebida' });
            }
        }

        // O que saiu do cronograma some — exceto o que já foi recebido.
        const sobras = existentes.filter(e =>
            !refsDesejadas.has(e.reference_id || '') && !liquidada(e));
        if (sobras.length > 0) {
            const { error } = await supabase
                .from('internal_transactions').delete().in('id', sobras.map(s => s.id));
            if (error) console.error('[DEAL-RECEIVABLES] limpeza:', error);
            else res.refeitas = sobras.length;
        }

        if (payload.length > 0) {
            const { error } = await supabase
                .from('internal_transactions')
                .upsert(payload, { onConflict: 'organization_id,reference_id,entry_type' });
            if (error) { console.error('[DEAL-RECEIVABLES] gerar:', error); throw error; }
            res.criadas = payload.length;
        }

        return res;
    },

    /** Exclui uma parcela. Recebida/conciliada é recusada com motivo. */
    async remover(entryId: string): Promise<void> {
        const { data } = await supabase
            .from('internal_transactions')
            .select('id, status, business_status')
            .eq('id', entryId)
            .maybeSingle();
        if (!data) return;
        if (liquidada(data)) {
            throw new Error('Parcela já recebida ou conciliada — estorne no financeiro antes de excluir.');
        }
        const { error } = await supabase.from('internal_transactions').delete().eq('id', entryId);
        if (error) { console.error('[DEAL-RECEIVABLES] remover:', error); throw error; }
    },

    /**
     * Cliente e dimensão obra do negócio. Mesma decisão de `financialSyncService`:
     * projeto de sistema nunca vira `project_id`, e `source_system='COMMERCIAL'`
     * isenta o lançamento do hard-lock de período fechado.
     */
    async contexto(dealId: string, organizationId: string) {
        const { data: deal } = await supabase
            .from('commercial_deals')
            .select('id, client_id, linked_project_id, type')
            .eq('id', dealId)
            .maybeSingle();

        let clientName: string | null = null;
        if (deal?.client_id) {
            const { data: c } = await supabase
                .from('clients').select('name').eq('id', deal.client_id).maybeSingle();
            clientName = (c?.name as string) ?? null;
        }

        let projectId: string | null = null;
        if (deal?.linked_project_id) {
            const { data: p } = await supabase
                .from('projects').select('id, name, settings')
                .eq('id', deal.linked_project_id).maybeSingle();
            if (p && !isSystemProject(p as Parameters<typeof isSystemProject>[0])) projectId = p.id as string;
        }

        return {
            clientId: (deal?.client_id as string) ?? null,
            clientName,
            projectId,
            sourceSystem: projectId ? 'PROJECT' : 'COMMERCIAL',
            organizationId,
        };
    },
};
