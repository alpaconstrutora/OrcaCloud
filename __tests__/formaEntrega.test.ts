import { describe, expect, it } from 'vitest';
import {
    ehFob,
    FORMA_ENTREGA_CIF,
    FORMA_ENTREGA_FOB,
    FORMA_ENTREGA_PADRAO,
    FORMAS_DE_ENTREGA,
    rotuloStatusLogistico,
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
    it('no FOB, Em Trânsito é "Pronto para retirada" e Entregue é "Retirado"', () => {
        expect(rotuloStatusLogistico('Em Trânsito', true)).toBe('Pronto para retirada');
        expect(rotuloStatusLogistico('Entregue', true)).toBe('Retirado');
    });

    it('no FOB, os demais status não mudam', () => {
        for (const s of ['Confirmado', 'Separação', 'Recebido', 'Divergência', 'Cancelado']) {
            expect(rotuloStatusLogistico(s, true)).toBe(s);
        }
    });

    it('no CIF, nada muda', () => {
        expect(rotuloStatusLogistico('Em Trânsito', false)).toBe('Em Trânsito');
        expect(rotuloStatusLogistico('Entregue', false)).toBe('Entregue');
    });

    it('status ausente vira texto vazio, sem quebrar', () => {
        expect(rotuloStatusLogistico(undefined, true)).toBe('');
    });
});
