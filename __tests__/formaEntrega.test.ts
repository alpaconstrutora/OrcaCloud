import { describe, expect, it } from 'vitest';
import {
    ehFob,
    FORMA_ENTREGA_CIF,
    FORMA_ENTREGA_FOB,
    FORMA_ENTREGA_PADRAO,
    FORMAS_DE_ENTREGA,
    rotuloStatusLogistico,
    situacaoDaRetirada,
} from '../utils/formaEntrega';

describe('formaEntrega · só CIF e FOB', () => {
    it('a lista tem exatamente as duas opções, CIF primeiro (padrão)', () => {
        expect(FORMAS_DE_ENTREGA).toEqual([FORMA_ENTREGA_CIF, FORMA_ENTREGA_FOB]);
        expect(FORMA_ENTREGA_PADRAO).toBe(FORMA_ENTREGA_CIF);
    });

    it('ehFob reconhece o texto gravado e variações, e nada mais', () => {
        expect(ehFob(FORMA_ENTREGA_FOB)).toBe(true);
        expect(ehFob(' fob ')).toBe(true);
        expect(ehFob(FORMA_ENTREGA_CIF)).toBe(false);
        expect(ehFob(undefined)).toBe(false);
        expect(ehFob(null)).toBe(false);
        expect(ehFob('')).toBe(false);
    });
});

describe('rotuloStatusLogistico', () => {
    it('no FOB, Entregue é "Retirado" e as etapas do fornecedor viram "Aguardando retirada"', () => {
        expect(rotuloStatusLogistico('Entregue', true)).toBe('Retirado');
        expect(rotuloStatusLogistico('Separação', true)).toBe('Aguardando retirada');
        expect(rotuloStatusLogistico('Em Trânsito', true)).toBe('Aguardando retirada');
    });

    it('no FOB, os demais status não mudam', () => {
        for (const s of ['Rascunho', 'Enviado', 'Confirmado', 'Recebido', 'Divergência', 'Cancelado']) {
            expect(rotuloStatusLogistico(s, true)).toBe(s);
        }
    });

    it('no CIF, nada muda', () => {
        expect(rotuloStatusLogistico('Separação', false)).toBe('Separação');
        expect(rotuloStatusLogistico('Em Trânsito', false)).toBe('Em Trânsito');
        expect(rotuloStatusLogistico('Entregue', false)).toBe('Entregue');
    });

    it('status ausente vira texto vazio, sem quebrar', () => {
        expect(rotuloStatusLogistico(undefined, true)).toBe('');
    });
});

describe('situacaoDaRetirada · o comprador registra a retirada do FOB', () => {
    it('pode a partir do envio — sem esperar ação do fornecedor', () => {
        for (const s of ['Enviado', 'Confirmado', 'Separação', 'Em Trânsito']) {
            expect(situacaoDaRetirada(s)).toEqual({ pode: true, motivo: '' });
        }
    });

    it('Rascunho e Em Negociação: botão desligado, dizendo por quê', () => {
        const rascunho = situacaoDaRetirada('Rascunho');
        expect(rascunho.pode).toBe(false);
        expect(rascunho.motivo).toMatch(/Envie o pedido/);
        const negociacao = situacaoDaRetirada('Em Negociação');
        expect(negociacao.pode).toBe(false);
        expect(negociacao.motivo).toMatch(/negociação/);
    });

    it('já retirado, recebido ou cancelado: sem botão (pode=false, sem motivo)', () => {
        for (const s of ['Entregue', 'Recebido', 'Divergência', 'Cancelado', undefined]) {
            expect(situacaoDaRetirada(s)).toEqual({ pode: false, motivo: '' });
        }
    });
});
