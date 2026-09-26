import { describe, it, expect } from 'vitest';
import {
    textoRecibo, detalhesRecibo, nomeArquivoRecibo, numeroRecibo, montarReciboPdf,
} from '../utils/reciboRecebimento';
import type { FinancialReceipt } from '../types/financial';

function recibo(over: Partial<FinancialReceipt> = {}): FinancialReceipt {
    return {
        id: 'r1',
        organization_id: 'org',
        transaction_id: 'tx',
        receipt_number: 123,
        amount: 1234.5,
        payment_date: '2026-09-25',
        payment_type: 'PIX',
        description: 'Parcela 3/12 — Lote 7',
        payer_name: 'Ivana Braga',
        payer_document: '005.871.088-43',
        issuer_name: 'Alpa Construtora',
        issuer_document: '09.264.396/0001-59',
        issuer_address: 'Rua Ângelo Bernardo Faccio, 90 – Centro – Cambuí/MG – CEP 37600-000',
        file_path: null,
        issued_by: null,
        issued_at: '2026-09-26T15:00:00Z',
        cancelled_at: null,
        cancel_reason: null,
        ...over,
    };
}

describe('textoRecibo — corpo do recibo', () => {
    it('traz pagador com documento, valor, valor por extenso e referência', () => {
        const t = textoRecibo(recibo());
        expect(t).toContain('Recebemos de Ivana Braga (CPF 005.871.088-43)');
        expect(t).toMatch(/R\$\s?1\.234,50/);
        expect(t).toContain('mil e duzentos e trinta e quatro reais e cinquenta centavos');
        expect(t).toContain('referente a Parcela 3/12 — Lote 7.');
    });

    it('CNPJ é rotulado como CNPJ', () => {
        expect(textoRecibo(recibo({ payer_document: '12.345.678/0001-90' }))).toContain('(CNPJ 12.345.678/0001-90)');
    });

    it('pagador sem documento não imprime "()"', () => {
        const t = textoRecibo(recibo({ payer_document: null }));
        expect(t).toContain('Recebemos de Ivana Braga a importância de');
        expect(t).not.toContain('()');
    });

    it('sem pagador e sem descrição continua uma frase válida', () => {
        const t = textoRecibo(recibo({ payer_name: null, payer_document: null, description: '  ' }));
        expect(t).toMatch(/^Recebemos a importância de R\$\s?1\.234,50 \(.+\)\.$/);
        expect(t).not.toContain('referente');
    });
});

describe('detalhesRecibo — data e forma', () => {
    it('data em pt-BR sem deslocar o dia por fuso, e forma com rótulo', () => {
        expect(detalhesRecibo(recibo({ payment_type: 'DINHEIRO' }))).toEqual([
            'Data do pagamento: 25/09/2026',
            'Forma de pagamento: Dinheiro',
        ]);
    });

    it('forma não informada some da lista', () => {
        expect(detalhesRecibo(recibo({ payment_type: null }))).toEqual(['Data do pagamento: 25/09/2026']);
    });
});

describe('numeração e nome do arquivo', () => {
    it('número com 6 dígitos', () => {
        expect(numeroRecibo(7)).toBe('000007');
    });

    it('nome do arquivo sem acento nem espaço', () => {
        expect(nomeArquivoRecibo(recibo({ payer_name: 'João da Conceição' }))).toBe('Recibo_000123_Joao_da_Conceicao.pdf');
        expect(nomeArquivoRecibo(recibo({ payer_name: null }))).toBe('Recibo_000123.pdf');
    });
});

describe('montarReciboPdf', () => {
    it('gera um PDF de uma página, com e sem a marca de cancelado', () => {
        const ativo = montarReciboPdf(recibo());
        expect(ativo.getNumberOfPages()).toBe(1);
        const bytesAtivo = ativo.output('arraybuffer').byteLength;
        expect(bytesAtivo).toBeGreaterThan(1000);

        const cancelado = montarReciboPdf(recibo({ cancelled_at: '2026-09-27T12:00:00Z' }));
        const pdf = cancelado.output();
        expect(pdf).toContain('CANCELADO');
        expect(ativo.output()).not.toContain('CANCELADO');
    });

    it('logo inválida não impede o recibo', () => {
        expect(() => montarReciboPdf(recibo(), 'data:image/png;base64,naoebase64')).not.toThrow();
    });
});
