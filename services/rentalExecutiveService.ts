import { supabase } from '../lib/supabase';
import {
    collectionSnapshot,
    wale,
    renewalRate,
    type CollectionSnapshot,
    type WaleResult,
    type RenewalResult,
    type Receivable,
} from '../lib/rentalExecutive';
import { refPrefixOrFilter, originIdFromRef } from '../lib/receivableRef';

/**
 * Painel executivo de Locações — Fase 3 do plano
 * docs/planos/2026-08-06-kpis-locacao-primitivas.md.
 *
 * Busca o que os KPIs de contrato e cobrança precisam. A ocupação (física e
 * financeira) NÃO passa por aqui: ela sai de `properties`/`deals` que a tela já
 * tem em mãos, e duplicar aquela consulta só criaria uma segunda fórmula para
 * divergir — foi o que aconteceu com patrimônio e receita antes da Fase 0.
 *
 * Como o resto do módulo: `null` é "não medido", nunca zero.
 */

/** Status de contrato considerado vigente. O vocabulário aqui é em português e
 *  gravado direto na coluna (`Ativo` | `Concluído` | `Minuta` | `Rascunho`). */
const STATUS_ATIVO = 'Ativo';

/** Recebimento de fato baixado. `vw_receivables.status` é o
 *  `InternalTransactionStatus` cru — `effective_status` é outra coisa
 *  (PREVISTO/VENCIDO, derivado da data). */
const STATUS_CONCILIADO = 'CONCILIATED';

/** Lotes para `.in(...)`: UUID ocupa ~37 bytes na query string e URL grande
 *  demais é recusada pelo servidor. Ver o mesmo cuidado em
 *  propertyExpenseService — lá o sintoma foi a coluna inteira virar "n/d". */
const IN_CHUNK = 150;

const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

const MISSING_CODES = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);
const isMissing = (e: { code?: string; message?: string } | null): boolean => {
    if (!e) return false;
    if (e.code && MISSING_CODES.has(e.code)) return true;
    const m = (e.message || '').toLowerCase();
    return m.includes('does not exist') || m.includes('schema cache');
};

export interface RentalExecutiveMetrics {
    wale: WaleResult;
    renewal: RenewalResult;
    collection: CollectionSnapshot;
    /** Quantos contratos de locação entraram na conta — contexto para números
     *  pequenos: WALE de 1 contrato não é característica de carteira. */
    contractsConsidered: number;
}

/** Linha de `contracts` como este serviço a lê. `deal_id` é o elo com o imóvel
 *  (e portanto com o empreendimento) — ver lib/rentalByEmpreendimento.ts. */
export interface RentalContractRow {
    id: string;
    deal_id?: string | null;
    status?: string | null;
    end_date?: string | null;
    current_value?: number | null;
    original_value?: number | null;
    parent_contract_id?: string | null;
    renewal_seq?: number | null;
}

export interface RentalExecutiveRaw {
    contracts: RentalContractRow[];
    /** `contracts.id` → parcelas dele. Chave já resolvida por `originIdFromRef`,
     *  porque `reference_id` é COMPOSTO (`{contract_id}-p{vencimento}`). */
    receivablesByContract: Map<string, Receivable[]>;
}

export const rentalExecutiveService = {
    /**
     * O bruto, sem agregar: contratos de locação e as parcelas de cada um.
     *
     * Existe para a aba Análise poder agrupar **por empreendimento** sem uma
     * consulta por empreendimento — as contas (`wale`, `renewalRate`,
     * `collectionSnapshot`) são puras e rodam por balde no cliente. Ver
     * docs/planos/2026-08-12-locacoes-analise-por-empreendimento.md.
     */
    async loadRaw(
        organizationId?: string | null,
        projectId?: string | null,
    ): Promise<RentalExecutiveRaw | null> {
        try {
            let q = supabase
                .from('contracts')
                .select('id, deal_id, status, start_date, end_date, current_value, original_value, parent_contract_id, renewal_seq')
                .eq('domain', 'LOCACAO');
            if (organizationId) q = q.eq('organization_id', organizationId);
            if (projectId) q = q.eq('project_id', projectId);

            const { data: contratos, error } = await q;
            if (error) {
                if (isMissing(error) || error.code === '42501') return null;
                throw error;
            }

            const rows = (contratos || []) as RentalContractRow[];

            // ── Cobrança: recebíveis pendurados nesses contratos ──────────────
            const ids = rows.map(c => c.id);
            const receivablesByContract = new Map<string, Receivable[]>();

            for (const lote of chunk(ids, IN_CHUNK)) {
                // ⚠️ `.in('reference_id', ids)` NÃO funciona: o valor é composto
                // (`{contract_id}-p{vencimento}`), então UUID puro nunca casa e
                // a consulta devolve vazio SEM erro. Ver lib/receivableRef.ts.
                const filtro = refPrefixOrFilter(lote);
                if (!filtro) continue;

                let rq = supabase
                    .from('vw_receivables')
                    .select('reference_id, amount, due_date, status')
                    .or(filtro);
                if (organizationId) rq = rq.eq('organization_id', organizationId);

                const { data, error: rErr } = await rq;
                if (rErr) {
                    if (isMissing(rErr) || rErr.code === '42501') break;
                    throw rErr;
                }
                for (const r of (data || []) as {
                    reference_id?: string | null; amount: number;
                    due_date?: string | null; status?: string;
                }[]) {
                    const contratoId = originIdFromRef(r.reference_id);
                    const lista = receivablesByContract.get(contratoId);
                    const parcela: Receivable = {
                        amount: Number(r.amount) || 0,
                        due_date: r.due_date,
                        settled: r.status === STATUS_CONCILIADO,
                    };
                    if (lista) lista.push(parcela);
                    else receivablesByContract.set(contratoId, [parcela]);
                }
            }

            return { contracts: rows, receivablesByContract };
        } catch (err) {
            console.error('[RentalExecutive] Erro ao carregar contratos e recebíveis:', err);
            return null;
        }
    },

    /**
     * @param from/@param to  janela da taxa de renovação (contratos que
     *        TERMINAM nela). Padrão: os 12 meses correntes.
     */
    async load(
        organizationId?: string | null,
        projectId?: string | null,
        from?: Date,
        to?: Date,
    ): Promise<RentalExecutiveMetrics | null> {
        try {
            const bruto = await this.loadRaw(organizationId, projectId);
            if (!bruto) return null;
            const rows = bruto.contracts;

            const agora = new Date();
            const inicio = from ?? new Date(agora.getFullYear(), 0, 1);
            const fim = to ?? new Date(agora.getFullYear(), 11, 31);

            const waleResult = wale(
                rows.map(c => ({
                    id: c.id,
                    end_date: c.end_date,
                    // `current_value` é o valor VIGENTE (pós-reajuste);
                    // `original_value` é o de assinatura. O WALE pondera pela
                    // receita de hoje, então o vigente manda.
                    value: c.current_value ?? c.original_value ?? 0,
                    active: (c.status ?? '') === STATUS_ATIVO,
                })),
                agora,
            );

            const renewalResult = renewalRate(
                rows.map(c => ({
                    id: c.id,
                    end_date: c.end_date,
                    parent_contract_id: c.parent_contract_id,
                    renewal_seq: c.renewal_seq,
                })),
                inicio,
                fim,
            );

            const recebiveis = [...bruto.receivablesByContract.values()].flat();

            return {
                wale: waleResult,
                renewal: renewalResult,
                collection: collectionSnapshot(recebiveis, agora),
                contractsConsidered: rows.length,
            };
        } catch (err) {
            console.error('[RentalExecutive] Erro ao carregar indicadores executivos:', err);
            return null;
        }
    },
};
