import { describe, it, expect } from 'vitest';
import { situacaoDaParcela } from '../utils/situacaoParcelaParceiro';

describe('situacaoDaParcela — Portal do Parceiro e visão do gestor', () => {
    it('cancelada NÃO é paga (era o defeito: status !== PENDING virava "Pago")', () => {
        expect(situacaoDaParcela({ status: 'CANCELLED', business_status: 'CANCELADO' })).toBe('CANCELADA');
        expect(situacaoDaParcela({ status: 'CANCELLED', business_status: null })).toBe('CANCELADA');
    });

    it('conciliada ou PAGO é paga — inclusive CONCILIATED/PREVISTO (baixa pelo extrato)', () => {
        expect(situacaoDaParcela({ status: 'CONCILIATED', business_status: 'PAGO' })).toBe('PAGA');
        expect(situacaoDaParcela({ status: 'CONCILIATED', business_status: 'PREVISTO' })).toBe('PAGA');
        expect(situacaoDaParcela({ status: 'PENDING', business_status: 'PAGO' })).toBe('PAGA');
    });

    it('pendente é aberta, com ou sem business_status', () => {
        expect(situacaoDaParcela({ status: 'PENDING', business_status: 'PREVISTO' })).toBe('ABERTA');
        expect(situacaoDaParcela({ status: 'PENDING', business_status: null })).toBe('ABERTA');
    });
});
