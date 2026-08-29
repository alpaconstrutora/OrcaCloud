/**
 * Gestão de Dívidas e Financiamentos — CRUD e geração de cronograma.
 * Plano: docs/planos/2026-08-29-gestao-dividas-financiamentos.md
 *
 * REGRA #5: `organizationId` pode ser `null` ("Todas as organizações") e isso
 * NUNCA bloqueia leitura — o `.eq()` só entra quando há org. A RLS recorta o
 * resto. Modelo: services/inventoryService.ts:139-149.
 *
 * A materialização das parcelas em Contas a Pagar mora em
 * `debtFinanceService.ts`, não aqui: este serviço é o dono do contrato e do
 * cronograma; o razão é do outro.
 */

import { supabase } from '../lib/supabase';
import type {
    DebtAllocation,
    DebtAllocationInput,
    DebtContract,
    DebtContractInput,
    DebtDisbursement,
    DebtDisbursementInput,
    DebtInstallment,
    DebtSchedule,
    DebtScheduleKind,
} from '../types/debt';
import {
    buildSchedule,
    outstandingBalanceAt,
    type DebtInstallmentRow,
    type DebtScheduleParams,
} from '../utils/debtAmortization';

// ⚠️ supabase-js exige string LITERAL em `.select()`. Concatenar colunas com
// `+` produz `string` (não-literal) e o cliente devolve GenericStringError.
const CONTRACT_COLS =
    'id, organization_id, company_id, counterparty_kind, institution_supplier_id, institution_branch, related_company_id, mirror_debt_contract_id, mirror_role, contract_number, modality, purpose, signed_at, released_at, first_due_date, final_due_date, owner_user_id, status, principal_contracted, principal_released, retained_amount, fees, iof, insurance, notary_costs, other_costs, net_received, rate_type, nominal_rate, rate_period, index_name, index_pct, spread, cet_annual, grace_principal_months, grace_interest_months, capitalize_interest, installment_period, installment_count, late_fine_pct, late_interest_month_pct, amortization_system, notes, created_at, updated_at, company:companies(razao_social, nome_fantasia), institution:suppliers(name)';

const SCHEDULE_COLS =
    'id, organization_id, debt_contract_id, kind, version, supersedes_id, reason, is_active, params_snapshot, generated_at, created_by, created_at';

const INSTALLMENT_COLS =
    'id, organization_id, debt_schedule_id, seq, due_date, competencia_date, opening_balance, amortization, interest, monetary_correction, iof, insurance, fees, late_fine, late_interest, total, closing_balance, paid_amount, paid_at, status, notes';

const DISBURSEMENT_COLS =
    'id, organization_id, debt_contract_id, disbursed_at, gross_amount, retained_amount, fees, iof, insurance, notary_costs, other_costs, net_amount, payment_account_id, document_url, notes';

const ALLOCATION_COLS =
    'id, organization_id, debt_contract_id, target_kind, target_id, percent, notes';

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const opt = <T>(v: unknown): T | undefined => (v == null ? undefined : (v as T));

function mapContract(row: Record<string, unknown>): DebtContract {
    const company = row.company as Record<string, unknown> | null;
    const institution = row.institution as Record<string, unknown> | null;
    return {
        id: row.id as string,
        organizationId: row.organization_id as string,
        companyId: opt<string>(row.company_id),
        companyName: opt<string>(company?.nome_fantasia ?? company?.razao_social),
        counterpartyKind: row.counterparty_kind as DebtContract['counterpartyKind'],
        institutionSupplierId: opt<string>(row.institution_supplier_id),
        institutionName: opt<string>(institution?.name),
        institutionBranch: opt<string>(row.institution_branch),
        relatedCompanyId: opt<string>(row.related_company_id),
        mirrorDebtContractId: opt<string>(row.mirror_debt_contract_id),
        mirrorRole: opt<DebtContract['mirrorRole']>(row.mirror_role),
        contractNumber: opt<string>(row.contract_number),
        modality: row.modality as DebtContract['modality'],
        purpose: opt<string>(row.purpose),
        signedAt: opt<string>(row.signed_at),
        releasedAt: opt<string>(row.released_at),
        firstDueDate: opt<string>(row.first_due_date),
        finalDueDate: opt<string>(row.final_due_date),
        ownerUserId: opt<string>(row.owner_user_id),
        status: row.status as DebtContract['status'],
        principalContracted: num(row.principal_contracted),
        principalReleased: num(row.principal_released),
        retainedAmount: num(row.retained_amount),
        fees: num(row.fees),
        iof: num(row.iof),
        insurance: num(row.insurance),
        notaryCosts: num(row.notary_costs),
        otherCosts: num(row.other_costs),
        netReceived: num(row.net_received),
        rateType: row.rate_type as DebtContract['rateType'],
        nominalRate: num(row.nominal_rate),
        ratePeriod: row.rate_period as DebtContract['ratePeriod'],
        indexName: opt<string>(row.index_name),
        indexPct: row.index_pct == null ? undefined : Number(row.index_pct),
        spread: row.spread == null ? undefined : Number(row.spread),
        cetAnnual: row.cet_annual == null ? undefined : Number(row.cet_annual),
        gracePrincipalMonths: num(row.grace_principal_months),
        graceInterestMonths: num(row.grace_interest_months),
        capitalizeInterest: Boolean(row.capitalize_interest),
        installmentPeriod: row.installment_period as DebtContract['installmentPeriod'],
        installmentCount: row.installment_count == null ? undefined : Number(row.installment_count),
        lateFinePct: num(row.late_fine_pct),
        lateInterestMonthPct: num(row.late_interest_month_pct),
        amortizationSystem: row.amortization_system as DebtContract['amortizationSystem'],
        notes: opt<string>(row.notes),
        created_at: opt<string>(row.created_at),
        updated_at: opt<string>(row.updated_at),
    };
}

function contractToRow(input: DebtContractInput): Record<string, unknown> {
    return {
        company_id: input.companyId ?? null,
        counterparty_kind: input.counterpartyKind,
        institution_supplier_id: input.institutionSupplierId ?? null,
        institution_branch: input.institutionBranch ?? null,
        related_company_id: input.relatedCompanyId ?? null,
        mirror_debt_contract_id: input.mirrorDebtContractId ?? null,
        mirror_role: input.mirrorRole ?? null,
        contract_number: input.contractNumber ?? null,
        modality: input.modality,
        purpose: input.purpose ?? null,
        signed_at: input.signedAt ?? null,
        released_at: input.releasedAt ?? null,
        first_due_date: input.firstDueDate ?? null,
        final_due_date: input.finalDueDate ?? null,
        owner_user_id: input.ownerUserId ?? null,
        status: input.status,
        principal_contracted: input.principalContracted,
        principal_released: input.principalReleased,
        retained_amount: input.retainedAmount,
        fees: input.fees,
        iof: input.iof,
        insurance: input.insurance,
        notary_costs: input.notaryCosts,
        other_costs: input.otherCosts,
        net_received: input.netReceived,
        rate_type: input.rateType,
        nominal_rate: input.nominalRate,
        rate_period: input.ratePeriod,
        index_name: input.indexName ?? null,
        index_pct: input.indexPct ?? null,
        spread: input.spread ?? null,
        cet_annual: input.cetAnnual ?? null,
        grace_principal_months: input.gracePrincipalMonths,
        grace_interest_months: input.graceInterestMonths,
        capitalize_interest: input.capitalizeInterest,
        installment_period: input.installmentPeriod,
        installment_count: input.installmentCount ?? null,
        late_fine_pct: input.lateFinePct,
        late_interest_month_pct: input.lateInterestMonthPct,
        amortization_system: input.amortizationSystem,
        notes: input.notes ?? null,
    };
}

function mapSchedule(row: Record<string, unknown>): DebtSchedule {
    return {
        id: row.id as string,
        organizationId: row.organization_id as string,
        debtContractId: row.debt_contract_id as string,
        kind: row.kind as DebtScheduleKind,
        version: Number(row.version),
        supersedesId: opt<string>(row.supersedes_id),
        reason: opt<string>(row.reason),
        isActive: Boolean(row.is_active),
        paramsSnapshot: opt<Record<string, unknown>>(row.params_snapshot),
        generatedAt: opt<string>(row.generated_at),
        createdBy: opt<string>(row.created_by),
        created_at: opt<string>(row.created_at),
    };
}

function mapInstallment(row: Record<string, unknown>): DebtInstallment {
    return {
        id: row.id as string,
        organizationId: row.organization_id as string,
        debtScheduleId: row.debt_schedule_id as string,
        seq: Number(row.seq),
        dueDate: row.due_date as string,
        competenciaDate: opt<string>(row.competencia_date),
        openingBalance: num(row.opening_balance),
        amortization: num(row.amortization),
        interest: num(row.interest),
        monetaryCorrection: num(row.monetary_correction),
        iof: num(row.iof),
        insurance: num(row.insurance),
        fees: num(row.fees),
        lateFine: num(row.late_fine),
        lateInterest: num(row.late_interest),
        total: num(row.total),
        closingBalance: num(row.closing_balance),
        paidAmount: num(row.paid_amount),
        paidAt: opt<string>(row.paid_at),
        status: row.status as DebtInstallment['status'],
        notes: opt<string>(row.notes),
    };
}

function mapDisbursement(row: Record<string, unknown>): DebtDisbursement {
    return {
        id: row.id as string,
        organizationId: row.organization_id as string,
        debtContractId: row.debt_contract_id as string,
        disbursedAt: row.disbursed_at as string,
        grossAmount: num(row.gross_amount),
        retainedAmount: num(row.retained_amount),
        fees: num(row.fees),
        iof: num(row.iof),
        insurance: num(row.insurance),
        notaryCosts: num(row.notary_costs),
        otherCosts: num(row.other_costs),
        netAmount: num(row.net_amount),
        paymentAccountId: opt<string>(row.payment_account_id),
        documentUrl: opt<string>(row.document_url),
        notes: opt<string>(row.notes),
    };
}

function mapAllocation(row: Record<string, unknown>): DebtAllocation {
    return {
        id: row.id as string,
        organizationId: row.organization_id as string,
        debtContractId: row.debt_contract_id as string,
        targetKind: row.target_kind as DebtAllocation['targetKind'],
        targetId: row.target_id as string,
        percent: num(row.percent),
        notes: opt<string>(row.notes),
    };
}

/**
 * Parâmetros do motor a partir do contrato gravado.
 *
 * A carência é gravada em MESES no contrato (é como o banco escreve) e o motor
 * trabalha em PERÍODOS — num contrato semestral, 12 meses de carência são 2
 * períodos. Converter aqui, num lugar só, evita a carência virar o dobro numa
 * tela e a metade na outra.
 */
export function paramsFromContract(
    contract: DebtContract,
    indexSeries?: Record<string, number>,
): DebtScheduleParams | null {
    if (!contract.firstDueDate || !contract.installmentCount || contract.principalReleased <= 0) {
        return null;
    }
    const mesesPorPeriodo =
        contract.installmentPeriod === 'BIMESTRAL' ? 2 :
        contract.installmentPeriod === 'TRIMESTRAL' ? 3 :
        contract.installmentPeriod === 'SEMESTRAL' ? 6 :
        contract.installmentPeriod === 'ANUAL' ? 12 : 1;

    return {
        principal: contract.principalReleased,
        nominalRate: contract.nominalRate,
        ratePeriod: contract.ratePeriod,
        system: contract.amortizationSystem,
        installmentCount: contract.installmentCount,
        installmentPeriod: contract.installmentPeriod,
        firstDueDate: contract.firstDueDate,
        gracePrincipalPeriods: Math.round(contract.gracePrincipalMonths / mesesPorPeriodo),
        graceInterestPeriods: Math.round(contract.graceInterestMonths / mesesPorPeriodo),
        capitalizeInterest: contract.capitalizeInterest,
        indexSeries,
        indexPct: contract.indexPct,
        spreadMonthly: contract.spread,
    };
}

export const debtService = {

    // ─── CONTRATOS ─────────────────────────────────────────────────────────

    async listContracts(organizationId: string | null): Promise<DebtContract[]> {
        let query = supabase
            .from('debt_contracts')
            .select(CONTRACT_COLS)
            .order('signed_at', { ascending: false, nullsFirst: false });
        // null = "Todas as organizações". Não bloquear (REGRA #5).
        if (organizationId) query = query.eq('organization_id', organizationId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map((r) => mapContract(r as Record<string, unknown>));
    },

    async getContract(id: string): Promise<DebtContract> {
        const { data, error } = await supabase
            .from('debt_contracts')
            .select(CONTRACT_COLS)
            .eq('id', id)
            .single();
        if (error) throw error;
        return mapContract(data as Record<string, unknown>);
    },

    async createContract(organizationId: string, input: DebtContractInput): Promise<DebtContract> {
        const { data, error } = await supabase
            .from('debt_contracts')
            .insert({ organization_id: organizationId, ...contractToRow(input) })
            .select(CONTRACT_COLS)
            .single();
        if (error) throw error;
        return mapContract(data as Record<string, unknown>);
    },

    async updateContract(id: string, input: DebtContractInput): Promise<DebtContract> {
        const { data, error } = await supabase
            .from('debt_contracts')
            .update(contractToRow(input))
            .eq('id', id)
            .select(CONTRACT_COLS)
            .single();
        if (error) throw error;
        return mapContract(data as Record<string, unknown>);
    },

    async removeContract(id: string): Promise<void> {
        // .select('id') + conferência de length: no PostgREST um DELETE que não
        // casa nada é indistinguível de sucesso, e a RLS pode ter barrado.
        const { data, error } = await supabase
            .from('debt_contracts')
            .delete()
            .eq('id', id)
            .select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error('Nenhum contrato foi excluído — ele não existe ou você não tem acesso a ele.');
        }
    },

    // ─── CRONOGRAMAS ───────────────────────────────────────────────────────

    async listSchedules(debtContractId: string): Promise<DebtSchedule[]> {
        const { data, error } = await supabase
            .from('debt_schedules')
            .select(SCHEDULE_COLS)
            .eq('debt_contract_id', debtContractId)
            .order('kind')
            .order('version', { ascending: false });
        if (error) throw error;
        return (data ?? []).map((r) => mapSchedule(r as Record<string, unknown>));
    },

    async getActiveSchedule(
        debtContractId: string,
        kind: DebtScheduleKind = 'VIGENTE',
    ): Promise<DebtSchedule | null> {
        const { data, error } = await supabase
            .from('debt_schedules')
            .select(SCHEDULE_COLS)
            .eq('debt_contract_id', debtContractId)
            .eq('kind', kind)
            .eq('is_active', true)
            .maybeSingle();
        if (error) throw error;
        return data ? mapSchedule(data as Record<string, unknown>) : null;
    },

    async listInstallments(debtScheduleId: string): Promise<DebtInstallment[]> {
        const { data, error } = await supabase
            .from('debt_installments')
            .select(INSTALLMENT_COLS)
            .eq('debt_schedule_id', debtScheduleId)
            .order('seq');
        if (error) throw error;
        return (data ?? []).map((r) => mapInstallment(r as Record<string, unknown>));
    },

    /**
     * Gera o cronograma do contrato. Na primeira vez cria as DUAS camadas —
     * CONTRATUAL e VIGENTE — com o mesmo conteúdo; depois disso a CONTRATUAL
     * nunca mais é tocada, e regerar só substitui a VIGENTE ativa.
     *
     * É a regra arquitetural do PRD item 4: renegociação não sobrescreve o
     * contrato original.
     */
    async generateSchedule(
        contract: DebtContract,
        opts?: { indexSeries?: Record<string, number>; reason?: string; createdBy?: string },
    ): Promise<{ schedule: DebtSchedule; installments: DebtInstallment[] }> {
        const params = paramsFromContract(contract, opts?.indexSeries);
        if (!params) {
            throw new Error(
                'Faltam dados para gerar o cronograma: valor liberado, data do primeiro vencimento e número de parcelas.',
            );
        }

        const rows = buildSchedule(params);
        if (rows.length === 0) {
            throw new Error('O cronograma saiu vazio — confira valor liberado e número de parcelas.');
        }

        const jaTemContratual = await this.getActiveSchedule(contract.id, 'CONTRATUAL');
        if (!jaTemContratual) {
            await this.persistSchedule(contract, rows, params, {
                kind: 'CONTRATUAL',
                version: 1,
                reason: 'Cronograma original do contrato',
                createdBy: opts?.createdBy,
            });
        }

        const vigenteAtual = await this.getActiveSchedule(contract.id, 'VIGENTE');
        if (vigenteAtual) {
            // Desativa antes de inserir: o índice único parcial
            // (debt_contract_id, kind) WHERE is_active só admite uma ativa.
            const { error } = await supabase
                .from('debt_schedules')
                .update({ is_active: false })
                .eq('id', vigenteAtual.id);
            if (error) throw error;
        }

        const schedule = await this.persistSchedule(contract, rows, params, {
            kind: 'VIGENTE',
            version: (vigenteAtual?.version ?? 0) + 1,
            supersedesId: vigenteAtual?.id,
            reason: opts?.reason ?? (vigenteAtual ? 'Regeração do cronograma' : 'Cronograma inicial'),
            createdBy: opts?.createdBy,
        });

        return { schedule, installments: await this.listInstallments(schedule.id) };
    },

    /** Grava uma versão de cronograma com suas parcelas. Uso interno. */
    async persistSchedule(
        contract: DebtContract,
        rows: DebtInstallmentRow[],
        params: DebtScheduleParams,
        meta: {
            kind: DebtScheduleKind;
            version: number;
            supersedesId?: string;
            reason?: string;
            createdBy?: string;
        },
    ): Promise<DebtSchedule> {
        const { data, error } = await supabase
            .from('debt_schedules')
            .insert({
                organization_id: contract.organizationId,
                debt_contract_id: contract.id,
                kind: meta.kind,
                version: meta.version,
                supersedes_id: meta.supersedesId ?? null,
                reason: meta.reason ?? null,
                is_active: true,
                params_snapshot: params as unknown as Record<string, unknown>,
                created_by: meta.createdBy ?? null,
            })
            .select(SCHEDULE_COLS)
            .single();
        if (error) throw error;

        const schedule = mapSchedule(data as Record<string, unknown>);

        const { error: erroParcelas } = await supabase.from('debt_installments').insert(
            rows.map((r) => ({
                organization_id: contract.organizationId,
                debt_schedule_id: schedule.id,
                seq: r.seq,
                due_date: r.dueDate,
                competencia_date: r.competenciaDate,
                opening_balance: r.openingBalance,
                amortization: r.amortization,
                interest: r.interest,
                monetary_correction: r.monetaryCorrection,
                iof: r.iof,
                insurance: r.insurance,
                fees: r.fees,
                late_fine: r.lateFine,
                late_interest: r.lateInterest,
                total: r.total,
                closing_balance: r.closingBalance,
                status: 'PREVISTA',
            })),
        );
        if (erroParcelas) throw erroParcelas;

        return schedule;
    },

    /** Saldo devedor numa data, pelo cronograma VIGENTE. */
    async getBalanceAt(debtContractId: string, dateISO: string): Promise<number> {
        const schedule = await this.getActiveSchedule(debtContractId, 'VIGENTE');
        if (!schedule) return 0;
        const parcelas = await this.listInstallments(schedule.id);
        return outstandingBalanceAt(
            parcelas.map((p) => ({
                seq: p.seq,
                dueDate: p.dueDate,
                competenciaDate: p.competenciaDate ?? p.dueDate,
                openingBalance: p.openingBalance,
                amortization: p.amortization,
                interest: p.interest,
                monetaryCorrection: p.monetaryCorrection,
                iof: p.iof,
                insurance: p.insurance,
                fees: p.fees,
                lateFine: p.lateFine,
                lateInterest: p.lateInterest,
                total: p.total,
                closingBalance: p.closingBalance,
            })),
            dateISO,
        );
    },

    // ─── LIBERAÇÕES ────────────────────────────────────────────────────────

    async listDisbursements(debtContractId: string): Promise<DebtDisbursement[]> {
        const { data, error } = await supabase
            .from('debt_disbursements')
            .select(DISBURSEMENT_COLS)
            .eq('debt_contract_id', debtContractId)
            .order('disbursed_at');
        if (error) throw error;
        return (data ?? []).map((r) => mapDisbursement(r as Record<string, unknown>));
    },

    async saveDisbursement(
        organizationId: string,
        input: DebtDisbursementInput,
    ): Promise<DebtDisbursement> {
        const row = {
            organization_id: organizationId,
            debt_contract_id: input.debtContractId,
            disbursed_at: input.disbursedAt,
            gross_amount: input.grossAmount,
            retained_amount: input.retainedAmount,
            fees: input.fees,
            iof: input.iof,
            insurance: input.insurance,
            notary_costs: input.notaryCosts,
            other_costs: input.otherCosts,
            net_amount: input.netAmount,
            payment_account_id: input.paymentAccountId ?? null,
            document_url: input.documentUrl ?? null,
            notes: input.notes ?? null,
        };
        const query = input.id
            ? supabase.from('debt_disbursements').update(row).eq('id', input.id)
            : supabase.from('debt_disbursements').insert(row);
        const { data, error } = await query.select(DISBURSEMENT_COLS).single();
        if (error) throw error;
        return mapDisbursement(data as Record<string, unknown>);
    },

    async removeDisbursement(id: string): Promise<void> {
        const { data, error } = await supabase
            .from('debt_disbursements').delete().eq('id', id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error('Nenhuma liberação foi excluída — ela não existe ou você não tem acesso a ela.');
        }
    },

    /**
     * Recalcula `principal_released` e `net_received` a partir das liberações.
     * O contrato é o consolidado; a liberação é o fato. Deixar o usuário
     * digitar os dois é o caminho conhecido para o drift de saldo.
     */
    async syncReleasedFromDisbursements(debtContractId: string): Promise<void> {
        const liberacoes = await this.listDisbursements(debtContractId);
        if (liberacoes.length === 0) return;
        const bruto = liberacoes.reduce((a, d) => a + d.grossAmount, 0);
        const liquido = liberacoes.reduce((a, d) => a + d.netAmount, 0);
        const { error } = await supabase
            .from('debt_contracts')
            .update({
                principal_released: Number(bruto.toFixed(2)),
                net_received: Number(liquido.toFixed(2)),
            })
            .eq('id', debtContractId);
        if (error) throw error;
    },

    // ─── RATEIO ────────────────────────────────────────────────────────────

    async listAllocations(debtContractId: string): Promise<DebtAllocation[]> {
        const { data, error } = await supabase
            .from('debt_allocations')
            .select(ALLOCATION_COLS)
            .eq('debt_contract_id', debtContractId)
            .order('percent', { ascending: false });
        if (error) throw error;
        return (data ?? []).map((r) => mapAllocation(r as Record<string, unknown>));
    },

    /**
     * Salva o rateio inteiro de uma vez. A trava de soma = 100 no banco é
     * DEFERRABLE INITIALLY DEFERRED, então apagar tudo e reinserir passa por
     * estados intermediários sem quebrar — a validação acontece no COMMIT.
     */
    async saveAllocations(
        organizationId: string,
        debtContractId: string,
        allocations: DebtAllocationInput[],
    ): Promise<DebtAllocation[]> {
        const soma = allocations.reduce((a, x) => a + x.percent, 0);
        if (allocations.length > 0 && Math.abs(soma - 100) > 0.01) {
            throw new Error(`O rateio soma ${soma.toFixed(2)}% — precisa somar 100% ou ficar vazio.`);
        }

        const { error: erroLimpeza } = await supabase
            .from('debt_allocations').delete().eq('debt_contract_id', debtContractId);
        if (erroLimpeza) throw erroLimpeza;

        if (allocations.length === 0) return [];

        const { data, error } = await supabase
            .from('debt_allocations')
            .insert(allocations.map((a) => ({
                organization_id: organizationId,
                debt_contract_id: debtContractId,
                target_kind: a.targetKind,
                target_id: a.targetId,
                percent: a.percent,
                notes: a.notes ?? null,
            })))
            .select(ALLOCATION_COLS);
        if (error) throw error;
        return (data ?? []).map((r) => mapAllocation(r as Record<string, unknown>));
    },

    // ─── RENEGOCIAÇÃO E AMORTIZAÇÃO EXTRAORDINÁRIA ─────────────────────────

    /**
     * Reconstrói o cronograma VIGENTE a partir de uma data, preservando o
     * passado.
     *
     * A regra arquitetural do PRD: renegociação NUNCA sobrescreve o contrato
     * original. Aqui isso significa três coisas:
     *   1. a camada CONTRATUAL não é tocada, nunca;
     *   2. as parcelas anteriores a `effectiveDate` são COPIADAS para a versão
     *      nova com o mesmo `seq` — é o que mantém os títulos já emitidos no
     *      Contas a Pagar casando (o `reference_id` embute a sequência);
     *   3. a versão VIGENTE anterior é desativada e apontada por
     *      `supersedes_id`, não apagada.
     *
     * O `seq` continuar é essencial: renumerar faria a parcela 7 já paga virar
     * a parcela 1 da versão nova, e o título antigo ficaria órfão e em aberto.
     */
    async rebuildScheduleFrom(
        contract: DebtContract,
        opts: {
            effectiveDate: string;
            reason: string;
            /** Abatimento no saldo devedor antes de recalcular. */
            extraAmortization?: number;
            /** Com abatimento: encurta o prazo ou reduz a parcela. */
            effect?: 'REDUZIR_PRAZO' | 'REDUZIR_PARCELA';
            /** Novas condições (renegociação de taxa/sistema/prazo). */
            overrides?: Partial<DebtScheduleParams>;
            indexSeries?: Record<string, number>;
            createdBy?: string;
        },
    ): Promise<{ schedule: DebtSchedule; installments: DebtInstallment[] }> {
        const vigente = await this.getActiveSchedule(contract.id, 'VIGENTE');
        if (!vigente) throw new Error('Não há cronograma vigente para renegociar. Gere o cronograma primeiro.');

        const atuais = await this.listInstallments(vigente.id);
        const passadas = atuais.filter((p) => p.dueDate < opts.effectiveDate);
        const futuras = atuais.filter((p) => p.dueDate >= opts.effectiveDate);

        if (futuras.length === 0) {
            throw new Error('Não há parcelas em aberto a partir dessa data — nada a recalcular.');
        }

        const saldo = passadas.length > 0
            ? passadas[passadas.length - 1].closingBalance
            : contract.principalReleased;

        const abatimento = Math.max(0, opts.extraAmortization ?? 0);
        if (abatimento > saldo) {
            throw new Error(
                `O abatimento (${abatimento}) é maior que o saldo devedor na data (${saldo}). ` +
                'Para quitar o contrato, use a liquidação antecipada.',
            );
        }
        const novoPrincipal = Number((saldo - abatimento).toFixed(2));

        const baseParams = paramsFromContract(contract, opts.indexSeries);
        if (!baseParams) throw new Error('Faltam dados do contrato para recalcular o cronograma.');

        const params: DebtScheduleParams = {
            ...baseParams,
            ...opts.overrides,
            principal: novoPrincipal,
            firstDueDate: futuras[0].dueDate,
            // A carência já foi cumprida no trecho passado; reaplicá-la daria
            // ao devedor uma segunda carência que ninguém negociou.
            gracePrincipalPeriods: opts.overrides?.gracePrincipalPeriods ?? 0,
            graceInterestPeriods: opts.overrides?.graceInterestPeriods ?? 0,
            installmentCount: opts.overrides?.installmentCount ?? futuras.length,
        };

        let novasLinhas: DebtInstallmentRow[];

        if (abatimento > 0 && (opts.effect ?? 'REDUZIR_PRAZO') === 'REDUZIR_PRAZO') {
            // Mantém a parcela e encurta o prazo: procura o MENOR número de
            // parcelas cuja maior prestação ainda caiba no valor que o devedor
            // já paga. A busca é linear porque a prestação cai monotonicamente
            // com o prazo — e o intervalo é o número de parcelas que restavam.
            const tetoParcela = Math.max(...futuras.map((p) => p.total));
            let escolhido = futuras.length;
            for (let n = 1; n <= futuras.length; n++) {
                const tentativa = buildSchedule({ ...params, installmentCount: n });
                if (tentativa.length === 0) continue;
                const maior = Math.max(...tentativa.map((r) => r.total));
                if (maior <= tetoParcela + 0.01) { escolhido = n; break; }
            }
            novasLinhas = buildSchedule({ ...params, installmentCount: escolhido });
        } else {
            // Reduz a parcela mantendo o prazo (ou renegociação sem abatimento).
            novasLinhas = buildSchedule(params);
        }

        if (novasLinhas.length === 0) throw new Error('O recálculo devolveu um cronograma vazio.');

        // Renumera a continuação a partir da última parcela preservada.
        const ultimoSeq = passadas.length > 0 ? passadas[passadas.length - 1].seq : 0;
        const continuacao = novasLinhas.map((r, i) => ({ ...r, seq: ultimoSeq + i + 1 }));

        const preservadas: DebtInstallmentRow[] = passadas.map((p) => ({
            seq: p.seq,
            dueDate: p.dueDate,
            competenciaDate: p.competenciaDate ?? p.dueDate,
            openingBalance: p.openingBalance,
            amortization: p.amortization,
            interest: p.interest,
            monetaryCorrection: p.monetaryCorrection,
            iof: p.iof,
            insurance: p.insurance,
            fees: p.fees,
            lateFine: p.lateFine,
            lateInterest: p.lateInterest,
            total: p.total,
            closingBalance: p.closingBalance,
        }));

        const { error: erroDesativa } = await supabase
            .from('debt_schedules')
            .update({ is_active: false })
            .eq('id', vigente.id);
        if (erroDesativa) throw erroDesativa;

        const schedule = await this.persistSchedule(
            contract,
            [...preservadas, ...continuacao],
            params,
            {
                kind: 'VIGENTE',
                version: vigente.version + 1,
                supersedesId: vigente.id,
                reason: opts.reason,
                createdBy: opts.createdBy,
            },
        );

        // As parcelas preservadas voltam ao status que já tinham — a cópia nasce
        // PREVISTA e diria que uma parcela paga está em aberto.
        for (const p of passadas) {
            await supabase.from('debt_installments')
                .update({ status: p.status, paid_amount: p.paidAmount, paid_at: p.paidAt ?? null })
                .eq('debt_schedule_id', schedule.id)
                .eq('seq', p.seq);
        }

        return { schedule, installments: await this.listInstallments(schedule.id) };
    },

    // ─── MÚTUO INTERCOMPANY ────────────────────────────────────────────────

    /**
     * Cria as DUAS pernas de um mútuo entre empresas do grupo, ligadas por
     * `mirror_debt_contract_id`.
     *
     * Decisão do usuário (2026-08-29): espelho automático, e não cadastro
     * manual dos dois lados — cadastro dobrado é o caminho conhecido para dois
     * saldos que deveriam bater e não batem
     * (ver o drift já registrado em Locações).
     *
     * ⚠️ A eliminação na consolidação **não existia** no sistema: apurado em
     * 2026-08-29, `vw_intercompany_transactions` só lista pedidos de compra e
     * `vw_company_consolidated` é roll-up de contagens. Por isso a perna ganha
     * `mirror_role`: a posição consolidada do grupo soma só a DEVEDORA.
     */
    async createIntercompanyMirror(
        organizationId: string,
        input: DebtContractInput,
    ): Promise<{ devedora: DebtContract; credora: DebtContract }> {
        if (!input.companyId || !input.relatedCompanyId) {
            throw new Error('Mútuo intercompany exige a empresa devedora e a empresa credora.');
        }
        if (input.companyId === input.relatedCompanyId) {
            throw new Error('A empresa devedora e a credora não podem ser a mesma.');
        }

        const devedora = await this.createContract(organizationId, {
            ...input,
            counterpartyKind: 'PARTE_RELACIONADA',
            mirrorRole: 'DEVEDORA',
        });

        try {
            // A perna credora é a MESMA operação vista do outro lado: empresas
            // trocadas, mesmas datas e mesmas condições. O que muda é o papel.
            const credora = await this.createContract(organizationId, {
                ...input,
                counterpartyKind: 'PARTE_RELACIONADA',
                mirrorRole: 'CREDORA',
                companyId: input.relatedCompanyId,
                relatedCompanyId: input.companyId,
                mirrorDebtContractId: devedora.id,
                contractNumber: input.contractNumber ? `${input.contractNumber}-C` : undefined,
            });

            const { error } = await supabase
                .from('debt_contracts')
                .update({ mirror_debt_contract_id: credora.id })
                .eq('id', devedora.id);
            if (error) throw error;

            return { devedora: { ...devedora, mirrorDebtContractId: credora.id }, credora };
        } catch (e) {
            // Sem a segunda perna, a primeira é um passivo sem contrapartida —
            // pior que não ter criado nada, porque infla a dívida do grupo.
            await supabase.from('debt_contracts').delete().eq('id', devedora.id);
            throw e;
        }
    },

    /**
     * Descarta a perna CREDORA de cada mútuo espelhado.
     *
     * É o que evita contar o mútuo duas vezes em qualquer total consolidado do
     * grupo. Contrato normal (`mirrorRole` nulo) passa intacto.
     */
    consolidateMirrors(contracts: DebtContract[]): DebtContract[] {
        return contracts.filter((c) => c.mirrorRole !== 'CREDORA');
    },
};
