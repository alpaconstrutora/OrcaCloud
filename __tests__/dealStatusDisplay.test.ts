import { describe, it, expect } from 'vitest';
import { getDealStatusDisplay } from '../lib/dealWorkflow';

describe('getDealStatusDisplay', () => {
    it('usa o vocabulário do stepper para cada etapa', () => {
        expect(getDealStatusDisplay('IN_NEGOTIATION').label).toBe('Proposta');
        expect(getDealStatusDisplay('PENDING').label).toBe('Aprovação');
        expect(getDealStatusDisplay('RESERVA').label).toBe('Reserva');
        expect(getDealStatusDisplay('CONTRATO').label).toBe('Contrato');
        expect(getDealStatusDisplay('ASSINATURA').label).toBe('Assinatura');
        expect(getDealStatusDisplay('COMPLETED').label).toBe('Concluído');
        expect(getDealStatusDisplay('CANCELLED').label).toBe('Cancelado');
    });

    it('WAITING_PAYMENT (legado) é Reserva', () => {
        expect(getDealStatusDisplay('WAITING_PAYMENT').label).toBe('Reserva');
    });

    it('locação conclui como "Alugado"; venda continua "Concluído"', () => {
        expect(getDealStatusDisplay('COMPLETED', 'RENTAL').label).toBe('Alugado');
        expect(getDealStatusDisplay('COMPLETED', 'SALE').label).toBe('Concluído');
    });

    it('sem status assume o começo do fluxo', () => {
        expect(getDealStatusDisplay(undefined).label).toBe('Proposta');
        expect(getDealStatusDisplay(null).label).toBe('Proposta');
        expect(getDealStatusDisplay('').label).toBe('Proposta');
    });

    it('status desconhecido aparece cru, não vira "Pendente"', () => {
        expect(getDealStatusDisplay('FOO')).toEqual({ label: 'FOO', color: 'text-gray-600' });
    });

    it('cada etapa tem cor própria — nunca duas iguais coladas', () => {
        const cores = ['IN_NEGOTIATION', 'PENDING', 'RESERVA', 'CONTRATO', 'ASSINATURA', 'COMPLETED', 'CANCELLED']
            .map(s => getDealStatusDisplay(s).color);
        expect(new Set(cores).size).toBe(cores.length);
    });
});
