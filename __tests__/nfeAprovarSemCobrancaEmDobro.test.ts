/**
 * Fiscal › aprovar NF-e com "Criar título" — trava contra cobrança em dobro
 * (19/10/2026, docs/planos/2026-10-19-pedido-fob-listas-fiscal.md).
 *
 * Pedido que já tem título no Contas a Pagar (parcelas do pedido, inclusive as
 * geradas sem nota pelo botão, ou título de outra nota) não ganha um segundo
 * título pela nota: ela se vincula ao existente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const NOTA = 'nf-1';
const PEDIDO = 'po-1';

let notaNoBanco: Record<string, unknown>;
let titulosDoPedidoNoBanco: Record<string, unknown>[] = [];
const inseridos: Record<string, unknown>[] = [];
const filtrosDaConsulta: Record<string, unknown>[] = [];

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => {
            const filtros: Record<string, unknown> = {};
            const cadeia: Record<string, unknown> = {
                select: () => cadeia,
                eq: (k: string, v: unknown) => { filtros[k] = v; return cadeia; },
                neq: (k: string, v: unknown) => { filtros[`!${k}`] = v; return cadeia; },
                order: async () => {
                    filtrosDaConsulta.push({ tabela, ...filtros });
                    return { data: tabela === 'internal_transactions' ? titulosDoPedidoNoBanco : [], error: null };
                },
                single: async () => (tabela === 'nfe_invoices'
                    ? { data: { ...notaNoBanco }, error: null }
                    : { data: { id: 'tx-novo' }, error: null }),
                insert: (linha: Record<string, unknown>) => {
                    inseridos.push({ tabela, ...linha });
                    return { select: () => ({ single: async () => ({ data: { id: 'tx-novo' }, error: null }) }), then: (r: (x: { error: null }) => void) => r({ error: null }) };
                },
                update: () => cadeia,
            };
            return cadeia;
        },
    },
}));
vi.mock('../services/supplierService', () => ({ supplierService: {} }));
vi.mock('../services/orderService', () => ({ orderService: {} }));
vi.mock('../services/processService', () => ({ processService: { triggerEvent: async () => {} } }));

import { approveAndLink, ERRO_PEDIDO_JA_TEM_TITULO } from '../services/nfeService';

const aprovar = (purchaseOrderId?: string) => approveAndLink({
    invoiceId: NOTA, organizationId: 'org', projectId: 'obra', dueDate: '2026-11-10', userId: 'u', purchaseOrderId,
});

describe('approveAndLink · pedido que já tem título', () => {
    beforeEach(() => {
        notaNoBanco = {
            id: NOTA, linked_transaction_id: null, document_status: 'active', purchase_order_id: null,
            total_value: 753.1, issuer_name: 'Sebastião', access_key: '12345678901234567890',
        };
        titulosDoPedidoNoBanco = [];
        inseridos.length = 0;
        filtrosDaConsulta.length = 0;
    });

    it('pedido escolhido com parcela já lançada: recusa e não insere nada', async () => {
        titulosDoPedidoNoBanco = [{ id: 'p1', description: 'Pagamento PO - Pedido X', amount: '753.10', due_date: '2026-11-18', source_system: 'PURCHASE_ORDER' }];
        await expect(aprovar(PEDIDO)).rejects.toThrow(ERRO_PEDIDO_JA_TEM_TITULO);
        expect(inseridos.filter(i => i.tabela === 'internal_transactions')).toHaveLength(0);
        // Confere o que conta como "título": débito principal não cancelado, deste pedido.
        expect(filtrosDaConsulta[0]).toMatchObject({
            tabela: 'internal_transactions', purchase_order_id: PEDIDO, direction: 'DEBIT', entry_type: 'PRINCIPAL', '!status': 'CANCELLED',
        });
    });

    it('vale também o pedido que a NOTA já tinha, mesmo sem escolher no modal', async () => {
        notaNoBanco.purchase_order_id = PEDIDO;
        titulosDoPedidoNoBanco = [{ id: 'p1', description: null, amount: 10, due_date: null, source_system: 'NFE' }];
        await expect(aprovar(undefined)).rejects.toThrow(ERRO_PEDIDO_JA_TEM_TITULO);
    });

    it('pedido sem título: cria o par débito/crédito normalmente (controle)', async () => {
        await aprovar(PEDIDO);
        const tx = inseridos.filter(i => i.tabela === 'internal_transactions');
        expect(tx.map(t => t.direction)).toEqual(['DEBIT', 'CREDIT']);
        tx.forEach(t => expect(t.purchase_order_id).toBe(PEDIDO));
    });

    it('nota sem pedido: nem consulta títulos, cria normalmente', async () => {
        await aprovar(undefined);
        expect(filtrosDaConsulta.filter(f => f.tabela === 'internal_transactions')).toHaveLength(0);
        expect(inseridos.filter(i => i.tabela === 'internal_transactions')).toHaveLength(2);
    });
});
