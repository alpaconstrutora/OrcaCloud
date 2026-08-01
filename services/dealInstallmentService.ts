import { supabase } from '../lib/supabase';
import { PaymentInstallment } from '../types';
import { DealInstallmentRow, PublishReport, SettlementStatus } from '../types/dealInstallment';
import { isSystemProject } from '../utils/systemProjects';

/**
 * Série ÚNICA de parcelas do eixo comercial (`deal_installments`).
 *
 * Regra central: **salvar a negociação NÃO publica nada em Contas a Receber.**
 * O plano de pagamento persiste em qualquer status (inclusive Proposta /
 * IN_NEGOTIATION) e só vira recebível pelo botão "Enviar ao Contas a Receber",
 * que chama `publishToReceivables`. Ver migration 20270849000000.
 *
 * REGRA #2 (CLAUDE.md, seção de ESCRITA): parcela de comercial NÃO tem obra —
 * `project_id` só é carimbado quando o negócio está vinculado a uma obra real
 * (`linked_project_id`); o vault "Gestão Comercial" é projeto de sistema e vai
 * como null.
 *
 * REGRA #5: toda leitura aceita `organizationId` nulo ("Todas as organizações")
 * e simplesmente não aplica o filtro — quem filtra é a RLS.
 */

// ── Mapeamento banco ↔ app ─────────────────────────────────────────────────

type DbRow = Record<string, unknown>;

const fromDb = (r: DbRow): DealInstallmentRow => ({
    id: r.id as string,
    organizationId: r.organization_id as string,
    dealId: (r.deal_id as string) ?? null,
    proposalId: (r.proposal_id as string) ?? null,
    contractId: (r.contract_id as string) ?? null,
    source: (r.source as DealInstallmentRow['source']) || 'DEAL',
    sequence: Number(r.sequence ?? 0),
    dueDate: r.due_date as string,
    originalAmount: r.original_amount != null ? Number(r.original_amount) : null,
    discountType: (r.discount_type as DealInstallmentRow['discountType']) ?? null,
    discountAmount: r.discount_amount != null ? Number(r.discount_amount) : null,
    amount: Number(r.amount ?? 0),
    installmentType: (r.installment_type as string) ?? null,
    paymentType: (r.payment_type as string) ?? null,
    description: (r.description as string) ?? null,
    notes: (r.notes as string) ?? null,
    costCenterId: (r.cost_center_id as string) ?? null,
    planoDeContasId: (r.plano_de_contas_id as string) ?? null,
    publishedAt: (r.published_at as string) ?? null,
    publishedBy: (r.published_by as string) ?? null,
    unpublishedAt: (r.unpublished_at as string) ?? null,
    financialEntryId: (r.financial_entry_id as string) ?? null,
    referenceId: r.reference_id as string,
    settlementStatus: (r.settlement_status as SettlementStatus) || 'NAO_LANCADA',
    paidAt: (r.paid_at as string) ?? null,
    createdAt: (r.created_at as string) ?? undefined,
    updatedAt: (r.updated_at as string) ?? undefined,
});

const SELECT_COLS =
    'id,organization_id,deal_id,proposal_id,contract_id,source,sequence,due_date,' +
    'original_amount,discount_type,discount_amount,amount,installment_type,payment_type,' +
    'description,notes,cost_center_id,plano_de_contas_id,published_at,published_by,' +
    'unpublished_at,financial_entry_id,reference_id,settlement_status,paid_at,created_at,updated_at';

/** `deal_installments` → `PaymentInstallment` (formato que a UI e o espelho JSONB usam). */
export const toPaymentInstallment = (row: DealInstallmentRow): PaymentInstallment => ({
    id: row.id,
    dueDate: row.dueDate,
    value: row.amount,
    status: row.settlementStatus === 'RECEBIDA' ? 'PAID'
        : row.settlementStatus === 'CANCELADA' ? 'CANCELLED' : 'PENDING',
    description: row.description || '',
    paymentDate: row.paidAt ?? undefined,
    dealId: row.dealId ?? undefined,
    originalValue: row.originalAmount ?? undefined,
    discountType: row.discountType ?? undefined,
    discountAmount: row.discountAmount ?? undefined,
    paymentType: (row.paymentType as PaymentInstallment['paymentType']) ?? undefined,
    installmentType: row.installmentType ?? undefined,
    notes: row.notes ?? undefined,
    costCenterId: row.costCenterId,
    planoDeContasId: row.planoDeContasId,
});

export interface DealHeader {
    dealType?: 'SALE' | 'RENTAL' | 'SERVICE';
    date?: string;
    costCenterId?: string | null;
    planoDeContasId?: string | null;
    downPaymentPaymentType?: string | null;
    downPaymentInstallmentType?: string | null;
    downPaymentNotes?: string | null;
}

const emptyReport = (): PublishReport =>
    ({ published: 0, alreadyPublished: 0, removed: 0, blocked: [] });

/** Financeiro considera "dinheiro que já entrou" — nunca é apagado nem reescrito. */
const isSettled = (tx: { status?: string | null; business_status?: string | null }) =>
    tx.status === 'CONCILIATED' || ['RECEBIDO', 'PAGO'].includes(tx.business_status || '');

export const dealInstallmentService = {

    // ── Leitura ────────────────────────────────────────────────────────────

    async listByDeal(dealId: string, organizationId?: string | null): Promise<DealInstallmentRow[]> {
        if (!dealId) return [];
        let q = supabase.from('deal_installments').select(SELECT_COLS).eq('deal_id', dealId);
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q.order('sequence', { ascending: true });
        if (error) { console.error('[DEAL-INSTALLMENTS] listByDeal:', error); throw error; }
        return ((data || []) as unknown as DbRow[]).map(fromDb);
    },

    async listByProposal(proposalId: string, organizationId?: string | null): Promise<DealInstallmentRow[]> {
        if (!proposalId) return [];
        let q = supabase.from('deal_installments').select(SELECT_COLS).eq('proposal_id', proposalId);
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q.order('sequence', { ascending: true });
        if (error) { console.error('[DEAL-INSTALLMENTS] listByProposal:', error); throw error; }
        return ((data || []) as unknown as DbRow[]).map(fromDb);
    },

    /** Guard usado por `syncDealToFinance` para não republicar o que já migrou. */
    async hasRows(dealId: string): Promise<boolean> {
        if (!dealId) return false;
        const { count, error } = await supabase
            .from('deal_installments')
            .select('id', { count: 'exact', head: true })
            .eq('deal_id', dealId);
        if (error) { console.error('[DEAL-INSTALLMENTS] hasRows:', error); return false; }
        return (count || 0) > 0;
    },

    // ── Escrita do plano ───────────────────────────────────────────────────

    /**
     * Substitui a série do negócio pelo plano da tela. Diff-based: atualiza o que
     * existe, insere o que é novo e remove só o que ainda NÃO foi lançado —
     * parcela RECEBIDA nunca é apagada nem tem valor/vencimento reescritos
     * (estorno é no financeiro, não na negociação).
     *
     * A Entrada entra como `sequence 0`; `down_payment` continua espelhado na
     * `commercial_deals` para os leitores legados (contractService.createFromDeal,
     * PDF, BI) — ver COMMENT da coluna na migration 20270849000000.
     */
    async saveForDeal(
        dealId: string,
        organizationId: string,
        plan: PaymentInstallment[] | null | undefined,
        downPayment: number,
        header: DealHeader = {},
    ): Promise<DealInstallmentRow[]> {
        if (!dealId || !organizationId) return [];

        const existing = await this.listByDeal(dealId, organizationId);
        const byRef = new Map(existing.map(e => [e.referenceId, e]));
        const desiredRefs = new Set<string>();
        const rows: DbRow[] = [];

        const label = header.dealType === 'SALE' ? 'Venda' : 'Aluguel';

        if ((downPayment || 0) > 0) {
            const ref = `tx-${dealId}-dp`;
            desiredRefs.add(ref);
            rows.push({
                organization_id: organizationId, deal_id: dealId, source: 'DEAL',
                sequence: 0,
                due_date: header.date || new Date().toISOString().split('T')[0],
                amount: Number((downPayment || 0).toFixed(2)),
                installment_type: header.downPaymentInstallmentType || 'ENTRADA',
                payment_type: header.downPaymentPaymentType || null,
                description: `Receita: ${label} - Sinal (Entrada)`,
                notes: header.downPaymentNotes || null,
                cost_center_id: header.costCenterId ?? null,
                plano_de_contas_id: header.planoDeContasId ?? null,
                reference_id: ref,
            });
        }

        (plan || []).forEach((inst, idx) => {
            const ref = `tx-${dealId}-custom-p${idx + 1}`;
            desiredRefs.add(ref);
            rows.push({
                organization_id: organizationId, deal_id: dealId, source: 'DEAL',
                sequence: idx + 1,
                due_date: inst.dueDate,
                amount: Number((inst.value || 0).toFixed(2)),
                original_amount: inst.originalValue ?? null,
                discount_type: inst.discountType ?? null,
                discount_amount: inst.discountAmount ?? null,
                installment_type: inst.installmentType || 'MENSAL',
                payment_type: inst.paymentType || null,
                description: inst.description || `Parcela ${idx + 1}`,
                notes: inst.notes || null,
                cost_center_id: inst.costCenterId ?? header.costCenterId ?? null,
                plano_de_contas_id: inst.planoDeContasId ?? header.planoDeContasId ?? null,
                reference_id: ref,
            });
        });

        // Parcela já recebida não se altera pela negociação: preserva os campos
        // financeiros da linha existente e só deixa passar metadados.
        const payload = rows.map(r => {
            const prev = byRef.get(r.reference_id as string);
            if (prev && prev.settlementStatus === 'RECEBIDA') {
                return { ...r, due_date: prev.dueDate, amount: prev.amount };
            }
            return r;
        });

        if (payload.length > 0) {
            const { error } = await supabase
                .from('deal_installments')
                .upsert(payload, { onConflict: 'organization_id,reference_id' });
            if (error) { console.error('[DEAL-INSTALLMENTS] saveForDeal upsert:', error); throw error; }
        }

        // Sobras: parcelas que saíram do plano. Só as não lançadas somem — as
        // lançadas precisam ser removidas antes pelo botão "Remover do Contas a
        // Receber", senão viraria exclusão silenciosa de recebível.
        const orphans = existing.filter(e =>
            !desiredRefs.has(e.referenceId) && e.settlementStatus === 'NAO_LANCADA');
        if (orphans.length > 0) {
            const { error } = await supabase
                .from('deal_installments').delete().in('id', orphans.map(o => o.id));
            if (error) console.error('[DEAL-INSTALLMENTS] saveForDeal cleanup:', error);
        }

        return this.listByDeal(dealId, organizationId);
    },

    /**
     * Materializa a proposta do Portal do Corretor na MESMA tabela da negociação.
     *
     * `broker_portal_proposals` guarda um plano PARAMÉTRICO (entrada + N mensais
     * + balão) e um snapshot do motor em `payment_plan` — não uma lista. Aqui o
     * paramétrico vira lista, para que a proposta impressa, a tela pública e a
     * negociação que nascer dela mostrem exatamente as mesmas linhas.
     *
     * Proposta NUNCA nasce publicada: `published_at` fica nulo e não existe botão
     * de envio ao Contas a Receber na tela do corretor.
     */
    async saveForProposal(
        proposalId: string,
        organizationId: string,
        params: {
            downPayment?: number | null;
            monthlyInstallments?: number | null;
            monthlyValue?: number | null;
            balloonValue?: number | null;
            baseDate?: string | null;
        },
    ): Promise<void> {
        if (!proposalId || !organizationId) return;

        const base = params.baseDate ? new Date(params.baseDate) : new Date();
        const isoAt = (monthsAhead: number) => {
            const d = new Date(base);
            d.setMonth(d.getMonth() + monthsAhead);
            return d.toISOString().split('T')[0];
        };

        const rows: DbRow[] = [];
        const n = Math.max(0, Math.trunc(params.monthlyInstallments || 0));

        if ((params.downPayment || 0) > 0) {
            rows.push({
                organization_id: organizationId, proposal_id: proposalId, source: 'PROPOSAL',
                sequence: 0, due_date: isoAt(0),
                amount: Number((params.downPayment || 0).toFixed(2)),
                installment_type: 'ENTRADA', description: 'Entrada',
                reference_id: `prop-${proposalId}-dp`,
            });
        }
        for (let i = 1; i <= n; i++) {
            rows.push({
                organization_id: organizationId, proposal_id: proposalId, source: 'PROPOSAL',
                sequence: i, due_date: isoAt(i),
                amount: Number((params.monthlyValue || 0).toFixed(2)),
                installment_type: 'MENSAL', description: `Parcela ${i}/${n}`,
                reference_id: `prop-${proposalId}-p${i}`,
            });
        }
        if ((params.balloonValue || 0) > 0) {
            rows.push({
                organization_id: organizationId, proposal_id: proposalId, source: 'PROPOSAL',
                sequence: n + 1, due_date: isoAt(n + 1),
                amount: Number((params.balloonValue || 0).toFixed(2)),
                installment_type: 'AVULSA', description: 'Balão',
                reference_id: `prop-${proposalId}-balloon`,
            });
        }

        // Revisão da proposta pode encurtar o plano: some o que saiu.
        const desired = new Set(rows.map(r => r.reference_id as string));
        const existing = await this.listByProposal(proposalId, organizationId);
        const orphans = existing.filter(e => !desired.has(e.referenceId) && !e.publishedAt);
        if (orphans.length > 0) {
            await supabase.from('deal_installments').delete().in('id', orphans.map(o => o.id));
        }

        if (rows.length === 0) return;
        const { error } = await supabase
            .from('deal_installments')
            .upsert(rows, { onConflict: 'organization_id,reference_id' });
        if (error) console.error('[DEAL-INSTALLMENTS] saveForProposal:', error);
    },

    async upsertOne(row: Partial<DealInstallmentRow> & { id: string }): Promise<void> {
        const patch: DbRow = {};
        if (row.dueDate !== undefined) patch.due_date = row.dueDate;
        if (row.amount !== undefined) patch.amount = row.amount;
        if (row.originalAmount !== undefined) patch.original_amount = row.originalAmount;
        if (row.discountType !== undefined) patch.discount_type = row.discountType;
        if (row.discountAmount !== undefined) patch.discount_amount = row.discountAmount;
        if (row.installmentType !== undefined) patch.installment_type = row.installmentType;
        if (row.paymentType !== undefined) patch.payment_type = row.paymentType;
        if (row.description !== undefined) patch.description = row.description;
        if (row.notes !== undefined) patch.notes = row.notes;
        if (Object.keys(patch).length === 0) return;
        const { error } = await supabase.from('deal_installments').update(patch).eq('id', row.id);
        if (error) { console.error('[DEAL-INSTALLMENTS] upsertOne:', error); throw error; }
    },

    async removeOne(id: string): Promise<void> {
        const { data } = await supabase
            .from('deal_installments').select('settlement_status').eq('id', id).maybeSingle();
        if (data?.settlement_status === 'RECEBIDA') {
            throw new Error('Parcela já recebida — estorne no Contas a Receber antes de excluir.');
        }
        const { error } = await supabase.from('deal_installments').delete().eq('id', id);
        if (error) { console.error('[DEAL-INSTALLMENTS] removeOne:', error); throw error; }
    },

    // ── Publicação em Contas a Receber ─────────────────────────────────────

    /**
     * Materializa as parcelas em `internal_transactions` (Contas a Receber).
     * Idempotente: o upsert casa por (organization_id, reference_id, entry_type),
     * então clicar duas vezes não duplica.
     */
    async publishToReceivables(
        dealId: string,
        organizationId: string,
        opts: { onlyIds?: string[] } = {},
    ): Promise<PublishReport> {
        const report = emptyReport();
        if (!dealId || !organizationId) return report;

        const all = await this.listByDeal(dealId, organizationId);
        const alvo = opts.onlyIds?.length ? all.filter(r => opts.onlyIds!.includes(r.id)) : all;
        if (alvo.length === 0) return report;

        const ctx = await this.buildDealContext(dealId, organizationId);

        const txs = alvo
            .filter(r => {
                if (r.settlementStatus === 'RECEBIDA') { report.alreadyPublished++; return false; }
                if (r.publishedAt) report.alreadyPublished++;
                return true;
            })
            .map(r => ({
                organization_id: organizationId,
                source_system: ctx.sourceSystem,
                reference_id: r.referenceId,
                // REGRA #2 — parcela de comercial não tem obra; só negócio
                // vinculado a uma obra REAL carimba project_id.
                project_id: ctx.projectId,
                transaction_date: r.dueDate,
                due_date: r.dueDate,
                amount: r.amount,
                original_amount: r.originalAmount,
                discount_type: r.discountType,
                discount_amount: r.discountAmount,
                installment_type: r.installmentType,
                payment_type: r.paymentType,
                direction: 'CREDIT',
                description: r.description || `Parcela ${r.sequence}`,
                entity_name: ctx.clientName,
                party_name: ctx.clientName,
                party_id: ctx.clientId,
                party_type: 'CLIENT',
                cost_center_id: r.costCenterId,
                plano_de_contas_id: r.planoDeContasId,
                status: 'PENDING',
                business_status: 'PREVISTO',
            }));

        if (txs.length === 0) return report;

        const { data: inserted, error } = await supabase
            .from('internal_transactions')
            .upsert(txs, { onConflict: 'organization_id,reference_id,entry_type' })
            .select('id, reference_id');
        if (error) { console.error('[DEAL-INSTALLMENTS] publish:', error); throw error; }

        const idByRef = new Map((inserted || []).map(t => [t.reference_id as string, t.id as string]));
        const { data: authData } = await supabase.auth.getUser();
        const now = new Date().toISOString();

        for (const r of alvo) {
            if (r.settlementStatus === 'RECEBIDA') continue;
            const entryId = idByRef.get(r.referenceId);
            if (!entryId) continue;
            const { error: upErr } = await supabase.from('deal_installments').update({
                published_at: r.publishedAt || now,
                published_by: authData?.user?.id ?? null,
                unpublished_at: null,
                financial_entry_id: entryId,
                settlement_status: 'LANCADA',
            }).eq('id', r.id);
            if (upErr) console.error('[DEAL-INSTALLMENTS] publish mark:', upErr);
            else if (!r.publishedAt) report.published++;
        }

        return report;
    },

    /**
     * Contrapartida do botão de envio. Nunca apaga dinheiro que entrou: parcela
     * conciliada/recebida fica em Contas a Receber e volta NOMEADA em `blocked`,
     * para o toast dizer QUAL foi preservada.
     */
    async unpublishFromReceivables(
        dealId: string,
        organizationId: string,
        opts: { onlyIds?: string[] } = {},
    ): Promise<PublishReport> {
        const report = emptyReport();
        if (!dealId || !organizationId) return report;

        const all = await this.listByDeal(dealId, organizationId);
        const alvo = (opts.onlyIds?.length ? all.filter(r => opts.onlyIds!.includes(r.id)) : all)
            .filter(r => r.publishedAt || r.financialEntryId);
        if (alvo.length === 0) return report;

        const refs = alvo.map(r => r.referenceId);
        const { data: entries, error } = await supabase
            .from('internal_transactions')
            .select('id, reference_id, status, business_status, description')
            .eq('organization_id', organizationId)
            .in('reference_id', refs);
        if (error) { console.error('[DEAL-INSTALLMENTS] unpublish read:', error); throw error; }

        const removableIds: string[] = [];
        const releaseIds: string[] = [];

        for (const r of alvo) {
            const tx = (entries || []).find(e => e.reference_id === r.referenceId);
            if (tx && isSettled(tx)) {
                report.blocked.push({
                    id: r.id,
                    description: r.description || `Parcela ${r.sequence}`,
                    reason: tx.status === 'CONCILIATED' ? 'CONCILIADA' : 'RECEBIDA',
                });
                continue;
            }
            if (tx) removableIds.push(tx.id as string);
            releaseIds.push(r.id);
        }

        if (removableIds.length > 0) {
            const { error: delErr } = await supabase
                .from('internal_transactions').delete().in('id', removableIds);
            if (delErr) { console.error('[DEAL-INSTALLMENTS] unpublish delete:', delErr); throw delErr; }
            report.removed = removableIds.length;
        }

        if (releaseIds.length > 0) {
            const { error: upErr } = await supabase.from('deal_installments').update({
                published_at: null,
                financial_entry_id: null,
                unpublished_at: new Date().toISOString(),
                settlement_status: 'NAO_LANCADA',
            }).in('id', releaseIds);
            if (upErr) console.error('[DEAL-INSTALLMENTS] unpublish mark:', upErr);
        }

        return report;
    },

    /**
     * Traz de volta o estado do financeiro (baixa/conciliação feita em Contas a
     * Receber ou pelo webhook do Asaas). Chamado ao abrir a aba Parcelas — sem
     * isto a coluna Situação mostraria "Lançada" para parcela já recebida.
     */
    async refreshSettlementStatus(dealId: string, organizationId: string): Promise<void> {
        const rows = await this.listByDeal(dealId, organizationId);
        const published = rows.filter(r => r.publishedAt || r.financialEntryId);
        if (published.length === 0) return;

        const { data: entries, error } = await supabase
            .from('internal_transactions')
            // `internal_transactions` não tem coluna de data de pagamento — a
            // baixa só muda status/business_status. `updated_at` é a melhor
            // aproximação disponível para "quando foi recebida".
            .select('id, reference_id, status, business_status, updated_at')
            .eq('organization_id', organizationId)
            .in('reference_id', published.map(r => r.referenceId));
        if (error) { console.error('[DEAL-INSTALLMENTS] refresh:', error); return; }

        for (const r of published) {
            const tx = (entries || []).find(e => e.reference_id === r.referenceId);
            let next: SettlementStatus;
            if (!tx) next = 'NAO_LANCADA';
            else if (tx.status === 'CANCELLED') next = 'CANCELADA';
            else if (isSettled(tx)) next = 'RECEBIDA';
            else next = 'LANCADA';

            const paidAt = tx?.updated_at ? String(tx.updated_at).split('T')[0] : null;
            if (next === r.settlementStatus && paidAt === r.paidAt) continue;

            await supabase.from('deal_installments').update({
                settlement_status: next,
                paid_at: next === 'RECEBIDA' ? paidAt : null,
                ...(next === 'NAO_LANCADA' ? { published_at: null, financial_entry_id: null } : {}),
            }).eq('id', r.id);
        }
    },

    // ── Ciclo proposta → negociação ────────────────────────────────────────

    /**
     * Proposta aprovada vira negociação SEM reescrever as parcelas: a mesma
     * linha só troca de dono. É o que garante que o cliente veja em Contas a
     * Receber exatamente a série que assinou na proposta.
     */
    async attachProposalToDeal(proposalId: string, dealId: string, organizationId?: string | null): Promise<void> {
        if (!proposalId || !dealId) return;
        let q = supabase.from('deal_installments')
            .update({ deal_id: dealId, source: 'DEAL' })
            .eq('proposal_id', proposalId)
            .is('deal_id', null);
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { error } = await q;
        if (error) console.error('[DEAL-INSTALLMENTS] attachProposalToDeal:', error);
    },

    /**
     * Registra na série única as parcelas que um CONTRATO já lançou em Contas a
     * Receber (`CONTRACT_RECURRING` / `_PARCELADO` / `_AVISTA`).
     *
     * É ADITIVO de propósito: o motor de faturamento do contrato continua
     * exatamente como está — ele também serve Suprimentos/Contas a Pagar, e
     * reescrevê-lo para gravar aqui seria risco sem retorno. O que muda é que a
     * parcela passa a EXISTIR também na série única, com `published_at` já
     * preenchido (contrato assinado fatura na hora — comportamento correto e que
     * ninguém questionou), para a aba Parcelas ler UMA tabela só.
     *
     * Só vale para o eixo comercial (LOCACAO/VENDAS). Contrato de Suprimentos é
     * Contas a Pagar e não tem negociação por trás.
     */
    async registerContractEntries(contract: {
        id: string; organization_id?: string | null; deal_id?: string | null;
        parent_contract_id?: string | null; domain?: string | null; number?: string | null;
    }): Promise<void> {
        const orgId = contract?.organization_id;
        if (!contract?.id || !orgId) return;
        if (contract.domain && !['LOCACAO', 'VENDAS'].includes(contract.domain)) return;

        // Renovação cria contrato-FILHO que não herda deal_id (só
        // parent_contract_id) — sobe a cadeia até achar a negociação de origem.
        let dealId = contract.deal_id ?? null;
        let parent = contract.parent_contract_id ?? null;
        for (let i = 0; !dealId && parent && i < 10; i++) {
            const { data } = await supabase
                .from('contracts').select('deal_id, parent_contract_id').eq('id', parent).maybeSingle();
            if (!data) break;
            dealId = (data.deal_id as string) ?? null;
            parent = (data.parent_contract_id as string) ?? null;
        }
        if (!dealId) return; // contrato sem negociação: nada a unificar

        const { data: entries, error } = await supabase
            .from('internal_transactions')
            .select('id, reference_id, transaction_date, due_date, amount, description, status, business_status, original_amount, discount_type, discount_amount, installment_type, payment_type, cost_center_id, plano_de_contas_id')
            .eq('organization_id', orgId)
            .in('source_system', ['CONTRACT_RECURRING', 'CONTRACT_PARCELADO', 'CONTRACT_AVISTA'])
            .like('reference_id', `${contract.id}%`);
        if (error) { console.error('[DEAL-INSTALLMENTS] registerContractEntries read:', error); return; }
        if (!entries || entries.length === 0) return;

        const ordenadas = [...entries].sort((a, b) =>
            String(a.due_date || a.transaction_date).localeCompare(String(b.due_date || b.transaction_date)));

        const rows: DbRow[] = ordenadas.map((e, i) => ({
            organization_id: orgId,
            deal_id: dealId,
            contract_id: contract.id,
            source: 'CONTRACT_RENEWAL',
            // Continua a numeração depois do plano da negociação, para a série
            // única ficar em ordem cronológica na tela.
            sequence: 1000 + i,
            due_date: e.due_date || e.transaction_date,
            amount: Number(e.amount ?? 0),
            original_amount: e.original_amount ?? null,
            discount_type: e.discount_type ?? null,
            discount_amount: e.discount_amount ?? null,
            installment_type: e.installment_type ?? null,
            payment_type: e.payment_type ?? null,
            description: e.description ?? null,
            cost_center_id: e.cost_center_id ?? null,
            plano_de_contas_id: e.plano_de_contas_id ?? null,
            reference_id: e.reference_id as string,
            financial_entry_id: e.id as string,
            published_at: new Date().toISOString(),
            settlement_status: isSettled(e) ? 'RECEBIDA' : 'LANCADA',
        }));

        const { error: upErr } = await supabase
            .from('deal_installments')
            .upsert(rows, { onConflict: 'organization_id,reference_id' });
        if (upErr) console.error('[DEAL-INSTALLMENTS] registerContractEntries upsert:', upErr);
    },

    /** Distrato/exclusão: tira do financeiro o que der e marca o resto. */
    async cancelForDeal(dealId: string, organizationId: string): Promise<PublishReport> {
        const report = await this.unpublishFromReceivables(dealId, organizationId);
        await supabase.from('deal_installments')
            .update({ settlement_status: 'CANCELADA' })
            .eq('deal_id', dealId)
            .eq('organization_id', organizationId)
            .neq('settlement_status', 'RECEBIDA');
        return report;
    },

    // ── Interno ────────────────────────────────────────────────────────────

    /**
     * Cliente e dimensão obra do negócio. Mesma decisão de `financialSyncService`:
     * projeto de sistema (vault "Gestão Comercial") nunca vira project_id, e
     * `source_system='COMMERCIAL'` isenta o lançamento do hard-lock de período.
     */
    async buildDealContext(dealId: string, organizationId: string) {
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
