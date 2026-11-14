import { describe, expect, it } from 'vitest';
import {
    RISK_MATRIZ_PADRAO, impactoConsolidado, nivelDaPontuacao, nivelDoRisco, pontuacao, valorEsperado,
} from '../utils/riskScoring';

describe('riskScoring — F1.3 do plano docs/planos/2026-11-13-modulo-riscos.md', () => {
    it('P×I nos 25 cruzamentos', () => {
        for (let p = 1; p <= 5; p++) for (let i = 1; i <= 5; i++) expect(pontuacao(p, i)).toBe(p * i);
    });

    it('recusa nota fora de 1–5 ou fracionária', () => {
        expect(() => pontuacao(0, 3)).toThrow(RangeError);
        expect(() => pontuacao(3, 6)).toThrow(RangeError);
        expect(() => pontuacao(2.5, 3)).toThrow(RangeError);
    });

    it('faixas padrão = matriz da especificação (seção 3.3)', () => {
        // Valores possíveis de P×I: 1–6, 8–10, 12, 15, 16, 20, 25.
        const esperado: Record<number, string> = {
            1: 'baixo', 2: 'baixo', 3: 'baixo', 4: 'baixo',
            5: 'medio', 6: 'medio', 8: 'medio', 9: 'medio', 10: 'medio',
            12: 'alto', 15: 'alto', 16: 'alto',
            20: 'critico', 25: 'critico',
        };
        for (const [p, n] of Object.entries(esperado)) expect(nivelDaPontuacao(Number(p))).toBe(n);
        // Exemplo da especificação: possível (3) × grave (4) = 12 → alto.
        expect(nivelDaPontuacao(pontuacao(3, 4))).toBe('alto');
    });

    it('faixas configuradas pela organização mudam a classificação', () => {
        expect(nivelDaPontuacao(10, { limite_medio: 4, limite_alto: 9, limite_critico: 16 })).toBe('alto');
        expect(nivelDaPontuacao(16, { limite_medio: 4, limite_alto: 9, limite_critico: 16 })).toBe('critico');
    });

    it('impacto multidimensional consolida pelo MÁXIMO, nunca pela média', () => {
        expect(impactoConsolidado({ financeira: 2, seguranca: 5, prazo: 1 })).toBe(5);
        expect(impactoConsolidado({ financeira: 3 })).toBe(3);
        expect(impactoConsolidado({})).toBeNull();
        expect(impactoConsolidado({ financeira: null, prazo: undefined })).toBeNull();
    });

    it('CA04: gatilho crítico escala independentemente da cor', () => {
        const baixo = { inerente_pontuacao: 2, residual_pontuacao: null, gatilho_critico: false };
        expect(nivelDoRisco(baixo)).toBe('baixo');
        expect(nivelDoRisco({ ...baixo, gatilho_critico: true })).toBe('critico');
        expect(nivelDoRisco({ inerente_pontuacao: null, residual_pontuacao: null, gatilho_critico: true })).toBe('critico');
    });

    it('nível vigente usa a residual quando existe; sem avaliação e sem gatilho = null', () => {
        expect(nivelDoRisco({ inerente_pontuacao: 20, residual_pontuacao: 6, gatilho_critico: false })).toBe('medio');
        expect(nivelDoRisco({ inerente_pontuacao: null, residual_pontuacao: null, gatilho_critico: false })).toBeNull();
    });

    it('CA13: R05.06 com 30% e R$ 200 mil retorna R$ 60 mil', () => {
        expect(valorEsperado(30, 200_000)).toBe(60_000);
        expect(valorEsperado(null, 200_000)).toBeNull();
        expect(valorEsperado(12.5, 10_001)).toBe(1250.13);
    });

    it('padrão exportado é o da especificação', () => {
        expect(RISK_MATRIZ_PADRAO).toEqual({ limite_medio: 5, limite_alto: 12, limite_critico: 20 });
    });
});
