import { describe, it, expect } from 'vitest';
import { motivoNaoEnviaDarfParaAprovacao, aprovacaoDoDarfNaTela } from '../utils/darf';

describe('motivoNaoEnviaDarfParaAprovacao', () => {
    it('DARF em aberto e sem pendência pode ser enviado', () => {
        expect(motivoNaoEnviaDarfParaAprovacao({ n_pagos: 0, aprovacao: 'APROVADO' })).toBeNull();
        expect(motivoNaoEnviaDarfParaAprovacao({ n_pagos: 0, aprovacao: 'REJEITADO' })).toBeNull();
        expect(motivoNaoEnviaDarfParaAprovacao({ n_pagos: 0, aprovacao: 'RASCUNHO' })).toBeNull();
    });

    it('já pendente diz onde está', () => {
        expect(motivoNaoEnviaDarfParaAprovacao({ n_pagos: 0, aprovacao: 'PENDENTE' })).toBe('Já está em Financeiro › Aprovações');
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
    });

    it('pago ou rascunho não mostra linha de aprovação', () => {
        expect(aprovacaoDoDarfNaTela({ n_pagos: 1, aprovacao: 'APROVADO' })).toBeNull();
        expect(aprovacaoDoDarfNaTela({ n_pagos: 0, aprovacao: 'RASCUNHO' })).toBeNull();
    });
});
