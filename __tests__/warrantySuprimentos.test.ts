import { describe, it, expect } from 'vitest';
import {
    consolidarSuprimentos, motivoNaoComprar, rascunhoDaSolicitacao, sugestaoCustoReal,
} from '../utils/warrantySuprimentos';
import type { PurchaseRequest } from '../types/purchaseRequest';

const sc = (over: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
    id: 'sc1', organizationId: 'org1', projectId: 'obra1', title: 'Garantia — laje', priority: 'normal',
    estimatedTotal: 300, approvalStatus: 'APROVADO', approvalChain: [], approvalRequiredLevels: 1,
    items: [
        { id: 'i1', source: 'avulso', description: 'Manta', unit: 'm2', quantity: 10, estimatedUnitPrice: 20, purchaseOrderId: 'p1' },
        { id: 'i2', source: 'avulso', description: 'Primer', unit: 'l', quantity: 5, estimatedUnitPrice: 20 },
    ],
    ...over,
});

const item = (total: number, quotedTotal?: number) => ({ quantity: 1, unitPrice: total, total, quotedTotal });

describe('consolidarSuprimentos', () => {
    it('previsto, comprometido e realizado', () => {
        const r = consolidarSuprimentos(
            [sc()],
            [
                { id: 'p1', number: 'PC-1', status: 'Recebido', items: [item(250, 230)] },
                { id: 'p2', number: 'PC-2', status: 'Enviado', items: [item(100)] },
                { id: 'p3', number: 'PC-3', status: 'Rascunho', items: [item(40)] },
            ],
            [
                { id: 'c1', number: 'CT-1', status: 'Ativo', currentValue: 1000, medicoes: [
                    { totalValue: 300, status: 'Processada' }, { totalValue: 200, status: 'Pendente' }] },
                { id: 'c2', number: 'CT-2', status: 'Minuta', currentValue: 500 },
            ],
        );
        // previsto: item i2 sem pedido (5×20=100) + pedido rascunho 40 + contrato em minuta 500
        expect(r.previsto).toBe(640);
        // comprometido: p1 230 (cotado) + p2 100 + contrato ativo 1000
        expect(r.comprometido).toBe(1330);
        // realizado: p1 recebido 230 + medição processada 300
        expect(r.realizado).toBe(530);
        expect(r.linhas).toHaveLength(6);
    });

    it('pedido que chega pelo item e pela cotação conta uma vez só', () => {
        const p = { id: 'p1', status: 'Enviado', items: [item(100)] };
        expect(consolidarSuprimentos([], [p, p], []).comprometido).toBe(100);
    });

    it('cancelado não conta; SC cancelada/reprovada não prevê nada', () => {
        const r = consolidarSuprimentos(
            [sc({ cancelledAt: '2026-10-01' }), sc({ id: 'sc2', approvalStatus: 'REJEITADO' })],
            [{ id: 'p9', status: 'Cancelado', items: [item(999)] }],
            [{ id: 'c9', status: 'Cancelado', currentValue: 999 }],
        );
        expect([r.previsto, r.comprometido, r.realizado]).toEqual([0, 0, 0]);
    });

    it('realizado nunca passa do comprometido', () => {
        const r = consolidarSuprimentos([], [], [
            { id: 'c1', status: 'Ativo', currentValue: 100, medicoes: [{ totalValue: 150, status: 'Paga' }] },
        ]);
        expect(r.realizado).toBeLessThanOrEqual(r.comprometido);
    });

    it('custo real sugerido = realizado; zero → sem sugestão', () => {
        expect(sugestaoCustoReal({ realizado: 530 })).toBe(530);
        expect(sugestaoCustoReal({ realizado: 0 })).toBeNull();
    });
});

describe('motivoNaoComprar', () => {
    const ok = { state: 'EM_GARANTIA' as const, in_warranty: true, project_id: 'obra1', organization_id: 'org1' };
    const opts = { podeUsarSuprimentos: true, orgDaObra: 'org1' };

    it('liberado quando triado, com obra da mesma organização e permissão', () => {
        expect(motivoNaoComprar(ok, opts)).toBeNull();
    });
    it('cada bloqueio diz onde resolver', () => {
        expect(motivoNaoComprar(ok, { ...opts, podeUsarSuprimentos: false })).toMatch(/Suprimentos › Compras/);
        expect(motivoNaoComprar({ ...ok, in_warranty: null, state: 'ABERTO' }, opts)).toMatch(/triagem/);
        expect(motivoNaoComprar({ ...ok, project_id: null }, opts)).toMatch(/Editar › Obra/);
        expect(motivoNaoComprar(ok, { ...opts, orgDaObra: null })).toMatch(/não está entre as obras/);
        expect(motivoNaoComprar(ok, { ...opts, orgDaObra: 'org2' })).toMatch(/outra organização/);
        expect(motivoNaoComprar({ ...ok, state: 'ENCERRADO' }, opts)).toBe('Chamado encerrado.');
    });
});

describe('rascunhoDaSolicitacao', () => {
    const claim = {
        id: 'cl1', project_id: 'obra1', organization_id: 'org1', sistema_descricao: 'Impermeabilização',
        descricao: 'Infiltração no teto', local_afetado: 'Banheiro', unidade_ref: 'Torre A · 302',
        severity: 'alta', sla_deadline: '2026-10-20', cost_center_id: 'cc1', plano_de_contas_id: 'pc1',
    };
    it('preenche com o que o chamado sabe', () => {
        const d = rascunhoDaSolicitacao(claim, '2026-10-11', 'org1');
        expect(d).toMatchObject({
            projectId: 'obra1', title: 'Garantia — Impermeabilização — Torre A · 302', priority: 'urgente',
            needDate: '2026-10-20', costCenterId: 'cc1', planoDeContasId: 'pc1', warrantyClaimId: 'cl1',
        });
        expect(d.justification).toBe('Infiltração no teto\nLocal: Banheiro');
    });
    it('obra de outra org não leva CC/plano; prazo vencido não vira necessidade', () => {
        const d = rascunhoDaSolicitacao({ ...claim, severity: 'media', sla_deadline: '2026-10-01' }, '2026-10-11', 'org2');
        expect([d.costCenterId, d.planoDeContasId, d.needDate, d.priority]).toEqual(['', '', '', 'normal']);
    });
});
