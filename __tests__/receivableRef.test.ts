import { describe, it, expect } from 'vitest';
import {
    originIdFromRef, refBelongsTo, refPrefixOrFilter,
    measurementRef, measurementIdFromRef,
} from '../lib/receivableRef';

const C1 = 'dbb274e7-59e2-494a-bb5f-aba877c4330f';
const C2 = 'f9710b8e-2c73-4155-bafa-dcc91cd32576';
const MED = '6bacbb6d-27a4-4f1b-8496-a8056012a75d';

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

/**
 * Parcela gerada por MEDIÇÃO (09/09/2026). O formato existe para satisfazer
 * três coisas ao mesmo tempo — unicidade sob o índice, casamento pelo contrato
 * e idempotência —; cada uma tem um caso abaixo.
 */
describe('measurementRef · parcela gerada por medição', () => {
    it('leva o CONTRATO no prefixo — é o que faz as consultas existentes acharem', () => {
        expect(measurementRef(C1, MED, 1).startsWith(`${C1}:`)).toBe(true);
        expect(originIdFromRef(measurementRef(C1, MED, 7))).toBe(C1);
    });

    it('`split(":")[0]` continua dando o contrato (o Extrato depende disso)', () => {
        expect(measurementRef(C1, MED, 3).split(':')[0]).toBe(C1);
    });

    it('é ÚNICA por parcela — sem isso o UNIQUE de internal_transactions barra da 2ª em diante', () => {
        const refs = [1, 2, 3, 24].map(n => measurementRef(C1, MED, n));
        expect(new Set(refs).size).toBe(refs.length);
    });

    it('é determinística: reprocessar a mesma medição reencontra a linha, não duplica', () => {
        expect(measurementRef(C1, MED, 5)).toBe(measurementRef(C1, MED, 5));
    });

    it('duas medições do MESMO contrato não colidem', () => {
        const outra = 'aaaaaaaa-1111-2222-3333-444444444444';
        expect(measurementRef(C1, MED, 1)).not.toBe(measurementRef(C1, outra, 1));
    });

    it('measurementIdFromRef devolve a medição, e null para o que não é de medição', () => {
        expect(measurementIdFromRef(measurementRef(C1, MED, 2))).toBe(MED);
        expect(measurementIdFromRef(`${C1}:p2`)).toBeNull();
        expect(measurementIdFromRef(`${C1}-p2026-01-10`)).toBeNull();
        expect(measurementIdFromRef(null)).toBeNull();
    });

    it('a grafia `:p` de contrato também cede o id de origem (antes vinha inteira)', () => {
        expect(originIdFromRef(`${C1}:p12`)).toBe(C1);
        expect(refBelongsTo(`${C1}:p12`, C1)).toBe(true);
        expect(refBelongsTo(`${C2}:p12`, C1)).toBe(false);
    });
});
