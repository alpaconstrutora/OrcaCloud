import { describe, it, expect } from 'vitest';
import {
    ramoDoEvento,
    soData,
    dataDoMovimento,
    taxaDaCobranca,
    cobrancaAtiva,
    decidirCobranca,
    statusLocalDoDesfazimento,
    decidirSaida,
    eventoDoStatus,
    motivoDaFalha,
} from '../utils/asaasEventos';

const HOJE = '2026-10-17';

describe('ramoDoEvento', () => {
    it('separa cobrança, boleto de terceiro e transferência', () => {
        expect(ramoDoEvento({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } })).toBe('payment');
        expect(ramoDoEvento({ event: 'BILL_PAID', bill: { id: 'bill_1' } })).toBe('bill');
        expect(ramoDoEvento({ event: 'TRANSFER_DONE', transfer: { id: 'tra_1' } })).toBe('transfer');
    });

    it('TRANSFER_* não cai mais no ramo de cobrança (era o 400 "Payload inválido")', () => {
        expect(ramoDoEvento({ event: 'TRANSFER_CREATED', transfer: { id: 'tra_1' } })).toBe('transfer');
    });

    it('evento sem o objeto correspondente é desconhecido, não erro', () => {
        expect(ramoDoEvento({ event: 'ACCOUNT_STATUS_UPDATED' })).toBe('desconhecido');
        expect(ramoDoEvento({ event: 'PAYMENT_RECEIVED' })).toBe('desconhecido');
        expect(ramoDoEvento({ event: 'BILL_PAID', payment: { id: 'x' } })).toBe('desconhecido');
        expect(ramoDoEvento(null)).toBe('desconhecido');
    });
});

describe('datas', () => {
    it('soData corta ISO e rejeita lixo', () => {
        expect(soData('2026-10-15T13:22:01.000Z')).toBe('2026-10-15');
        expect(soData('2026-10-15')).toBe('2026-10-15');
        expect(soData('15/10/2026')).toBeNull();
        expect(soData(null)).toBeNull();
    });

    it('usa a data da Asaas, não a do dia em que o evento chegou', () => {
        expect(dataDoMovimento({ event: 'PAYMENT_RECEIVED', payment: { id: 'p', paymentDate: '2026-09-30' } }, HOJE)).toBe('2026-09-30');
        expect(dataDoMovimento({ event: 'PAYMENT_CONFIRMED', payment: { id: 'p', paymentDate: null, clientPaymentDate: '2026-09-29' } }, HOJE)).toBe('2026-09-29');
        expect(dataDoMovimento({ event: 'BILL_PAID', bill: { id: 'b', paymentDate: '2026-10-01' } }, HOJE)).toBe('2026-10-01');
        expect(dataDoMovimento({ event: 'TRANSFER_DONE', transfer: { id: 't', effectiveDate: '2026-10-02T10:00:00' } }, HOJE)).toBe('2026-10-02');
    });

    it('cai em hoje só quando a Asaas não manda data', () => {
        expect(dataDoMovimento({ event: 'BILL_PAID', bill: { id: 'b' } }, HOJE)).toBe(HOJE);
    });
});

describe('taxaDaCobranca', () => {
    it('bruto − líquido, arredondado a centavos', () => {
        expect(taxaDaCobranca(100, 98.01)).toBe(1.99);
        expect(taxaDaCobranca(0.3 + 0.6, 0.6)).toBe(0.3);
    });
    it('sem líquido ou líquido maior = sem taxa', () => {
        expect(taxaDaCobranca(100, null)).toBe(0);
        expect(taxaDaCobranca(100, 101)).toBe(0);
    });
});

describe('cobrança ao cliente', () => {
    it('cobrancaAtiva ignora encerradas (base da trava de emissão dupla e do byTransaction)', () => {
        expect(cobrancaAtiva('PENDING')).toBe(true);
        expect(cobrancaAtiva('RECEIVED')).toBe(true);
        expect(cobrancaAtiva('OVERDUE')).toBe(true);
        expect(cobrancaAtiva('CANCELLED')).toBe(false);
        expect(cobrancaAtiva('DELETED')).toBe(false);
        expect(cobrancaAtiva('REFUNDED')).toBe(false);
    });

    it('pagamento: baixa uma vez só', () => {
        expect(decidirCobranca('PAYMENT_RECEIVED', 'PENDING')).toBe('baixar');
        expect(decidirCobranca('PAYMENT_CONFIRMED', 'OVERDUE')).toBe('baixar');
        expect(decidirCobranca('PAYMENT_RECEIVED', 'CONFIRMED')).toBe('ignorar');
    });

    it('estorno de cobrança PAGA reverte o recebível (antes só mudava o status da cobrança)', () => {
        expect(decidirCobranca('PAYMENT_REFUNDED', 'RECEIVED')).toBe('estornar');
        expect(decidirCobranca('PAYMENT_CHARGEBACK_REQUESTED', 'CONFIRMED')).toBe('estornar');
    });

    it('remoção antes de pagar só cancela; repetida é ignorada', () => {
        expect(decidirCobranca('PAYMENT_DELETED', 'PENDING')).toBe('cancelar');
        expect(decidirCobranca('PAYMENT_DELETED', 'DELETED')).toBe('ignorar');
        expect(decidirCobranca('PAYMENT_REFUNDED', 'REFUNDED')).toBe('ignorar');
    });

    it('demais eventos só refletem o status', () => {
        expect(decidirCobranca('PAYMENT_OVERDUE', 'PENDING')).toBe('refletir');
        expect(decidirCobranca('PAYMENT_CREATED', null)).toBe('refletir');
    });

    it('cobrança removida não fica "PENDING" (o payload mantém o status antigo)', () => {
        expect(statusLocalDoDesfazimento('PAYMENT_DELETED', 'PENDING')).toBe('DELETED');
        expect(statusLocalDoDesfazimento('PAYMENT_REFUNDED', 'RECEIVED')).toBe('REFUNDED');
        expect(statusLocalDoDesfazimento('PAYMENT_CHARGEBACK_REQUESTED', 'CHARGEBACK_REQUESTED')).toBe('CHARGEBACK_REQUESTED');
    });
});

describe('saída (boleto de terceiro e PIX)', () => {
    it('BILL_PAID conclui uma vez só', () => {
        expect(decidirSaida('bill', 'BILL_PAID', 'PENDING')).toBe('concluir');
        expect(decidirSaida('bill', 'BILL_PAID', 'DONE')).toBe('ignorar');
    });

    it('BILL_REFUNDED depois de DONE estorna (antes era descartado como already_processed)', () => {
        expect(decidirSaida('bill', 'BILL_REFUNDED', 'DONE')).toBe('estornar');
        expect(decidirSaida('bill', 'BILL_REFUNDED', 'PENDING')).toBe('falhar');
        expect(decidirSaida('bill', 'BILL_REFUNDED', 'FAILED')).toBe('ignorar');
    });

    it('falha e cancelamento antes de pagar', () => {
        expect(decidirSaida('bill', 'BILL_FAILED', 'PENDING')).toBe('falhar');
        expect(decidirSaida('bill', 'BILL_CANCELLED', 'SCHEDULED')).toBe('cancelar');
        expect(decidirSaida('bill', 'BILL_CANCELLED', 'CANCELLED')).toBe('ignorar');
    });

    it('estados intermediários só acompanham', () => {
        expect(decidirSaida('bill', 'BILL_BANK_PROCESSING', 'PENDING')).toBe('acompanhar');
        expect(decidirSaida('transfer', 'TRANSFER_IN_BANK_PROCESSING', 'PENDING')).toBe('acompanhar');
        expect(decidirSaida('transfer', 'TRANSFER_PENDING', 'DONE')).toBe('ignorar');
    });

    it('PIX: DONE conclui; FAILED/BLOCKED falham; falha depois de DONE estorna', () => {
        expect(decidirSaida('transfer', 'TRANSFER_DONE', 'PENDING')).toBe('concluir');
        expect(decidirSaida('transfer', 'TRANSFER_FAILED', 'PENDING')).toBe('falhar');
        expect(decidirSaida('transfer', 'TRANSFER_BLOCKED', 'APPROVED')).toBe('falhar');
        expect(decidirSaida('transfer', 'TRANSFER_CANCELLED', 'SCHEDULED')).toBe('cancelar');
        expect(decidirSaida('transfer', 'TRANSFER_FAILED', 'DONE')).toBe('estornar');
    });
});

describe('eventoDoStatus (polling reaproveita o processamento do webhook)', () => {
    it('cobrança', () => {
        expect(eventoDoStatus('payment', 'RECEIVED')).toBe('PAYMENT_RECEIVED');
        expect(eventoDoStatus('payment', 'confirmed')).toBe('PAYMENT_CONFIRMED');
        expect(eventoDoStatus('payment', 'PENDING', true)).toBe('PAYMENT_DELETED');
        expect(eventoDoStatus('payment', 'PENDING')).toBeNull();
    });
    it('boleto e PIX', () => {
        expect(eventoDoStatus('bill', 'PAID')).toBe('BILL_PAID');
        expect(eventoDoStatus('bill', 'BANK_PROCESSING')).toBeNull();
        expect(eventoDoStatus('transfer', 'DONE')).toBe('TRANSFER_DONE');
        expect(eventoDoStatus('transfer', 'BLOCKED')).toBe('TRANSFER_BLOCKED');
        expect(eventoDoStatus('transfer', 'PENDING')).toBeNull();
    });
});

describe('motivoDaFalha', () => {
    it('lê failReason, failReasons em lista ou cai no evento', () => {
        expect(motivoDaFalha('TRANSFER_FAILED', { transfer: { id: 't', failReason: 'Chave PIX inexistente' } })).toBe('Chave PIX inexistente');
        expect(motivoDaFalha('BILL_FAILED', { bill: { id: 'b', failReasons: [{ description: 'Boleto vencido' }, 'Sem saldo'] } })).toBe('Boleto vencido; Sem saldo');
        expect(motivoDaFalha('BILL_FAILED', { bill: { id: 'b' } })).toBe('BILL_FAILED');
    });
});
