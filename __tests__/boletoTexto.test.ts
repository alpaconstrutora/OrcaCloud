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
    ERRO_SEM_TEXTO,
    ERRO_SEM_LINHA,
} from '../utils/boletoTexto';
import * as parser from '../utils/boletoParser';
import { mod11, codigoBarrasToLinhaDigitavel } from '../utils/febrabanRules';

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
        expect(findBeneficiarioCnpj(t)).toEqual({ valor: CNPJ_BENEFICIARIO, confidence: 70 });
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

describe('boletoParser continua expondo as funções puras (call-sites antigos)', () => {
    it('re-exporta a mesma implementação', () => {
        expect(parser.extractFromPdfText).toBe(extractFromPdfText);
        expect(typeof parser.findLinhaDigitavelInText).toBe('function');
        expect(typeof parser.buildExtractionFromLinhaDigitavel).toBe('function');
        expect(typeof parser.extractFromPdfFile).toBe('function');
    });
});
