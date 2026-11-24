import { supabase } from '../lib/supabase';
import { fetchAllPages, type RangeableQuery } from '../lib/supabasePaginate';
import { bankReconciliationService } from './bankReconciliationService';
import { reconciliationGroupService } from './reconciliationGroupService';
import { comValorEsperado, extratoForaDaConciliacao, COLUNA_VALOR_ESPERADO, FILTRO_SEM_TRIBUTO_RETIDO } from '../utils/reconciliationRules';
import { hojeLocal } from '../utils/baixaRecebivel';
import {
    analisarSequencias,
    acharPagamentosJuntos,
    acharCreditosParecidos,
    posicoesNasSeries,
    type PosicaoNaSerie,
    type CandidatoJuntas,
    type ExtratoPendente,
    type ParcelaDeContrato,
    type SerieDeParcelas,
} from '../utils/sequenciaParcelas';

/** Só as séries de contrato: recorrente (aluguel, serviço continuado) e parcelado (venda, empreitada). */
const ORIGENS_DA_SERIE = ['CONTRACT_RECURRING', 'CONTRACT_PARCELADO'];

interface LinhaParcela {
    id: string;
    contract_id: string;
    due_date: string | null;
    transaction_date: string;
    amount: number;
    valor_esperado?: number | string | null;
    direction: 'CREDIT' | 'DEBIT';
    status: string;
    business_status: string | null;
    bank_reconciled_at: string | null;
    payment_date: string | null;
    reference_id: string | null;
    party_name: string | null;
    entity_name: string | null;
    contracts: ParcelaDeContrato['contrato'] | ParcelaDeContrato['contrato'][];
    reconciliation_matches: {
        bank_transaction_id: string;
        bank_transactions: { transaction_date: string; bank_account_id: string | null } | { transaction_date: string; bank_account_id: string | null }[] | null;
    }[] | null;
}

const umSo = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function paraParcela(l: LinhaParcela): ParcelaDeContrato {
    const v = comValorEsperado({ amount: Number(l.amount), valor_esperado: l.valor_esperado });
    return {
        id: l.id,
        contract_id: l.contract_id,
        due_date: l.due_date || l.transaction_date,
        amount: Number(v.amount),
        direction: l.direction,
        status: l.status,
        business_status: l.business_status,
        bank_reconciled_at: l.bank_reconciled_at,
        payment_date: l.payment_date,
        reference_id: l.reference_id,
        party_name: l.party_name,
        entity_name: l.entity_name,
        contrato: umSo(l.contracts),
        vinculos: (l.reconciliation_matches ?? []).flatMap(m => {
            const bt = umSo(m.bank_transactions);
            return bt ? [{ bank_transaction_id: m.bank_transaction_id, data: bt.transaction_date, bank_account_id: bt.bank_account_id }] : [];
        }),
    };
}

export interface SequenciaDaConta {
    series: SerieDeParcelas[];
    candidatos: CandidatoJuntas[];
    /** Parcela (furo/vencida) → movimento pendente parecido do mesmo cliente/fornecedor. */
    parecidos: Map<string, ExtratoPendente>;
    primeiroExtrato: string | null;
    ultimoExtrato: string | null;
}

async function extremoDoExtrato(contaId: string, ascending: boolean): Promise<string | null> {
    const { data, error } = await supabase.from('bank_transactions')
        .select('transaction_date')
        .eq('bank_account_id', contaId)
        .order('transaction_date', { ascending })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return (data as { transaction_date?: string } | null)?.transaction_date?.slice(0, 10) ?? null;
}

/** Corte histórico da conta: o extrato até essa data só se classifica, não se concilia. */
async function corteHistorico(contaId: string): Promise<string | null> {
    const { data, error } = await supabase.from('payment_accounts')
        .select('reconciliation_historic_until')
        .eq('id', contaId)
        .maybeSingle();
    if (error) throw error;
    return (data as { reconciliation_historic_until?: string | null } | null)?.reconciliation_historic_until?.slice(0, 10) ?? null;
}

export const sequenciaParcelasService = {
    /**
     * Séries de parcelas de contrato das organizações que a conta atende, lidas contra
     * o extrato DESTA conta (a organização é a da conta, não a do topo — REGRA #5).
     */
    async carregar(contaId: string, organizationId: string | null): Promise<SequenciaDaConta> {
        const dona = await bankReconciliationService.resolverOrganizacaoDaConta(contaId, organizationId);
        if (!dona) throw new Error('Não foi possível identificar a organização desta conta bancária.');
        const orgs = await bankReconciliationService.orgsAtendidasPelaConta(contaId, dona);

        const [parcelas, pendentes, primeiroExtrato, ultimoExtrato, filtros, corte] = await Promise.all([
            fetchAllPages<LinhaParcela>(() => supabase.from('internal_transactions')
                .select(`id, contract_id, due_date, transaction_date, amount, ${COLUNA_VALOR_ESPERADO}, direction, status, business_status, bank_reconciled_at, payment_date, reference_id, party_name, entity_name, contracts(number, title, domain, payment_account_id), reconciliation_matches(bank_transaction_id, bank_transactions(transaction_date, bank_account_id))`)
                .in('organization_id', orgs)
                .in('source_system', ORIGENS_DA_SERIE)
                .not('contract_id', 'is', null)
                .neq('status', 'CANCELLED')
                .or(FILTRO_SEM_TRIBUTO_RETIDO)
                .order('id', { ascending: true }) as unknown as RangeableQuery<LinhaParcela>),
            // Mesmo recorte de pendentes dos "Agrupamentos sugeridos" (findGroups).
            fetchAllPages<ExtratoPendente & { category?: string | null }>(() => supabase.from('bank_transactions')
                .select('id, transaction_date, amount, direction, description_normalized, description_raw, counterparty_name, category')
                .eq('bank_account_id', contaId)
                .in('status', ['NORMALIZED', 'RULE_APPLIED'])
                .order('transaction_date', { ascending: true })
                .order('id', { ascending: true }) as unknown as RangeableQuery<ExtratoPendente & { category?: string | null }>),
            extremoDoExtrato(contaId, true),
            extremoDoExtrato(contaId, false),
            bankReconciliationService.lerFiltrosDaConciliacao(dona).catch(e => {
                console.error('[sequenciaParcelas] filtros da conciliação', e);
                return null;
            }),
            corteHistorico(contaId),
        ]);
        if (parcelas.error) throw parcelas.error;
        if (pendentes.error) throw pendentes.error;

        const series = analisarSequencias(parcelas.data.map(paraParcela), {
            hoje: hojeLocal(), primeiroExtrato, ultimoExtrato, contaId,
        });
        const extrato = pendentes.data
            .filter(b => !extratoForaDaConciliacao(b, filtros) && (!corte || b.transaction_date.slice(0, 10) > corte))
            .map(b => ({ ...b, amount: Number(b.amount) }));
        const candidatos = acharPagamentosJuntos(series, extrato);
        const parecidos = acharCreditosParecidos(series, extrato, candidatos.map(c => c.bank.id));
        return { series, candidatos, parecidos, primeiroExtrato, ultimoExtrato };
    },

    /**
     * Coluna "Sequência sugerida" da Central: a posição de cada parcela na série do
     * seu contrato. Lê a série INTEIRA dos contratos citados (a posição depende das
     * outras parcelas), em lotes de 100 ids por causa do tamanho da URL do `in()`.
     */
    async posicoesDosContratos(contractIds: string[]): Promise<Map<string, PosicaoNaSerie>> {
        const ids = [...new Set(contractIds.filter(Boolean))];
        type Linha = Pick<LinhaParcela, 'id' | 'contract_id' | 'due_date' | 'transaction_date' | 'amount' | 'valor_esperado' | 'reference_id' | 'status' | 'business_status' | 'bank_reconciled_at' | 'contracts'>;
        const linhas: Linha[] = [];
        for (let i = 0; i < ids.length; i += 100) {
            const lote = ids.slice(i, i + 100);
            const r = await fetchAllPages<Linha>(() => supabase.from('internal_transactions')
                .select(`id, contract_id, due_date, transaction_date, amount, ${COLUNA_VALOR_ESPERADO}, reference_id, status, business_status, bank_reconciled_at, contracts(number)`)
                .in('contract_id', lote)
                .in('source_system', ORIGENS_DA_SERIE)
                .neq('status', 'CANCELLED')
                .or(FILTRO_SEM_TRIBUTO_RETIDO)
                .order('id', { ascending: true }) as unknown as RangeableQuery<Linha>);
            if (r.error) throw r.error;
            linhas.push(...r.data);
        }
        return posicoesNasSeries(linhas.map(l => ({
            ...l,
            due_date: l.due_date || l.transaction_date,
            // O que o banco deve mostrar (líquido do retido) — compara "mesmo valor" na troca.
            amount: Number(comValorEsperado({ amount: Number(l.amount), valor_esperado: l.valor_esperado }).amount),
            contrato: umSo(l.contracts),
        })));
    },

    /** "Conciliar juntas": a mesma conciliação agrupada (atômica) dos agrupamentos sugeridos. */
    async conciliarJuntas(c: CandidatoJuntas): Promise<void> {
        await reconciliationGroupService.confirmBankToTitles(c.bank.id, c.parcelas.map(p => p.id));
    },
};
