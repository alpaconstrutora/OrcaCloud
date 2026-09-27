import { describe, it, expect } from 'vitest';
import {
    statusDaSolicitacao, motivoNaoEditar, motivoRascunhoInvalido, motivoNaoEnviar,
    motivoNaoCancelar, motivoNaoExcluir, motivoNaoDecidir, itensConvertiveis,
    motivoNaoConverter, totalEstimado, itensParaCotacao, itensParaPedido, situacaoDoItem,
} from '../utils/solicitacaoCompra';
import type { PurchaseRequestDraft, PurchaseRequestItem } from '../types/purchaseRequest';
import type { ApprovalStatus } from '../types/financial';

const item = (p: Partial<PurchaseRequestItem> = {}): PurchaseRequestItem => ({
    position: 0, source: 'avulso', description: 'Cimento CP-II', unit: 'sc',
    quantity: 10, estimatedUnitPrice: 35.5, ...p,
});
const sc = (approvalStatus: ApprovalStatus, items: PurchaseRequestItem[] = [item()], cancelledAt: string | null = null) =>
    ({ approvalStatus, cancelledAt, items });
const draft = (p: Partial<PurchaseRequestDraft> = {}): PurchaseRequestDraft => ({
    projectId: 'p1', title: 'Concretagem bloco B', priority: 'normal', items: [item()], ...p,
});

describe('statusDaSolicitacao — precedência', () => {
    it('cancelada vence qualquer outro estado', () => {
        expect(statusDaSolicitacao(sc('APROVADO', [item({ purchaseOrderId: 'po' })], '2026-09-26'))).toBe('cancelada');
        expect(statusDaSolicitacao(sc('PENDENTE', [item()], '2026-09-26'))).toBe('cancelada');
    });
    it('fase de aprovação vem do motor', () => {
        expect(statusDaSolicitacao(sc('RASCUNHO'))).toBe('rascunho');
        expect(statusDaSolicitacao(sc('PENDENTE'))).toBe('em_aprovacao');
        expect(statusDaSolicitacao(sc('REJEITADO'))).toBe('reprovada');
    });
    it('aprovada: nenhum / parte / todos atendidos', () => {
        expect(statusDaSolicitacao(sc('APROVADO', [item(), item()]))).toBe('aprovada');
        expect(statusDaSolicitacao(sc('APROVADO', [item({ quotationRequestId: 'q' }), item()]))).toBe('em_atendimento');
        expect(statusDaSolicitacao(sc('APROVADO', [item({ quotationRequestId: 'q' }), item({ purchaseOrderId: 'po' })]))).toBe('atendida');
    });
    it('item cancelado não conta para atendimento', () => {
        expect(statusDaSolicitacao(sc('APROVADO', [item({ purchaseOrderId: 'po' }), item({ cancelledAt: 'x' })]))).toBe('atendida');
        expect(statusDaSolicitacao(sc('APROVADO', [item({ cancelledAt: 'x' })]))).toBe('aprovada');
    });
});

describe('travas com motivo', () => {
    it('edita só rascunho e reprovada', () => {
        expect(motivoNaoEditar(sc('RASCUNHO'))).toBeNull();
        expect(motivoNaoEditar(sc('REJEITADO'))).toBeNull();
        expect(motivoNaoEditar(sc('PENDENTE'))).toMatch(/aprovação/);
        expect(motivoNaoEditar(sc('APROVADO'))).toMatch(/Aprovada/);
        expect(motivoNaoEditar(sc('RASCUNHO', [], 'x'))).toMatch(/cancelada/);
    });
    it('rascunho inválido diz qual campo', () => {
        expect(motivoRascunhoInvalido(draft())).toBeNull();
        expect(motivoRascunhoInvalido(draft({ projectId: '' }))).toMatch(/obra/);
        expect(motivoRascunhoInvalido(draft({ title: '  ' }))).toMatch(/título/);
        expect(motivoRascunhoInvalido(draft({ items: [] }))).toMatch(/ao menos um item/);
        expect(motivoRascunhoInvalido(draft({ items: [item({ cancelledAt: 'x' })] }))).toMatch(/ao menos um item/);
        expect(motivoRascunhoInvalido(draft({ items: [item(), item({ quantity: 0 })] }))).toBe('Item 2: a quantidade precisa ser maior que zero.');
        expect(motivoRascunhoInvalido(draft({ items: [item({ description: '' })] }))).toMatch(/Item 1: informe a descrição/);
        expect(motivoRascunhoInvalido(draft({ items: [item({ estimatedUnitPrice: -1 })] }))).toMatch(/negativo/);
    });
    it('enviar = editar + rascunho válido', () => {
        expect(motivoNaoEnviar(sc('RASCUNHO'), draft())).toBeNull();
        expect(motivoNaoEnviar(sc('PENDENTE'), draft())).toMatch(/aprovação/);
        expect(motivoNaoEnviar(sc('REJEITADO'), draft({ title: '' }))).toMatch(/título/);
    });
    it('cancelar, excluir, decidir', () => {
        expect(motivoNaoCancelar(sc('APROVADO'))).toBeNull();
        expect(motivoNaoCancelar(sc('APROVADO', [item({ purchaseOrderId: 'po' })]))).toMatch(/atendidos/);
        expect(motivoNaoCancelar(sc('RASCUNHO', [], 'x'))).toMatch(/já cancelada/);
        expect(motivoNaoExcluir(sc('RASCUNHO'))).toBeNull();
        expect(motivoNaoExcluir(sc('REJEITADO'))).toMatch(/Cancelar/);
        expect(motivoNaoDecidir(sc('PENDENTE'))).toBeNull();
        expect(motivoNaoDecidir(sc('APROVADO'))).toMatch(/em aprovação/);
        expect(motivoNaoDecidir(sc('PENDENTE', [], 'x'))).toMatch(/cancelada/);
    });
});

describe('conversão', () => {
    const a = item({ id: 'a' });
    const b = item({ id: 'b', quotationRequestId: 'q' });
    const c = item({ id: 'c', cancelledAt: 'x' });

    it('só itens ativos e não atendidos de SC aprovada', () => {
        expect(itensConvertiveis(sc('APROVADO', [a, b, c])).map(i => i.id)).toEqual(['a']);
        expect(itensConvertiveis(sc('PENDENTE', [a]))).toEqual([]);
        expect(itensConvertiveis(sc('APROVADO', [a], 'x'))).toEqual([]);
    });
    it('motivo de não converter', () => {
        expect(motivoNaoConverter(sc('APROVADO', [a, b]), [a])).toBeNull();
        expect(motivoNaoConverter(sc('APROVADO', [a, b]), [])).toMatch(/Marque/);
        expect(motivoNaoConverter(sc('APROVADO', [a, b]), [b])).toMatch(/já foi atendido/);
        expect(motivoNaoConverter(sc('APROVADO', [b]), [b])).toMatch(/Todos os itens/);
        expect(motivoNaoConverter(sc('PENDENTE', [a]), [a])).toMatch(/aprovada/);
    });
    it('total estimado ignora cancelado e arredonda', () => {
        expect(totalEstimado([item({ quantity: 3, estimatedUnitPrice: 0.335 }), c])).toBe(1.01);
        expect(totalEstimado([item({ estimatedUnitPrice: 0 })])).toBe(0);
    });
    it('mapeia para cotação e pedido (preço estimado = referência)', () => {
        const i = item({ inputCode: '00001', quantity: 2, estimatedUnitPrice: 10.005 });
        expect(itensParaCotacao([i])).toEqual([{ code: '00001', description: 'Cimento CP-II', unit: 'sc', quantity: 2, unitPrice: 10.005 }]);
        const [po] = itensParaPedido([i, item({ inputCode: null })]);
        expect(po).toEqual({ code: '00001', description: 'Cimento CP-II', unit: 'sc', quantity: 2, unitPrice: 10.005, total: 20.01 });
        expect(po).not.toHaveProperty('quotedUnitPrice');
        expect(itensParaPedido([item({ inputCode: null })])[0].code).toBe('');
    });
    it('situação do item', () => {
        expect(situacaoDoItem(item())).toBe('Pendente');
        expect(situacaoDoItem(item({ quotationRequestId: 'q', quotationNumber: 'COT-1' }))).toBe('Cotação COT-1');
        expect(situacaoDoItem(item({ quotationRequestId: 'q', purchaseOrderId: 'p', purchaseOrderNumber: 'PCO-1' }))).toBe('Pedido PCO-1');
        expect(situacaoDoItem(item({ cancelledAt: 'x', purchaseOrderId: 'p' }))).toBe('Cancelado');
    });
});
