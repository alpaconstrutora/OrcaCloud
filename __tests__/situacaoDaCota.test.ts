// Situação da cota condominial (inadimplência no Portal do Síndico, 20/10/2026).
import { describe, it, expect } from 'vitest';
import { situacaoDaCota, tituloEstaPago, situacaoPorUnidade, inadimplenciaDoPredio } from '../utils/situacaoDaCota';
import { mapReceivableRow } from '../services/commercialFinanceService';

const HOJE = '2026-10-20';

describe('situacaoDaCota', () => {
    it('sem título = não cobrada (nunca "em aberto")', () => {
        expect(situacaoDaCota({}, HOJE)).toBe('NAO_COBRADA');
        expect(situacaoDaCota({ tituloStatus: null, vencimento: '2026-01-01' }, HOJE)).toBe('NAO_COBRADA');
    });

    it('conciliado ou baixado à mão = paga', () => {
        expect(situacaoDaCota({ tituloStatus: 'CONCILIATED', vencimento: '2026-01-01' }, HOJE)).toBe('PAGA');
        expect(situacaoDaCota({ tituloStatus: 'PENDING', tituloNegocio: 'RECEBIDO', vencimento: '2026-01-01' }, HOJE)).toBe('PAGA');
    });

    it('pendente: vencida só depois do dia do vencimento', () => {
        expect(situacaoDaCota({ tituloStatus: 'PENDING', vencimento: '2026-10-19' }, HOJE)).toBe('VENCIDA');
        expect(situacaoDaCota({ tituloStatus: 'PENDING', vencimento: '2026-10-20' }, HOJE)).toBe('EM_ABERTO');
        expect(situacaoDaCota({ tituloStatus: 'PENDING', vencimento: null }, HOJE)).toBe('EM_ABERTO');
    });

    it('cancelado = cancelada', () => {
        expect(situacaoDaCota({ tituloStatus: 'CANCELLED', vencimento: '2026-01-01' }, HOJE)).toBe('CANCELADA');
    });

    it('a regra de "pago" é a mesma de Contas a Receber', () => {
        const casos: Array<[string, string | null]> = [
            ['CONCILIATED', null], ['PENDING', 'PAGO'], ['PENDING', 'RECEBIDO'], ['PENDING', null], ['CANCELLED', null],
        ];
        for (const [status, business_status] of casos) {
            const pagoNoReceber = mapReceivableRow({ id: 'x', status, business_status, amount: 1 } as never, 'c').status === 'PAID';
            expect(tituloEstaPago(status, business_status)).toBe(pagoNoReceber);
        }
    });
});

describe('situacaoPorUnidade / inadimplenciaDoPredio', () => {
    const rateios = [
        { competencia: '2026-08-01', status: 'FECHADO', cotas: [
            { unitId: 'u1', valor: 100, tituloStatus: 'PENDING', vencimento: '2026-09-10' },
            { unitId: 'u2', valor: 200, tituloStatus: 'CONCILIATED', vencimento: '2026-09-10' },
        ] },
        { competencia: '2026-09-01', status: 'FECHADO', cotas: [
            { unitId: 'u1', valor: 110, tituloStatus: 'PENDING', vencimento: '2026-10-10' },
            { unitId: 'u2', valor: 210, tituloStatus: 'PENDING', vencimento: '2026-10-30' },
            { unitId: null, valor: 5 },
        ] },
        // Rascunho é prévia: não conta nem como "última" nem como atraso.
        { competencia: '2026-10-01', status: 'RASCUNHO', cotas: [
            { unitId: 'u1', valor: 999, tituloStatus: 'PENDING', vencimento: '2026-01-01' },
        ] },
    ];

    it('última cota = competência fechada mais recente; vencidas somam todas', () => {
        const m = situacaoPorUnidade(rateios, HOJE);
        expect(m.get('u1')).toEqual({ ultima: { competencia: '2026-09-01', valor: 110, situacao: 'VENCIDA' }, vencidas: 2, valorVencido: 210 });
        expect(m.get('u2')).toEqual({ ultima: { competencia: '2026-09-01', valor: 210, situacao: 'EM_ABERTO' }, vencidas: 0, valorVencido: 0 });
    });

    it('totais do prédio', () => {
        expect(inadimplenciaDoPredio(rateios, HOJE)).toEqual({ unidades: 1, valor: 210 });
    });
});
