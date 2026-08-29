/**
 * `lib/debtRef.ts` — a classe de bug que estes helpers existem para evitar é o
 * casamento vazio silencioso: `.eq()`/`.in()` com o UUID puro devolve `[]` sem
 * erro, e o relatório sai zerado sem ninguém notar (foi assim que a
 * inadimplência de Locações ficou em 0 por meses).
 */

import { describe, expect, it } from 'vitest';
import {
    DEBT_COMPONENTS,
    DEBT_SOURCE_SYSTEM,
    contractPrefix,
    debtContractIdFromRef,
    debtRefFor,
    debtRefPrefixOrFilter,
    installmentPrefix,
    isDebtRef,
    parseDebtRef,
    refBelongsToDebt,
} from '../lib/debtRef';

const ID = '3f9c1e2a-8b41-4c77-9e02-5a1d6b7c8e90';
const OUTRO = '7d2b4f60-1a93-4e58-8c11-2f6e9a0b3c44';

describe('debtRefFor · formato', () => {
    it('monta prefixo + contrato + sequência + componente', () => {
        expect(debtRefFor(ID, 7, 'JUROS')).toBe(`debt-${ID}-p007-JUROS`);
    });

    it('sequência com 3 dígitos ordena corretamente em ORDER BY textual', () => {
        const refs = [debtRefFor(ID, 7, 'AMORT'), debtRefFor(ID, 70, 'AMORT'), debtRefFor(ID, 120, 'AMORT')];
        expect([...refs].sort()).toEqual(refs);
    });

    it('não colide com o formato de contrato de obra/locação', () => {
        // `contractService` grava `{contractId}:pN` e `{contractId}-p{data}`.
        const nosso = debtRefFor(ID, 1, 'AMORT');
        expect(nosso.startsWith('debt-')).toBe(true);
        expect(isDebtRef(`${ID}:p1`)).toBe(false);
        expect(isDebtRef(`${ID}-p2026-09-10`)).toBe(false);
    });
});

describe('parseDebtRef · desmonta sem adivinhar', () => {
    it('devolve as três partes', () => {
        expect(parseDebtRef(debtRefFor(ID, 12, 'CORRECAO'))).toEqual({
            debtContractId: ID,
            seq: 12,
            component: 'CORRECAO',
        });
    });

    it('todos os componentes fazem a volta completa', () => {
        for (const c of DEBT_COMPONENTS) {
            expect(parseDebtRef(debtRefFor(ID, 3, c))?.component).toBe(c);
        }
    });

    it('devolve null para o que não é referência de dívida', () => {
        expect(parseDebtRef(null)).toBeNull();
        expect(parseDebtRef(undefined)).toBeNull();
        expect(parseDebtRef('')).toBeNull();
        expect(parseDebtRef(ID)).toBeNull();
        expect(parseDebtRef(`${ID}:p1`)).toBeNull();
        expect(parseDebtRef(`debt-${ID}-p7-JUROS`)).toBeNull();      // seq sem padding
        expect(parseDebtRef(`debt-${ID}-p007-INVENTADO`)).toBeNull(); // componente fora da lista
        expect(parseDebtRef(`debt-${ID}-p007`)).toBeNull();           // sem componente
    });
});

describe('refBelongsToDebt · id que é prefixo de outro NÃO casa', () => {
    it('casa o próprio contrato', () => {
        expect(refBelongsToDebt(debtRefFor(ID, 1, 'AMORT'), ID)).toBe(true);
    });

    it('não casa contrato diferente', () => {
        expect(refBelongsToDebt(debtRefFor(ID, 1, 'AMORT'), OUTRO)).toBe(false);
    });

    it('não casa um id que é PREFIXO do id da referência', () => {
        // Este é o caso que um `startsWith` solto erraria — a razão de a
        // comparação ser sobre o id extraído, não sobre a string crua.
        const parcial = ID.slice(0, 20);
        expect(refBelongsToDebt(debtRefFor(ID, 1, 'AMORT'), parcial)).toBe(false);
    });

    it('referência de outra origem não pertence a contrato nenhum', () => {
        expect(refBelongsToDebt(`${ID}-p2026-09-10`, ID)).toBe(false);
        expect(debtContractIdFromRef(`${ID}:p1`)).toBe('');
    });
});

describe('prefixos', () => {
    it('installmentPrefix é comum às N linhas da MESMA parcela', () => {
        const p = installmentPrefix(ID, 7);
        for (const c of DEBT_COMPONENTS) {
            expect(debtRefFor(ID, 7, c).startsWith(p)).toBe(true);
        }
    });

    it('installmentPrefix NÃO pega outra parcela', () => {
        const p = installmentPrefix(ID, 7);
        expect(debtRefFor(ID, 8, 'JUROS').startsWith(p)).toBe(false);
        // 7 vs 70: sem o padding de 3 dígitos, `p7-` casaria `p70-`.
        expect(debtRefFor(ID, 70, 'JUROS').startsWith(p)).toBe(false);
    });

    it('contractPrefix pega todas as parcelas do contrato e só dele', () => {
        const p = contractPrefix(ID);
        expect(debtRefFor(ID, 1, 'AMORT').startsWith(p)).toBe(true);
        expect(debtRefFor(ID, 999, 'MORA').startsWith(p)).toBe(true);
        expect(debtRefFor(OUTRO, 1, 'AMORT').startsWith(p)).toBe(false);
    });
});

describe('debtRefPrefixOrFilter · lista vazia devolve null, não string vazia', () => {
    it('null para lista vazia — string vazia no .or() traria a tabela INTEIRA', () => {
        expect(debtRefPrefixOrFilter([])).toBeNull();
        expect(debtRefPrefixOrFilter(['', ''])).toBeNull();
    });

    it('usa o curinga `*` do PostgREST, não `%`', () => {
        const f = debtRefPrefixOrFilter([contractPrefix(ID)])!;
        expect(f).toBe(`reference_id.like.debt-${ID}-*`);
        expect(f).not.toContain('%');
    });

    it('junta vários prefixos por vírgula', () => {
        const f = debtRefPrefixOrFilter([contractPrefix(ID), contractPrefix(OUTRO)])!;
        expect(f.split(',')).toHaveLength(2);
    });
});

describe('constantes', () => {
    it('source_system é o que ContasPagarParcelas rotula como "Financiamento"', () => {
        expect(DEBT_SOURCE_SYSTEM).toBe('DEBT_INSTALLMENT');
    });

    it('a lista de componentes bate com o CHECK de debt_component_accounts', () => {
        expect([...DEBT_COMPONENTS]).toEqual(['AMORT', 'JUROS', 'CORRECAO', 'IOF', 'SEGURO', 'TARIFA', 'MORA']);
    });
});
