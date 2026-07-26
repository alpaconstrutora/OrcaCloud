import { supabase } from '../lib/supabase';
import { contractService, nextRentalNumber, removeContractTransactionsFrom } from './contractService';
import { contractIndexService, normalizeIndexName, IndexName } from './contractIndexService';
import { commercialFinanceService } from './commercialFinanceService';
import { Contract } from '../types';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Renovação de contratos de LOCAÇÃO
 * ─────────────────────────────────────────────────────────────────────────
 * Renovar NÃO é aditivo (`contract_addendums`): cria um contrato FILHO novo,
 * com número (`CL-{ano}-{seq}`), vigência e parcelas próprias, ligado ao pai
 * por `contracts.parent_contract_id`. O pai é encerrado e suas parcelas
 * PENDENTES a partir do início do filho são cortadas.
 *
 * Fica em arquivo separado porque `contractService.ts` já passa de 2 mil
 * linhas — e porque a cadeia de renovação é um conceito só de Locações.
 * Consumidores importam DIRETO daqui (reexportar em `contractService` criaria
 * import circular, já que este módulo importa aquele).
 */

// Colunas necessárias para clonar o pai. `getContractById` não serve: o select
// dele não traz domain/deal_id/guarantor_name/parent_contract_id.
const RENEWAL_COLS =
    'id, organization_id, project_id, client_id, supplier_id, deal_id, number, title, description, ' +
    'contract_type, nature, domain, direction, status, start_date, end_date, is_recurring, billing_cycle, ' +
    'due_day, payment_days, payment_method, original_value, current_value, reajuste_index, ' +
    'reajuste_data_base, reajuste_proximo, guarantor_name, rescission_penalty_months, retention_rate, ' +
    'empresa_id, cost_center_id, category_id, responsible_email, client_responsible, internal_responsible, ' +
    'parent_contract_id, renewal_seq, renewed_at, renewal_notice_days, created_at';

// ─── Datas: aritmética em UTC puro ────────────────────────────────────────
// Nunca `new Date('YYYY-MM-DD').toLocaleDateString()` — em UTC-3 isso retrocede
// um dia e a vigência do contrato aparece errada.

const toISO = (d: Date) => d.toISOString().slice(0, 10);
const parseISO = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
};
const addDaysUTC = (iso: string, days: number) => {
    const d = parseISO(iso);
    d.setUTCDate(d.getUTCDate() + days);
    return toISO(d);
};
/** Soma meses com clamp de fim de mês: 31/01 + 1 mês = 28/02, nunca 03/03. */
const addMonthsUTC = (iso: string, months: number) => {
    const d = parseISO(iso);
    const day = d.getUTCDate();
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return toISO(target);
};
const todayISO = () => toISO(new Date());
const daysBetween = (fromISO: string, toISOStr: string) =>
    Math.round((parseISO(toISOStr).getTime() - parseISO(fromISO).getTime()) / 86400000);

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface RenewalPreview {
    parent: Contract;
    /** Fim da vigência do pai + 1 dia — nunca há sobreposição de parcelas. */
    startDate: string;
    endDate: string;
    months: number;
    /** Valor vigente do pai (base do reajuste). */
    currentValue: number;
    /** Valor do filho, já reajustado. */
    newValue: number;
    /** 1 quando não houve reajuste. */
    fator: number;
    index?: {
        name: string;
        baseMonth: string; baseValue: number;
        currentMonth: string; currentValue: number;
    };
    /** Por que o reajuste não pôde ser calculado (índice ausente, sem data-base…). */
    reajusteWarning?: string;
    /** Parcelas PENDENTES do pai que serão canceladas (>= startDate). */
    pendingToCancel: number;
    nextNumber: string;
}

export interface RenewOptions {
    /** Duração da nova vigência. Ignorado se `endDate` for informado. Default 12. */
    months?: number;
    endDate?: string;
    /** Default: true quando o pai tem `reajuste_index`. */
    applyReajuste?: boolean;
    indexName?: IndexName;
    /** Override manual do par de índices (dispensa contract_index_values). */
    indexBase?: number;
    indexValue?: number;
    /** Override total do valor — ignora o índice. */
    newValue?: number;
    notes?: string;
    /** Default true → o pai vira 'Encerrado'. */
    closeParent?: boolean;
}

export interface ExpiringRental extends Contract {
    days_until_end: number;
}

// ─── Interno ──────────────────────────────────────────────────────────────

async function fetchContract(id: string): Promise<Contract> {
    const { data, error } = await supabase
        .from('contracts')
        .select(RENEWAL_COLS)
        .eq('id', id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Contrato não encontrado.');
    return data as unknown as Contract;
}

async function findChild(parentId: string): Promise<{ id: string; number: string } | null> {
    const { data } = await supabase
        .from('contracts')
        .select('id, number')
        .eq('parent_contract_id', parentId)
        .maybeSingle();
    return (data as { id: string; number: string } | null) ?? null;
}

function assertRenewable(parent: Contract, child: { number: string } | null) {
    if (parent.domain !== 'LOCACAO' || !parent.is_recurring) {
        throw new Error('Renovação disponível apenas para contratos de locação recorrentes.');
    }
    if (!['Ativo', 'Assinado'].includes(parent.status)) {
        throw new Error(`Não é possível renovar um contrato com status "${parent.status}". O contrato deve estar "Ativo" ou "Assinado".`);
    }
    if (!parent.end_date) {
        throw new Error('Contrato sem fim de vigência. Informe o término do contrato antes de renovar.');
    }
    if (child) {
        throw new Error(`Este contrato já foi renovado pelo contrato ${child.number}.`);
    }
}

/**
 * Conta as parcelas PENDENTES do pai que caem a partir do início do filho.
 *
 * Locação tem DUAS origens possíveis de parcela e o pai pode estar em qualquer
 * uma: contrato ORIGINAL é faturado pela negociação (`tx-{dealId}-...`);
 * contrato que já é fruto de renovação fatura por si (`CONTRACT_RECURRING`).
 */
async function countPendingFrom(parent: Contract, fromDate: string): Promise<number> {
    if (!parent.organization_id) return 0;

    const { count: byContract } = await supabase
        .from('internal_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', parent.organization_id)
        .eq('source_system', 'CONTRACT_RECURRING')
        .eq('reference_id', parent.id)
        .eq('status', 'PENDING')
        .gte('due_date', fromDate);

    let byDeal = 0;
    if (parent.deal_id) {
        const { count } = await supabase
            .from('internal_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', parent.organization_id)
            .eq('status', 'PENDING')
            .gte('due_date', fromDate)
            .like('reference_id', `tx-${parent.deal_id}-%`);
        byDeal = count ?? 0;
    }

    return (byContract ?? 0) + byDeal;
}

// ─── Serviço ──────────────────────────────────────────────────────────────

export const contractRenewalService = {
    /**
     * Cálculo puro + leitura dos índices. NÃO escreve nada — alimenta o Sheet
     * de renovação para o usuário conferir datas e valor antes de confirmar.
     */
    previewRenewal: async (parentContractId: string, opts: RenewOptions = {}): Promise<RenewalPreview> => {
        const parent = await fetchContract(parentContractId);
        assertRenewable(parent, await findChild(parent.id));

        const months = opts.months ?? 12;
        const startDate = addDaysUTC(parent.end_date!, 1);
        // Vigência fechada: início + N meses − 1 dia (12 meses a partir de 01/03
        // termina em 28/02, não em 01/03 — senão os dois contratos se sobrepõem).
        const endDate = opts.endDate ?? addDaysUTC(addMonthsUTC(startDate, months), -1);

        const currentValue = parent.current_value ?? parent.original_value ?? 0;
        const indexName = opts.indexName ?? normalizeIndexName(parent.reajuste_index);
        const wantsReajuste = opts.applyReajuste ?? Boolean(indexName);

        let newValue = currentValue;
        let fator = 1;
        let index: RenewalPreview['index'];
        let reajusteWarning: string | undefined;

        if (opts.newValue != null) {
            newValue = opts.newValue;
            fator = currentValue > 0 ? newValue / currentValue : 1;
        } else if (wantsReajuste) {
            if (!indexName || indexName === 'OUTROS') {
                reajusteWarning = 'Contrato sem índice de reajuste definido. Informe o novo valor manualmente.';
            } else if (opts.indexBase != null && opts.indexValue != null) {
                fator = opts.indexValue / opts.indexBase;
                newValue = parseFloat((currentValue * fator).toFixed(2));
            } else {
                const baseDate = parent.reajuste_data_base || parent.start_date;
                const [baseRow, currentRow] = await Promise.all([
                    contractIndexService.getClosestTo(indexName, baseDate, parent.organization_id),
                    contractIndexService.getClosestTo(indexName, todayISO(), parent.organization_id),
                ]);
                if (!baseRow || !currentRow || baseRow.value <= 0) {
                    // Falta de série cadastrada NÃO bloqueia a renovação — seria pior
                    // travar o contrato por falta de IGP-M no cadastro.
                    reajusteWarning = `Índice ${indexName} não encontrado para as datas necessárias. Cadastre os valores em Configurações do Sistema ou informe o novo valor manualmente.`;
                } else {
                    fator = currentRow.value / baseRow.value;
                    newValue = parseFloat((currentValue * fator).toFixed(2));
                    index = {
                        name: indexName,
                        baseMonth: baseRow.reference_month, baseValue: baseRow.value,
                        currentMonth: currentRow.reference_month, currentValue: currentRow.value,
                    };
                }
            }
        }

        return {
            parent,
            startDate,
            endDate,
            months,
            currentValue,
            newValue,
            fator,
            index,
            reajusteWarning,
            pendingToCancel: await countPendingFrom(parent, startDate),
            nextNumber: await nextRentalNumber(parent.organization_id, parseISO(startDate).getUTCFullYear()),
        };
    },

    /**
     * Efetiva a renovação. Ordem importa: o filho nasce ANTES de o pai ser
     * tocado — se o insert falhar, nada muda no contrato existente.
     */
    renewContract: async (
        parentContractId: string,
        opts: RenewOptions = {},
    ): Promise<{ child: Contract; parent: Contract; preview: RenewalPreview }> => {
        const preview = await contractRenewalService.previewRenewal(parentContractId, opts);
        const parent = preview.parent;
        const { startDate, endDate, newValue } = preview;

        // ── 1) Número do filho (desambigua colisão com sufixo estável) ──────
        const seq = (parent.renewal_seq ?? 0) + 1;
        let number = preview.nextNumber;
        const { data: collision } = await supabase
            .from('contracts')
            .select('id')
            .eq('organization_id', parent.organization_id)
            .eq('number', number)
            .maybeSingle();
        if (collision) number = `${number}-R${seq}`;

        const indexName = opts.indexName ?? normalizeIndexName(parent.reajuste_index);

        // ── 2) Cria o filho ─────────────────────────────────────────────────
        // createContract dispara syncRecurringToFinance sozinho quando há
        // is_recurring + start_date + end_date + original_value > 0.
        const child = await contractService.createContract({
            organization_id: parent.organization_id,
            // REGRA #2: parcela de comercial nunca carrega projeto de sistema.
            // Locação org-level tem project_id nulo e as parcelas vão para
            // internal_transactions com project_id = null.
            project_id: parent.project_id ?? undefined,
            client_id: parent.client_id,
            supplier_id: parent.supplier_id,
            // ⚠️ deal_id NÃO é herdado. `getContractByDealId` usa .maybeSingle():
            // dois contratos com o mesmo deal_id quebram o DealModal (PGRST116) e
            // a idempotência de createFromDeal. O vínculo com a negociação é
            // indireto: filho → parent_contract_id → pai → deal_id.
            parent_contract_id: parent.id,
            renewal_seq: seq,
            renewed_at: todayISO(),
            renewal_notice_days: parent.renewal_notice_days,
            number,
            title: parent.title,
            description: `[Renovação de ${parent.number}]${opts.notes ? ` ${opts.notes}` : ''}`,
            contract_type: 'Contrato Recorrente',
            nature: 'Locação',
            direction: 'INCOMING',
            domain: 'LOCACAO',
            status: 'Ativo',
            is_recurring: true,
            start_date: startDate,
            end_date: endDate,
            original_value: newValue,
            billing_cycle: parent.billing_cycle ?? 'Mensal',
            due_day: parent.due_day,
            // payment_days = 0 é OBRIGATÓRIO. No pai esse campo é o offset entre a
            // data do deal e o 1º vencimento; herdado, empurraria a 1ª parcela do
            // filho para fora da vigência. Com 0 + due_day herdado, o sync ancora
            // na 1ª ocorrência do dia de vencimento >= startDate.
            payment_days: 0,
            reajuste_index: indexName ?? parent.reajuste_index,
            reajuste_data_base: startDate,
            reajuste_proximo: addMonthsUTC(startDate, 12),
            guarantor_name: parent.guarantor_name,
            rescission_penalty_months: parent.rescission_penalty_months,
            retention_rate: parent.retention_rate ?? 0,
            payment_method: parent.payment_method,
            empresa_id: parent.empresa_id,
            cost_center_id: parent.cost_center_id,
            category_id: parent.category_id,
            responsible_email: parent.responsible_email,
            client_responsible: parent.client_responsible,
            internal_responsible: parent.internal_responsible,
        } as Omit<Contract, 'id' | 'created_at' | 'current_value'>);

        // ── 3) Encerra o pai ────────────────────────────────────────────────
        // reajuste_proximo = null tira o pai da fila de reajuste
        // (listDueForReajuste filtra status='Ativo' + reajuste_proximo <= hoje;
        // o status já bastaria, mas zerar evita ressuscitar a fila se alguém
        // reabrir o contrato). Os valores do pai ficam intactos — o histórico
        // financeiro dele tem que continuar batendo.
        let updatedParent = parent;
        if (opts.closeParent !== false) {
            updatedParent = await contractService.updateContract(parent.id, {
                status: 'Encerrado',
                reajuste_proximo: undefined,
            });
        }

        // ── 4) Corta as parcelas futuras do pai ─────────────────────────────
        await contractRenewalService._cutFutureInstallments(parent, startDate);

        return { child, parent: updatedParent, preview };
    },

    /**
     * Remove as parcelas PENDENTES do pai a partir de `fromDate`. Nunca toca em
     * pago/conciliado nem em vencimento anterior ao corte.
     *
     * Na prática o pai não deveria ter parcela além do próprio `end_date`, mas
     * contratos legados nasceram sem `end_date` e o sync gerou 12 ciclos à
     * frente — é esse resíduo que o corte limpa.
     */
    _cutFutureInstallments: async (parent: Contract, fromDate: string): Promise<void> => {
        // Série da NEGOCIAÇÃO: é ela que fatura o contrato de locação original.
        // O que ela tiver a partir do início do filho colidiria com as parcelas
        // do filho — mesmo aluguel cobrado duas vezes.
        if (parent.deal_id && parent.organization_id) {
            try {
                await commercialFinanceService.deleteDealInstallmentsFrom(
                    parent.deal_id, parent.organization_id, fromDate);
            } catch (e) {
                console.error('[RENEWAL] Erro ao cortar parcelas da negociação:', e);
            }
        }

        // Contrato vinculado a obra: as parcelas vivem no JSONB do projeto.
        if (parent.project_id) {
            await removeContractTransactionsFrom(parent.id, parent.organization_id, parent.project_id, fromDate);
            return;
        }
        if (!parent.organization_id) return;
        const { error } = await supabase
            .from('internal_transactions')
            .delete()
            .eq('organization_id', parent.organization_id)
            .eq('source_system', 'CONTRACT_RECURRING')
            .eq('reference_id', parent.id)
            .eq('status', 'PENDING')
            .gte('due_date', fromDate);
        if (error) {
            // RLS pode barrar DELETE mas permitir UPDATE — cancelar equivale para
            // o financeiro (a parcela some das telas de previsto/a receber).
            console.warn('[RENEWAL] delete de parcelas futuras falhou, cancelando:', error.message);
            await supabase
                .from('internal_transactions')
                .update({ status: 'CANCELLED', business_status: 'CANCELADO' })
                .eq('organization_id', parent.organization_id)
                .eq('source_system', 'CONTRACT_RECURRING')
                .eq('reference_id', parent.id)
                .eq('status', 'PENDING')
                .gte('due_date', fromDate);
        }
    },

    /** Cadeia completa, do contrato original ao último filho, em ordem cronológica. */
    getRenewalChain: async (contractId: string): Promise<Contract[]> => {
        // Sobe até o original
        let root = await fetchContract(contractId);
        const guard = new Set<string>([root.id]);
        while (root.parent_contract_id && !guard.has(root.parent_contract_id)) {
            guard.add(root.parent_contract_id);
            try { root = await fetchContract(root.parent_contract_id); } catch { break; }
        }
        // Desce pelos filhos
        const chain: Contract[] = [root];
        let cursor = root;
        for (let i = 0; i < 50; i++) {
            const { data } = await supabase
                .from('contracts')
                .select(RENEWAL_COLS)
                .eq('parent_contract_id', cursor.id)
                .maybeSingle();
            if (!data) break;
            cursor = data as unknown as Contract;
            chain.push(cursor);
        }
        return chain;
    },

    /**
     * Fila da aba Renovações: locações que vencem em até N dias — incluindo as
     * já vencidas (`days_until_end` negativo, que a fila precisa mostrar, não
     * esconder) — e que ainda não foram renovadas.
     *
     * REGRA #5: `organizationId` nulo ("Todas as organizações") NÃO bloqueia a
     * leitura; apenas não filtra por org e deixa a RLS recortar.
     */
    listRentalsExpiring: async (
        organizationId: string | null | undefined,
        daysAhead = 90,
    ): Promise<ExpiringRental[]> => {
        const today = todayISO();
        let q = supabase
            .from('contracts')
            .select('id, organization_id, number, title, client_id, status, end_date, start_date, ' +
                    'current_value, original_value, billing_cycle, due_day, reajuste_index, ' +
                    'reajuste_proximo, parent_contract_id, renewal_seq, domain, is_recurring')
            .eq('domain', 'LOCACAO')
            .eq('is_recurring', true)
            .in('status', ['Ativo', 'Assinado'])
            .not('end_date', 'is', null)
            .lte('end_date', addDaysUTC(today, daysAhead))
            .order('end_date', { ascending: true });
        if (organizationId) q = q.eq('organization_id', organizationId);

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as unknown as Contract[];
        if (rows.length === 0) return [];

        // Contratos já renovados saem da fila.
        const { data: children } = await supabase
            .from('contracts')
            .select('parent_contract_id')
            .in('parent_contract_id', rows.map(r => r.id));
        const renewed = new Set((children ?? []).map(c => c.parent_contract_id as string));

        return rows
            .filter(r => !renewed.has(r.id))
            .map(r => ({ ...r, days_until_end: daysBetween(today, r.end_date!) }));
    },

    /**
     * Desfaz uma renovação feita por engano. Só é permitido enquanto nenhuma
     * parcela do filho foi paga — depois disso o caminho correto é rescisão.
     */
    undoRenewal: async (childContractId: string): Promise<void> => {
        const child = await fetchContract(childContractId);
        if (!child.parent_contract_id) throw new Error('Este contrato não é uma renovação.');

        if (child.organization_id) {
            const { count } = await supabase
                .from('internal_transactions')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', child.organization_id)
                .eq('source_system', 'CONTRACT_RECURRING')
                .eq('reference_id', child.id)
                .neq('status', 'PENDING');
            if ((count ?? 0) > 0) {
                throw new Error('A renovação já tem parcelas pagas ou conciliadas. Desfazer não é possível — use a rescisão do contrato.');
            }
            await supabase
                .from('internal_transactions')
                .delete()
                .eq('organization_id', child.organization_id)
                .eq('source_system', 'CONTRACT_RECURRING')
                .eq('reference_id', child.id);
        }

        await supabase.from('contracts').delete().eq('id', child.id);

        // Reabre o pai e regenera as parcelas que o corte havia removido.
        const parent = await fetchContract(child.parent_contract_id);
        const reopened = await contractService.updateContract(parent.id, {
            status: 'Ativo',
            reajuste_proximo: parent.reajuste_proximo || addMonthsUTC(parent.reajuste_data_base || parent.start_date, 12),
        });
        await regenerateParentInstallments({ ...parent, ...reopened });
    },
};

/**
 * Regenera as parcelas do contrato-pai depois de desfazer uma renovação.
 *
 * `syncContractToFinance` re-insere a série INTEIRA desde o início — o que
 * duplicaria as parcelas já pagas que o corte preservou. Por isso: apaga as
 * PENDENTES remanescentes, deixa o sync recriar tudo e remove em seguida o que
 * colidiu com o período já quitado.
 */
async function regenerateParentInstallments(parent: Contract): Promise<void> {
    if (!parent.organization_id || parent.project_id) {
        // Parcelas no JSONB do projeto: o sync do contrato já faz o replace por tag.
        await contractService.syncContractToFinance(parent);
        return;
    }
    const { data: existing } = await supabase
        .from('internal_transactions')
        .select('due_date, status')
        .eq('organization_id', parent.organization_id)
        .eq('source_system', 'CONTRACT_RECURRING')
        .eq('reference_id', parent.id);

    const settled = (existing ?? []).filter(r => r.status !== 'PENDING');
    const keptMax = settled.reduce<string | null>(
        (max, r) => (!max || (r.due_date as string) > max ? (r.due_date as string) : max), null);

    await supabase.from('internal_transactions')
        .delete()
        .eq('organization_id', parent.organization_id)
        .eq('source_system', 'CONTRACT_RECURRING')
        .eq('reference_id', parent.id)
        .eq('status', 'PENDING');

    await contractService.syncContractToFinance(parent);

    if (keptMax) {
        // O sync recria também o período já quitado (sempre como PENDING) — apaga
        // essa sobreposição para não duplicar o que já foi pago.
        await supabase.from('internal_transactions')
            .delete()
            .eq('organization_id', parent.organization_id)
            .eq('source_system', 'CONTRACT_RECURRING')
            .eq('reference_id', parent.id)
            .eq('status', 'PENDING')
            .lte('due_date', keptMax);
    }
}
