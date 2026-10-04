import { describe, it, expect } from 'vitest';
import {
    textoRecibo, nomeArquivoRecibo, numeroRecibo, montarReciboPdf, caberNaCaixa, verboDoCredor,
    formatarTelefoneBR, semProtocolo, linhasContatoEmitente, rotulosRecibo, destinatarioDoRecibo,
    assinanteDoRecibo, linhaTabelaRecibo, limitarLinhas, tamanhoQueCabe, arranjoDeclaracao, rodapeRecibo, dataBR, idDoArquivoPdf,
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

/** PNG 1×1 válida (branca), para a logo entrar de verdade no PDF. */
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

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

describe('linhaTabelaRecibo — a única linha da tabela', () => {
    it('data em pt-BR sem deslocar o dia por fuso, forma com rótulo e valor em BRL', () => {
        const l = linhaTabelaRecibo(recibo({ payment_type: 'DINHEIRO' }));
        expect(l.descricao).toBe('Parcela 3/12 — Lote 7');
        expect(l.contrato).toBeNull();
        expect(l.data).toBe('25/09/2026');
        expect(l.forma).toBe('Dinheiro');
        expect(l.valor).toMatch(/R\$\s?1\.234,50/);
    });

    it('contrato vira "Contrato: X"; forma e descrição vazias viram travessão', () => {
        const l = linhaTabelaRecibo(recibo({ contract_number: 'CTV-007-007-0001', payment_type: null, description: ' ' }));
        expect(l.contrato).toBe('Contrato: CTV-007-007-0001');
        expect(l.forma).toBe('—');
        expect(l.descricao).toBe('—');
    });

    it('dataBR não usa Date (dia não recua em Brasília)', () => {
        expect(dataBR('2026-09-25')).toBe('25/09/2026');
        expect(dataBR('2026-09-25T00:00:00Z')).toBe('25/09/2026');
    });
});

describe('contato do emitente — lido da organização, não congelado', () => {
    it('formatarTelefoneBR: celular, fixo, com +55, já mascarado, vazio e irregular', () => {
        expect(formatarTelefoneBR('35999055003')).toBe('(35) 99905-5003');
        expect(formatarTelefoneBR('3532123456')).toBe('(35) 3212-3456');
        expect(formatarTelefoneBR('+55 35 99905-5003')).toBe('(35) 99905-5003');
        expect(formatarTelefoneBR('5535999055003')).toBe('(35) 99905-5003');
        expect(formatarTelefoneBR('(35) 99905-5003')).toBe('(35) 99905-5003');
        expect(formatarTelefoneBR('')).toBeNull();
        expect(formatarTelefoneBR(null)).toBeNull();
        expect(formatarTelefoneBR('ramal 123')).toBe('ramal 123');
    });

    it('semProtocolo tira esquema e barra final', () => {
        expect(semProtocolo('https://www.alpaconstrutora.com.br/')).toBe('www.alpaconstrutora.com.br');
        expect(semProtocolo('www.alpaconstrutora.com.br')).toBe('www.alpaconstrutora.com.br');
        expect(semProtocolo('  ')).toBeNull();
        expect(semProtocolo(undefined)).toBeNull();
    });

    it('linhasContatoEmitente: telefone → e-mail → site, sem os vazios', () => {
        expect(linhasContatoEmitente({ phone: '35999055003', email: ' a@b.com ', website: 'https://x.com' }))
            .toEqual(['(35) 99905-5003', 'a@b.com', 'x.com']);
        expect(linhasContatoEmitente({ phone: null, email: '', website: 'x.com' })).toEqual(['x.com']);
        expect(linhasContatoEmitente(null)).toEqual([]);
        expect(linhasContatoEmitente(undefined)).toEqual([]);
    });
});

describe('papéis por tipo de recibo', () => {
    it('rotulosRecibo: recebimento, pagamento e kind ausente (= recebimento)', () => {
        expect(rotulosRecibo('RECEBIMENTO')).toEqual({ destinatario: 'Recebemos de:', valor: 'VALOR RECEBIDO', papelAssinante: 'Emitente' });
        expect(rotulosRecibo('PAGAMENTO')).toEqual({ destinatario: 'Pago a:', valor: 'VALOR PAGO', papelAssinante: 'Credor' });
        expect(rotulosRecibo(undefined)).toEqual(rotulosRecibo('RECEBIMENTO'));
    });

    it('destinatarioDoRecibo: pagador no recebimento, credor no pagamento, documento rotulado', () => {
        expect(destinatarioDoRecibo(recibo())).toEqual({ nome: 'Ivana Braga', documento: 'CPF 005.871.088-43' });
        expect(destinatarioDoRecibo(reciboPagamento())).toEqual({ nome: 'R N Tintas e Ferramentas Ltda', documento: 'CNPJ 25.271.628/0008-29' });
        expect(destinatarioDoRecibo(recibo({ payer_name: null, payer_document: null }))).toEqual({ nome: '—', documento: null });
    });

    it('assinanteDoRecibo: a organização assina o recebimento, o credor assina o pagamento', () => {
        expect(assinanteDoRecibo(recibo())).toEqual({ nome: 'Alpa Construtora', documento: 'CNPJ 09.264.396/0001-59', papel: 'Emitente' });
        expect(assinanteDoRecibo(reciboPagamento())).toEqual({ nome: 'R N Tintas e Ferramentas Ltda', documento: 'CNPJ 25.271.628/0008-29', papel: 'Credor' });
        expect(assinanteDoRecibo(reciboPagamento({ payee_name: null, payee_document: null }))).toEqual({ nome: 'Credor', documento: null, papel: 'Credor' });
    });
});

describe('ajustes de caixa', () => {
    it('limitarLinhas corta e põe reticências na última', () => {
        expect(limitarLinhas(['a', 'b', 'c', 'd'], 3)).toEqual(['a', 'b', 'c…']);
        expect(limitarLinhas(['a', 'b,'], 2)).toEqual(['a', 'b,']);
        expect(limitarLinhas(['fim da linha, ', 'x'], 1)).toEqual(['fim da linha…']);
    });

    it('tamanhoQueCabe desce de 0,5 em 0,5 até caber, sem passar do mínimo', () => {
        const medir = (pt: number) => pt * 10;           // 10 mm por pt
        expect(tamanhoQueCabe(medir, 100, 13, 8)).toBe(10);
        expect(tamanhoQueCabe(medir, 1000, 13, 8)).toBe(13);
        expect(tamanhoQueCabe(medir, 10, 13, 8)).toBe(8);
    });

    it('arranjoDeclaracao: até 9 linhas ao lado da barra TOTAL, depois abaixo', () => {
        expect(arranjoDeclaracao(9)).toBe('lado');
        expect(arranjoDeclaracao(10)).toBe('abaixo');
    });

    it('idDoArquivoPdf: 32 hex do UUID do recibo; id curto é completado com zeros', () => {
        expect(idDoArquivoPdf('286048b5-a84d-420d-8d45-b3726a952066')).toBe('286048B5A84D420D8D45B3726A952066');
        expect(idDoArquivoPdf('r1')).toBe('10000000000000000000000000000000');
    });

    it('rodapeRecibo traz número e data de emissão em Brasília', () => {
        expect(rodapeRecibo(recibo())).toEqual([
            'Recibo Nº 000123 · emitido em 26/09/2026',
            'Gerado eletronicamente via Opura Suite',
        ]);
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

// Só substrings ASCII: parênteses saem escapados no stream e acentos em WinAnsi.
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

    it('recebimento: VALOR RECEBIDO, barra TOTAL, rodape; sem "Local e data"', () => {
        const pdf = montarReciboPdf(recibo(), { contato: { phone: '35999055003', email: 'x@y.com', website: 'https://z.com/' } }).output();
        expect(pdf).toContain('VALOR RECEBIDO');
        expect(pdf).toContain('TOTAL');
        expect(pdf).toContain('Opura Suite');
        expect(pdf).toContain('99905-5003');
        expect(pdf).toContain('x@y.com');
        expect(pdf).toContain('z.com');
        expect(pdf).not.toContain('Local e data');
        expect(pdf).not.toContain('(undefined)');
        expect(pdf).not.toContain('(null)');
    });

    it('logo inválida não impede o recibo; logo válida entra (mais bytes, ainda 1 página)', () => {
        expect(() => montarReciboPdf(recibo(), { logoDataUrl: 'data:image/png;base64,naoebase64' })).not.toThrow();
        const semLogo = montarReciboPdf(recibo()).output('arraybuffer').byteLength;
        const comLogo = montarReciboPdf(recibo(), { logoDataUrl: PNG_1x1 });
        expect(comLogo.getNumberOfPages()).toBe(1);
        expect(comLogo.output('arraybuffer').byteLength).toBeGreaterThan(semLogo);
    });

    it('descrição e endereço longos continuam numa página (600 e 1500 caracteres)', () => {
        const longa = (n: number) => Array.from({ length: n }, (_, i) => `palavra${i}`).join(' ').slice(0, n);
        for (const n of [600, 1500]) {
            const pdf = montarReciboPdf(recibo({
                description: longa(n),
                issuer_address: longa(200),
                contract_number: 'CTL-010-0002',
            }), { contato: { phone: '35999055003', email: 'financeiro@alpaconstrutora.com.br', website: 'www.alpaconstrutora.com.br' } });
            expect(pdf.getNumberOfPages()).toBe(1);
        }
    });

    it('sem logo, contato, endereço, documento nem contrato não lança e não imprime null', () => {
        const pdf = montarReciboPdf(recibo({
            issuer_address: null, issuer_document: null, payer_document: null, contract_number: null, payment_type: null,
        }));
        expect(pdf.getNumberOfPages()).toBe(1);
        expect(pdf.output()).not.toContain('(null)');
    });

    it('o mesmo registro gera os mesmos bytes (CreationDate = issued_at)', () => {
        const a = montarReciboPdf(recibo(), { logoDataUrl: PNG_1x1 }).output();
        const b = montarReciboPdf(recibo(), { logoDataUrl: PNG_1x1 }).output();
        expect(a).toBe(b);
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

    it('PDF de uma página, com VALOR PAGO e "Local e data" para o credor assinar', () => {
        const pdf = montarReciboPdf(reciboPagamento());
        expect(pdf.getNumberOfPages()).toBe(1);
        expect(pdf.output()).toContain('VALOR PAGO');
        expect(pdf.output()).toContain('Local e data');
        expect(pdf.output()).toContain('Pago a:');
        expect(montarReciboPdf(reciboPagamento({ cancelled_at: '2026-09-28T12:00:00Z' })).getNumberOfPages()).toBe(1);
    });
});
