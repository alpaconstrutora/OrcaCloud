import { supabase } from '../lib/supabase';
import {
    contractService, nextRentalNumber, removeContractTransactionsFrom, buildRecurringDueDates,
} from './contractService';
import { contractIndexService, normalizeIndexName, IndexName } from './contractIndexService';
import { commercialFinanceService } from './commercialFinanceService';
import { rentalGuaranteeService } from './rentalGuaranteeService';
import { Contract, ContractAddendum } from '../types';

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
    /** Via escolhida. */
    mode: RenewalMode;
    /** ADITIVO: quantas parcelas o período prorrogado vai gerar. */
    installmentsToGenerate: number;
    /** ADITIVO: número do próximo aditivo (AD-00X). */
    nextAddendumNumber?: string;
}

/**
 * As duas vias de renovação:
 *  • NOVO_CONTRATO — contrato-filho com numeração e parcelas próprias; o pai é
 *    encerrado. É o comportamento original (mantido como default).
 *  • ADITIVO — o MESMO contrato tem a vigência estendida por um aditivo de
 *    prorrogação; o contrato não é encerrado e nada anterior é tocado.
 */
export type RenewalMode = 'NOVO_CONTRATO' | 'ADITIVO';

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
    /** Default true → o pai vira 'Encerrado'. Só vale em NOVO_CONTRATO. */
    closeParent?: boolean;
    /** Via da renovação. Default 'NOVO_CONTRATO' (compatibilidade). */
    mode?: RenewalMode;
    /** NOVO_CONTRATO: herdar os termos do pai. Default true. */
    inheritTerms?: boolean;
    /** Só usado com inheritTerms=false — sobrescreve o que seria herdado. */
    overrides?: Partial<Pick<Contract,
        'billing_cycle' | 'due_day' | 'payment_method' | 'reajuste_index' |
        'guarantor_name' | 'rescission_penalty_months' |
        'client_responsible' | 'internal_responsible'>>;
    /** ADITIVO: aprovar (e gerar as parcelas) na mesma ação. Default true. */
    autoApprove?: boolean;
}

export interface ExpiringRental extends Contract {
    /** Dias até o fim da vigência (negativo = vencido). null = contrato sem `end_date`. */
    days_until_end: number | null;
    /** Já foi renovado — tem contrato-filho. */
    renewed: boolean;
    /** Número do contrato-filho, quando existe. */
    renewed_by?: string;
    /** Id do contrato-filho — alimenta o "excluir renovação" da fila. */
    renewed_child_id?: string;
    /** Última prorrogação por aditivo deste contrato, se houver. */
    last_addendum?: { id: string; number: string };
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
        .like('reference_id', `${parent.id}%`)
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

        const mode: RenewalMode = opts.mode ?? 'NOVO_CONTRATO';
        // No ADITIVO o contrato não é encerrado: nada é "cancelado", só se corta
        // o resíduo da negociação que invadiria o período novo. Por isso
        // pendingToCancel só faz sentido na via do contrato-filho.
        const pending = await countPendingFrom(parent, startDate);

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
            mode,
            pendingToCancel: mode === 'ADITIVO' ? 0 : pending,
            installmentsToGenerate: mode === 'ADITIVO'
                ? buildRecurringDueDates({
                    startDate: parent.start_date,
                    from: startDate,
                    to: endDate,
                    dueDay: parent.due_day,
                    billingCycle: parent.billing_cycle,
                    paymentDays: parent.payment_days,
                }).length
                : 0,
            nextNumber: await nextRentalNumber(parent.organization_id, parseISO(startDate).getUTCFullYear()),
            nextAddendumNumber: mode === 'ADITIVO'
                ? await contractService.nextAddendumNumber(parent.id)
                : undefined,
        };
    },

    /**
     * Renovação por ADITIVO: estende o próprio contrato, sem encerrá-lo.
     *
     * O aditivo nasce ANTES de qualquer efeito no contrato — se o insert
     * falhar, nada muda. A aprovação (que estende a vigência e gera as
     * parcelas) fica em contractService.approveAddendum, que é o mesmo caminho
     * de quem aprova pela aba Aditivos.
     */
    renewByAddendum: async (
        parentContractId: string,
        opts: RenewOptions = {},
    ): Promise<{ addendum: ContractAddendum; parent: Contract; preview: RenewalPreview }> => {
        const preview = await contractRenewalService.previewRenewal(
            parentContractId, { ...opts, mode: 'ADITIVO' });
        const parent = preview.parent;

        // Um aditivo de prorrogação pendente para o mesmo período já basta —
        // dois abertos gerariam parcelas em dobro quando ambos fossem aprovados.
        const { data: pendentes } = await supabase
            .from('contract_addendums')
            .select('id, number, new_start_date, status')
            .eq('contract_id', parent.id)
            .eq('status', 'Pendente')
            .not('new_start_date', 'is', null);
        const conflito = (pendentes || []).find(a => a.new_start_date === preview.startDate);
        if (conflito) {
            throw new Error(`Já existe o aditivo ${conflito.number} pendente para este período. Aprove ou cancele antes de criar outro.`);
        }

        const number = preview.nextAddendumNumber ?? await contractService.nextAddendumNumber(parent.id);
        const mesmoValor = Math.abs(preview.newValue - preview.currentValue) < 0.01;

        // Mudanças de condição no período renovado (periodicidade, dia de
        // vencimento, índice). Precisam entrar no CONTRATO antes da aprovação:
        // é o contrato que o gerador de parcelas lê para montar os vencimentos.
        const mudancas: Record<string, unknown> = {};
        if (opts.overrides?.billing_cycle && opts.overrides.billing_cycle !== parent.billing_cycle) {
            mudancas.billing_cycle = opts.overrides.billing_cycle;
        }
        if (opts.overrides?.due_day != null && opts.overrides.due_day !== parent.due_day) {
            mudancas.due_day = opts.overrides.due_day;
        }
        if (opts.overrides?.reajuste_index && opts.overrides.reajuste_index !== parent.reajuste_index) {
            mudancas.reajuste_index = opts.overrides.reajuste_index;
        }

        const addendum = await contractService.createAddendum({
            contract_id: parent.id,
            organization_id: parent.organization_id,
            number,
            // 'Prazo' quando só estende; 'Ambos' quando também reajusta.
            type: mesmoValor ? 'Prazo' : 'Ambos',
            description: `Prorrogação de vigência até ${preview.endDate}`
                + (mesmoValor ? '' : ` com reajuste para ${preview.newValue.toFixed(2)}`)
                + (opts.notes ? ` — ${opts.notes}` : ''),
            // ⚠️ ZERO de propósito: em contrato recorrente o aditivo troca a
            // mensalidade (new_value), não soma um montante ao contrato.
            // Preencher aqui faria updateContract inflar o valor do contrato.
            value_impact: 0,
            new_end_date: preview.endDate,
            new_start_date: preview.startDate,
            previous_end_date: parent.end_date,
            new_value: preview.newValue,
            previous_value: preview.currentValue,
            reajuste_index: preview.index?.name ?? parent.reajuste_index,
            reajuste_fator: preview.fator,
            notes: opts.notes,
        } as Omit<ContractAddendum, 'id' | 'created_at' | 'status' | 'approved_at'>);

        // Aplica as mudanças de condição ANTES de aprovar — o gerador de
        // parcelas lê ciclo e dia de vencimento do contrato.
        if (Object.keys(mudancas).length > 0) {
            const { error: errMud } = await supabase.from('contracts').update(mudancas).eq('id', parent.id);
            if (errMud) throw errMud;
        }

        if (opts.autoApprove !== false) {
            await contractService.approveAddendum(addendum.id, 'Renovação');
        }

        // Prorrogação por aditivo: o contrato é o MESMO, então a garantia
        // continua ativa (desativá-la deixaria um contrato vigente descoberto),
        // mas passa a exigir reanálise — a vigência que ela cobria acabou.
        try {
            await rentalGuaranteeService.onContractRenewed(parent.id, { deactivate: false });
        } catch (e) {
            console.error('[RENEWAL] Falha ao marcar a garantia para reanálise:', e);
        }

        const updatedParent = await fetchContract(parent.id);
        const saved = await contractService.getAddendumById(addendum.id);
        return { addendum: saved ?? addendum, parent: updatedParent, preview };
    },

    /** Despachante das duas vias — é o que a UI chama. */
    renew: async (parentContractId: string, opts: RenewOptions = {}) =>
        opts.mode === 'ADITIVO'
            ? contractRenewalService.renewByAddendum(parentContractId, opts)
            : contractRenewalService.renewContract(parentContractId, opts),

    /**
     * Desfaz uma prorrogação por aditivo. Espelho de `undoRenewal`: só enquanto
     * nenhuma parcela do período novo tiver sido paga ou conciliada.
     */
    undoAddendumRenewal: async (addendumId: string): Promise<void> => {
        const addendum = await contractService.getAddendumById(addendumId);
        if (!addendum) throw new Error('Aditivo não encontrado.');
        if (!addendum.new_start_date || !addendum.new_end_date) {
            throw new Error('Este aditivo não é uma prorrogação de vigência.');
        }
        const contract = await fetchContract(addendum.contract_id);

        if (contract.organization_id) {
            const { count } = await supabase
                .from('internal_transactions')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', contract.organization_id)
                .eq('source_system', 'CONTRACT_RECURRING')
                .like('reference_id', `${contract.id}%`)
                .gte('due_date', addendum.new_start_date)
                .neq('status', 'PENDING');
            if ((count ?? 0) > 0) {
                throw new Error('O período prorrogado já tem parcelas pagas ou conciliadas. Desfazer não é possível — use a rescisão do contrato.');
            }
            await supabase
                .from('internal_transactions')
                .delete()
                .eq('organization_id', contract.organization_id)
                .eq('source_system', 'CONTRACT_RECURRING')
                .like('reference_id', `${contract.id}%`)
                .gte('due_date', addendum.new_start_date);
        }

        await supabase
            .from('contracts')
            .update({
                end_date: addendum.previous_end_date ?? null,
                current_value: addendum.previous_value ?? contract.current_value,
                reajuste_data_base: contract.reajuste_data_base,
            })
            .eq('id', contract.id);

        await supabase
            .from('contract_addendums')
            .update({ status: 'Cancelado', installments_generated: 0 })
            .eq('id', addendumId);
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

        // Termo do contrato-filho: por padrão herda o do pai; com
        // `inheritTerms: false` o que vier em `overrides` prevalece (campo não
        // informado continua herdando — o Sheet pré-preenche com o valor atual).
        const herda = opts.inheritTerms !== false;
        const termo = <K extends keyof Contract>(campo: K): Contract[K] =>
            (!herda && opts.overrides && opts.overrides[campo as keyof typeof opts.overrides] !== undefined
                ? (opts.overrides[campo as keyof typeof opts.overrides] as Contract[K])
                : parent[campo]);

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
            // Termos herdados do pai; `overrides` só é considerado quando o
            // usuário desmarca "aproveitar os mesmos termos" no Sheet.
            billing_cycle: termo('billing_cycle') ?? 'Mensal',
            due_day: termo('due_day'),
            // payment_days = 0 é OBRIGATÓRIO. No pai esse campo é o offset entre a
            // data do deal e o 1º vencimento; herdado, empurraria a 1ª parcela do
            // filho para fora da vigência. Com 0 + due_day herdado, o sync ancora
            // na 1ª ocorrência do dia de vencimento >= startDate.
            payment_days: 0,
            reajuste_index: opts.overrides?.reajuste_index ?? indexName ?? parent.reajuste_index,
            reajuste_data_base: startDate,
            reajuste_proximo: addMonthsUTC(startDate, 12),
            guarantor_name: termo('guarantor_name'),
            rescission_penalty_months: termo('rescission_penalty_months'),
            retention_rate: parent.retention_rate ?? 0,
            payment_method: termo('payment_method'),
            empresa_id: parent.empresa_id,
            cost_center_id: parent.cost_center_id,
            category_id: parent.category_id,
            responsible_email: parent.responsible_email,
            client_responsible: termo('client_responsible'),
            internal_responsible: termo('internal_responsible'),
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

        // ── 5) Garantia locatícia: NÃO é herdada ────────────────────────────
        // Decisão de produto (2026-07-28): renovar exige reanálise explícita da
        // garantia. `guarantor_name` é clonado acima só porque é campo de texto
        // dos modelos .docx — a garantia de verdade (fiador analisado, apólice,
        // caução) fica encerrada no pai com `requires_reanalysis`, e o filho
        // nasce sem garantia ativa até alguém aprovar. Falhar aqui não pode
        // desfazer a renovação, que já está gravada: registra e segue.
        try {
            await rentalGuaranteeService.onContractRenewed(parent.id);
        } catch (e) {
            console.error('[RENEWAL] Falha ao marcar a garantia para reanálise:', e);
        }

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
            .like('reference_id', `${parent.id}%`)
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
                .like('reference_id', `${parent.id}%`)
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
        daysAhead: number | null = 90,
        /** Inclui contratos já encerrados (consulta/auditoria e reabertura). */
        includeClosed = false,
    ): Promise<ExpiringRental[]> => {
        const today = todayISO();
        let q = supabase
            .from('contracts')
            .select('id, organization_id, number, title, client_id, status, end_date, start_date, ' +
                    'current_value, original_value, billing_cycle, due_day, reajuste_index, ' +
                    'reajuste_proximo, parent_contract_id, renewal_seq, domain, is_recurring, deal_id')
            .eq('domain', 'LOCACAO')
            .in('status', includeClosed ? ['Ativo', 'Assinado', 'Encerrado'] : ['Ativo', 'Assinado'])
            .order('end_date', { ascending: true, nullsFirst: false });
        if (organizationId) q = q.eq('organization_id', organizationId);
        // daysAhead null = TODOS os contratos vigentes, inclusive os sem vigência
        // definida e os que terminam longe. Sem isso, contrato fora da janela fica
        // invisível na tela — e sem tela não há como encerrá-lo nem corrigi-lo.
        if (daysAhead != null) q = q.not('end_date', 'is', null).lte('end_date', addDaysUTC(today, daysAhead));

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as unknown as Contract[];
        if (rows.length === 0) return [];

        // Contratos já renovados continuam na lista, mas marcados — some o botão
        // Renovar e aparece o número do filho. Esconder confundia ("sumiu?").
        const ids = rows.map(r => r.id);
        const { data: children } = await supabase
            .from('contracts')
            .select('id, parent_contract_id, number')
            .in('parent_contract_id', ids);
        const childByParent = new Map(
            (children ?? []).map(c => [c.parent_contract_id as string, c]));

        // Última prorrogação por aditivo de cada contrato — é o que o botão
        // "excluir renovação" da fila desfaz quando a renovação foi por aditivo
        // (aí não há contrato-filho, o próprio contrato foi estendido).
        const { data: adds } = await supabase
            .from('contract_addendums')
            .select('id, number, contract_id, status, created_at')
            .in('contract_id', ids)
            .not('new_start_date', 'is', null)
            .neq('status', 'Cancelado')
            .order('created_at', { ascending: false });
        const lastAddendum = new Map<string, { id: string; number: string }>();
        (adds ?? []).forEach(a => {
            const k = a.contract_id as string;
            if (!lastAddendum.has(k)) lastAddendum.set(k, { id: a.id as string, number: a.number as string });
        });

        return rows.map(r => ({
            ...r,
            days_until_end: r.end_date ? daysBetween(today, r.end_date) : null,
            renewed: childByParent.has(r.id),
            renewed_by: childByParent.get(r.id)?.number as string | undefined,
            renewed_child_id: childByParent.get(r.id)?.id as string | undefined,
            last_addendum: lastAddendum.get(r.id),
        }));
    },

    /**
     * Encerra um contrato de locação (fim natural da vigência ou rescisão).
     *
     * Só mexe no status e zera `reajuste_proximo` — parcelas ficam como estão.
     * Encerrar um contrato antigo não pode apagar cobrança pendente do passado:
     * aquilo é histórico financeiro e se resolve baixando ou cancelando parcela
     * a parcela, com a data real, não por efeito colateral de mudança de status.
     */
    closeContract: async (contractId: string, notes?: string): Promise<Contract> => {
        const contract = await fetchContract(contractId);
        if (contract.domain !== 'LOCACAO') {
            throw new Error('Esta ação encerra apenas contratos de locação.');
        }
        if (contract.status === 'Encerrado') return contract;
        const hoje = todayISO();
        return contractService.updateContract(contractId, {
            status: 'Encerrado',
            reajuste_proximo: undefined,
            ...(notes ? { description: `[Encerrado ${hoje}] ${notes}\n${contract.description || ''}` } : {}),
        });
    },

    /** Reabre um contrato encerrado por engano. */
    reopenContract: async (contractId: string): Promise<Contract> =>
        contractService.updateContract(contractId, { status: 'Ativo' }),

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
                .like('reference_id', `${child.id}%`)
                .neq('status', 'PENDING');
            if ((count ?? 0) > 0) {
                throw new Error('A renovação já tem parcelas pagas ou conciliadas. Desfazer não é possível — use a rescisão do contrato.');
            }
            await supabase
                .from('internal_transactions')
                .delete()
                .eq('organization_id', child.organization_id)
                .eq('source_system', 'CONTRACT_RECURRING')
                .like('reference_id', `${child.id}%`);
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
        .like('reference_id', `${parent.id}%`);

    const settled = (existing ?? []).filter(r => r.status !== 'PENDING');
    const keptMax = settled.reduce<string | null>(
        (max, r) => (!max || (r.due_date as string) > max ? (r.due_date as string) : max), null);

    await supabase.from('internal_transactions')
        .delete()
        .eq('organization_id', parent.organization_id)
        .eq('source_system', 'CONTRACT_RECURRING')
        .like('reference_id', `${parent.id}%`)
        .eq('status', 'PENDING');

    await contractService.syncContractToFinance(parent);

    if (keptMax) {
        // O sync recria também o período já quitado (sempre como PENDING) — apaga
        // essa sobreposição para não duplicar o que já foi pago.
        await supabase.from('internal_transactions')
            .delete()
            .eq('organization_id', parent.organization_id)
            .eq('source_system', 'CONTRACT_RECURRING')
            .like('reference_id', `${parent.id}%`)
            .eq('status', 'PENDING')
            .lte('due_date', keptMax);
    }
}
