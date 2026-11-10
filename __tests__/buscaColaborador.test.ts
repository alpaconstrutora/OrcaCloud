import { describe, it, expect } from 'vitest';
import { casaBuscaColaborador } from '../utils/buscaColaborador';

const josmar = { name: 'Josmar Silva', role: 'Pedreiro', cpf: '123.456.789-09' };
const altair = { name: 'Altair', role: 'Engenheiro', cpf: null };

describe('casaBuscaColaborador', () => {
    it('busca vazia casa com todos', () => {
        expect(casaBuscaColaborador(josmar, '')).toBe(true);
        expect(casaBuscaColaborador(altair, '')).toBe(true);
    });

    // O bug: termo sem dígito virava '' do lado do CPF, e ''.includes('') é sempre true.
    it('nome sem dígito NÃO casa com quem tem outro nome', () => {
        expect(casaBuscaColaborador(josmar, 'Cristiano')).toBe(false);
        expect(casaBuscaColaborador(altair, 'Cristiano')).toBe(false);
    });

    it('casa por nome e por função, sem diferenciar maiúsculas', () => {
        expect(casaBuscaColaborador(josmar, 'josmar')).toBe(true);
        expect(casaBuscaColaborador(josmar, 'PEDREIRO')).toBe(true);
    });

    it('casa por CPF com ou sem máscara', () => {
        expect(casaBuscaColaborador(josmar, '456.789')).toBe(true);
        expect(casaBuscaColaborador(josmar, '456789')).toBe(true);
        expect(casaBuscaColaborador(josmar, '999')).toBe(false);
    });

    it('colaborador sem CPF não casa com busca numérica', () => {
        expect(casaBuscaColaborador(altair, '123')).toBe(false);
    });
});
