/**
 * `financialSyncService.syncFinancialData` — o espelho do JSON da obra no razão.
 * Pedido de 17/09/2026, docs/planos/2026-09-17-portal-fornecedor-aba-financeiro.md
 *
 * Ele faz upsert de TODAS as transações do JSON por
 * (organization_id, reference_id, entry_type). A parcela de pedido que
 * `financialService.syncOrderToFinance` grava tem o MESMO reference_id (id do
 * tx do JSON) — então este upsert cai em cima dela. Até 17/09 ele carimbava
 * `source_system='PROJECT'` e não emitia `purchase_order_id` nem `party_*`:
 * a cada conciliação/salvamento da obra a parcela perdia origem, vínculo e
 * fornecedor. Foi assim que 12 de 12 parcelas de pedido em produção ficaram
 * invisíveis para o Portal do Fornecedor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upserts: Record<string, unknown>[][] = [];

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => ({
            select: () => ({ in: async () => ({ data: [] }) }),
            upsert: async (linhas: Record<string, unknown>[]) => {
                if (tabela === 'internal_transactions') upserts.push(linhas);
                return { error: null };
            },
        }),
    },
}));
vi.mock('../utils/systemProjects', () => ({ isSystemProject: () => false }));

import { financialSyncService } from '../services/financialSyncService';

const PEDIDO = 'e74427c6-4b21-429f-accb-889f3c4d2d55';

const obra = {
    id: 'proj1',
    name: 'Garden',
    settings: {
        organizationId: 'org1',
        financialInfo: {
            totalValue: 0, paymentMethod: 'x', installments: [],
            transactions: [
                { id: 'tx-po', date: '2026-04-11', type: 'EXPENSE', value: 561.25, status: 'PENDING',
                  description: 'Pagamento PO - Pedido PO-551252 (1/8)', supplier: 'MCC',
                  supplierId: 'sup1', orderId: PEDIDO, category: 'Material' },
                { id: 'tx-manual', date: '2026-04-12', type: 'EXPENSE', value: 10, status: 'PAID',
                  description: 'Café', supplier: 'Padaria', category: 'Despesa de Obra' },
            ],
        },
    },
} as unknown as Parameters<typeof financialSyncService.syncFinancialData>[0];

describe('syncFinancialData · parcela de pedido continua sendo de pedido depois do espelho', () => {
    beforeEach(() => { upserts.length = 0; });

    it('leva purchase_order_id e origem PURCHASE_ORDER quando o tx tem orderId', async () => {
        await financialSyncService.syncFinancialData(obra, 'org1');
        const linha = upserts[0].find(l => l.reference_id === 'tx-po')!;
        expect(linha.purchase_order_id).toBe(PEDIDO);
        expect(linha.source_system).toBe('PURCHASE_ORDER');
        expect(linha.supplier_id).toBe('sup1');
        expect(linha.party_type).toBe('SUPPLIER');
        expect(linha.party_name).toBe('MCC');
    });

    it('despesa manual segue como PROJECT, sem pedido, mas com a contraparte explícita', async () => {
        await financialSyncService.syncFinancialData(obra, 'org1');
        const linha = upserts[0].find(l => l.reference_id === 'tx-manual')!;
        expect(linha.source_system).toBe('PROJECT');
        expect(linha.purchase_order_id).toBeNull();
        // Chave presente (não ausente): o PostgREST une as chaves do array, e
        // uma chave ausente numa linha vira NULL no upsert — apagaria o
        // fornecedor que outro produtor gravou.
        expect('party_name' in linha).toBe(true);
        expect(linha.party_name).toBe('Padaria');
    });
});
