/**
 * 2026-10-11 (Fase 4.4 do plano da ligação Pós-Obra ↔ Suprimentos): o pedido
 * criado ao escolher o vencedor da cotação herda o centro de custo e o plano de
 * contas da Solicitação de Compra de origem — como o pedido gerado direto da SC
 * (`generateOrder`) já fazia. Antes nascia sem os dois.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;
let itensDaSC: Linha[] = [];
const createOrder = vi.fn(async () => ({ id: 'po1' }));

function query(tabela: string) {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    const resposta = async () => {
        if (tabela === 'purchase_request_items') return { data: itensDaSC, error: null };
        if (tabela === 'quotation_responses') return { data: { supplier_id: 'f1', items: [], delivery_date: '2026-10-20' }, error: null };
        if (tabela === 'quotation_requests') return { data: { id: 'q1', number: 'CT-1', project_id: 'obra1', items: [] }, error: null };
        return { data: null, error: null };
    };
    Object.assign(q, {
        select: chain, eq: chain, neq: chain, update: chain,
        single: () => resposta(),
        then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => resposta().then(res, rej),
    });
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => query(t) } }));
vi.mock('../services/orderService', () => ({ orderService: { createOrder: (...a: unknown[]) => createOrder(...a) } }));
vi.mock('../services/quotationNumberingService', () => ({ generateQuotationNumber: async () => 'CT-1' }));

import { quotationService, classificacaoDaSolicitacaoDeOrigem } from '../services/quotationService';

describe('pedido gerado pela cotação herda CC e plano da SC', () => {
    beforeEach(() => { createOrder.mockClear(); });

    it('selectWinner passa o CC e o plano da SC de origem ao pedido', async () => {
        itensDaSC = [{ purchase_requests: { cost_center_id: 'cc1', plano_de_contas_id: 'pc1' } }];
        await quotationService.selectWinner('q1', 'r1');
        expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({
            costCenterId: 'cc1', planoDeContasId: 'pc1', quotationRequestId: 'q1',
        }));
    });

    it('cotação feita à mão (sem SC): pedido segue sem os dois', async () => {
        itensDaSC = [];
        await quotationService.selectWinner('q1', 'r1');
        const arg = (createOrder.mock.calls[0] as unknown[])[0] as Linha;
        expect(arg.costCenterId).toBeUndefined();
        expect(arg.planoDeContasId).toBeUndefined();
    });

    it('várias SCs: cada campo vem da primeira que o tem', async () => {
        itensDaSC = [
            { purchase_requests: { cost_center_id: null, plano_de_contas_id: 'pc2' } },
            { purchase_requests: { cost_center_id: 'cc3', plano_de_contas_id: 'pc3' } },
        ];
        expect(await classificacaoDaSolicitacaoDeOrigem('q1')).toEqual({ costCenterId: 'cc3', planoDeContasId: 'pc2' });
    });
});
