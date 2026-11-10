/**
 * Venda parcelada com juros (Price/SAC) — do contrato até Contas a Receber.
 * Plano: docs/planos/2026-11-09-negociacao-parcelamento-com-juros.md (Task 4).
 *
 * O "Montar plano" do DealModal grava cada parcela com `interest`/`principal` e o
 * Valor Total do Contrato COM juros. Daqui para frente:
 *   · o contrato de venda nasce valendo o total com juros (não o preço à vista);
 *   · cada título leva a parte de juros (`interest_amount`) e a Conta Financeira
 *     dela (`interest_category_id` = Receita Financeira), que a DRE separa;
 *   · org sem Receita Financeira lança do mesmo jeito, com a categoria nula;
 *   · título baixado ou com valor alterado à mão continua intocado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Op = { table: string; op: string; args?: unknown; filters: unknown[][] };
const ops: Op[] = [];
/** Linhas devolvidas ao SELECT de internal_transactions do sync Parcelado. */
let existentes: unknown[] = [];
/** Erro devolvido a esse SELECT (ex.: coluna interest_amount ainda sem a migration). */
let erroLeitura: { code: string; message: string } | null = null;
/** Linha de `contracts` que já existe (updateContract lê is_recurring/reajuste_acumulado). */
let contratoRow: Record<string, unknown> | null = null;

function table(name: string) {
    const rec: Op = { table: name, op: '', filters: [] };
    const b: Record<string, unknown> = {};
    const filt = (...a: unknown[]) => { rec.filters.push(a); return b; };
    Object.assign(b, {
        select: () => { if (!rec.op) rec.op = 'select'; return b; },
        insert: (p: unknown) => { rec.op = 'insert'; rec.args = p; ops.push(rec); return b; },
        upsert: (p: unknown) => { rec.op = 'upsert'; rec.args = p; ops.push(rec); return b; },
        update: (p: unknown) => { rec.op = 'update'; rec.args = p; ops.push(rec); return b; },
        delete: () => { rec.op = 'delete'; ops.push(rec); return b; },
        eq: filt, in: filt, like: filt, filter: filt, gte: filt, lte: filt, order: filt, limit: filt, or: filt, is: filt,
        maybeSingle: async () => ({ data: name === 'contracts' ? contratoRow : null, error: null }),
        // INSERT em contracts devolve a própria linha gravada (createContract lê `data`);
        // UPDATE devolve a linha existente com o que mudou (updateContract lê `data`).
        single: async () => ({
            data: rec.op === 'insert' ? { id: 'c-novo', ...(rec.args as object) }
                : rec.op === 'update' && contratoRow ? { ...contratoRow, ...(rec.args as object) }
                : null,
            error: null,
        }),
        then: (resolve: (v: unknown) => void) => resolve(
            rec.op === 'select' && name === 'internal_transactions'
                && rec.filters.some(f => f[0] === 'source_system' && f[1] === 'CONTRACT_PARCELADO')
                ? (erroLeitura ? { data: null, error: erroLeitura } : { data: existentes, error: null })
                : { data: rec.op === 'select' ? [] : null, error: null }),
    });
    return b;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (name: string) => table(name) } }));

const categorias = vi.hoisted(() => ({ receitaFinanceira: 'cat-rf' as string | null, chamadas: [] as unknown[] }));
vi.mock('../services/financialCategoryResolver', () => ({
    resolverCategoriaDoContrato: async () => ({ category: 'Venda de Ativos', category_id: 'cat-venda' }),
    resolverCategoriaReceitaFinanceira: async (org: unknown) => {
        categorias.chamadas.push(org);
        return categorias.receitaFinanceira;
    },
}));

import { contractService } from '../services/contractService';
import { montarPlanoNoNegocio, valorDoContratoPeloPlano, type CamposDoPlano, type NegocioDoPlano } from '../utils/jurosParcelamento';
import type { Contract } from '../types';

const venda = {
    id: 'c1', organization_id: 'org1', client_id: 'cli1', number: 'CV-1', title: 'Venda Apto 101',
    status: 'Ativo', domain: 'VENDAS', direction: 'OUTGOING', is_recurring: false,
    payment_term_type: 'Parcelado', original_value: 12000, current_value: 12000, start_date: '2026-11-10',
    payment_schedule: [
        { date: '2026-12-10', value: 6000, interest: 1000, principal: 5000, installment_type: 'MENSAL' },
        { date: '2027-01-10', value: 6000, interest: 1000, principal: 5000, installment_type: 'MENSAL' },
    ],
} as unknown as Contract;

const gravadas = () => ops.filter(o => o.table === 'internal_transactions' && o.op === 'upsert')
    .flatMap(u => u.args as Array<Record<string, unknown>>);
const porRef = (ref: string) => gravadas().find(g => g.reference_id === ref);

describe('sync Parcelado — juros por parcela em Contas a Receber', () => {
    beforeEach(() => {
        ops.length = 0;
        existentes = [];
        erroLeitura = null;
        categorias.receitaFinanceira = 'cat-rf';
        categorias.chamadas.length = 0;
    });

    it('sync grava interest_amount e interest_category_id por parcela', async () => {
        await contractService.syncContractToFinance(venda);

        expect(gravadas()).toHaveLength(2);
        for (const ref of ['c1:p1', 'c1:p2']) {
            expect(porRef(ref)).toMatchObject({
                amount: 6000,
                interest_amount: 1000,
                interest_category_id: 'cat-rf',
                // A parcela inteira (principal + juros) continua na categoria da venda;
                // só a DRE separa a parte de juros pela coluna própria.
                category_id: 'cat-venda',
            });
        }
        expect(categorias.chamadas).toEqual(['org1']);
    });

    it('org sem Receita Financeira grava interest_category_id null e não lança erro', async () => {
        categorias.receitaFinanceira = null;
        await expect(contractService.syncContractToFinance(venda)).resolves.toBeDefined();

        expect(gravadas()).toHaveLength(2);
        expect(porRef('c1:p1')).toMatchObject({ interest_amount: 1000, interest_category_id: null });
        expect(porRef('c1:p2')).toMatchObject({ interest_amount: 1000, interest_category_id: null });
    });

    it('parcela sem juros (sinal, plano antigo) grava juros nulos e nem procura a categoria', async () => {
        const semJuros = {
            ...venda,
            payment_schedule: [{ date: '2026-12-10', value: 6000 }, { date: '2027-01-10', value: 6000 }],
        } as unknown as Contract;
        await contractService.syncContractToFinance(semJuros);

        expect(porRef('c1:p1')).toMatchObject({ interest_amount: null, interest_category_id: null });
        expect(categorias.chamadas).toHaveLength(0);
    });

    it('título não baixado tem o juro atualizado; baixado e valor manual ficam como estão', async () => {
        const tres = {
            ...venda,
            payment_schedule: [
                { date: '2026-12-10', value: 6000, interest: 1000, principal: 5000 },
                { date: '2027-01-10', value: 6000, interest: 900, principal: 5100 },
                { date: '2027-02-10', value: 6000, interest: 800, principal: 5200 },
            ],
        } as unknown as Contract;
        existentes = [
            // p1 já recebida: nada a regrava.
            { id: 't1', reference_id: 'c1:p1', status: 'CONCILIATED', business_status: 'RECEBIDO', amount: 6000, interest_amount: 1200, interest_category_id: 'cat-rf' },
            // p2 com valor digitado à mão: mantém valor E a parte de juros da linha.
            { id: 't2', reference_id: 'c1:p2', status: 'PENDING', business_status: 'PREVISTO', amount: 5500, valor_manual: true, interest_amount: 700, interest_category_id: 'cat-rf' },
            // p3 em aberto, juro antigo: segue o contrato.
            { id: 't3', reference_id: 'c1:p3', status: 'PENDING', business_status: 'PREVISTO', amount: 6000, interest_amount: 1234, interest_category_id: null },
        ];
        await contractService.syncContractToFinance(tres);

        expect(porRef('c1:p1')).toBeUndefined();
        expect(porRef('c1:p2')).toMatchObject({ amount: 5500, valor_manual: true, interest_amount: 700, interest_category_id: 'cat-rf' });
        expect(porRef('c1:p3')).toMatchObject({ amount: 6000, interest_amount: 800, interest_category_id: 'cat-rf' });
    });
});

describe('sync Parcelado — leitura dos títulos falhou', () => {
    beforeEach(() => { ops.length = 0; existentes = []; erroLeitura = null; });

    // COLUNAS_PARCELA_EXISTENTE passou a pedir interest_amount: com o front no ar
    // antes da migration, o SELECT falha. Seguir com lista vazia regravaria como
    // PENDING a parcela já recebida — o sync tem de parar sem gravar nada.
    it('não regrava nem apaga título nenhum', async () => {
        erroLeitura = { code: '42703', message: 'column internal_transactions.interest_amount does not exist' };
        await contractService.syncContractToFinance(venda);
        expect(ops.filter(o => o.table === 'internal_transactions' && (o.op === 'upsert' || o.op === 'delete'))).toHaveLength(0);
    });
});

describe('createFromDeal — contrato de venda com juros', () => {
    beforeEach(() => { ops.length = 0; existentes = []; contratoRow = null; });

    const deal = {
        id: 'd1', organization_id: 'org1', client_id: 'cli1', contract_number: 'CV-9',
        value: 100000, date: '2026-11-10', status: 'PROPOSTA',
    };
    const inserido = () => ops.find(o => o.table === 'contracts' && o.op === 'insert')!.args as Record<string, unknown>;

    it('contrato de venda com juros nasce com original_value = contract_total_value', async () => {
        await contractService.createFromDeal({ ...deal, interest_rate_monthly: 1, contract_total_value: 126618.53 }, 'VENDAS');
        expect(inserido().original_value).toBe(126618.53);
        // Valor atual = original na criação (sem aditivo nem reajuste ainda) — regra
        // de valorAtualDoContrato.
        expect(inserido().current_value).toBe(126618.53);
    });

    it('venda sem juros continua nascendo com o valor da negociação', async () => {
        await contractService.createFromDeal({ ...deal, interest_rate_monthly: 0, contract_total_value: 126618.53 }, 'VENDAS');
        expect(inserido().original_value).toBe(100000);
    });
});

/**
 * Contrato que JÁ EXISTIA quando o plano com juros é lançado (Ruling 14): o
 * "Lançar no Financeiro" / "Gerar no contrato" (aplicarPlanoNoContrato do DealModal)
 * manda `payment_schedule` + `valorDoContratoPeloPlano(formData)` ao updateContract.
 * Antes o contrato ficava no preço à vista e as parcelas somavam o total com juros.
 */
describe('contrato existente recebe o plano com juros', () => {
    const campos: CamposDoPlano = {
        entrada: 20000, parcelas: 12, tipo: 'MENSAL', intervaloMeses: 1,
        primeiroVencimento: '2026-12-10', taxaMensal: 1, sistema: 'PRICE',
    };
    const negocio: NegocioDoPlano = { type: 'SALE', value: 120000, date: '2026-11-10', contract_total_value: 120000 };
    const atualizacao = (c: CamposDoPlano) => {
        const d = { ...negocio, ...montarPlanoNoNegocio(negocio, c, 'p') };
        return { payment_schedule: venda.payment_schedule, payment_term_type: 'Parcelado' as const, ...valorDoContratoPeloPlano(d) };
    };
    const gravado = () => ops.find(o => o.table === 'contracts' && o.op === 'update')!.args as Record<string, unknown>;

    beforeEach(() => {
        ops.length = 0;
        existentes = [];
        erroLeitura = null;
        contratoRow = { ...(venda as unknown as Record<string, unknown>), original_value: 120000, current_value: 120500, reajuste_acumulado: 500 };
    });

    it('Price com entrada de 20.000: original_value vira 126.618,53 e o reajuste continua somado', async () => {
        await contractService.updateContract('c1', atualizacao(campos));
        expect(gravado().original_value).toBe(126618.53);
        // valorAtualDoContrato: original + aditivos (nenhum) + reajuste acumulado.
        expect(gravado().current_value).toBe(127118.53);
        expect(gravado()).not.toHaveProperty('reajuste_acumulado');
    });

    it('sem juros não manda original_value — o contrato fica como está', async () => {
        await contractService.updateContract('c1', atualizacao({ ...campos, taxaMensal: 0 }));
        expect(gravado()).not.toHaveProperty('original_value');
        expect(gravado()).not.toHaveProperty('current_value');
    });
});
