import { describe, it, expect } from 'vitest';
import {
    acharPorNome, chaveBusca, chaveNome, deveOferecerCadastro, filtrarPorNome, normalizarNome, NOME_CATALOGO_MAX,
} from '../utils/catalogoNome';

describe('catalogoNome · normalização (o que o CHECK do banco exige)', () => {
    it('tira espaço sobrando e colapsa espaços internos', () => {
        expect(normalizarNome('  Schneider   Electric ')).toBe('Schneider Electric');
        expect(normalizarNome('\tWEG\n')).toBe('WEG');
    });

    it('null/undefined viram vazio', () => {
        expect(normalizarNome(null)).toBe('');
        expect(normalizarNome(undefined)).toBe('');
    });

    it('corta em 100 caracteres (largura de opura_assets.brand) sem deixar espaço no fim', () => {
        const longo = 'a'.repeat(99) + ' bcd';
        const n = normalizarNome(longo);
        expect(n.length).toBeLessThanOrEqual(NOME_CATALOGO_MAX);
        expect(n).toBe('a'.repeat(99));
    });

    it('chaveNome é a mesma do banco (lower do nome normalizado), e mantém acento', () => {
        expect(chaveNome('  DeWalt ')).toBe('dewalt');
        expect(chaveNome('Mitsubíshi')).toBe('mitsubíshi');
    });

    it('chaveBusca ignora maiúsculas e acento', () => {
        expect(chaveBusca('Mitsubíshi  Elétrica')).toBe('mitsubishi eletrica');
    });
});

describe('catalogoNome · quando oferecer "Cadastrar X"', () => {
    const marcas = [{ name: 'Mitsubishi' }, { name: 'DeWalt' }];

    it('não oferece se já existe igual — ignorando maiúsculas', () => {
        expect(deveOferecerCadastro(marcas, 'dewalt')).toBe(false);
    });

    it('não oferece se já existe igual — ignorando ACENTO (o UNIQUE do banco não pega)', () => {
        expect(deveOferecerCadastro(marcas, 'Mitsubíshi')).toBe(false);
        expect(acharPorNome(marcas, 'Mitsubíshi')?.name).toBe('Mitsubishi');
    });

    it('oferece para nome novo', () => {
        expect(deveOferecerCadastro(marcas, 'Makita')).toBe(true);
    });

    it('não oferece para texto vazio ou só espaços', () => {
        expect(deveOferecerCadastro(marcas, '   ')).toBe(false);
    });

    it('trecho parcial não conta como existente', () => {
        expect(deveOferecerCadastro(marcas, 'Mitsu')).toBe(true);
    });
});

describe('catalogoNome · filtrarPorNome', () => {
    const lista = Array.from({ length: 80 }, (_, i) => ({ name: `Modelo ${i}` }));

    it('sem busca devolve até o limite', () => {
        expect(filtrarPorNome(lista, '', i => i.name)).toHaveLength(50);
    });

    it('filtra por trecho sem acento', () => {
        const r = filtrarPorNome([{ name: 'Elétrica' }, { name: 'Hidráulica' }], 'eletr', i => i.name);
        expect(r.map(i => i.name)).toEqual(['Elétrica']);
    });
});
