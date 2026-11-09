import { describe, it, expect } from 'vitest';
import type { Payable } from '../types/financial';
import {
    motivoNaoEnviaDarfParaAprovacao, aprovacaoDoDarfNaTela, motivoForaDeContasAPagar, soOsDeContasAPagar,
    MOTIVO_DARF_NAO_ENVIADO, MOTIVO_TRIBUTO_SEM_DARF,
} from '../utils/darf';

describe('motivoNaoEnviaDarfParaAprovacao', () => {
    it('rascunho e rejeitado podem ser enviados', () => {
        expect(motivoNaoEnviaDarfParaAprovacao({ n_pagos: 0, aprovacao: 'REJEITADO' })).toBeNull();
        expect(motivoNaoEnviaDarfParaAprovacao({ n_pagos: 0, aprovacao: 'RASCUNHO' })).toBeNull();
    });

    it('já pendente diz onde está', () => {
        expect(motivoNaoEnviaDarfParaAprovacao({ n_pagos: 0, aprovacao: 'PENDENTE' })).toBe('Já está em Financeiro › Aprovações');
    });

    it('aprovado não volta para a fila', () => {
        expect(motivoNaoEnviaDarfParaAprovacao({ n_pagos: 0, aprovacao: 'APROVADO' })).toBe('Já aprovado — liberado para pagamento em Contas a Pagar');
    });

    it('pago não vai para aprovação', () => {
        expect(motivoNaoEnviaDarfParaAprovacao({ n_pagos: 2, aprovacao: 'APROVADO' })).toBe('DARF pago — não há pagamento a aprovar');
    });
});

describe('aprovacaoDoDarfNaTela', () => {
    it('rótulo e cor por situação', () => {
        expect(aprovacaoDoDarfNaTela({ n_pagos: 0, aprovacao: 'PENDENTE' })).toEqual({ rotulo: 'Aguardando aprovação', cor: 'text-orange-700' });
        expect(aprovacaoDoDarfNaTela({ n_pagos: 0, aprovacao: 'APROVADO' })).toEqual({ rotulo: 'Liberado para pagamento', cor: 'text-blue-700' });
        expect(aprovacaoDoDarfNaTela({ n_pagos: 0, aprovacao: 'REJEITADO' })).toEqual({ rotulo: 'Bloqueado', cor: 'text-red-700' });
        expect(aprovacaoDoDarfNaTela({ n_pagos: 0, aprovacao: 'RASCUNHO' })).toEqual({ rotulo: 'Não enviado', cor: 'text-gray-600' });
    });

    it('pago não mostra linha de aprovação', () => {
        expect(aprovacaoDoDarfNaTela({ n_pagos: 1, aprovacao: 'APROVADO' })).toBeNull();
    });
});

// Pedido de 09/11/2026: tributo só chega a Contas a Pagar com o DARF fechado (enviado).
const titulo = (id: string, over: Partial<Payable> = {}): Payable => ({
    id, organization_id: 'org1', source_system: 'COMMERCIAL', transaction_date: '2026-10-05', due_date: '2026-10-25',
    amount: 100, direction: 'DEBIT', party_name: 'PIS', party_type: 'TAX',
    status: 'PENDING', business_status: 'PREVISTO', effective_status: 'PREVISTO', ...over,
} as Payable);

describe('motivoForaDeContasAPagar', () => {
    it('tributo solto em aberto fica fora; FGTS solto continua avulso', () => {
        expect(motivoForaDeContasAPagar(titulo('a'))).toBe(MOTIVO_TRIBUTO_SEM_DARF);
        expect(motivoForaDeContasAPagar(titulo('r', { business_status: 'RETIDO', effective_status: 'RETIDO' }))).toBe(MOTIVO_TRIBUTO_SEM_DARF);
        expect(motivoForaDeContasAPagar(titulo('f', { party_name: 'FGTS' }))).toBeNull();
        expect(motivoForaDeContasAPagar(titulo('g', { party_name: ' FGTS (folha 10/2026)' }))).toBeNull();
    });

    it('tributo já pago fica (histórico e estorno)', () => {
        expect(motivoForaDeContasAPagar(titulo('p', { status: 'CONCILIATED' }))).toBeNull();
        expect(motivoForaDeContasAPagar(titulo('q', { business_status: 'PAGO' }))).toBeNull();
    });

    it('membro de DARF segue a aprovação do DARF: só rascunho fica fora', () => {
        expect(motivoForaDeContasAPagar(titulo('d', { darf_id: 'x' }), 'RASCUNHO')).toBe(MOTIVO_DARF_NAO_ENVIADO);
        for (const a of ['PENDENTE', 'APROVADO', 'REJEITADO']) {
            expect(motivoForaDeContasAPagar(titulo('d', { darf_id: 'x' }), a)).toBeNull();
        }
    });

    it('sem a aprovação do DARF, vale a do próprio membro', () => {
        expect(motivoForaDeContasAPagar(titulo('d', { darf_id: 'x', approval_status: 'PENDENTE' }))).toBeNull();
        expect(motivoForaDeContasAPagar(titulo('d', { darf_id: 'x', approval_status: 'RASCUNHO' }))).toBe(MOTIVO_DARF_NAO_ENVIADO);
        expect(motivoForaDeContasAPagar(titulo('d', { darf_id: 'x' }))).toBe(MOTIVO_DARF_NAO_ENVIADO);
    });

    it('multa/juros do DARF seguem o DARF', () => {
        const multa = titulo('m', { source_system: 'DARF', party_type: 'GOVERNMENT', party_name: 'Receita Federal', darf_id: 'x' });
        expect(motivoForaDeContasAPagar(multa, 'RASCUNHO')).toBe(MOTIVO_DARF_NAO_ENVIADO);
        expect(motivoForaDeContasAPagar(multa, 'PENDENTE')).toBeNull();
    });

    it('título que não é tributo nunca é cortado', () => {
        expect(motivoForaDeContasAPagar(titulo('s', { party_type: undefined, party_name: 'Fornecedor X' }))).toBeNull();
        expect(motivoForaDeContasAPagar(titulo('s', { party_type: 'SUPPLIER', party_name: 'Fornecedor X' }))).toBeNull();
    });
});

describe('soOsDeContasAPagar', () => {
    it('corta tributo solto e DARF rascunho; mantém DARF enviado, FGTS e fornecedor', () => {
        const lista = [
            titulo('solto'),
            titulo('fgts', { party_name: 'FGTS' }),
            titulo('forn', { party_type: 'SUPPLIER', party_name: 'Fornecedor X' }),
            titulo('rasc', { darf_id: 'd1' }),
            titulo('env', { darf_id: 'd2' }),
        ];
        const ids = soOsDeContasAPagar(lista, [{ id: 'd1', aprovacao: 'RASCUNHO' }, { id: 'd2', aprovacao: 'PENDENTE' }]).map(p => p.id);
        expect(ids).toEqual(['fgts', 'forn', 'env']);
    });
});
