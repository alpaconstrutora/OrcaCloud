import { describe, it, expect } from 'vitest';
import {
    textoRecibo, detalhesRecibo, nomeArquivoRecibo, numeroRecibo, montarReciboPdf, caberNaCaixa, verboDoCredor,
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
        contract_number: null,
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

    it('contrato entra em primeiro, quando o título tem contrato', () => {
        expect(detalhesRecibo(recibo({ contract_number: 'CTV-007-007-0001' }))).toEqual([
            'Contrato: CTV-007-007-0001',
            'Data do pagamento: 25/09/2026',
            'Forma de pagamento: PIX',
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

describe('caberNaCaixa — logo sem esticar', () => {
    it('logo quadrada numa caixa 30×15 fica 15×15', () => {
        expect(caberNaCaixa(400, 400, 30, 15)).toEqual({ w: 15, h: 15 });
    });
    it('logo larga é limitada pela largura, mantendo a proporção', () => {
        const r = caberNaCaixa(900, 100, 30, 15);
        expect(r.w).toBe(30);
        expect(r.h).toBeCloseTo(30 / 9);
    });
    it('dimensão inválida cai na caixa inteira (não divide por zero)', () => {
        expect(caberNaCaixa(0, 0, 30, 15)).toEqual({ w: 30, h: 15 });
    });
});

/**
 * Recibo de PAGAMENTO (Contas a Pagar) — o credor assina declarando que recebeu
 * da organização. Plano docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md.
 */
function reciboPagamento(over: Partial<FinancialReceipt> = {}): FinancialReceipt {
    return recibo({
        kind: 'PAGAMENTO',
        receipt_number: 1,
        payer_name: null,
        payer_document: null,
        payee_name: 'R N Tintas e Ferramentas Ltda',
        payee_document: '25.271.628/0008-29',
        description: 'Pedido de compra 42 — tintas',
        ...over,
    });
}

describe('recibo de PAGAMENTO — o credor declara que recebeu da organização', () => {
    it('credor PJ: "Recebemos de <organização> (CNPJ …)", sem citar o credor no corpo', () => {
        const t = textoRecibo(reciboPagamento());
        expect(t).toContain('Recebemos de Alpa Construtora (CNPJ 09.264.396/0001-59) a importância de');
        expect(t).toContain('referente a Pedido de compra 42 — tintas.');
        expect(t).not.toContain('R N Tintas');
    });

    it('credor PF: "Recebi"; sem documento: "Recebi(emos)"', () => {
        expect(textoRecibo(reciboPagamento({ payee_document: '005.871.088-43' }))).toMatch(/^Recebi de Alpa/);
        expect(textoRecibo(reciboPagamento({ payee_document: null }))).toMatch(/^Recebi\(emos\) de Alpa/);
        expect(verboDoCredor('12.345.678/0001-90')).toBe('Recebemos');
    });

    it('sem kind (registro anterior à migration) continua sendo recebimento', () => {
        const t = textoRecibo(recibo({ kind: undefined }));
        expect(t).toContain('Recebemos de Ivana Braga');
    });

    it('arquivo leva "Pagamento" e o nome do CREDOR', () => {
        expect(nomeArquivoRecibo(reciboPagamento())).toBe('Recibo_Pagamento_000001_R_N_Tintas_e_Ferramentas_Ltda.pdf');
        expect(nomeArquivoRecibo(recibo())).toBe('Recibo_000123_Ivana_Braga.pdf');
    });

    it('PDF de uma página, com e sem cancelado', () => {
        expect(montarReciboPdf(reciboPagamento()).getNumberOfPages()).toBe(1);
        expect(montarReciboPdf(reciboPagamento({ cancelled_at: '2026-09-28T12:00:00Z' })).getNumberOfPages()).toBe(1);
    });
});
