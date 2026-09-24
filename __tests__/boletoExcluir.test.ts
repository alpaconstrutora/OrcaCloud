/**
 * Exclusão de boleto aprovado (24/09/2026).
 *
 * ─── O QUE ESTES CASOS PROVAM ───────────────────────────────────────────────
 *
 * Até aqui só rascunho podia ser excluído, e a razão era boa: aprovar CRIA um
 * título no razão (`internal_transactions`) e uma nota (`invoices`). Liberar a
 * exclusão do aprovado sem desfazer essas duas linhas deixaria título órfão em
 * Contas a Pagar — exatamente o tipo de perda silenciosa que o botão desligado
 * evitava.
 *
 * Então o que precisa ficar provado não é "o botão ficou ativo". É:
 *  - que excluir aprovado REMOVE o título e a nota (não só o boleto);
 *  - que a exclusão é RECUSADA, com motivo, quando o título já tem vida própria
 *    no financeiro (conciliado, baixado, em rateio de condomínio);
 *  - que a recusa acontece ANTES de qualquer delete — um boleto apagado com o
 *    título de pé seria pior que não excluir nada;
 *  - que nota compartilhada com outro boleto não é apagada junto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Linha = Record<string, unknown>;

/** Banco de mentira: tabelas em memória + o encadeamento que o service usa. */
const db: Record<string, Linha[]> = {};
const storageRemovidos: string[][] = [];

function filtrar(linhas: Linha[], filtros: Array<[string, string, unknown]>): Linha[] {
    return linhas.filter(l => filtros.every(([op, col, val]) =>
        op === 'neq' ? l[col] !== val : l[col] === val));
}

function query(tabela: string, modo: 'select' | 'delete' | 'update', head: boolean, patch: Linha = {}) {
    const filtros: Array<[string, string, unknown]> = [];
    const executar = () => {
        const linhas = filtrar(db[tabela] ?? [], filtros);
        if (modo === 'update') {
            linhas.forEach(l => Object.assign(l, patch));
            return { data: linhas, error: null, count: linhas.length };
        }
        if (modo === 'delete') {
            db[tabela] = (db[tabela] ?? []).filter(l => !linhas.includes(l));
            return { data: null, error: null, count: linhas.length };
        }
        return { data: linhas, error: null, count: head ? linhas.length : null };
    };
    const api: any = {
        eq: (col: string, val: unknown) => (filtros.push(['eq', col, val]), api),
        neq: (col: string, val: unknown) => (filtros.push(['neq', col, val]), api),
        select: () => api,
        single: async () => {
            const r = executar();
            return { data: (r.data as Linha[] | null)?.[0] ?? null, error: null };
        },
        maybeSingle: async () => {
            const r = executar();
            return { data: (r.data as Linha[] | null)?.[0] ?? null, error: null };
        },
        // `.select(...).eq(...)` sem `maybeSingle` é aguardado direto (é o caso
        // das contagens com `{ count: 'exact', head: true }`).
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(executar()).then(resolve),
    };
    return api;
}

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => ({
            select: (_cols: string, opts?: { head?: boolean }) => query(tabela, 'select', !!opts?.head),
            delete: () => query(tabela, 'delete', false),
            update: (patch: Linha) => query(tabela, 'update', false, patch),
            insert: async () => ({ data: null, error: null }),
        }),
        storage: {
            from: () => ({
                remove: async (paths: string[]) => (storageRemovidos.push(paths), { data: null, error: null }),
            }),
        },
    },
}));

import { boletoService } from '../services/boletoService';

const ORG = 'org-1';

function cenario(status: string, statusTitulo: string | null = 'PENDING') {
    db.boletos = [{ id: 'b1', organization_id: ORG, status, invoice_id: 'inv-1', documento_path: 'org/b1.pdf' }];
    db.invoices = [{ id: 'inv-1' }];
    db.internal_transactions = statusTitulo
        ? [{ id: 'tx-1', organization_id: ORG, source_system: 'BOLETO', reference_id: 'b1', status: statusTitulo }]
        : [];
    db.reconciliation_matches = [];
    db.condominio_rateio_itens = [];
    db.supplier_payments = [];
}

beforeEach(() => {
    storageRemovidos.length = 0;
});

describe('quais status podem ser excluídos', () => {
    it('rascunho e aprovado sim; pago e cancelado não', () => {
        expect(boletoService.podeExcluir('rascunho')).toBe(true);
        expect(boletoService.podeExcluir('aprovado')).toBe(true);
        expect(boletoService.podeExcluir('pago')).toBe(false);
        expect(boletoService.podeExcluir('cancelado')).toBe(false);
    });

    /* A queixa que abriu tudo isto foi um ícone cinza que não dizia por quê.
       Botão desligado sem motivo é o defeito; com motivo, é instrução. */
    it('o botão desligado sempre tem motivo, e o do pago aponta o caminho', () => {
        expect(boletoService.motivoParaNaoExcluir('rascunho')).toBeNull();
        expect(boletoService.motivoParaNaoExcluir('aprovado')).toBeNull();
        expect(boletoService.motivoParaNaoExcluir('pago')).toMatch(/reverta para rascunho/i);
        expect(boletoService.motivoParaNaoExcluir('cancelado')).toMatch(/histórico/i);
    });

    it('recusa cancelado com mensagem, sem apagar nada', async () => {
        cenario('cancelado');
        await expect(boletoService.excluir('b1', ORG)).rejects.toThrow(/cancelado fica no histórico/i);
        expect(db.boletos).toHaveLength(1);
    });
});

describe('excluir rascunho', () => {
    it('apaga o boleto e o arquivo, e não mexe no financeiro', async () => {
        cenario('rascunho', null);
        db.invoices = [];
        await boletoService.excluir('b1', ORG);
        expect(db.boletos).toHaveLength(0);
        expect(storageRemovidos).toEqual([['org/b1.pdf']]);
    });
});

describe('pago: o fluxo é reverter e só então excluir', () => {
    it('excluir direto é recusado, e a mensagem ensina o caminho', async () => {
        cenario('pago', 'CONCILIATED');
        await expect(boletoService.excluir('b1', ORG)).rejects.toThrow(/reverta para rascunho/i);
        expect(db.boletos).toHaveLength(1);
        expect(db.internal_transactions).toHaveLength(1);
        expect(storageRemovidos).toHaveLength(0);
    });

    it('reverter estorna título e nota e devolve o boleto a rascunho', async () => {
        cenario('pago', 'CONCILIATED');
        const atualizado = await boletoService.reverterParaRascunho('b1', ORG);
        expect(atualizado.status).toBe('rascunho');
        expect(db.internal_transactions).toHaveLength(0);
        expect(db.invoices).toHaveLength(0);
        expect(db.boletos[0].invoice_id).toBeNull();
        // Reverter NÃO apaga: o arquivo e o boleto continuam lá.
        expect(db.boletos).toHaveLength(1);
        expect(storageRemovidos).toHaveLength(0);
    });

    it('depois de reverter, o excluir passa', async () => {
        cenario('pago', 'CONCILIATED');
        await boletoService.reverterParaRascunho('b1', ORG);
        await boletoService.excluir('b1', ORG);
        expect(db.boletos).toHaveLength(0);
        expect(storageRemovidos).toEqual([['org/b1.pdf']]);
    });

    it('reverter recusa o pago com conciliação bancária de verdade', async () => {
        cenario('pago', 'CONCILIATED');
        db.reconciliation_matches = [{ id: 'm1', internal_transaction_id: 'tx-1' }];
        await expect(boletoService.reverterParaRascunho('b1', ORG)).rejects.toThrow(/desfaça a conciliação/i);
        expect(db.boletos[0].status).toBe('pago');
        expect(db.internal_transactions).toHaveLength(1);
    });

    it('reverte também o pago que nunca teve título (os 85 de 24/09)', async () => {
        cenario('pago', null);
        const atualizado = await boletoService.reverterParaRascunho('b1', ORG);
        expect(atualizado.status).toBe('rascunho');
        expect(db.invoices).toHaveLength(0);
    });

    it('reverter não vale para rascunho nem cancelado', async () => {
        cenario('cancelado');
        await expect(boletoService.reverterParaRascunho('b1', ORG)).rejects.toThrow(/só boleto pago/i);
    });
});

describe('excluir aprovado', () => {
    it('remove junto o título no razão e a nota', async () => {
        cenario('aprovado', 'PENDING');
        await boletoService.excluir('b1', ORG);
        expect(db.boletos).toHaveLength(0);
        expect(db.internal_transactions).toHaveLength(0);
        expect(db.invoices).toHaveLength(0);
    });

    it('recusa quando o título está conciliado com o extrato', async () => {
        cenario('aprovado', 'PENDING');
        db.reconciliation_matches = [{ id: 'm1', internal_transaction_id: 'tx-1' }];
        await expect(boletoService.excluir('b1', ORG)).rejects.toThrow(/conciliado/i);
        expect(db.internal_transactions).toHaveLength(1);
    });

    it('recusa quando o título entra em rateio de condomínio', async () => {
        cenario('aprovado', 'PENDING');
        db.condominio_rateio_itens = [{ id: 'r1', transaction_id: 'tx-1' }];
        await expect(boletoService.excluir('b1', ORG)).rejects.toThrow(/rateio/i);
        expect(db.boletos).toHaveLength(1);
    });

    it('recusa quando há pagamento a fornecedor lançado', async () => {
        cenario('aprovado', 'PENDING');
        db.supplier_payments = [{ id: 'p1', transaction_id: 'tx-1' }];
        await expect(boletoService.excluir('b1', ORG)).rejects.toThrow(/pagamento a fornecedor/i);
        expect(db.boletos).toHaveLength(1);
    });

    it('preserva a nota quando outro boleto aponta para ela', async () => {
        cenario('aprovado', 'PENDING');
        db.boletos.push({ id: 'b2', organization_id: ORG, status: 'aprovado', invoice_id: 'inv-1' });
        await boletoService.excluir('b1', ORG);
        expect(db.invoices).toHaveLength(1);
        expect(db.boletos.map(b => b.id)).toEqual(['b2']);
    });
});
