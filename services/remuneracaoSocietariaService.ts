import { supabase } from '../lib/supabase';
import { fiscalService } from './fiscalService';
import { payrollEngine } from './payrollEngine';
import { documentService } from './documentService';
import { supplierService } from './supplierService';
import { companyService } from './companyService';
import { getOrgTerceirosTaxes } from './payrollService';
import { calculateIRRF } from '../lib/payrollCalc';
import {
    PartnerCompensationSettings, PartnerCompensationSettingsUpsert,
    ProlaborePayroll, ProlaborePayrollItem,
    ProfitDistributionBatch, ProfitDistributionItem,
} from '../types';
import { CompanyPartner } from '../types';

const PARTNER_SUPPLIER_CATEGORY = 'Sócio';

export interface ProlaboreCalcResult {
    partner_id: string;
    gross_amount: number;
    inss_amount: number;
    irrf_amount: number;
    net_amount: number;
    patronal_amount: number;
    terceiros_amount: number;
}

export interface ProlaboreInssRule {
    rate: number;          // INSS do sócio (contribuinte individual) — alíquota fixa
    teto: number;           // teto do salário de contribuição
    patronal_rate: number;  // Cota Patronal — só incide se empresa não for Simples Nacional
}

export const remuneracaoSocietariaService = {
    // ─── Regime de remuneração por sócio ───────────────────────

    async listCompensationSettings(companyId: string): Promise<PartnerCompensationSettings[]> {
        const { data, error } = await supabase
            .from('partner_compensation_settings')
            .select('*')
            .eq('company_id', companyId);
        if (error) throw error;
        return (data || []) as PartnerCompensationSettings[];
    },

    async saveCompensationSettings(payload: PartnerCompensationSettingsUpsert & { id?: string }): Promise<PartnerCompensationSettings> {
        if (payload.id) {
            const { id, ...rest } = payload;
            const { data, error } = await supabase
                .from('partner_compensation_settings')
                .update(rest)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data as PartnerCompensationSettings;
        }
        const { data, error } = await supabase
            .from('partner_compensation_settings')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return data as PartnerCompensationSettings;
    },

    // ─── Cálculo de pró-labore ──────────────────────────────────
    // Sócio-administrador é CONTRIBUINTE INDIVIDUAL perante o INSS — alíquota
    // FIXA (não a tabela progressiva de empregado CLT), limitada ao teto do
    // salário de contribuição, sem parcela a deduzir. FGTS nunca incide.
    // IRRF usa a mesma tabela progressiva de qualquer remuneração (reaproveitada
    // de lib/payrollCalc; applyIRRFReducer do payrollEngine cobre o redutor 2026+).
    // Cota Patronal (20%) é despesa da empresa — não desconta do líquido do
    // sócio — e só incide se a empresa NÃO for optante do Simples Nacional.
    // Contribuições de Terceiros (Sistema S) incidem sobre a MESMA base da
    // Cota Patronal, inclusive sobre pró-labore — reusa a config por
    // organização já usada na folha CLT (payrollService.getOrgTerceirosTaxes),
    // sem duplicar a alíquota.

    async getProlaboreInssRule(competenceDate: string): Promise<ProlaboreInssRule> {
        const { data, error } = await supabase
            .from('prolabore_inss_rules')
            .select('rate, teto, patronal_rate')
            .lte('valid_from', competenceDate)
            .or(`valid_to.is.null,valid_to.gte.${competenceDate.slice(0, 10)}`)
            .order('valid_from', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Regra de INSS do pró-labore não configurada para esta competência (prolabore_inss_rules).');
        return data as ProlaboreInssRule;
    },

    async calculateProlabore(grossAmount: number, competenceDate: string, regimeTributario?: string, organizationId?: string): Promise<ProlaboreCalcResult> {
        const [rule, irrfBrackets] = await Promise.all([
            this.getProlaboreInssRule(competenceDate),
            fiscalService.getIRRFBrackets(competenceDate),
        ]);

        const baseInss = Math.min(grossAmount, rule.teto);
        const inss = baseInss * rule.rate;

        const irrfBase = grossAmount - inss;
        const rawIrrf = calculateIRRF(irrfBase, irrfBrackets);
        const year = parseInt(competenceDate.slice(0, 4), 10);
        const irrf = year >= 2026 ? payrollEngine.applyIRRFReducer(rawIrrf, irrfBase) : rawIrrf;

        const isento = regimeTributario === 'simples';
        const patronal = isento ? 0 : baseInss * rule.patronal_rate;
        const terceiroTotalRate = organizationId
            ? getOrgTerceirosTaxes(organizationId).reduce((s, t) => s + t.rate, 0)
            : 0;
        const terceiros = isento ? 0 : baseInss * terceiroTotalRate;

        return {
            partner_id: '',
            gross_amount: grossAmount,
            inss_amount: Math.round(inss * 100) / 100,
            irrf_amount: Math.round(irrf * 100) / 100,
            net_amount: Math.round((grossAmount - inss - irrf) * 100) / 100,
            patronal_amount: Math.round(patronal * 100) / 100,
            terceiros_amount: Math.round(terceiros * 100) / 100,
        };
    },

    // ─── Folha de pró-labore mensal ─────────────────────────────

    /** Leitura pura — usado por telas de relatório (ex.: Encargos Sociais) que não devem criar rascunho. */
    async getPayrollByCompetence(companyId: string, competenceMonth: string): Promise<ProlaborePayroll | null> {
        const { data, error } = await supabase
            .from('prolabore_payrolls')
            .select('*')
            .eq('company_id', companyId)
            .eq('competence_month', competenceMonth)
            .maybeSingle();
        if (error) throw error;
        return data as ProlaborePayroll | null;
    },

    async getOrCreatePayroll(organizationId: string, companyId: string, competenceMonth: string): Promise<ProlaborePayroll> {
        const { data: existing, error: findError } = await supabase
            .from('prolabore_payrolls')
            .select('*')
            .eq('company_id', companyId)
            .eq('competence_month', competenceMonth)
            .maybeSingle();
        if (findError) throw findError;
        if (existing) return existing as ProlaborePayroll;

        const { data, error } = await supabase
            .from('prolabore_payrolls')
            .insert({ organization_id: organizationId, company_id: companyId, competence_month: competenceMonth, status: 'rascunho' })
            .select()
            .single();
        if (error) throw error;
        return data as ProlaborePayroll;
    },

    async listPayrolls(companyId: string): Promise<ProlaborePayroll[]> {
        const { data, error } = await supabase
            .from('prolabore_payrolls')
            .select('*')
            .eq('company_id', companyId)
            .order('competence_month', { ascending: false });
        if (error) throw error;
        return (data || []) as ProlaborePayroll[];
    },

    async listPayrollItems(payrollId: string): Promise<ProlaborePayrollItem[]> {
        const { data, error } = await supabase
            .from('prolabore_payroll_items')
            .select('*, partner:company_partners(nome, documento, tipo_pessoa)')
            .eq('payroll_id', payrollId);
        if (error) throw error;
        return (data || []).map((i: any) => ({
            ...i,
            partner_nome: i.partner?.nome,
            partner_documento: i.partner?.documento,
            partner_tipo_pessoa: i.partner?.tipo_pessoa,
        })) as ProlaborePayrollItem[];
    },

    /**
     * Localiza (ou cria) o fornecedor que representa o sócio no Financeiro —
     * pró-labore/dividendos não têm "supplier_id" próprio, mas a tela de
     * Contas a Pagar (ContasPagarManager) só lê a tabela `invoices`, que exige
     * um supplier_id. Reusa por documento (ou nome, se PF sem documento
     * cadastrado) para não duplicar a cada envio.
     */
    async getOrCreatePartnerSupplier(organizationId: string, partner: { nome: string; documento?: string; tipo_pessoa?: 'pf' | 'pj' }): Promise<string> {
        let query = supabase
            .from('suppliers')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('category', PARTNER_SUPPLIER_CATEGORY);
        query = partner.documento ? query.eq('document', partner.documento) : query.eq('name', partner.nome);
        const { data: existing, error: findError } = await query.maybeSingle();
        if (findError) throw findError;
        if (existing) return existing.id;

        const created = await supplierService.addSupplier({
            name: partner.nome,
            document: partner.documento,
            type: partner.tipo_pessoa === 'pj' ? 'PJ' : 'PF',
            category: PARTNER_SUPPLIER_CATEGORY,
            organization_id: organizationId,
        });
        return created.id;
    },

    /** Marcador único gravado em invoices.notes para não duplicar o título num reenvio/sincronização. */
    invoiceMarker(kind: 'prolabore' | 'dividendo', itemId: string): string {
        return `[${kind}_item:${itemId}]`;
    },

    async invoiceExistsForItem(kind: 'prolabore' | 'dividendo', itemId: string): Promise<boolean> {
        const { data, error } = await supabase
            .from('invoices')
            .select('id')
            .ilike('notes', `%${this.invoiceMarker(kind, itemId)}%`)
            .maybeSingle();
        if (error) throw error;
        return !!data;
    },

    /**
     * Cria o título em `invoices` para um item já pago (mesma lógica de
     * sendPayrollToFinancial/sendProfitBatchToFinancial), sem tocar em
     * internal_transactions nem no status do item — usado tanto no envio
     * normal quanto na sincronização retroativa (§ backfill abaixo).
     */
    async createInvoiceForItem(organizationId: string, params: {
        kind: 'prolabore' | 'dividendo';
        itemId: string;
        partnerNome: string;
        partnerDocumento?: string;
        partnerTipoPessoa?: 'pf' | 'pj';
        amount: number;
        dueDate: string;
        fileName: string;
    }): Promise<void> {
        const supplierId = await this.getOrCreatePartnerSupplier(organizationId, {
            nome: params.partnerNome || 'Sócio',
            documento: params.partnerDocumento,
            tipo_pessoa: params.partnerTipoPessoa,
        });
        const { error } = await supabase
            .from('invoices')
            .insert({
                supplier_id: supplierId,
                file_path: 'internal://remuneracao-societaria',
                file_name: params.fileName,
                amount: params.amount,
                due_date: params.dueDate,
                status: 'approved',
                notes: this.invoiceMarker(params.kind, params.itemId),
            });
        if (error) throw error;
    },

    /**
     * Backfill: gera o título em Contas a Pagar para itens que já foram
     * enviados ao financeiro ANTES da integração com `invoices` existir
     * (ficaram com status 'pago'/'contabilizado' mas sem título). Idempotente
     * — pula itens que já têm invoice pelo marcador único.
     */
    async syncPayrollInvoices(organizationId: string, payroll: ProlaborePayroll, items: ProlaborePayrollItem[]): Promise<number> {
        let created = 0;
        for (const item of items) {
            if (item.status !== 'pago' && item.status !== 'contabilizado') continue;
            if (await this.invoiceExistsForItem('prolabore', item.id)) continue;
            await this.createInvoiceForItem(organizationId, {
                kind: 'prolabore',
                itemId: item.id,
                partnerNome: item.partner_nome || 'Sócio',
                partnerDocumento: item.partner_documento,
                partnerTipoPessoa: item.partner_tipo_pessoa,
                amount: item.net_amount,
                dueDate: payroll.competence_month,
                fileName: `Pró-labore ${payroll.competence_month.slice(0, 7)}`,
            });
            created++;
        }
        return created;
    },

    async syncProfitBatchInvoices(organizationId: string, batch: ProfitDistributionBatch, items: ProfitDistributionItem[]): Promise<number> {
        const dueDate = batch.payment_date || new Date().toISOString().slice(0, 10);
        let created = 0;
        for (const item of items) {
            if (item.status !== 'pago' && item.status !== 'contabilizado') continue;
            if (await this.invoiceExistsForItem('dividendo', item.id)) continue;
            await this.createInvoiceForItem(organizationId, {
                kind: 'dividendo',
                itemId: item.id,
                partnerNome: item.partner_nome || 'Sócio',
                partnerDocumento: item.partner_documento,
                partnerTipoPessoa: item.partner_tipo_pessoa,
                amount: item.net_amount,
                dueDate,
                fileName: `Dividendos ${batch.profit_period_start.slice(0, 7)}-${batch.profit_period_end.slice(0, 7)}`,
            });
            created++;
        }
        return created;
    },

    /**
     * Recalcula a folha inteira a partir dos sócios com has_prolabore=true.
     * Substitui os itens existentes (folha ainda em rascunho/calculado).
     * Só é permitido nesses dois status: uma vez aprovada/enviada, os itens
     * mudam de status (aprovado/pago) e não são apagados pelo delete abaixo —
     * recalcular por cima geraria conflito de chave única (payroll_id, partner_id).
     */
    async recalculatePayroll(payroll: ProlaborePayroll, settingsList: PartnerCompensationSettings[]): Promise<ProlaborePayrollItem[]> {
        if (payroll.status !== 'rascunho' && payroll.status !== 'calculado') {
            throw new Error('Esta folha já foi aprovada ou enviada ao financeiro e não pode ser recalculada. Escolha outra competência.');
        }

        const active = settingsList.filter(s => s.has_prolabore && s.prolabore_amount && s.prolabore_amount > 0);
        const company = await companyService.get(payroll.company_id);

        const items: Omit<ProlaborePayrollItem, 'id' | 'created_at' | 'updated_at'>[] = [];
        for (const s of active) {
            const calc = await this.calculateProlabore(s.prolabore_amount!, payroll.competence_month, company.regime_tributario, payroll.organization_id);
            items.push({
                payroll_id: payroll.id,
                partner_id: s.partner_id,
                gross_amount: calc.gross_amount,
                inss_amount: calc.inss_amount,
                irrf_amount: calc.irrf_amount,
                net_amount: calc.net_amount,
                patronal_amount: calc.patronal_amount,
                terceiros_amount: calc.terceiros_amount,
                cost_center_id: s.cost_center_id,
                status: 'calculado',
            });
        }

        await supabase.from('prolabore_payroll_items').delete().eq('payroll_id', payroll.id).in('status', ['calculado']);
        if (items.length > 0) {
            const { error } = await supabase.from('prolabore_payroll_items').insert(items);
            if (error) throw error;
        }

        const totals = items.reduce((acc, i) => ({
            gross: acc.gross + i.gross_amount,
            inss: acc.inss + i.inss_amount,
            irrf: acc.irrf + i.irrf_amount,
            net: acc.net + i.net_amount,
            patronal: acc.patronal + i.patronal_amount,
            terceiros: acc.terceiros + i.terceiros_amount,
        }), { gross: 0, inss: 0, irrf: 0, net: 0, patronal: 0, terceiros: 0 });

        const { error: updError } = await supabase
            .from('prolabore_payrolls')
            .update({
                status: items.length > 0 ? 'calculado' : 'rascunho',
                gross_total: totals.gross,
                inss_total: totals.inss,
                irrf_total: totals.irrf,
                net_total: totals.net,
                patronal_total: totals.patronal,
                terceiros_total: totals.terceiros,
            })
            .eq('id', payroll.id);
        if (updError) throw updError;

        return this.listPayrollItems(payroll.id);
    },

    async approvePayroll(payrollId: string, approvedByEmail: string): Promise<void> {
        const { error } = await supabase
            .from('prolabore_payrolls')
            .update({ status: 'aprovado', approved_by_email: approvedByEmail, approved_at: new Date().toISOString() })
            .eq('id', payrollId);
        if (error) throw error;
        await supabase.from('prolabore_payroll_items').update({ status: 'aprovado' }).eq('payroll_id', payrollId);
    },

    /**
     * Envia ao financeiro: gera um internal_transactions (DEBIT, ledger/DRE) +
     * um título em `invoices` (o que a tela Contas a Pagar de fato lista) por
     * item aprovado, e marca o item como 'pago'.
     */
    async sendPayrollToFinancial(organizationId: string, payroll: ProlaborePayroll, items: ProlaborePayrollItem[]): Promise<void> {
        for (const item of items) {
            const { data: tx, error: txError } = await supabase
                .from('internal_transactions')
                .insert({
                    organization_id: organizationId,
                    source_system: 'PROLABORE',
                    reference_id: item.id,
                    transaction_date: payroll.competence_month,
                    amount: item.net_amount,
                    direction: 'DEBIT',
                    description: `Pró-labore ${payroll.competence_month.slice(0, 7)}`,
                    category: 'Pró-labore',
                    status: 'PENDING',
                })
                .select()
                .single();
            if (txError) throw txError;

            await this.createInvoiceForItem(organizationId, {
                kind: 'prolabore',
                itemId: item.id,
                partnerNome: item.partner_nome || 'Sócio',
                partnerDocumento: item.partner_documento,
                partnerTipoPessoa: item.partner_tipo_pessoa,
                amount: item.net_amount,
                dueDate: payroll.competence_month,
                fileName: `Pró-labore ${payroll.competence_month.slice(0, 7)}`,
            });

            const { error: itemError } = await supabase
                .from('prolabore_payroll_items')
                .update({ financial_entry_id: tx.id, status: 'pago' })
                .eq('id', item.id);
            if (itemError) throw itemError;
        }

        // Cota Patronal + Contribuições de Terceiros: despesas da empresa
        // perante o INSS/Sistema S (guia única, não é pagamento a um
        // "fornecedor" — não gera invoice, só o lançamento contábil/DRE).
        // Uma linha por folha para cada, cobrindo todos os sócios.
        if (payroll.patronal_total > 0) {
            const { error: patronalError } = await supabase
                .from('internal_transactions')
                .insert({
                    organization_id: organizationId,
                    source_system: 'PROLABORE',
                    reference_id: payroll.id,
                    transaction_date: payroll.competence_month,
                    amount: payroll.patronal_total,
                    direction: 'DEBIT',
                    description: `INSS Patronal s/ Pró-labore ${payroll.competence_month.slice(0, 7)}`,
                    category: 'INSS Patronal (Pró-labore)',
                    status: 'PENDING',
                });
            if (patronalError) throw patronalError;
        }

        if (payroll.terceiros_total > 0) {
            const { error: terceirosError } = await supabase
                .from('internal_transactions')
                .insert({
                    organization_id: organizationId,
                    source_system: 'PROLABORE',
                    reference_id: payroll.id,
                    transaction_date: payroll.competence_month,
                    amount: payroll.terceiros_total,
                    direction: 'DEBIT',
                    description: `Contribuições de Terceiros s/ Pró-labore ${payroll.competence_month.slice(0, 7)}`,
                    category: 'Contribuições de Terceiros (Pró-labore)',
                    status: 'PENDING',
                });
            if (terceirosError) throw terceirosError;
        }

        const { error } = await supabase
            .from('prolabore_payrolls')
            .update({ status: 'enviado_financeiro' })
            .eq('id', payroll.id);
        if (error) throw error;
    },

    // ─── Distribuição de lucros e dividendos ────────────────────
    // MVP: available_profit_amount é entrada manual + ata anexada (Controladoria
    // Fase 3 — partida dobrada/balanço — ainda não existe). withholding_tax_amount
    // de cada item é calculado pelo trigger fn_dividend_withholding_recalc no banco
    // (agregador mensal por company+partner) — o service não recalcula isso no client.

    async listProfitBatches(companyId: string): Promise<ProfitDistributionBatch[]> {
        const { data, error } = await supabase
            .from('profit_distribution_batches')
            .select('*')
            .eq('company_id', companyId)
            .order('profit_period_end', { ascending: false });
        if (error) throw error;
        return (data || []) as ProfitDistributionBatch[];
    },

    async listBatchItems(batchId: string): Promise<ProfitDistributionItem[]> {
        const { data, error } = await supabase
            .from('profit_distribution_items')
            .select('*, partner:company_partners(nome, documento, tipo_pessoa)')
            .eq('batch_id', batchId);
        if (error) throw error;
        return (data || []).map((i: any) => ({
            ...i,
            partner_nome: i.partner?.nome,
            partner_documento: i.partner?.documento,
            partner_tipo_pessoa: i.partner?.tipo_pessoa,
        })) as ProfitDistributionItem[];
    },

    /**
     * Cria o lote e distribui `proposedAmount` proporcionalmente entre os sócios
     * elegíveis (regime_remuneracao IN dividendos/ambos), pela participacao_pct.
     */
    async createProfitBatch(params: {
        organizationId: string;
        companyId: string;
        periodStart: string;
        periodEnd: string;
        accountingProfitAmount?: number;
        availableProfitAmount: number;
        proposedAmount: number;
        createdByEmail: string;
    }): Promise<{ batch: ProfitDistributionBatch; items: ProfitDistributionItem[] }> {
        if (params.proposedAmount > params.availableProfitAmount) {
            throw new Error('O valor proposto não pode ultrapassar o lucro disponível informado.');
        }

        const eligible = (await this.listEligiblePartners(params.companyId))
            .filter(p => p.regime_remuneracao === 'dividendos' || p.regime_remuneracao === 'ambos');
        if (eligible.length === 0) {
            throw new Error('Nenhum sócio está configurado para receber dividendos (regime de remuneração).');
        }
        const totalPct = eligible.reduce((s, p) => s + p.participacao_pct, 0);
        if (totalPct <= 0) {
            throw new Error('Participação societária dos sócios elegíveis soma zero.');
        }

        const { data: batch, error: batchError } = await supabase
            .from('profit_distribution_batches')
            .insert({
                organization_id: params.organizationId,
                company_id: params.companyId,
                profit_period_start: params.periodStart,
                profit_period_end: params.periodEnd,
                accounting_profit_amount: params.accountingProfitAmount,
                available_profit_amount: params.availableProfitAmount,
                proposed_amount: params.proposedAmount,
                distribution_rule: 'proporcional',
                status: 'rascunho',
                created_by_email: params.createdByEmail,
            })
            .select()
            .single();
        if (batchError) throw batchError;

        const itemsPayload = eligible.map(p => ({
            batch_id: batch.id,
            partner_id: p.id,
            beneficiary_type: p.beneficiario_tipo || 'pf_residente',
            ownership_percentage: p.participacao_pct,
            gross_amount: Math.round(params.proposedAmount * (p.participacao_pct / totalPct) * 100) / 100,
            status: 'proposto' as const,
        }));

        const { error: itemsError } = await supabase.from('profit_distribution_items').insert(itemsPayload);
        if (itemsError) throw itemsError;

        const items = await this.listBatchItems(batch.id);
        return { batch: batch as ProfitDistributionBatch, items };
    },

    /**
     * Anexa a ata/deliberação (documento obrigatório para aprovar o lote) —
     * reusa documentService.uploadNewDocument (mesmo storage opura-docs).
     */
    async attachBatchDocument(batch: ProfitDistributionBatch, file: File, createdByEmail: string): Promise<string> {
        const doc = await documentService.uploadNewDocument({
            organization_id: batch.organization_id,
            company_id: batch.company_id,
            nome: `Ata de Deliberação — ${batch.profit_period_start.slice(0, 7)} a ${batch.profit_period_end.slice(0, 7)}`,
            categoria: 'juridico',
            tipo_documento: 'ata_deliberacao',
            status: 'ativo',
            alerta_dias_antecedencia: 30,
            tags: ['remuneracao_societaria', 'dividendos'],
        }, file);

        const { error } = await supabase
            .from('profit_distribution_batches')
            .update({ document_id: doc.id })
            .eq('id', batch.id);
        if (error) throw error;
        return doc.id;
    },

    async approveProfitBatch(batchId: string, approvedByEmail: string): Promise<void> {
        const { data: batch, error: findError } = await supabase
            .from('profit_distribution_batches')
            .select('document_id')
            .eq('id', batchId)
            .single();
        if (findError) throw findError;
        if (!batch?.document_id) {
            throw new Error('É obrigatório anexar a ata de deliberação antes de aprovar a distribuição.');
        }

        const { error } = await supabase
            .from('profit_distribution_batches')
            .update({
                status: 'aprovado',
                approved_by_email: approvedByEmail,
                approval_date: new Date().toISOString().slice(0, 10),
            })
            .eq('id', batchId);
        if (error) throw error;
        await supabase.from('profit_distribution_items').update({ status: 'aprovado' }).eq('batch_id', batchId);
    },

    /**
     * Envia ao financeiro: gera internal_transactions (DEBIT, ledger/DRE) + um
     * título em `invoices` (Contas a Pagar) por item aprovado, marca payment_date
     * no lote (referência do agregador mensal de retenção).
     */
    async sendProfitBatchToFinancial(organizationId: string, batch: ProfitDistributionBatch, items: ProfitDistributionItem[]): Promise<void> {
        const paymentDate = new Date().toISOString().slice(0, 10);

        for (const item of items) {
            const { data: tx, error: txError } = await supabase
                .from('internal_transactions')
                .insert({
                    organization_id: organizationId,
                    source_system: 'DIVIDENDOS',
                    reference_id: item.id,
                    transaction_date: paymentDate,
                    amount: item.net_amount,
                    direction: 'DEBIT',
                    description: `Distribuição de lucros ${batch.profit_period_start.slice(0, 7)}-${batch.profit_period_end.slice(0, 7)}`,
                    category: 'Dividendos',
                    status: 'PENDING',
                })
                .select()
                .single();
            if (txError) throw txError;

            await this.createInvoiceForItem(organizationId, {
                kind: 'dividendo',
                itemId: item.id,
                partnerNome: item.partner_nome || 'Sócio',
                partnerDocumento: item.partner_documento,
                partnerTipoPessoa: item.partner_tipo_pessoa,
                amount: item.net_amount,
                dueDate: paymentDate,
                fileName: `Dividendos ${batch.profit_period_start.slice(0, 7)}-${batch.profit_period_end.slice(0, 7)}`,
            });

            const { error: itemError } = await supabase
                .from('profit_distribution_items')
                .update({ financial_entry_id: tx.id, status: 'pago' })
                .eq('id', item.id);
            if (itemError) throw itemError;
        }

        // payment_date no lote é a referência que o agregador mensal usa; ao
        // gravá-la aqui, um UPDATE de gross_amount futuro reprocessaria a
        // retenção com base nela (a trigger dispara em INSERT/UPDATE de item,
        // não do lote — suficiente para o MVP: os itens já foram calculados
        // na criação usando profit_period_end como referência).
        const { error } = await supabase
            .from('profit_distribution_batches')
            .update({ status: 'pago_integral', payment_date: paymentDate })
            .eq('id', batch.id);
        if (error) throw error;
    },

    // ─── Sócios elegíveis (lê company_partners, não duplica) ────

    async listEligiblePartners(companyId: string): Promise<CompanyPartner[]> {
        const { data, error } = await supabase
            .from('company_partners')
            .select('id, company_id, tipo_pessoa, nome, documento, participacao_pct, is_administrador, is_assinante_legal, pj_company_id, data_entrada, data_saida, created_at, beneficiario_tipo, dependentes_ir, bank_account_id, pix_chave, regime_remuneracao')
            .eq('company_id', companyId)
            .is('data_saida', null)
            .order('nome');
        if (error) throw error;
        return (data || []) as CompanyPartner[];
    },
};
