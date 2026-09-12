import { describe, expect, it } from 'vitest';
import { dealBuyersOf, primaryBuyerOf } from '../services/commercialService';

/**
 * `dealBuyersOf` é o funil de leitura dos compradores de uma negociação
 * (docs/planos/2026-09-12-vendas-multiplos-compradores.md). O contrato dele é
 * o mesmo de `dealUnitsOf`: SEMPRE uma lista, com exatamente um principal —
 * inclusive para negociação anterior à tabela `commercial_deal_buyers`, que só
 * tem `client_id`.
 */
describe('dealBuyersOf — normalização dos compradores da negociação', () => {
    it('negociação legada (só client_id) vira lista com 1 principal', () => {
        expect(dealBuyersOf({ client_id: 'c1' })).toEqual([{ client_id: 'c1', is_primary: true }]);
    });

    it('sem client_id nem buyers → lista vazia', () => {
        expect(dealBuyersOf({})).toEqual([]);
        expect(dealBuyersOf(null)).toEqual([]);
        expect(dealBuyersOf(undefined)).toEqual([]);
    });

    it('lista presente manda sobre client_id, e mantém o principal marcado', () => {
        const buyers = dealBuyersOf({
            client_id: 'c1',
            buyers: [
                { client_id: 'c1', is_primary: false },
                { client_id: 'c2', is_primary: true },
            ],
        });
        expect(buyers.map(b => b.client_id)).toEqual(['c1', 'c2']);
        expect(buyers.filter(b => b.is_primary).map(b => b.client_id)).toEqual(['c2']);
    });

    it('lista sem principal marcado → o primeiro assume', () => {
        const buyers = dealBuyersOf({ buyers: [{ client_id: 'c1' }, { client_id: 'c2' }] });
        expect(buyers.map(b => b.is_primary)).toEqual([true, false]);
    });

    it('dois marcados como principal → só o primeiro deles fica', () => {
        const buyers = dealBuyersOf({
            buyers: [
                { client_id: 'c1', is_primary: true },
                { client_id: 'c2', is_primary: true },
            ],
        });
        expect(buyers.map(b => b.is_primary)).toEqual([true, false]);
    });

    it('descarta duplicatas de client_id e linhas sem client_id', () => {
        const buyers = dealBuyersOf({
            buyers: [
                { client_id: 'c1' },
                { client_id: '' },
                { client_id: 'c1', is_primary: true },
                { client_id: 'c2' },
            ],
        });
        expect(buyers.map(b => b.client_id)).toEqual(['c1', 'c2']);
        // A duplicata marcada como principal foi descartada; a primeira ocorrência
        // de c1 é a que sobrevive, e ela assume como principal.
        expect(buyers.map(b => b.is_primary)).toEqual([true, false]);
    });

    it('lista só com linhas inválidas cai no legado (client_id)', () => {
        expect(dealBuyersOf({ client_id: 'c9', buyers: [{ client_id: '' }] }))
            .toEqual([{ client_id: 'c9', is_primary: true }]);
    });

    it('primaryBuyerOf devolve o principal (ou o primeiro)', () => {
        expect(primaryBuyerOf({ buyers: [{ client_id: 'a' }, { client_id: 'b', is_primary: true }] })?.client_id).toBe('b');
        expect(primaryBuyerOf({ client_id: 'z' })?.client_id).toBe('z');
        expect(primaryBuyerOf({})).toBeUndefined();
    });
});
