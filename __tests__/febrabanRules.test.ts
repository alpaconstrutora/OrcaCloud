import { describe, it, expect } from 'vitest';
import {
    mod10,
    mod11,
    fatorVencimentoToDate,
    parseLinhaDigitavel,
    codigoBarrasToLinhaDigitavel,
    linhaDigitavelToCodigoBarras47,
    onlyDigits,
    nomeBanco,
    calcularConfidence,
} from '../utils/febrabanRules';
import { findLinhaDigitavelInText, buildExtractionFromLinhaDigitavel } from '../utils/boletoParser';

// ─── onlyDigits ──────────────────────────────────────────────────────────────

describe('onlyDigits', () => {
    it('remove pontos, espaços e hífens', () => {
        expect(onlyDigits('001.234-56 78')).toBe('0012345678');
    });
    it('lida com string vazia e undefined', () => {
        expect(onlyDigits('')).toBe('');
        expect(onlyDigits(null as any)).toBe('');
    });
});

// ─── mod10 ───────────────────────────────────────────────────────────────────

describe('mod10', () => {
    it('calcula DV correto para sequência conhecida', () => {
        // "1234567890" → pesos 2,1,2,1,... do final → soma com somatório de dígitos
        // Resultado esperado calculado manualmente: 3
        expect(mod10('1234567890')).toBe(3);
    });

    it('retorna 0 quando resto é 0', () => {
        expect(mod10('00000')).toBe(0);
    });
});

// ─── mod11 ───────────────────────────────────────────────────────────────────

describe('mod11', () => {
    it('retorna 1 quando dv calculado seria 0, 10 ou 11', () => {
        // Quando dv = 11 - 0 = 11, a regra do boleto bancário força para 1
        expect(mod11('0')).toBe(1);
    });
});

// ─── fatorVencimentoToDate ──────────────────────────────────────────────────

describe('fatorVencimentoToDate', () => {
    it('retorna undefined para fator 0', () => {
        expect(fatorVencimentoToDate(0)).toBeUndefined();
    });

    it('converte fator antigo (referência 2020) para data esperada', () => {
        // Em 2020 a regra antiga ainda valia: base 1997-10-07 + fator dias
        // 1997-10-07 + 8000 dias = 2019-09-02 (aritmética UTC pura)
        const ref = new Date('2020-01-01');
        expect(fatorVencimentoToDate(8000, ref)).toBe('2019-09-02');
    });

    it('com referência pós-2025 prefere base nova para fatores baixos', () => {
        // Fator 1000 na regra nova = 2025-02-22.
        // Com referência em 2026, a função deve preferir a candidata nova.
        const ref = new Date('2026-05-15');
        expect(fatorVencimentoToDate(1000, ref)).toBe('2025-02-22');
    });
});

// ─── round-trip código de barras ↔ linha digitável ──────────────────────────

describe('round-trip código de barras ↔ linha digitável (47)', () => {
    it('codigoBarrasToLinhaDigitavel produz LD de 47 dígitos', () => {
        // Constrói um código de barras sintético (sem DV geral correto, só formato)
        const codBarras = '34190000010000000100012345678901234567890123';
        expect(codBarras.length).toBe(44);
        const ld = codigoBarrasToLinhaDigitavel(codBarras);
        expect(ld.length).toBe(47);
    });

    it('linhaDigitavel → codigoBarras → linhaDigitavel é idempotente', () => {
        // Monta uma LD de 47 dígitos com DVs mod10 calculados a partir de um cod barras
        const codBarras = '34191887000000100001234567890123456789012345';
        const ld1 = codigoBarrasToLinhaDigitavel(codBarras);
        const cb2 = linhaDigitavelToCodigoBarras47(ld1);
        const ld2 = codigoBarrasToLinhaDigitavel(cb2);
        expect(ld2).toBe(ld1);
    });
});

// ─── parseLinhaDigitavel: casos negativos ────────────────────────────────────

describe('parseLinhaDigitavel — entradas inválidas', () => {
    it('rejeita comprimento errado', () => {
        const res = parseLinhaDigitavel('123');
        expect(res.valida).toBe(false);
        expect(res.erros.length).toBeGreaterThan(0);
    });

    it('aceita 44 dígitos e extrai banco', () => {
        // Mesmo com DV incorreto, deve extrair banco e tentar valor/vencimento
        const cb = '00190000090000010000123456789012345678901234';
        const res = parseLinhaDigitavel(cb);
        expect(res.tipo).toBe('bancario');
        expect(res.bancoCodigo).toBe('001');
    });

    it('marca como arrecadação quando começa com 8', () => {
        const res = parseLinhaDigitavel('8' + '0'.repeat(43));
        expect(res.tipo).toBe('arrecadacao');
    });
});

// ─── parseLinhaDigitavel: round-trip self-consistent ─────────────────────────

describe('parseLinhaDigitavel — boleto sintético válido (round-trip)', () => {
    /**
     * Monta um código de barras com DV geral correto via mod11 da própria
     * implementação. Depois converte para LD de 47 e valida que os DVs de
     * campo (mod10) também batem. Isso prova consistência entre as 3 funções:
     * mod11, codigoBarrasToLinhaDigitavel e parseLinhaDigitavel.
     */
    it('LD gerada a partir de cod barras válido é parseada como válida', () => {
        const banco = '341';
        const moeda = '9';
        const fator = '8838'; // arbitrário
        const valor = '0000010000'; // R$ 100,00
        const campoLivre = '1234567890123456789012345';
        const semDV = banco + moeda + fator + valor + campoLivre;
        expect(semDV.length).toBe(43);
        const dvGeral = mod11(semDV);
        const codBarras = banco + moeda + dvGeral + fator + valor + campoLivre;
        expect(codBarras.length).toBe(44);

        const ld = codigoBarrasToLinhaDigitavel(codBarras);
        expect(ld.length).toBe(47);

        const res = parseLinhaDigitavel(ld);
        expect(res.valida).toBe(true);
        expect(res.bancoCodigo).toBe('341');
        expect(res.valor).toBe(100);
        expect(res.erros).toHaveLength(0);
    });
});

// ─── findLinhaDigitavelInText ────────────────────────────────────────────────

describe('findLinhaDigitavelInText', () => {
    it('encontra LD em texto com espaços e pontos', () => {
        const banco = '341';
        const moeda = '9';
        const fator = '8838';
        const valor = '0000010000';
        const campoLivre = '1234567890123456789012345';
        const semDV = banco + moeda + fator + valor + campoLivre;
        const dvGeral = mod11(semDV);
        const cb = banco + moeda + dvGeral + fator + valor + campoLivre;
        const ld = codigoBarrasToLinhaDigitavel(cb);
        // Formata em 5 grupos como um PDF de boleto faria
        const formatted = `${ld.slice(0,5)}.${ld.slice(5,10)} ${ld.slice(10,15)}.${ld.slice(15,21)} ${ld.slice(21,26)}.${ld.slice(26,32)} ${ld.slice(32,33)} ${ld.slice(33,47)}`;
        const texto = `Beneficiário: ACME LTDA\nLinha digitável: ${formatted}\nValor: R$ 100,00`;
        const found = findLinhaDigitavelInText(texto);
        expect(found).toBe(ld);
    });

    it('retorna null quando não há linha digitável', () => {
        expect(findLinhaDigitavelInText('Nenhum boleto aqui')).toBeNull();
    });
});

// ─── nomeBanco ───────────────────────────────────────────────────────────────

describe('nomeBanco', () => {
    it('mapeia códigos conhecidos', () => {
        expect(nomeBanco('001')).toBe('Banco do Brasil');
        expect(nomeBanco('341')).toBe('Itaú');
        expect(nomeBanco('104')).toBe('Caixa Econômica Federal');
    });
    it('retorna fallback genérico para código desconhecido', () => {
        expect(nomeBanco('999')).toBe('Banco 999');
    });
});

// ─── calcularConfidence ──────────────────────────────────────────────────────

describe('calcularConfidence', () => {
    it('LD totalmente válida resulta em score alto', () => {
        const res = parseLinhaDigitavel(codigoBarrasToLinhaDigitavel(
            '341' + '9' + String(mod11('341' + '9' + '8838' + '0000010000' + '1234567890123456789012345'))
            + '8838' + '0000010000' + '1234567890123456789012345'
        ));
        expect(calcularConfidence(res)).toBeGreaterThanOrEqual(80);
    });
});

// ─── buildExtractionFromLinhaDigitavel ───────────────────────────────────────

describe('buildExtractionFromLinhaDigitavel', () => {
    it('produz ExtractionResult com banco e valor preenchidos', () => {
        const semDV = '341' + '9' + '8838' + '0000010000' + '1234567890123456789012345';
        const dv = mod11(semDV);
        const cb = '341' + '9' + dv + '8838' + '0000010000' + '1234567890123456789012345';
        const ld = codigoBarrasToLinhaDigitavel(cb);
        const ext = buildExtractionFromLinhaDigitavel(ld);
        expect(ext.campos.banco_codigo.valor).toBe('341');
        expect(ext.campos.banco_nome.valor).toBe('Itaú');
        expect(ext.campos.valor.valor).toBe(100);
        expect(ext.confidence_score).toBeGreaterThanOrEqual(80);
    });
});
