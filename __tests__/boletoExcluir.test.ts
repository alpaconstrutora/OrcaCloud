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
    it('rascunho, revisão, aprovado e cancelado sim; pago e programado não (16/10/2026: cancelado liberado)', () => {
        expect(boletoService.podeExcluir('rascunho')).toBe(true);
        expect(boletoService.podeExcluir('revisao')).toBe(true);
        expect(boletoService.podeExcluir('aprovado')).toBe(true);
        expect(boletoService.podeExcluir('cancelado')).toBe(true);
        expect(boletoService.podeExcluir('pago')).toBe(false);
        expect(boletoService.podeExcluir('programado')).toBe(false);
    });

    /* A queixa que abriu tudo isto foi um ícone cinza que não dizia por quê.
       Botão desligado sem motivo é o defeito; com motivo, é instrução. */
    it('o botão desligado sempre tem motivo certo para o status', () => {
        expect(boletoService.motivoParaNaoExcluir('rascunho')).toBeNull();
        expect(boletoService.motivoParaNaoExcluir('revisao')).toBeNull();
        expect(boletoService.motivoParaNaoExcluir('aprovado')).toBeNull();
        expect(boletoService.motivoParaNaoExcluir('cancelado')).toBeNull();
        expect(boletoService.motivoParaNaoExcluir('pago')).toMatch(/reverta para rascunho/i);
        expect(boletoService.motivoParaNaoExcluir('programado')).toMatch(/programado/i);
        expect(boletoService.motivoParaNaoExcluir('programado')).not.toMatch(/cancelado/i);
    });

    it('recusa programado com mensagem própria, sem apagar nada', async () => {
        cenario('programado');
        await expect(boletoService.excluir('b1', ORG)).rejects.toThrow(/programado/i);
        expect(db.boletos).toHaveLength(1);
    });
});

describe('excluir cancelado (16/10/2026 — boletos "por engano" precisam de saída definitiva)', () => {
    it('sem invoice_id: apaga o boleto e o arquivo, sem mexer no financeiro', async () => {
        cenario('cancelado', null);
        db.boletos[0].invoice_id = null;
        db.invoices = [];
        await boletoService.excluir('b1', ORG);
        expect(db.boletos).toHaveLength(0);
        expect(storageRemovidos).toEqual([['org/b1.pdf']]);
    });

    it('com invoice_id (cancelar nunca desfez o lançamento): remove o boleto, o título e a nota junto', async () => {
        cenario('cancelado', 'PENDING');
        await boletoService.excluir('b1', ORG);
        expect(db.boletos).toHaveLength(0);
        expect(db.internal_transactions).toHaveLength(0);
        expect(db.invoices).toHaveLength(0);
    });

    it('com invoice_id conciliado: recusa, mesma guarda do aprovado', async () => {
        cenario('cancelado', 'PENDING');
        db.reconciliation_matches = [{ id: 'm1', internal_transaction_id: 'tx-1' }];
        await expect(boletoService.excluir('b1', ORG)).rejects.toThrow(/conciliado/i);
        expect(db.boletos).toHaveLength(1);
        expect(db.internal_transactions).toHaveLength(1);
    });
});

describe('mensagem de confirmação de exclusão (fonte única BoletoManager/BoletoFormModal)', () => {
    it('aprovado: avisa que título e nota saem junto', () => {
        expect(boletoService.mensagemConfirmacaoExclusao({ status: 'aprovado', invoice_id: 'inv-1' }))
            .toMatch(/título.*nota.*removidos junto/i);
    });

    it('cancelado com invoice_id: avisa que o cancelamento não tinha removido o título', () => {
        expect(boletoService.mensagemConfirmacaoExclusao({ status: 'cancelado', invoice_id: 'inv-1' }))
            .toMatch(/cancelamento não o removeu/i);
    });

    it('cancelado sem invoice_id: mensagem genérica, sem menção a título', () => {
        const msg = boletoService.mensagemConfirmacaoExclusao({ status: 'cancelado', invoice_id: undefined });
        expect(msg).toMatch(/excluir permanentemente/i);
        expect(msg).not.toMatch(/título/i);
    });

    it('rascunho: mensagem genérica', () => {
        const msg = boletoService.mensagemConfirmacaoExclusao({ status: 'rascunho', invoice_id: undefined });
        expect(msg).toMatch(/excluir permanentemente/i);
    });
});

describe('excluir em revisão', () => {
    it('apaga o boleto e o arquivo, e não mexe no financeiro (nunca teve invoice_id — 0 de 62 no banco em 16/10)', async () => {
        cenario('revisao', null);
        db.boletos[0].invoice_id = null;
        db.invoices = [];
        await boletoService.excluir('b1', ORG);
        expect(db.boletos).toHaveLength(0);
        expect(storageRemovidos).toEqual([['org/b1.pdf']]);
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

    // 23/10/2026 (campo Status): aprovado e cancelado também voltam por estorno.
    it('reverter não vale para rascunho, revisão nem programado', async () => {
        for (const status of ['rascunho', 'revisao']) {
            cenario(status);
            await expect(boletoService.reverterParaRascunho('b1', ORG)).rejects.toThrow(/troque o status direto/i);
        }
        cenario('programado');
        await expect(boletoService.reverterParaRascunho('b1', ORG)).rejects.toThrow(/Asaas/);
        expect(db.internal_transactions).toHaveLength(1);
    });
});

describe('campo Status (23/10/2026): voltas e cancelamento seguem o fluxo', () => {
    it('aprovado volta a rascunho estornando título e nota', async () => {
        cenario('aprovado', 'PENDING');
        const atualizado = await boletoService.reverterParaRascunho('b1', ORG);
        expect(atualizado.status).toBe('rascunho');
        expect(db.internal_transactions).toHaveLength(0);
        expect(db.invoices).toHaveLength(0);
        expect(db.boletos[0].invoice_id).toBeNull();
    });

    it('cancelado reabre como rascunho e apaga o título cancelado e a nota', async () => {
        cenario('cancelado', 'CANCELLED');
        const atualizado = await boletoService.reverterParaRascunho('b1', ORG);
        expect(atualizado.status).toBe('rascunho');
        expect(db.internal_transactions).toHaveLength(0);
        expect(db.invoices).toHaveLength(0);
    });

    it('cancelar um aprovado cancela o título e a nota, e acrescenta o motivo às observações', async () => {
        cenario('aprovado', 'PENDING');
        db.invoices[0].status = 'approved';
        db.boletos[0].observacoes = 'Conferir com o síndico';
        const atualizado = await boletoService.cancelar('b1', ORG, 'Capturado em dobro');
        expect(atualizado.status).toBe('cancelado');
        expect(db.internal_transactions[0].status).toBe('CANCELLED');
        expect(db.invoices[0].status).toBe('rejected');
        expect(db.boletos[0].observacoes).toBe('Conferir com o síndico\nCancelado: Capturado em dobro');
        // nada é apagado: o boleto guarda a nota para o histórico
        expect(db.boletos[0].invoice_id).toBe('inv-1');
    });

    it('cancelar tira o título da fila de aprovação (alçada PENDENTE vira REJEITADO)', async () => {
        cenario('aprovado', 'PENDING');
        db.internal_transactions[0].approval_status = 'PENDENTE';
        await boletoService.cancelar('b1', ORG, 'x');
        expect(db.internal_transactions[0]).toMatchObject({ status: 'CANCELLED', approval_status: 'REJEITADO' });
    });

    it('cancelar recusa título conciliado, sem mexer em nada', async () => {
        cenario('aprovado', 'PENDING');
        db.reconciliation_matches = [{ id: 'm1', internal_transaction_id: 'tx-1' }];
        await expect(boletoService.cancelar('b1', ORG, 'x')).rejects.toThrow(/desfaça a conciliação/i);
        expect(db.boletos[0].status).toBe('aprovado');
        expect(db.internal_transactions[0].status).toBe('PENDING');
    });

    it('cancelar recusa título já baixado, pago, programado e o já cancelado', async () => {
        cenario('aprovado', 'CONCILIATED');
        await expect(boletoService.cancelar('b1', ORG, 'x')).rejects.toThrow(/já foi baixado/i);
        cenario('pago', 'CONCILIATED');
        await expect(boletoService.cancelar('b1', ORG, 'x')).rejects.toThrow(/pago não se cancela/i);
        cenario('programado');
        await expect(boletoService.cancelar('b1', ORG, 'x')).rejects.toThrow(/Asaas/);
        cenario('cancelado');
        await expect(boletoService.cancelar('b1', ORG, 'x')).rejects.toThrow(/já está cancelado/i);
        expect(db.internal_transactions[0].status).toBe('PENDING');
    });

    it('cancelar rascunho sem lançamento só muda o boleto', async () => {
        cenario('rascunho', null);
        db.boletos[0].invoice_id = null;
        const atualizado = await boletoService.cancelar('b1', ORG, 'PDF não era boleto');
        expect(atualizado.status).toBe('cancelado');
        expect(db.boletos[0].observacoes).toBe('Cancelado: PDF não era boleto');
    });

    it('rascunho ↔ revisão troca direto; de outro status, recusa', async () => {
        cenario('rascunho', null);
        expect((await boletoService.marcarRevisao('b1', ORG, 'revisao')).status).toBe('revisao');
        expect((await boletoService.marcarRevisao('b1', ORG, 'rascunho')).status).toBe('rascunho');
        cenario('aprovado');
        await expect(boletoService.marcarRevisao('b1', ORG, 'revisao')).rejects.toThrow(/só rascunho e revisão/i);
        expect(db.boletos[0].status).toBe('aprovado');
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

describe('Edição em Lote › mudar status (23/10/2026)', () => {
    function lote() {
        db.boletos = [
            { id: 'b1', organization_id: ORG, status: 'aprovado', invoice_id: 'inv-1', documento_path: 'org/b1.pdf' },
            { id: 'b2', organization_id: ORG, status: 'revisao', invoice_id: null, documento_path: 'org/b2.pdf' },
            { id: 'b3', organization_id: ORG, status: 'pago', invoice_id: 'inv-3', documento_path: 'org/b3.pdf' },
            { id: 'b4', organization_id: 'outra-org', status: 'rascunho', invoice_id: null, documento_path: 'x/b4.pdf' },
        ];
        db.invoices = [{ id: 'inv-1', status: 'approved' }, { id: 'inv-3', status: 'paid' }];
        db.internal_transactions = [
            { id: 'tx-1', organization_id: ORG, source_system: 'BOLETO', reference_id: 'b1', status: 'PENDING' },
            { id: 'tx-3', organization_id: ORG, source_system: 'BOLETO', reference_id: 'b3', status: 'CONCILIATED' },
        ];
        db.reconciliation_matches = [];
        db.condominio_rateio_itens = [];
        db.supplier_payments = [];
    }

    it('cancelar em lote: quem pode cancela (título junto), quem não pode fica com o motivo', async () => {
        lote();
        const r = await boletoService.mudarStatusEmLote(['b1', 'b2', 'b3', 'b4'], ORG, 'cancelado', { motivo: 'Lote de teste' });
        expect(r.ok).toEqual(['b1', 'b2']);
        expect(r.ficaram).toEqual([{ id: 'b3', motivo: 'De "Pago" não vai para "Cancelado".' }]);
        expect(r.errors).toEqual([{ id: 'b4', error: 'Boleto não encontrado nesta organização.' }]);
        expect(db.boletos.map(b => b.status)).toEqual(['cancelado', 'cancelado', 'pago', 'rascunho']);
        expect(db.internal_transactions[0].status).toBe('CANCELLED');
        expect(db.internal_transactions[1].status).toBe('CONCILIATED');
    });

    it('voltar a rascunho em lote: estorna o aprovado e o pago, troca a revisão direto', async () => {
        lote();
        const r = await boletoService.mudarStatusEmLote(['b1', 'b2', 'b3'], ORG, 'rascunho');
        expect(r.ok).toEqual(['b1', 'b2', 'b3']);
        expect(db.boletos.slice(0, 3).map(b => b.status)).toEqual(['rascunho', 'rascunho', 'rascunho']);
        expect(db.internal_transactions).toHaveLength(0);
        expect(db.invoices).toHaveLength(0);
    });

    it('trava de vínculo vira erro daquele boleto, sem parar o lote', async () => {
        lote();
        db.reconciliation_matches = [{ id: 'm1', internal_transaction_id: 'tx-1' }];
        const r = await boletoService.mudarStatusEmLote(['b1', 'b2'], ORG, 'rascunho');
        expect(r.ok).toEqual(['b2']);
        expect(r.errors[0]).toMatchObject({ id: 'b1', error: expect.stringMatching(/desfaça a conciliação/i) });
        expect(db.boletos[0].status).toBe('aprovado');
    });

    it('cancelar sem motivo é recusado antes de mexer em qualquer boleto', async () => {
        lote();
        await expect(boletoService.mudarStatusEmLote(['b1'], ORG, 'cancelado', { motivo: '  ' })).rejects.toThrow(/motivo/i);
        expect(db.boletos[0].status).toBe('aprovado');
    });
});
