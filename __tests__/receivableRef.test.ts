import { describe, it, expect } from 'vitest';
import { originIdFromRef, refBelongsTo, refPrefixOrFilter } from '../lib/receivableRef';

const C1 = 'dbb274e7-59e2-494a-bb5f-aba877c4330f';
const C2 = 'f9710b8e-2c73-4155-bafa-dcc91cd32576';

describe('originIdFromRef', () => {
    it('extrai o contrato do reference_id composto (formato real do banco)', () => {
        expect(originIdFromRef(`${C1}-p2020-11-15`)).toBe(C1);
    });

    it('valor sem sufixo ja e o proprio id', () => {
        expect(originIdFromRef(C1)).toBe(C1);
    });

    it('nao quebra com null/undefined/vazio', () => {
        expect(originIdFromRef(null)).toBe('');
        expect(originIdFromRef(undefined)).toBe('');
        expect(originIdFromRef('')).toBe('');
    });

    it('corta no PRIMEIRO -p, mesmo com data que contenha outro', () => {
        expect(originIdFromRef(`${C1}-p2020-11-15`)).toBe(C1);
    });
});

describe('refBelongsTo', () => {
    it('reconhece parcela do contrato', () => {
        expect(refBelongsTo(`${C1}-p2026-01-10`, C1)).toBe(true);
    });

    it('nao confunde contratos diferentes', () => {
        expect(refBelongsTo(`${C2}-p2026-01-10`, C1)).toBe(false);
    });

    it('exige id INTEIRO, nao prefixo — o erro que startsWith cometeria', () => {
        expect(refBelongsTo(`${C1}9-p2026-01-10`, C1)).toBe(false);
    });
});

describe('refPrefixOrFilter', () => {
    it('monta o or do PostgREST com curinga * (nao %)', () => {
        expect(refPrefixOrFilter([C1])).toBe(`reference_id.like.${C1}*`);
    });

    it('junta varios com virgula', () => {
        expect(refPrefixOrFilter([C1, C2]))
            .toBe(`reference_id.like.${C1}*,reference_id.like.${C2}*`);
    });

    it('lista vazia devolve null — string vazia traria a tabela INTEIRA', () => {
        expect(refPrefixOrFilter([])).toBeNull();
    });

    it('descarta ids vazios em vez de gerar filtro que casa tudo', () => {
        expect(refPrefixOrFilter(['', C1])).toBe(`reference_id.like.${C1}*`);
        expect(refPrefixOrFilter(['', ''])).toBeNull();
    });
});
