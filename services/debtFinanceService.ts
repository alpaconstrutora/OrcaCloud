/**
 * Ponte Dívidas → Contas a Pagar.
 *
 * Decisão do usuário (2026-08-29): a parcela chega ao Contas a Pagar
 * **decomposta**, uma linha de `internal_transactions` por componente
 * (amortização, juros, correção, IOF, seguro, tarifa), cada uma com sua
 * categoria do plano de contas.
 *
 * O módulo de Dívidas é o dono do cronograma; o razão só recebe os títulos.
 * Este arquivo é a única porta entre os dois — ninguém mais escreve linha de
 * dívida em `internal_transactions`.
 *
 * Molde: `contractService.syncParceladoScheduleToFinance` (:456) e
 * `removeTransactionsFrom` (:209).
 *
 * Plano: docs/planos/2026-08-29-gestao-dividas-financiamentos.md
 */

import { supabase } from '../lib/supabase';
import {
    DEBT_SOURCE_SYSTEM,
    contractPrefix,
    debtRefFor,
    installmentPrefix,
    type DebtComponent,
} from '../lib/debtRef';
import { isSystemProject } from '../utils/systemProjects';
import type { DebtAllocation, DebtContract, DebtInstallment } from '../types/debt';

/** Componente → coluna da parcela e rótulo em português. */
const COMPONENTES: { key: DebtComponent; campo: keyof DebtInstallment; label: string }[] = [
    { key: 'AMORT',    campo: 'amortization',       label: 'Amortização' },
    { key: 'JUROS',    campo: 'interest',           label: 'Juros' },
    { key: 'CORRECAO', campo: 'monetaryCorrection', label: 'Correção monetária' },
    { key: 'IOF',      campo: 'iof',                label: 'IOF' },
    { key: 'SEGURO',   campo: 'insurance',          label: 'Seguro' },
    { key: 'TARIFA',   campo: 'fees',               label: 'Tarifas' },
    { key: 'MORA',     campo: 'lateFine',           label: 'Multa e mora' },
];

export interface ComponentAccount {
    component: DebtComponent;
    categoryId?: string;
    categoryName?: string;
    planoDeContasId?: string;
}

const COMPONENT_ACCOUNT_COLS =
    'component, category_id, plano_de_contas_id, organization_id, category:financial_categories(name)';

/**
 * Dimensões de obra e centro de custo herdadas do rateio.
 *
 * ⚠️ Só resolve quando o rateio aponta para **um** destino daquele tipo. Com
 * dois destinos, a linha do razão — que tem UMA coluna `project_id` — teria de
 * escolher, e escolher errado é pior que não preencher: a dívida apareceria
 * inteira na obra errada. Com rateio múltiplo o vínculo vive em
 * `debt_allocations`, que é de onde "dívida por obra" é lida.
 */
function dimensoesDoRateio(rateio: DebtAllocation[]): { projectId: string | null; costCenterId: string | null } {
    const obras = rateio.filter(r => r.targetKind === 'PROJECT');
    const centros = rateio.filter(r => r.targetKind === 'COST_CENTER');
    return {
        projectId: obras.length === 1 ? obras[0].targetId : null,
        costCenterId: centros.length === 1 ? centros[0].targetId : null,
    };
}

/**
 * REGRA #2 do CLAUDE.md, lado da ESCRITA: `project_id` de projeto de sistema é
 * sempre NULL. A trigger `trg_strip_system_project_from_internal_tx` também
 * trava, mas rede de segurança não é desculpa para gravar errado.
 */
async function projectIdSeguro(projectId: string | null): Promise<string | null> {
    if (!projectId) return null;
    const { data } = await supabase
        .from('projects')
        .select('id, name, settings')
        .eq('id', projectId)
        .maybeSingle();
    if (!data) return null;
    return isSystemProject(data as never) ? null : projectId;
}

export const debtFinanceService = {

    /**
     * De-para componente → categoria, com o padrão do sistema (org NULL) como
     * base e a linha da organização sobrepondo, quando existir.
     */
    async listComponentAccounts(organizationId: string | null): Promise<Record<DebtComponent, ComponentAccount>> {
        let query = supabase.from('debt_component_accounts').select(COMPONENT_ACCOUNT_COLS);
        // A RLS já recorta; o `.or` traz o padrão do sistema junto com o da org.
        if (organizationId) {
            query = query.or(`organization_id.is.null,organization_id.eq.${organizationId}`);
        } else {
            query = query.is('organization_id', null);
        }
        const { data, error } = await query;
        if (error) throw error;

        const mapa = {} as Record<DebtComponent, ComponentAccount>;
        for (const row of (data ?? []) as Record<string, unknown>[]) {
            const key = row.component as DebtComponent;
            const ehDaOrg = row.organization_id != null;
            // Sobreposição da organização vence o padrão, independente da ordem
            // em que as linhas voltaram.
            if (mapa[key] && !ehDaOrg) continue;
            mapa[key] = {
                component: key,
                categoryId: (row.category_id as string) ?? undefined,
                categoryName: ((row.category as Record<string, unknown> | null)?.name as string) ?? undefined,
                planoDeContasId: (row.plano_de_contas_id as string) ?? undefined,
            };
        }
        return mapa;
    },

    /**
     * Materializa o cronograma no Contas a Pagar: N linhas por parcela, uma por
     * componente com valor diferente de zero.
     *
     * Idempotente pela unique `(organization_id, reference_id, entry_type)` —
     * reprocessar o contrato reencontra a mesma linha em vez de duplicar.
     *
     * `fromDate` corta o passado: renegociação e regeração só podem tocar o
     * futuro, porque `trg_block_period_internal_tx` barra escrita em período
     * fechado (`financial_period_locks`) e porque reescrever parcela já paga
     * apagaria a conciliação dela.
     */
    async syncInstallmentsToPayables(
        contract: DebtContract,
        installments: DebtInstallment[],
        opts?: { fromDate?: string; rateio?: DebtAllocation[] },
    ): Promise<{ inseridas: number; removidas: number }> {
        if (!contract.organizationId) throw new Error('Contrato sem organização — nada a lançar.');

        const corte = opts?.fromDate ?? new Date().toISOString().slice(0, 10);
        const alvo = installments.filter(p => p.dueDate >= corte && p.status !== 'CANCELADA');

        const contas = await this.listComponentAccounts(contract.organizationId);
        const dims = dimensoesDoRateio(opts?.rateio ?? []);
        const projectId = await projectIdSeguro(dims.projectId);

        const credor = contract.institutionName ?? 'Instituição financeira';
        const identificacao = contract.contractNumber ? `Contrato ${contract.contractNumber}` : 'Financiamento';

        // ── 1. Remove o que existia daqui para a frente ────────────────────
        // Só as linhas deste contrato (prefixo) com vencimento >= corte. Sem o
        // filtro de data, uma regeração apagaria parcela paga de mês fechado.
        const { data: antigas, error: erroBusca } = await supabase
            .from('internal_transactions')
            .select('id')
            .eq('organization_id', contract.organizationId)
            .eq('source_system', DEBT_SOURCE_SYSTEM)
            .like('reference_id', `${contractPrefix(contract.id)}%`)
            .gte('due_date', corte);
        if (erroBusca) throw erroBusca;

        let removidas = 0;
        if (antigas?.length) {
            const { data: apagadas, error: erroDelete } = await supabase
                .from('internal_transactions')
                .delete()
                .in('id', antigas.map(r => r.id as string))
                .select('id');
            if (erroDelete) throw erroDelete;
            removidas = apagadas?.length ?? 0;
        }

        // ── 2. Uma linha por componente com valor ──────────────────────────
        const linhas = alvo.flatMap(parcela =>
            COMPONENTES
                .map(c => ({ ...c, valor: Number(parcela[c.campo] ?? 0) }))
                // Componente zerado não vira título: seis linhas de R$ 0,00 por
                // parcela poluiriam o Contas a Pagar sem informar nada.
                .filter(c => c.valor > 0)
                .map(c => ({
                    organization_id: contract.organizationId,
                    source_system: DEBT_SOURCE_SYSTEM,
                    reference_id: debtRefFor(contract.id, parcela.seq, c.key),
                    project_id: projectId,
                    cost_center_id: dims.costCenterId,
                    plano_de_contas_id: contas[c.key]?.planoDeContasId ?? null,
                    category_id: contas[c.key]?.categoryId ?? null,
                    category: contas[c.key]?.categoryName ?? c.label,
                    transaction_date: parcela.dueDate,
                    // Sem `due_date` a parcela nasce sem vencimento e nunca vira
                    // VENCIDO na vw_payables. Sem `business_status` a view depende
                    // do COALESCE defensivo. Preencher os dois, sempre.
                    due_date: parcela.dueDate,
                    competencia_date: parcela.competenciaDate ?? parcela.dueDate,
                    amount: c.valor,
                    direction: 'DEBIT',
                    description: `${identificacao} — parcela ${parcela.seq}: ${c.label}`,
                    // `internal_transactions.party_id` tem FK só para `clients`.
                    // Para instituição/fornecedor: supplier_id + party_name, e
                    // party_id fica NULL.
                    supplier_id: contract.institutionSupplierId ?? null,
                    party_type: 'SUPPLIER',
                    party_name: credor,
                    entity_name: credor,
                    status: 'PENDING',
                    business_status: 'PREVISTO',
                })),
        );

        if (linhas.length > 0) {
            const { error } = await supabase
                .from('internal_transactions')
                .upsert(linhas, { onConflict: 'organization_id,reference_id,entry_type' });
            if (error) throw error;
        }

        return { inseridas: linhas.length, removidas };
    },

    /**
     * Baixa da parcela: liquida as N linhas de componente de uma vez.
     *
     * As linhas compartilham o prefixo `debt-{contrato}-p{seq}-` e só ele — é
     * por isso que o `reference_id` foi desenhado assim. Um pagamento, N
     * títulos: baixar um a um deixaria a parcela meio paga se qualquer um
     * falhasse.
     */
    async settleInstallment(
        contract: DebtContract,
        installment: DebtInstallment,
        opts: { paymentDate: string; createdBy?: string; notes?: string },
    ): Promise<number> {
        if (!contract.organizationId) throw new Error('Contrato sem organização.');

        const prefixo = installmentPrefix(contract.id, installment.seq);
        const { data, error } = await supabase
            .from('internal_transactions')
            .update({
                status: 'CONCILIATED',
                business_status: 'PAGO',
                payment_date: opts.paymentDate,
            })
            .eq('organization_id', contract.organizationId)
            .eq('source_system', DEBT_SOURCE_SYSTEM)
            .like('reference_id', `${prefixo}%`)
            // No PostgREST um UPDATE que não casa nada é indistinguível de
            // sucesso. Pedir os ids e conferir o length é o que transforma
            // "não achei" em erro visível.
            .select('id');
        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error(
                `Nenhum título encontrado para a parcela ${installment.seq}. ` +
                'Gere as parcelas no Contas a Pagar antes de dar baixa.',
            );
        }

        await supabase.from('debt_installments').update({
            status: 'PAGA',
            paid_amount: installment.total,
            paid_at: opts.paymentDate,
        }).eq('id', installment.id);

        await this.registerEvent(contract, {
            eventType: 'PAGAMENTO',
            eventDate: opts.paymentDate,
            amount: installment.total,
            installmentId: installment.id,
            createdBy: opts.createdBy,
            notes: opts.notes,
            payload: { titulos: data.length, seq: installment.seq },
        });

        return data.length;
    },

    /** Registra um fato na terceira camada (o que de fato aconteceu). */
    async registerEvent(
        contract: DebtContract,
        evento: {
            eventType:
                | 'PAGAMENTO' | 'PAGAMENTO_PARCIAL' | 'AMORTIZACAO_EXTRAORDINARIA'
                | 'ANTECIPACAO' | 'RENEGOCIACAO' | 'RECLASSIFICACAO_ENCARGO'
                | 'DIVERGENCIA_BANCARIA' | 'LIBERACAO' | 'LIQUIDACAO';
            eventDate: string;
            amount?: number;
            installmentId?: string;
            payload?: Record<string, unknown>;
            notes?: string;
            createdBy?: string;
        },
    ): Promise<void> {
        const { error } = await supabase.from('debt_events').insert({
            organization_id: contract.organizationId,
            debt_contract_id: contract.id,
            debt_installment_id: evento.installmentId ?? null,
            event_type: evento.eventType,
            event_date: evento.eventDate,
            amount: evento.amount ?? 0,
            payload: evento.payload ?? null,
            notes: evento.notes ?? null,
            created_by: evento.createdBy ?? null,
        });
        if (error) throw error;
    },

    /** Eventos do contrato, mais recentes primeiro. */
    async listEvents(debtContractId: string): Promise<Record<string, unknown>[]> {
        const { data, error } = await supabase
            .from('debt_events')
            .select('id, event_type, event_date, amount, payload, notes, created_at')
            .eq('debt_contract_id', debtContractId)
            .order('event_date', { ascending: false })
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as Record<string, unknown>[];
    },

    /**
     * Remove os títulos do contrato a partir de uma data — o corte que uma
     * renegociação faz antes de regerar. Nunca toca o passado.
     */
    async removeFrom(contract: DebtContract, fromDate: string): Promise<number> {
        if (!contract.organizationId) return 0;
        const { data, error } = await supabase
            .from('internal_transactions')
            .delete()
            .eq('organization_id', contract.organizationId)
            .eq('source_system', DEBT_SOURCE_SYSTEM)
            .like('reference_id', `${contractPrefix(contract.id)}%`)
            .gte('due_date', fromDate)
            // Título já conciliado não se apaga: `reconciliation_matches` tem FK
            // RESTRICT, e o DELETE falharia no meio do lote deixando o corte
            // pela metade.
            .neq('status', 'CONCILIATED')
            .select('id');
        if (error) throw error;
        return data?.length ?? 0;
    },
};
