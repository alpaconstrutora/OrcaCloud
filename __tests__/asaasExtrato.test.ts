import { describe, it, expect } from 'vitest';
import {
    baseDaAsaas, linhaDoExtrato, vinculoDoExtrato, janelaDoExtrato, valoresIguais,
    saldoDoItem, rotuloDoTipoAsaas, ehTaxaAsaas, resumoAReceber, partirPeriodo, ordenarPeloSaldo,
} from '../utils/asaasExtrato';

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

describe('saldo após o movimento', () => {
    it('linhaDoExtrato guarda o balance da Asaas com 2 casas', () => {
        expect(linhaDoExtrato({ id: 'x', value: 10, balance: 2138.349999, date: '2026-11-09' }, 'c', 'o', minusculas).saldo_apos).toBe(2138.35);
        expect(linhaDoExtrato({ id: 'y', value: 10, balance: 0, date: '2026-11-09' }, 'c', 'o', minusculas).saldo_apos).toBe(0);
    });
    it('sem balance fica nulo (nunca zero inventado)', () => {
        expect(saldoDoItem({})).toBeNull();
        expect(saldoDoItem({ balance: null })).toBeNull();
    });
});

describe('rotuloDoTipoAsaas', () => {
    it('traduz os tipos conhecidos', () => {
        expect(rotuloDoTipoAsaas('PAYMENT_RECEIVED')).toBe('Cobrança recebida');
        expect(rotuloDoTipoAsaas('TRANSFER')).toBe('Transferência enviada');
        expect(rotuloDoTipoAsaas('BILL_PAYMENT_FEE')).toBe('Taxa do pagamento de conta');
    });
    it('tipo novo da Asaas volta com o próprio código; vazio vira "Movimento"', () => {
        expect(rotuloDoTipoAsaas('TIPO_NOVO_DA_ASAAS')).toBe('TIPO_NOVO_DA_ASAAS');
        expect(rotuloDoTipoAsaas(null)).toBe('Movimento');
    });
    it('taxa é o _FEE, não a devolução da taxa', () => {
        expect(ehTaxaAsaas('PAYMENT_FEE')).toBe(true);
        expect(ehTaxaAsaas('PAYMENT_FEE_REVERSAL')).toBe(false);
        expect(ehTaxaAsaas('BILL_PAYMENT_FEE_CANCELLED')).toBe(false);
        expect(ehTaxaAsaas('PAYMENT_RECEIVED')).toBe(false);
    });
});

describe('resumoAReceber', () => {
    it('aguardando crédito pelo líquido; em aberto = pendentes + vencidas pelo bruto', () => {
        const r = resumoAReceber({
            confirmadas: { quantity: 2, value: 300, netValue: 290.02 },
            pendentes: { quantity: 3, value: 1000.1, netValue: 994 },
            vencidas: { quantity: 1, value: 250.2, netValue: 248.21 },
        });
        expect(r.aguardandoCredito).toEqual({ quantidade: 2, valor: 290.02 });
        expect(r.emAberto).toEqual({ quantidade: 4, valor: 1250.3 });
        expect(r.vencidas).toEqual({ quantidade: 1, valor: 250.2 });
    });
    it('estatística que falhou conta como zero', () => {
        expect(resumoAReceber({}).emAberto).toEqual({ quantidade: 0, valor: 0 });
    });
});

describe('partirPeriodo', () => {
    it('todo depois do "desde" → só gravado', () => {
        expect(partirPeriodo({ inicio: '2026-11-01', fim: '2026-11-30', desde: '2026-10-17' }))
            .toEqual({ historico: null, gravado: { inicio: '2026-11-01', fim: '2026-11-30' } });
    });
    it('todo antes → só histórico', () => {
        expect(partirPeriodo({ inicio: '2026-06-01', fim: '2026-06-30', desde: '2026-10-17' }))
            .toEqual({ historico: { inicio: '2026-06-01', fim: '2026-06-30' }, gravado: null });
    });
    it('atravessa o "desde" → histórico até a véspera, gravado a partir dele', () => {
        expect(partirPeriodo({ inicio: '2026-10-01', fim: '2026-10-31', desde: '2026-10-17' }))
            .toEqual({ historico: { inicio: '2026-10-01', fim: '2026-10-16' }, gravado: { inicio: '2026-10-17', fim: '2026-10-31' } });
        expect(partirPeriodo({ inicio: '2026-02-01', fim: '2026-03-31', desde: '2026-03-01' }).historico?.fim).toBe('2026-02-28');
    });
    it('período inválido não consulta nada', () => {
        expect(partirPeriodo({ inicio: '2026-11-30', fim: '2026-11-01', desde: '2026-10-17' })).toEqual({ historico: null, gravado: null });
        expect(partirPeriodo({ inicio: '', fim: '2026-11-01', desde: '2026-10-17' })).toEqual({ historico: null, gravado: null });
    });
});

describe('ordenarPeloSaldo', () => {
    const l = (id: string, dia: string, amount: number, direction: 'CREDIT' | 'DEBIT', saldo_apos: number | null) =>
        ({ id, transaction_date: dia, amount, direction, saldo_apos });

    it('no mesmo dia, a ordem sai do encadeamento do saldo', () => {
        // saldo 100 → +100 (cobrança) = 200 → −1,99 (taxa) = 198,01 → −50 (PIX) = 148,01
        const embaralhado = [
            l('pix', '2026-11-09', 50, 'DEBIT', 148.01),
            l('cob', '2026-11-09', 100, 'CREDIT', 200),
            l('taxa', '2026-11-09', 1.99, 'DEBIT', 198.01),
            l('ontem', '2026-11-08', 100, 'CREDIT', 100),
        ];
        expect(ordenarPeloSaldo(embaralhado).map(x => x.id)).toEqual(['ontem', 'cob', 'taxa', 'pix']);
    });
    it('sem saldo mantém a ordem recebida dentro do dia', () => {
        const linhas = [l('a', '2026-11-09', 1, 'DEBIT', null), l('b', '2026-11-09', 2, 'CREDIT', 10)];
        expect(ordenarPeloSaldo(linhas).map(x => x.id)).toEqual(['a', 'b']);
    });
    it('saldo que vai e volta no dia: a abertura (fechamento da véspera) decide — caso real de 22/10/2026', () => {
        const linhas = [
            l('pixB', '2026-10-22', 200, 'DEBIT', 138.35),
            l('devolucao', '2026-10-22', 200, 'CREDIT', 338.35),
            l('pixA', '2026-10-22', 200, 'DEBIT', 138.35),
            l('boleto', '2026-10-19', 61.65, 'DEBIT', 338.35),
            l('cobranca', '2026-10-29', 2000, 'CREDIT', 2138.35),
        ];
        const ordem = ordenarPeloSaldo(linhas);
        expect(ordem.map(x => x.saldo_apos)).toEqual([338.35, 138.35, 338.35, 138.35, 2138.35]);
        expect(ordem[2].id).toBe('devolucao');
    });
    it('encadeamento ambíguo não inventa ordem', () => {
        const linhas = [l('a', '2026-11-09', 10, 'CREDIT', 110), l('b', '2026-11-09', 10, 'CREDIT', 110)];
        expect(ordenarPeloSaldo(linhas).map(x => x.id)).toEqual(['a', 'b']);
    });
});
