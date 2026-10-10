import { describe, it, expect } from 'vitest';
import { numerarParcelas, descricaoTributo } from '../utils/tributoDescricao';

describe('numerarParcelas', () => {
    it('numera pela ordem de vencimento, não pela ordem em que chegaram', () => {
        const parcelas = [
            { reference_id: 'c1-p2016-12-10', vencimento: '2016-12-10' },
            { reference_id: 'c1-p2016-10-10', vencimento: '2016-10-10' },
            { reference_id: 'c1-p2016-11-10', vencimento: '2016-11-10' },
        ];
        const n = numerarParcelas(parcelas, () => 'c1');
        expect(n.get('c1-p2016-10-10')).toEqual({ numero: 1, total: 3 });
        expect(n.get('c1-p2016-11-10')).toEqual({ numero: 2, total: 3 });
        expect(n.get('c1-p2016-12-10')).toEqual({ numero: 3, total: 3 });
    });

    it('cada contrato tem sua própria contagem', () => {
        const parcelas = [
            { reference_id: 'a-p1', vencimento: '2020-01-01' },
            { reference_id: 'b-p1', vencimento: '2020-01-01' },
            { reference_id: 'a-p2', vencimento: '2020-02-01' },
        ];
        const n = numerarParcelas(parcelas, p => p.reference_id.slice(0, 1));
        expect(n.get('a-p2')).toEqual({ numero: 2, total: 2 });
        expect(n.get('b-p1')).toEqual({ numero: 1, total: 1 });
    });

    it('vencimento igual desempata pelo reference_id (numeração estável)', () => {
        const parcelas = [
            { reference_id: 'x-2', vencimento: '2020-01-01' },
            { reference_id: 'x-1', vencimento: '2020-01-01' },
        ];
        const n = numerarParcelas(parcelas, () => 'x');
        expect(n.get('x-1')?.numero).toBe(1);
        expect(n.get('x-2')?.numero).toBe(2);
    });
});

describe('descricaoTributo', () => {
    it('monta "contrato - tributo - Parcela n/total (dd/mm/aaaa)"', () => {
        expect(descricaoTributo('LOC-0012/2026', 'PIS', { numero: 3, total: 12 }, '2016-11-10'))
            .toBe('LOC-0012/2026 - PIS - Parcela 3/12 (10/11/2016)');
    });

    it('sem vencimento, omite a data', () => {
        expect(descricaoTributo('LOC-1', 'COFINS', { numero: 1, total: 1 }, ''))
            .toBe('LOC-1 - COFINS - Parcela 1/1');
    });

    it('sem numeração, mantém "Parcela" e a data', () => {
        expect(descricaoTributo('Deal #abc12345', 'INSS', undefined, '2020-05-01'))
            .toBe('Deal #abc12345 - INSS - Parcela (01/05/2020)');
    });
});
