import { describe, it, expect } from 'vitest';
import { baseDaAsaas, linhaDoExtrato, vinculoDoExtrato, janelaDoExtrato, valoresIguais } from '../utils/asaasExtrato';

const minusculas = (s: string) => s.toLowerCase();

describe('baseDaAsaas', () => {
    it('só "production" vai para a API real', () => {
        expect(baseDaAsaas('production')).toBe('https://api.asaas.com/v3');
        expect(baseDaAsaas('PRODUCTION')).toBe('https://api.asaas.com/v3');
        expect(baseDaAsaas('sandbox')).toBe('https://api-sandbox.asaas.com/v3');
        expect(baseDaAsaas(undefined)).toBe('https://api-sandbox.asaas.com/v3');
    });
});

describe('linhaDoExtrato', () => {
    it('valor negativo vira DEBIT com valor absoluto; id da Asaas é a chave', () => {
        const l = linhaDoExtrato(
            { id: 'ft_1', value: -5.99, type: 'PAYMENT_FEE', date: '2026-10-15', description: 'Taxa de boleto' },
            'conta', 'org', minusculas,
        );
        expect(l).toMatchObject({
            external_id: 'ft_1', fingerprint: 'asaas:ft_1', direction: 'DEBIT', amount: 5.99,
            transaction_date: '2026-10-15', description_raw: 'Taxa de boleto',
            description_normalized: 'taxa de boleto', transaction_type: 'PAYMENT_FEE', status: 'NORMALIZED',
            bank_account_id: 'conta', organization_id: 'org',
        });
    });

    it('crédito e descrição vazia caem no tipo', () => {
        const l = linhaDoExtrato({ id: 'ft_2', value: 100, type: 'PIX_TRANSACTION_CREDIT', date: '2026-10-15T00:00:00', description: ' ' }, 'c', 'o', minusculas);
        expect(l.direction).toBe('CREDIT');
        expect(l.description_raw).toBe('PIX_TRANSACTION_CREDIT');
        expect(l.transaction_date).toBe('2026-10-15');
    });
});

describe('vinculoDoExtrato', () => {
    it('movimento principal liga ao objeto da Asaas', () => {
        expect(vinculoDoExtrato({ id: 'a', value: 100, type: 'PAYMENT_RECEIVED', date: 'x', paymentId: 'pay_1' }))
            .toEqual({ origem: 'cobranca', asaasId: 'pay_1', taxa: false });
        expect(vinculoDoExtrato({ id: 'b', value: -50, type: 'BILL_PAYMENT', date: 'x', billId: 'bill_1' }))
            .toEqual({ origem: 'boleto', asaasId: 'bill_1', taxa: false });
        expect(vinculoDoExtrato({ id: 'c', value: -50, type: 'TRANSFER', date: 'x', transferId: 'tra_1' }))
            .toEqual({ origem: 'pix', asaasId: 'tra_1', taxa: false });
    });

    it('taxas ligam à linha ASAAS_FEE do mesmo objeto', () => {
        expect(vinculoDoExtrato({ id: 'd', value: -1.99, type: 'PAYMENT_FEE', date: 'x', paymentId: 'pay_1' }))
            .toEqual({ origem: 'cobranca', asaasId: 'pay_1', taxa: true });
        expect(vinculoDoExtrato({ id: 'e', value: -2, type: 'TRANSFER_FEE', date: 'x', transferId: 'tra_1' }))
            .toEqual({ origem: 'pix', asaasId: 'tra_1', taxa: true });
    });

    it('estorno, aporte e transferência sem id ficam para a conciliação normal', () => {
        expect(vinculoDoExtrato({ id: 'f', value: -100, type: 'PAYMENT_REVERSAL', date: 'x', paymentId: 'pay_1' })).toBeNull();
        expect(vinculoDoExtrato({ id: 'g', value: 5000, type: 'PIX_TRANSACTION_CREDIT', date: 'x' })).toBeNull();
        expect(vinculoDoExtrato({ id: 'h', value: -50, type: 'TRANSFER', date: 'x' })).toBeNull();
        expect(vinculoDoExtrato({ id: 'i', value: -50, type: 'TIPO_NOVO_DA_ASAAS', date: 'x', paymentId: 'p' })).toBeNull();
    });
});

describe('janelaDoExtrato', () => {
    it('primeira vez começa no "desde"', () => {
        expect(janelaDoExtrato({ desde: '2026-10-17', hoje: '2026-10-17' })).toEqual({ inicio: '2026-10-17', fim: '2026-10-17' });
    });
    it('depois volta a folga, sem passar do "desde"', () => {
        expect(janelaDoExtrato({ desde: '2026-10-01', sincronizadoAte: '2026-10-20', hoje: '2026-10-21' }))
            .toEqual({ inicio: '2026-10-17', fim: '2026-10-21' });
        expect(janelaDoExtrato({ desde: '2026-10-19', sincronizadoAte: '2026-10-20', hoje: '2026-10-21' }))
            .toEqual({ inicio: '2026-10-19', fim: '2026-10-21' });
    });
    it('vira o mês corretamente', () => {
        expect(janelaDoExtrato({ desde: '2026-01-01', sincronizadoAte: '2026-11-02', hoje: '2026-11-03' }).inicio).toBe('2026-10-30');
    });
});

describe('valoresIguais', () => {
    it('centavo de diferença não liga sozinho', () => {
        expect(valoresIguais(100, '100.00')).toBe(true);
        expect(valoresIguais(100, 100.01)).toBe(false);
        expect(valoresIguais(null, 0)).toBe(false);
    });
});
