import { describe, it, expect } from 'vitest';
import {
    textoRecibo, nomeArquivoRecibo, numeroRecibo, montarReciboPdf, caberNaCaixa, verboDoCredor,
    formatarTelefoneBR, semProtocolo, linhasContatoEmitente, rotulosRecibo, destinatarioDoRecibo,
    assinanteDoRecibo, linhaTabelaRecibo, linhasItensContrato, limitarLinhas, tamanhoQueCabe, rodapeRecibo, dataBR, idDoArquivoPdf,
    descricaoDoRecibo, avisoValorDoContrato, cidadeDoEndereco, localEDataDoRecibo, mascararDocumento,
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
        expect(t).toContain('referente a Parcela 3/12 — Lote 7, dando plena quitação deste valor.');
    });

    it('CNPJ é rotulado como CNPJ', () => {
        expect(textoRecibo(recibo({ payer_document: '12.345.678/0001-90' }))).toContain('(CNPJ 12.345.678/0001-90)');
    });

    it('documento gravado só com dígitos ganha máscara (texto, destinatário e assinante)', () => {
        expect(mascararDocumento('05559094000180')).toBe('05.559.094/0001-80');
        expect(mascararDocumento('32195297808')).toBe('321.952.978-08');
        expect(mascararDocumento('12.345.678/0001-90')).toBe('12.345.678/0001-90');
        expect(mascararDocumento('123')).toBe('123');
        expect(textoRecibo(recibo({ payer_document: '05559094000180' }))).toContain('(CNPJ 05.559.094/0001-80)');
        expect(destinatarioDoRecibo(recibo({ payer_document: '05559094000180' })).documento).toBe('CNPJ 05.559.094/0001-80');
        expect(textoRecibo(recibo({ kind: 'PAGAMENTO', issuer_document: '09264396000159', payee_document: '32195297808' })))
            .toContain('(CNPJ 09.264.396/0001-59)');
    });

    it('pagador sem documento não imprime "()"', () => {
        const t = textoRecibo(recibo({ payer_document: null }));
        expect(t).toContain('Recebemos de Ivana Braga a importância de');
        expect(t).not.toContain('()');
    });

    it('sem pagador e sem descrição continua uma frase válida', () => {
        const t = textoRecibo(recibo({ payer_name: null, payer_document: null, description: '  ' }));
        expect(t).toMatch(/^Recebemos a importância de R\$\s?1\.234,50 \(.+\), dando plena quitação deste valor\.$/);
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

    it('contrato vira "Contrato: X"; descrição vazia vira travessão; sem forma, forma = null (coluna some)', () => {
        const l = linhaTabelaRecibo(recibo({ contract_number: 'CTV-007-007-0001', payment_type: null, description: ' ' }));
        expect(l.contrato).toBe('Contrato: CTV-007-007-0001');
        expect(l.forma).toBeNull();
        expect(l.descricao).toBe('—');
    });

    it('nº do contrato já presente na descrição não vira nota repetida', () => {
        const l = linhaTabelaRecibo(recibo({ contract_number: 'CTL-010-0002', description: 'Aluguel CTL-010-0002 — parcela 8/60' }));
        expect(l.contrato).toBeNull();
        expect(l.descricao).toBe('Aluguel CTL-010-0002 — parcela 8/60');
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
        expect(rotulosRecibo('RECEBIMENTO')).toEqual({ destinatario: 'Recebemos de:', valor: 'VALOR RECEBIDO', papelAssinante: 'Emitente', subtitulo: 'DE RECEBIMENTO', nome: 'Recibo de recebimento' });
        expect(rotulosRecibo('PAGAMENTO')).toEqual({ destinatario: 'Pago a:', valor: 'VALOR PAGO', papelAssinante: 'Credor', subtitulo: 'DE PAGAMENTO', nome: 'Recibo de pagamento' });
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

    it('idDoArquivoPdf: 32 hex do UUID do recibo; id curto é completado com zeros', () => {
        expect(idDoArquivoPdf('286048b5-a84d-420d-8d45-b3726a952066')).toBe('286048B5A84D420D8D45B3726A952066');
        expect(idDoArquivoPdf('r1')).toBe('10000000000000000000000000000000');
    });

    it('rodapeRecibo traz o TIPO, o número e a data de emissão em Brasília', () => {
        expect(rodapeRecibo(recibo())).toEqual([
            'Recibo de recebimento Nº 000123 · emitido em 26/09/2026',
            'Gerado eletronicamente via Opura Suite',
        ]);
        expect(rodapeRecibo(recibo({ kind: 'PAGAMENTO', receipt_number: 1 }))[0])
            .toBe('Recibo de pagamento Nº 000001 · emitido em 26/09/2026');
    });

    it('cidadeDoEndereco: a última "Cidade/UF" do endereço; hífen só dentro do nome', () => {
        expect(cidadeDoEndereco('Rua Ângelo Bernardo Faccio, 90 – Centro – Cambuí/MG – CEP 37600-000')).toBe('Cambuí/MG');
        expect(cidadeDoEndereco('Av. Brasil, 10 - Centro - São João del-Rei/MG')).toBe('São João del-Rei/MG');
        expect(cidadeDoEndereco('Rua A, 1 - Pouso Alegre / MG')).toBe('Pouso Alegre/MG');
        expect(cidadeDoEndereco('Rua A, 1 - Centro')).toBeNull();
        expect(cidadeDoEndereco(null)).toBeNull();
    });

    it('localEDataDoRecibo: cidade do emitente + data de emissão por extenso; sem cidade, linha em branco', () => {
        expect(localEDataDoRecibo(recibo())).toBe('Cambuí/MG, 26 de setembro de 2026');
        expect(localEDataDoRecibo(recibo({ issuer_address: null }))).toBe('____________________, 26 de setembro de 2026');
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

    it('recebimento: VALOR RECEBIDO, DE RECEBIMENTO, Emissão, barra TOTAL, rodapé e local/data preenchidos', () => {
        const pdf = montarReciboPdf(recibo(), { contato: { phone: '35999055003', email: 'x@y.com', website: 'https://z.com/' } }).output();
        expect(pdf).toContain('VALOR RECEBIDO');
        expect(pdf).toContain('(DE RECEBIMENTO)');
        expect(pdf).toContain('(Emiss');
        expect(pdf).not.toContain('(Data)');
        expect(pdf).toContain('26 de setembro de 2026');
        expect(pdf).toContain('TOTAL');
        expect(pdf).toContain('Opura Suite');
        expect(pdf).toContain('99905-5003');
        expect(pdf).toContain('x@y.com');
        expect(pdf).toContain('z.com');
        expect(pdf).not.toContain('Local e data');
        expect(pdf).toContain('(FORMA)');
        expect(pdf).not.toContain('(undefined)');
        expect(pdf).not.toContain('(null)');
    });

    it('contato do emitente sai UMA vez, no rodapé — nunca embaixo do credor/pagador', () => {
        for (const kind of ['RECEBIMENTO', 'PAGAMENTO'] as const) {
            const pdf = montarReciboPdf(recibo({ kind, issuer_address: 'Rua Ângelo Bernardo Faccio, 90' }),
                { contato: { phone: '35999055003', email: 'x@y.com' } }).output();
            expect(pdf.split('99905-5003').length - 1).toBe(1);
            expect(pdf.split('x@y.com').length - 1).toBe(1);
        }
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

    it('sem forma de pagamento a coluna FORMA não é desenhada (nada de "—" solto)', () => {
        const pdf = montarReciboPdf(recibo({ payment_type: null })).output();
        expect(pdf).not.toContain('(FORMA)');
    });

    it('DECLARAÇÃO fica ABAIXO da barra TOTAL, nunca na mesma linha (pedido de 18/10/2026)', () => {
        for (const r of [recibo(), reciboDeContrato(), reciboDeContrato({ contract_items: null })]) {
            const pdf = montarReciboPdf(r).output();
            const total = yDoTexto(pdf, 'TOTAL');
            const declaracao = yDoTexto(pdf, 'DECLARA');
            // y do PDF cresce para cima: "abaixo" = y menor, com folga de mais de 2 linhas.
            expect(total - declaracao).toBeGreaterThan(20);
        }
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
        expect(t).toContain('referente a Pedido de compra 42 — tintas, dando plena quitação deste valor.');
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

    it('PDF de uma página, com VALOR PAGO, DE PAGAMENTO e local/data já preenchidos para o credor assinar', () => {
        const pdf = montarReciboPdf(reciboPagamento());
        expect(pdf.getNumberOfPages()).toBe(1);
        expect(pdf.output()).toContain('VALOR PAGO');
        expect(pdf.output()).toContain('(DE PAGAMENTO)');
        expect(pdf.output()).toContain('26 de setembro de 2026');
        expect(pdf.output()).not.toContain('Local e data: ____');
        expect(pdf.output()).toContain('Pago a:');
        expect(montarReciboPdf(reciboPagamento({ cancelled_at: '2026-09-28T12:00:00Z' })).getNumberOfPages()).toBe(1);
    });
});

/**
 * Recibo de CONTRATO — objeto e itens congelados (17/10/2026).
 * Plano docs/planos/2026-10-17-recibo-contrato-objeto-itens.md.
 */
const ITENS_FAXINA = [
    { description: 'Faxina', unit: 'svç', quantity: 4, unit_price: 150, total_price: 600 },
];

function reciboDeContrato(over: Partial<FinancialReceipt> = {}): FinancialReceipt {
    return reciboPagamento({
        payee_name: 'Débora Cristina Duarte',
        payee_document: '321.952.978-08',
        description: 'Fatura Contrato CTS-010-036-0001 (1) - agosto de 2021',
        amount: 600,
        contract_number: 'CTS-010-036-0001',
        contract_title: 'Serviço de Faxina',
        contract_items: ITENS_FAXINA,
        ...over,
    });
}

describe('recibo de CONTRATO — objeto e itens', () => {
    it('linha da tabela: "Parcela N — competência", "Contrato: X" e "Objeto: Y"; sem título, objeto nulo', () => {
        const l = linhaTabelaRecibo(reciboDeContrato());
        expect(l.descricao).toBe('Parcela 1 — agosto de 2021');
        expect(l.contrato).toBe('Contrato: CTS-010-036-0001');
        expect(l.objeto).toBe('Objeto: Serviço de Faxina');
        expect(linhaTabelaRecibo(recibo()).objeto).toBeNull();
        expect(linhaTabelaRecibo(recibo({ contract_title: '  ' })).objeto).toBeNull();
    });

    it('fatura recorrente: declaração diz parcela, competência, contrato e objeto, e dá quitação', () => {
        const t = textoRecibo(reciboDeContrato());
        expect(t).toContain('referente à parcela 1 (agosto de 2021) do contrato CTS-010-036-0001 — objeto: Serviço de Faxina, dando plena quitação deste valor.');
        expect(t).not.toContain('Fatura Contrato');
        expect(t).toMatch(/^Recebi de Alpa/);
    });

    it('descricaoDoRecibo: só a fatura recorrente é reescrita; o resto sai como está', () => {
        expect(descricaoDoRecibo(reciboDeContrato())).toEqual({
            texto: 'Parcela 1 — agosto de 2021', parcela: '1', competencia: 'agosto de 2021', contrato: 'CTS-010-036-0001',
        });
        // sem contract_number congelado, vale o número escrito na fatura
        expect(descricaoDoRecibo({ description: 'Fatura Contrato 005 (12) - junho de 2026', contract_number: null }).contrato).toBe('005');
        expect(descricaoDoRecibo({ description: 'Contrato CL-2026-004 — parcela 8/60 (15/06/2021)', contract_number: 'CTL-010-0002' }))
            .toEqual({ texto: 'Contrato CL-2026-004 — parcela 8/60 (15/06/2021)', parcela: null, competencia: null, contrato: 'CTL-010-0002' });
    });

    it('objeto já contido na descrição não se repete; sem descrição, o objeto é a referência', () => {
        expect(textoRecibo(reciboDeContrato({ description: 'Parcela 1 — serviço de faxina' })))
            .toContain('referente a Parcela 1 — serviço de faxina, dando plena quitação deste valor.');
        expect(textoRecibo(reciboDeContrato({ description: null }))).toContain('referente a Serviço de Faxina, dando plena quitação deste valor.');
        expect(textoRecibo(recibo())).toContain('referente a Parcela 3/12 — Lote 7, dando plena quitação deste valor.');
    });

    it('linhasItensContrato: formata qtd. sem zeros, valores em BRL, números vindos como texto', () => {
        const { linhas, resto } = linhasItensContrato(
            [{ description: 'Faxina', unit: 'svç', quantity: '4.0000', unit_price: '150.00', total_price: '600.00' },
             { description: ' ', unit: null, quantity: 2.5, unit_price: null, total_price: 'x' }],
            8,
        );
        expect(resto).toBeNull();
        expect(linhas[0]).toMatchObject({ item: 'Faxina', unid: 'svç', qtd: '4' });
        expect(linhas[0].unitario).toMatch(/R\$\s?150,00/);
        expect(linhas[0].total).toMatch(/R\$\s?600,00/);
        expect(linhas[1]).toEqual({ item: '—', unid: '—', qtd: '2,5', unitario: '—', total: '—' });
    });

    it('linhasItensContrato: não cabendo, a última linha vira "+ N itens — ver contrato X"', () => {
        const muitos = Array.from({ length: 10 }, (_, i) => ({ ...ITENS_FAXINA[0], description: `Item ${i + 1}` }));
        const r = linhasItensContrato(muitos, 4, 'CTS-1');
        expect(r.linhas.map((l) => l.item)).toEqual(['Item 1', 'Item 2', 'Item 3']);
        expect(r.resto).toBe('+ 7 itens — ver contrato CTS-1');
        expect(linhasItensContrato(muitos.slice(0, 2), 1).resto).toBe('+ 2 itens');
        expect(linhasItensContrato(null, 5)).toEqual({ linhas: [], resto: null });
        expect(linhasItensContrato([], 5)).toEqual({ linhas: [], resto: null });
    });

    it('PDF traz a seção ITENS DO CONTRATO com o item e o objeto; continua 1 página', () => {
        const doc = montarReciboPdf(reciboDeContrato());
        const pdf = doc.output();
        expect(doc.getNumberOfPages()).toBe(1);
        expect(pdf).toContain('ITENS DO CONTRATO');
        expect(pdf).toContain('Faxina');
        expect(pdf).toContain('150,00');
        expect(pdf).toContain('Objeto: Servi');
        expect(pdf).toContain('Contrato: CTS-010-036-0001');
        expect(pdf).not.toContain('(null)');
        expect(pdf).not.toContain('(undefined)');
    });

    it('avisoValorDoContrato: só quando os itens somam diferente do recibo (contrato parcelado)', () => {
        expect(avisoValorDoContrato(ITENS_FAXINA, 600)).toBeNull();
        expect(avisoValorDoContrato(ITENS_FAXINA, 50)).toMatch(/^Valores do contrato inteiro \(R\$\s?600,00\)\. Este recibo corresponde a R\$\s?50,00\.$/);
        expect(avisoValorDoContrato([{ ...ITENS_FAXINA[0], total_price: null }], 50)).toBeNull();
        expect(avisoValorDoContrato([], 50)).toBeNull();
        expect(avisoValorDoContrato(null, 50)).toBeNull();
    });

    it('PDF de contrato parcelado traz o aviso; o de valor igual não', () => {
        expect(montarReciboPdf(reciboDeContrato({ amount: 50 })).output()).toContain('Valores do contrato inteiro');
        expect(montarReciboPdf(reciboDeContrato()).output()).not.toContain('Valores do contrato inteiro');
    });

    it('sem itens (contrato de venda/locação) não desenha a seção', () => {
        const pdf = montarReciboPdf(reciboDeContrato({ contract_items: null })).output();
        expect(pdf).not.toContain('ITENS DO CONTRATO');
        expect(pdf).toContain('Objeto: Servi');
        expect(montarReciboPdf(recibo()).output()).not.toContain('ITENS DO CONTRATO');
    });

    it('muitos itens e declaração longa: 1 página, com o resumo dos que não couberam', () => {
        const muitos = Array.from({ length: 60 }, (_, i) => ({ ...ITENS_FAXINA[0], description: `Item ${i + 1}` }));
        const longa = Array.from({ length: 90 }, (_, i) => `palavra${i}`).join(' ');
        for (const description of ['Fatura 1', longa]) {
            const doc = montarReciboPdf(reciboDeContrato({ contract_items: muitos, description }));
            expect(doc.getNumberOfPages()).toBe(1);
            expect(doc.output()).toMatch(/\+ \d+ itens \u2014 ver contrato CTS-010-036-0001|\+ \d+ itens .{1,12} ver contrato CTS-010-036-0001/);
        }
    });

    it('o mesmo recibo de contrato gera os mesmos bytes', () => {
        expect(montarReciboPdf(reciboDeContrato()).output()).toBe(montarReciboPdf(reciboDeContrato()).output());
    });
});

/**
 * y (em pt, a partir do PÉ da página) do texto que começa com `inicio` no stream do
 * jsPDF — ele grava "x y Td" na linha anterior a "(texto) Tj".
 */
function yDoTexto(pdf: string, inicio: string): number {
    const m = new RegExp(`([\\d.]+) ([\\d.]+) Td\\n\\(${inicio}[^)]*\\) Tj`).exec(pdf);
    if (!m) throw new Error(`texto "${inicio}" não encontrado no PDF`);
    return Number(m[2]);
}
