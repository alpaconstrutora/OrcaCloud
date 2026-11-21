import { describe, expect, it } from 'vitest';
import { catalogoDeUnidades, motivoNovaUnidadeInvalida, normalizarUnidade } from '../lib/unidadeDeMedida';

// Unidade de medida nova (21/11/2026) — docs/planos/2026-11-21-unidade-de-medida-nova.md
const MESTRE = [
    { symbol: 'm', name: 'Metro' },
    { symbol: 'm²', name: 'Metro quadrado' },
    { symbol: 'L', name: 'Litro' },
    { symbol: 'lt', name: 'Lata' },
    { symbol: 'mês', name: 'Mês' },
    { symbol: 'cm²', name: 'Centímetro quadrado' },
    { symbol: 'mlh', name: 'Milheiro' },
    { symbol: 'tb', name: 'Tubo' },
];

describe('catalogoDeUnidades', () => {
    const cat = catalogoDeUnidades(MESTRE);
    const nome = (c: string) => cat.find(u => u.codigo === c)?.nome;

    it('junta a lista fixa com as cadastradas, sem repetir a identidade', () => {
        const codigos = cat.map(u => u.codigo);
        expect(codigos).toContain('KG');
        expect(codigos).toContain('TB');
        expect(new Set(codigos).size).toBe(codigos.length);
    });

    it('dá o nome do cadastro; o símbolo exato ganha do apelido (L = Litro, não Lata)', () => {
        expect(nome('M2')).toBe('Metro quadrado');
        expect(nome('L')).toBe('Litro');
        expect(nome('TB')).toBe('Tubo');
    });

    it('mlh é o milheiro MIL, não uma unidade MLH a mais', () => {
        expect(normalizarUnidade('mlh')).toBe('MIL');
        expect(nome('MIL')).toBe('Milheiro');
        expect(cat.some(u => u.codigo === 'MLH')).toBe(false);
    });

    it('deixa de fora o que não vira código (mês, cm²) e o ambíguo ML', () => {
        const codigos = cat.map(u => u.codigo);
        expect(codigos).not.toContain('ML');
        expect(codigos.some(c => c.includes('Ê') || c.includes('²'))).toBe(false);
        expect(catalogoDeUnidades([{ symbol: 'ml', name: 'Mililitro' }]).some(u => u.codigo === 'ML')).toBe(false);
    });
});

describe('motivoNovaUnidadeInvalida', () => {
    const existentes = catalogoDeUnidades(MESTRE).map(u => u.codigo);
    const ok = { simbolo: 'vg', nome: 'Viagem', categoria: 'outro' };

    it('aceita a unidade nova completa', () => {
        expect(motivoNovaUnidadeInvalida(ok, existentes)).toBeNull();
    });

    it('recusa o que já existe — inclusive por apelido (BARRA = BR)', () => {
        expect(motivoNovaUnidadeInvalida({ ...ok, simbolo: 'tb' }, existentes)).toMatch(/já existe/i);
        expect(motivoNovaUnidadeInvalida({ ...ok, simbolo: 'Barra' }, existentes)).toMatch(/BR/);
    });

    it('recusa símbolo vazio, com caractere fora de letra/número ou longo demais', () => {
        expect(motivoNovaUnidadeInvalida({ ...ok, simbolo: ' ' }, existentes)).toMatch(/símbolo/i);
        expect(motivoNovaUnidadeInvalida({ ...ok, simbolo: 'm/s' }, existentes)).toMatch(/letras e números/i);
        expect(motivoNovaUnidadeInvalida({ ...ok, simbolo: 'abcdefghijk' }, existentes)).toMatch(/10/);
    });

    it('recusa ML (metro linear ou mililitro)', () => {
        expect(motivoNovaUnidadeInvalida({ ...ok, simbolo: 'ml' }, [])).toMatch(/ambígu/i);
    });

    it('pede nome e grandeza', () => {
        expect(motivoNovaUnidadeInvalida({ ...ok, nome: '  ' }, existentes)).toMatch(/nome/i);
        expect(motivoNovaUnidadeInvalida({ ...ok, categoria: '' }, existentes)).toMatch(/grandeza/i);
    });
});
