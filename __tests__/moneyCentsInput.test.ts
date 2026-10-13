import { describe, it, expect } from 'vitest';
import { digitosParaDecimal, decimalParaExibicao } from '../components/ui/MoneyCentsInput';

describe('MoneyCentsInput — digitação por centavos', () => {
    it('os dois últimos dígitos são os centavos', () => {
        expect(digitosParaDecimal('4210')).toBe('42.10');
        expect(digitosParaDecimal('5')).toBe('0.05');
        expect(digitosParaDecimal('123456')).toBe('1234.56');
    });
    it('ignora o que não é dígito e zeros à esquerda', () => {
        expect(digitosParaDecimal('R$ 1.234,56')).toBe('1234.56');
        expect(digitosParaDecimal('0007')).toBe('0.07');
    });
    it('sem dígito vira vazio (apagar tudo limpa o campo)', () => {
        expect(digitosParaDecimal('')).toBe('');
        expect(digitosParaDecimal('abc')).toBe('');
        expect(digitosParaDecimal('000')).toBe('');
    });
    it('apagar o último dígito tira um centavo de casa', () => {
        const exibido = decimalParaExibicao('42.10'); // "42,10"
        expect(digitosParaDecimal(exibido.slice(0, -1))).toBe('4.21');
    });
    it('exibição em pt-BR', () => {
        expect(decimalParaExibicao('42.10')).toBe('42,10');
        expect(decimalParaExibicao('1234.5')).toBe('1.234,50');
        expect(decimalParaExibicao('')).toBe('');
        expect(decimalParaExibicao('x')).toBe('');
        expect(decimalParaExibicao(1234.5)).toBe('1.234,50');
        expect(decimalParaExibicao(0)).toBe('');
        expect(decimalParaExibicao(null)).toBe('');
        expect(decimalParaExibicao(undefined)).toBe('');
    });
});
