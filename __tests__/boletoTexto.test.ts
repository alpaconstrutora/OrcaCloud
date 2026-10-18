/**
 * Leitura de boleto a partir de TEXTO (`utils/boletoTexto.ts`) — a mesma função
 * que o navegador (pdf.js) e a Edge Function da captura por e-mail (unpdf) usam.
 *
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md, item 1.2.
 */
import { describe, it, expect } from 'vitest';
import {
    extractFromPdfText,
    findBeneficiarioCnpj,
    findVencimentoNoTexto,
    ERRO_SEM_TEXTO,
    ERRO_SEM_LINHA,
    AVISO_LINHA_DO_CODIGO_DE_BARRAS,
} from '../utils/boletoTexto';
import * as parser from '../utils/boletoParser';
import { mod10, mod11, codigoBarrasToLinhaDigitavel } from '../utils/febrabanRules';

/** Linha digitável de 47 dígitos com DVs corretos, formatada como no PDF. */
function linhaValida(valorCentavos = '0000010000') {
    const semDV = '341' + '9' + '8838' + valorCentavos + '1234567890123456789012345';
    const cb = '341' + '9' + mod11(semDV) + '8838' + valorCentavos + '1234567890123456789012345';
    const ld = codigoBarrasToLinhaDigitavel(cb);
    const formatada = `${ld.slice(0, 5)}.${ld.slice(5, 10)} ${ld.slice(10, 15)}.${ld.slice(15, 21)} ${ld.slice(21, 26)}.${ld.slice(26, 32)} ${ld.slice(32, 33)} ${ld.slice(33, 47)}`;
    return { ld, formatada };
}

const CNPJ_PAGADOR = '00.000.000/0001-91';      // válido
const CNPJ_BENEFICIARIO = '11.222.333/0001-81'; // válido
const CNPJ_DV_ERRADO = '11.222.333/0001-82';

function textoDeBoleto(corpo: string) {
    // Garante o mínimo de texto útil (escaneado tem < 50 caracteres).
    return `Recibo do Pagador Local de pagamento: pagável em qualquer banco até o vencimento\n${corpo}`;
}

describe('extractFromPdfText — linha digitável', () => {
    it('acha a linha, o valor e o banco num texto de boleto', () => {
        const { ld, formatada } = linhaValida();
        const r = extractFromPdfText(textoDeBoleto(`Beneficiário: ACME LTDA\n${formatada}\nMulta: R$ 2,00`), 1);
        expect(r.erros).toHaveLength(0);
        expect(r.metodo).toBe('pdf_text');
        expect(r.campos.linha_digitavel.valor).toBe(ld);
        expect(r.campos.valor.valor).toBe(100);
        expect(r.campos.banco_codigo.valor).toBe('341');
        expect(r.campos.beneficiario_nome.valor).toBe('ACME LTDA');
        expect(r.campos.multa.valor).toBe(2);
        expect(r.raw.paginas).toBe(1);
    });

    it('acha a linha mesmo com um número vizinho grudado nela (bloco de 49+ dígitos)', () => {
        const { ld, formatada } = linhaValida();
        // pdf.js junta os pedaços com espaço: o "81" do CNPJ encosta na linha.
        const r = extractFromPdfText(textoDeBoleto(`CNPJ 11.222.333/0001-81 ${formatada} 2`), 1);
        expect(r.campos.linha_digitavel.valor).toBe(ld);
        expect(r.erros).toHaveLength(0);
    });

    it('bloco longo sem janela válida não inventa linha', () => {
        const r = extractFromPdfText(textoDeBoleto('1'.repeat(30) + ' ' + '2'.repeat(30)), 1);
        // fallback antigo: nenhum candidato com tamanho exato → erro de linha
        expect(r.erros).toEqual([ERRO_SEM_LINHA]);
    });

    it('PDF sem camada de texto (escaneado) devolve o erro próprio, sem exceção', () => {
        const r = extractFromPdfText('   ', 2);
        expect(r.erros).toEqual([ERRO_SEM_TEXTO]);
        expect(r.confidence_score).toBe(0);
        expect(r.campos.linha_digitavel.valor).toBeNull();
    });

    it('texto sem linha digitável devolve o erro próprio', () => {
        const r = extractFromPdfText(textoDeBoleto('Fatura de serviços sem código de barras nenhum aqui.'), 1);
        expect(r.erros).toEqual([ERRO_SEM_LINHA]);
    });
});

describe('findBeneficiarioCnpj — DV e posição', () => {
    it('prefere o CNPJ logo depois do rótulo Beneficiário, mesmo com o pagador antes', () => {
        const t = `Pagador: FULANO CNPJ ${CNPJ_PAGADOR}\nBeneficiário: ACME LTDA CNPJ ${CNPJ_BENEFICIARIO}`;
        expect(findBeneficiarioCnpj(t)).toEqual({ valor: CNPJ_BENEFICIARIO, confidence: 80 });
    });

    it('ignora CNPJ com DV errado e fica com o primeiro válido', () => {
        const t = `Documento ${CNPJ_DV_ERRADO} ... outro ${CNPJ_BENEFICIARIO}`;
        expect(findBeneficiarioCnpj(t)).toEqual({ valor: CNPJ_BENEFICIARIO, confidence: 60 });
    });

    it('só CNPJ com DV errado → devolve com confiança 30 (não sugere fornecedor sozinho)', () => {
        expect(findBeneficiarioCnpj(`CNPJ ${CNPJ_DV_ERRADO}`)).toEqual({ valor: CNPJ_DV_ERRADO, confidence: 30 });
    });

    it('nenhum CNPJ → null', () => {
        expect(findBeneficiarioCnpj('sem documento')).toBeNull();
    });

    it('extractFromPdfText grava o CNPJ escolhido no campo do beneficiário', () => {
        const { formatada } = linhaValida();
        const t = textoDeBoleto(`Pagador ${CNPJ_PAGADOR}\nCedente: ACME LTDA ${CNPJ_BENEFICIARIO}\n${formatada}`);
        expect(extractFromPdfText(t, 1).campos.beneficiario_cnpj.valor).toBe(CNPJ_BENEFICIARIO);
    });
});

/* Casos tirados do spike de 15/10/2026 (três PDFs reais lidos pelo unpdf no
   Deno). Os textos abaixo reproduzem a FORMA, com dados sintéticos. */
describe('texto como o unpdf entrega (spike com boletos reais)', () => {
    it('linha sem separadores com um dígito vizinho grudado (bloco de 48 inválido) → acha a de 47', () => {
        const { ld } = linhaValida('0000036233');
        const t = textoDeBoleto(`Pagamento via Pix 7${ld} Beneficiário ACME SERVICOS LTDA - CNPJ: 11222333000181 Vencimento 20/09/2026`);
        const r = extractFromPdfText(t, 1);
        expect(r.campos.linha_digitavel.valor).toBe(ld);
        expect(r.erros).toHaveLength(0);
    });

    it('CNPJ sem máscara depois de "CNPJ:" vira o CNPJ do beneficiário, formatado', () => {
        const t = 'Beneficiário ACME SERVICOS LTDA - CNPJ: 11222333000181 Vencimento 20/09/2026';
        expect(findBeneficiarioCnpj(t)).toEqual({ valor: '11.222.333/0001-81', confidence: 80 });
    });

    it('CNPJ sob "Pagador" perde para o do beneficiário, mesmo vindo depois', () => {
        const t = 'Beneficiário ACME LTDA CNPJ/CPF 11222333000181 ... Pagador ALPA CONSTRUTORA CNPJ/CPF: 00000000000191';
        expect(findBeneficiarioCnpj(t)?.valor).toBe('11.222.333/0001-81');
    });

    it('só o CNPJ do pagador no texto → confiança 30 (não sugere fornecedor)', () => {
        expect(findBeneficiarioCnpj('Pagador ALPA CONSTRUTORA CNPJ/CPF: 00000000000191')?.confidence).toBe(30);
    });

    it('14 dígitos soltos, sem rótulo CNPJ, não são CNPJ', () => {
        expect(findBeneficiarioCnpj('Nosso número 11222333000181')).toBeNull();
    });

    it('nome do beneficiário sai sem o "- CNPJ: … Venc" colado', () => {
        const { formatada } = linhaValida();
        const t = textoDeBoleto(`${formatada}\nBeneficiário ACME SERVICOS LTDA - CNPJ: 11222333000181 Vencimento 20/09/2026`);
        expect(extractFromPdfText(t, 1).campos.beneficiario_nome.valor).toBe('ACME SERVICOS LTDA');
    });
});

describe('boletoParser continua expondo as funções puras (call-sites antigos)', () => {
    it('re-exporta a mesma implementação', () => {
        expect(parser.extractFromPdfText).toBe(extractFromPdfText);
        expect(typeof parser.findLinhaDigitavelInText).toBe('function');
        expect(typeof parser.buildExtractionFromLinhaDigitavel).toBe('function');
        expect(typeof parser.extractFromPdfFile).toBe('function');
    });
});

/* Conta de concessionária (16/10/2026): a linha de arrecadação (começa com 8)
   não carrega data — o reaviso da Energisa (boleto nº 1423) entrou sem
   vencimento com "Venc. 02/10/2026" impresso. Dados SINTÉTICOS. */
describe('vencimento impresso no texto (conta de concessionária)', () => {
    /** Linha de arrecadação de 48 dígitos, segmentos com DV mod10 (3º dígito 6). */
    function linhaArrecadacao(valorCentavos = '00000016930') {
        const cb = '836' + '0' + valorCentavos + '0001' + '1234567890123456789012345'.slice(0, 25);
        expect(cb.length).toBe(44);
        return [0, 11, 22, 33].map(i => cb.slice(i, i + 11)).map(seg => seg + mod10(seg)).join('');
    }

    it('acha "Venc. dd/mm/aaaa", "Vencimento:" e "Data de vencimento"', () => {
        expect(findVencimentoNoTexto('Mês/Ano: 9/2026 - Venc. 02/10/2026 - Valor R$169,30')).toBe('2026-10-02');
        expect(findVencimentoNoTexto('Vencimento: 20/09/2026')).toBe('2026-09-20');
        expect(findVencimentoNoTexto('Data de vencimento 10/11/2026')).toBe('2026-11-10');
    });

    it('ignora data sem rótulo de vencimento e data impossível', () => {
        expect(findVencimentoNoTexto('Resolução ANEEL n° 1.000, de 07/12/2021')).toBeNull();
        expect(findVencimentoNoTexto('Vencimento 31/13/2026')).toBeNull();
    });

    it('linha de arrecadação válida + "Venc." no texto → vencimento preenchido', () => {
        const ld = linhaArrecadacao();
        const t = textoDeBoleto(`Sua fatura está em aberto. Mês/Ano: 9/2026 - Venc. 02/10/2026 - Valor R$169,30 ${ld.slice(0, 12)} ${ld.slice(12, 24)} ${ld.slice(24, 36)} ${ld.slice(36)}`);
        const r = extractFromPdfText(t, 1);
        expect(r.erros).toHaveLength(0);
        expect(r.campos.linha_digitavel.valor).toBe(ld);
        expect(r.campos.valor.valor).toBe(169.3);
        expect(r.campos.vencimento.valor).toBe('2026-10-02');
    });

    it('vencimento da LINHA (boleto bancário) não é trocado pelo do texto', () => {
        const { formatada } = linhaValida();
        const r = extractFromPdfText(textoDeBoleto(`${formatada}\nVencimento 01/01/2030`), 1);
        expect(r.campos.vencimento.valor).not.toBe('2030-01-01');
    });

    it('sem linha digitável, o vencimento impresso ainda entra', () => {
        const r = extractFromPdfText(textoDeBoleto('Fatura sem código de barras. Vencimento: 20/09/2026'), 1);
        expect(r.erros).toEqual([ERRO_SEM_LINHA]);
        expect(r.campos.vencimento.valor).toBe('2026-09-20');
    });
});

/* Busca por período de 16/10/2026 — achados nos PDFs reais da caixa. Dados SINTÉTICOS
   no mesmo formato. */
describe('texto que o Postgres recusa (Invoice/Receipt com caractere nulo)', () => {
    it('caractere nulo e surrogate solto não chegam ao resultado', () => {
        const t = textoDeBoleto('Invoice\u0000 number ABC\u0000 Amount due \uD83D fim. Vencimento: 20/09/2026');
        const r = extractFromPdfText(t, 1);
        // É o que o PostgREST manda ao banco: "\u0000" em JSON → 22P05
        // "unsupported Unicode escape sequence" (4 erros da busca de 16/10/2026).
        const json = JSON.stringify(r);
        expect(json).not.toContain('\\u0000');
        expect(json).not.toMatch(/\\ud8[0-9a-f]{2}/i);
        expect(r.campos.vencimento.valor).toBe('2026-09-20');
    });

    it('a prévia de 500 caracteres não corta um emoji ao meio', () => {
        const t = textoDeBoleto('x'.repeat(500 - 82) + '😀' + ' resto do texto');
        expect(t.slice(0, 500).endsWith('\uD83D')).toBe(true); // o corte cairia no meio do par
        const r = extractFromPdfText(t, 1);
        expect(JSON.stringify(r.raw)).not.toMatch(/\\ud83d/i);
    });
});

describe('fatura em débito automático (DANF3E da concessionária)', () => {
    // Chave de acesso da nota (44 dígitos) com o ano grudado na frente: 48
    // dígitos que NÃO fecham os DVs. Antes virava "linha" com valor de R$ 312 mi.
    const chave = '2026 3126 0707 2823 7700 8104 6600 2001 9116 5520 6264 5636';
    const t = textoDeBoleto(`DANF3E - DOCUMENTO AUXILIAR DA NOTA FISCAL DE ENERGIA ELÉTRICA ELETRÔNICA ${chave} `
        + 'Classif icação: MTC-CONVENCIONAL BAIXA TENSÃO TOTAL A PAGAR R$ 150,52 Nº FATURA 191165521/08/2026 '
        + 'VENCIMENTOMATRÍCULA 2307695-2026-7-1 FATURA A SER QUITADA ATRAVÉS DE DÉBITO AUTOMÁTICO');

    it('bloco numérico que não fecha os DVs não vira linha nem valor', () => {
        const r = extractFromPdfText(t, 2);
        expect(r.campos.linha_digitavel.valor).toBeNull();
        expect(r.campos.codigo_barras.valor).toBeNull();
        expect(r.campos.valor.valor).toBeNull();
        expect(r.erros).toEqual([ERRO_SEM_LINHA]);
    });

    it('vencimento com o rótulo DEPOIS da data ("21/08/2026 VENCIMENTO")', () => {
        expect(findVencimentoNoTexto(t)).toBe('2026-08-21');
        expect(extractFromPdfText(t, 2).campos.vencimento.valor).toBe('2026-08-21');
    });

    it('rótulo antes da data continua tendo preferência', () => {
        expect(findVencimentoNoTexto('Emissão 10/08/2026 Vencimento 21/08/2026')).toBe('2026-08-21');
        expect(findVencimentoNoTexto('Leitura 14/07/2026 próxima 12/08/2026')).toBeNull();
    });
});

describe('vencimento com o mês escrito (fatura de cartão)', () => {
    it('"27 JUL 2026" e "5 de agosto de 2026"', () => {
        expect(findVencimentoNoTexto('no valor de R$ 415,42 Data de vencimento: 27 JUL 2026 Período vigente')).toBe('2026-07-27');
        expect(findVencimentoNoTexto('Vencimento: 5 de agosto de 2026')).toBe('2026-08-05');
        expect(findVencimentoNoTexto('Vencimento: 31 FEV 2026')).toBeNull();
    });
});

describe('extractFromPdfText — linha lida do código de barras (18/10/2026)', () => {
    // Reaviso Energisa #1486: o texto não traz a linha; as barras, sim.
    const LINHA_DAS_BARRAS = '836500000002616500010007509643020266097030080192';
    const textoReaviso = 'Informamos que em nossos registros permanece(m) sem pagamento a(s) fatura(s) abaixo. ' +
        'Fatura: 5096430 - Mês/Ano: 09/2026 - Venc. 02/10/2026 - Valor R$61,65';

    it('texto sem linha + linha das barras → lê, marca ocr_local e avisa', () => {
        const r = extractFromPdfText(textoReaviso, 1, new Date('2026-10-18'), LINHA_DAS_BARRAS);
        expect(r.metodo).toBe('ocr_local');
        expect(r.erros).toEqual([]);
        expect(r.campos.linha_digitavel.valor).toBe(LINHA_DAS_BARRAS);
        expect(r.campos.valor.valor).toBe(61.65);
        expect(r.avisos).toContain(AVISO_LINHA_DO_CODIGO_DE_BARRAS);
    });

    it('sem a linha das barras, continua o erro de sempre', () => {
        const r = extractFromPdfText(textoReaviso, 1, new Date('2026-10-18'));
        expect(r.erros).toEqual([ERRO_SEM_LINHA]);
    });

    it('PDF sem texto (imagem) também aproveita a linha das barras', () => {
        const r = extractFromPdfText('', 1, new Date('2026-10-18'), LINHA_DAS_BARRAS);
        expect(r.erros).toEqual([]);
        expect(r.metodo).toBe('ocr_local');
    });
});
