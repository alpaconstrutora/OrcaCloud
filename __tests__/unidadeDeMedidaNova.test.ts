import { describe, expect, it } from 'vitest';
import { catalogoDeUnidades, dicaDaUnidade, motivoNovaUnidadeInvalida, normalizarUnidade } from '../lib/unidadeDeMedida';

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
    { symbol: 'br', name: 'Barra' },
];

describe('catalogoDeUnidades', () => {
    const cat = catalogoDeUnidades(MESTRE);
    const nome = (c: string) => cat.find(u => u.codigo === c)?.nome;

    it('não repete a identidade', () => {
        const codigos = cat.map(u => u.codigo);
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

    it('mês, cm² e cm³ viram código (MES como no SINAPI); ML ambíguo fica de fora', () => {
        expect(nome('MES')).toBe('Mês');
        expect(nome('CM2')).toBe('Centímetro quadrado');
        expect(catalogoDeUnidades([{ symbol: 'cm³', name: 'Centímetro cúbico' }])[0].codigo).toBe('CM3');
        expect(catalogoDeUnidades([{ symbol: 'ml', name: 'Mililitro' }]).some(u => u.codigo === 'ML')).toBe(false);
    });

    it('lata não é litro', () => {
        expect(normalizarUnidade('lata')).toBe('LATA');
        expect(normalizarUnidade(normalizarUnidade('lata'))).toBe('LATA');
        expect(normalizarUnidade('LT')).toBe('L');
    });

    it('cadastro vazio (leitura falhou) cai na lista fixa', () => {
        expect(catalogoDeUnidades([]).map(u => u.codigo)).toContain('KG');
    });
});

// O cadastro real (Sistema › Configurações › Cadastros › Unidades, 22/11/2026), na ordem
// em que listUnits o devolve (category, symbol) — a mesma da aba.
const CADASTRO_REAL = [
    ['cm²', 'Centímetro quadrado'], ['ha', 'Hectare'], ['m²', 'Metro quadrado'],
    ['br', 'Barra'], ['cm', 'Centímetro'], ['km', 'Quilômetro'], ['m', 'Metro'], ['mm', 'Milímetro'],
    ['cj', 'Conjunto'], ['dz', 'Dúzia'], ['jg', 'Jogo'], ['par', 'Par'], ['un', 'Unidade'],
    ['cx', 'Caixa'], ['gl', 'Galão'], ['lt', 'Lata'], ['mlh', 'Milheiro'], ['pç', 'Peça'],
    ['pct', 'Pacote'], ['rl', 'Rolo'], ['sc', 'Saco'],
    ['kWh', 'Quilowatt-hora'], ['g', 'Grama'], ['kg', 'Quilograma'], ['t', 'Tonelada'],
    ['serv', 'Serviço'], ['vb', 'Verba'], ['dia', 'Dia'], ['h', 'Hora'], ['hd', 'Homem-dia'],
    ['hh', 'Homem-hora'], ['mês', 'Mês'], ['cm³', 'Centímetro cúbico'], ['L', 'Litro'], ['m³', 'Metro cúbico'],
].map(([symbol, name]) => ({ symbol, name }));

describe('lista = aba Unidades (22/11/2026)', () => {
    const cat = catalogoDeUnidades(CADASTRO_REAL);

    it('traz todas as linhas da aba, na mesma ordem (só a Lata "lt" colide com L = Litro)', () => {
        expect(cat.map(u => u.simbolo)).toEqual(CADASTRO_REAL.map(u => u.symbol).filter(s => s !== 'lt'));
        expect(cat.map(u => u.nome)).not.toContain('Lata');
    });

    it('nada da lista fixa entra na frente nem por fora do cadastro', () => {
        expect(cat[0]).toEqual({ codigo: 'CM2', simbolo: 'cm²', nome: 'Centímetro quadrado' });
        expect(cat).toHaveLength(34);
    });

    it('a dica mostra o símbolo do cadastro quando ele difere do código', () => {
        const m2 = cat.find(u => u.codigo === 'M2')!;
        expect(dicaDaUnidade(m2)).toBe('Metro quadrado (m²)');
        expect(dicaDaUnidade(cat.find(u => u.codigo === 'L')!)).toBe('Litro');
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
